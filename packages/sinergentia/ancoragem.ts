// ---------------------------------------------------------------------------
// VERIFICADOR DE ANCORAGEM — a prosa que inventa é descartada, não corrigida
//
// PORTE DE DOUTRINA, NÃO DE CÓDIGO
//
// O instrumento vem da Aletheia (`src/services/verificadorAncoragem.ts`), e o
// caso que o originou está registrado lá: o modelo recebeu a manchete "Lula diz
// que sugeriu a Trump encontro com Xi e Putin em resort na Flórida" e escreveu
// "em Mar-a-Lago". Mar-a-Lago não estava em lugar nenhum da fonte. O modelo não
// tinha como saber o nome de um resort que ninguém lhe contou.
//
// A ideia é a mesma aqui e é simples: nomes, números e identificadores são
// ÂNCORAS — ou estão na fonte, ou foram inventados. Não há terceira
// possibilidade. Verbos, adjetivos e conectivos NÃO são âncoras, porque
// reformular é o trabalho que se está pedindo.
//
// O QUE MUDA NESTA CASA, E POR QUÊ
//
// A versão da Aletheia carrega uma lista longa de palavras portuguesas que
// abrem frase sem serem nome próprio — "Paralelamente", "Ambos", "Vários" —,
// cada uma acrescentada depois de um falso positivo medido. Aquela lista é
// conhecimento caro e específico do domínio dela: prosa jornalística aberta.
//
// Aqui o domínio é outro e é mais estreito, e isso torna o instrumento mais
// afiado em vez de mais frouxo. Um resumo de governança de acesso ancora em
// duas classes, e só nelas: IDENTIFICADORES (`ep-farm-2`, `z-uti`,
// `VIDRO-00001`, `ESC-3`) e NÚMEROS (contagens, minutos, scores). Não há nome
// próprio livre a julgar — pessoa não entra em prosa deste produto, por decisão
// anterior (ADR-0007) —, então a lista de exceções portuguesas não é
// necessária, e copiá-la seria carregar acerto de outro campo sem a medição que
// o sustenta.
//
// O QUE ELE NÃO FAZ — e vale repetir com a origem
//
// Não julga se a prosa é boa, justa ou fiel ao sentido. Um texto pode não
// introduzir âncora nenhuma e ainda assim distorcer. O instrumento cobre UMA
// falha — a mais comum e a mais grave — e não se apresenta como mais.
//
// E não corrige. Reprovou, a prosa é DESCARTADA e o material determinístico é
// entregue no lugar dela. Corrigir prosa inventada exigiria saber o que o
// modelo quis dizer, o que é adivinhação; e devolveria ao produto um texto
// meio-inventado com aparência de conferido.
// ---------------------------------------------------------------------------

export type ClasseDeAncora = 'IDENTIFICADOR' | 'NUMERO';

export interface Ancora {
  texto: string;
  classe: ClasseDeAncora;
  /** Forma normalizada usada na comparação. */
  chave: string;
}

export interface ResultadoDaAncoragem {
  aprovada: boolean;
  /** Âncoras da prosa que não existem no material. É o motivo da reprovação. */
  introduzidas: readonly Ancora[];
  /** Quantas âncoras da prosa vieram do material. Mede aproveitamento, não mérito. */
  ancoradas: number;
  /** Frase determinística para a cadeia e para a tela. */
  explicacao: string;
}

function normalizar(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Identificador: duas ou mais partes ligadas por hífen, com letra em ambas as
 * pontas ou dígito no fim. É a forma que todo id deste produto tem —
 * `ep-farm-2`, `z-uti`, `vin-marina`, `VIDRO-00001`, `APROV-00007`.
 */
const IDENTIFICADOR = /\b[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+\b/g;

/**
 * Número com significado. Percentual incluído de propósito: é a invenção mais
 * frequente de um modelo a quem se pede resumo — "aproximadamente 40%" onde a
 * fonte dizia "3 de 10". Nenhum dos dois números está errado; o segundo é que
 * foi apurado.
 */
const NUMERO = /\b\d+(?:[.,]\d+)?\s*%?/g;

/**
 * Números que não denunciam invenção.
 *
 * `0` e `1` aparecem em prosa corrente ("uma zona", "nenhum caso") e reprovar
 * por causa deles transformaria o verificador em peneira — o defeito que a
 * origem nomeia ao manter a tabela de equivalências deliberadamente curta.
 * Qualquer outro número tem de vir do material.
 */
const NUMEROS_TOLERADOS = new Set(['0', '1']);

export function extrairAncoras(texto: string): readonly Ancora[] {
  const achadas = new Map<string, Ancora>();
  const guardar = (bruto: string, classe: ClasseDeAncora) => {
    const limpo = bruto.trim();
    const chave = normalizar(limpo);
    if (chave.length === 0) return;
    if (classe === 'NUMERO' && NUMEROS_TOLERADOS.has(chave)) return;
    if (!achadas.has(chave)) achadas.set(chave, { texto: limpo, classe, chave });
  };

  for (const achado of texto.matchAll(IDENTIFICADOR)) guardar(achado[0], 'IDENTIFICADOR');
  for (const achado of texto.matchAll(NUMERO)) guardar(achado[0], 'NUMERO');
  return [...achadas.values()];
}

/**
 * Confere a prosa contra o material que a originou.
 *
 * O material entra como texto, e não como objeto, de propósito: o que se
 * confere é o que a faculdade RECEBEU. Conferir contra a estrutura de origem
 * aprovaria uma prosa que cita um endpoint verdadeiro que ninguém mostrou ao
 * modelo — e nesse caso ele acertou por sorte, que é indistinguível de
 * invenção quando não se pode repetir.
 */
export function verificarAncoragem(prosa: string, material: string): ResultadoDaAncoragem {
  const daFonte = new Set(extrairAncoras(material).map((ancora) => ancora.chave));
  const daProsa = extrairAncoras(prosa);
  const introduzidas = daProsa.filter((ancora) => !daFonte.has(ancora.chave));
  const ancoradas = daProsa.length - introduzidas.length;

  if (introduzidas.length === 0) {
    return {
      aprovada: true,
      introduzidas: [],
      ancoradas,
      explicacao:
        `Prosa ancorada: ${ancoradas} âncora(s) conferida(s) contra o material, nenhuma ` +
        'introduzida. A conferência cobre identificadores e números; não julga se o texto ' +
        'é fiel ao sentido.'
    };
  }

  const lista = introduzidas.map((ancora) => `"${ancora.texto}" (${ancora.classe})`).join(', ');
  return {
    aprovada: false,
    introduzidas,
    ancoradas,
    explicacao:
      `Prosa DESCARTADA: introduziu ${introduzidas.length} âncora(s) ausente(s) do material — ` +
      `${lista}. O material determinístico foi entregue no lugar dela. Prosa inventada não ` +
      'se corrige: corrigir exigiria adivinhar o que se quis dizer, e devolveria um texto ' +
      'meio-inventado com aparência de conferido.'
  };
}
