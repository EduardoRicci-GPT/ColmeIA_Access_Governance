// ---------------------------------------------------------------------------
// HUMAN GATE — terceiro pacote, na ordem do guia (Ledger → Calibration →
// HumanGate → WSG).
//
// O DEFEITO QUE ESTE PACOTE CORRIGE
//
// A Aletheia já tem HumanGate desde a Onda 7, e ele é um BOOLEANO:
// `humanGateAprovado?: boolean`. Quem chama passa `true`.
//
// Um booleano aprova nada em particular. O mesmo `true` serve para qualquer
// conteúdo, em qualquer momento, vindo de qualquer um. Não há como perguntar
// depois "o que exatamente foi aprovado, por quem, e o conteúdo continuou o
// mesmo?" — e num terminal de regulação médica essas três perguntas são a
// diferença entre uma autorização e um carimbo.
//
// A REGRA DE OURO, EM UMA FRASE
//
// O guia mapeia "Regra de Ouro do Árbiter (token + rubrica + rastreabilidade)"
// para `token_signature` + `review_bundle_hash`. A consequência operante:
//
//   a aprovação é ligada ao HASH do que foi revisado.
//
// Aprovar o pacote A não autoriza executar sobre o pacote B. Se o conteúdo
// mudar um caractere depois da revisão, a aprovação deixa de valer sozinha —
// ninguém precisa lembrar de revogá-la. É a defesa contra o ataque mais
// simples que existe contra revisão humana: mostrar uma coisa e executar outra.
// ---------------------------------------------------------------------------

export type Criticidade = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';

/** O que se pretende fazer, e o material exato que o humano vai revisar. */
export interface PedidoDeGate {
  id: string;
  /** A operação pretendida, em português, legível por quem decide. */
  operacao: string;
  /** Por que isto precisa de humano. Sem motivo, não há o que revisar. */
  justificativa: string;
  /** SHA-256 do material submetido à revisão. */
  bundleHash: string;
  criticidade: Criticidade;
  solicitadoPor: string;
  criadoEm: string;
}

/**
 * A decisão humana.
 *
 * `bundleHash` repetido aqui de propósito: é o que liga a decisão ao conteúdo.
 * `justificativa` é obrigatória inclusive na recusa — recusa sem motivo não é
 * decisão, é silêncio com carimbo.
 */
export interface DecisaoDeGate {
  pedidoId: string;
  bundleHash: string;
  decisao: 'APROVADO' | 'RECUSADO';
  aprovador: string;
  papel: string;
  justificativa: string;
  decididoEm: string;
  /** Token do host. O kernel não o interpreta — delega ao portador da autoridade. */
  assinatura: string;
}

export type MotivoDeBloqueio =
  | 'SEM_DECISAO'
  | 'DECISAO_DE_OUTRO_PEDIDO'
  | 'CONTEUDO_MUDOU_APOS_REVISAO'
  | 'RECUSADO_PELO_HUMANO'
  | 'ASSINATURA_INVALIDA'
  | 'APROVADOR_SEM_AUTORIDADE'
  | 'JUSTIFICATIVA_AUSENTE'
  | 'APROVACOES_INSUFICIENTES'
  | 'APROVADOR_REPETIDO';

export interface VerdictoDoGate {
  autorizado: boolean;
  motivo?: MotivoDeBloqueio;
  explicacao: string;
  /** Para o Ledger: o que exatamente foi autorizado, e sobre qual conteúdo. */
  registro: {
    pedidoId: string;
    bundleHash: string;
    aprovadores: string[];
    criticidade: Criticidade;
  };
}

/**
 * A autoridade vive no HOST, não aqui.
 *
 * O kernel não sabe o que é um supervisor de plantão nem como se valida um
 * token — e não deve saber. O guia é explícito: "MPE-H consome o RBAC do
 * host". Esta porta é onde o host entrega o que sabe.
 */
export interface AutoridadeDoHost {
  /** O token confere, e pertence a este aprovador? */
  assinaturaConfere(decisao: DecisaoDeGate): boolean | Promise<boolean>;
  /** Este papel pode decidir sobre esta criticidade? */
  podeDecidir(papel: string, criticidade: Criticidade): boolean | Promise<boolean>;
}
