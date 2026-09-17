// ---------------------------------------------------------------------------
// CALIBRAGEM DO HEALTH SCORE — os pesos ganham estatuto
//
// A primeira versão declarava os pesos assim:
//
//     export const PESOS_PADRAO = Object.freeze({ revogacaoPendente: 3, ... })
//
// O número estava lá, congelado, com cara de decisão tomada. E não era: era um
// palpite informado, escrito por quem implementou, sem dono, sem origem textual
// e sem nada que dissesse a quem lesse o painel que aquele −3 não tinha
// autoridade nenhuma.
//
// O pacote Calibration do MPE-H existe exatamente contra isso, e a frase que o
// governa é esta: "uma constante aqui não é um número — é um número mais o que
// se sabe sobre a sua autoridade."
//
// A consequência prática é dura e é o ponto: NENHUM peso deste produto está em
// INSTRUMENTADA. Todos estão em SOMBRA, porque nenhum foi calibrado contra a
// operação de um hospital real. O registro é montado exigindo INSTRUMENTADA
// para decidir, de modo que `obterParaDecisao` LANÇA para todos eles — e a
// única leitura possível é `obterEmSombra`, que entrega o valor junto do aviso.
//
// O efeito no produto: o Health Score continua sendo calculado e continua
// sendo útil, e a tela é obrigada a dizer que os pesos ainda não foram
// ratificados. É a mesma disciplina que mantém o I²E em sombra na Aletheia,
// aplicada aqui — e é o que impede que um número saia da bancada parecendo
// medida.
// ---------------------------------------------------------------------------

import { RegistroDeCalibracao } from '../mpeh-kernel/calibration/registro';
import { ConstanteCalibrada } from '../mpeh-kernel/calibration/tipos';
import { PesosDeHealth, PESOS_PADRAO } from './health';

const CURADOR = 'Nível E — governança de acesso ColmeIA';
const VERIFICADO_EM = '2026-09-11';

const RESSALVA_GERAL =
  'Peso derivado da intenção declarada na especificação, não de operação medida. ' +
  'Reproduz o exemplo do item 7 (87/100), o que prova coerência com a intenção — ' +
  'não que o valor esteja certo para uma instalação específica. ' +
  'Sobe de estatuto quando for calibrado contra a operação de um hospital real.';

function peso(
  id: keyof PesosDeHealth,
  rotulo: string,
  procedencia: string,
  ressalva = RESSALVA_GERAL
): ConstanteCalibrada<number> {
  return {
    id: `health.peso.${id}`,
    rotulo,
    valor: PESOS_PADRAO[id],
    estatuto: 'SOMBRA',
    procedencia,
    curador: CURADOR,
    verificadoEm: VERIFICADO_EM,
    ressalva
  };
}

