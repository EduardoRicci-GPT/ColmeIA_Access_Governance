// ---------------------------------------------------------------------------
// COMPETÊNCIA — o que a pessoa está habilitada a fazer, e que o cargo não diz
//
// Este produto tratava competência como papel. `role-enfermagem-uti` respondia
// simultaneamente a duas perguntas diferentes: "que função a instituição lhe
// atribuiu?" e "o que esta pessoa está habilitada a fazer?". São perguntas
// distintas, e confundi-las tem consequência específica: o motor concederia
// acesso a quem tem o cargo e não tem a habilitação vigente.
//
// TRÊS PROPRIEDADES QUE O PAPEL NÃO TEM
//
// 1. COMPETÊNCIA VENCE. Registro em conselho de classe tem anuidade; ACLS vale
//    dois anos; NR-32 exige reciclagem. Papel não expira — enquanto ninguém
//    mudar o cadastro, ele é o que é. Competência muda de estado sozinha, com
//    o tempo, exatamente como a vigência de uma aprovação (ADR-0016).
//
// 2. QUEM EMITE NÃO É O HOSPITAL. COREN, CRM e CRF não são departamentos da
//    instituição. A competência tem emissor externo, e o hospital é leitor
//    dela, não autor — o que significa que a informação chega pela porta do
//    host e carrega procedência, como todo número deste produto.
//
// 3. ELA É SUSPENSA POR FORA. Um profissional pode estar ativo no RH e
//    suspenso pelo conselho. Nenhuma autoridade da instalação revoga essa
//    suspensão, e é por isso que ela NEGA em vez de pedir revisão: o que falta
//    ali não é permissão, é qualificação — e permissão é a única coisa que uma
//    autoridade interna sabe conceder.
//
// A DECISÃO DIFÍCIL: VENCIDA NÃO É O MESMO QUE SUSPENSA
//
// A tentação é tratar toda falha de competência como negativa. Seria simples,
// e reintroduziria o erro simétrico que o ADR-0014 nomeou: numa madrugada, a
// anuidade atrasada de um enfermeiro fecharia a UTI para a única pessoa
// presente. O custo do rigor recai sobre o paciente, não sobre quem esqueceu
// de pagar.
//
// Por isso a direção do efeito é diferente por estado:
//
//   · SUSPENSA         → nega. Decisão de uma autoridade externa, que a
//                        instalação não relaxa.
//   · VENCIDA          → exige revisão humana. Alguém com alçada decide se
//                        aquele plantão segue, e o registro fica.
//   · NÃO DECLARADA    → exige revisão humana, pelo mesmo motivo, e nunca
//                        silenciosamente concede.
//
// E há um quarto caso que não é falha nenhuma: quando a instalação NÃO
// declarou exigência para aquela zona, competência não se aplica. Ausência de
// exigência é diferente de ausência de evidência — tratar as duas igual faria
// toda porta fechar no dia em que a integração com o conselho ficasse muda,
// que é precisamente o dia em que o hospital menos precisa disso.
// ---------------------------------------------------------------------------

import { Relogio } from '../dominio/tempo';

/** De onde a habilitação vem. Decide quem pode alterá-la. */
export type OrigemDaCompetencia =
  /** COREN, CRM, CRF. O hospital lê; não emite, não suspende, não renova. */
  | 'CONSELHO_DE_CLASSE'
  /** ACLS, NR-32, certificação de fabricante. Terceiro emite, com validade. */
  | 'CERTIFICACAO_EXTERNA'
  /** Treinamento da própria instituição, que ela emite e pela qual responde. */
  | 'TREINAMENTO_INTERNO';

export interface Competencia {
  id: string;
  rotulo: string;
  emissor: string;
  origem: OrigemDaCompetencia;
}

export type EstadoDaHabilitacao = 'VIGENTE' | 'SUSPENSA';

/**
 * A habilitação de uma pessoa, como o host a declara.
 *
 * `referenciaDoRegistro` é referência opaca, nunca o número do registro no
 * conselho. O número é dado pessoal que este produto não precisa para decidir
 * acesso — e a mesma disciplina que mantém diagnóstico fora do motor
 * (ADR-0007) mantém a carteira profissional fora dele.
 */
export interface HabilitacaoDaPessoa {
  personId: string;
  competenciaId: string;
  estado: EstadoDaHabilitacao;
  /** `null` significa "não expira", e só é legítimo se alguém DECIDIU isso. */
  validaAte: Date | null;
  referenciaDoRegistro?: string;
  /** Quando o host conferiu isto na fonte. Leitura velha é leitura velha. */
  verificadoEm: Date;
}

