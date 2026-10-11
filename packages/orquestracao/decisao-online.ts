// ---------------------------------------------------------------------------
// DECISÃO DE MODO ACCESS — a porta que o ADR-0008 declarou e que ninguém
// percorria
//
// O ADR-0008 separou dois modos de decisão com argumento correto: ENTITLEMENT
// pergunta "este direito deveria existir?", ACCESS pergunta "esta pessoa pode
// entrar AGORA?". A escala de turno decide no segundo e não no primeiro, porque
// revogar a credencial do plantonista às 19h01 e reemiti-la às 7h produziria
// churn diário em milhares de equipamentos sem nenhuma segurança adicional.
//
// E então: `REGRA_TURNO` guardava `modo === 'ACCESS'`, o tipo existia, o motor
// aceitava os dois, e NENHUMA execução deste repositório jamais montou um
// pedido em modo ACCESS. A capacidade estava completa, testada por dentro, e
// sem chamador — a oitava ocorrência do D-022 neste código, e a mais antiga de
// todas, porque estava ali desde o segundo dia.
//
// O achado veio ao incorporar os deltas de outubro: duas das três regras novas
// (restrição local, prova de identificador) só fazem sentido em modo ACCESS, e
// ao escrevê-las ficou visível que elas nasceriam mortas. É o padrão descrito no
// próprio ledger — capacidade correta, sem quem a chame — e a correção é a
// mesma: dar-lhe um chamador real.
//
// QUEM CHAMA ISTO, NO MUNDO
//
// O equipamento em modo online, pelo gateway, no instante em que alguém encosta
// o crachá: é a capacidade `ONLINE_DECISION` que a topologia já declarava por
// endpoint. E a portaria, quando um veículo chega e a câmera reconhece a placa
// antes de qualquer credencial ser apresentada.
//
// A HONESTIDADE QUE ESTA PORTA PRESERVA
//
// A resposta NÃO é um booleano. Ela carrega o efeito de política, a leitura do
// exercício, o que a identificação prova, e — quando o endpoint não suporta
// decisão online — a recusa de responder. Um equipamento que não consulta a
// ColmeIA no instante do acesso não pode receber "pode entrar": ele decidiu
// sozinho, e inventar uma resposta nossa para um ato que já aconteceu
// introduziria no sistema a mistura de corpos que o ADR-0003 separa.
// ---------------------------------------------------------------------------

import {
  CredencialApresentada,
  IdentificadorObservado,
  AfirmacaoDeIdentidade,
  VinculoDeCredencial,
  ProvaDeAutorizacao,
  avaliarProva
} from '../dominio/identificador';
import {
  EspecieDeRestricaoLocal,
  ExercicioDoDireito,
  SEM_RESTRICOES_LOCAIS,
  lerExercicio
} from '../dominio/restricao-local';
import { AccessState, LeituraDeAcessoFisico, lerAcessoFisico } from '../dominio/estado';
import { CredentialMethod } from '../dominio/topologia';
import { DecisaoDePolitica, PedidoDeDecisao } from '../policy-engine/tipos';
import { PolicyEngine } from '../policy-engine/motor';
import { MundoLogico, montarContexto } from '../entitlement-reconciliation/motor';
import { Relogio } from '../dominio/tempo';

export interface ConsultaDeAcessoAgora {
  id: string;
  relationshipId: string;
  endpointId: string;
  metodo?: CredentialMethod;
  /** A credencial efetivamente apresentada, quando houve apresentação. */
  apresentada?: CredencialApresentada;
  /** O vínculo da credencial apresentada, quando registrado. */
  vinculoDaCredencial?: VinculoDeCredencial;
  /** O que o sensor observou, quando há câmera ou leitor passivo. */
  observado?: IdentificadorObservado;
  afirmacao?: AfirmacaoDeIdentidade;
  /** O estado de acesso conhecido deste par, para a leitura física. */
  estado?: AccessState;
}

export type MotivoDeNaoResponder =
  | 'ENDPOINT_DESCONHECIDO'
  | 'VINCULO_DESCONHECIDO'
  | 'ENDPOINT_SEM_DECISAO_ONLINE';

export interface RespostaDeAcessoAgora {
  consultaId: string;
  endpointId: string;
  relationshipId: string;
  /** `null` quando o produto se recusa a responder, e diz por quê. */
  decisao: DecisaoDePolitica | null;
  naoRespondido?: MotivoDeNaoResponder;
  exercicio?: ExercicioDoDireito;
  especiesDeRestricaoLocal?: readonly EspecieDeRestricaoLocal[];
  prova?: ProvaDeAutorizacao;
  /**
   * O que o mundo físico diz, ao lado do que a política diz.
   *
   * Vai junto de propósito, e é o campo que impede a resposta de mentir nos
   * dois sentidos: a política pode conceder sobre um equipamento cuja última
   * evidência é de revogação confirmada, e a tela precisa dizer as duas coisas.
   */
  leituraFisica?: LeituraDeAcessoFisico;
  explicacao: string;
}

