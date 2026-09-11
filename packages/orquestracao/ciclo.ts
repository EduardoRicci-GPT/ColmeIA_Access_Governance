// ---------------------------------------------------------------------------
// CICLO DE GOVERNANÇA — os quatro motores em sequência (item 35)
//
// Um tick do ciclo é a unidade operacional do produto:
//
//   1. reconciliação lógica     — quais direitos deveriam existir
//   2. materialização           — ordens ao provedor, com idempotência e retry
//   3. ingestão de eventos      — o que o mundo físico teve a dizer
//   4. reconciliação física     — onde estado desejado e estado real divergem
//   5. assurance                — score, risco, escalonamento
//
// A ordem não é arbitrária. A ingestão vem ANTES da reconciliação física de
// propósito: reconciliar sobre evidência velha produziria divergência
// fantasma — o sistema mandaria revogar de novo algo que o equipamento já
// revogou, e o painel acusaria um risco que não existe mais. Um sistema que
// gera alarme falso é abandonado tão rápido quanto um que não gera alarme.
//
// O ciclo é reentrante: rodar duas vezes seguidas sem mudança no mundo produz
// o mesmo estado e nenhuma ordem nova. Essa propriedade é testada, porque é
// dela que depende a possibilidade de rodar o ciclo a cada minuto sem inundar
// os equipamentos de comandos repetidos.
// ---------------------------------------------------------------------------

import { AccessState } from '../dominio/estado';
import { ESTADO_DE_TENTATIVAS_INICIAL, PoliticaDeRetry, RETRY_PADRAO, proximaTentativa } from '../dominio/escalonamento';
import { ArmazemDeEventos, EventoDeDominio, TipoDeEvento } from '../dominio/eventos';
import { AccessOperationTelemetry, DiagnosticoDeLatencia, diagnosticarLatencia } from '../dominio/telemetria';
import { Relogio } from '../dominio/tempo';
import { StatusDeConectividade, Topologia } from '../dominio/topologia';
import { AccessProviderAdapter } from '../adapters/contrato/adaptador';
import { AcaoDeEntitlement, EntitlementReconciliationEngine, MundoLogico } from '../entitlement-reconciliation/motor';
import { PhysicalStateReconciliationEngine } from '../physical-state-reconciliation/motor';
import {
  EntradaDeReconciliacaoFisica,
  PhysicalReconciliationResult
} from '../physical-state-reconciliation/tipos';
import { ObservabilityAssuranceEngine, RelatorioDeAssurance } from '../observability-assurance/assurance';
import { RegistroDeAcesso, SyncJob } from '../persistencia/modelo';
import {
  IndiceDeAuditoria,
  RepositorioDeEntitlements,
  RepositorioDeRegistrosDeAcesso,
  RepositorioDeSyncJobs
} from '../persistencia/repositorios';
import { chaveDeIdempotencia, correlacaoDeCredencial } from './idempotencia';

export interface DependenciasDoCiclo {
  relogio: Relogio;
  entitlementEngine: EntitlementReconciliationEngine;
  physicalEngine: PhysicalStateReconciliationEngine;
  assuranceEngine: ObservabilityAssuranceEngine;
  adaptador: AccessProviderAdapter;
  registros: RepositorioDeRegistrosDeAcesso;
  entitlements: RepositorioDeEntitlements;
  syncJobs: RepositorioDeSyncJobs;
  eventos: ArmazemDeEventos;
  auditoria: IndiceDeAuditoria;
  retry?: PoliticaDeRetry;
}

export interface RelatorioDoCiclo {
  momento: Date;
  acoesLogicas: readonly AcaoDeEntitlement[];
  ordensEnviadas: number;
  ordensRecusadasPorIdempotencia: number;
  eventosIngeridos: number;
  reconciliacoesFisicas: readonly PhysicalReconciliationResult[];
  latencias: readonly DiagnosticoDeLatencia[];
  assurance: RelatorioDeAssurance;
  eventosDoCiclo: readonly EventoDeDominio[];
}

export class CicloDeGovernanca {
  private cursorDeEventos: string | undefined;
  private sequenciaDeEvento = 0;
  private sequenciaDeJob = 0;
  private readonly geracaoPorCredencial = new Map<string, number>();
  private readonly telemetrias: AccessOperationTelemetry[] = [];

