// ---------------------------------------------------------------------------
// LEDGER — a classe que compõe a cadeia pura com a porta de armazenamento
//
// Não guarda a cadeia em memória. A instância anterior mantinha um cache e
// precisava forçar releitura em toda operação, porque outra aba podia ter
// escrito. Com a porta, quem sabe se há cache é o adaptador — e o kernel
// deixa de ter uma opinião sobre um assunto que não é dele.
// ---------------------------------------------------------------------------

import { proximoElo, verificarCadeia } from './cadeia';
import {
  ArmazenamentoDoLedger,
  EventoLedger,
  PedidoDeRegistro,
  SequenciaJaExiste,
  VerdictoDeIntegridade
} from './tipos';

export interface OpcoesDoLedger {
  /** Prefixo dos identificadores. A Aletheia usa 'PRU-LOCAL'. */
  prefixoDeId?: string;
  /** Relógio injetável — cadeia com hash não reproduzível não é evidência. */
  agora?: () => string;
  /**
   * Quantas vezes reagir a uma corrida perdida antes de desistir.
   *
   * Perder a corrida é normal quando há concorrência: dois processos leem o
   * mesmo topo, ambos montam a sequência N, e o armazenamento aceita um só. O
   * perdedor releu o topo e tenta de novo — o registro não some, atrasa.
   */
  tentativas?: number;
}

export class Ledger<TTipo extends string = string> {
  private readonly prefixoDeId: string;
  private readonly agora: () => string;
  private readonly tentativas: number;

  constructor(
    private readonly armazenamento: ArmazenamentoDoLedger<TTipo>,
    opcoes: OpcoesDoLedger = {}
  ) {
    this.prefixoDeId = opcoes.prefixoDeId ?? 'LED';
    this.agora = opcoes.agora ?? (() => new Date().toISOString());
    this.tentativas = Math.max(1, opcoes.tentativas ?? 5);
  }

  public async obterCadeia(): Promise<EventoLedger<TTipo>[]> {
    return this.armazenamento.ler();
  }

  public async topo(): Promise<EventoLedger<TTipo> | null> {
    const c = await this.armazenamento.ler();
    return c.length > 0 ? (c[c.length - 1] as EventoLedger<TTipo>) : null;
  }

  /**
   * Acrescenta um elo. Append-only: não há atualizar nem remover, aqui nem na
   * porta. O hash inclui o do anterior, de modo que alterar um elo quebra a
   * verificação de todos os posteriores.
   */
  public async registrar(pedido: PedidoDeRegistro<TTipo>): Promise<EventoLedger<TTipo>> {
    return this.armazenamento.emExclusaoMutua(async () => {
      let ultimoErro: unknown = null;

      for (let tentativa = 0; tentativa < this.tentativas; tentativa++) {
        // Relê o topo A CADA tentativa: se perdemos a corrida, o topo mudou e
        // continuar com o antigo produziria um elo pendurado no vazio.
        const topo = await this.topo();
        const elo = await proximoElo<TTipo>({
          topo,
          tipo: pedido.tipo,
          objeto: pedido.objeto,
          decisao: pedido.decisao,
          autor: pedido.autor,
          corpo: pedido.corpo,
          detalhes: pedido.detalhes,
          agora: this.agora(),
          prefixoDeId: this.prefixoDeId
        });

        try {
          await this.armazenamento.anexar(elo);
          return elo;
        } catch (e) {
          if (e instanceof SequenciaJaExiste) {
            ultimoErro = e;
            continue;
          }
          throw e;
        }
      }

      throw new Error(
        `ledger: ${this.tentativas} tentativas perderam a corrida de escrita. ` +
          `Último motivo: ${(ultimoErro as Error)?.message ?? 'desconhecido'}`
      );
    });
  }

  public async verificar(): Promise<VerdictoDeIntegridade> {
    return verificarCadeia(await this.armazenamento.ler());
  }
}
