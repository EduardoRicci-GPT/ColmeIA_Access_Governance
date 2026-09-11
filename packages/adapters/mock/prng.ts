// ---------------------------------------------------------------------------
// ALEATORIEDADE DETERMINÍSTICA
//
// `Math.random()` não entra neste simulador. A razão não é purismo: um cenário
// de divergência que só falha em uma execução a cada trinta é indistinguível
// de um sistema saudável, e um teste que passa por sorte é pior que teste
// nenhum — ele produz confiança sem lastro.
//
// xorshift32 com semente explícita: mesmo cenário, mesma semente, mesma
// sequência de falhas, sempre. Quando um cenário quebra na esteira, ele quebra
// igual na máquina de quem for corrigir.
// ---------------------------------------------------------------------------

export class GeradorDeterministico {
  private estado: number;

  constructor(semente: number) {
    // Semente zero travaria o xorshift em zero para sempre.
    this.estado = semente === 0 ? 0x9e3779b9 : semente >>> 0;
  }

  proximo(): number {
    let x = this.estado;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.estado = x;
    return x / 0x100000000;
  }

  /** Verdadeiro com probabilidade `p` (0 a 1). */
  acontece(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.proximo() < p;
  }

  inteiro(minimo: number, maximo: number): number {
    return minimo + Math.floor(this.proximo() * (maximo - minimo + 1));
  }
}
