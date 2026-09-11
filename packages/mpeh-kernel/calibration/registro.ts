// ---------------------------------------------------------------------------
// REGISTRO DE CALIBRAÇÃO — fonte única, e fechada por padrão
// ---------------------------------------------------------------------------

import {
  ConstanteCalibrada,
  ConstanteDesconhecida,
  ConstanteSemAutoridade,
  EstatutoDeCalibracao,
  LeituraEmSombra
} from './tipos';

/** Ordem de autoridade. Só INSTRUMENTADA embasa decisão sem ressalva. */
const ORDEM: Record<EstatutoDeCalibracao, number> = {
  SEM_PROCEDENCIA: 0,
  SOMBRA: 1,
  AUTORAL: 2,
  INSTRUMENTADA: 3
};

export interface OpcoesDoRegistro {
  /**
   * Estatuto mínimo para `obterParaDecisao`. Padrão: INSTRUMENTADA.
   *
   * É afrouxável de propósito — um piloto pode operar em AUTORAL sob decisão
   * do Nível E —, mas afrouxar é ato explícito de quem monta o registro, e
   * fica no código, não numa flag de ambiente que ninguém revisa.
   */
  exigidoParaDecidir?: EstatutoDeCalibracao;
}

export class RegistroDeCalibracao {
  private readonly constantes = new Map<string, ConstanteCalibrada<unknown>>();
  private readonly exigidoParaDecidir: EstatutoDeCalibracao;

  constructor(
    constantes: ReadonlyArray<ConstanteCalibrada<unknown>> = [],
    opcoes: OpcoesDoRegistro = {}
  ) {
    this.exigidoParaDecidir = opcoes.exigidoParaDecidir ?? 'INSTRUMENTADA';
    for (const c of constantes) this.registrar(c);
  }

  /**
   * Inscreve uma constante. Recusa duas coisas, ambas por experiência:
   *
   *  · id repetido — dois valores sob o mesmo nome é como uma calibragem
   *    fabricada entra sem ninguém notar;
   *  · estatuto abaixo de INSTRUMENTADA sem ressalva escrita — "por que este
   *    número ainda não é confiável" é justamente o que se perde primeiro.
   */
  public registrar<T>(c: ConstanteCalibrada<T>): void {
    if (this.constantes.has(c.id)) {
      throw new Error(
        `constante "${c.id}" já registrada. Fonte única não admite duas definições — ` +
          'a segunda seria invisível e valeria por acaso.'
      );
    }
    if (!c.procedencia || c.procedencia.trim() === '') {
      throw new Error(`constante "${c.id}" sem procedência. Sem origem textual, não entra.`);
    }
    if (!c.curador || c.curador.trim() === '') {
      throw new Error(
        `constante "${c.id}" sem curador. Nenhum objeto MPE-H existe sem dono — ` +
          'constante sem dono é constante sobre a qual ninguém pode ser questionado.'
      );
    }
    if (c.estatuto !== 'INSTRUMENTADA' && (!c.ressalva || c.ressalva.trim() === '')) {
      throw new Error(
        `constante "${c.id}" está em ${c.estatuto} e não declara ressalva. ` +
          'Por que ela ainda não é confiável é a informação que se perde primeiro.'
      );
    }
    this.constantes.set(c.id, c as ConstanteCalibrada<unknown>);
  }

  public conhece(id: string): boolean {
    return this.constantes.has(id);
  }

  public ids(): string[] {
    return [...this.constantes.keys()].sort();
  }

  /** Todas, para painel e auditoria. Nunca para decidir. */
  public inventario(): ConstanteCalibrada<unknown>[] {
    return this.ids().map((id) => ({ ...(this.constantes.get(id) as ConstanteCalibrada<unknown>) }));
  }

  private exigir(id: string): ConstanteCalibrada<unknown> {
    const c = this.constantes.get(id);
    if (!c) throw new ConstanteDesconhecida(id, this.ids());
    return c;
  }

  /**
   * Leitura COM autoridade para embasar decisão.
   *
   * Lança se o estatuto não alcança o exigido. É o ponto do pacote: um número
   * em sombra não chega a uma decisão por distração, porque a distração não
   * compila — e um limiar aplicado por engano é pior que uma análise que não
   * roda.
   */
  public obterParaDecisao<T = number>(id: string): T {
    const c = this.exigir(id);
    if (ORDEM[c.estatuto] < ORDEM[this.exigidoParaDecidir]) {
      throw new ConstanteSemAutoridade(c, this.exigidoParaDecidir);
    }
    return c.valor as T;
  }

  /**
   * Leitura EM SOMBRA: entrega o valor e o aviso juntos.
   *
   * O aviso não é opcional na estrutura de retorno de propósito. Quem exibe o
   * número tem o texto na mão; esconder passa a ser ato, não esquecimento.
   */
  public obterEmSombra<T = number>(id: string): LeituraEmSombra<T> {
    const c = this.exigir(id) as ConstanteCalibrada<T>;
    if (c.estatuto === 'SEM_PROCEDENCIA') {
      throw new ConstanteSemAutoridade(c as ConstanteCalibrada<unknown>, 'SOMBRA');
    }
    return {
      valor: c.valor,
      estatuto: c.estatuto,
      constante: { ...c },
      aviso:
        `${c.rotulo}: ${c.estatuto}. ${c.ressalva ?? ''} ` +
        `Procedência: ${c.procedencia}. Conferida em ${c.verificadoEm}.`.replace(/\s+/g, ' ').trim()
    };
  }

  /** Quantas constantes há em cada degrau — o retrato que o painel mostra. */
  public retrato(): Record<EstatutoDeCalibracao, number> {
    const r: Record<EstatutoDeCalibracao, number> = {
      SEM_PROCEDENCIA: 0,
      SOMBRA: 0,
      AUTORAL: 0,
      INSTRUMENTADA: 0
    };
    for (const c of this.constantes.values()) r[c.estatuto] += 1;
    return r;
  }
}
