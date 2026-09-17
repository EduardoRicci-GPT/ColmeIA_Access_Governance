// ---------------------------------------------------------------------------
// QUEBRA DE VIDRO — a emergência troca autorização prévia por prestação de
// contas posterior
//
// O produto exige duas assinaturas distintas em faixa crítica, e essa exigência
// está certa: é a defesa contra a fadiga de plantão, que é justamente quando um
// cofre de psicotrópicos costuma ser liberado às pressas. Ela também é a
// resposta errada numa parada cardíaca, porque as duas pessoas que deveriam
// assinar estão ocupadas — possivelmente com o mesmo paciente.
//
// Um sistema que só conhece a deliberação tem duas saídas conhecidas: atrasar o
// atendimento, ou ser contornado. A segunda é a que acontece — a porta é
// escorada, o crachá é emprestado, o vidro do armário é quebrado de verdade. E
// aí não há registro nenhum, que é o pior desfecho possível.
//
// O QUE SE TROCA, EXATAMENTE
//
// Não se troca controle por conveniência. Troca-se o MOMENTO do controle:
// autorização prévia vira prestação de contas posterior. Quem invoca assume,
// com nome, que havia emergência — e essa afirmação vai a revisão obrigatória,
// que não se fecha sozinha.
//
// Por isso o desenho é caro em VISIBILIDADE e barato em TEMPO:
//
//   · invocar é imediato, porque é disso que se trata;
//   · invocar em silêncio é impossível: três atos entram na cadeia;
//   · a janela é curta por construção, medida em minutos;
//   · a revisão posterior é pendência que permanece até alguém com alçada
//     fechá-la com verdicto;
//   · a pendência de aprovação original NÃO desaparece. A quebra de vidro abre
//     a porta agora; ela não aprova nada, e quando a janela fecha o acesso
//     volta a depender do caminho normal.
//
// A LINHA QUE A EMERGÊNCIA NÃO ATRAVESSA
//
// Emergência justifica pular DELIBERAÇÃO e ESCALA. Não justifica pular VÍNCULO
// nem QUALIFICAÇÃO. Quem não tem vínculo vigente não entra; quem está com a
// habilitação suspensa pelo conselho não entra — nem com emergência, nem com
// justificativa, nem com a melhor das intenções.
//
// A razão é a mesma que faz a suspensão negar em vez de pedir revisão
// (ADR-0021): o que falta ali não é permissão, e emergência é uma forma de
// conceder permissão depressa. Não há como conceder depressa uma qualificação
// que a pessoa não tem.
// ---------------------------------------------------------------------------

import { RegistroDeCalibracao } from '../mpeh-kernel/calibration/registro';
import { ConstanteCalibrada } from '../mpeh-kernel/calibration/tipos';
import { Criticidade } from '../dominio/topologia';
import { HistoricoDeEmergencias, QuebraDeVidroProjetada } from '../dominio/emergencia';
import { Relogio } from '../dominio/tempo';

const CURADOR = 'Nível E — governança de acesso ColmeIA';
const VERIFICADO_EM = '2026-09-17';

export type JanelasDeEmergencia = Record<Criticidade, number>;

/**
 * Por quanto tempo a repetição continua contando.
 *
 * Existe porque o oposto não funciona: sem janela, a contagem de uma zona só
 * cresce, o score dela nunca volta a subir, e uma unidade que corrigiu a escala
 * fica marcada para sempre — o que ensina a equipe a ignorar o número em vez de
 * a consertar a causa.
 *
 * Trinta dias não é palpite redondo: é o ciclo de fechamento administrativo e
 * de escala hospitalar, o período sobre o qual uma coordenação de fato senta e
 * revisa o que aconteceu. Fica em SOMBRA como todo o resto, e a direção do
 * efeito é o que autoriza usá-la: a janela decide apenas o que o score NOTA.
 * Mais curta, esquece antes; mais longa, lembra mais. Nenhuma das duas abre
 * porta nenhuma.
 */
export const JANELA_DE_RECORRENCIA_DIAS = 30;

