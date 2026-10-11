// ---------------------------------------------------------------------------
// CLASSIFICAÇÃO DE RISCO — determinística, por decisão explícita
//
// Item 28: "Não deixar IA definir sozinha severidade."
//
// A razão não é desconfiança genérica de modelos de linguagem. É que severidade
// aqui é decisão institucional com consequência regulatória: define quem é
// acordado às 3h, o que entra em relatório de conformidade e o que a direção
// clínica assina. Uma severidade que muda de execução para execução não pode
// sustentar nenhuma dessas três coisas.
//
// A regra é uma tabela. A IA lê a tabela e explica; não a reescreve.
// ---------------------------------------------------------------------------

import { Criticidade, ORDEM_DE_CRITICIDADE } from './topologia';

export type NivelDeRisco = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const ORDEM_DE_RISCO: Readonly<Record<NivelDeRisco, number>> = Object.freeze({
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3
});

export function piorRisco(a: NivelDeRisco, b: NivelDeRisco): NivelDeRisco {
  return ORDEM_DE_RISCO[a] >= ORDEM_DE_RISCO[b] ? a : b;
}

/** Natureza da divergência, antes de ponderar por criticidade do local. */
export type NaturezaDeDivergencia =
  | 'REVOGACAO_NAO_CONFIRMADA'
  | 'CONCESSAO_NAO_CONFIRMADA'
  | 'ESTADO_DESCONHECIDO'
  | 'ENDPOINT_OFFLINE_SEM_DIVERGENCIA'
  | 'GATEWAY_DEGRADADO'
  | 'PROVEDOR_INDISPONIVEL'
  | 'LATENCIA_ANOMALA'
  | 'CONFLITO_DE_POLITICA'
  | 'CREDENCIAL_OBSOLETA'
  | 'BATERIA_CRITICA'
  | 'DESVIO_DE_RELOGIO'
  /**
   * A correspondência entre o canal comandado e o recurso nomeado não está
   * verificada (D-052).
   *
   * Está nesta lista, e não entre os achados de configuração, porque ela é
   * divergência no sentido estrito do produto: entre o que o sistema afirma e o
   * que há evidência de ser verdade. A diferença é o OBJETO da afirmação —
   * aqui, a dúvida não é se a ordem chegou, e sim se chegou à porta certa.
   */
  | 'VINCULO_SEMANTICO_NAO_VERIFICADO';

/**
 * Piso de risco por natureza — o mínimo que aquela divergência vale,
 * independentemente de onde aconteça.
 */
const PISO_POR_NATUREZA: Readonly<Record<NaturezaDeDivergencia, NivelDeRisco>> = Object.freeze({
  REVOGACAO_NAO_CONFIRMADA: 'HIGH',
  CONCESSAO_NAO_CONFIRMADA: 'LOW',
  ESTADO_DESCONHECIDO: 'MEDIUM',
  ENDPOINT_OFFLINE_SEM_DIVERGENCIA: 'LOW',
  GATEWAY_DEGRADADO: 'MEDIUM',
  PROVEDOR_INDISPONIVEL: 'MEDIUM',
  LATENCIA_ANOMALA: 'LOW',
  CONFLITO_DE_POLITICA: 'MEDIUM',
  CREDENCIAL_OBSOLETA: 'MEDIUM',
  BATERIA_CRITICA: 'MEDIUM',
  DESVIO_DE_RELOGIO: 'MEDIUM',
  VINCULO_SEMANTICO_NAO_VERIFICADO: 'MEDIUM'
});

/**
 * Naturezas cuja gravidade escala com a criticidade do local. Uma revogação
 * pendente numa sala administrativa e a mesma revogação pendente num centro
 * cirúrgico não são o mesmo fato operacional; já uma bateria fraca é uma
 * bateria fraca em qualquer porta.
 */
