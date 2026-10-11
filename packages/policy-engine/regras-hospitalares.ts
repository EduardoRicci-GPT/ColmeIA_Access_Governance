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
  /**
   * O que nem a emergência atravessa: vínculo, ordem de serviço e habilitação
   * suspensa. A quebra de vidro concede PERMISSÃO depressa, e nenhuma dessas
   * três é falta de permissão — são falta de vínculo e falta de qualificação,
   * que não se concedem depressa nem devagar.
   */
  IMPEDIMENTO_ABSOLUTO: 120,
  /**
   * A emergência declarada. Fica acima do turno de propósito: a enfermeira cujo
   * plantão terminou dez minutos atrás e que está no corredor é exatamente
   * quem atende a parada cardíaca.
   */
  QUEBRA_DE_VIDRO: 110,
  BLOQUEIO_ESTRUTURAL: 100,
  /**
   * A restrição local do recurso que SUSPENDE o exercício (D-054): sala em
   * procedimento, ala interditada, ocupação máxima. Fica acima da restrição
   * sanitária porque é mais específica — aquela é um perfil da zona, esta é um
   * fato daquele recurso naquele instante — e abaixo da quebra de vidro, pela
   * mesma razão que a sanitária: numa parada, quem entra é quem está na porta.
   */
  RESTRICAO_LOCAL_DO_RECURSO: 85,
  RESTRICAO_SANITARIA: 80,
  COMPETENCIA_EXIGIDA: 75,
  SEGREGACAO_DE_FUNCOES: 70,
  /**
   * As duas exigências de revisão que o consolidado de outubro acrescentou
   * ficam ABAIXO de toda negativa, e a ordem não é estética: `REQUIRE_APPROVAL`
   * numa prioridade mais alta que um `DENY` venceria a negativa, e uma sala
   * interditada passaria a ser "entre com autorização do plantão". A escada é o
   * que impede isso, e é por ela que estes dois números são menores que 70.
   */
  CORROBORACAO_LOCAL: 64,
  PROVA_DE_IDENTIFICADOR: 62,
  APROVACAO_POR_CRITICIDADE: 60,
  CONCESSAO_POR_PAPEL: 40,
  CONTINGENCIA: 30
});

/** Sem vínculo vigente não há acesso. É a regra que faz H7 funcionar. */
export const REGRA_VINCULO_VIGENTE: RegraDePolitica = {
  id: 'R-VINCULO-VIGENTE',
  descricao: 'Vínculo encerrado, suspenso ou fora da vigência nega o acesso.',
  prioridade: PRIORIDADE.IMPEDIMENTO_ABSOLUTO,
  efeito: 'DENY',
  aplicavel: (pedido) => !pedido.contexto.vinculoVigente,
  justificativa: () => 'Vínculo institucional não vigente no momento do pedido.'
};

