// ---------------------------------------------------------------------------
// CALIBRATION — segundo pacote extraído, na ordem do guia de integração
// (Ledger → Calibration → HumanGate → WSG).
//
// A RESSALVA QUE MOLDOU ESTE PACOTE
//
// O `IRIS0-QF-001` está aberto: 16 dos 19 artefatos ratificados não conferem em
// disco, e há duas edições candidatas dos Livros. Congelar constantes num kernel
// destinado a produto de regulação médica, nessa situação, fixaria a edição
// errada com aparência de autoridade.
//
// A conclusão não foi "não construir calibração". Foi o contrário: este registro
// existe para tornar o IRIS0-QF-001 VISÍVEL em cada leitura, em vez de deixá-lo
// como nota de rodapé que ninguém abre. Uma constante aqui não é um número — é
// um número mais o que se sabe sobre a sua autoridade.
//
// O QUE ISSO IMPÕE A QUEM LÊ
//
// Não existe `obter(id)`. Quem lê precisa declarar PARA QUE lê:
// `obterParaDecisao` recusa constante não instrumentada; `obterEmSombra`
// entrega, e devolve o aviso junto. Ninguém usa um número em sombra para
// decidir por distração, porque a distração não compila.
// ---------------------------------------------------------------------------

/**
 * A escada de estatuto. Vem do `canonStatus.ts` da Aletheia (Onda 0), e é
 * reproduzida aqui porque o kernel não pode importar do domínio — mas o
 * vocabulário é deliberadamente o MESMO, para que a migração não traduza nada.
 */
export type EstatutoDeCalibracao =
  /** Calculada e registrada, SEM autoridade para embasar decisão. */
  | 'SOMBRA'
  /** Ratificada por declaração autoral do Nível E, sem corpus selado. */
  | 'AUTORAL'
  /** Ratificada E instrumentada por corpus de calibração selado. */
  | 'INSTRUMENTADA'
  /** Sem procedência no corpus. Não deve sequer ser exibida. */
  | 'SEM_PROCEDENCIA';

/**
 * Uma constante calibrada.
 *
 * `curador` não é enfeite: o guia de integração mapeia as Cinco Perguntas
 * (responsável, supervisor, fiscal, evidência, indicador) para campos
 * obrigatórios, com a regra "nenhum objeto MPE-H existe sem dono". Constante
 * sem dono é constante que ninguém pode ser questionado sobre.
 */
export interface ConstanteCalibrada<TValor = number> {
  id: string;
  rotulo: string;
  valor: TValor;
  estatuto: EstatutoDeCalibracao;
  /** Origem TEXTUAL no corpus. Não é descrição: é onde conferir. */
  procedencia: string;
  /** Quem responde por ela. */
  curador: string;
  /** Quando a procedência foi conferida em disco pela última vez. */
  verificadoEm: string;
  /** Por que ela não subiu de estatuto. Obrigatório fora de INSTRUMENTADA. */
  ressalva?: string;
}

/** Devolvido por `obterEmSombra`: o valor nunca viaja sem o que se sabe dele. */
export interface LeituraEmSombra<TValor = number> {
  valor: TValor;
  estatuto: EstatutoDeCalibracao;
  aviso: string;
  constante: ConstanteCalibrada<TValor>;
}

export class ConstanteDesconhecida extends Error {
  constructor(id: string, conhecidas: string[]) {
    super(
      `constante de calibração desconhecida: "${id}". ` +
        `Conhecidas: ${conhecidas.length > 0 ? conhecidas.join(', ') : '(nenhuma)'}. ` +
        'Constantes nunca são inferidas nem herdadas.'
    );
    this.name = 'ConstanteDesconhecida';
  }
}

export class ConstanteSemAutoridade extends Error {
  constructor(
    public readonly constante: ConstanteCalibrada<unknown>,
    public readonly exigido: EstatutoDeCalibracao
  ) {
    super(
      `"${constante.id}" está em ${constante.estatuto} e a leitura pediu autoridade para decidir ` +
        `(exige ${exigido}). ${constante.ressalva ?? 'Sem ressalva declarada.'} ` +
        'Use obterEmSombra() e exiba o aviso, ou ratifique a constante.'
    );
    this.name = 'ConstanteSemAutoridade';
  }
}
