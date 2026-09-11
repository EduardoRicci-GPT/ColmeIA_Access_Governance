// ---------------------------------------------------------------------------
// O FREIO DA PARCERIA, APLICADO AO ACESSO
//
//   "deve ser o risco de consequências físicas, principalmente graves ou de
//    morte, que deve ser o freio da decisão da IA"
//   "ao frear, a decisão passa a quem vai assumir as responsabilidades das
//    consequências"
//
// Porte semântico de `genoma/parceria.py :: avaliar_acao`, via
// `src/services/contratosEstruturais.ts` da Aletheia.
//
// A DECISÃO DE PROJETO QUE ESTE ARQUIVO CARREGA, E QUE MERECE DISCUSSÃO
//
// Quando uma revogação em lote deixaria uma UTI sem ninguém com acesso ativo, o
// freio dispara. A pergunta seguinte é o que fazer com a revogação, e as duas
// respostas óbvias estão erradas:
//
//   · SEGURAR a revogação deixaria alguém desligado com acesso à UTI. O sistema
//     estaria cometendo, em silêncio, exatamente a falha de segurança que existe
//     para impedir.
//   · REVOGAR e seguir em frente deixaria a unidade descoberta sem que ninguém
//     soubesse até a próxima emergência.
//
// A leitura do freio resolve: o que ele transfere ao humano é a DECISÃO, não a
// execução da segurança. Então a revogação SEGUE — e a lacuna de cobertura vira
// caso escalado, com severidade, nome da zona e prazo. O freio não bloqueia a
// ação; bloqueia o SILÊNCIO sobre ela.
//
// "A presença não termina no acionamento — termina na transferência."
// ---------------------------------------------------------------------------

import { Criticidade } from '../dominio/topologia';
import { AfetadosPelaDecisao, ResultadoFiltroZero, zonaDeCuidado } from './filtro-zero';

export const O_FREIO = Object.freeze({
  criterio: 'a dor — física ou emocional — que a ação pode causar ao humano',
  citacaoDoAutor:
    'deve ser o risco de consequências físicas, principalmente graves ou de morte, ' +
    'que deve ser o freio da decisão da IA',
  aoFrear: 'a decisão passa a quem vai assumir as responsabilidades das consequências',
  noAcesso:
    'uma zona de cuidado sem ninguém com acesso ativo é risco de consequência física: ' +
    'a porta não abre para quem precisa entrar correndo'
});

export const O_INSTINTO = Object.freeze({
  citacao: 'o instinto deve servir como aviso e atenção, mas nunca como freio',
  regraOperacional: 'instinto pondera; não bloqueia'
});

export type DecisaoDoFreio = 'segue' | 'freia' | 'nao_avaliada';

export interface AvaliacaoDoFreio {
  decisao: DecisaoDoFreio;
  motivo: string;
  transfereParaHumano: boolean;
}

/**
 * O freio genérico. Fail-closed: risco não avaliado NUNCA autoriza.
 *
 * Porte literal da semântica de `avaliar_acao`. O sinal de instinto acompanha
 * como aviso e não freia — um gate que freasse por instinto produziria
 * paralisia analítica.
 */
export function avaliarAcao(params: {
  riscoDeDorFisica?: boolean | null;
  riscoDeDorEmocional?: boolean | null;
  sinalDeInstinto?: boolean;
}): AvaliacaoDoFreio {
  const { riscoDeDorFisica = null, riscoDeDorEmocional = null, sinalDeInstinto = false } = params;
  const aviso = sinalDeInstinto ? ' Sinal de instinto ativo: aviso e atenção, buscar alternativas.' : '';

  if (riscoDeDorFisica === null || riscoDeDorEmocional === null) {
    return {
      decisao: 'nao_avaliada',
      motivo: 'risco de dor não avaliado — a ação não segue sobre ausência de avaliação.' + aviso,
      transfereParaHumano: true
    };
  }
  if (riscoDeDorFisica) {
    return {
      decisao: 'freia',
      motivo: 'risco de consequência física — a decisão pertence a quem assume a consequência.' + aviso,
      transfereParaHumano: true
    };
  }
  if (riscoDeDorEmocional) {
    return {
      decisao: 'freia',
      motivo: 'risco de dor emocional ao humano — pesar e transferir a decisão.' + aviso,
      transfereParaHumano: true
    };
  }
  return { decisao: 'segue', motivo: 'sem risco de dor declarado.' + aviso, transfereParaHumano: false };
}

