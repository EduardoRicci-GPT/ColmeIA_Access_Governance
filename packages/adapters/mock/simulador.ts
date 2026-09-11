// ---------------------------------------------------------------------------
// SIMULADOR v2 — o mundo físico de mentira que precisa mentir direito
//
// O simulador mantém o que o sistema NÃO PODE VER: o conteúdo real de cada
// equipamento. Essa separação é o ponto inteiro do exercício. A ColmeIA só
// conhece o equipamento por duas vias — eventos que chegam e reconciliação que
// pergunta — e o simulador tem liberdade de sabotar as duas: perder o evento,
// atrasar a confirmação, gravar 40 das 60 credenciais e responder sucesso.
//
// Quando o simulador engole um evento, a ColmeIA fica com um estado
// desatualizado que ela mesma precisa descobrir. É exatamente o que acontece
// com hardware real, e é a única forma de provar que o quarto motor funciona.
// ---------------------------------------------------------------------------

import { DeviceAccessState } from '../../dominio/estado';
import { CredentialMethod, DeviceHealth, StatusDeConectividade } from '../../dominio/topologia';
import { AccessEventDoProvedor, CredencialObservada, PhysicalStateSnapshot } from '../contrato/tipos';
import { CENARIO_SAUDAVEL, CenarioDeSimulacao } from './cenario';
import { GeradorDeterministico } from './prng';

interface CredencialNoEquipamento {
  referenciaExterna: string;
  credentialId?: string;
  metodo: CredentialMethod;
  personId?: string;
  expiraEm?: Date;
}

type TipoDePendencia = 'GRANT' | 'REVOKE' | 'SYNC';

interface OperacaoPendente {
  operationId: string;
  tipo: TipoDePendencia;
  endpointId: string;
  credentialId: string;
  referenciaDaCredencial: string;
  metodo: CredentialMethod;
  personId?: string;
  expiraEm?: Date;
  /** Instante a partir do qual o equipamento poderia executar. */
  executavelA: Date;
  tentativas: number;
}

export interface ResultadoDoProcessamento {
  executadas: readonly OperacaoPendente[];
  aindaPendentes: number;
  eventosEmitidos: number;
  eventosPerdidos: number;
}

export class SimuladorDeMundoFisico {
  private cenario: CenarioDeSimulacao;
  private readonly acaso: GeradorDeterministico;
  private readonly equipamentos = new Map<string, Map<string, CredencialNoEquipamento>>();
  private readonly ultimoEstadoPorCredencial = new Map<string, DeviceAccessState>();
  private readonly pendentes: OperacaoPendente[] = [];
  private readonly eventos: AccessEventDoProvedor[] = [];
  private readonly ultimaSincronizacao = new Map<string, Date>();
  private eventosPerdidos = 0;
  private sequenciaDeEvento = 0;

  constructor(cenario: Partial<CenarioDeSimulacao> = {}) {
    this.cenario = { ...CENARIO_SAUDAVEL, ...cenario };
    this.acaso = new GeradorDeterministico(this.cenario.semente);
    for (const drift of this.cenario.driftDeCredenciais) {
      this.equipamentoDe(drift.endpointId).set(drift.referenciaExterna, {
        referenciaExterna: drift.referenciaExterna,
        metodo: 'CARD'
      });
    }
  }

  cenarioAtual(): CenarioDeSimulacao {
    return this.cenario;
  }

  aplicar(ajustes: Partial<CenarioDeSimulacao>): void {
    this.cenario = { ...this.cenario, ...ajustes };
  }

  colocarEndpointOffline(endpointId: string): void {
    if (this.cenario.endpointsOffline.includes(endpointId)) return;
    this.cenario = {
      ...this.cenario,
      endpointsOffline: [...this.cenario.endpointsOffline, endpointId]
    };
  }

  restaurarEndpoint(endpointId: string): void {
    this.cenario = {
      ...this.cenario,
      endpointsOffline: this.cenario.endpointsOffline.filter((id) => id !== endpointId),
      endpointsDegradados: this.cenario.endpointsDegradados.filter((id) => id !== endpointId)
    };
  }

  colocarGatewayOffline(gatewayId: string): void {
    if (this.cenario.gatewaysOffline.includes(gatewayId)) return;
    this.cenario = { ...this.cenario, gatewaysOffline: [...this.cenario.gatewaysOffline, gatewayId] };
  }

  restaurarGateway(gatewayId: string): void {
    this.cenario = {
      ...this.cenario,
      gatewaysOffline: this.cenario.gatewaysOffline.filter((id) => id !== gatewayId)
    };
  }

  conectividadeDe(endpointId: string): StatusDeConectividade {
    if (this.cenario.endpointsOffline.includes(endpointId)) return 'OFFLINE';
    if (this.cenario.endpointsDegradados.includes(endpointId)) return 'DEGRADED';
    return 'ONLINE';
  }

