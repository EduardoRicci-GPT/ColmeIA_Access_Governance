// ---------------------------------------------------------------------------
// RESTRIÇÃO LOCAL DO RECURSO — D-054: ter direito não é poder exercer agora
//
// O produto já distingue quatro camadas entre a vontade da instituição e a
// porta. Falta uma distinção que não é de camada, e sim de natureza: entre o
// DIREITO e o EXERCÍCIO do direito num instante.
//
// A enfermeira escalada para a UTI 3 naquele turno tem o direito. Se a UTI 3
// está com um procedimento em curso, ou com a privacidade de um paciente
// declarada pela chefia, ou interditada para manutenção do ar-condicionado, ela
// não entra AGORA. E o direito dela continua inteiro.
//
// O ERRO QUE ESTE MÓDULO IMPEDE, E É UM ERRO QUE PARECE CERTO
//
// A forma óbvia de implementar "não entra agora" é revogar. É fácil, funciona
// na primeira demonstração, e destrói o produto:
//
//   · a revogação dispara ordem ao fabricante, que dispara sincronização em
//     todos os equipamentos da zona, por causa de uma obra de duas horas;
//   · quando a obra termina, alguém tem de REEMITIR — e se ninguém lembrar, a
//     enfermeira perdeu um direito que ninguém decidiu tirar;
//   · a trilha passa a registrar "direito revogado" onde houve "sala ocupada",
//     e seis meses depois a auditoria não distingue um do outro;
//   · a próxima reconciliação lógica vê um direito que a política sustenta e
//     não existe, e o reemite sozinha — produzindo churn permanente entre dois
//     motores que discordam sobre o mesmo fato.
//
// Nada disso é falha de implementação. É consequência de colapsar duas
// perguntas numa só, que é o mesmo defeito do `hasAccess` booleano, um nível
// acima.
//
// Por isso a restrição local produz uma LEITURA SEPARADA — `ExercicioDoDireito`
// — e o `desiredState` não a conhece. O Entitlement Reconciliation continua
// dizendo `ENTITLEMENT_ACTIVE`; a decisão de modo ACCESS nega o instante. São
// duas respostas verdadeiras ao mesmo tempo, e o produto precisa das duas.
// ---------------------------------------------------------------------------

import { Janela, janelaVigente } from './entitlement';

/**
 * As espécies que uma unidade de saúde tem de fato, e a razão de cada uma
 * estar aqui em vez de virar "restrição genérica com texto livre": a espécie
 * decide quem pode atravessar. Privacidade de paciente é decisão assistencial;
 * interdição sanitária é decisão de controle de infecção; manutenção é decisão
 * de facilities. Um campo de texto livre faria as três virarem a mesma coisa na
 * tela, e a mesma coisa na alçada.
 */
export type EspecieDeRestricaoLocal =
  | 'PRIVACIDADE_DO_PACIENTE'
  | 'PROCEDIMENTO_EM_CURSO'
  | 'OCUPACAO_MAXIMA'
  | 'MANUTENCAO_PROGRAMADA'
  | 'INTERDICAO_SANITARIA'
  | 'BLOQUEIO_LOCAL_DO_EQUIPAMENTO';

export const ROTULO_DA_RESTRICAO: Readonly<Record<EspecieDeRestricaoLocal, string>> = Object.freeze({
  PRIVACIDADE_DO_PACIENTE: 'Privacidade do paciente declarada',
  PROCEDIMENTO_EM_CURSO: 'Procedimento em curso',
  OCUPACAO_MAXIMA: 'Ocupação máxima do recurso atingida',
  MANUTENCAO_PROGRAMADA: 'Manutenção programada',
  INTERDICAO_SANITARIA: 'Interdição sanitária',
  BLOQUEIO_LOCAL_DO_EQUIPAMENTO: 'Bloqueio acionado localmente no equipamento'
});

/**
 * Dois efeitos, e nenhum deles revoga.
 *
 * `SUSPENDE_EXERCICIO` — não entra agora.
 * `EXIGE_CORROBORACAO` — entra se houver um segundo fato: acompanhamento,
 *                        segunda pessoa, autorização do plantão. É o efeito que
 *                        descreve a privacidade do paciente melhor do que a
 *                        suspensão: a enfermeira entra no quarto, o técnico de
 *                        TI não entra sozinho.
 */
