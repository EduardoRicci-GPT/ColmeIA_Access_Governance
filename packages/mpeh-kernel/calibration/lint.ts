// ---------------------------------------------------------------------------
// LINT DE CONSTANTES — "nenhum número de limiar é constante literal em código"
//
// O guia de integração pede, no pacote `calibration/`, "registry + lint de
// constantes p/ CI". O registro sozinho não basta: ele é fonte única apenas
// para quem o consulta, e nada impede alguém de escrever `if (i2e >= 0.65)` no
// arquivo ao lado. Este é o instrumento que apanha isso.
//
// FUNÇÃO PURA, POR IMPOSIÇÃO DO KERNEL
//
// O tsconfig do kernel exclui os tipos do Node: não há `fs` aqui, e não pode
// haver. O lint recebe TEXTO e devolve achados; quem lê disco é a ferramenta
// de CI, do lado de fora. A restrição melhorou o desenho — a análise fica
// testável sem tocar em arquivo.
//
// A LIÇÃO QUE MOLDOU A PRECISÃO
//
// O verificador de ancoragem da Aletheia quase morreu de falso positivo:
// reprovava "Paralelamente", "Ambos", "Vários". A conclusão registrada lá vale
// aqui: "um instrumento desligado não protege nada".
//
// Por isso este lint NÃO finge exatidão. Ele separa o que sabe do que suspeita:
//
//   · CERTEZA  — literal fracionário em comparação. Quase sempre calibragem:
//                ninguém escreve `>= 0.65` por acaso estrutural.
//   · SUSPEITA — literal inteiro >= 2 em comparação. Pode ser limiar
//                (`protecao >= 9`) ou pode ser laço. Reporta como suspeita,
//                e não como violação.
//
// E há dispensa, com preço. `// calibragem: <motivo>` silencia a linha — na
// mesma linha ou no comentário imediatamente acima — mas exige o motivo
// escrito. Dispensa gratuita é usada em toda parte; dispensa que obriga a
// justificar sobrevive, e deixa rastro de quem decidiu o quê.
// ---------------------------------------------------------------------------

export type GrauDoAchado = 'CERTEZA' | 'SUSPEITA';

export interface AchadoDeCalibracao {
  linha: number;
  grau: GrauDoAchado;
  literal: string;
  trecho: string;
  motivo: string;
}

export interface OpcoesDoLint {
  /** Literais aceitos sem discussão. Padrão: 0, 1, -1. */
  estruturais?: number[];
  /** Também reportar suspeitas (inteiros). Padrão: true. */
  incluirSuspeitas?: boolean;
}

const MARCA_DE_DISPENSA = /\/\/\s*calibragem:\s*(.*)$/;

/** Comparações que caracterizam limiar. Igualdade não entra: `=== 0` é teste. */
const COMPARACAO = /(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)/g;

/**
 * PESOS. Um limiar decide onde a linha passa; um peso decide quanto cada
 * sinal vale — e a segunda escolha é tão calibragem quanto a primeira, com a
 * diferença de não aparecer em nenhuma comparação.
 *
 * Achado que motivou incluir isto: `rvepAdapter.ts` acumula `score += 0.20`,
 * `+= 0.15`, `+= 0.10`, `+= 0.05` e `i2e * 0.10` para decidir severidade. São
 * cinco constantes de julgamento que o lint de comparação não via.
 */
const PESO = /(\+=|-=|\*=)\s*(-?\d+\.\d+)/g;

// LACUNA DECLARADA, e medida em 04/09/2026.
//
// A primeira versão também apanhava multiplicação (`x * 0.6`). Medida contra os
// 85 arquivos do repositório, ela trouxe 7 achados reais e SETE falsos
// positivos — todos no sintetizador de som, onde `volume * 0.8` e
// `freq * 0.998` são envelope de áudio, não julgamento.
//
// Preferi precisão a cobertura, pelo motivo já aprendido no verificador de
// ancoragem: instrumento que reprova o legítimo é desligado, e desligado não
// protege nada. O preço está nomeado: peso aplicado por MULTIPLICAÇÃO não é
// apanhado. O exemplo real que escapa é `score + i2e * 0.10` em
// rvepAdapter.ts:277. Isto é limitação declarada, não descuido.

