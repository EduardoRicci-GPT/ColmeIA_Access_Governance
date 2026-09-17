// ---------------------------------------------------------------------------
// LEITURA POR PÚBLICO — o item 15 do backlog, feito pelo avesso
//
// O item pedia "camada de IA sobre o assurance: resumo por público,
// agrupamento e priorização". A formulação é de quem parte do modelo e procura
// onde encaixá-lo. Este módulo parte do contrário: o que desta leitura uma
// máquina determinística já faz, e o que sobra de fato para uma faculdade de
// linguagem?
//
// A resposta, medida contra o que o produto já tem, é desconfortável para a
// formulação original: quase tudo já está feito.
//
// AGRUPAR já está feito — `resumirDivergencias` agrupa por zona.
// PRIORIZAR já está feito — a fila sai ordenada por risco, e o Health Score
// abre em componentes com peso declarado.
// ATRIBUIR CAUSA já está feito, e com uma regra que nenhum modelo respeitaria
// sozinho: causa só é atribuída quando é dedutível.
//
// O QUE SOBRA
//
// Sobra a FORMA, e sobra para dois dos quatro públicos. A frase "2 revogações
// pendentes em Farmácia porque o gateway está offline desde 08:14" é completa,
// exata e suficiente para quem opera — Segurança e TI leem isso e agem. Para a
// DIREÇÃO e para a QUALIDADE ela é verdadeira e inútil: uma pede consequência
// institucional, a outra pede conformidade a norma, e nenhuma das duas está no
// material porque nenhuma é dedutível dele.
//
// Então o degrau determinístico faz o que sabe e DECLARA o que não sabe. Onde
// ele declina, a cascata escala. E o que volta da escalada passa pela
// ancoragem, porque um texto para a direção é exatamente onde um número
// inventado faz mais estrago.
//
// A CONSEQUÊNCIA QUE IMPORTA
//
// Dois dos quatro públicos deste produto nunca acionam modelo nenhum. Não por
// economia: porque não precisam. Essa é a forma concreta de "manter o
// aplicativo independente de IA exterior" — não recusar o modelo, e sim reduzir
// a superfície em que ele é necessário até sobrar só o que é mesmo dele.
// ---------------------------------------------------------------------------

import {
  Faculdade,
  PedidoAFaculdade,
  RespostaDaFaculdade
} from '../sinergentia/faculdades';
import { LeituraRoteada, RoteadorDeFaculdades } from '../sinergentia/roteador';
import { LinhaDeResumo } from './resumo';

/**
 * Os quatro públicos do item 10 do backlog.
 *
 * Não são níveis de detalhe: são perguntas diferentes. Quem opera pergunta "o
 * que eu faço agora"; a direção pergunta "isto nos expõe a quê"; a qualidade
 * pergunta "isto fere qual norma".
 */
export type Publico = 'SEGURANCA' | 'TI' | 'DIRECAO' | 'QUALIDADE';

export const PUBLICOS: readonly Publico[] = Object.freeze([
  'SEGURANCA',
  'TI',
  'DIRECAO',
  'QUALIDADE'
]);

/**
 * Para quem o determinístico basta — e é a maior parte da operação.
 *
 * A lista é curta e explícita, como toda decisão deste produto que decide
 * quando um instrumento se cala. Ampliá-la sem medição transformaria "o
 * determinístico não alcança" numa desculpa para consultar modelo por hábito.
 */
const ATENDIDOS_PELO_DETERMINISTICO: ReadonlySet<Publico> = new Set<Publico>([
  'SEGURANCA',
  'TI'
]);

const ENQUADRAMENTO: Readonly<Record<Publico, string>> = Object.freeze({
  SEGURANCA: 'o que precisa de ação agora, e em qual porta',
  TI: 'o que está degradado na infraestrutura e o que isso impede',
  DIRECAO: 'a que a organização está exposta enquanto isto durar',
  QUALIDADE: 'o que disto fere procedimento e o que precisa de registro formal'
});

