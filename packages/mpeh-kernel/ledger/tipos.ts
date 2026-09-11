// ---------------------------------------------------------------------------
// LEDGER — tipos e a porta de armazenamento
//
// Primeiro pacote extraído da Aletheia para o kernel MPE-H, seguindo a ordem
// que o guia de integração fixou: Ledger → Calibration → HumanGate → WSG.
//
// O QUE MUDA EM RELAÇÃO AO PRUMO DA ALETHEIA
//
// A lógica de cadeia é a mesma, e continua sendo — ela já era pura, sem um
// único import. O que muda é DE ONDE vem a garantia de imutabilidade.
//
// Na Aletheia, append-only era uma propriedade do código: o serviço não expunha
// `remover`, e um gate conferia isso por reflexão. É uma garantia que cai no dia
// em que alguém escrever o método.
//
// O guia exige a garantia do BANCO — "REVOKE UPDATE, DELETE" mais trigger que
// rejeita lacuna de sequência, com a frase "a imutabilidade é do banco, não do
// ORM". Por isso a persistência sai daqui e vira porta: o kernel deixa de
// prometer imutabilidade e passa a EXIGI-LA de quem o serve, num contrato que
// todo adaptador precisa provar (ver CONTRATO.md).
// ---------------------------------------------------------------------------

/** Separação de autoridade — ADR-0003. Nenhum evento existe sem corpo de origem. */
export type CorpoDeOrigem = 'DIRETIVO' | 'CONSULTIVO' | 'EXECUTIVO' | 'HUMANO';

/**
 * Um elo da cadeia.
 *
 * `TTipo` é parametrizado porque o kernel não conhece os eventos de nenhum
 * domínio: a Aletheia registra leitura de radar e divergência entre leitores;
 * o HIVE registrará outros. Fixar o enum aqui obrigaria a bifurcar o kernel a
 * cada domínio novo — exatamente o que um kernel existe para evitar.
 */
export interface EventoLedger<TTipo extends string = string> {
  /** Posição na cadeia. Começa em 0 (gênese). Contígua, sem lacunas. */
  sequencia: number;
  id: string;
  tipo: TTipo;
  /** Sobre o que é o evento. */
  objeto: string;
  /** O que foi decidido, ou o que se registra. */
  decisao: string;
  autor: string;
  corpo: CorpoDeOrigem;
  detalhes: Record<string, unknown>;
  /** ISO-8601. */
  registradoEm: string;
  /** Hash do elo anterior. A gênese tem string vazia. */
  priorEventHash: string;
  /** SHA-256 do conteúdo canônico deste evento, incluindo o priorEventHash. */
  thisEventHash: string;
}

/** O que se pede para registrar. O kernel calcula sequência, id e hashes. */
export interface PedidoDeRegistro<TTipo extends string = string> {
  tipo: TTipo;
  objeto: string;
  decisao: string;
  autor: string;
  corpo: CorpoDeOrigem;
  detalhes?: Record<string, unknown>;
}

export interface VerdictoDeIntegridade {
  integra: boolean;
  total: number;
  rompeuNaSequencia?: number;
  motivo?: string;
}

/**
 * Erro que um adaptador DEVE lançar quando a sequência pedida já existe.
 *
 * É o sinal de que duas escritas correram e uma perdeu. Perder a escrita é
 * aceitável; perdê-la em silêncio não é — foi assim que 19 de 20 registros
 * sumiram na Aletheia antes da Onda 11, com a cadeia restante ainda se
 * declarando íntegra. Um registro que desaparece calado torna a cadeia
 * mentirosa por omissão, que é pior do que não ter cadeia.
 */
export class SequenciaJaExiste extends Error {
  constructor(public readonly sequencia: number) {
    super(`sequência ${sequencia} já existe no ledger — escrita concorrente perdeu a corrida`);
    this.name = 'SequenciaJaExiste';
  }
}

/**
 * A porta de armazenamento.
 *
 * Deliberadamente SEM `atualizar` e SEM `remover`: o que o kernel não sabe
 * pedir, nenhum adaptador precisa oferecer. A ausência é a interface.
 *
 * É assíncrona mesmo onde o armazenamento é síncrono, porque o destino
 * declarado é Postgres e uma porta síncrona fecharia essa porta.
 */
export interface ArmazenamentoDoLedger<TTipo extends string = string> {
  /** Toda a cadeia, em ordem de sequência. */
  ler(): Promise<EventoLedger<TTipo>[]>;

  /**
   * Acrescenta UM elo.
   *
   * DEVE lançar `SequenciaJaExiste` se já houver evento com aquela sequência.
   * É esta rejeição — e não a fila do kernel — que torna a corrida segura
   * quando há mais de um processo escrevendo, caso do servidor.
   */
  anexar(evento: EventoLedger<TTipo>): Promise<void>;

  /**
   * Executa `fn` em exclusão mútua com outras escritas no mesmo ledger.
   *
   * Cada substrato resolve isto do seu jeito: `navigator.locks` entre abas,
   * transação SERIALIZABLE no Postgres, fila em processo único. O kernel não
   * escolhe o mecanismo — exige o efeito.
   */
  emExclusaoMutua<R>(fn: () => Promise<R>): Promise<R>;
}
