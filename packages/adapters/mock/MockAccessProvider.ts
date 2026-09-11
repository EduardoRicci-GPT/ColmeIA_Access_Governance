// ---------------------------------------------------------------------------
// MockAccessProvider — adaptador IMPLEMENTED sobre um mundo SIMULATED
//
// A distinção do item 45 aparece já no cabeçalho deste arquivo, e ela é sutil:
// o ADAPTADOR está implementado — o contrato v2 inteiro, com idempotência,
// paginação de eventos e reconciliação física. O MUNDO que ele governa é
// simulado. Confundir os dois é o que produz relatório de entrega inflado.
//
// O adaptador nunca inventa confirmação. Quando o cenário diz que o
// equipamento está offline, ele devolve ACCEPTED/NOT_CONFIRMED — aceito pela
// nuvem, não confirmado na porta — e é essa resposta, e não um `true`, que
// permite ao terceiro motor produzir DEVICE_REVOCATION_PENDING.
// ---------------------------------------------------------------------------

import { DeviceStatus, EndpointCapabilities, GatewayStatus, ProviderId } from '../../dominio/topologia';
import { AccessOperationTelemetry } from '../../dominio/telemetria';
import { AccessProviderAdapter } from '../contrato/adaptador';
import {
  GrantRequest,
  PaginaDeEventos,
  PhysicalStateSnapshot,
  ProviderCapabilities,
  ProviderOperationResult,
  RevokeRequest,
  StatusDeIntegracao,
  SyncRequest
} from '../contrato/tipos';
import { SimuladorDeMundoFisico } from './simulador';

export const CAPACIDADES_DO_MOCK: Readonly<ProviderCapabilities> = Object.freeze({
  cloudApi: true,
  mobileSdk: false,
  localBle: true,
  gatewaySupport: true,
  webhookEvents: true,
  pollingEvents: true,
  offlineCredentials: true,
  remoteRevocation: true,
  remoteUnlock: true,
  bulkSync: true,
  userManagement: true,
  credentialManagement: true,
  physicalStateReconciliation: true,
  onlineDecision: true
});

export interface OpcoesDoMock {
  gatewayPorEndpoint?: Readonly<Record<string, string>>;
  capacidades?: Partial<ProviderCapabilities>;
}

export class MockAccessProvider implements AccessProviderAdapter {
  readonly providerId: ProviderId = 'MOCK';
  readonly statusDeIntegracao: StatusDeIntegracao = 'IMPLEMENTED';
  readonly pendenciaDeIntegracao = '';

  private readonly operacoesPorChave = new Map<string, ProviderOperationResult>();
  private readonly telemetriaPorOperacao = new Map<string, AccessOperationTelemetry>();
  private sequencia = 0;

  constructor(
    private readonly simulador: SimuladorDeMundoFisico,
    private readonly opcoes: OpcoesDoMock = {}
  ) {}

  async getProviderCapabilities(): Promise<ProviderCapabilities> {
    return { ...CAPACIDADES_DO_MOCK, ...this.opcoes.capacidades };
  }

  async getEndpointCapabilities(endpointId: string): Promise<EndpointCapabilities> {
    return {
      endpointId,
      capacidades: [
        'REMOTE_UNLOCK',
        'REMOTE_REVOCATION',
        'OFFLINE_CREDENTIALS',
        'SCHEDULE_ENFORCEMENT',
        'EVENT_STREAM',
        'ONLINE_DECISION'
      ],
      metodosSuportados: ['CARD', 'PIN', 'QR', 'NFC', 'BLE', 'BIOMETRIC', 'MOBILE_WALLET'],
      maximoDeCredenciais: 2000
    };
  }

  async grantAccess(input: GrantRequest): Promise<ProviderOperationResult> {
    return this.executar('GRANT', input, {
      credentialId: input.credentialId,
      personId: input.personId,
      metodo: input.metodo,
      expiraEm: input.fim
    });
  }

  async revokeAccess(input: RevokeRequest): Promise<ProviderOperationResult> {
    return this.executar('REVOKE', input, {
      credentialId: input.credentialId,
      personId: input.personId,
      metodo: 'CARD'
    });
  }