  constructor(private readonly deps: DependenciasDoCiclo) {}

  async executar(mundo: MundoLogico): Promise<RelatorioDoCiclo> {
    const momento = this.deps.relogio.agora();
    const eventosDoCiclo: EventoDeDominio[] = [];

    // 1. Reconciliação lógica.
    const logica = this.deps.entitlementEngine.reconciliar(mundo);

    // 2. Materialização.
    const materializacao = await this.materializar(mundo, logica.acoes, eventosDoCiclo);

    // 3. Ingestão do que o mundo físico teve a dizer.
    const ingeridos = await this.ingerirEventos(mundo, eventosDoCiclo);

    // 4. Reconciliação física.
    const { entradas, conectividade } = await this.montarEntradasFisicas(mundo);
    const resumoFisico = this.deps.physicalEngine.reconciliarLote(entradas);
    this.registrarEstadosFisicos(resumoFisico.resultados, mundo, eventosDoCiclo);

    // 5. Assurance.
    const topologiaAtualizada = await this.atualizarTopologia(mundo.topologia);
    const latencias = this.telemetrias.map((telemetria) => diagnosticarLatencia(telemetria));
    const assurance = this.deps.assuranceEngine.avaliar({
      organizationId: mundo.organizationId,
      topologia: topologiaAtualizada,
      conectividade,
      reconciliacoes: resumoFisico.resultados,
      latencias,
      conflitosPorZona: this.conflitosPorZona(mundo, logica.acoes),
      backlogDeEventos: 0
    });
    this.deps.assuranceEngine.encerrarCasosResolvidos(resumoFisico.resultados);

    for (const evento of [...eventosDoCiclo, ...assurance.eventos]) {
      this.deps.eventos.registrar(evento);
      this.deps.auditoria.indexar(evento);
    }

    return {
      momento,
      acoesLogicas: logica.acoes,
      ordensEnviadas: materializacao.enviadas,
      ordensRecusadasPorIdempotencia: materializacao.recusadas,
      eventosIngeridos: ingeridos,
      reconciliacoesFisicas: resumoFisico.resultados,
      latencias,
      assurance,
      eventosDoCiclo: [...eventosDoCiclo, ...assurance.eventos]
    };
  }

  // --- 2. Materialização ----------------------------------------------------

