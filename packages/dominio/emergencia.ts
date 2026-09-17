// ---------------------------------------------------------------------------
// A EMERGÊNCIA PROJETADA — o vocabulário que a observabilidade pode ver
//
// A quebra de vidro nasce na governança e carrega coisas que nenhum outro
// módulo tem o que fazer com elas: a justificativa que a pessoa escreveu, o
// nome de quem invocou, a natureza declarada, a nota de quem revisou. Esta é a
// projeção que atravessa a fronteira — campo a campo, escrita à mão, pela mesma
// razão que a trilha projeta o material de revisão em vez de copiá-lo: uma
// cópia por referência faria o próximo campo acrescentado à emergência
// atravessar sozinho, sem ninguém decidir que ele podia.
//
// POR QUE DUAS PORTAS SOBRE O MESMO REGISTRO
//
// `ConsultaDeEmergencia` responde um booleano — "há janela ativa para este
// vínculo nesta porta?" — e é tudo o que o motor de política pode perguntar. O
// histórico fica fora do alcance dele DE PROPÓSITO: um motor que enxergasse
// quantas vezes a pessoa já quebrou o vidro estaria a um passo de decidir a
// porta com base nisso, e aí a exceção teria virado antecedente. Julgar
// repetição é jurisdição humana (ADR-0023).
//
// A observabilidade precisa do histórico, e o uso dela é de outra natureza:
// não decide porta nenhuma, orienta prioridade. Duas portas sobre o mesmo
// objeto é o jeito de dizer isso no tipo, em vez de no comentário.
// ---------------------------------------------------------------------------

export interface QuebraDeVidroProjetada {
  quebraId: string;
  endpointId: string;
  zonaId: string;
  abertaEm: Date;
  /**
   * A janela já fechou?
   *
   * Uma quebra EM CURSO não é dívida: é atendimento acontecendo. Só depois de
   * a janela fechar é que a prestação de contas passa a ser devida — e essa
   * distinção é o que impede o score de penalizar a emergência em si.
   */
  encerrada: boolean;
  revisada: boolean;
}

/** A porta que a observabilidade usa. Leitura, nunca decisão. */
export interface HistoricoDeEmergencias {
  projetarParaAssurance(agora: Date): readonly QuebraDeVidroProjetada[];
}
