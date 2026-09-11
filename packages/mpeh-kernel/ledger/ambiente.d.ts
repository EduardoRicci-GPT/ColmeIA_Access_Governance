// ---------------------------------------------------------------------------
// A ÚNICA COISA QUE O KERNEL EXIGE DO AMBIENTE
//
// SHA-256 via Web Crypto. Não é API de navegador: é padrão web implementado
// tanto no navegador quanto no Node >= 19, e é o mesmo algoritmo que o
// `pgcrypto` do Postgres oferece do lado do banco — o que importa, porque a
// verificação da cadeia precisa poder ser refeita fora daqui.
//
// Está declarado à mão, e não pela lib DOM, de propósito: incluir a DOM
// deixaria `localStorage`, `window` e `document` entrarem sem aviso. Este
// arquivo é a superfície mínima, e ela é auditável em doze linhas.
// ---------------------------------------------------------------------------

interface SubtleCryptoMinima {
  digest(algoritmo: 'SHA-256', dados: Uint8Array): Promise<ArrayBuffer>;
}

declare const crypto: {
  readonly subtle: SubtleCryptoMinima;
};

declare class TextEncoder {
  encode(entrada?: string): Uint8Array;
}