  private async materializar(
    mundo: MundoLogico,
    acoes: readonly AcaoDeEntitlement[],
    eventosDoCiclo: EventoDeDominio[]
  ): Promise<{ enviadas: number; recusadas: number }> {
    let enviadas = 0;
    let recusadas = 0;
    const endpointsPorId = new Map(mundo.topologia.endpoints.map((e) => [e.id, e]));

    for (const acao of acoes) {
      if (acao.tipo === 'KEEP') continue;
      const endpoint = endpointsPorId.get(acao.endpointId);
      if (!endpoint) continue;

      const registro = this.registroPara(acao, mundo);
      const tipo = acao.tipo === 'REVOKE' ? 'REVOKE' : acao.tipo === 'UPDATE_WINDOW' ? 'SYNC' : 'GRANT';
      const desejado = acao.tipo === 'REVOKE' ? 'ENTITLEMENT_REVOKED' : 'ENTITLEMENT_ACTIVE';

      // Nada muda? Nada é enviado. É a propriedade que torna o ciclo seguro
      // para rodar a cada minuto.
      if (registro.estado.desiredState === desejado && acao.tipo !== 'UPDATE_WINDOW') {
        const jaConfirmado =
          (desejado === 'ENTITLEMENT_REVOKED' && registro.estado.lastConfirmedState === 'DEVICE_REVOCATION_CONFIRMED') ||
          (desejado === 'ENTITLEMENT_ACTIVE' && registro.estado.lastConfirmedState === 'DEVICE_GRANT_CONFIRMED');
        if (jaConfirmado) continue;
      }

      // O direito é persistido em toda ação materializável, e não apenas
      // quando o desejo muda: uma troca de escala (H8) mantém o direito ATIVO e
      // altera a janela. Sem gravar aqui, o motor lógico veria a escala antiga
      // no ciclo seguinte e reemitiria a mesma ordem para sempre.
      this.registrarDireito(acao, registro, desejado);

      const mudouDesejo = registro.estado.desiredState !== desejado;
      if (mudouDesejo) {
        this.geracaoPorCredencial.set(
          registro.credentialId,
          (this.geracaoPorCredencial.get(registro.credentialId) ?? 0) + 1
        );
        eventosDoCiclo.push(
          this.evento(
            acao.tipo === 'REVOKE' ? 'EntitlementRevoked' : 'EntitlementGranted',
            mundo,
            {
              endpointId: acao.endpointId,
              personId: acao.personId,
              entitlementId: registro.entitlementId,
              credentialId: registro.credentialId,
              correlationId: correlacaoDeCredencial(registro.credentialId, acao.endpointId),
              decisionOrigin: 'COLMEIA_POLICY_ENGINE',
              resumo:
                acao.tipo === 'REVOKE'
                  ? `Direito revogado (${acao.motivo ?? 'POLICY_DENIED'}). ${acao.explicacao}`
                  : `Direito concedido. ${acao.explicacao}`
            }
          )
        );
      }

      const geracao = this.geracaoPorCredencial.get(registro.credentialId) ?? 1;
      const chave = chaveDeIdempotencia({
        tipo,
        endpointId: acao.endpointId,
        credentialId: registro.credentialId,
        geracao
      });
      const correlationId = correlacaoDeCredencial(registro.credentialId, acao.endpointId);

      const jobExistente = this.deps.syncJobs.porChaveDeIdempotencia(chave);
      if (jobExistente && jobExistente.estado === 'SUCCEEDED') {
        recusadas += 1;
        continue;
      }
      if (jobExistente && jobExistente.tentativas.nextRetryAt) {
        if (jobExistente.tentativas.nextRetryAt.getTime() > this.deps.relogio.agora().getTime()) {
          recusadas += 1;
          continue;
        }
      }

      const job = jobExistente ?? this.criarJob(tipo, acao, registro, chave, correlationId);
      const resultado = await this.enviarOrdem(tipo, endpoint.referenciaExterna, acao, registro, chave, correlationId);
      enviadas += 1;

      const agora = this.deps.relogio.agora();
      this.deps.syncJobs.registrarTentativa({
        id: `${job.id}-A${job.tentativas.attempt + 1}`,
        syncJobId: job.id,
        numero: job.tentativas.attempt + 1,
        iniciadoEm: agora,
        concluidoEm: resultado.completedAt,
        resultado: resultado.status,
        mensagem: resultado.message,
        operationId: resultado.operationId
      });

      const telemetria: AccessOperationTelemetry = {
        operationId: resultado.operationId,
        correlationId,
        endpointId: acao.endpointId,
        providerId: this.deps.adaptador.providerId,
        requestReceivedAt: agora,
        policyDecisionAt: acao.decisao.decididoEm,
        providerRequestAt: resultado.requestedAt,
        providerResponseAt: resultado.completedAt
      };
      this.telemetrias.push(telemetria);

      const falhou = resultado.status === 'FAILED' || resultado.status === 'UNKNOWN';
      const tentativas = falhou
        ? proximaTentativa(job.tentativas, this.deps.retry ?? RETRY_PADRAO, agora, resultado.message)
        : job.tentativas;

      this.deps.syncJobs.atualizar({
        ...job,
        estado:
          resultado.status === 'CONFIRMED'
            ? 'SUCCEEDED'
            : falhou
              ? tentativas.status === 'ESCALATED'
                ? 'ESCALATED'
                : 'FAILED'
              : 'RUNNING',
        tentativas,
        atualizadoEm: agora
      });

      // O estado de nuvem e de provedor mudam AGORA. O estado do dispositivo,
      // não — e é essa assimetria que o produto inteiro existe para mostrar.
      this.deps.registros.salvar({
        ...registro,
        estado: {
          ...registro.estado,
          desiredState: desejado,
          cloudState: desejado === 'ENTITLEMENT_REVOKED' ? 'CLOUD_GRANT_REVOKED' : 'CLOUD_GRANT_CREATED',
          providerState: this.estadoDoProvedor(resultado.status, tipo),
          deviceState:
            resultado.physicalConfirmation === 'CONFIRMED'
              ? desejado === 'ENTITLEMENT_REVOKED'
                ? 'DEVICE_REVOCATION_CONFIRMED'
                : 'DEVICE_GRANT_CONFIRMED'
              : desejado === 'ENTITLEMENT_REVOKED'
                ? 'DEVICE_REVOCATION_PENDING'
                : 'DEVICE_GRANT_PENDING',
          lastConfirmedState:
            resultado.physicalConfirmation === 'CONFIRMED'
              ? desejado === 'ENTITLEMENT_REVOKED'
                ? 'DEVICE_REVOCATION_CONFIRMED'
                : 'DEVICE_GRANT_CONFIRMED'
              : registro.estado.lastConfirmedState,
          lastSyncAt: resultado.physicalConfirmation === 'CONFIRMED' ? agora : registro.estado.lastSyncAt
        },
        referenciaDaCredencial: resultado.providerReference ?? registro.referenciaDaCredencial,
        tentativas,
        divergenciaDetectadaEm:
          resultado.physicalConfirmation === 'CONFIRMED'
            ? undefined
            : (registro.divergenciaDetectadaEm ?? agora),
        atualizadoEm: agora
      });

      eventosDoCiclo.push(
        this.evento(
          tipo === 'REVOKE' ? 'PhysicalRevocationRequested' : 'PhysicalGrantRequested',
          mundo,
          {
            endpointId: acao.endpointId,
            personId: acao.personId,
            entitlementId: registro.entitlementId,
            credentialId: registro.credentialId,
            correlationId,
            idempotencyKey: `REQ::${chave}`,
            decisionOrigin: 'COLMEIA_POLICY_ENGINE',
            resumo:
              `Ordem ${tipo} enviada ao provedor ${resultado.provider}: ${resultado.status}/` +
              `${resultado.physicalConfirmation}. ${resultado.message ?? ''}`.trim()
          }
        )
      );
    }

    return { enviadas, recusadas };
  }