  async syncCredential(input: SyncRequest): Promise<ProviderOperationResult> {
    const fracao = this.simulador.fracaoDeSincronizacao();
    const quantidade = Math.max(1, Math.floor(input.credentialIds.length * fracao));
    const aplicadas = input.credentialIds.slice(0, quantidade);
    const parcial = aplicadas.length < input.credentialIds.length;

    const resultado = await this.executar('SYNC', input, {
      credentialId: aplicadas[0] ?? input.credentialIds[0] ?? 'sem-credencial',
      metodo: 'CARD'
    });

    if (!parcial) return resultado;

    // Sincronização parcial que devolve sucesso é um dos modos de falha mais
    // traiçoeiros do mundo real: o painel fica verde e vinte credenciais nunca
    // chegaram. Aqui ela é declarada como PENDING, com a conta na mensagem.
    const honesto: ProviderOperationResult = {
      ...resultado,
      status: 'PENDING',
      physicalConfirmation: 'NOT_CONFIRMED',
      message: `Sincronização parcial: ${aplicadas.length} de ${input.credentialIds.length} credenciais aplicadas.`
    };
    this.operacoesPorChave.set(input.idempotencyKey, honesto);
    return honesto;
  }

  async getDeviceStatus(endpointId: string): Promise<DeviceStatus> {
    const gatewayId = this.opcoes.gatewayPorEndpoint?.[endpointId];
    const conectividade = this.simulador.provedorOnline()
      ? this.simulador.gatewayOnline(gatewayId)
        ? this.simulador.conectividadeDe(endpointId)
        : 'UNKNOWN'
      : 'UNKNOWN';
    return {
      endpointId,
      connectivity: conectividade,
      gatewayId,
      lastSyncAt: this.simulador.ultimaSincronizacaoDe(endpointId),
      health: this.simulador.saudeDe(endpointId),
      backlogDeSincronizacao: this.simulador.backlogDe(endpointId)
    };
  }

  async getGatewayStatus(gatewayId: string): Promise<GatewayStatus> {
    const online = this.simulador.gatewayOnline(gatewayId);
    const atendidos = Object.values(this.opcoes.gatewayPorEndpoint ?? {}).filter(
      (id) => id === gatewayId
    ).length;
    return {
      gatewayId,
      status: online ? 'ONLINE' : 'OFFLINE',
      endpointsAtendidos: atendidos
    };
  }

  async getAccessEvents(cursor?: string): Promise<PaginaDeEventos> {
    const pagina = this.simulador.eventosDesde(cursor);
    return { eventos: pagina.eventos, proximoCursor: pagina.proximoCursor };
  }

  async reconcilePhysicalState(endpointId: string): Promise<PhysicalStateSnapshot> {
    return this.simulador.estadoFisico(endpointId, this.agoraDaUltimaOperacao());
  }

  /** Telemetria da operação, para o cenário de latência (item 21). */
  telemetriaDe(operationId: string): AccessOperationTelemetry | undefined {
    return this.telemetriaPorOperacao.get(operationId);
  }

  private agoraDaUltimaOperacao(): Date {
    let ultima = new Date(0);
    for (const telemetria of this.telemetriaPorOperacao.values()) {
      const marca = telemetria.providerResponseAt ?? telemetria.requestReceivedAt;
      if (marca.getTime() > ultima.getTime()) ultima = marca;
    }
    return ultima;
  }

