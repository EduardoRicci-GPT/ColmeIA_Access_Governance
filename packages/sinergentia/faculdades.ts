// ---------------------------------------------------------------------------
// FACULDADES — o que se usa, e não de quem se depende
//
// A palavra é da Aletheia e carrega a decisão inteira: "um provedor é de quem
// se depende; uma faculdade é o que se usa". Modelos abertos, treinados por
// outros, dos quais este produto aprende sem se tornar subproduto de nenhum. O
// que é dele — os quatro motores, o ledger, as regras, o Health Score que abre
// em componentes — não vem de nenhum deles.
//
// A CONSEQUÊNCIA PRÁTICA, E É ELA QUE IMPORTA
//
// Trocar de faculdade é editar dado, não código. E o relatório sempre diz qual
// falou.
//
// O DEGRAU ZERO, QUE NA ORIGEM É O ÚLTIMO
//
// Na Aletheia o núcleo determinístico é o que responde quando nenhum modelo
// responde — capacidade reduzida, recibo honesto de indisponibilidade. Aqui ele
// é o PRIMEIRO degrau, e a inversão é a tese deste pacote.
//
// A razão é de domínio, não de gosto. A Aletheia analisa material aberto da
// internet, onde a leitura qualitativa é o produto: sem modelo, resta pouco. A
// ColmeIA apura estado de acesso com instrumentos que já produzem frase pronta
// — `resumirDivergencias`, `descreverReconciliacao`, `explicarAcesso` são
// determinísticos e completos. Aqui o modelo não preenche ausência: ele
// REESCREVE presença, para um público que a frase técnica não alcança.
//
// Por isso a escalada só acontece quando o degrau determinístico DECLARA que
// não atende o pedido — nunca porque um modelo poderia escrever mais bonito.
// "Mais bonito" é o critério que transforma uma casa independente em cliente.
// ---------------------------------------------------------------------------

/** A que a faculdade serve. Roteamento é por tarefa, não por preferência. */
export type Tarefa =
  /** Reescrever o apurado para um público que a frase técnica não alcança. */
  | 'leitura_por_publico'
  /** Panorama curto de um ciclo, sobre material já apurado. */
  | 'sintese_curta';

/** De quem este produto aprendeu. Doador, não dono. */
export type Escola = 'ColmeIA' | 'doadora' | 'desconhecida';

export type ProtocoloDeFaculdade = 'deterministico-colmeia' | 'openai-chat' | 'lmstudio-v1';

export interface PedidoAFaculdade {
  tarefa: Tarefa;
  /** O material apurado, em texto. É contra ele que a ancoragem confere. */
  material: string;
  /** Para quem se escreve. A faculdade determinística usa; as outras também. */
  publico: string;
  /** Instrução de forma. Nunca instrução de conteúdo — conteúdo é o material. */
  instrucao: string;
}

export interface RespostaDaFaculdade {
  /**
   * `false` quando a faculdade declara que não atende este pedido.
   *
   * É o único jeito legítimo de subir um degrau. Uma faculdade que responde
   * `atendeu: true` com texto ruim não é escalada — é aceita, e o produto
   * entrega o que ela deu. Escalar por qualidade percebida exigiria um juiz, e
   * o juiz seria outro modelo.
   */
  atendeu: boolean;
  texto: string;
  /** Por que não atendeu, quando não atendeu. Vai para a cadeia como está. */
  motivo?: string;
}

/**
 * A porta. Quem a implementa é quem tem a capacidade — inclusive o núcleo
 * determinístico desta casa, que a implementa como qualquer outra.
 *
 * Nada aqui faz E/S: a faculdade é injetada, como `CanalDeAviso` e
 * `AutoridadeDoHost`. O núcleo puro deste produto não conhece rede, e uma
 * faculdade remota vive fora dele — o que garante, por construção, que o motor
 * de política não tenha por onde consultar modelo nenhum.
 */
export interface Faculdade {
  readonly id: string;
  readonly nome: string;
  readonly escola: Escola;
  readonly protocolo: ProtocoloDeFaculdade;
  /** Roda nesta casa? O degrau determinístico e um modelo local são locais. */
  readonly local: boolean;
  readonly tarefas: readonly Tarefa[];
  responder(pedido: PedidoAFaculdade): Promise<RespostaDaFaculdade>;
}

export interface RegistroDeFaculdade {
  faculdade: Faculdade;
  /**
   * Ordem de consulta. Menor primeiro, e o determinístico é 0.
   *
   * Número explícito em vez de ordem de array: a ordem de um array muda quando
   * alguém insere uma linha no meio, e a ordem desta cascata é decisão de
   * produto — não pode depender de onde a linha caiu.
   */
  degrau: number;
  /**
   * Introduções por prosa, MEDIDO pela ancoragem. `null` = ainda não medido.
   *
   * O campo é da Aletheia e é o que separa uma faculdade escolhida de uma
   * faculdade preferida. O núcleo determinístico tem 0 por construção, e isso
   * não é mérito dele: é que ele não gera texto novo, então não tem como
   * inventar âncora.
   */
  taxaDeFabricacao: number | null;
  /** Quantas prosas já foram conferidas para chegar a essa taxa. */
  prosasVerificadas: number;
}