  gatewayOnline(gatewayId: string | undefined): boolean {
    if (!gatewayId) return true;
    return !this.cenario.gatewaysOffline.includes(gatewayId);
  }

  provedorOnline(): boolean {
    return this.cenario.provedorOnline;
  }

  saudeDe(endpointId: string): DeviceHealth {
    const bateria = this.cenario.bateriaPercentual[endpointId];
    return {
      bateriaPercentual: bateria,
      bateriaCritica: bateria !== undefined && bateria <= 15,
      firmware: this.cenario.firmwareDegradado.includes(endpointId) ? 'DEGRADED' : 'CURRENT',
      desvioDeRelogioMs: this.cenario.desvioDeRelogioMs[endpointId]
    };
  }

  ultimaSincronizacaoDe(endpointId: string): Date | undefined {
    return this.ultimaSincronizacao.get(endpointId);
  }

  backlogDe(endpointId: string): number {
    return this.pendentes.filter((pendencia) => pendencia.endpointId === endpointId).length;
  }

  /**
   * Enfileira uma ordem. Note que o simulador NÃO recusa por endpoint offline:
   * a nuvem do fabricante aceita a ordem e promete entregar quando puder — que
   * é precisamente como os provedores reais se comportam, e a razão pela qual
   * "aceito pela nuvem" jamais equivale a "aplicado na porta".
   */
  enfileirar(operacao: Omit<OperacaoPendente, 'tentativas'>): void {
    this.pendentes.push({ ...operacao, tentativas: 0 });
  }

  /**
   * Avança o mundo físico até `agora`: executa o que era executável, emite (ou
   * perde) os eventos de confirmação correspondentes.
   */
  processar(agora: Date): ResultadoDoProcessamento {
    const executadas: OperacaoPendente[] = [];
    let emitidos = 0;
    let perdidos = 0;

    for (let i = this.pendentes.length - 1; i >= 0; i -= 1) {
      const pendencia = this.pendentes[i];
      if (!pendencia) continue;
      if (pendencia.executavelA.getTime() > agora.getTime()) continue;
      if (this.conectividadeDe(pendencia.endpointId) === 'OFFLINE') {
        pendencia.tentativas += 1;
        continue;
      }
      if (!this.cenario.provedorOnline) {
        pendencia.tentativas += 1;
        continue;
      }

      this.pendentes.splice(i, 1);
      this.aplicarNoEquipamento(pendencia, agora);
      executadas.push(pendencia);

      const perde = this.acaso.acontece(this.cenario.probabilidadeDePerdaDeEvento);
      if (perde) {
        perdidos += 1;
        this.eventosPerdidos += 1;
        continue;
      }
      this.emitirConfirmacao(pendencia, agora);
      emitidos += 1;
    }

    return {
      executadas,
      aindaPendentes: this.pendentes.length,
      eventosEmitidos: emitidos,
      eventosPerdidos: perdidos
    };
  }

  private aplicarNoEquipamento(pendencia: OperacaoPendente, agora: Date): void {
    const equipamento = this.equipamentoDe(pendencia.endpointId);
    if (pendencia.tipo === 'REVOKE') {
      equipamento.delete(pendencia.referenciaDaCredencial);
      this.ultimoEstadoPorCredencial.set(
        this.chave(pendencia.endpointId, pendencia.credentialId),
        'DEVICE_REVOCATION_CONFIRMED'
      );
    } else {
      equipamento.set(pendencia.referenciaDaCredencial, {
        referenciaExterna: pendencia.referenciaDaCredencial,
        credentialId: pendencia.credentialId,
        metodo: pendencia.metodo,
        personId: pendencia.personId,
        expiraEm: pendencia.expiraEm
      });
      this.ultimoEstadoPorCredencial.set(
        this.chave(pendencia.endpointId, pendencia.credentialId),
        'DEVICE_GRANT_CONFIRMED'
      );
    }
    this.ultimaSincronizacao.set(pendencia.endpointId, agora);
  }

  private emitirConfirmacao(pendencia: OperacaoPendente, agora: Date): void {
    this.sequenciaDeEvento += 1;
    this.eventos.push({
      eventoExternoId: `MOCK-EV-${String(this.sequenciaDeEvento).padStart(6, '0')}`,
      endpointId: pendencia.endpointId,
      ocorridoEm: agora,
      tipo: pendencia.tipo === 'REVOKE' ? 'REVOCATION_CONFIRMED' : 'SYNC_CONFIRMED',
      personReferencia: pendencia.personId,
      credencialReferencia: pendencia.referenciaDaCredencial,
      metodo: pendencia.metodo,
      decidiuLocalmente: false,
      dados: { operationId: pendencia.operationId, tentativas: pendencia.tentativas }
    });
  }

