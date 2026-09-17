// ---------------------------------------------------------------------------
// ROTEADOR DE FACULDADES — a cascata que mantém a casa independente
//
// Uma regra, e tudo o mais decorre dela:
//
//   O DEGRAU DETERMINÍSTICO É CONSULTADO SEMPRE E PRIMEIRO. Os outros só
//   existem quando ele declara que não atende — nunca quando ele atende mal.
//
// A diferença entre as duas cláusulas é a diferença entre um produto que usa
// modelos e um que depende deles. "Atende mal" é julgamento de qualidade, e
// quem julgaria seria outro modelo; a partir daí a cascata inteira vira
// decoração, porque o degrau caro é consultado sempre.
//
// TRÊS GUARDAS, CADA UMA CONTRA UMA FALHA JÁ VISTA
//
//   · CIRCUITO. Duas falhas seguidas e a faculdade sai de cena por um tempo.
//     Sem isto, uma faculdade caída é reconsultada a cada ciclo e cada
//     reconsulta custa o timeout inteiro.
//
//   · ORÇAMENTO DO CICLO — não de cada faculdade. A origem deste guarda está
//     escrita na Aletheia e merece ser repetida: "o laço tinha prazo por
//     faculdade e nenhum teto para o conjunto: duas remotas a 45s somam 90s, e
//     a plataforma encerra a função aos 60s — no meio da segunda tentativa,
//     antes que o núcleo determinístico chegue a responder. Redundância sem
//     orçamento não troca uma resposta pobre por uma boa: troca uma resposta
//     pobre por resposta nenhuma."
//
//     Aqui esse defeito não pode acontecer, porque o determinístico é o
//     primeiro e já respondeu antes de qualquer relógio começar a correr. O
//     orçamento continua existindo pelo motivo oposto: limitar quanto tempo se
//     gasta tentando MELHORAR uma resposta que já existe.
//
//   · ANCORAGEM. Toda prosa de faculdade não determinística é conferida contra
//     o material. Reprovou, é descartada, e a resposta determinística — que
//     nunca foi jogada fora — é entregue no lugar.
//
// O QUE SEMPRE SOBRA
//
// Nenhum caminho deste roteador devolve "sem resposta". O degrau zero já
// respondeu; o pior desfecho possível é entregar o que a casa apurou, dizendo
// que ninguém a reescreveu e por quê. É a diferença entre capacidade reduzida e
// indisponibilidade — e é por isso que a cascata é uma melhoria opcional, e não
// uma dependência.
// ---------------------------------------------------------------------------

import { Relogio } from '../dominio/tempo';
import { SINERGENTIA } from './identidade';
import { ResultadoDaAncoragem, verificarAncoragem } from './ancoragem';
import {
  Faculdade,
  PedidoAFaculdade,
  RegistroDeFaculdade,
  RespostaDaFaculdade,
  Tarefa
} from './faculdades';

export type DesfechoDaTentativa =
  | 'ATENDEU'
  | 'DECLINOU'
  | 'FALHOU'
  | 'CIRCUITO_ABERTO'
  | 'ORCAMENTO_ESGOTADO'
  | 'ANCORAGEM_REPROVOU'
  | 'NAO_SERVE_A_TAREFA';

export interface TentativaDeFaculdade {
  faculdadeId: string;
  degrau: number;
  local: boolean;
  desfecho: DesfechoDaTentativa;
  duracaoMs: number;
  detalhe?: string;
  /** Presente quando houve prosa a conferir. */
  ancoragem?: ResultadoDaAncoragem;
}

export interface LeituraRoteada {
  texto: string;
  /** Quem de fato escreveu o que está sendo entregue. */
  faculdadeId: string;
  /** A entrega veio do degrau determinístico desta casa? */
  determinista: boolean;
  /** Houve consulta a alguma faculdade fora do degrau zero? */
  consultouFaculdadeExterna: boolean;
  /** Toda a rota, na ordem. É o que vai para a cadeia e para a tela. */
  tentativas: readonly TentativaDeFaculdade[];
  /** Frase determinística explicando a rota. Nunca gerada por modelo. */
  explicacao: string;
}

export interface OpcoesDoRoteador {
  /** Falhas seguidas antes de abrir o circuito. */
  limiarDeFalhas?: number;
  pausaDoCircuitoMs?: number;
  /**
   * Teto de tempo para MELHORAR uma resposta que já existe. `0` desliga.
   *
   * O padrão é curto de propósito: o produto já tem a resposta na mão desde o
   * degrau zero, e qualquer segundo gasto aqui é gasto sobre algo que já
   * funciona.
   */
  orcamentoDoCicloMs?: number;
}

interface EstadoDoCircuito {
  falhasConsecutivas: number;
  abertoAte: number;
}

const PADROES = Object.freeze({
  limiarDeFalhas: 2,
  pausaDoCircuitoMs: 60_000,
  orcamentoDoCicloMs: 20_000
});