/** OS encerrada encerra o direito do prestador. Faz H9 funcionar. */
export const REGRA_ORDEM_DE_SERVICO: RegraDePolitica = {
  id: 'R-ORDEM-DE-SERVICO',
  descricao: 'Prestador com ordem de serviço encerrada não acessa.',
  prioridade: PRIORIDADE.IMPEDIMENTO_ABSOLUTO,
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
 * Habilitação SUSPENSA nega, e a negativa é de outra natureza.
 *
 * Suspensão é decisão de uma autoridade externa — conselho de classe, órgão
 * emissor. Nenhuma alçada desta instalação a relaxa, e por isso esta regra
 * mora entre os bloqueios estruturais: o que falta ali não é permissão, é
 * qualificação, e permissão é a única coisa que uma autoridade interna sabe
 * conceder.
 *
 * É também a única falha de competência que fecha porta sozinha.
 */
export const REGRA_COMPETENCIA_SUSPENSA: RegraDePolitica = {
  id: 'R-COMPETENCIA-SUSPENSA',
  descricao: 'Habilitação exigida suspensa pelo emissor nega o acesso.',
  prioridade: PRIORIDADE.IMPEDIMENTO_ABSOLUTO,
  efeito: 'DENY',
  aplicavel: (pedido) => pedido.contexto.competencia?.suspensa === true,
  justificativa: (pedido) =>
    pedido.contexto.competencia?.explicacao ?? 'Habilitação suspensa pelo emissor.'
};

/**
 * Habilitação vencida ou não declarada exige revisão humana — e não nega.
 *
 * A tentação é tratar toda falha de competência como negativa. Seria simples,
 * e reintroduziria o erro simétrico do ADR-0014: numa madrugada, a anuidade
 * atrasada de um enfermeiro fecharia a UTI para a única pessoa presente. O
 * custo do rigor recairia sobre o paciente, não sobre quem esqueceu de
 * renovar.
 *
 * Quem decide se aquele plantão segue é gente com alçada — e, depois do
 * ADR-0017 e do ADR-0018, essa exigência abre pedido de fato e chama quem pode
 * resolver, em vez de virar porta que não abre e ninguém sabe por quê.
 */
export const REGRA_COMPETENCIA_PENDENTE: RegraDePolitica = {
  id: 'R-COMPETENCIA-PENDENTE',
  descricao: 'Habilitação exigida vencida ou não declarada exige revisão humana.',
  prioridade: PRIORIDADE.COMPETENCIA_EXIGIDA,
  efeito: 'REQUIRE_APPROVAL',
  aplicavel: (pedido) =>
    pedido.contexto.competencia?.exigida === true &&
    pedido.contexto.competencia.atende === false &&
    pedido.contexto.competencia.suspensa === false,
  justificativa: (pedido) =>
    pedido.contexto.competencia?.explicacao ?? 'Habilitação exigida pendente.'
};

/**
 * A quebra de vidro abre a porta agora — e não aprova nada.
 *
 * Vence o turno, a criticidade, a segregação e a competência pendente, porque
 * todas elas são formas de DELIBERAÇÃO, e é a deliberação que a emergência não
 * comporta. Perde para vínculo, ordem de serviço encerrada e habilitação
 * suspensa, porque essas não são deliberação: são ausência de vínculo e
 * ausência de qualificação, e não existe conceder depressa o que a pessoa não
 * tem.
 *
 * Vence também a restrição sanitária, e esta é a decisão mais discutível do
 * conjunto. O argumento: numa parada dentro de um isolamento, quem entra é
 * quem está na porta, de EPI, e o que decide isso é o protocolo assistencial —
 * não a fechadura. A revisão posterior vê o caso, e é ali que a discussão
 * acontece, com o paciente já atendido.
 *
 * Quando a janela fecha, o acesso volta a depender do caminho normal: a
 * pendência de aprovação continua aberta, porque nada foi aprovado.
 */
export const REGRA_QUEBRA_DE_VIDRO: RegraDePolitica = {
  id: 'R-QUEBRA-DE-VIDRO',
  descricao: 'Emergência declarada abre o acesso pela janela da quebra de vidro.',
  prioridade: PRIORIDADE.QUEBRA_DE_VIDRO,
  efeito: 'ALLOW',
  aplicavel: (pedido) => pedido.contexto.quebraDeVidroAtiva === true,
  justificativa: () =>
    'Quebra de vidro ativa: alguém afirmou emergência com nome e justificativa, e assumiu ' +
    'prestar contas depois. A porta abre agora; nada foi aprovado, e a revisão obrigatória ' +
    'permanece aberta até que uma pessoa com alçada a feche.'
};

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

/**
 * Bloqueio acionado LOCALMENTE no equipamento — e por que ele é absoluto.
 *
 * Alguém girou a tranca, apertou o botão de bloqueio, trancou por dentro. O
 * produto pode conceder o acesso em software, e a porta não vai abrir: o
 * bloqueio é físico e a decisão do equipamento é a que acontece.
 *
 * Deixar esta regra abaixo da quebra de vidro seria pior do que inútil. A tela
 * diria "acesso liberado pela emergência" a quem está do lado de fora de uma
 * porta trancada por dentro — e num corredor, às 3h, essa frase faz alguém
 * parar de procurar outro caminho. Negar aqui é o único jeito de a tela não
 * prometer o que o mundo não vai cumprir.
 *
 * É o item 4 aplicado à decisão, e não só ao estado: o sistema não maquia de
 * verde o que não tem evidência de ser verde.
 */
export const REGRA_BLOQUEIO_LOCAL: RegraDePolitica = {
  id: 'R-BLOQUEIO-LOCAL',
  descricao: 'Bloqueio acionado localmente no equipamento nega o acesso, inclusive sob emergência.',
  prioridade: PRIORIDADE.IMPEDIMENTO_ABSOLUTO,
  efeito: 'DENY',
  aplicavel: (pedido) =>
    pedido.modo === 'ACCESS' &&
    (pedido.contexto.especiesDeRestricaoLocal ?? []).includes('BLOQUEIO_LOCAL_DO_EQUIPAMENTO'),
  justificativa: () =>
    'Bloqueio acionado localmente no equipamento. Conceder em software não abriria a porta: ' +
    'o produto diria sim e a fechadura diria não, e quem está no corredor pararia de procurar ' +
    'outro caminho.'
};

/**
 * Exercício suspenso por restrição local (D-054) nega o INSTANTE, e só ele.
 *
 * A regra existe em modo ACCESS e não existe em modo ENTITLEMENT, e essa
 * assimetria é o delta inteiro. Em modo ENTITLEMENT, o motor de direitos
 * revogaria — e revogar por causa de uma obra de duas horas dispara ordem ao
 * fabricante, sincroniza a frota, exige reemissão depois, e grava na trilha
 * "direito revogado" onde houve "sala ocupada". Seis meses depois, a auditoria
 * não distingue uma coisa da outra.
 *
 * O direito continua `ENTITLEMENT_ACTIVE`. Quando a restrição vence, a entrada
 * volta sem que ninguém reemita nada.
 */
export const REGRA_RESTRICAO_LOCAL: RegraDePolitica = {
  id: 'R-RESTRICAO-LOCAL',
  descricao: 'Restrição local vigente suspende o exercício do direito neste instante.',
  prioridade: PRIORIDADE.RESTRICAO_LOCAL_DO_RECURSO,
  efeito: 'DENY',
  aplicavel: (pedido) =>
    pedido.modo === 'ACCESS' && pedido.contexto.exercicioLocal === 'SUSPENSO_LOCALMENTE',
  justificativa: (pedido) =>
    'Exercício suspenso por restrição local do recurso' +
    ((pedido.contexto.especiesDeRestricaoLocal ?? []).length > 0
      ? ` (${(pedido.contexto.especiesDeRestricaoLocal ?? []).join(', ')})`
      : '') +
    '. O direito permanece vigente: nada foi revogado, e a entrada volta quando a restrição vencer.'
};

/**
 * Restrição local que pede um segundo fato (D-054) exige revisão humana.
 *
 * É o efeito que descreve a privacidade do paciente melhor do que a suspensão:
 * a enfermeira entra no quarto, o técnico de TI não entra sozinho. Quem resolve
 * o instante é o plantão, com acompanhamento ou segunda pessoa — e nada disso
 * mexe no direito.
 */
export const REGRA_CORROBORACAO_LOCAL: RegraDePolitica = {
  id: 'R-CORROBORACAO-LOCAL',
  descricao: 'Restrição local que exige corroboração manda o instante para revisão humana.',
  prioridade: PRIORIDADE.CORROBORACAO_LOCAL,
  efeito: 'REQUIRE_APPROVAL',
  aplicavel: (pedido) =>
    pedido.modo === 'ACCESS' && pedido.contexto.exercicioLocal === 'EXIGE_CORROBORACAO',
  justificativa: (pedido) =>
    'Restrição local vigente pede um segundo fato para esta entrada' +
    ((pedido.contexto.especiesDeRestricaoLocal ?? []).length > 0
      ? ` (${(pedido.contexto.especiesDeRestricaoLocal ?? []).join(', ')})`
      : '') +
    ': acompanhamento, segunda pessoa ou liberação registrada pelo plantão.'
};

/**
 * Identificador apenas OBSERVADO (D-053) não concede, e também não nega.
 *
 * As duas tentações aqui são erradas em direções opostas. Conceder transforma
 * uma placa clonada em entrada autorizada, com registro impecável dizendo que o
 * veículo certo entrou. Negar manda o motorista com a ordem de serviço na mão
 * de volta ao telefone da portaria — onde nada fica registrado e o portão abre
 * do mesmo jeito.
 *
 * O caminho honesto é o terceiro: a observação CONVOCA a conferência. A fila
 * anda mais rápido porque o sistema já sabe quem está chegando, e a entrada
 * continua dependendo de alguém apresentar credencial ou de o plantão liberar
 * com registro.
 */
export const REGRA_PROVA_DE_IDENTIFICADOR: RegraDePolitica = {
  id: 'R-PROVA-DE-IDENTIFICADOR',
  descricao: 'Identificador observado sem credencial apresentada exige conferência humana.',
  prioridade: PRIORIDADE.PROVA_DE_IDENTIFICADOR,
  efeito: 'REQUIRE_APPROVAL',
  aplicavel: (pedido) =>
    pedido.modo === 'ACCESS' && pedido.contexto.provaDeIdentificador === 'APENAS_OBSERVADA',
  justificativa: () =>
    'Um sensor reconheceu um identificador e ninguém apresentou credencial. A leitura adianta ' +
    'a conferência da portaria e não a substitui: clonar uma placa custa menos que uma fechadura.'
};

export const REGRAS_HOSPITALARES_BASE: readonly RegraDePolitica[] = Object.freeze([
  REGRA_BLOQUEIO_LOCAL,
  REGRA_VINCULO_VIGENTE,
  REGRA_ORDEM_DE_SERVICO,
  REGRA_TURNO,
  REGRA_COMPETENCIA_SUSPENSA,
  REGRA_QUEBRA_DE_VIDRO,
  REGRA_COMPETENCIA_PENDENTE,
  REGRA_RESTRICAO_LOCAL,
  REGRA_SEGREGACAO_POR_ATIVIDADE,
  REGRA_CORROBORACAO_LOCAL,
  REGRA_PROVA_DE_IDENTIFICADOR,
  REGRA_APROVACAO_EM_AREA_CRITICA,
  REGRA_CONCESSAO_POR_PAPEL,
  REGRA_CONCESSAO_POR_LOTACAO
]);
