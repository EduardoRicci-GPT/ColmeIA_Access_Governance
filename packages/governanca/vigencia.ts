// ---------------------------------------------------------------------------
// VIGÊNCIA DA APROVAÇÃO — o que o hash não protege
//
// O human-gate liga a aprovação ao HASH do material revisado, e isso resolve o
// ataque mais simples contra revisão humana: mostrar uma coisa e executar
// outra. Resolve, e só isso. Enquanto o material não muda, a aprovação vale
// PARA SEMPRE.
//
// Num hospital, "para sempre" é uma afirmação sobre o mundo que ninguém fez.
// A supervisora que libera o cofre de psicotrópicos às 02h40 aprova AQUELE
// plantão, sob aquela escala, com aquela equipe na casa. O material que ela
// revisou — pessoa, vínculo, papéis, criticidade, razão de política — pode
// continuar idêntico dezoito meses depois, e a aprovação dela continuaria
// abrindo a porta. Nada mudou, e por isso mesmo nada expirou: é a permanência
// que é o defeito, não a mudança.
//
// O PONTO DE CALIBRAGEM, QUE É O MESMO DO HEALTH SCORE
//
// Quanto dura uma aprovação é um número, e número neste produto tem estatuto.
// Nenhuma destas janelas foi medida contra a operação de um hospital real:
// todas ficam em SOMBRA, e a leitura sai com o aviso colado, como os pesos do
// score.
//
// A diferença — e ela é o que autoriza usar um valor em sombra aqui — está na
// DIREÇÃO do efeito. O peso do score move um número para cima ou para baixo, e
// por isso não sustenta decisão sozinho. Uma janela de vigência só FECHA:
// nunca concede acesso que não tenha sido aprovado, nunca estende aprovação
// nenhuma, e o único desfecho que ela produz é exigir que uma pessoa reveja.
// Errar para menos custa uma revisão a mais; a alternativa — não expirar —
// custa uma porta aberta por decisão que ninguém tomou hoje. É a mesma regra
// que governa o resto do produto: ausência de avaliação nunca autoriza.
// ---------------------------------------------------------------------------

import { RegistroDeCalibracao } from '../mpeh-kernel/calibration/registro';
import { ConstanteCalibrada } from '../mpeh-kernel/calibration/tipos';
import { Criticidade as CriticidadeDoGate } from '../mpeh-kernel/human-gate/tipos';

const CURADOR = 'Nível E — governança de acesso ColmeIA';
const VERIFICADO_EM = '2026-09-14';

/** Janelas em minutos, por criticidade do gate. */
export type JanelasDeVigencia = Record<CriticidadeDoGate, number>;

/**
 * Valores de partida.
 *
 * `CRITICA` é a única com procedência externa ao produto: doze horas é o turno
 * da escala 12×36, que a CLT reconhece no art. 59-A e que é o padrão de
 * enfermagem hospitalar no Brasil. A aprovação de um cofre de psicotrópicos
 * morre com o plantão que a pediu — que é o que uma supervisora entende por
 * "autorizei", sem precisar que ninguém explique.
 *
 * As outras três descem por proporção a partir dela, e essa proporção é
 * palpite declarado. É por isso que estão em sombra.
 */
export const JANELAS_PADRAO: JanelasDeVigencia = Object.freeze({
  CRITICA: 12 * 60,
  ALTA: 7 * 24 * 60,
  MEDIA: 30 * 24 * 60,
  BAIXA: 90 * 24 * 60
});

const RESSALVA_GERAL =
  'Janela derivada da prática de escala hospitalar, não de operação medida nesta ' +
  'instalação. Sobe de estatuto quando houver histórico de revisões e de acessos ' +
  'em porta aprovada para confrontá-la. Enquanto estiver em sombra, o efeito dela ' +
  'é apenas exigir nova revisão humana — nunca conceder acesso.';

function janela(
  id: CriticidadeDoGate,
  rotulo: string,
  procedencia: string,
  ressalva = RESSALVA_GERAL
): ConstanteCalibrada<number> {
  return {
    id: `aprovacao.vigencia.${id}`,
    rotulo,
    valor: JANELAS_PADRAO[id],
    estatuto: 'SOMBRA',
    procedencia,
    curador: CURADOR,
    verificadoEm: VERIFICADO_EM,
    ressalva
  };
}