export const CONSTANTES_DO_HEALTH: readonly ConstanteCalibrada<number>[] = Object.freeze([
  peso(
    'disponibilidadeEndpoints',
    'Penalidade máxima por indisponibilidade de endpoints',
    'Especificação ColmeIA Access Governance, item 7 — exemplo "−5: 2 endpoints offline"'
  ),
  peso(
    'degradacaoEndpoints',
    'Penalidade máxima por endpoints degradados',
    'Derivado do item 7 por proporção à disponibilidade'
  ),
  peso(
    'gatewayOffline',
    'Penalidade por gateway sem comunicação',
    'Especificação, item 28 — "MEDIUM: gateway degradado"'
  ),
  peso(
    'provedorIndisponivel',
    'Penalidade por provedor indisponível',
    'Especificação, item 5 — provider availability entre os monitorados'
  ),
  peso(
    'revogacaoPendente',
    'Penalidade por revogação pendente de confirmação física',
    'Especificação, item 7 — exemplo "−3: 1 revogação pendente"',
    RESSALVA_GERAL +
      ' Este é o peso mais sensível do conjunto: ele traduz em número a frase do item 41, ' +
      'e uma calibragem baixa demais faria o painel esverdear sobre porta aberta.'
  ),
  peso(
    'sincronizacaoPendente',
    'Penalidade por sincronização pendente',
    'Especificação, item 7 — "pendingSynchronizations" entre os componentes'
  ),
  peso(
    'estadoNaoReconciliado',
    'Penalidade por estado sem evidência física',
    'Especificação, item 7 — "unreconciledStates" entre os componentes'
  ),
  peso(
    'conflitoDePolitica',
    'Penalidade por conflito de política',
    'Especificação, item 7 — exemplo "−3: conflito de política"'
  ),
  peso(
    'latenciaAnomala',
    'Penalidade por latência anômala',
    'Especificação, item 7 — exemplo "−2: latência anormal"'
  ),
  peso(
    'credencialObsoleta',
    'Penalidade por credencial sem confirmação recente',
    'Especificação, item 5 — "credential drift" entre os monitorados'
  ),
  peso(
    'bateriaCritica',
    'Penalidade por bateria crítica',
    'Especificação, item 5 — "battery condition" entre os monitorados'
  ),
  peso(
    'desvioDeRelogio',
    'Penalidade por desvio de relógio',
    'Especificação, item 5 — "clock drift" entre os monitorados'
  ),
  peso(
    'revisaoDeEmergenciaPendente',
    'Penalidade por quebra de vidro sem a revisão obrigatória',
    'ADR-0023 — a exceção se paga com prestação de contas posterior; derivado da ' +
      'revogação pendente e posto ABAIXO dela, porque a porta desta já fechou',
    RESSALVA_GERAL +
      ' A direção deste peso é a que merece atenção na calibragem: ele cobra a CONTA em ' +
      'aberto, nunca o ato de quebrar o vidro. Um peso que penalizasse a invocação criaria ' +
      'pressão para não invocar — e quem não pode quebrar o vidro escora a porta, empresta ' +
      'o crachá ou arromba o armário, sem registro nenhum.'
  ),
  peso(
    'emergenciaRecorrente',
    'Penalidade por repetição de quebra de vidro na mesma zona',
    'ADR-0025 — repetição como sintoma de modelo de acesso inadequado à zona, não como ' +
      'antecedente de quem invocou',
    RESSALVA_GERAL +
      ' O achado é sobre o DESENHO da organização — escala que não fecha, política que pede ' +
      'duas assinaturas onde nunca há duas pessoas. Julgar abuso continua sendo jurisdição ' +
      'humana, e o score não acusa ninguém.'
  )
]);

/**
 * Registro exigindo INSTRUMENTADA para decidir.
 *
 * É deliberado que TODAS as leituras caiam em sombra: o afrouxamento existe no
 * kernel (`exigidoParaDecidir`) e é ato explícito de quem monta o registro.
 * Aqui ele não é usado, porque afrouxar sem calibrar seria dar autoridade a um
 * número por conveniência.
 */
export function registroDoHealth(): RegistroDeCalibracao {
  return new RegistroDeCalibracao(CONSTANTES_DO_HEALTH);
}

export interface PesosLidos {
  pesos: PesosDeHealth;
  /** Um aviso por peso, com estatuto, ressalva e procedência. */
  avisos: readonly string[];
  /** Verdadeiro enquanto houver peso abaixo de INSTRUMENTADA. */
  emSombra: boolean;
}

/**
 * Lê os pesos pela porta de sombra. O valor e o aviso saem juntos, e é essa
 * estrutura de retorno que impede o aviso de ser esquecido: quem exibe o
 * número tem o texto na mão, e escondê-lo passa a ser ato.
 */
export function lerPesos(registro: RegistroDeCalibracao = registroDoHealth()): PesosLidos {
  const pesos: Record<string, number> = {};
  const avisos: string[] = [];
  let emSombra = false;

  for (const constante of CONSTANTES_DO_HEALTH) {
    const chave = constante.id.replace('health.peso.', '');
    const leitura = registro.obterEmSombra<number>(constante.id);
    pesos[chave] = leitura.valor;
    if (leitura.estatuto !== 'INSTRUMENTADA') {
      emSombra = true;
      avisos.push(leitura.aviso);
    }
  }

  return { pesos: pesos as unknown as PesosDeHealth, avisos, emSombra };
}

/** Frase curta para o alto da tela, quando há peso em sombra. */
export function avisoDeSombra(lidos: PesosLidos): string | null {
  if (!lidos.emSombra) return null;
  const quantos = lidos.avisos.length;
  return (
    `${quantos} dos ${CONSTANTES_DO_HEALTH.length} pesos deste score estão em SOMBRA: ` +
    'derivam da intenção declarada na especificação, não de operação medida. ' +
    'O número orienta prioridade; ainda não sustenta decisão sozinho.'
  );
}