/**
 * Minutos de porta aberta, por criticidade.
 *
 * `CRITICAL` é a mais curta de propósito, e a inversão é intencional: quanto
 * mais consequente a porta, menos tempo ela fica aberta por afirmação de uma
 * pessoa só. Quinze minutos é a ordem de grandeza de um atendimento de
 * emergência à beira do leito — tempo de pegar o que se precisa, não tempo de
 * trabalhar a tarde inteira sob privilégio excepcional.
 *
 * Todas em SOMBRA: nenhuma foi medida contra a operação de um hospital real. A
 * direção do efeito é o que autoriza usá-las assim mesmo — errar para menos
 * custa uma segunda invocação, que fica registrada; errar para mais custa uma
 * porta aberta por afirmação que ninguém conferiu ainda.
 */
export const JANELAS_DE_EMERGENCIA: JanelasDeEmergencia = Object.freeze({
  CRITICAL: 15,
  HIGH: 30,
  MEDIUM: 60,
  LOW: 60
});

const RESSALVA =
  'Janela derivada da ordem de grandeza de um atendimento de emergência, não de operação ' +
  'medida nesta instalação. Enquanto estiver em sombra, o efeito dela é apenas ENCURTAR a ' +
  'exceção — nunca estendê-la, nunca dispensar a revisão posterior.';

export const CONSTANTES_DE_EMERGENCIA: readonly ConstanteCalibrada<number>[] = Object.freeze(
  (Object.keys(JANELAS_DE_EMERGENCIA) as Criticidade[]).map((faixa) => ({
    id: `emergencia.janela.${faixa}`,
    rotulo: `Janela de quebra de vidro em endpoint de criticidade ${faixa}`,
    valor: JANELAS_DE_EMERGENCIA[faixa],
    estatuto: 'SOMBRA' as const,
    procedencia:
      faixa === 'CRITICAL'
        ? 'Ordem de grandeza de um atendimento de emergência à beira do leito — tempo de ' +
          'pegar o que se precisa, não de trabalhar sob privilégio excepcional'
        : 'Derivada da janela CRÍTICA por proporção — palpite declarado, não medição',
    curador: CURADOR,
    verificadoEm: VERIFICADO_EM,
    ressalva: RESSALVA
  }))
);

export const CONSTANTE_DE_RECORRENCIA: ConstanteCalibrada<number> = Object.freeze({
  id: 'emergencia.janela-de-recorrencia',
  rotulo: 'Período em que uma quebra de vidro ainda conta como repetição na zona',
  valor: JANELA_DE_RECORRENCIA_DIAS,
  estatuto: 'SOMBRA' as const,
  procedencia:
    'Ciclo de fechamento administrativo e de escala hospitalar — o período sobre o qual ' +
    'uma coordenação revisa o que aconteceu na unidade',
  curador: CURADOR,
  verificadoEm: VERIFICADO_EM,
  ressalva:
    'Janela derivada do ciclo administrativo, não de operação medida nesta instalação. ' +
    'Enquanto estiver em sombra, o efeito dela é apenas decidir o que o Health Score NOTA ' +
    '— nunca abrir porta, nunca encerrar revisão, nunca julgar quem invocou.'
});

export function registroDeEmergencia(): RegistroDeCalibracao {
  return new RegistroDeCalibracao(CONSTANTES_DE_EMERGENCIA);
}

/** Um aviso por janela abaixo de INSTRUMENTADA, para sair colado ao prazo. */
export function avisosDaEmergencia(
  registro: RegistroDeCalibracao = registroDeEmergencia()
): readonly string[] {
  const avisos: string[] = [];
  for (const constante of CONSTANTES_DE_EMERGENCIA) {
    const leitura = registro.obterEmSombra<number>(constante.id);
    if (leitura.estatuto !== 'INSTRUMENTADA') avisos.push(leitura.aviso);
  }
  return avisos;
}

/**
 * O que a pessoa afirma ao quebrar o vidro.
 *
 * Taxonomia fechada, e `OUTRA` exige texto. Motivo em campo livre vira
 * "emergência" em todos os registros, e um campo que sempre diz a mesma coisa
 * não informa a revisão que virá depois.
 */
export type NaturezaDaEmergencia =
  | 'PARADA_CARDIORRESPIRATORIA'
  | 'RISCO_IMINENTE_DE_VIDA'
  | 'INTERCORRENCIA_CLINICA_GRAVE'
  | 'FALHA_DE_EQUIPAMENTO_ASSISTENCIAL'
  | 'EVACUACAO'
  | 'OUTRA';

