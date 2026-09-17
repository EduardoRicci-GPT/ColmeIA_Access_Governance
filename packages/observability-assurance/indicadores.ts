// ---------------------------------------------------------------------------
// INDICADORES DE ASSURANCE — item 5
//
// Este módulo não substitui APM nem agregador de log. A diferença não é de
// tecnologia, é de objeto: um APM mede se o SERVIÇO está saudável; isto mede se
// a GOVERNANÇA DE ACESSO está saudável. Um sistema com 100% de uptime,
// latência de 40 ms e zero erro pode estar, ao mesmo tempo, com dezessete
// revogações que nunca chegaram a nenhuma porta — e nenhum painel de
// infraestrutura do mundo acusaria isso, porque nada falhou.
//
// O que falhou foi a materialização, e materialização não é métrica de
// servidor.
// ---------------------------------------------------------------------------

import { DiagnosticoDeLatencia } from '../dominio/telemetria';
import { QuebraDeVidroProjetada } from '../dominio/emergencia';
import { Endpoint, Gateway, ProviderConnection } from '../dominio/topologia';
import { PhysicalReconciliationResult } from '../physical-state-reconciliation/tipos';

export interface IndicadoresDeAssurance {
  escopoId: string;

  endpointsTotal: number;
  endpointsOnline: number;
  endpointsOffline: number;
  endpointsDegraded: number;

  gatewaysTotal: number;
  gatewaysOffline: number;
  gatewaysDegraded: number;

  provedoresTotal: number;
  provedoresIndisponiveis: number;

  pendingRevocations: number;
  pendingSynchronizations: number;
  unreconciledStates: number;

  highRiskConflicts: number;
  staleCredentials: number;
  anomalousLatencyCount: number;

  backlogDeSincronizacao: number;
  backlogDeEventos: number;
  bateriasCriticas: number;
  desviosDeRelogio: number;

  /** Revogações pendentes ponderadas pela criticidade do endpoint. */
  pesoDeRevogacoesPendentes: number;

  /**
   * Quebras de vidro cuja janela fechou e que ninguém revisou.
   *
   * Note o que NÃO está contado aqui: a quebra de vidro em si. Uma emergência
   * invocada e revisada no mesmo turno custa ZERO ao score, e isso é a decisão
   * de produto mais importante deste indicador. Penalizar a quebra criaria
   * pressão para não quebrar — e o que se faz quando não se pode quebrar o
   * vidro é escorar a porta, emprestar o crachá ou arrombar o armário de
   * verdade, sem registro nenhum. O que o score cobra é a CONTA que ficou.
   */
  revisoesDeEmergenciaPendentes: number;
  /** As mesmas, ponderadas pela criticidade do endpoint. */
  pesoDeRevisoesDeEmergencia: number;
  /**
   * Repetições de quebra de vidro além da primeira, por zona, na janela.
   *
   * Uma zona que precisa da própria exceção com frequência tem um modelo de
   * acesso que não serve para o trabalho que se faz ali — a escala não fecha,
   * ou a política pede duas assinaturas onde nunca há duas pessoas. O achado é
   * sobre o DESENHO da organização, não sobre quem invocou, e o rótulo do
   * componente é obrigado a dizer isso: o score não acusa ninguém.
   */
  repeticoesDeEmergencia: number;
  /** Zonas do escopo em que houve repetição. É o que a leitura aponta. */
  zonasComRepeticao: readonly string[];
}

export interface EntradaDeIndicadores {
  escopoId: string;
  endpoints: readonly Endpoint[];
  /** Conectividade observada por endpoint, no instante do cálculo. */
  conectividade: ReadonlyMap<string, 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'UNKNOWN'>;
  gateways: readonly Gateway[];
  conexoes: readonly ProviderConnection[];
  reconciliacoes: readonly PhysicalReconciliationResult[];
  latencias: readonly DiagnosticoDeLatencia[];
  conflitosDePolitica: number;
  /**
   * As quebras de vidro do escopo, já projetadas e já filtradas pela janela de
   * recorrência. O recorte de tempo fica com quem tem o relógio do ciclo —
   * aqui dentro não há `Date.now()`, e é por isso que este módulo é
   * reproduzível.
   */
  quebrasDeVidro?: readonly QuebraDeVidroProjetada[];
  backlogDeEventos?: number;
  backlogDeSincronizacaoPorEndpoint?: ReadonlyMap<string, number>;
  bateriasCriticas?: number;
}

/** Peso da revogação pendente conforme a criticidade do local (item 28/29). */
const MULTIPLICADOR_DE_CRITICIDADE: Readonly<Record<string, number>> = Object.freeze({
  LOW: 0.5,
  MEDIUM: 1,
  HIGH: 1.5,
  CRITICAL: 2
});

