// ---------------------------------------------------------------------------
// ADAPTADOR DE MEMÓRIA
//
// Serve a testes e à conformidade do contrato. Não é armazenamento de produção
// e não finge ser: some quando o processo morre, e diz isso aqui.
//
// Ele existe sobretudo para uma coisa: ser o primeiro a passar na suíte de
// conformidade, de modo que a suíte esteja provada ANTES de existir adaptador
// de Postgres para submeter a ela. Uma suíte que nasce junto com a primeira
// implementação tende a ser escrita para aquela implementação passar.
// ---------------------------------------------------------------------------

import { ArmazenamentoDoLedger, EventoLedger, SequenciaJaExiste } from '../tipos';

export class ArmazenamentoEmMemoria<TTipo extends string = string>
  implements ArmazenamentoDoLedger<TTipo>
{
  private eventos: EventoLedger<TTipo>[] = [];
  private fila: Promise<unknown> = Promise.resolve();

  /** Cópia defensiva: quem lê não pode alterar a cadeia por referência. */
  public async ler(): Promise<EventoLedger<TTipo>[]> {
    return this.eventos.map((e) => ({ ...e }));
  }

  public async anexar(evento: EventoLedger<TTipo>): Promise<void> {
    if (this.eventos.some((e) => e.sequencia === evento.sequencia)) {
      throw new SequenciaJaExiste(evento.sequencia);
    }
    this.eventos.push({ ...evento });
  }

  public async emExclusaoMutua<R>(fn: () => Promise<R>): Promise<R> {
    const proximo = this.fila.then(fn, fn);
    // A fila não é envenenada por uma falha: a próxima escrita ainda corre e
    // declara a própria falha a quem chamou.
    this.fila = proximo.then(
      () => undefined,
      () => undefined
    );
    return proximo;
  }

  /**
   * Só para testes de adulteração: substitui a cadeia sem passar pelo kernel,
   * como faria um atacante com acesso ao armazenamento.
   *
   * Um adaptador de produção NÃO deve ter equivalente — no Postgres o papel
   * disto é o `REVOKE UPDATE, DELETE`, que torna a operação impossível para a
   * aplicação em vez de disponível.
   */
  public substituirParaTeste(eventos: EventoLedger<TTipo>[]): void {
    this.eventos = eventos.map((e) => ({ ...e }));
  }
}
