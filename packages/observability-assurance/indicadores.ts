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
    pesoDeRevogacoesPendentes: pesoDeRevogacoes
  };
}