export type EfeitoDaRestricao = 'SUSPENDE_EXERCICIO' | 'EXIGE_CORROBORACAO';

export interface RestricaoLocalDoRecurso {
  id: string;
  /** Incide sobre um endpoint específico. Um dos dois escopos é obrigatório. */
  endpointId?: string;
  /** Ou sobre a zona inteira — quarto, ala, centro cirúrgico. */
  zonaId?: string;
  especie: EspecieDeRestricaoLocal;
  efeito: EfeitoDaRestricao;
  janela: Janela;
  /**
   * Papéis que atravessam esta restrição.
   *
   * Atravessar NÃO apaga a restrição: ela continua vigente, continua na
   * trilha, e a leitura registra que alguém passou por cima dela. A diferença
   * entre atravessar e apagar é a diferença entre um registro de exceção e um
   * buraco no histórico.
   */
  papeisQueAtravessam: readonly string[];
  declaradaPor: string;
  declaradaEm: Date;
  motivo: string;
}

/**
 * Quatro valores, e `NAO_AVALIADO` é o que a instalação que não declarou
 * restrição nenhuma recebe.
 *
 * Note a assimetria com o resto do produto: aqui o default é EXERCIVEL, e não
 * o pessimismo habitual. A razão é a inversão do erro: em política de acesso, o
 * fechamento por omissão protege; em restrição local, o fechamento por omissão
 * trancaria toda porta de todo hospital que ainda não integrou o sistema de
 * ocupação de leitos. Uma restrição que não foi declarada não existe — e o que
 * não existe não suspende nada.
 */
export type ExercicioDoDireito =
  | 'EXERCIVEL'
  | 'SUSPENSO_LOCALMENTE'
  | 'EXIGE_CORROBORACAO'
  | 'NAO_AVALIADO';

export interface LeituraDeExercicio {
  exercicio: ExercicioDoDireito;
  /** Ids das restrições que incidiram, atravessadas ou não. */
  restricoes: readonly string[];
  especies: readonly EspecieDeRestricaoLocal[];
  /** Restrições que incidiram e que o papel do portador atravessou. */
  atravessadas: readonly string[];
  explicacao: string;
}

export interface EntradaDeExercicio {
  endpointId: string;
  zonaId: string;
  /** Papéis efetivos de quem pede o acesso neste instante. */
  papeis: readonly string[];
  agora: Date;
  restricoes: readonly RestricaoLocalDoRecurso[];
}

function incideSobre(restricao: RestricaoLocalDoRecurso, endpointId: string, zonaId: string): boolean {
  if (restricao.endpointId !== undefined) return restricao.endpointId === endpointId;
  if (restricao.zonaId !== undefined) return restricao.zonaId === zonaId;
  // Restrição sem escopo não incide sobre nada. Fazer o contrário — incidir
  // sobre tudo — transformaria um cadastro incompleto num bloqueio geral.
  return false;
}

/**
 * A leitura do exercício.
 *
 * `SUSPENSO_LOCALMENTE` vence `EXIGE_CORROBORACAO` quando as duas incidem: a
 * sala interditada não vira "entre acompanhado". E a travessia por papel é
 * verificada POR RESTRIÇÃO, não para o conjunto — atravessar a manutenção não
 * atravessa a interdição sanitária, ainda que a mesma pessoa tenha os dois
 * papéis.
 */