  private estadoDoProvedor(status: string, tipo: string): AccessState['providerState'] {
    if (status === 'FAILED') return 'PROVIDER_FAILED';
    if (status === 'UNKNOWN') return 'PROVIDER_UNKNOWN';
    if (status === 'PENDING') return 'PROVIDER_PENDING';
    return tipo === 'REVOKE' ? 'PROVIDER_REVOCATION_ACCEPTED' : 'PROVIDER_GRANT_ACCEPTED';
  }

  private async enviarOrdem(
    tipo: 'GRANT' | 'REVOKE' | 'SYNC',
    referenciaExterna: string,
    acao: AcaoDeEntitlement,
    registro: RegistroDeAcesso,
    chave: string,
    correlationId: string
  ) {
    const base = {
      idempotencyKey: chave,
      correlationId,
      endpointId: acao.endpointId,
      referenciaExterna,
      solicitadoEm: this.deps.relogio.agora()
    };
    if (tipo === 'REVOKE') {
      return this.deps.adaptador.revokeAccess({
        ...base,
        personId: acao.personId,
        credentialId: registro.credentialId,
        referenciaDaCredencial: registro.referenciaDaCredencial,
        motivo: acao.motivo ?? 'POLICY_DENIED'
      });
    }
    if (tipo === 'SYNC') {
      return this.deps.adaptador.syncCredential({
        ...base,
        credentialIds: [registro.credentialId],
        modo: 'INCREMENTAL'
      });
    }
    return this.deps.adaptador.grantAccess({
      ...base,
      personId: acao.personId,
      credentialId: registro.credentialId,
      metodo: registro.metodo,
      inicio: this.deps.relogio.agora(),
      janelaRecorrente: acao.escalaDesejada
    });
  }