export const CONSTANTES_DE_VIGENCIA: readonly ConstanteCalibrada<number>[] = Object.freeze([
  janela(
    'CRITICA',
    'Vigência de aprovação em endpoint de criticidade CRÍTICA',
    'Escala 12×36 da enfermagem hospitalar brasileira (CLT, art. 59-A): a aprovação ' +
      'expira com o plantão que a concedeu',
    RESSALVA_GERAL +
      ' Esta é a janela mais consequente do conjunto: alongá-la faz a aprovação de um ' +
      'plantão valer no seguinte, que é precisamente a situação em que ninguém revisou ' +
      'nada e a porta abre.'
  ),
  janela(
    'ALTA',
    'Vigência de aprovação em endpoint de criticidade ALTA',
    'Derivada da janela CRÍTICA por proporção semanal — palpite declarado, não medição'
  ),
  janela(
    'MEDIA',
    'Vigência de aprovação em endpoint de criticidade MÉDIA',
    'Derivada da janela CRÍTICA por proporção mensal — palpite declarado, não medição'
  ),
  janela(
    'BAIXA',
    'Vigência de aprovação em endpoint de criticidade BAIXA',
    'Derivada da janela CRÍTICA por proporção trimestral — palpite declarado, não medição'
  )
]);

/**
 * Registro exigindo INSTRUMENTADA para decidir — como o do Health Score.
 *
 * Todas as leituras caem em sombra por construção, e é deliberado: afrouxar
 * `exigidoParaDecidir` sem calibrar seria dar autoridade a um número por
 * conveniência, e o número aqui decide quando uma porta hospitalar para de
 * responder a uma aprovação antiga.
 */
export function registroDeVigencia(): RegistroDeCalibracao {
  return new RegistroDeCalibracao(CONSTANTES_DE_VIGENCIA);
}

export interface JanelasLidas {
  janelas: JanelasDeVigencia;
  /** Um aviso por janela abaixo de INSTRUMENTADA. */
  avisos: readonly string[];
  emSombra: boolean;
}

/**
 * Lê as janelas pela porta de sombra. Valor e aviso saem juntos, de modo que
 * quem exibe o prazo tem o texto na mão e escondê-lo passa a ser ato.
 */
export function lerJanelas(registro: RegistroDeCalibracao = registroDeVigencia()): JanelasLidas {
  const janelas: Record<string, number> = {};
  const avisos: string[] = [];
  let emSombra = false;

  for (const constante of CONSTANTES_DE_VIGENCIA) {
    const chave = constante.id.replace('aprovacao.vigencia.', '');
    const leitura = registro.obterEmSombra<number>(constante.id);
    janelas[chave] = leitura.valor;
    if (leitura.estatuto !== 'INSTRUMENTADA') {
      emSombra = true;
      avisos.push(leitura.aviso);
    }
  }

  return { janelas: janelas as unknown as JanelasDeVigencia, avisos, emSombra };
}

/** Frase curta para a fila de pendências, quando há janela em sombra. */
export function avisoDeVigenciaEmSombra(lidas: JanelasLidas): string | null {
  if (!lidas.emSombra) return null;
  return (
    `${lidas.avisos.length} das ${CONSTANTES_DE_VIGENCIA.length} janelas de vigência estão em ` +
    'SOMBRA: derivam da prática de escala hospitalar, não da operação medida aqui. ' +
    'Enquanto estiverem assim, elas só podem exigir nova revisão — nunca conceder acesso.'
  );
}

/**
 * O instante em que uma aprovação deixa de valer sozinha.
 *
 * Devolve `null` quando não há janela — e `null` aqui significa "não expira por
 * tempo", que é estado legítimo apenas se alguém tiver DECIDIDO isso. Por isso
 * a janela ausente não é o padrão: o padrão são as constantes acima.
 */
export function expiracaoDe(
  aprovadoEm: Date,
  criticidade: CriticidadeDoGate,
  janelas: JanelasDeVigencia = JANELAS_PADRAO
): Date | null {
  const minutos = janelas[criticidade];
  if (!Number.isFinite(minutos) || minutos <= 0) return null;
  return new Date(aprovadoEm.getTime() + minutos * 60_000);
}

/** Minutos restantes; negativo depois de vencida; `null` quando não expira. */
export function minutosRestantes(expiraEm: Date | null, agora: Date): number | null {
  if (expiraEm === null) return null;
  return (expiraEm.getTime() - agora.getTime()) / 60_000;
}
