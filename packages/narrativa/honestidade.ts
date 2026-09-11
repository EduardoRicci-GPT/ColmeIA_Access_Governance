// ---------------------------------------------------------------------------
// GUARDA DE HONESTIDADE DE ESTADO — itens 4, 32 e 33
//
// "A IA não pode responder 'a porta está bloqueada' se o último estado for
//  UNKNOWN."
//
// Transformar essa frase em regra de engenharia exige notar por que a violação
// acontece. Ela não nasce de má-fé do modelo: nasce de uma assimetria de
// linguagem. "Revogação solicitada, sincronização pendente, última confirmação
// às 08:42, endpoint offline" é verdadeiro e custa quatro orações. "Acesso
// revogado" é falso e custa duas palavras. Toda pressão — de produto, de
// interface, de quem está com pressa — empurra para a segunda.
//
// Por isso a guarda não é uma instrução no prompt. É uma função que recebe o
// texto e o estado, e RECUSA a frase quando a evidência não a sustenta. Vale
// para texto gerado por modelo, para rótulo de interface e para mensagem de
// notificação — os três caminhos pelos quais a afirmação chegaria ao operador.
// ---------------------------------------------------------------------------

import { ConfiancaFisica, PhysicalReconciliationResult } from '../physical-state-reconciliation/tipos';
import { ROTULO_DE_ESTADO_FISICO } from '../dominio/estado';

export interface PadraoDeAfirmacao {
  id: string;
  /** Reconhece a afirmação categórica sobre o mundo físico. */
  padrao: RegExp;
  /** Confiança mínima que autoriza a frase. */
  exige: ConfiancaFisica;
  /** O que dizer no lugar, quando a evidência não basta. */
  substituicao: string;
}

/**
 * Afirmações categóricas sobre estado físico. São as frases que um operador
 * lê como fato consumado — e que, por isso, não podem sair sem evidência.
 */
export const AFIRMACOES_CATEGORICAS: readonly PadraoDeAfirmacao[] = Object.freeze([
  {
    id: 'PORTA_BLOQUEADA',
    padrao: /\b(a\s+)?porta\s+(est[áa]|foi)\s+(bloqueada|trancada|fechada)\b/i,
    exige: 'CONFIRMED',
    substituicao:
      'O sistema solicitou o bloqueio, mas ainda não recebeu confirmação física do endpoint.'
  },
  {
    id: 'ACESSO_REVOGADO',
    padrao: /\bacesso\s+(foi\s+)?revogad[oa]\b(?!\s+na\s+nuvem)/i,
    exige: 'CONFIRMED',
    substituicao:
      'A revogação foi registrada e aceita, e ainda aguarda confirmação do equipamento.'
  },
  {
    id: 'CREDENCIAL_REMOVIDA',
    padrao: /\bcredencial\s+(foi\s+)?(removida|apagada|exclu[íi]da)\s+do\s+equipamento\b/i,
    exige: 'CONFIRMED',
    substituicao: 'A remoção da credencial foi enviada; o equipamento ainda não confirmou.'
  },
  {
    id: 'ACESSO_LIBERADO',
    padrao: /\bacesso\s+(foi\s+)?liberad[oa]\s+(no|para\s+o)\s+equipamento\b/i,
    exige: 'CONFIRMED',
    substituicao: 'A liberação foi enviada ao equipamento e aguarda confirmação.'
  },
  {
    id: 'NINGUEM_ENTRA',
    padrao: /\bningu[ée]m\s+(consegue|pode)\s+entrar\b/i,
    exige: 'CONFIRMED',
    substituicao: 'Sem confirmação do equipamento, o sistema não pode afirmar quem consegue entrar.'
  },
  {
    id: 'TUDO_SINCRONIZADO',
    // O til de "estão" não é um "a" com acento: `[áa]` não o alcança. A classe
    // precisa cobrir as formas verbais reais do português, ou a guarda deixa
    // passar exatamente a frase mais comum.
    padrao: /\b(tudo|todos?\s+os\s+endpoints?)\s+(est[aáãà]o?\s+)?sincronizad[oa]s?\b/i,
    exige: 'CONFIRMED',
    substituicao: 'Há endpoints sem confirmação recente; a sincronização não pode ser dada por completa.'
  }
]);

export interface VeredictoDaGuarda {
  aceita: boolean;
  textoSeguro: string;
  violacoes: readonly string[];
}

/**
 * Aplica a guarda. Quando a evidência não sustenta a frase, o texto NÃO é
 * apenas rejeitado: é substituído pela formulação honesta. Rejeitar sem
 * oferecer alternativa empurraria o chamador de volta para o atalho.
 */
export function aplicarGuardaDeHonestidade(
  texto: string,
  confianca: ConfiancaFisica
): VeredictoDaGuarda {
  const violacoes: string[] = [];
  let resultado = texto;

  for (const afirmacao of AFIRMACOES_CATEGORICAS) {
    if (!afirmacao.padrao.test(resultado)) continue;
    if (confianca === afirmacao.exige) continue;
    violacoes.push(afirmacao.id);
    resultado = resultado.replace(afirmacao.padrao, afirmacao.substituicao);
  }

  return { aceita: violacoes.length === 0, textoSeguro: resultado, violacoes };
}

/**
 * Descrição determinística de um resultado de reconciliação física.
 *
 * Esta função é a fonte preferencial de texto operacional: ela não pode
 * alucinar porque não gera linguagem, apenas compõe fatos já apurados. O
 * modelo de linguagem entra depois, para resumir e priorizar — e o que ele
 * produz volta a passar pela guarda acima.
 */
export function descreverReconciliacao(resultado: PhysicalReconciliationResult): readonly string[] {
  const linhas: string[] = [];

  switch (resultado.estadoSemantico) {
    case 'DEVICE_REVOCATION_PENDING':
      linhas.push('Revogação solicitada');
      linhas.push('Sincronização pendente no dispositivo');
      break;
    case 'DEVICE_GRANT_PENDING':
      linhas.push('Concessão solicitada');
      linhas.push('Sincronização pendente no dispositivo');
      break;
    default:
      linhas.push(ROTULO_DE_ESTADO_FISICO[resultado.estadoSemantico]);
  }

  linhas.push(
    resultado.observedState === null
      ? 'Última confirmação: nenhuma até agora'
      : `Última confirmação: ${resultado.observedState}` +
        (resultado.minutosDesdeConfirmacao === null
          ? ''
          : ` (há ${Math.round(resultado.minutosDesdeConfirmacao)} min)`)
  );

  if (resultado.estadoSemantico === 'DEVICE_OFFLINE') {
    linhas.push('Endpoint atualmente offline');
  }

  linhas.push(`Confiança da leitura: ${rotuloDeConfianca(resultado.confidence)}`);
  linhas.push(`Risco: ${resultado.riskLevel}`);
  return linhas;
}

export function rotuloDeConfianca(confianca: ConfiancaFisica): string {
  switch (confianca) {
    case 'CONFIRMED':
      return 'confirmada pelo equipamento';
    case 'PROBABLE':
      return 'provável — evidência antiga ou equipamento degradado';
    case 'UNKNOWN':
      return 'desconhecida — o sistema não recebeu evidência';
  }
}
