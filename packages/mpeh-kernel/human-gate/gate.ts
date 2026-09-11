// ---------------------------------------------------------------------------
// HUMAN GATE — bloqueante por construção
//
// Não existe caminho que devolva "autorizado" por omissão. Toda saída positiva
// exige decisão explícita, ligada ao hash do conteúdo revisado, assinada por
// quem tem autoridade para aquela criticidade.
//
// A função se chama `avaliar` e não `verificarSePodePassar` de propósito: o
// verbo importa. Quem chama recebe um veredito para registrar, não uma
// permissão para esquecer.
// ---------------------------------------------------------------------------

import { sha256 } from '../ledger/cadeia';
import {
  AutoridadeDoHost,
  Criticidade,
  DecisaoDeGate,
  PedidoDeGate,
  VerdictoDoGate
} from './tipos';

/** Quantas decisões humanas cada criticidade exige. */
export const APROVACOES_POR_CRITICIDADE: Record<Criticidade, number> = {
  BAIXA: 1,
  MEDIA: 1,
  ALTA: 1,
  // Duas pessoas distintas. Não é burocracia: é a única defesa contra a fadiga
  // de plantão, que o guia nomeia como o risco que o Órgão V protege.
  CRITICA: 2
};

/** Calcula o hash do material que será submetido à revisão humana. */
export async function selarBundle(conteudo: string): Promise<string> {
  return sha256(conteudo);
}

export async function abrirPedido(params: {
  id: string;
  operacao: string;
  justificativa: string;
  conteudoParaRevisao: string;
  criticidade: Criticidade;
  solicitadoPor: string;
  agora?: string;
}): Promise<PedidoDeGate> {
  return {
    id: params.id,
    operacao: params.operacao,
    justificativa: params.justificativa,
    bundleHash: await selarBundle(params.conteudoParaRevisao),
    criticidade: params.criticidade,
    solicitadoPor: params.solicitadoPor,
    criadoEm: params.agora ?? new Date().toISOString()
  };
}

function bloqueio(
  pedido: PedidoDeGate,
  motivo: VerdictoDoGate['motivo'],
  explicacao: string,
  aprovadores: string[] = []
): VerdictoDoGate {
  return {
    autorizado: false,
    motivo,
    explicacao,
    registro: {
      pedidoId: pedido.id,
      bundleHash: pedido.bundleHash,
      aprovadores,
      criticidade: pedido.criticidade
    }
  };
}

/**
 * Avalia as decisões humanas contra o pedido.
 *
 * `conteudoAtual` é o material NO MOMENTO DA EXECUÇÃO, e não o que foi
 * revisado. É a diferença entre os dois que este gate existe para apanhar:
 * mostrar uma coisa ao revisor e executar outra é o ataque mais simples contra
 * revisão humana, e o único que um booleano jamais detecta.
 */
export async function avaliar(params: {
  pedido: PedidoDeGate;
  decisoes: DecisaoDeGate[];
  conteudoAtual: string;
  autoridade: AutoridadeDoHost;
}): Promise<VerdictoDoGate> {
  const { pedido, decisoes, conteudoAtual, autoridade } = params;

  // 1. O conteúdo continua sendo o que foi revisado?
  const hashAtual = await selarBundle(conteudoAtual);
  if (hashAtual !== pedido.bundleHash) {
    return bloqueio(
      pedido,
      'CONTEUDO_MUDOU_APOS_REVISAO',
      `O material mudou depois da revisão. Revisado: ${pedido.bundleHash.slice(0, 16)}…, ` +
        `agora: ${hashAtual.slice(0, 16)}…. A aprovação valia para o conteúdo revisado, ` +
        'e ninguém precisou lembrar de revogá-la.'
    );
  }

  // A ordem importa. Na primeira versão, `SEM_DECISAO` vinha antes e engolia o
  // caso em que alguém apresenta a decisão de OUTRO pedido: os dois bloqueiam,
  // mas os diagnósticos pedem ações diferentes. "Nenhuma decisão" manda buscar
  // um revisor; "decisão do pedido errado" é sinal de que alguém tentou
  // reaproveitar uma aprovação, e merece ser dito com todas as letras.
  const deOutro = decisoes.find((d) => d.pedidoId !== pedido.id);
  if (deOutro) {
    return bloqueio(
      pedido,
      'DECISAO_DE_OUTRO_PEDIDO',
      `Decisão apresentada pertence ao pedido "${deOutro.pedidoId}", não a "${pedido.id}". ` +
        'Aprovação não se transfere entre pedidos.'
    );
  }

  const doPedido = decisoes.filter((d) => d.pedidoId === pedido.id);
  if (doPedido.length === 0) {
    return bloqueio(pedido, 'SEM_DECISAO', 'Nenhuma decisão humana para este pedido. Bloqueado.');
  }

  const aprovadores: string[] = [];

  for (const d of doPedido) {
    if (d.bundleHash !== pedido.bundleHash) {
      return bloqueio(
        pedido,
        'CONTEUDO_MUDOU_APOS_REVISAO',
        `A decisão de "${d.aprovador}" está ligada a outro conteúdo. Aprovação é do pacote, ` +
          'não do pedido.',
        aprovadores
      );
    }

    if ((d.justificativa ?? '').trim() === '') {
      return bloqueio(
        pedido,
        'JUSTIFICATIVA_AUSENTE',
        `"${d.aprovador}" decidiu sem justificativa. Decisão sem motivo é silêncio com carimbo — ` +
          'e vale para a recusa tanto quanto para a aprovação.',
        aprovadores
      );
    }

    if (!(await autoridade.assinaturaConfere(d))) {
      return bloqueio(
        pedido,
        'ASSINATURA_INVALIDA',
        `Assinatura de "${d.aprovador}" não confere junto ao host.`,
        aprovadores
      );
    }

    if (!(await autoridade.podeDecidir(d.papel, pedido.criticidade))) {
      return bloqueio(
        pedido,
        'APROVADOR_SEM_AUTORIDADE',
        `O papel "${d.papel}" não decide sobre criticidade ${pedido.criticidade}.`,
        aprovadores
      );
    }

    if (d.decisao === 'RECUSADO') {
      return bloqueio(
        pedido,
        'RECUSADO_PELO_HUMANO',
        `Recusado por "${d.aprovador}" (${d.papel}): ${d.justificativa}`,
        aprovadores
      );
    }

    if (aprovadores.includes(d.aprovador)) {
      return bloqueio(
        pedido,
        'APROVADOR_REPETIDO',
        `"${d.aprovador}" aparece duas vezes. Em criticidade ${pedido.criticidade} as ` +
          'aprovações precisam vir de pessoas distintas — a mesma pessoa duas vezes é ' +
          'uma pessoa, não duas.',
        aprovadores
      );
    }

    aprovadores.push(d.aprovador);
  }

  const exigidas = APROVACOES_POR_CRITICIDADE[pedido.criticidade];
  if (aprovadores.length < exigidas) {
    return bloqueio(
      pedido,
      'APROVACOES_INSUFICIENTES',
      `Criticidade ${pedido.criticidade} exige ${exigidas} aprovação(ões) de pessoas ` +
        `distintas; há ${aprovadores.length}.`,
      aprovadores
    );
  }

  return {
    autorizado: true,
    explicacao:
      `Autorizado por ${aprovadores.join(', ')} sobre o pacote ${pedido.bundleHash.slice(0, 16)}…, ` +
      'conferido inalterado no momento da execução.',
    registro: {
      pedidoId: pedido.id,
      bundleHash: pedido.bundleHash,
      aprovadores,
      criticidade: pedido.criticidade
    }
  };
}