const ESCALA_COM_CRITICIDADE: ReadonlySet<NaturezaDeDivergencia> = new Set<NaturezaDeDivergencia>([
  'REVOGACAO_NAO_CONFIRMADA',
  'ESTADO_DESCONHECIDO',
  'CREDENCIAL_OBSOLETA',
  'CONFLITO_DE_POLITICA',
  // Comandar o canal errado numa sala administrativa é um chamado de
  // manutenção; na rede de gases medicinais é um evento de conformidade. A
  // natureza escala com a criticidade pela mesma razão que a revogação
  // pendente escala.
  'VINCULO_SEMANTICO_NAO_VERIFICADO'
]);

export interface EntradaDeClassificacao {
  natureza: NaturezaDeDivergencia;
  criticidadeDoEndpoint: Criticidade;
  /** Minutos desde que a divergência foi detectada. Ausente = recém-detectada. */
  minutosEmAberto?: number;
  /** O direito já foi confirmado presente no equipamento alguma vez? */
  houveConfirmacaoAnterior?: boolean;
}

export interface ClassificacaoDeRisco {
  nivel: NivelDeRisco;
  natureza: NaturezaDeDivergencia;
  /** Cada termo que compôs o nível, para que a tela possa abrir o número. */
  fatores: readonly string[];
}

/** Minutos a partir dos quais a divergência sobe um degrau de risco. */
export const MINUTOS_PARA_AGRAVAR = 60;

function subirUmDegrau(nivel: NivelDeRisco): NivelDeRisco {
  const ordem = ORDEM_DE_RISCO[nivel];
  const nomes: readonly NivelDeRisco[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return nomes[Math.min(ordem + 1, 3)] ?? 'CRITICAL';
}

export function classificarRisco(entrada: EntradaDeClassificacao): ClassificacaoDeRisco {
  const fatores: string[] = [];
  let nivel = PISO_POR_NATUREZA[entrada.natureza];
  fatores.push(`natureza ${entrada.natureza} → piso ${nivel}`);

  if (ESCALA_COM_CRITICIDADE.has(entrada.natureza)) {
    const grauDoLocal = ORDEM_DE_CRITICIDADE[entrada.criticidadeDoEndpoint];
    if (grauDoLocal >= ORDEM_DE_CRITICIDADE.CRITICAL) {
      nivel = 'CRITICAL';
      fatores.push(`endpoint CRITICAL → risco CRITICAL`);
    } else if (grauDoLocal >= ORDEM_DE_CRITICIDADE.HIGH && ORDEM_DE_RISCO[nivel] < ORDEM_DE_RISCO.HIGH) {
      nivel = 'HIGH';
      fatores.push(`endpoint HIGH → eleva para HIGH`);
    } else if (grauDoLocal <= ORDEM_DE_CRITICIDADE.LOW && ORDEM_DE_RISCO[nivel] > ORDEM_DE_RISCO.MEDIUM) {
      nivel = 'MEDIUM';
      fatores.push(`endpoint LOW → reduz para MEDIUM`);
    } else {
      fatores.push(`endpoint ${entrada.criticidadeDoEndpoint} → mantém`);
    }
  }

  if (
    entrada.natureza === 'REVOGACAO_NAO_CONFIRMADA' &&
    entrada.houveConfirmacaoAnterior === true &&
    ORDEM_DE_RISCO[nivel] < ORDEM_DE_RISCO.HIGH
  ) {
    // O direito esteve materializado no equipamento: a porta abre hoje.
    nivel = 'HIGH';
    fatores.push('credencial já confirmada no equipamento → eleva para HIGH');
  }

  if ((entrada.minutosEmAberto ?? 0) >= MINUTOS_PARA_AGRAVAR) {
    const anterior = nivel;
    nivel = subirUmDegrau(nivel);
    if (nivel !== anterior) {
      fatores.push(`${Math.round(entrada.minutosEmAberto ?? 0)} min em aberto → sobe um degrau`);
    }
  }

  return { nivel, natureza: entrada.natureza, fatores };
}
