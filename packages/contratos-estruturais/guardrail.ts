// ---------------------------------------------------------------------------
// GUARDRAIL ESTRUTURAL — o segundo canal, aplicado à política de acesso
//
// PORTE, não espelho. O original vive em `src/services/guardrailEstrutural.ts`
// da Aletheia, que por sua vez é porte de `k3lab/structural_guardrail.py` do
// Sinergentia³. Copiá-lo bit-a-bit para cá foi tentado e recusado: ele não
// compila sob a configuração estrita deste produto (`leiaAssim` pode conter
// `undefined` pelo tipo, embora não possa na prática), e editar espelho é
// justamente o que o manifesto proíbe.
//
// Em vez de afrouxar a configuração ou violar a regra do espelho, o porte vem
// com PROVA: `testes/guardrail-diferencial.ts` roda este código e o da origem
// sobre o mesmo corpus e exige resultado idêntico. É a mesma disciplina que a
// Aletheia aplica entre o `.ts` e o `.py` selado — o porte não substitui o
// original, presta contas a ele.
//
// POR QUE ESTE CANAL IMPORTA PARA ACESSO
//
// O R-VEP é lexical e numérico: conta densidade de sinais e produz I²E. Este é
// RELACIONAL e não-numérico: lê quem manda, quem pode recusar, quem fica
// isento. Aplicado a uma política de acesso, ele responde a uma pergunta que
// nenhuma tabela de regras responde —
//
//   esta política concede acesso, ou impõe obediência?
//
// Uma norma que manda liberar, proíbe recusar e isenta quem a escreveu tem a
// mesma forma de uma captura, independentemente de quão razoável seja o texto.
// E, por não ter limiar, este canal NÃO depende de calibragem ratificada:
// opera agora, enquanto os pesos do Health Score seguem em sombra.
//
// Livro XII, T-L12-037: "número substitui julgamento → não conformidade".
// Este canal entrega julgamento estrutural nomeado, não um número.
// ---------------------------------------------------------------------------

/** Caracteres invisíveis usados para burlar detecção por padrão. */
function ignoravel(c: string): boolean {
  const cp = c.codePointAt(0)!;
  return (
    /\p{Cf}/u.test(c) ||
    c === '͏' ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef)
  );
}

/**
 * NFKC → remove invisíveis → NFC → minúsculas → espaços colapsados.
 * Sem isto, "obedeça" com um seletor de variação no meio escapa do padrão.
 */