export class RoteadorDeFaculdades {
  private readonly circuitos = new Map<string, EstadoDoCircuito>();
  private readonly opcoes: Required<OpcoesDoRoteador>;
  private readonly registros: readonly RegistroDeFaculdade[];

  constructor(
    registros: readonly RegistroDeFaculdade[],
    private readonly relogio: Relogio,
    opcoes: OpcoesDoRoteador = {}
  ) {
    this.registros = [...registros].sort((a, b) => a.degrau - b.degrau);
    this.opcoes = {
      limiarDeFalhas: opcoes.limiarDeFalhas ?? PADROES.limiarDeFalhas,
      pausaDoCircuitoMs: opcoes.pausaDoCircuitoMs ?? PADROES.pausaDoCircuitoMs,
      orcamentoDoCicloMs: opcoes.orcamentoDoCicloMs ?? PADROES.orcamentoDoCicloMs
    };
  }

  /** Quem está na cascata, em ordem de consulta. A tela mostra isto. */
  catalogo(): readonly RegistroDeFaculdade[] {
    return this.registros;
  }

  /**
   * Percorre a cascata e devolve o que for entregue — nunca vazio.
   *
   * Lança se não houver degrau zero, e a exceção é o ponto: um roteador sem
   * faculdade determinística é um produto que depende de modelo para falar, e
   * esse estado não deve ser alcançável por configuração distraída. É o mesmo
   * desenho do leitor do R-VEP, que lança em vez de aproximar.
   */
  async rotear(pedido: PedidoAFaculdade): Promise<LeituraRoteada> {
    const tentativas: TentativaDeFaculdade[] = [];
    const base = this.registros.find((registro) => registro.degrau === 0);
    if (!base) {
      throw new Error(
        'Roteador sem faculdade determinística no degrau 0. Esta casa não fala por modelo: ' +
          'sem o degrau determinístico não há o que entregar, e devolver silêncio seria ' +
          'transformar uma melhoria opcional em dependência.'
      );
    }

    const respostaBase = await this.consultar(base, pedido, tentativas);
    if (!respostaBase || !respostaBase.atendeu) {
      // O degrau zero não atendeu. Só aqui a escalada é legítima.
      const melhor = await this.escalar(pedido, tentativas);
      if (melhor) return this.entregar(melhor.texto, melhor.faculdade, tentativas, false);
      return this.entregar(
        respostaBase?.texto ?? '',
        base.faculdade,
        tentativas,
        true,
        respostaBase?.motivo
      );
    }

    // Atendeu. Nada mais é consultado, e esta é a linha que mantém a casa
    // independente: o caminho feliz não toca em modelo nenhum.
    return this.entregar(respostaBase.texto, base.faculdade, tentativas, true);
  }

  private async escalar(
    pedido: PedidoAFaculdade,
    tentativas: TentativaDeFaculdade[]
  ): Promise<{ texto: string; faculdade: Faculdade } | null> {
    const inicio = this.relogio.agora().getTime();
    for (const registro of this.registros) {
      if (registro.degrau === 0) continue;
      if (!this.serve(registro.faculdade, pedido.tarefa)) {
        tentativas.push({
          faculdadeId: registro.faculdade.id,
          degrau: registro.degrau,
          local: registro.faculdade.local,
          desfecho: 'NAO_SERVE_A_TAREFA',
          duracaoMs: 0,
          detalhe: `A faculdade não declara a tarefa ${pedido.tarefa}.`
        });
        continue;
      }
      if (this.estourouOrcamento(inicio)) {
        tentativas.push({
          faculdadeId: registro.faculdade.id,
          degrau: registro.degrau,
          local: registro.faculdade.local,
          desfecho: 'ORCAMENTO_ESGOTADO',
          duracaoMs: 0,
          detalhe:
            `O ciclo passou de ${this.opcoes.orcamentoDoCicloMs} ms tentando reescrever uma ` +
            'resposta que esta casa já tinha. A cascata parou aqui.'
        });
        break;
      }

      const resposta = await this.consultar(registro, pedido, tentativas);
      if (!resposta || !resposta.atendeu) continue;

      // A guarda que a identidade exige: a parceria não produz número.
      const ancoragem = verificarAncoragem(resposta.texto, pedido.material);
      const ultima = tentativas[tentativas.length - 1];
      if (ultima) ultima.ancoragem = ancoragem;
      if (!ancoragem.aprovada) {
        if (ultima) {
          ultima.desfecho = 'ANCORAGEM_REPROVOU';
          ultima.detalhe = ancoragem.explicacao;
        }
        continue;
      }
      return { texto: resposta.texto, faculdade: registro.faculdade };
    }
    return null;
  }

  private serve(faculdade: Faculdade, tarefa: Tarefa): boolean {
    return faculdade.tarefas.includes(tarefa);
  }

  private estourouOrcamento(inicio: number): boolean {
    if (this.opcoes.orcamentoDoCicloMs <= 0) return false;
    return this.relogio.agora().getTime() - inicio >= this.opcoes.orcamentoDoCicloMs;
  }

