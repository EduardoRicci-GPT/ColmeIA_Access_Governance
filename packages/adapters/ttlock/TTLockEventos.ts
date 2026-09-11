// ---------------------------------------------------------------------------
// TTLock — ingestão de eventos (webhook ou polling)
//
// A escolha entre webhook e polling não é detalhe de implementação: ela muda o
// que o sistema pode PROMETER. Com webhook, a confirmação física chega em
// segundos e a revogação pendente tem prazo curto. Com polling de 5 minutos, a
// janela de incerteza é estrutural — e a interface precisa dizer isso ao
// coordenador, em vez de fingir tempo real.
//
// Enquanto a documentação não confirma qual canal existe, o adaptador opera em
// POLLING declarado, com a janela de incerteza explícita no próprio tipo.
// ---------------------------------------------------------------------------

import { OrigemDeIngestao } from '../../dominio/eventos';

export interface CanalDeEventos {
  origem: OrigemDeIngestao;
  /** Janela máxima entre o fato físico e o conhecimento do sistema. */
  janelaDeIncertezaMs: number;
  /** Há garantia de entrega, ou o evento pode se perder em silêncio? */
  entregaGarantida: boolean;
  pendencia?: string;
}

export const CANAL_TTLOCK: Readonly<CanalDeEventos> = Object.freeze({
  origem: 'POLLING',
  janelaDeIncertezaMs: 5 * 60_000,
  entregaGarantida: false,
  pendencia:
    'Confirmar se o fabricante oferece webhook. Enquanto não houver, toda confirmação física ' +
    'carrega até 5 min de atraso, e a interface deve declarar essa janela.'
});

/**
 * Regra derivada: com polling e sem entrega garantida, um evento ausente NÃO
 * prova que o fato não ocorreu. É por isso que a reconciliação física por
 * consulta direta (`reconcilePhysicalState`) deixa de ser luxo e vira o único
 * caminho para sair de DEVICE_SYNC_UNKNOWN neste provedor.
 */
export function exigeReconciliacaoAtiva(canal: CanalDeEventos): boolean {
  return !canal.entregaGarantida;
}
