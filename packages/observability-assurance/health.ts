// ---------------------------------------------------------------------------
// ACCESS GOVERNANCE HEALTH — item 7
//
// "Nunca produzir score sem explicar sua composição."
//
// A regra está implementada como impossibilidade, não como recomendação: não
// existe caminho neste módulo que atribua `score` diretamente. O score é
// SEMPRE derivado da soma das penalidades dos componentes. Para mover o número,
// é preciso criar um componente — e todo componente carrega rótulo, peso,
// contagem e evidências. Um número sem explicação não é um número desonesto:
// é um estado que o tipo não permite construir.
//
// Duas famílias de penalidade, e a distinção importa:
//
//   PROPORCIONAL — disponibilidade. Dois endpoints offline entre dez é uma
//   rede com problema; dois entre oitocentos é terça-feira.
//
//   ABSOLUTA — divergência. Uma revogação pendente é uma porta que abre para
//   quem não deveria entrar. Ela não fica menos grave porque o hospital é
//   grande. Diluir divergência pelo tamanho da rede seria exatamente o
//   artifício que faz um painel parecer verde enquanto o risco cresce.
// ---------------------------------------------------------------------------

import { NivelDeHierarquia } from '../dominio/topologia';
import { IndicadoresDeAssurance } from './indicadores';

export interface HealthComponent {
  id: string;
  rotulo: string;
  /** Pontos subtraídos de 100. Sempre >= 0. */
  penalidade: number;
  contagem: number;
  /** Frase pronta para a interface: "-5: 2 endpoints offline". */
  detalhe: string;
  /** Identificadores que sustentam o componente (endpoints, casos, eventos). */
  evidencias: readonly string[];
}

export interface AccessGovernanceHealth {
  organizationId: string;
  facilityId?: string;
  escopoId: string;
  nivel: NivelDeHierarquia;
  nome: string;

  score: number;

  endpointsOnline: number;
  endpointsOffline: number;
  endpointsDegraded: number;

  pendingRevocations: number;
  pendingSynchronizations: number;
  unreconciledStates: number;

  highRiskConflicts: number;
  staleCredentials: number;
  anomalousLatencyCount: number;

  calculatedAt: Date;
  components: readonly HealthComponent[];
}

/**
 * Pesos calibráveis. Ficam numa constante nomeada e exportada porque a
 * calibração é decisão institucional: um hospital que opera com 40% da frota em
 * modo offline por projeto não pode ser penalizado pela mesma curva de um que
 * opera tudo online.
 */
export interface PesosDeHealth {
  disponibilidadeEndpoints: number;
  degradacaoEndpoints: number;
  gatewayOffline: number;
  provedorIndisponivel: number;
  revogacaoPendente: number;
  sincronizacaoPendente: number;
  estadoNaoReconciliado: number;
  conflitoDePolitica: number;
  latenciaAnomala: number;
  credencialObsoleta: number;
  bateriaCritica: number;
  desvioDeRelogio: number;
}

export const PESOS_PADRAO: Readonly<PesosDeHealth> = Object.freeze({
  disponibilidadeEndpoints: 25,
  degradacaoEndpoints: 15,
  gatewayOffline: 4,
  provedorIndisponivel: 5,
  revogacaoPendente: 3,
  sincronizacaoPendente: 1,
  estadoNaoReconciliado: 2,
  conflitoDePolitica: 3,
  latenciaAnomala: 2,
  credencialObsoleta: 1,
  bateriaCritica: 1,
  desvioDeRelogio: 2
});

/** Teto por família, para que uma única categoria não zere o score sozinha. */
export const TETOS_PADRAO = Object.freeze({
  disponibilidade: 25,
  degradacao: 15,
  gateways: 20,
  provedores: 15,
  revogacoes: 30,
  sincronizacoes: 10,
  naoReconciliados: 20,
  conflitos: 15,
  latencia: 10,
  obsoletas: 10,
  baterias: 5,
  relogio: 10
});

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function componente(
  id: string,
  rotulo: string,
  penalidadeBruta: number,
  teto: number,
  contagem: number,
  evidencias: readonly string[] = []
): HealthComponent | null {
  if (contagem <= 0 || penalidadeBruta <= 0) return null;
  const penalidade = arredondar(Math.min(penalidadeBruta, teto));
  return {
    id,
    rotulo,
    penalidade,
    contagem,
    detalhe: `-${penalidade}: ${rotulo}`,
    evidencias
  };
}

export interface EscopoDeHealth {
  organizationId: string;
  facilityId?: string;
  escopoId: string;
  nivel: NivelDeHierarquia;
  nome: string;
  calculatedAt: Date;
}

export interface EvidenciasDeHealth {
  endpointsOffline?: readonly string[];
  endpointsDegraded?: readonly string[];
  revogacoesPendentes?: readonly string[];
  sincronizacoesPendentes?: readonly string[];
  naoReconciliados?: readonly string[];
  gatewaysOffline?: readonly string[];
  conflitos?: readonly string[];
}