/** O material apurado, em texto. É o que a faculdade vê e o que a ancoragem confere. */
export function materialDaLeitura(
  linhas: readonly LinhaDeResumo[],
  publico: Publico
): string {
  if (linhas.length === 0) {
    return 'Nenhuma divergência aberta neste ciclo.';
  }
  const corpo = linhas
    .map((linha) => `- [${linha.risco}] ${linha.escopoId}: ${linha.texto}`)
    .join('\n');
  return `Leitura para ${publico} — ${ENQUADRAMENTO[publico]}.\n\n${corpo}`;
}

/**
 * O degrau zero: uma faculdade como qualquer outra, que não gera texto novo.
 *
 * Ela não "responde offline". Ela responde, ponto — e responde primeiro. O que
 * a distingue é que o texto dela já existia: é o apurado pelos instrumentos,
 * remontado. Por isso a taxa de fabricação dela é 0 por construção, e isso não
 * é mérito: é que não há como inventar âncora quando não se inventa frase.
 */
export class NucleoDeterministico implements Faculdade {
  readonly id = 'nucleo-deterministico-colmeia';
  readonly nome = 'Núcleo determinístico ColmeIA';
  readonly escola = 'ColmeIA' as const;
  readonly protocolo = 'deterministico-colmeia' as const;
  readonly local = true;
  readonly tarefas = ['leitura_por_publico', 'sintese_curta'] as const;

  async responder(pedido: PedidoAFaculdade): Promise<RespostaDaFaculdade> {
    const publico = pedido.publico as Publico;
    if (ATENDIDOS_PELO_DETERMINISTICO.has(publico)) {
      return { atendeu: true, texto: pedido.material };
    }
    // O declínio carrega o material assim mesmo. Ele é o piso: se a cascata
    // inteira falhar, é isto que chega à tela, e chegar o apurado é sempre
    // melhor do que chegar nada.
    return {
      atendeu: false,
      texto: pedido.material,
      motivo:
        `o público ${publico} pede ${ENQUADRAMENTO[publico]}, e isso não é dedutível do ` +
        'material apurado. Atribuir causa ou consequência que não se deduz é exatamente o ' +
        'que a narrativa determinística deste produto se proíbe de fazer.'
    };
  }
}

export interface LeituraDePublico {
  publico: Publico;
  leitura: LeituraRoteada;
}

/**
 * A leitura de um público, passando pela cascata.
 *
 * Note que `material` é montado aqui e entra no pedido: a mesma string que a
 * faculdade lê é a que a ancoragem confere. Montar um para o modelo e conferir
 * contra outro aprovaria prosa que cita fato verdadeiro que ninguém mostrou —
 * acerto por sorte, indistinguível de invenção quando não se pode repetir.
 */
export async function lerParaPublico(
  publico: Publico,
  linhas: readonly LinhaDeResumo[],
  roteador: RoteadorDeFaculdades
): Promise<LeituraDePublico> {
  const material = materialDaLeitura(linhas, publico);
  const leitura = await roteador.rotear({
    tarefa: 'leitura_por_publico',
    material,
    publico,
    // Instrução de FORMA, nunca de conteúdo. O conteúdo é o material, e pedir
    // a um modelo que acrescente conteúdo é pedir que ele invente.
    instrucao:
      `Reescreva o material abaixo para ${ENQUADRAMENTO[publico]}. Não acrescente ` +
      'identificador nem número que não esteja no material. Não conclua nada que o ' +
      'material não sustente.'
  });
  return { publico, leitura };
}

/** As quatro leituras de um ciclo, na ordem declarada. */
export async function lerParaTodosOsPublicos(
  linhas: readonly LinhaDeResumo[],
  roteador: RoteadorDeFaculdades
): Promise<readonly LeituraDePublico[]> {
  const leituras: LeituraDePublico[] = [];
  for (const publico of PUBLICOS) {
    leituras.push(await lerParaPublico(publico, linhas, roteador));
  }
  return leituras;
}