  private criarJob(
    tipo: 'GRANT' | 'REVOKE' | 'SYNC',
    acao: AcaoDeEntitlement,
    registro: RegistroDeAcesso,
    chave: string,
    correlationId: string
  ): SyncJob {
    this.sequenciaDeJob += 1;
    const agora = this.deps.relogio.agora();
    const job: SyncJob = {
      id: `JOB-${String(this.sequenciaDeJob).padStart(6, '0')}`,
      tipo,
      endpointId: acao.endpointId,
      credentialId: registro.credentialId,
      entitlementId: registro.entitlementId,
      personId: acao.personId,
      idempotencyKey: chave,
      correlationId,
      estado: 'QUEUED',
      criadoEm: agora,
      atualizadoEm: agora,
      tentativas: { ...ESTADO_DE_TENTATIVAS_INICIAL }
    };
    this.deps.syncJobs.criar(job);
    return job;
  }

  /**
   * O identificador da credencial é derivado de (vínculo, endpoint) e NUNCA do
   * id do direito. Parece detalhe e não é: o direito é criado no primeiro
   * ciclo e revogado no terceiro, e uma chave que dependesse dele mudaria de
   * nome no meio da vida do registro — criando um segundo registro de estado
   * para a mesma porta e a mesma pessoa, com o primeiro preso em
   * DEVICE_GRANT_CONFIRMED para sempre. Seria uma porta aberta invisível,
   * produzida pelo próprio sistema de auditoria.
   */
  private registroPara(acao: AcaoDeEntitlement, mundo: MundoLogico): RegistroDeAcesso {
    const credentialId = `CRED-${acao.relationshipId}-${acao.endpointId}`;
    const existente = this.deps.registros.obter(credentialId);
    if (existente) return existente;
    const novo: RegistroDeAcesso = {
      credentialId,
      entitlementId: acao.entitlementId ?? `ENT-${acao.relationshipId}-${acao.endpointId}`,
      personId: acao.personId,
      endpointId: acao.endpointId,
      metodo: 'CARD',
      estado: {
        desiredState: 'ENTITLEMENT_ABSENT',
        cloudState: 'CLOUD_GRANT_ABSENT',
        providerState: 'PROVIDER_UNKNOWN',
        deviceState: 'DEVICE_SYNC_UNKNOWN',
        lastConfirmedState: null,
        lastSyncAt: null
      },
      tentativas: { ...ESTADO_DE_TENTATIVAS_INICIAL },
      atualizadoEm: this.deps.relogio.agora()
    };
    void mundo;
    this.deps.registros.salvar(novo);
    return novo;
  }

  // --- 3. Ingestão ----------------------------------------------------------

  /**
   * O direito nunca é apagado. Revogar preenche `revogadoEm` e o motivo, e o
   * registro permanece — porque a pergunta que a auditoria hospitalar faz seis
   * meses depois não é "quem tem acesso", é "quem tinha, até quando, e por
   * que deixou de ter".
   */
  private registrarDireito(
    acao: AcaoDeEntitlement,
    registro: RegistroDeAcesso,
    desejado: 'ENTITLEMENT_ACTIVE' | 'ENTITLEMENT_REVOKED'
  ): void {
    const agora = this.deps.relogio.agora();
    const existente = this.deps.entitlements.obter(registro.entitlementId);
    if (desejado === 'ENTITLEMENT_REVOKED') {
      if (!existente || existente.revogadoEm) return;
      this.deps.entitlements.salvar({
        ...existente,
        revogadoEm: agora,
        motivoDeRevogacao: acao.motivo ?? 'POLICY_DENIED'
      });
      return;
    }
    this.deps.entitlements.salvar({
      id: registro.entitlementId,
      personId: acao.personId,
      relationshipId: acao.relationshipId,
      endpointId: acao.endpointId,
      janela: { inicio: existente?.janela.inicio ?? agora },
      escala: acao.escalaDesejada,
      concedidoPor: 'ciclo-de-governanca',
      concedidoEm: existente?.concedidoEm ?? agora,
      decisaoId: acao.decisao.id
    });
  }

