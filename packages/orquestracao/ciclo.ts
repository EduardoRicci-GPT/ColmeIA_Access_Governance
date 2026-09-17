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
import { EventoDeDominio, TipoDeEvento } from '../dominio/eventos';
import { AutorDeRegistro, TrilhaDeAcesso } from '../auditoria/trilha';
import { VerdictoDeIntegridade } from '../mpeh-kernel/ledger/tipos';
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
  RepositorioDeEntitlements,
  RepositorioDeRegistrosDeAcesso,
  RepositorioDeSyncJobs
} from '../persistencia/repositorios';
import { MaterialDeRevisao } from '../governanca/aprovacao';
import { ResumoDoPlantao } from '../governanca/plantao';
import { JANELA_DE_RECORRENCIA_DIAS } from '../governanca/emergencia';
import {
  ConflitoDeSegregacao,
  DominioDeSegregacao,
  conflitosDoVinculo
} from '../policy-engine/segregacao';
import { chaveDeIdempotencia, correlacaoDeCredencial } from './idempotencia';
import {
  AvaliacaoDoFreioDeAcesso,
  avaliarLoteDeAcesso,
  montarCobertura,
  verificarFiltroZero
} from '../contratos-estruturais';

export interface DependenciasDoCiclo {
  relogio: Relogio;
  entitlementEngine: EntitlementReconciliationEngine;
  physicalEngine: PhysicalStateReconciliationEngine;
  assuranceEngine: ObservabilityAssuranceEngine;
  adaptador: AccessProviderAdapter;
  registros: RepositorioDeRegistrosDeAcesso;
  entitlements: RepositorioDeEntitlements;
  syncJobs: RepositorioDeSyncJobs;
  /** A auditoria é uma cadeia encadeada por hash, não uma lista. */
  trilha: TrilhaDeAcesso;
  retry?: PoliticaDeRetry;
  /**
   * Quem abre o pedido de aprovação humana.
   *
   * Existe porque faltava: a política marcava `REQUIRE_APPROVAL`, o motor
   * mantinha o direito em KEEP e ninguém abria o pedido que uma pessoa
   * decidiria. O gate só via pedido em teste — em produção a fila nasceria
   * vazia para sempre, e a exigência de revisão humana viraria uma negativa
   * silenciosa: acesso que nunca vem, sem ninguém a quem recorrer.
   *
   * A porta é estreita de propósito. O ciclo abre; quem decide é gente, por
   * outro caminho.
   */
  aberturaDeAprovacao?: AberturaDePedidoDeAprovacao;
  /**
   * Quem chama a pessoa que pode decidir.
   *
   * A fila na tela alcança quem abre a tela, e o vencimento de uma aprovação
   * crítica cai no meio do plantão seguinte, quando quem a concedeu foi
   * dormir. Esta porta é o que transforma a fila em chamado.
   */
  plantao?: PlantaoDeChamados;
  /**
   * Quem leva os atos da aprovação humana para a cadeia.
   *
   * O ADR-0016 criou o diário e o ligou ao ledger, e o ponto de drenagem ficou
   * "quem sabe quando é seguro gravar". Acontece que, fora dos testes, ninguém
   * sabia: o gate era montado sem diário e nada drenava — os três atos da
   * aprovação humana existiam como capacidade e não chegavam à cadeia em
   * nenhuma execução real. Aqui o ciclo assume o papel, porque é ele quem tem
   * um fim de volta bem definido.
   */
  diarioDeAprovacao?: DiarioDrenavel;
  /**
   * As matrizes de segregação desta instalação.
   *
   * Explícita, sem padrão embutido, e de propósito: o motor de política já
   * recebe as suas regras por construtor, e um padrão aqui criaria uma segunda
   * lista de domínios convivendo com a primeira. Duas verdades sobre o que é
   * incompatível seria pior do que nenhuma — quem monta o sistema passa a mesma
   * lista aos dois lugares.
   *
   * Quando ausente, o ciclo não calcula conflito NENHUM, e o relatório diz
   * isso em vez de devolver lista vazia: vazio e desligado se parecem na tela,
   * e só um deles é notícia boa.
   */
  dominiosDeSegregacao?: readonly DominioDeSegregacao[];
}

/** Conflito de segregação junto do vínculo em que ele mora. */
export interface ConflitoDeSegregacaoNoVinculo {
  relationshipId: string;
  personId: string;
  conflito: ConflitoDeSegregacao;
}

export interface AberturaDePedidoDeAprovacao {
  abrir(material: MaterialDeRevisao, solicitadoPor: string): Promise<unknown>;
}

export interface PlantaoDeChamados {
  despachar(): Promise<ResumoDoPlantao>;
}

export interface DiarioDrenavel {
  drenar(): Promise<number>;
}

