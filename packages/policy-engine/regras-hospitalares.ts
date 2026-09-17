// ---------------------------------------------------------------------------
// REGRAS HOSPITALARES DE BASE
//
// Não são doutrina: são o conjunto mínimo que faz os cenários H7–H10 da
// especificação terem sentido. Cada instalação sobrepõe as suas.
//
// A escada de prioridades é declarada aqui uma única vez, em constante nomeada,
// porque prioridade espalhada em número mágico é a origem mais comum de
// conflito acidental — e conflito acidental, neste motor, fecha a porta.
// ---------------------------------------------------------------------------

import { PedidoDeDecisao, RegraDePolitica } from './tipos';
import { DOMINIOS_DE_SEGREGACAO_BASE, regraDeSegregacaoPorAtividade } from './segregacao';

export const PRIORIDADE = Object.freeze({
  BLOQUEIO_ESTRUTURAL: 100,
  RESTRICAO_SANITARIA: 80,
  SEGREGACAO_DE_FUNCOES: 70,
  APROVACAO_POR_CRITICIDADE: 60,
  CONCESSAO_POR_PAPEL: 40,
  CONTINGENCIA: 30
});

/** Sem vínculo vigente não há acesso. É a regra que faz H7 funcionar. */
export const REGRA_VINCULO_VIGENTE: RegraDePolitica = {
  id: 'R-VINCULO-VIGENTE',
  descricao: 'Vínculo encerrado, suspenso ou fora da vigência nega o acesso.',
  prioridade: PRIORIDADE.BLOQUEIO_ESTRUTURAL,
  efeito: 'DENY',
  aplicavel: (pedido) => !pedido.contexto.vinculoVigente,
  justificativa: () => 'Vínculo institucional não vigente no momento do pedido.'
};

/** OS encerrada encerra o direito do prestador. Faz H9 funcionar. */
export const REGRA_ORDEM_DE_SERVICO: RegraDePolitica = {
  id: 'R-ORDEM-DE-SERVICO',
  descricao: 'Prestador com ordem de serviço encerrada não acessa.',
  prioridade: PRIORIDADE.BLOQUEIO_ESTRUTURAL,
  efeito: 'DENY',
  aplicavel: (pedido) => pedido.contexto.ordemDeServicoAberta === false,
  justificativa: () => 'Ordem de serviço encerrada.'
};

/** Fora do turno escalado não há acesso. Faz H8 funcionar. */
export const REGRA_TURNO: RegraDePolitica = {
  id: 'R-TURNO',
  descricao: 'Acesso restrito à janela de turno escalada.',
  prioridade: PRIORIDADE.BLOQUEIO_ESTRUTURAL,
  efeito: 'DENY',
  aplicavel: (pedido) => pedido.modo === 'ACCESS' && !pedido.contexto.turnoVigente,
  justificativa: () => 'Fora da janela de turno escalada para o vínculo.'
};

/**
 * Restrição sanitária da zona. O motor NÃO sabe por que a zona está restrita —
 * sabe apenas que está, e qual perfil a política admite. O diagnóstico do
 * paciente ficou na camada de projeção e não chegou até aqui (item 25).
 */
export function regraDeRestricaoSanitaria(
  restricao: string,
  papeisAdmitidos: readonly string[]
): RegraDePolitica {
  return {
    id: `R-RESTRICAO-${restricao}`,
    descricao: `Zona sob ${restricao} admite apenas papéis habilitados.`,
    prioridade: PRIORIDADE.RESTRICAO_SANITARIA,
    efeito: 'DENY',
    aplicavel: (pedido) =>
      pedido.contexto.restricaoDaZona === restricao &&
      !pedido.contexto.papeis.some((papel) => papeisAdmitidos.includes(papel)),
    justificativa: () =>
      `Zona sob ${restricao}; nenhum papel do vínculo consta entre os habilitados.`
  };
}

/**
 * Segregação por PAR DE PAPÉIS — o instrumento rombudo, mantido de propósito.
 *
 * Nega, e negar raramente é o que um hospital quer (ver `segregacao.ts`: o
 * problema está no acúmulo, não na porta). Continua existindo para a
 * instalação que precise cravar uma incompatibilidade nominal específica —
 * duas funções que, por decisão da direção, não se acumulam em hipótese
 * alguma. Fora desse caso, o certo é a matriz por atividade.
 */