  private async ingerirEventos(mundo: MundoLogico, eventosDoCiclo: EventoDeDominio[]): Promise<number> {
    let pagina;
    try {
      pagina = await this.deps.adaptador.getAccessEvents(this.cursorDeEventos);
    } catch {
      // Adaptador sem integração recusa o canal. Não é falha do ciclo: é a
      // ausência de canal, e ela já está declarada no status do adaptador.
      return 0;
    }
    this.cursorDeEventos = pagina.proximoCursor ?? this.cursorDeEventos;

    let ingeridos = 0;
    for (const externo of pagina.eventos) {
      const registro = this.deps.registros
        .porEndpoint(externo.endpointId)
        .find((item) => item.referenciaDaCredencial === externo.credencialReferencia);

      const tipo: TipoDeEvento =
        externo.tipo === 'REVOCATION_CONFIRMED'
          ? 'PhysicalRevocationConfirmed'
          : externo.tipo === 'SYNC_CONFIRMED'
            ? 'PhysicalGrantConfirmed'
            : 'AccessAttempted';

      if (registro && (externo.tipo === 'REVOCATION_CONFIRMED' || externo.tipo === 'SYNC_CONFIRMED')) {
        const confirmado =
          externo.tipo === 'REVOCATION_CONFIRMED' ? 'DEVICE_REVOCATION_CONFIRMED' : 'DEVICE_GRANT_CONFIRMED';
        this.deps.registros.salvar({
          ...registro,
          estado: {
            ...registro.estado,
            deviceState: confirmado,
            lastConfirmedState: confirmado,
            lastSyncAt: externo.ocorridoEm
          },
          tentativas: { ...ESTADO_DE_TENTATIVAS_INICIAL },
          divergenciaDetectadaEm: undefined,
          atualizadoEm: externo.ocorridoEm
        });
      }

      eventosDoCiclo.push(
        this.evento(tipo, mundo, {
          endpointId: externo.endpointId,
          personId: registro?.personId,
          entitlementId: registro?.entitlementId,
          credentialId: registro?.credentialId,
          correlationId: registro
            ? correlacaoDeCredencial(registro.credentialId, externo.endpointId)
            : undefined,
          idempotencyKey: `EXT::${externo.eventoExternoId}`,
          ocorridoEm: externo.ocorridoEm,
          origemDeIngestao: 'SIMULATED_EVENT',
          decisionOrigin: externo.decidiuLocalmente ? 'DEVICE_LOCAL' : 'COLMEIA_POLICY_ENGINE',
          resumo: `Evento ${externo.tipo} do endpoint ${externo.endpointId}.`
        })
      );
      ingeridos += 1;
    }
    return ingeridos;
  }

  // --- 4. Reconciliação física ---------------------------------------------

  private async montarEntradasFisicas(mundo: MundoLogico): Promise<{
    entradas: readonly EntradaDeReconciliacaoFisica[];
    conectividade: ReadonlyMap<string, StatusDeConectividade>;
  }> {
    const conectividade = new Map<string, StatusDeConectividade>();
    const statusPorEndpoint = new Map<string, Awaited<ReturnType<AccessProviderAdapter['getDeviceStatus']>>>();

    for (const endpoint of mundo.topologia.endpoints) {
      try {
        const status = await this.deps.adaptador.getDeviceStatus(endpoint.id);
        statusPorEndpoint.set(endpoint.id, status);
        conectividade.set(endpoint.id, status.connectivity);
      } catch {
        conectividade.set(endpoint.id, 'UNKNOWN');
      }
    }

    const gatewayStatus = new Map(mundo.topologia.gateways.map((g) => [g.id, g.status]));
    const entradas: EntradaDeReconciliacaoFisica[] = [];
    const endpointsPorId = new Map(mundo.topologia.endpoints.map((e) => [e.id, e]));

    for (const registro of this.deps.registros.todos()) {
      const endpoint = endpointsPorId.get(registro.endpointId);
      if (!endpoint) continue;
      const status = statusPorEndpoint.get(endpoint.id);
      entradas.push({
        endpointId: endpoint.id,
        credentialId: registro.credentialId,
        entitlementId: registro.entitlementId,
        personId: registro.personId,
        criticidade: endpoint.criticidade,
        estado: registro.estado,
        conectividadeDoEndpoint: conectividade.get(endpoint.id) ?? 'UNKNOWN',
        statusDoGateway: endpoint.gatewayId ? gatewayStatus.get(endpoint.gatewayId) : undefined,
        statusDoProvedor:
          mundo.topologia.conexoes.find((c) => c.id === endpoint.providerConnectionId)?.status ?? 'UNKNOWN',
        saudeDoEquipamento: status?.health,
        tentativas: registro.tentativas,
        divergenciaDetectadaEm: registro.divergenciaDetectadaEm
      });
    }

    return { entradas, conectividade };
  }