/** Sem plantão ligado, o ciclo não chama ninguém — e o relatório diz isso. */
const PLANTAO_NAO_CONFIGURADO: ResumoDoPlantao = Object.freeze({
  avisos: Object.freeze([]) as ResumoDoPlantao['avisos'],
  emergencias: Object.freeze([]) as ResumoDoPlantao['emergencias'],
  entregues: 0,
  naoEntregues: 0,
  semAlcada: 0
});

/**
 * Evento acompanhado do corpo que o assina. O ledger recusa autor vazio, e
 * essa recusa é o que impede um registro órfão de entrar na cadeia com
 * aparência de fato apurado.
 */
interface EventoAssinado {
  evento: EventoDeDominio;
  autor: AutorDeRegistro;
}

export interface RelatorioDoCiclo {
  momento: Date;
  acoesLogicas: readonly AcaoDeEntitlement[];
  /** Acessos que a política marcou como REQUIRE_APPROVAL e ninguém aprovou. */
  pendentesDeAprovacao: readonly AcaoDeEntitlement[];
  /** Quem foi chamado neste ciclo — e quem não pôde ser. */
  plantao: ResumoDoPlantao;
  /**
   * Acúmulos de atividade incompatível, com porta ou sem porta.
   *
   * A política já barra o acúmulo na entrada da zona do domínio. Esta lista
   * responde outra pergunta, que nenhuma porta responde: quem acumula função
   * incompatível NESTA organização, exista ou não endpoint envolvido. Um
   * acúmulo que só aparece quando alguém tenta entrar é um acúmulo que a
   * coordenação descobre pela ordem errada.
   */
  conflitosDeSegregacao: readonly ConflitoDeSegregacaoNoVinculo[];
  /** A leitura de segregação está ligada neste ciclo? */
  segregacaoAvaliada: boolean;
  /** Atos da aprovação humana que entraram na cadeia neste ciclo. */
  atosDeAprovacaoRegistrados: number;
  /**
   * O freio da parceria sobre este lote.
   *
   * Responde à pergunta que o resto do sistema não faz: este ciclo deixaria
   * alguma zona de cuidado sem ninguém capaz de entrar?
   */
  freio: AvaliacaoDoFreioDeAcesso;
  ordensEnviadas: number;
  ordensRecusadasPorIdempotencia: number;
  eventosIngeridos: number;
  reconciliacoesFisicas: readonly PhysicalReconciliationResult[];
  latencias: readonly DiagnosticoDeLatencia[];
  assurance: RelatorioDeAssurance;
  eventosDoCiclo: readonly EventoDeDominio[];
  /** A cadeia de auditoria continua íntegra depois deste ciclo? */
  integridadeDaTrilha: VerdictoDeIntegridade;
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
    const eventosDoCiclo: EventoAssinado[] = [];

    // 1. Reconciliação lógica.
    const logica = this.deps.entitlementEngine.reconciliar(mundo);

    // 1.5. O FREIO, antes de materializar.
    //
    // Roda aqui, e não depois, porque o que ele transfere ao humano é uma
    // decisão sobre a ESCALA — e uma escala descoberta descoberta só depois de
    // a porta já ter sido fechada chega tarde para o plantão que começa.
    const freio = this.avaliarFreio(mundo, logica.acoes);
    if (freio.zonasDescobertas.length > 0) {
      this.registrarLacunaDeCobertura(mundo, freio, eventosDoCiclo);
    }

    // 1.75. O que a política mandou um humano decidir vira pedido de fato.
    //
    // Sem este passo o REQUIRE_APPROVAL ficava só no relatório do ciclo, e a
    // fila que uma pessoa abriria estava sempre vazia. `abrir` é idempotente
    // sobre material idêntico, então repetir a cada ciclo não apaga assinatura
    // já colhida.
    if (this.deps.aberturaDeAprovacao) {
      for (const pendente of logica.pendentesDeAprovacao) {
        await this.deps.aberturaDeAprovacao.abrir(pendente.material, 'ciclo-de-governanca');
      }
    }

    // 1.75b. O acúmulo é apurado por vínculo, independentemente de porta.
    const conflitosDeSegregacao = this.apurarSegregacao(mundo);

