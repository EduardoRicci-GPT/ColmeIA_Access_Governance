// ---------------------------------------------------------------------------
// A LÓGICA DA CADEIA — funções puras, sem estado e sem armazenamento
//
// Este arquivo é o que precisa ser reimplementável fora do TypeScript. Um
// auditor com o JSON exportado e uma implementação de SHA-256 tem de chegar ao
// mesmo veredito que nós — senão a cadeia não é verificável, é só nossa.
//
// Por isso o conteúdo canônico é fixado aqui, em ordem estável e explícita, e
// não por `JSON.stringify(objeto)` sobre o evento inteiro: a ordem das chaves
// passaria a depender de como o objeto foi construído, e o hash mudaria sem
// que nada de substantivo mudasse.
// ---------------------------------------------------------------------------

import type { EventoLedger, VerdictoDeIntegridade } from './tipos';

/** Evento sem o próprio hash — o que entra no cálculo. */
export type EventoSemHash<T extends string = string> = Omit<EventoLedger<T>, 'thisEventHash'>;

/**
 * Conteúdo canônico: os campos na ordem declarada abaixo, e nenhum outro.
 *
 * A ordem é parte do formato. Mudá-la invalida toda cadeia já registrada, e
 * por isso só pode mudar com nova versão de esquema.
 */
export function conteudoCanonico<T extends string>(e: EventoSemHash<T>): string {
  return JSON.stringify({
    sequencia: e.sequencia,
    id: e.id,
    tipo: e.tipo,
    objeto: e.objeto,
    decisao: e.decisao,
    autor: e.autor,
    corpo: e.corpo,
    detalhes: e.detalhes,
    registradoEm: e.registradoEm,
    priorEventHash: e.priorEventHash
  });
}

export async function sha256(texto: string): Promise<string> {
  const dados = new TextEncoder().encode(texto);
  const buf = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Sela o evento: calcula o hash que inclui o elo anterior. */
export async function selar<T extends string>(semHash: EventoSemHash<T>): Promise<EventoLedger<T>> {
  return { ...semHash, thisEventHash: await sha256(conteudoCanonico(semHash)) };
}

/**
 * Monta o próximo elo a partir do topo atual. Pura: não escreve nada.
 *
 * `agora` e `id` entram por parâmetro para que o teste possa fixá-los — hash
 * que depende de relógio não é reproduzível, e cadeia não reproduzível não
 * serve de evidência.
 */
export async function proximoElo<T extends string>(params: {
  topo: EventoLedger<T> | null;
  tipo: T;
  objeto: string;
  decisao: string;
  autor: string;
  corpo: EventoLedger<T>['corpo'];
  detalhes?: Record<string, unknown>;
  agora: string;
  prefixoDeId?: string;
}): Promise<EventoLedger<T>> {
  const sequencia = params.topo ? params.topo.sequencia + 1 : 0;
  const prefixo = params.prefixoDeId ?? 'LED';
  return selar<T>({
    sequencia,
    id: `${prefixo}-${String(sequencia).padStart(6, '0')}`,
    tipo: params.tipo,
    objeto: params.objeto,
    decisao: params.decisao,
    autor: params.autor,
    corpo: params.corpo,
    detalhes: params.detalhes ?? {},
    registradoEm: params.agora,
    priorEventHash: params.topo ? params.topo.thisEventHash : ''
  });
}

/**
 * Confere a cadeia inteira e devolve o PRIMEIRO elo rompido.
 *
 * Três coisas são conferidas, e as três importam por motivos diferentes:
 *   · sequência contígua — apanha evento REMOVIDO do meio, que é como se
 *     esconde o que foi decidido;
 *   · encadeamento — apanha elo religado a outro ponto;
 *   · recomputação do hash — apanha conteúdo EDITADO com os hashes mantidos.
 *
 * Um verificador que só soubesse dizer "íntegra" não provaria nada. É por isso
 * que o gate exercita as três adulterações, e não a conformidade feliz.
 */
export async function verificarCadeia<T extends string>(
  cadeia: EventoLedger<T>[]
): Promise<VerdictoDeIntegridade> {
  if (cadeia.length === 0) return { integra: true, total: 0 };

  let anterior: EventoLedger<T> | null = null;
  for (const e of cadeia) {
    const seqEsperada = anterior ? anterior.sequencia + 1 : 0;
    if (e.sequencia !== seqEsperada) {
      return {
        integra: false,
        total: cadeia.length,
        rompeuNaSequencia: e.sequencia,
        motivo: `sequência esperada ${seqEsperada}, encontrada ${e.sequencia}`
      };
    }

    const hashEsperado = anterior ? anterior.thisEventHash : '';
    if (e.priorEventHash !== hashEsperado) {
      return {
        integra: false,
        total: cadeia.length,
        rompeuNaSequencia: e.sequencia,
        motivo: 'priorEventHash não corresponde ao evento anterior'
      };
    }

    const { thisEventHash, ...semHash } = e;
    const recomputado = await sha256(conteudoCanonico(semHash as EventoSemHash<T>));
    if (recomputado !== thisEventHash) {
      return {
        integra: false,
        total: cadeia.length,
        rompeuNaSequencia: e.sequencia,
        motivo: 'conteúdo do evento foi alterado após o registro'
      };
    }

    anterior = e;
  }

  return { integra: true, total: cadeia.length };
}