  private registrarEstadosFisicos(
    resultados: readonly PhysicalReconciliationResult[],
    mundo: MundoLogico,
    eventosDoCiclo: EventoDeDominio[]
  ): void {
    const agora = this.deps.relogio.agora();
    for (const resultado of resultados) {
      if (!resultado.credentialId) continue;
      const registro = this.deps.registros.obter(resultado.credentialId);
      if (!registro) continue;
      this.deps.registros.salvar({
        ...registro,
        estado: { ...registro.estado, deviceState: resultado.estadoSemantico },
        divergenciaDetectadaEm:
          resultado.action === 'NONE' ? undefined : (registro.divergenciaDetectadaEm ?? agora),
        atualizadoEm: agora
      });

      if (resultado.estadoSemantico === 'DEVICE_REVOCATION_PENDING' || resultado.estadoSemantico === 'DEVICE_GRANT_PENDING') {
        eventosDoCiclo.push(
          this.evento('PhysicalSyncPending', mundo, {
            endpointId: resultado.endpointId,
            personId: resultado.personId,
            entitlementId: resultado.entitlementId,
            credentialId: resultado.credentialId,
            correlationId: correlacaoDeCredencial(resultado.credentialId, resultado.endpointId),
            idempotencyKey: `PEND::${resultado.credentialId}::${resultado.estadoSemantico}::${agora.toISOString()}`,
            resumo: resultado.reason
          })
        );
      }
    }
  }

  private conflitosPorZona(
    mundo: MundoLogico,
    acoes: readonly AcaoDeEntitlement[]
  ): ReadonlyMap<string, number> {
    const endpointsPorId = new Map(mundo.topologia.endpoints.map((e) => [e.id, e]));
    const porZona = new Map<string, number>();
    for (const acao of acoes) {
      if (acao.decisao.conflitos.length === 0) continue;
      const zona = endpointsPorId.get(acao.endpointId)?.zonaId;
      if (!zona) continue;
      porZona.set(zona, (porZona.get(zona) ?? 0) + acao.decisao.conflitos.length);
    }
    return porZona;
  }

  private async atualizarTopologia(topologia: Topologia): Promise<Topologia> {
    if (typeof this.deps.adaptador.getGatewayStatus !== 'function') return topologia;
    const gateways = [];
    for (const gateway of topologia.gateways) {
      try {
        const status = await this.deps.adaptador.getGatewayStatus(gateway.id);
        gateways.push({ ...gateway, status: status.status, lastSeenAt: status.lastSeenAt ?? gateway.lastSeenAt });
      } catch {
        gateways.push(gateway);
      }
    }
    return { ...topologia, gateways };
  }

  private evento(
    tipo: TipoDeEvento,
    mundo: MundoLogico,
    dados: {
      endpointId?: string;
      personId?: string;
      entitlementId?: string;
      credentialId?: string;
      correlationId?: string;
      idempotencyKey?: string;
      decisionOrigin?: EventoDeDominio['decisionOrigin'];
      origemDeIngestao?: EventoDeDominio['origemDeIngestao'];
      ocorridoEm?: Date;
      resumo: string;
    }
  ): EventoDeDominio {
    this.sequenciaDeEvento += 1;
    const agora = this.deps.relogio.agora();
    return {
      id: `EV-${String(this.sequenciaDeEvento).padStart(6, '0')}`,
      tipo,
      ocorridoEm: dados.ocorridoEm ?? agora,
      registradoEm: agora,
      origemDeIngestao: dados.origemDeIngestao ?? 'LOCAL_EVENT',
      decisionOrigin: dados.decisionOrigin,
      correlationId: dados.correlationId,
      idempotencyKey: dados.idempotencyKey,
      organizationId: mundo.organizationId,
      endpointId: dados.endpointId,
      personId: dados.personId,
      entitlementId: dados.entitlementId,
      credentialId: dados.credentialId,
      providerId: this.deps.adaptador.providerId,
      resumo: dados.resumo
    };
  }

  telemetriaAcumulada(): readonly AccessOperationTelemetry[] {
    return this.telemetrias;
  }
}
