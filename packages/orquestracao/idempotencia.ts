// ---------------------------------------------------------------------------
// IDEMPOTÊNCIA E CORRELAÇÃO — item 37
//
// Duas chaves, dois propósitos opostos, e confundi-los é erro comum:
//
//   idempotencyKey  colapsa repetições. Duas chamadas com a mesma chave são a
//                   MESMA operação. Protege contra revogação duplicada, grant
//                   duplicado, reentrega de webhook.
//
//   correlationId   costura eventos distintos numa história. É o que permite a
//                   timeline de auditoria do item 39 mostrar "08:00 concedido →
//                   13:40 revogado → 14:12 confirmado" como uma sequência, e
//                   não como três linhas soltas de log.
//
// A `geracao` na chave de idempotência resolve um problema sutil: sem ela, uma
// revogação depois de uma concessão para a mesma credencial no mesmo endpoint
// produziria chave diferente só por causa do tipo — mas uma RE-concessão
// depois da revogação colidiria com a concessão original e seria engolida como
// duplicata. A geração incrementa a cada transição de estado desejado.
// ---------------------------------------------------------------------------

export type TipoDeOperacao = 'GRANT' | 'REVOKE' | 'SYNC';

export interface PartesDaChave {
  tipo: TipoDeOperacao;
  endpointId: string;
  credentialId: string;
  geracao: number;
}

export function chaveDeIdempotencia(partes: PartesDaChave): string {
  return [partes.tipo, partes.endpointId, partes.credentialId, `g${partes.geracao}`].join('::');
}

export function correlacaoDeCredencial(credentialId: string, endpointId: string): string {
  return `COR::${endpointId}::${credentialId}`;
}

export function correlacaoDeEvento(eventoExternoId: string, endpointId: string): string {
  return `COR-EV::${endpointId}::${eventoExternoId}`;
}