/**
 * O que uma zona exige.
 *
 * Declarada por instalação, com procedência e curador — uma exigência sem dono
 * é uma exigência que ninguém revisa, e no dia em que ela fechar uma porta
 * errada ninguém saberá a quem perguntar.
 */
export interface ExigenciaDeCompetencia {
  zonaId: string;
  /** Todas são necessárias. Exigência é conjunção, não escolha. */
  competenciasExigidas: readonly string[];
  procedencia: string;
  curador: string;
  verificadoEm: string;
  ressalva?: string;
}

/** Por que uma habilitação exigida não está de pé. */
export type FalhaDeCompetencia = 'SUSPENSA' | 'VENCIDA' | 'NAO_DECLARADA';

export interface CompetenciaFaltante {
  competenciaId: string;
  falha: FalhaDeCompetencia;
  /** Quando venceu, quando é o caso. */
  venceuEm?: Date;
}

/**
 * A leitura projetada que chega ao motor de política.
 *
 * Note o que ela NÃO carrega: número de registro, emissor, data de
 * verificação. O motor decide com o mínimo — quem precisa do detalhe é a tela
 * de quem vai resolver, e ela busca na fonte.
 */
export interface LeituraDeCompetencia {
  /** A instalação declarou exigência para esta zona? */
  exigida: boolean;
  atende: boolean;
  /** Ao menos uma exigida está suspensa por autoridade externa. */
  suspensa: boolean;
  faltantes: readonly CompetenciaFaltante[];
  /** Frase determinística, pronta para a fila e para a trilha. */
  explicacao: string;
}

export const COMPETENCIA_NAO_EXIGIDA: LeituraDeCompetencia = Object.freeze({
  exigida: false,
  atende: true,
  suspensa: false,
  faltantes: Object.freeze([]) as readonly CompetenciaFaltante[],
  explicacao: 'Esta zona não declara exigência de competência.'
});

/** A porta do host: quem sabe as habilitações é o sistema de pessoal. */
export interface ConsultaDeCompetencia {
  avaliar(personId: string, zonaId: string, agora: Date): LeituraDeCompetencia;
  /** Para a tela e para a exceção operacional, quando precisam do detalhe. */
  habilitacoesDe(personId: string): readonly HabilitacaoDaPessoa[];
}

/** Nenhuma habilitação conhecida, e nenhuma exigência. Não fecha porta. */
export const SEM_COMPETENCIAS: ConsultaDeCompetencia = {
  avaliar: () => COMPETENCIA_NAO_EXIGIDA,
  habilitacoesDe: () => []
};

function descrever(faltantes: readonly CompetenciaFaltante[]): string {
  return faltantes
    .map((f) => {
      switch (f.falha) {
        case 'SUSPENSA':
          return `${f.competenciaId} está SUSPENSA pelo emissor`;
        case 'VENCIDA':
          return `${f.competenciaId} venceu em ${f.venceuEm?.toISOString() ?? '—'}`;
        case 'NAO_DECLARADA':
          return `${f.competenciaId} não foi declarada para esta pessoa`;
      }
    })
    .join('; ');
}

/**
 * Registro de referência, para bancada e piloto.
 *
 * Em produção quem responde esta porta é o sistema de pessoal do hospital,
 * porque é ele que já conversa com o conselho de classe. Reimplementar isso
 * aqui produziria uma segunda verdade sobre quem está habilitado — o mesmo
 * defeito que `AutoridadeDoHost` evita quanto a quem manda.
 */
export class RegistroDeCompetencias implements ConsultaDeCompetencia {
  private readonly habilitacoes = new Map<string, HabilitacaoDaPessoa[]>();
  private readonly exigencias = new Map<string, ExigenciaDeCompetencia>();

  constructor(
    private readonly relogio: Relogio,
    habilitacoes: readonly HabilitacaoDaPessoa[] = [],
    exigencias: readonly ExigenciaDeCompetencia[] = []
  ) {
    for (const habilitacao of habilitacoes) this.declarar(habilitacao);
    for (const exigencia of exigencias) this.exigir(exigencia);
  }

  declarar(habilitacao: HabilitacaoDaPessoa): void {
    const daPessoa = this.habilitacoes.get(habilitacao.personId) ?? [];
    const semDuplicata = daPessoa.filter((h) => h.competenciaId !== habilitacao.competenciaId);
    this.habilitacoes.set(habilitacao.personId, [...semDuplicata, habilitacao]);
  }

  exigir(exigencia: ExigenciaDeCompetencia): void {
    this.exigencias.set(exigencia.zonaId, exigencia);
  }

  exigenciaDe(zonaId: string): ExigenciaDeCompetencia | undefined {
    return this.exigencias.get(zonaId);
  }

