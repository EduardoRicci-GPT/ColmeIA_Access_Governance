// ---------------------------------------------------------------------------
// ACCESS ASSURANCE — modelo de visão (item 27)
//
// A tela é separada do renderizador porque a decisão sobre O QUE mostrar é
// arquitetural, e a decisão sobre COMO mostrar não é. Este arquivo contém a
// primeira, é puro, e é testável: dá para provar que a fila está ordenada por
// risco e que nenhum score chegou à tela sem componentes.
//
// Ordenar por risco, e não por data, é a decisão de produto mais consequente
// desta tela. Um painel ordenado por "mais recente" convida o operador a
// trabalhar a lista de cima para baixo — e, numa noite movimentada, a
// revogação crítica de duas horas atrás desce para a terceira página enquanto
// bateria fraca de porta de almoxarifado ocupa o topo.
// ---------------------------------------------------------------------------

import { EscalationCase } from '../dominio/escalonamento';
import { NivelDeRisco, ORDEM_DE_RISCO } from '../dominio/risco';
import { NivelDeHierarquia, Topologia } from '../dominio/topologia';
import { AccessGovernanceHealth, HealthComponent, somaDosComponentes } from '../observability-assurance/health';
import { RelatorioDeAssurance } from '../observability-assurance/assurance';
import { PhysicalReconciliationResult } from '../physical-state-reconciliation/tipos';
import { LinhaDeResumo, resumirDivergencias } from '../narrativa/resumo';
import { descreverReconciliacao } from '../narrativa/honestidade';
import { LinhaDoTempo } from './timeline';

export type FaixaDeScore = 'BOM' | 'ATENCAO' | 'CRITICO';

export function faixaDe(score: number): FaixaDeScore {
  if (score >= 90) return 'BOM';
  if (score >= 70) return 'ATENCAO';
  return 'CRITICO';
}

export interface CartaoDeEscopo {
  escopoId: string;
  nome: string;
  nivel: NivelDeHierarquia;
  paiId: string | null;
  score: number;
  faixa: FaixaDeScore;
  componentes: readonly HealthComponent[];
  /** Prova de que o número abre: soma das penalidades = 100 - score. */
  somaDasPenalidades: number;
  endpointsOffline: number;
  revogacoesPendentes: number;
  naoReconciliados: number;
}

export interface ItemDaFila {
  endpointId: string;
  nomeDoEndpoint: string;
  zonaId: string;
  risco: NivelDeRisco;
  acao: string;
  confianca: string;
  natureza: string;
  /** Frases determinísticas, prontas para exibição — nunca texto gerado. */
  linhas: readonly string[];
  minutosEmAberto: number | null;
  fatoresDeRisco: readonly string[];
}

export interface PainelDeAssurance {
  geradoEm: Date;
  raiz: CartaoDeEscopo;
  escopos: readonly CartaoDeEscopo[];
  filaDeRisco: readonly ItemDaFila[];
  resumo: readonly LinhaDeResumo[];
  casos: readonly EscalationCase[];
  timelines: readonly LinhaDoTempo[];
  /** Total de itens que a tela declara NÃO saber. */
  incertezas: number;
}

function cartao(health: AccessGovernanceHealth, paiId: string | null): CartaoDeEscopo {
  return {
    escopoId: health.escopoId,
    nome: health.nome,
    nivel: health.nivel,
    paiId,
    score: health.score,
    faixa: faixaDe(health.score),
    componentes: health.components,
    somaDasPenalidades: somaDosComponentes(health),
    endpointsOffline: health.endpointsOffline,
    revogacoesPendentes: health.pendingRevocations,
    naoReconciliados: health.unreconciledStates
  };
}

export function montarPainel(
  topologia: Topologia,
  relatorio: RelatorioDeAssurance,
  timelines: readonly LinhaDoTempo[] = []
): PainelDeAssurance {
  const paiPorId = new Map<string, string | null>(topologia.nos.map((no) => [no.id, no.paiId]));
  for (const endpoint of topologia.endpoints) paiPorId.set(endpoint.id, endpoint.zonaId);

  const escopos = relatorio.arvore.ordenadosPorRisco.map((health) =>
    cartao(health, paiPorId.get(health.escopoId) ?? null)
  );

  const endpointsPorId = new Map(topologia.endpoints.map((e) => [e.id, e]));
  const filaDeRisco: ItemDaFila[] = relatorio.filaDeRisco
    .filter((resultado) => resultado.action !== 'NONE')
    .map((resultado: PhysicalReconciliationResult) => {
      const endpoint = endpointsPorId.get(resultado.endpointId);
      return {
        endpointId: resultado.endpointId,
        nomeDoEndpoint: endpoint?.nome ?? resultado.endpointId,
        zonaId: endpoint?.zonaId ?? '—',
        risco: resultado.riskLevel,
        acao: resultado.action,
        confianca: resultado.confidence,
        natureza: resultado.natureza,
        linhas: descreverReconciliacao(resultado),
        minutosEmAberto: resultado.minutosEmAberto,
        fatoresDeRisco: resultado.fatoresDeRisco
      };
    })
    .sort((a, b) => ORDEM_DE_RISCO[b.risco] - ORDEM_DE_RISCO[a.risco]);

  return {
    geradoEm: relatorio.calculadoEm,
    raiz: cartao(relatorio.arvore.raiz, null),
    escopos,
    filaDeRisco,
    resumo: resumirDivergencias(topologia, relatorio.filaDeRisco),
    casos: relatorio.casosAbertos,
    timelines,
    incertezas: relatorio.filaDeRisco.filter((resultado) => resultado.confidence === 'UNKNOWN').length
  };
}

/**
 * Invariante da tela, verificada em teste: nenhum cartão exibe score cuja
 * composição não feche. Se esta função encontrar divergência, existe um
 * caminho que produz número sem explicação — e o item 7 foi violado.
 */
export function verificarExplicabilidade(painel: PainelDeAssurance): readonly string[] {
  const falhas: string[] = [];
  for (const escopo of [painel.raiz, ...painel.escopos]) {
    const esperado = Math.round((100 - escopo.somaDasPenalidades) * 100) / 100;
    const limitado = Math.max(0, Math.min(100, esperado));
    if (Math.abs(limitado - escopo.score) > 0.01) {
      falhas.push(
        `${escopo.escopoId}: score ${escopo.score} não fecha com a soma dos componentes (${escopo.somaDasPenalidades}).`
      );
    }
    if (escopo.score < 100 && escopo.componentes.length === 0) {
      falhas.push(`${escopo.escopoId}: score ${escopo.score} sem nenhum componente que o explique.`);
    }
  }
  return falhas;
}