export function normalizar(texto: string): string {
  const compativel = texto.normalize('NFKC');
  let visivel = '';
  for (const c of compativel) if (!ignoravel(c)) visivel += c;
  return visivel.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

const PROTECTION = /para sua seguran[çc]a|pelo bem comum|for your safety|common good/i;
const DIRECTIVE = /\b(obede[çc]a|aceite|cumpra|obey|accept|comply)\b/i;
const SANCTIONED_DISSENT =
  /(quem|qualquer pessoa que|anyone who)[\s\S]{0,60}(discord|question|contest)[\s\S]{0,60}(punid|san[çc][ãa]o|perder[áa]|punish|penalt|lose access)/i;
const NO_REFUSAL = /n[ãa]o pode recusar|sem direito de recusar|cannot refuse|may not refuse/i;
const CONSTRAINED_CHOICE =
  /(alternativas?|alternatives?)[\s\S]{0,35}(n[ãa]o (ser|ser[ãa]o) apresent|n[ãa]o [\s\S]*divulg|not be disclosed|need not be disclosed)|[úu]nica escolha permitida|only permitted choice|only choice allowed/i;
const SELF_EXEMPTION =
  /(regra|rule)[\s\S]{0,45}(todos|everyone)[\s\S]{0,35}(exceto|except)[\s\S]{0,35}(dire[çc][ãa]o|lideran[çc]a|leadership|management)|(dire[çc][ãa]o|lideran[çc]a|leadership|management)[\s\S]{0,80}(revisa sozinha|alone reviews|dispensar evid[êe]ncias|exempt from evidence)/i;
const FREE_REFUSAL = /(pode|p[ôo]de|may|can)[\s\S]{0,25}recusar[\s\S]{0,30}(sem puni[çc][ãa]o|without penalty)/i;
const FREE_DISSENT =
  /(pode|may|can)[\s\S]{0,25}(discord|question|contest)[\s\S]{0,40}(sem (sofrer )?san[çc][ãa]o|sem puni[çc][ãa]o|without penalty)|(discord|question|contest)[\s\S]{0,25}(pode|may|can)[\s\S]{0,40}(sem (sofrer )?san[çc][ãa]o|sem puni[çc][ãa]o|without penalty)/i;
const DISCLOSED_ALTERNATIVES =
  /alternativas?[\s\S]{0,35}(apresentad|divulgad)|alternatives?[\s\S]{0,35}(disclosed|presented)/i;
const INDEPENDENT_REVIEW = /revis[ãa]o independente|independent review/i;
const DELIBERATION_TIME =
  /(pedir|receber|ter|asked for|has|given)[\s\S]{0,25}(tempo|time)[\s\S]{0,20}(decidir|decide)?/i;

export type SinalEstrutural =
  | 'DIRECTIVE_WITH_SANCTION_OR_NO_REFUSAL'
  | 'SANCTIONED_DISSENT'
  | 'REFUSAL_PROHIBITED'
  | 'CONSTRAINED_CHOICE'
  | 'PROTECTION_JUSTIFIES_CONSTRAINT'
  | 'DECIDER_SELF_EXEMPTION';

export type SalvaguardaEstrutural =
  | 'FREE_REFUSAL_WITHOUT_PENALTY'
  | 'DISSENT_WITHOUT_PENALTY'
  | 'ALTERNATIVES_DISCLOSED'
  | 'INDEPENDENT_REVIEW'
  | 'DELIBERATION_TIME';

export interface AuditoriaEstrutural {
  sinais: SinalEstrutural[];
  salvaguardas: SalvaguardaEstrutural[];
  conflitos: string[];
  exigeRevisaoHumana: boolean;
  /** Deliberadamente nulo: este canal não pontua. */
  scoreNumerico: null;
  modo: 'SHADOW_STRUCTURAL_GUARDRAIL';
}

/** Rótulos legíveis. O usuário lê a relação, não a sigla. */
export const DESCRICAO_SINAL: Record<SinalEstrutural, string> = {
  DIRECTIVE_WITH_SANCTION_OR_NO_REFUSAL: 'manda fazer, e recusar custa caro ou é proibido',
  SANCTIONED_DISSENT: 'quem discorda sofre consequência',
  REFUSAL_PROHIBITED: 'recusar não é opção oferecida',
  CONSTRAINED_CHOICE: 'as alternativas não são apresentadas',
  PROTECTION_JUSTIFIES_CONSTRAINT: 'a proteção é usada para justificar a restrição',
  DECIDER_SELF_EXEMPTION: 'quem decide se isenta da própria regra'
};

export const DESCRICAO_SALVAGUARDA: Record<SalvaguardaEstrutural, string> = {
  FREE_REFUSAL_WITHOUT_PENALTY: 'recusar é possível, sem punição',
  DISSENT_WITHOUT_PENALTY: 'discordar é possível, sem sanção',
  ALTERNATIVES_DISCLOSED: 'as alternativas são apresentadas',
  INDEPENDENT_REVIEW: 'há revisão independente',
  DELIBERATION_TIME: 'há tempo para decidir'
};

/**
 * Audita a estrutura relacional do texto.
 * Lança em texto vazio — não analisa ausência, do mesmo modo que o radar.
 */
export function auditarEstrutura(texto: string): AuditoriaEstrutural {
  if (!texto || !texto.trim()) throw new Error('texto é obrigatório');
  const n = normalizar(texto);

  const sinais: SinalEstrutural[] = [];
  const salvaguardas: SalvaguardaEstrutural[] = [];

  const dissensoLivre = FREE_DISSENT.test(n);
  // Dissenso sancionado só conta se NÃO houver dissenso livre no mesmo texto:
  // um texto que diz "pode discordar sem punição" não é o que pune quem discorda.
  const dissensoSancionado = SANCTIONED_DISSENT.test(n) && !dissensoLivre;

  if (DIRECTIVE.test(n) && (dissensoSancionado || NO_REFUSAL.test(n))) {
    sinais.push('DIRECTIVE_WITH_SANCTION_OR_NO_REFUSAL');
  }
  if (dissensoSancionado) sinais.push('SANCTIONED_DISSENT');
  if (NO_REFUSAL.test(n)) sinais.push('REFUSAL_PROHIBITED');
  if (CONSTRAINED_CHOICE.test(n)) sinais.push('CONSTRAINED_CHOICE');
  if (PROTECTION.test(n) && (CONSTRAINED_CHOICE.test(n) || DIRECTIVE.test(n))) {
    sinais.push('PROTECTION_JUSTIFIES_CONSTRAINT');
  }
  if (SELF_EXEMPTION.test(n)) sinais.push('DECIDER_SELF_EXEMPTION');

  if (FREE_REFUSAL.test(n)) salvaguardas.push('FREE_REFUSAL_WITHOUT_PENALTY');
  if (dissensoLivre) salvaguardas.push('DISSENT_WITHOUT_PENALTY');
  if (DISCLOSED_ALTERNATIVES.test(n) && !CONSTRAINED_CHOICE.test(n)) {
    salvaguardas.push('ALTERNATIVES_DISCLOSED');
  }
  if (INDEPENDENT_REVIEW.test(n)) salvaguardas.push('INDEPENDENT_REVIEW');
  if (DELIBERATION_TIME.test(n)) salvaguardas.push('DELIBERATION_TIME');

  const conflitos: string[] = [];
  if (sinais.length && salvaguardas.length) conflitos.push('CONSTRAINT_AND_SAFEGUARD_COEXIST');

  return {
    sinais: [...new Set(sinais)],
    salvaguardas: [...new Set(salvaguardas)],
    conflitos,
    exigeRevisaoHumana: sinais.length > 0,
    scoreNumerico: null,
    modo: 'SHADOW_STRUCTURAL_GUARDRAIL'
  };
}

// ---------------------------------------------------------------------------
// COMBINAÇÃO DOS DOIS CANAIS DETERMINÍSTICOS
// Porte de k3lab/hybrid_audit.py :: combine_shadow_audit
// ---------------------------------------------------------------------------

export interface DiscordanciaDeCanais {
  discordancias: string[];
  exigeRevisaoHumana: boolean;
  modo: 'SHADOW_DUAL_CHANNEL';
  /** Explicação legível de cada discordância. */
  leiaAssim: string[];
}

const EXPLICA: Record<string, string> = {
  LEGACY_NEUTRAL_WITH_STRUCTURAL_CONSTRAINT:
    'O radar lexical não viu pressão, mas a estrutura da relação impõe restrição. Texto calmo pode carregar coerção.',
  LEGACY_FREE_WITH_STRUCTURAL_CONSTRAINT:
    'O radar concluiu que o leitor sai mais livre, mas há restrição estrutural no texto. Vale reler.',
  LEXICAL_PRESSURE_WITH_SAFEGUARD_CONTEXT:
    'Há pressão lexical, mas o texto também oferece salvaguardas. Pressão com saída não é o mesmo que captura.'
};

/**
 * Combina o canal lexical (R-VEP) com o estrutural e NOMEIA as discordâncias.
 * Nenhum canal vence o outro — a discordância é o dado.
 */
export function combinarCanais(params: {
  riskLevel: string;
  finalFreedomTest: string;
  i2e: number;
  estrutural: AuditoriaEstrutural;
}): DiscordanciaDeCanais {
  const { riskLevel, finalFreedomTest, i2e, estrutural } = params;
  const d: string[] = [];

  if (estrutural.exigeRevisaoHumana && riskLevel === 'neutro') {
    d.push('LEGACY_NEUTRAL_WITH_STRUCTURAL_CONSTRAINT');
  }
  if (estrutural.exigeRevisaoHumana && finalFreedomTest === 'MAIS LIVRE') {
    d.push('LEGACY_FREE_WITH_STRUCTURAL_CONSTRAINT');
  }
  if (estrutural.salvaguardas.length > 0 && typeof i2e === 'number' && i2e > 0) {
    d.push('LEXICAL_PRESSURE_WITH_SAFEGUARD_CONTEXT');
  }

  return {
    discordancias: d,
    exigeRevisaoHumana: estrutural.exigeRevisaoHumana || d.length > 0,
    modo: 'SHADOW_DUAL_CHANNEL',
    // A origem escreve `d.map((x) => EXPLICA[x]).filter(Boolean)`, cujo tipo é
    // `(string | undefined)[]`. Na prática não há discordância sem explicação —
    // mas o tipo admite, e sob `noUncheckedIndexedAccess` isso não passa. O
    // filtro tipado abaixo produz o MESMO resultado em tempo de execução, o que
    // o teste diferencial confere.
    leiaAssim: d
      .map((x) => EXPLICA[x])
      .filter((texto): texto is string => typeof texto === 'string')
  };
}