export function calcularIndicadores(entrada: EntradaDeIndicadores): IndicadoresDeAssurance {
  const criticidadePorEndpoint = new Map(entrada.endpoints.map((e) => [e.id, e.criticidade]));

  let online = 0;
  let offline = 0;
  let degraded = 0;
  for (const endpoint of entrada.endpoints) {
    switch (entrada.conectividade.get(endpoint.id) ?? 'UNKNOWN') {
      case 'ONLINE':
        online += 1;
        break;
      case 'OFFLINE':
        offline += 1;
        break;
      case 'DEGRADED':
        degraded += 1;
        break;
      default:
        // UNKNOWN conta como indisponível: não saber é, operacionalmente,
        // pior que saber que caiu — e não pode ser arredondado para "ok".
        offline += 1;
    }
  }

  let pesoDeRevogacoes = 0;
  let pendingRevocations = 0;
  let pendingSynchronizations = 0;
  let unreconciled = 0;
  let stale = 0;
  let desvios = 0;
  for (const resultado of entrada.reconciliacoes) {
    if (resultado.natureza === 'REVOGACAO_NAO_CONFIRMADA' || resultado.estadoSemantico === 'DEVICE_REVOCATION_PENDING') {
      pendingRevocations += 1;
      const criticidade = criticidadePorEndpoint.get(resultado.endpointId) ?? 'MEDIUM';
      pesoDeRevogacoes += MULTIPLICADOR_DE_CRITICIDADE[criticidade] ?? 1;
    }
    if (resultado.estadoSemantico === 'DEVICE_GRANT_PENDING') pendingSynchronizations += 1;
    if (resultado.confidence === 'UNKNOWN') unreconciled += 1;
    if (resultado.natureza === 'CREDENCIAL_OBSOLETA') stale += 1;
    if (resultado.natureza === 'DESVIO_DE_RELOGIO') desvios += 1;
  }

  // A emergência entra em duas leituras distintas, e separá-las é o ponto: uma
  // conta a dívida de prestação de contas, a outra conta a insistência com que
  // uma zona precisa da própria exceção. Somá-las num número só faria a segunda
  // desaparecer dentro da primeira assim que alguém revisasse.
  let revisoesPendentes = 0;
  let pesoDeRevisoes = 0;
  const quebrasPorZona = new Map<string, number>();
  for (const quebra of entrada.quebrasDeVidro ?? []) {
    // Em curso não é dívida: é atendimento acontecendo.
    if (quebra.encerrada && !quebra.revisada) {
      revisoesPendentes += 1;
      const criticidade = criticidadePorEndpoint.get(quebra.endpointId) ?? 'MEDIUM';
      pesoDeRevisoes += MULTIPLICADOR_DE_CRITICIDADE[criticidade] ?? 1;
    }
    quebrasPorZona.set(quebra.zonaId, (quebrasPorZona.get(quebra.zonaId) ?? 0) + 1);
  }
  let repeticoes = 0;
  const zonasComRepeticao: string[] = [];
  for (const [zona, quantas] of quebrasPorZona) {
    if (quantas <= 1) continue;
    repeticoes += quantas - 1;
    zonasComRepeticao.push(zona);
  }
  zonasComRepeticao.sort();

  let backlogDeSync = 0;
  for (const valor of entrada.backlogDeSincronizacaoPorEndpoint?.values() ?? []) backlogDeSync += valor;

  return {
    escopoId: entrada.escopoId,
    endpointsTotal: entrada.endpoints.length,
    endpointsOnline: online,
    endpointsOffline: offline,
    endpointsDegraded: degraded,
    gatewaysTotal: entrada.gateways.length,
    gatewaysOffline: entrada.gateways.filter((g) => g.status === 'OFFLINE' || g.status === 'UNKNOWN').length,
    gatewaysDegraded: entrada.gateways.filter((g) => g.status === 'DEGRADED').length,
    provedoresTotal: entrada.conexoes.length,
    provedoresIndisponiveis: entrada.conexoes.filter(
      (c) => c.status === 'OFFLINE' || c.status === 'UNKNOWN'
    ).length,
    pendingRevocations,
    pendingSynchronizations,
    unreconciledStates: unreconciled,
    highRiskConflicts: entrada.conflitosDePolitica,
    staleCredentials: stale,
    anomalousLatencyCount: entrada.latencias.filter(
      (l) => l.piorSaude === 'DEGRADED' || l.piorSaude === 'CRITICAL'
    ).length,
    backlogDeSincronizacao: backlogDeSync,
    backlogDeEventos: entrada.backlogDeEventos ?? 0,
    bateriasCriticas: entrada.bateriasCriticas ?? 0,
    desviosDeRelogio: desvios,
    pesoDeRevogacoesPendentes: pesoDeRevogacoes,
    revisoesDeEmergenciaPendentes: revisoesPendentes,
    pesoDeRevisoesDeEmergencia: pesoDeRevisoes,
    repeticoesDeEmergencia: repeticoes,
    zonasComRepeticao
  };
}