/** Padrões estruturais que não são calibragem, e sim mecânica de programa. */
const ESTRUTURAL = [
  /\.length\s*[<>=]/, // percorrer coleção
  /\b(?:for|while)\s*\(/, // cabeçalho de laço
  /\bslice\(|\bsubstring\(|\bsubstr\(|\bpadStart\(|\bpadEnd\(/, // corte de texto
  /\bindexOf\(|\bcharCodeAt\(/,
  /\btoFixed\(|\btoString\(/
];

function ehLinhaDeComentario(linha: string): boolean {
  const t = linha.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/**
 * Analisa um arquivo. Devolve os achados, em ordem de linha.
 *
 * `dispensaSemMotivo` é ela própria um achado: alguém que escreve
 * `// calibragem:` e deixa em branco está silenciando sem dizer por quê, que é
 * o comportamento que a dispensa existe para impedir.
 */
export function lintDeConstantes(
  codigo: string,
  opcoes: OpcoesDoLint = {}
): AchadoDeCalibracao[] {
  const estruturais = new Set(opcoes.estruturais ?? [0, 1, -1]);
  const incluirSuspeitas = opcoes.incluirSuspeitas ?? true;
  const achados: AchadoDeCalibracao[] = [];
  const linhas = codigo.split(/\r?\n/);

  // A dispensa vale na mesma linha OU na linha de comentário imediatamente
  // acima. A primeira versão só aceitava na mesma linha, e o primeiro uso real
  // já mostrou o problema: um motivo bem escrito não cabe ao lado do código sem
  // deixar a linha ilegível. Dispensa que obriga a piorar o código é dispensa
  // que ninguém usa — e volta-se a silenciar sem dizer por quê.
  let dispensaHerdada: string | null = null;

  linhas.forEach((linha, i) => {
    const numero = i + 1;

    if (ehLinhaDeComentario(linha)) {
      const m = MARCA_DE_DISPENSA.exec(linha);
      // Só um comentário que traga motivo dispensa a linha seguinte.
      dispensaHerdada = m && (m[1] ?? '').trim() !== '' ? (m[1] ?? '').trim() : null;
      return;
    }

    if (dispensaHerdada) {
      dispensaHerdada = null;
      return;
    }

    const dispensa = MARCA_DE_DISPENSA.exec(linha);
    if (dispensa) {
      const motivo = (dispensa[1] ?? '').trim();
      if (motivo === '') {
        achados.push({
          linha: numero,
          grau: 'CERTEZA',
          literal: '(dispensa vazia)',
          trecho: linha.trim(),
          motivo:
            'dispensa `// calibragem:` sem motivo escrito. A dispensa existe para ' +
            'obrigar a justificar; em branco, ela só silencia.'
        });
      }
      return; // com motivo, a linha está dispensada
    }

    // Analisa apenas o código, sem o comentário de fim de linha.
    const codigoDaLinha = linha.split('//')[0] ?? linha;
    if (ESTRUTURAL.some((p) => p.test(codigoDaLinha))) return;

    COMPARACAO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COMPARACAO.exec(codigoDaLinha)) !== null) {
      const bruto = m[2] ?? '';
      const valor = Number(bruto);
      if (!Number.isFinite(valor) || estruturais.has(valor)) continue;

      const fracionario = bruto.includes('.');
      if (!fracionario) {
        if (!incluirSuspeitas) continue;
        if (Math.abs(valor) < 2) continue;
        achados.push({
          linha: numero,
          grau: 'SUSPEITA',
          literal: bruto,
          trecho: codigoDaLinha.trim(),
          motivo:
            `inteiro ${bruto} comparado diretamente. Pode ser limiar de julgamento ou ` +
            'mecânica de programa — confira e, se for mecânica, dispense com motivo.'
        });
        continue;
      }

      achados.push({
        linha: numero,
        grau: 'CERTEZA',
        literal: bruto,
        trecho: codigoDaLinha.trim(),
        motivo:
          `limiar fracionário ${bruto} literal em código. Todo limiar é atributo de ` +
          'perfil versionado no Registry — CLAUDE.md, Proibições absolutas.'
      });
    }

    PESO.lastIndex = 0;
    let p: RegExpExecArray | null;
    while ((p = PESO.exec(codigoDaLinha)) !== null) {
      const bruto = p[2] ?? p[3] ?? '';
      const valor = Number(bruto);
      if (!Number.isFinite(valor) || estruturais.has(valor)) continue;
      achados.push({
        linha: numero,
        grau: 'CERTEZA',
        literal: bruto,
        trecho: codigoDaLinha.trim(),
        motivo:
          `peso ${bruto} literal em código. Um peso decide QUANTO cada sinal vale — ` +
          'é calibragem tanto quanto um limiar, e some mais fácil porque não aparece ' +
          'em comparação nenhuma.'
      });
    }
  });

  return achados;
}

/** Só o que é violação, sem as suspeitas. É isto que deve travar a CI. */
export function violacoes(achados: AchadoDeCalibracao[]): AchadoDeCalibracao[] {
  return achados.filter((a) => a.grau === 'CERTEZA');
}