export function regraDeSegregacao(papelA: string, papelB: string): RegraDePolitica {
  return {
    id: `R-SEGREGACAO-${papelA}-${papelB}`,
    descricao: `Papéis ${papelA} e ${papelB} são incompatíveis para este acesso.`,
    prioridade: PRIORIDADE.SEGREGACAO_DE_FUNCOES,
    efeito: 'DENY',
    aplicavel: (pedido) =>
      pedido.contexto.papeis.includes(papelA) && pedido.contexto.papeis.includes(papelB),
    justificativa: () => `Segregação de funções: ${papelA} e ${papelB} no mesmo vínculo.`
  };
}

/**
 * Endpoint CRITICAL exige aprovação humana. Não é desconfiança do solicitante:
 * é registro de que alguém, com nome, respondeu por aquela entrada.
 */
export const REGRA_APROVACAO_EM_AREA_CRITICA: RegraDePolitica = {
  id: 'R-APROVACAO-AREA-CRITICA',
  descricao: 'Área de criticidade CRITICAL exige aprovação humana registrada.',
  prioridade: PRIORIDADE.APROVACAO_POR_CRITICIDADE,
  efeito: 'REQUIRE_APPROVAL',
  aplicavel: (pedido) => pedido.contexto.criticidadeDoEndpoint === 'CRITICAL',
  justificativa: () => 'Endpoint classificado como CRITICAL: aprovação humana obrigatória.'
};

/** Concessão por papel: a zona está entre as autorizadas pela soma dos papéis. */
export const REGRA_CONCESSAO_POR_PAPEL: RegraDePolitica = {
  id: 'R-CONCESSAO-POR-PAPEL',
  descricao: 'Papel do vínculo autoriza a zona do endpoint.',
  prioridade: PRIORIDADE.CONCESSAO_POR_PAPEL,
  efeito: 'ALLOW',
  aplicavel: (pedido) =>
    pedido.contexto.vinculoVigente && pedido.contexto.zonasAutorizadas.includes(pedido.contexto.zonaId),
  justificativa: (pedido: PedidoDeDecisao) =>
    `Zona ${pedido.contexto.zonaId} autorizada pelos papéis ${pedido.contexto.papeis.join(', ') || '—'}.`
};

/** Lotação na unidade também concede, para escalas que mudam sem trocar papel. */
export const REGRA_CONCESSAO_POR_LOTACAO: RegraDePolitica = {
  id: 'R-CONCESSAO-POR-LOTACAO',
  descricao: 'Vínculo lotado na unidade acessa os endpoints da unidade.',
  prioridade: PRIORIDADE.CONCESSAO_POR_PAPEL,
  efeito: 'ALLOW',
  aplicavel: (pedido) =>
    pedido.contexto.vinculoVigente && pedido.contexto.unidadesLotadas.includes(pedido.contexto.zonaId),
  justificativa: (pedido: PedidoDeDecisao) => `Vínculo lotado na unidade ${pedido.contexto.zonaId}.`
};

/**
 * A segregação por atividade entra no conjunto base.
 *
 * Fora dele, ela seria uma capacidade que cada instalação lembraria de ligar —
 * e a que esquecesse ficaria descoberta com a mesma aparência de quem não tem
 * conflito nenhum. É o mesmo erro que deixou o pedido de aprovação sem quem o
 * abrisse (ADR-0017): a porta existia, e o caminho real não passava por ela.
 */
export const REGRA_SEGREGACAO_POR_ATIVIDADE: RegraDePolitica = regraDeSegregacaoPorAtividade(
  DOMINIOS_DE_SEGREGACAO_BASE,
  PRIORIDADE.SEGREGACAO_DE_FUNCOES
);

export const REGRAS_HOSPITALARES_BASE: readonly RegraDePolitica[] = Object.freeze([
  REGRA_VINCULO_VIGENTE,
  REGRA_ORDEM_DE_SERVICO,
  REGRA_TURNO,
  REGRA_SEGREGACAO_POR_ATIVIDADE,
  REGRA_APROVACAO_EM_AREA_CRITICA,
  REGRA_CONCESSAO_POR_PAPEL,
  REGRA_CONCESSAO_POR_LOTACAO
]);
