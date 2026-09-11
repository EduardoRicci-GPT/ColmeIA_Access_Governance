// ---------------------------------------------------------------------------
// FILTRO ZERO APLICADO AO ACESSO
//
//   "Quem é afetado pelo que estou prestes a fazer — e o que genuinamente
//    precisam?"
//
// Não é etapa do ciclo: é pré-condição de entrada, anterior a tudo, e orienta o
// tipo de expansão que vai acontecer. Um ciclo iniciado sem ela é executável e
// não é MPE — é a forma sem o conteúdo.
//
// Aplicado a controle de acesso, o Filtro Zero corrige um viés que a
// especificação inteira carrega sem nomear: TODO o sistema está desenhado
// contra o risco de SOBRAR direito. Revogação pendente, porta que ainda abre,
// credencial órfã — tudo aponta para o mesmo medo, que é legítimo e é metade.
//
// A outra metade aparece quando se pergunta quem é afetado. Numa UTI, FALTAR
// direito não é um telefonema: é uma porta que não abre para quem precisa
// entrar correndo. O sistema que só mede acesso indevido otimiza contra um dos
// dois erros e fica cego para o outro — e o outro mata mais rápido.
//
// Por isso este módulo existe, e por isso ele olha para COBERTURA, que é a
// pergunta que nenhuma tabela de regras faz.
// ---------------------------------------------------------------------------

import { Criticidade } from '../dominio/topologia';

export const FILTRO_ZERO = Object.freeze({
  pergunta: 'Quem é afetado pelo que estou prestes a fazer — e o que genuinamente precisam?',
  naoE:
    'não o que o operador acha que precisam; não o que o protocolo diz que precisam; ' +
    'não o que é mais conveniente que precisem',
  estatuto: 'pré-condição de entrada, não etapa do ciclo',
  noAcesso:
    'os afetados por uma decisão de acesso não são só quem está na porta: são os pacientes ' +
    'da zona, a equipe que depende daquela porta abrir, e quem responde pela área',
  origem: 'genoma/instrumentos.py :: FILTRO_ZERO, via src/services/contratosEstruturais.ts da Aletheia'
});

/** Quem é afetado por uma decisão de acesso, e o que precisa. */
export interface AfetadosPelaDecisao {
  /** Quem perde ou ganha o direito. */
  pessoas: readonly string[];
  /** Zonas cujo acesso muda. */
  zonas: readonly string[];
  /** Zonas de cuidado onde faltar acesso tem consequência física. */
  zonasDeCuidado: readonly string[];
  /** O que essas pessoas genuinamente precisam, declarado. */
  necessidade: string;
}

export interface ResultadoFiltroZero {
  respondido: boolean;
  afetados?: AfetadosPelaDecisao;
  /** Por que a pré-condição não foi satisfeita, quando não foi. */
  falta?: string;
}

/**
 * A pré-condição. Fail-closed: sem declaração de quem é afetado, não passa.
 *
 * Note o que ela NÃO faz: não julga se a decisão é boa. Ela só se recusa a
 * deixar o ciclo começar sobre uma pergunta não feita.
 */
export function verificarFiltroZero(afetados?: Partial<AfetadosPelaDecisao> | null): ResultadoFiltroZero {
  if (!afetados) {
    return { respondido: false, falta: 'ninguém declarou quem é afetado por esta decisão de acesso' };
  }
  if (!afetados.necessidade || afetados.necessidade.trim() === '') {
    return {
      respondido: false,
      falta: 'os afetados foram listados, mas não o que genuinamente precisam'
    };
  }
  if ((afetados.pessoas?.length ?? 0) === 0 && (afetados.zonas?.length ?? 0) === 0) {
    return { respondido: false, falta: 'a lista de afetados está vazia' };
  }
  return {
    respondido: true,
    afetados: {
      pessoas: afetados.pessoas ?? [],
      zonas: afetados.zonas ?? [],
      zonasDeCuidado: afetados.zonasDeCuidado ?? [],
      necessidade: afetados.necessidade
    }
  };
}

/**
 * Zonas onde faltar acesso tem consequência física, e não administrativa.
 *
 * A classificação é por CRITICIDADE porque é o que a instalação já configurou —
 * mas a leitura é invertida em relação ao resto do sistema. No motor físico,
 * criticidade alta agrava o risco de SOBRAR direito. Aqui, agrava o risco de
 * FALTAR. É o mesmo dado servindo a dois medos opostos, e o sistema precisa
 * saber os dois.
 */
export function zonaDeCuidado(criticidade: Criticidade): boolean {
  return criticidade === 'HIGH' || criticidade === 'CRITICAL';
}