  private async executar(
    tipo: 'GRANT' | 'REVOKE' | 'SYNC',
    pedido: { idempotencyKey: string; correlationId: string; endpointId: string; referenciaExterna: string; solicitadoEm: Date },
    credencial: { credentialId: string; personId?: string; metodo: 'CARD' | 'PIN' | 'QR' | 'NFC' | 'BLE' | 'BIOMETRIC' | 'MOBILE_WALLET'; expiraEm?: Date }
  ): Promise<ProviderOperationResult> {
    // Item 37: a mesma chave devolve a MESMA operação, sem reexecutar nada.
    const jaExiste = this.operacoesPorChave.get(pedido.idempotencyKey);
    if (jaExiste) return jaExiste;

    this.sequencia += 1;
    const operationId = `MOCK-OP-${String(this.sequencia).padStart(6, '0')}`;
    const cenario = this.simulador.cenarioAtual();
    const respostaDoProvedor = new Date(pedido.solicitadoEm.getTime() + cenario.latenciaDoProvedorMs);

    const gatewayId = this.opcoes.gatewayPorEndpoint?.[pedido.endpointId];
    const provedorDisponivel = this.simulador.provedorOnline();
    const gatewayDisponivel = this.simulador.gatewayOnline(gatewayId);
    const conectividade = this.simulador.conectividadeDe(pedido.endpointId);

    this.telemetriaPorOperacao.set(operationId, {
      operationId,
      correlationId: pedido.correlationId,
      endpointId: pedido.endpointId,
      providerId: this.providerId,
      requestReceivedAt: pedido.solicitadoEm,
      providerRequestAt: pedido.solicitadoEm,
      providerResponseAt: respostaDoProvedor
    });

    if (!provedorDisponivel) {
      const falha: ProviderOperationResult = {
        operationId,
        provider: this.providerId,
        status: 'FAILED',
        physicalConfirmation: 'NOT_CONFIRMED',
        message: 'Nuvem do provedor indisponível. A ordem não foi aceita.',
        requestedAt: pedido.solicitadoEm,
        completedAt: respostaDoProvedor
      };
      this.operacoesPorChave.set(pedido.idempotencyKey, falha);
      return falha;
    }

    this.simulador.enfileirar({
      operationId,
      tipo,
      endpointId: pedido.endpointId,
      credentialId: credencial.credentialId,
      referenciaDaCredencial: `${pedido.referenciaExterna}#${credencial.credentialId}`,
      metodo: credencial.metodo,
      personId: credencial.personId,
      expiraEm: credencial.expiraEm,
      executavelA: new Date(respostaDoProvedor.getTime() + cenario.latenciaDoEquipamentoMs)
    });

    const alcancavel = gatewayDisponivel && conectividade !== 'OFFLINE';
    const confirmaAgora =
      alcancavel && cenario.confirmaFisicamente && cenario.atrasoDeConfirmacaoMs === 0 && cenario.latenciaDoEquipamentoMs === 0;

    if (confirmaAgora) {
      this.simulador.processar(respostaDoProvedor);
      const resultado: ProviderOperationResult = {
        operationId,
        provider: this.providerId,
        status: 'CONFIRMED',
        physicalConfirmation: 'CONFIRMED',
        providerReference: `${pedido.referenciaExterna}#${credencial.credentialId}`,
        requestedAt: pedido.solicitadoEm,
        completedAt: respostaDoProvedor,
        estadoFisicoReportado: this.simulador.estadoRealDaCredencial(
          pedido.endpointId,
          `${pedido.referenciaExterna}#${credencial.credentialId}`
        )
      };
      this.operacoesPorChave.set(pedido.idempotencyKey, resultado);
      return resultado;
    }

    const resultado: ProviderOperationResult = {
      operationId,
      provider: this.providerId,
      status: alcancavel ? 'ACCEPTED' : 'PENDING',
      physicalConfirmation: cenario.confirmaFisicamente ? 'NOT_CONFIRMED' : 'NOT_SUPPORTED',
      providerReference: `${pedido.referenciaExterna}#${credencial.credentialId}`,
      message: alcancavel
        ? 'Ordem aceita pela nuvem; aguardando execução no equipamento.'
        : gatewayDisponivel
          ? 'Equipamento sem comunicação: ordem enfileirada até o retorno.'
          : 'Gateway sem comunicação: ordem enfileirada até o retorno.',
      requestedAt: pedido.solicitadoEm,
      completedAt: respostaDoProvedor
    };
    this.operacoesPorChave.set(pedido.idempotencyKey, resultado);
    return resultado;
  }
}