  /** Tentativa de acesso de uma pessoa na porta — alimenta o modo online. */
  registrarTentativaDeAcesso(dados: {
    endpointId: string;
    referenciaDaCredencial: string;
    metodo: CredentialMethod;
    personReferencia?: string;
    momento: Date;
    decidiuLocalmente: boolean;
  }): AccessEventDoProvedor {
    const presente = this.equipamentoDe(dados.endpointId).has(dados.referenciaDaCredencial);
    this.sequenciaDeEvento += 1;
    const evento: AccessEventDoProvedor = {
      eventoExternoId: `MOCK-EV-${String(this.sequenciaDeEvento).padStart(6, '0')}`,
      endpointId: dados.endpointId,
      ocorridoEm: dados.momento,
      tipo: presente ? 'ACCESS_GRANTED' : 'ACCESS_DENIED',
      personReferencia: dados.personReferencia,
      credencialReferencia: dados.referenciaDaCredencial,
      metodo: dados.metodo,
      decidiuLocalmente: dados.decidiuLocalmente
    };
    this.eventos.push(evento);
    return evento;
  }

  /** Injeta uma credencial que o registro desconhece — credential drift. */
  injetarDrift(endpointId: string, referenciaExterna: string, metodo: CredentialMethod = 'CARD'): void {
    this.equipamentoDe(endpointId).set(referenciaExterna, { referenciaExterna, metodo });
  }

  estadoFisico(endpointId: string, agora: Date): PhysicalStateSnapshot {
    const conectividade = this.conectividadeDe(endpointId);
    if (!this.cenario.suportaReconciliacaoFisica) {
      return {
        endpointId,
        capturadoEm: agora,
        credenciais: null,
        estado: 'DEVICE_SYNC_UNKNOWN',
        confiavel: false,
        observacao: 'Provedor não expõe leitura de estado físico.'
      };
    }
    if (conectividade === 'OFFLINE' || !this.cenario.provedorOnline) {
      return {
        endpointId,
        capturadoEm: agora,
        credenciais: null,
        estado: conectividade === 'OFFLINE' ? 'DEVICE_OFFLINE' : 'DEVICE_SYNC_UNKNOWN',
        confiavel: false,
        observacao:
          conectividade === 'OFFLINE'
            ? 'Equipamento sem comunicação: nenhuma leitura possível.'
            : 'Nuvem do provedor indisponível.'
      };
    }
    const credenciais: CredencialObservada[] = [...this.equipamentoDe(endpointId).values()].map(
      (credencial) => ({
        credentialId: credencial.credentialId,
        referenciaExterna: credencial.referenciaExterna,
        metodo: credencial.metodo,
        presente: true,
        expiraEm: credencial.expiraEm
      })
    );
    return {
      endpointId,
      capturadoEm: agora,
      credenciais,
      estado: credenciais.length > 0 ? 'DEVICE_GRANT_CONFIRMED' : 'DEVICE_REVOCATION_CONFIRMED',
      confiavel: conectividade === 'ONLINE',
      observacao: conectividade === 'DEGRADED' ? 'Equipamento degradado: leitura provável, não certa.' : undefined
    };
  }

  /**
   * Último estado que o equipamento efetivamente executou para a credencial.
   * `null` quando nunca executou nada — o caso que produz DEVICE_SYNC_UNKNOWN
   * e que a interface é obrigada a mostrar como incerteza.
   */
  ultimoEstadoExecutado(endpointId: string, credentialId: string): DeviceAccessState | null {
    return this.ultimoEstadoPorCredencial.get(this.chave(endpointId, credentialId)) ?? null;
  }

  /** Estado real de uma credencial específica — a verdade que a ColmeIA persegue. */
  estadoRealDaCredencial(endpointId: string, referenciaDaCredencial: string): DeviceAccessState {
    return this.equipamentoDe(endpointId).has(referenciaDaCredencial)
      ? 'DEVICE_GRANT_CONFIRMED'
      : 'DEVICE_REVOCATION_CONFIRMED';
  }

  eventosDesde(cursor?: string): { eventos: readonly AccessEventDoProvedor[]; proximoCursor?: string } {
    const inicio = cursor ? this.eventos.findIndex((e) => e.eventoExternoId === cursor) + 1 : 0;
    const fatia = this.eventos.slice(inicio);
    const ultimo = fatia[fatia.length - 1];
    return { eventos: fatia, proximoCursor: ultimo?.eventoExternoId };
  }

  totalDeEventosPerdidos(): number {
    return this.eventosPerdidos;
  }

  fracaoDeSincronizacao(): number {
    return this.cenario.fracaoDeSincronizacao;
  }

  private equipamentoDe(endpointId: string): Map<string, CredencialNoEquipamento> {
    const existente = this.equipamentos.get(endpointId);
    if (existente) return existente;
    const novo = new Map<string, CredencialNoEquipamento>();
    this.equipamentos.set(endpointId, novo);
    return novo;
  }

  private chave(endpointId: string, credentialId: string): string {
    return `${endpointId}::${credentialId}`;
  }
}