    // 1.8. E quem pode decidir é chamado.
    //
    // Depois de abrir, porque um pedido recém-aberto já é motivo de chamado;
    // e antes de materializar, porque o aviso mais valioso é o da aprovação
    // que ainda está VIGENTE e vai vencer — ele existe justamente para que a
    // porta não pare de abrir no meio do próximo plantão. O despacho é
    // idempotente dentro do intervalo de reforço, então rodar o ciclo a cada
    // minuto não transforma o canal em ruído.
    const plantao = this.deps.plantao
      ? await this.deps.plantao.despachar()
      : PLANTAO_NAO_CONFIGURADO;

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
      // A emergência chega ao score projetada, e a janela de recorrência viaja
      // junto: sem ela, a contagem de uma zona só cresce e o score dela nunca
      // volta a subir — o que ensinaria a equipe a ignorar o número em vez de
      // corrigir a causa.
      quebrasDeVidro: mundo.historicoDeEmergencias?.projetarParaAssurance(
        this.deps.relogio.agora()
      ),
      janelaDeRecorrenciaMs: JANELA_DE_RECORRENCIA_DIAS * 24 * 60 * 60_000,
      backlogDeEventos: 0
    });
    this.deps.assuranceEngine.encerrarCasosResolvidos(resumoFisico.resultados);

    // Selagem no ledger. Os eventos do assurance entram assinados por ele —
    // são leitura, não decisão —, e cada elo carrega o corpo de origem.
    const assinados: EventoAssinado[] = [
      ...eventosDoCiclo,
      ...assurance.eventos.map((evento) => ({ evento, autor: 'observability-assurance' as const }))
    ];
    for (const { evento, autor } of assinados) {
      await this.deps.trilha.registrar(evento, autor);
    }

    // O diário da aprovação humana é drenado AQUI, num ponto único por ciclo.
    //
    // A porta do gate é síncrona e o ledger é assíncrono (ADR-0016); o diário
    // acumula para que a cadeia não dependa de quem ganhou a corrida. Drenar
    // num ponto determinado é o que torna a cadeia reproduzível — e cada elo
    // carrega `ocorridoEm`, de modo que a ordem de inserção não apaga a ordem
    // dos fatos.
    const atosDeAprovacaoRegistrados = (await this.deps.diarioDeAprovacao?.drenar()) ?? 0;

    return {
      momento,
      acoesLogicas: logica.acoes,
      pendentesDeAprovacao: logica.pendentesDeAprovacao,
      plantao,
      conflitosDeSegregacao,
      segregacaoAvaliada: this.deps.dominiosDeSegregacao !== undefined,
      atosDeAprovacaoRegistrados,
      freio,
      ordensEnviadas: materializacao.enviadas,
      ordensRecusadasPorIdempotencia: materializacao.recusadas,
      eventosIngeridos: ingeridos,
      reconciliacoesFisicas: resumoFisico.resultados,
      latencias,
      assurance,
      eventosDoCiclo: assinados.map(({ evento }) => evento),
      integridadeDaTrilha: await this.deps.trilha.verificarIntegridade()
    };
  }

  /**
   * Percorre os vínculos vigentes e apura os conflitos de cada um.
   *
   * Vínculo encerrado fica fora: quem não tem vínculo não tem função a
   * segregar, e listá-lo encheria a tela de acúmulos de gente que já foi
   * embora — ruído que ensina a ignorar a seção inteira.
   */
  private apurarSegregacao(mundo: MundoLogico): readonly ConflitoDeSegregacaoNoVinculo[] {
    const dominios = this.deps.dominiosDeSegregacao;
    if (!dominios) return [];
    const papeisPorId = new Map(mundo.papeis.map((papel) => [papel.id, papel]));
    const achados: ConflitoDeSegregacaoNoVinculo[] = [];

    for (const vinculo of mundo.vinculos) {
      if (vinculo.situacao !== 'ACTIVE') continue;
      const papeis = vinculo.roleIds.filter((id) => papeisPorId.has(id));
      for (const conflito of conflitosDoVinculo(papeis, dominios)) {
        achados.push({ relationshipId: vinculo.id, personId: vinculo.personId, conflito });
      }
    }
    return achados;
  }

  // --- 2. Materialização ----------------------------------------------------

  private async materializar(
    mundo: MundoLogico,
    acoes: readonly AcaoDeEntitlement[],
    eventosDoCiclo: EventoAssinado[]
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
        eventosDoCiclo.push({
          autor: 'entitlement-reconciliation',
          evento: this.evento(
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
        });
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

      eventosDoCiclo.push({
        autor: 'adaptador',
        evento: this.evento(
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
      });
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
      decisaoId: acao.decisao.id,
      // Quem sustentou a concessão decide o que acontece quando o sustento
      // acabar. Um direito de emergência precisa cair quando a janela fecha.
      origemDaConcessao: acao.decisao.regrasAplicadas.includes('R-QUEBRA-DE-VIDRO')
        ? 'QUEBRA_DE_VIDRO'
        : 'POLITICA'
    });
  }

  private async ingerirEventos(mundo: MundoLogico, eventosDoCiclo: EventoAssinado[]): Promise<number> {
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

      eventosDoCiclo.push({
        autor: 'adaptador',
        evento: this.evento(tipo, mundo, {
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
      });
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
    eventosDoCiclo: EventoAssinado[]
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
        eventosDoCiclo.push({
          autor: 'physical-state-reconciliation',
          evento: this.evento('PhysicalSyncPending', mundo, {
            endpointId: resultado.endpointId,
            personId: resultado.personId,
            entitlementId: resultado.entitlementId,
            credentialId: resultado.credentialId,
            correlationId: correlacaoDeCredencial(resultado.credentialId, resultado.endpointId),
            idempotencyKey: `PEND::${resultado.credentialId}::${resultado.estadoSemantico}::${agora.toISOString()}`,
            resumo: resultado.reason
          })
        });
      }
    }
  }

  /**
   * Conta, por zona, quantas pessoas distintas têm acesso ativo antes e depois
   * deste lote — e pergunta ao freio se alguma zona de cuidado ficaria vazia.
   */
  private avaliarFreio(mundo: MundoLogico, acoes: readonly AcaoDeEntitlement[]): AvaliacaoDoFreioDeAcesso {
    const endpointsPorId = new Map(mundo.topologia.endpoints.map((e) => [e.id, e]));
    const nomesDeZona = new Map(mundo.topologia.nos.map((no) => [no.id, no.nome]));

    const antes = new Map<string, Set<string>>();
    for (const direito of mundo.entitlementsVigentes) {
      if (direito.revogadoEm) continue;
      const zona = endpointsPorId.get(direito.endpointId)?.zonaId;
      if (!zona) continue;
      const pessoas = antes.get(zona) ?? new Set<string>();
      pessoas.add(direito.personId);
      antes.set(zona, pessoas);
    }

    const depois = new Map<string, Set<string>>(
      [...antes].map(([zona, pessoas]) => [zona, new Set(pessoas)])
    );
    for (const acao of acoes) {
      const zona = endpointsPorId.get(acao.endpointId)?.zonaId;
      if (!zona) continue;
      const pessoas = depois.get(zona) ?? new Set<string>();
      if (acao.tipo === 'REVOKE') pessoas.delete(acao.personId);
      if (acao.tipo === 'GRANT') pessoas.add(acao.personId);
      depois.set(zona, pessoas);
    }

    const cobertura = [...new Set([...antes.keys(), ...depois.keys()])].map((zonaId) => {
      const criticidade =
        mundo.topologia.endpoints.find((e) => e.zonaId === zonaId)?.criticidade ?? 'MEDIUM';
      return montarCobertura({
        zonaId,
        nome: nomesDeZona.get(zonaId) ?? zonaId,
        criticidade,
        antes: antes.get(zonaId)?.size ?? 0,
        depois: depois.get(zonaId)?.size ?? 0
      });
    });

    // O Filtro Zero é respondido pelo mundo lógico. Ausente, o freio devolve
    // `nao_avaliada` e a lacuna fica registrada — nunca preenchida por suposição.
    const declarado = mundo.afetados ?? {
      pessoas: [...new Set(acoes.filter((a) => a.tipo !== 'KEEP').map((a) => a.personId))],
      zonas: [...new Set(acoes.map((a) => endpointsPorId.get(a.endpointId)?.zonaId ?? ''))].filter(Boolean),
      zonasDeCuidado: cobertura.filter((z) => z.ehZonaDeCuidado).map((z) => z.zonaId),
      necessidade:
        'entrar nas áreas que o vínculo autoriza, quando o vínculo autoriza — e não entrar quando não autoriza'
    };

    return avaliarLoteDeAcesso({ cobertura, filtroZero: verificarFiltroZero(declarado) });
  }

  private registrarLacunaDeCobertura(
    mundo: MundoLogico,
    freio: AvaliacaoDoFreioDeAcesso,
    eventosDoCiclo: EventoAssinado[]
  ): void {
    for (const zona of freio.zonasDescobertas) {
      const chave = `COBERTURA::${zona.zonaId}`;
      const caso = this.deps.assuranceEngine.abrirCasoExterno(chave, {
        type: 'COVERAGE_GAP',
        severity: zona.criticidade === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        reason:
          `${zona.nome} ficaria sem ninguém com acesso ativo (${zona.pessoasComAcessoAntes} → 0). ` +
          'A revogação segue; a decisão sobre a escala passa a quem responde por ela.',
        evidencias: [chave, freio.motivo]
      });
      if (!caso) continue;
      eventosDoCiclo.push({
        autor: 'entitlement-reconciliation',
        evento: this.evento('CoverageGapDetected', mundo, {
          decisionOrigin: 'COLMEIA_POLICY_ENGINE',
          idempotencyKey: `COBERTURA::${zona.zonaId}::${caso.id}`,
          resumo: caso.reason
        })
      });
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
