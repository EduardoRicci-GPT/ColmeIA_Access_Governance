// ---------------------------------------------------------------------------
// BATERIA — arnês mínimo, no estilo das ferramentas da Aletheia
//
// Sem framework: `tsx`, asserções e código de saída. Um teste que precisa de
// infraestrutura para rodar é um teste que alguém vai deixar de rodar.
// ---------------------------------------------------------------------------

export interface Resultado {
  nome: string;
  passou: boolean;
  detalhe?: string;
}

const resultados: Resultado[] = [];
let grupoAtual = '';

export function grupo(nome: string): void {
  grupoAtual = nome;
  console.log(`\n── ${nome} ${'─'.repeat(Math.max(0, 62 - nome.length))}`);
}

export function verificar(nome: string, condicao: boolean, detalhe?: string): void {
  const completo = grupoAtual ? `${grupoAtual} · ${nome}` : nome;
  resultados.push({ nome: completo, passou: condicao, detalhe });
  const marca = condicao ? '  OK  ' : ' FALHA';
  console.log(`${marca}  ${nome}${detalhe && !condicao ? `\n        ${detalhe}` : ''}`);
}

export function igual<T>(nome: string, obtido: T, esperado: T): void {
  verificar(nome, Object.is(obtido, esperado), `obtido ${String(obtido)}, esperado ${String(esperado)}`);
}

export function proximo(nome: string, obtido: number, esperado: number, tolerancia = 0.01): void {
  verificar(
    nome,
    Math.abs(obtido - esperado) <= tolerancia,
    `obtido ${obtido}, esperado ${esperado} (±${tolerancia})`
  );
}

export function fechar(titulo: string): void {
  const falhas = resultados.filter((r) => !r.passou);
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${titulo}: ${resultados.length - falhas.length}/${resultados.length} verificações passaram.`);
  if (falhas.length > 0) {
    console.log('\nFalhas:');
    for (const falha of falhas) console.log(`  · ${falha.nome}${falha.detalhe ? ` — ${falha.detalhe}` : ''}`);
    process.exit(1);
  }
  console.log('BATERIA APROVADA.');
}