export function calcularHealth(
  escopo: EscopoDeHealth,
  indicadores: IndicadoresDeAssurance,
  evidencias: EvidenciasDeHealth = {},
  pesos: PesosDeHealth = PESOS_PADRAO
): AccessGovernanceHealth {
  const total = Math.max(indicadores.endpointsTotal, 1);
  const componentes: HealthComponent[] = [];

  const adicionar = (candidato: HealthComponent | null) => {
    if (candidato) componentes.push(candidato);
  };

  adicionar(
    componente(
      'DISPONIBILIDADE',
      `${indicadores.endpointsOffline} endpoint(s) offline de ${indicadores.endpointsTotal}`,
      pesos.disponibilidadeEndpoints * (indicadores.endpointsOffline / total),
      TETOS_PADRAO.disponibilidade,
      indicadores.endpointsOffline,
      evidencias.endpointsOffline ?? []
    )
  );
  adicionar(
    componente(
      'DEGRADACAO',
      `${indicadores.endpointsDegraded} endpoint(s) degradado(s)`,
      pesos.degradacaoEndpoints * (indicadores.endpointsDegraded / total),
      TETOS_PADRAO.degradacao,
      indicadores.endpointsDegraded,
      evidencias.endpointsDegraded ?? []
    )
  );
  adicionar(
    componente(
      'GATEWAYS',
      `${indicadores.gatewaysOffline} gateway(s) sem comunicação`,
      pesos.gatewayOffline * indicadores.gatewaysOffline,
      TETOS_PADRAO.gateways,
      indicadores.gatewaysOffline,
      evidencias.gatewaysOffline ?? []
    )
  );
  adicionar(
    componente(
      'PROVEDORES',
      `${indicadores.provedoresIndisponiveis} provedor(es) indisponível(is)`,
      pesos.provedorIndisponivel * indicadores.provedoresIndisponiveis,
      TETOS_PADRAO.provedores,
      indicadores.provedoresIndisponiveis
    )
  );
  adicionar(
    componente(
      'REVOGACOES_PENDENTES',
      `${indicadores.pendingRevocations} revogação(ões) pendente(s) de confirmação física`,
      pesos.revogacaoPendente * indicadores.pesoDeRevogacoesPendentes,
      TETOS_PADRAO.revogacoes,
      indicadores.pendingRevocations,
      evidencias.revogacoesPendentes ?? []
    )
  );
  adicionar(
    componente(
      'SINCRONIZACOES_PENDENTES',
      `${indicadores.pendingSynchronizations} sincronização(ões) pendente(s)`,
      pesos.sincronizacaoPendente * indicadores.pendingSynchronizations,
      TETOS_PADRAO.sincronizacoes,
      indicadores.pendingSynchronizations,
      evidencias.sincronizacoesPendentes ?? []
    )
  );
  adicionar(
    componente(
      'NAO_RECONCILIADOS',
      `${indicadores.unreconciledStates} estado(s) sem evidência física`,
      pesos.estadoNaoReconciliado * indicadores.unreconciledStates,
      TETOS_PADRAO.naoReconciliados,
      indicadores.unreconciledStates,
      evidencias.naoReconciliados ?? []
    )
  );
  adicionar(
    componente(
      'CONFLITOS',
      `${indicadores.highRiskConflicts} conflito(s) de política`,
      pesos.conflitoDePolitica * indicadores.highRiskConflicts,
      TETOS_PADRAO.conflitos,
      indicadores.highRiskConflicts,
      evidencias.conflitos ?? []
    )
  );
  adicionar(
    componente(
      'LATENCIA',
      `${indicadores.anomalousLatencyCount} operação(ões) com latência anômala`,
      pesos.latenciaAnomala * indicadores.anomalousLatencyCount,
      TETOS_PADRAO.latencia,
      indicadores.anomalousLatencyCount
    )
  );
  adicionar(
    componente(
      'CREDENCIAIS_OBSOLETAS',
      `${indicadores.staleCredentials} credencial(is) sem confirmação recente`,
      pesos.credencialObsoleta * indicadores.staleCredentials,
      TETOS_PADRAO.obsoletas,
      indicadores.staleCredentials
    )
  );
  adicionar(
    componente(
      'BATERIA',
      `${indicadores.bateriasCriticas} equipamento(s) com bateria crítica`,
      pesos.bateriaCritica * indicadores.bateriasCriticas,
      TETOS_PADRAO.baterias,
      indicadores.bateriasCriticas
    )
  );
  adicionar(
    componente(
      'RELOGIO',
      `${indicadores.desviosDeRelogio} equipamento(s) com desvio de relógio`,
      pesos.desvioDeRelogio * indicadores.desviosDeRelogio,
      TETOS_PADRAO.relogio,
      indicadores.desviosDeRelogio
    )
  );

  const penalidadeTotal = componentes.reduce((soma, item) => soma + item.penalidade, 0);
  const score = Math.max(0, Math.min(100, arredondar(100 - penalidadeTotal)));

  return {
    organizationId: escopo.organizationId,
    facilityId: escopo.facilityId,
    escopoId: escopo.escopoId,
    nivel: escopo.nivel,
    nome: escopo.nome,
    score,
    endpointsOnline: indicadores.endpointsOnline,
    endpointsOffline: indicadores.endpointsOffline,
    endpointsDegraded: indicadores.endpointsDegraded,
    pendingRevocations: indicadores.pendingRevocations,
    pendingSynchronizations: indicadores.pendingSynchronizations,
    unreconciledStates: indicadores.unreconciledStates,
    highRiskConflicts: indicadores.highRiskConflicts,
    staleCredentials: indicadores.staleCredentials,
    anomalousLatencyCount: indicadores.anomalousLatencyCount,
    calculatedAt: escopo.calculatedAt,
    components: componentes
  };
}

/**
 * A prova de que o número abre. Se esta função divergir do `score`, alguém
 * criou um caminho que produz número sem composição — e o teste quebra.
 */
export function somaDosComponentes(health: AccessGovernanceHealth): number {
  return arredondar(health.components.reduce((soma, item) => soma + item.penalidade, 0));
}