export function lerExercicio(entrada: EntradaDeExercicio): LeituraDeExercicio {
  const incidentes = entrada.restricoes.filter(
    (restricao) =>
      incideSobre(restricao, entrada.endpointId, entrada.zonaId) &&
      janelaVigente(restricao.janela, entrada.agora)
  );

  if (incidentes.length === 0) {
    return {
      exercicio: entrada.restricoes.length === 0 ? 'NAO_AVALIADO' : 'EXERCIVEL',
      restricoes: [],
      especies: [],
      atravessadas: [],
      explicacao:
        entrada.restricoes.length === 0
          ? 'Nenhuma restrição local declarada para este recurso. O exercício não foi avaliado, ' +
            'e isso não é o mesmo que estar liberado por decisão.'
          : 'Nenhuma restrição local vigente incide sobre este recurso neste instante.'
    };
  }

  const atravessadas: string[] = [];
  const barreiras: RestricaoLocalDoRecurso[] = [];
  for (const restricao of incidentes) {
    const atravessa = restricao.papeisQueAtravessam.some((papel) => entrada.papeis.includes(papel));
    if (atravessa) atravessadas.push(restricao.id);
    else barreiras.push(restricao);
  }

  const especies = [...new Set(incidentes.map((r) => r.especie))];
  const ids = incidentes.map((r) => r.id);

  if (barreiras.length === 0) {
    return {
      exercicio: 'EXERCIVEL',
      restricoes: ids,
      especies,
      atravessadas,
      explicacao:
        `${incidentes.length} restrição(ões) local(is) vigente(s) neste recurso, ` +
        `atravessada(s) pelo papel de quem pede: ${especies.map((e) => ROTULO_DA_RESTRICAO[e]).join('; ')}. ` +
        'A restrição continua vigente e a travessia fica registrada.'
    };
  }

  const suspende = barreiras.some((r) => r.efeito === 'SUSPENDE_EXERCICIO');
  const comDetalhe = barreiras
    .map((r) => `${ROTULO_DA_RESTRICAO[r.especie]} (${r.motivo}, declarada por ${r.declaradaPor})`)
    .join('; ');

  if (suspende) {
    return {
      exercicio: 'SUSPENSO_LOCALMENTE',
      restricoes: ids,
      especies,
      atravessadas,
      explicacao:
        `O direito continua vigente e o exercício está suspenso neste instante: ${comDetalhe}. ` +
        'Nada foi revogado — quando a restrição vencer, a entrada volta sem reemissão.'
    };
  }

  return {
    exercicio: 'EXIGE_CORROBORACAO',
    restricoes: ids,
    especies,
    atravessadas,
    explicacao:
      `O direito continua vigente e a entrada depende de um segundo fato: ${comDetalhe}. ` +
      'Acompanhamento, segunda pessoa ou autorização do plantão resolvem o instante sem ' +
      'mexer no direito.'
  };
}

/** O exercício impede a entrada AGORA? Leitura para o motor de política. */
export function exercicioImpedeAgora(exercicio: ExercicioDoDireito): boolean {
  return exercicio === 'SUSPENSO_LOCALMENTE';
}

/**
 * A porta do host para as restrições locais.
 *
 * Quem conhece ocupação de leito, procedimento em curso e ordem de manutenção é
 * o sistema assistencial e o de facilities — nunca este produto. Reimplementar
 * isso aqui produziria uma segunda verdade sobre o que está acontecendo na sala,
 * que é a pior espécie de segunda verdade: ela decide porta.
 *
 * E uma fronteira que esta porta não atravessa: o que entra é a RESTRIÇÃO, não
 * o motivo clínico dela. `PRIVACIDADE_DO_PACIENTE` é projeção suficiente; o
 * diagnóstico que a justifica fica no prontuário (ADR-0007, itens 24 e 25).
 */
export interface ConsultaDeRestricoesLocais {
  vigentesPara(endpointId: string, zonaId: string, agora: Date): readonly RestricaoLocalDoRecurso[];
}

export const SEM_RESTRICOES_LOCAIS: ConsultaDeRestricoesLocais = Object.freeze({
  vigentesPara(): readonly RestricaoLocalDoRecurso[] {
    return [];
  }
});

export class RestricoesLocaisEmMemoria implements ConsultaDeRestricoesLocais {
  private readonly restricoes: RestricaoLocalDoRecurso[] = [];

  constructor(restricoes: readonly RestricaoLocalDoRecurso[] = []) {
    this.restricoes.push(...restricoes);
  }

  declarar(restricao: RestricaoLocalDoRecurso): void {
    this.restricoes.push(restricao);
  }

  vigentesPara(
    endpointId: string,
    zonaId: string,
    agora: Date
  ): readonly RestricaoLocalDoRecurso[] {
    return this.restricoes.filter(
      (restricao) => incideSobre(restricao, endpointId, zonaId) && janelaVigente(restricao.janela, agora)
    );
  }

  /** Todas as declaradas, vigentes ou não. É o que a tela de auditoria lista. */
  declaradas(): readonly RestricaoLocalDoRecurso[] {
    return [...this.restricoes];
  }
}