  habilitacoesDe(personId: string): readonly HabilitacaoDaPessoa[] {
    return this.habilitacoes.get(personId) ?? [];
  }

  /** Suspender é ato do emissor; aqui só se registra que ele ocorreu. */
  suspender(personId: string, competenciaId: string): void {
    const habilitacao = this.habilitacoesDe(personId).find(
      (h) => h.competenciaId === competenciaId
    );
    if (habilitacao) this.declarar({ ...habilitacao, estado: 'SUSPENSA' });
  }

  avaliar(personId: string, zonaId: string, agora: Date = this.relogio.agora()): LeituraDeCompetencia {
    const exigencia = this.exigencias.get(zonaId);
    if (!exigencia || exigencia.competenciasExigidas.length === 0) {
      return COMPETENCIA_NAO_EXIGIDA;
    }

    const daPessoa = this.habilitacoesDe(personId);
    const faltantes: CompetenciaFaltante[] = [];

    for (const competenciaId of exigencia.competenciasExigidas) {
      const habilitacao = daPessoa.find((h) => h.competenciaId === competenciaId);
      if (!habilitacao) {
        faltantes.push({ competenciaId, falha: 'NAO_DECLARADA' });
        continue;
      }
      if (habilitacao.estado === 'SUSPENSA') {
        faltantes.push({ competenciaId, falha: 'SUSPENSA' });
        continue;
      }
      if (habilitacao.validaAte !== null && agora.getTime() >= habilitacao.validaAte.getTime()) {
        faltantes.push({
          competenciaId,
          falha: 'VENCIDA',
          venceuEm: habilitacao.validaAte
        });
      }
    }

    if (faltantes.length === 0) {
      return {
        exigida: true,
        atende: true,
        suspensa: false,
        faltantes: [],
        explicacao: `As ${exigencia.competenciasExigidas.length} competências exigidas nesta zona estão vigentes.`
      };
    }

    const suspensa = faltantes.some((f) => f.falha === 'SUSPENSA');
    const explicacao = suspensa
      ? `Habilitação suspensa pelo emissor: ${descrever(faltantes)}. Suspensão é decisão ` +
        'de autoridade externa; nenhuma alçada desta instalação a relaxa, porque o que ' +
        'falta aqui não é permissão, é qualificação.'
      : `${descrever(faltantes)}. Exige revisão humana: fechar a porta por anuidade ` +
        'atrasada faz o custo do rigor recair sobre quem precisa de atendimento, e não ' +
        'sobre quem esqueceu de renovar.';

    return { exigida: true, atende: false, suspensa, faltantes, explicacao };
  }
}

/**
 * Exigências de referência para uma unidade de saúde.
 *
 * A procedência distingue o que é norma do que é prática derivada dela — a
 * mesma disciplina das matrizes de segregação (ADR-0019). A Lei 7.498/1986
 * regulamenta o exercício da enfermagem e o registro no conselho; exigir NR-32
 * para circular em área de medicamentos é decisão de controle interno, não
 * dispositivo literal daquela lei.
 */
export const COMPETENCIAS_HOSPITALARES: readonly Competencia[] = Object.freeze([
  {
    id: 'registro-de-enfermagem',
    rotulo: 'Registro ativo no conselho de enfermagem',
    emissor: 'Conselho Regional de Enfermagem',
    origem: 'CONSELHO_DE_CLASSE'
  },
  {
    id: 'nr-32',
    rotulo: 'Treinamento NR-32 — segurança em serviços de saúde',
    emissor: 'Instituição',
    origem: 'TREINAMENTO_INTERNO'
  }
]);

export const EXIGENCIAS_HOSPITALARES: readonly ExigenciaDeCompetencia[] = Object.freeze([
  {
    zonaId: 'z-uti',
    competenciasExigidas: ['registro-de-enfermagem'],
    procedencia:
      'Lei 7.498/1986 — o exercício da enfermagem é privativo de quem possui registro ' +
      'no conselho. A exigência aqui é a do registro ativo, não uma competência derivada.',
    curador: 'Nível E — governança de acesso ColmeIA',
    verificadoEm: '2026-09-17'
  },
  {
    zonaId: 'z-farmacia',
    competenciasExigidas: ['nr-32'],
    procedencia:
      'Prática de controle interno derivada da NR-32, que trata de segurança e saúde no ' +
      'trabalho em serviços de saúde. A norma não enumera esta porta.',
    curador: 'Nível E — governança de acesso ColmeIA',
    verificadoEm: '2026-09-17',
    ressalva:
      'Exigência não ratificada por instalação nenhuma. Enquanto estiver assim, o efeito ' +
      'dela é exigir revisão humana — nunca negar sozinha, exceto em suspensão.'
  }
]);