export interface CoberturaDeZona {
  zonaId: string;
  nome: string;
  criticidade: Criticidade;
  pessoasComAcessoAntes: number;
  pessoasComAcessoDepois: number;
  ficaSemCobertura: boolean;
  ehZonaDeCuidado: boolean;
}

export interface EntradaDoFreioDeAcesso {
  /** Cobertura por zona, antes e depois do lote de ações. */
  cobertura: readonly CoberturaDeZona[];
  filtroZero: ResultadoFiltroZero;
  /** Sinal de atenção que NÃO freia — oscilação de rede, feriado, etc. */
  sinalDeInstinto?: boolean;
}

export interface AvaliacaoDoFreioDeAcesso extends AvaliacaoDoFreio {
  /** Zonas de cuidado que ficariam sem ninguém. */
  zonasDescobertas: readonly CoberturaDeZona[];
  /** A revogação segue mesmo quando o freio dispara. Ver o cabeçalho. */
  revogacaoProssegue: boolean;
  afetados?: AfetadosPelaDecisao;
}

/**
 * Avalia um lote de mudanças de direito contra o risco de descobrir uma zona.
 *
 * Fail-closed em dois pontos: sem Filtro Zero respondido, `nao_avaliada`; sem
 * dados de cobertura, idem. A ausência de avaliação nunca autoriza — mas
 * também nunca segura a revogação, pelo motivo do cabeçalho.
 */
export function avaliarLoteDeAcesso(entrada: EntradaDoFreioDeAcesso): AvaliacaoDoFreioDeAcesso {
  if (!entrada.filtroZero.respondido) {
    return {
      decisao: 'nao_avaliada',
      motivo: `Filtro Zero não respondido: ${entrada.filtroZero.falta}. O ciclo roda, e a lacuna fica registrada.`,
      transfereParaHumano: true,
      zonasDescobertas: [],
      revogacaoProssegue: true
    };
  }

  const descobertas = entrada.cobertura.filter(
    (zona) => zona.ehZonaDeCuidado && zona.ficaSemCobertura && zona.pessoasComAcessoAntes > 0
  );

  const base = avaliarAcao({
    riscoDeDorFisica: descobertas.length > 0,
    riscoDeDorEmocional: false,
    sinalDeInstinto: entrada.sinalDeInstinto
  });

  if (descobertas.length === 0) {
    return {
      ...base,
      motivo: 'Nenhuma zona de cuidado fica sem cobertura por este lote.' +
        (entrada.sinalDeInstinto ? ' Sinal de instinto ativo: aviso e atenção.' : ''),
      zonasDescobertas: [],
      revogacaoProssegue: true,
      afetados: entrada.filtroZero.afetados
    };
  }

  const nomes = descobertas.map((zona) => `${zona.nome} (${zona.criticidade})`).join(', ');
  return {
    ...base,
    motivo:
      `Este lote deixaria ${descobertas.length} zona(s) de cuidado sem ninguém com acesso ativo: ${nomes}. ` +
      'A revogação segue — segurar acesso de quem foi desligado seria a falha oposta —, ' +
      'e a decisão sobre a cobertura passa a quem responde pela escala.',
    zonasDescobertas: descobertas,
    revogacaoProssegue: true,
    afetados: entrada.filtroZero.afetados
  };
}

/** Monta a leitura de cobertura a partir de contagens por zona. */
export function montarCobertura(params: {
  zonaId: string;
  nome: string;
  criticidade: Criticidade;
  antes: number;
  depois: number;
}): CoberturaDeZona {
  return {
    zonaId: params.zonaId,
    nome: params.nome,
    criticidade: params.criticidade,
    pessoasComAcessoAntes: params.antes,
    pessoasComAcessoDepois: params.depois,
    ficaSemCobertura: params.depois === 0,
    ehZonaDeCuidado: zonaDeCuidado(params.criticidade)
  };
}