/**
 * O atendente da decisão online.
 *
 * Recebe o mundo lógico pelo mesmo caminho do motor de direitos — e isso é
 * deliberado: duas montagens de contexto diferentes produziriam duas verdades
 * sobre o mesmo pedido, e a divergência apareceria exatamente no caso raro em
 * que alguém está no corredor esperando a porta.
 */
export class AtendenteDeAcesso {
  constructor(
    private readonly policyEngine: PolicyEngine,
    private readonly relogio: Relogio,
    /**
     * Endpoints que a instalação declarou com decisão online. Fora desta
     * lista, o produto se recusa a responder — ver o comentário do topo.
     */
    private readonly exigeDecisaoOnline = true
  ) {}

  responder(mundo: MundoLogico, consulta: ConsultaDeAcessoAgora): RespostaDeAcessoAgora {
    const agora = this.relogio.agora();
    const endpoint = mundo.topologia.endpoints.find((e) => e.id === consulta.endpointId);
    const vinculo = mundo.vinculos.find((v) => v.id === consulta.relationshipId);

    const base = {
      consultaId: consulta.id,
      endpointId: consulta.endpointId,
      relationshipId: consulta.relationshipId
    };

    if (!endpoint) {
      return {
        ...base,
        decisao: null,
        naoRespondido: 'ENDPOINT_DESCONHECIDO',
        explicacao:
          `O endpoint ${consulta.endpointId} não consta na topologia. O produto não decide sobre ` +
          'porta que não conhece, e responder "negado" faria a tela afirmar uma política sobre ' +
          'um recurso que não existe no cadastro.'
      };
    }
    if (!vinculo) {
      return {
        ...base,
        decisao: null,
        naoRespondido: 'VINCULO_DESCONHECIDO',
        explicacao:
          `O vínculo ${consulta.relationshipId} não consta no mundo lógico. É negativa de fato — ` +
          'ninguém entra sem vínculo —, e ela não vem deste motor: vem da ausência de cadastro, ' +
          'que é outro problema e tem outro dono.'
      };
    }
    if (this.exigeDecisaoOnline && !endpoint.capacidades.includes('ONLINE_DECISION')) {
      return {
        ...base,
        decisao: null,
        naoRespondido: 'ENDPOINT_SEM_DECISAO_ONLINE',
        explicacao:
          `${endpoint.nome} não declara a capacidade ONLINE_DECISION: ele decide sozinho, com a ` +
          'lista que tem gravada. A ColmeIA não participou deste acesso, e dizer o contrário ' +
          'misturaria o corpo que executa com o que decide.'
      };
    }

    const restricoes = (mundo.restricoesLocais ?? SEM_RESTRICOES_LOCAIS).vigentesPara(
      endpoint.id,
      endpoint.zonaId,
      agora
    );
    const leituraDoExercicio =
      restricoes.length === 0
        ? undefined
        : lerExercicio({
            endpointId: endpoint.id,
            zonaId: endpoint.zonaId,
            papeis: vinculo.roleIds,
            agora,
            restricoes
          });

    const leituraDaProva =
      consulta.observado === undefined && consulta.apresentada === undefined
        ? undefined
        : avaliarProva({
            endpointId: endpoint.id,
            agora,
            observado: consulta.observado,
            afirmacao: consulta.afirmacao,
            apresentada: consulta.apresentada,
            vinculo: consulta.vinculoDaCredencial
          });

    const pedido: PedidoDeDecisao = {
      id: consulta.id,
      modo: 'ACCESS',
      personId: vinculo.personId,
      relationshipId: vinculo.id,
      endpointId: endpoint.id,
      momento: agora,
      metodo: consulta.metodo,
      origem: 'COLMEIA_POLICY_ENGINE',
      contexto: {
        ...montarContexto(mundo, vinculo, endpoint, agora),
        exercicioLocal: leituraDoExercicio?.exercicio,
        especiesDeRestricaoLocal: leituraDoExercicio?.especies,
        provaDeIdentificador: leituraDaProva?.prova
      }
    };

    const decisao = this.policyEngine.decidir(pedido);
    const leituraFisica = consulta.estado ? lerAcessoFisico(consulta.estado) : undefined;

    return {
      ...base,
      decisao,
      exercicio: leituraDoExercicio?.exercicio,
      especiesDeRestricaoLocal: leituraDoExercicio?.especies,
      prova: leituraDaProva?.prova,
      leituraFisica,
      explicacao: compor(decisao, leituraDoExercicio?.explicacao, leituraDaProva?.explicacao, leituraFisica)
    };
  }
}

function compor(
  decisao: DecisaoDePolitica,
  exercicio: string | undefined,
  prova: string | undefined,
  fisica: LeituraDeAcessoFisico | undefined
): string {
  const partes = [`Política: ${decisao.efeito}. ${decisao.razao}`];
  if (exercicio) partes.push(exercicio);
  if (prova) partes.push(prova);
  if (fisica === 'INDETERMINADO') {
    partes.push(
      'E uma ressalva que a decisão de política não cobre: não há evidência recente do ' +
        'equipamento sobre este par. O que a política responde é se PODE entrar, não se a porta ' +
        'vai abrir.'
    );
  }
  return partes.join(' · ');
}