  private async consultar(
    registro: RegistroDeFaculdade,
    pedido: PedidoAFaculdade,
    tentativas: TentativaDeFaculdade[]
  ): Promise<RespostaDaFaculdade | null> {
    const agora = this.relogio.agora().getTime();
    const circuito = this.circuitos.get(registro.faculdade.id);
    if (circuito && circuito.abertoAte > agora) {
      tentativas.push({
        faculdadeId: registro.faculdade.id,
        degrau: registro.degrau,
        local: registro.faculdade.local,
        desfecho: 'CIRCUITO_ABERTO',
        duracaoMs: 0,
        detalhe:
          `Circuito aberto após ${circuito.falhasConsecutivas} falha(s) seguida(s). ` +
          'Reconsultar uma faculdade caída custa o prazo inteiro e não muda o desfecho.'
      });
      return null;
    }

    try {
      const resposta = await registro.faculdade.responder(pedido);
      const duracaoMs = this.relogio.agora().getTime() - agora;
      this.circuitos.delete(registro.faculdade.id);
      tentativas.push({
        faculdadeId: registro.faculdade.id,
        degrau: registro.degrau,
        local: registro.faculdade.local,
        desfecho: resposta.atendeu ? 'ATENDEU' : 'DECLINOU',
        duracaoMs,
        detalhe: resposta.motivo
      });
      return resposta;
    } catch (erro) {
      const duracaoMs = this.relogio.agora().getTime() - agora;
      const falhas = (circuito?.falhasConsecutivas ?? 0) + 1;
      this.circuitos.set(registro.faculdade.id, {
        falhasConsecutivas: falhas,
        abertoAte:
          falhas >= this.opcoes.limiarDeFalhas ? agora + this.opcoes.pausaDoCircuitoMs : 0
      });
      tentativas.push({
        faculdadeId: registro.faculdade.id,
        degrau: registro.degrau,
        local: registro.faculdade.local,
        desfecho: 'FALHOU',
        duracaoMs,
        detalhe: erro instanceof Error ? erro.message : String(erro)
      });
      return null;
    }
  }

  private entregar(
    texto: string,
    faculdade: Faculdade,
    tentativas: readonly TentativaDeFaculdade[],
    determinista: boolean,
    motivoDaBase?: string
  ): LeituraRoteada {
    const consultouFaculdadeExterna = tentativas.some(
      (tentativa) => tentativa.degrau > 0 && tentativa.desfecho !== 'NAO_SERVE_A_TAREFA'
    );
    return {
      texto,
      faculdadeId: faculdade.id,
      determinista,
      consultouFaculdadeExterna,
      tentativas,
      explicacao: explicarRota(tentativas, faculdade, determinista, motivoDaBase)
    };
  }
}

/** Frase determinística sobre a rota. Nunca gerada por modelo — como tudo aqui. */
export function explicarRota(
  tentativas: readonly TentativaDeFaculdade[],
  entregue: Faculdade,
  determinista: boolean,
  motivoDaBase?: string
): string {
  const consultadas = tentativas.length;
  // A condição é "o degrau zero ATENDEU", e não "houve uma tentativa só".
  //
  // Escrever a segunda produziria a frase mais enganosa que esta camada pode
  // emitir: numa instalação sem faculdade contratada, o degrau zero declina
  // para a direção, ninguém mais existe para tentar, e o painel diria
  // "respondido pelo núcleo determinístico" — verdadeiro e calado sobre o fato
  // de que a leitura pedida não foi produzida.
  if (determinista && motivoDaBase === undefined) {
    return (
      `Respondido pelo núcleo determinístico desta casa (${entregue.id}). ` +
      'Nenhuma faculdade de linguagem foi consultada.'
    );
  }
  const reprovadas = tentativas.filter((t) => t.desfecho === 'ANCORAGEM_REPROVOU').length;
  const cauda =
    reprovadas > 0
      ? ` ${reprovadas} prosa(s) foram descartadas por introduzir identificador ou número ausente do material.`
      : '';
  if (determinista) {
    const outras = consultadas - 1;
    const tentou =
      outras <= 0
        ? 'Nenhuma outra faculdade está na cascata desta instalação'
        : `Nenhuma das ${outras} faculdade(s) consultadas depois dele produziu prosa aceitável`;
    return (
      `O que está acima é o MATERIAL APURADO, não a leitura pedida. O degrau determinístico ` +
      `declinou porque ${motivoDaBase ?? 'não atende este pedido'} ${tentou}.${cauda} ` +
      `${SINERGENTIA.nomePublico} não decide, não age e não produz número.`
    );
  }
  return (
    `Reescrito pela faculdade ${entregue.id} (${entregue.escola}, ` +
    `${entregue.local ? 'local' : 'remota'}) após ${consultadas} tentativa(s), e conferido ` +
    `contra o material pela ancoragem.${cauda} O conteúdo é o apurado por esta casa; a ` +
    `faculdade apenas reescreveu a forma. ${SINERGENTIA.nomePublico} não decide, não age e ` +
    'não produz número.'
  );
}