export interface PedidoDeQuebraDeVidro {
  id: string;
  personId: string;
  relationshipId: string;
  endpointId: string;
  zonaId: string;
  criticidade: Criticidade;
  natureza: NaturezaDaEmergencia;
  justificativa: string;
  /** Quem afirma. Em produção, a sessão autenticada do host. */
  invocadaPor: string;
  em: Date;
}

export type VerdictoDaRevisao = 'LEGITIMA' | 'IRREGULAR' | 'INCONCLUSIVA';

export interface RevisaoDaQuebra {
  revisadaPor: string;
  verdicto: VerdictoDaRevisao;
  nota: string;
  em: Date;
}

export interface QuebraDeVidro {
  id: string;
  pedido: PedidoDeQuebraDeVidro;
  abertaEm: Date;
  expiraEm: Date;
  estado: 'ATIVA' | 'EXPIRADA';
  /** `undefined` enquanto ninguém revisou. Nunca se fecha sozinha. */
  revisao?: RevisaoDaQuebra;
}

export type AtoDeEmergencia =
  | { tipo: 'INVOCADA'; quebra: QuebraDeVidro; em: Date }
  | { tipo: 'EXPIRADA'; quebra: QuebraDeVidro; em: Date; observadoEm: Date }
  | { tipo: 'REVISADA'; quebra: QuebraDeVidro; revisao: RevisaoDaQuebra; em: Date };

export interface DiarioDeEmergencia {
  registrarEmergencia(ato: AtoDeEmergencia): void;
}

/** O que o motor de política consulta. Booleano, e só depois de projetado. */
export interface ConsultaDeEmergencia {
  ativaPara(relationshipId: string, endpointId: string, agora: Date): boolean;
}

export const SEM_EMERGENCIAS: ConsultaDeEmergencia = { ativaPara: () => false };

function chave(relationshipId: string, endpointId: string): string {
  return `${relationshipId}::${endpointId}`;
}

/**
 * O registro das quebras de vidro.
 *
 * Note o que ele NÃO faz: não aprova, não estende, não fecha revisão sozinho e
 * não pergunta se a pessoa podia. Quem invoca assume — o controle é posterior,
 * e é por isso que ele precisa existir de verdade.
 */
export class RegistroDeQuebraDeVidro implements ConsultaDeEmergencia, HistoricoDeEmergencias {
  private readonly quebras = new Map<string, QuebraDeVidro>();
  private readonly expiracoesAnunciadas = new Set<string>();
  private sequencia = 0;

  constructor(
    private readonly relogio: Relogio,
    private readonly janelas: JanelasDeEmergencia = JANELAS_DE_EMERGENCIA,
    private readonly diario?: DiarioDeEmergencia
  ) {}

  /**
   * Invocar é imediato e não pede licença. É disso que se trata.
   *
   * A única recusa possível é a justificativa vazia — não porque o texto
   * proteja alguém, mas porque a revisão posterior precisa ter o que revisar, e
   * "emergência" sem descrição é um registro que não responde nada.
   */
  invocar(pedido: PedidoDeQuebraDeVidro): QuebraDeVidro | { recusada: 'JUSTIFICATIVA_VAZIA' } {
    if (pedido.justificativa.trim().length === 0) {
      return { recusada: 'JUSTIFICATIVA_VAZIA' };
    }
    if (pedido.natureza === 'OUTRA' && pedido.justificativa.trim().length < 10) {
      return { recusada: 'JUSTIFICATIVA_VAZIA' };
    }
    this.sequencia += 1;
    const abertaEm = pedido.em;
    const minutos = this.janelas[pedido.criticidade];
    const quebra: QuebraDeVidro = {
      id: `VIDRO-${String(this.sequencia).padStart(5, '0')}`,
      pedido,
      abertaEm,
      expiraEm: new Date(abertaEm.getTime() + minutos * 60_000),
      estado: 'ATIVA'
    };
    this.quebras.set(quebra.id, quebra);
    this.diario?.registrarEmergencia({ tipo: 'INVOCADA', quebra, em: abertaEm });
    return quebra;
  }

  ativaPara(relationshipId: string, endpointId: string, agora: Date): boolean {
    return this.vigentes(agora).some(
      (q) => chave(q.pedido.relationshipId, q.pedido.endpointId) === chave(relationshipId, endpointId)
    );
  }

  /** As ativas agora, expirando pelo caminho o que passou da janela. */
  vigentes(agora: Date = this.relogio.agora()): readonly QuebraDeVidro[] {
    const ativas: QuebraDeVidro[] = [];
    for (const [id, quebra] of this.quebras) {
      if (quebra.estado !== 'ATIVA') continue;
      if (agora.getTime() < quebra.expiraEm.getTime()) {
        ativas.push(quebra);
        continue;
      }
      const expirada: QuebraDeVidro = { ...quebra, estado: 'EXPIRADA' };
      this.quebras.set(id, expirada);
      if (!this.expiracoesAnunciadas.has(id)) {
        this.expiracoesAnunciadas.add(id);
        this.diario?.registrarEmergencia({
          tipo: 'EXPIRADA',
          quebra: expirada,
          em: expirada.expiraEm,
          observadoEm: agora
        });
      }
    }
    return ativas;
  }

  /**
   * A fila que não esvazia sozinha.
   *
   * Uma quebra de vidro expirada e não revisada permanece aqui para sempre. É
   * deliberado: o custo da exceção é a prestação de contas, e uma pendência que
   * some com o tempo converteria a exceção em caminho normal — que é o destino
   * de todo break-glass mal desenhado.
   */
  pendentesDeRevisao(agora: Date = this.relogio.agora()): readonly QuebraDeVidro[] {
    this.vigentes(agora);
    return [...this.quebras.values()]
      .filter((q) => q.revisao === undefined)
      .sort((a, b) => a.abertaEm.getTime() - b.abertaEm.getTime());
  }

  todas(): readonly QuebraDeVidro[] {
    return [...this.quebras.values()];
  }

  /** Só gente fecha, e o verdicto fica. Inclusive o inconclusivo. */
  revisar(
    id: string,
    revisadaPor: string,
    verdicto: VerdictoDaRevisao,
    nota: string
  ): QuebraDeVidro | undefined {
    const quebra = this.quebras.get(id);
    if (!quebra || quebra.revisao !== undefined) return undefined;
    const revisao: RevisaoDaQuebra = {
      revisadaPor,
      verdicto,
      nota,
      em: this.relogio.agora()
    };
    const revisada: QuebraDeVidro = { ...quebra, revisao };
    this.quebras.set(id, revisada);
    this.diario?.registrarEmergencia({
      tipo: 'REVISADA',
      quebra: revisada,
      revisao,
      em: revisao.em
    });
    return revisada;
  }

  /**
   * A projeção que a observabilidade lê.
   *
   * `encerrada` sai do RELÓGIO, e não do campo `estado`, e a diferença importa:
   * `estado` só vira `EXPIRADA` quando alguém chama `vigentes()`, e um leitor
   * que não chama nada leria "ativa" sobre uma janela fechada há três horas.
   * Deduzir do tempo torna a leitura correta independentemente de quem passou
   * por aqui antes.
   *
   * Sem justificativa, sem natureza, sem quem invocou e sem a nota da revisão:
   * o score orienta prioridade e não precisa de nenhuma delas para isso. Quem
   * precisa é quem revisa, e essa pessoa lê o registro, não o painel.
   */
  projetarParaAssurance(agora: Date): readonly QuebraDeVidroProjetada[] {
    return [...this.quebras.values()].map((q) => ({
      quebraId: q.id,
      endpointId: q.pedido.endpointId,
      zonaId: q.pedido.zonaId,
      abertaEm: q.abertaEm,
      encerrada: agora.getTime() >= q.expiraEm.getTime(),
      revisada: q.revisao !== undefined
    }));
  }

  /** Quantas vezes se quebrou o vidro nesta zona. Repetição é achado. */
  contagemPorZona(): Readonly<Record<string, number>> {
    const contagem: Record<string, number> = {};
    for (const quebra of this.quebras.values()) {
      contagem[quebra.pedido.zonaId] = (contagem[quebra.pedido.zonaId] ?? 0) + 1;
    }
    return contagem;
  }
}
