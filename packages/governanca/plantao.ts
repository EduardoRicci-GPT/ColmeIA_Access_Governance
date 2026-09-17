// ---------------------------------------------------------------------------
// PLANTÃO — o aviso a quem pode decidir
//
// O ADR-0017 pôs a fila de aprovação na tela e fechou dizendo o que não
// resolvia: "a fila aparece para quem abrir a tela". Num hospital, isso não é
// uma limitação de interface — é um horário. A aprovação do cofre de
// psicotrópicos foi concedida às 02h40 sob a janela de doze horas da escala
// 12×36; ela vence às 14h40, e quem poderia renová-la está em casa dormindo,
// porque trabalhou de madrugada. A porta para de abrir no meio do plantão
// seguinte, e a descoberta acontece na porta.
//
// Uma tela que só informa quem já está olhando informa exatamente quem menos
// precisa ser informado.
//
// O QUE ESTE MÓDULO RESOLVE, E COMO
//
// Três perguntas, e cada uma com a porta no lugar em que o produto já
// resolveu a mesma pergunta antes:
//
//   · QUEM É AVISADO. Os papéis que podem decidir aquela faixa — sondados na
//     mesma `AutoridadeDoHost` que congela a alçada da decisão. Avisar quem
//     não pode decidir é ruído, e é também uma mentira discreta: o registro
//     diria "chamamos alguém" quando chamou quem não podia resolver.
//
//   · POR QUAL CANAL. Uma porta, `CanalDeAviso`, que o host implementa —
//     ele é quem tem pager, plantão, ramal e aplicativo. O padrão NÃO é o
//     silêncio: é `CANAL_AUSENTE`, que recusa a entrega e diz por quê. Não
//     ter canal é um fato desta instalação, e um fato vai para a cadeia e
//     para a tela. Um canal ausente que não reclama é a mesma falha que
//     este produto já corrigiu três vezes em outras camadas — o adaptador que
//     lança e o chamador que engole, o servidor que sabe e a tela que apaga.
//
//   · COM QUAL INSISTÊNCIA. Um degrau por faixa de criticidade. Note que o
//     degrau é INSISTÊNCIA, e não escalada hierárquica: todos os papéis com
//     alçada já foram chamados no primeiro toque, e inventar um nível acima
//     deles seria modelar uma hierarquia que este produto não conhece.
//
// O LIMIAR QUE O ADR-0017 RECUSOU, E POR QUE AQUI ELE É INEVITÁVEL
//
// Aquele ADR registrou: "não há limiar de 'prestes a vencer', e a ausência é
// deliberada" — seria mais um número sem calibragem decidindo por conta
// própria o que merece susto, quando a ordenação da fila já põe o mais
// próximo no topo e quem lê decide.
//
// Isso vale para quem está lendo. O aviso não tem leitor ainda: ele precisa
// ESCOLHER O INSTANTE de interromper uma pessoa, e nenhuma ordenação escolhe
// instante. O limiar deixa de ser evitável — e por isso vai para onde todo
// número inevitável vai neste produto: `ConstanteCalibrada` em SOMBRA, com a
// mesma justificativa de direção que autorizou as janelas de vigência a agir
// (`vigencia.ts`). Um aviso só CHAMA GENTE. Nunca concede acesso, nunca
// estende aprovação, nunca cala. Errar para menos custa um telefonema a mais;
// errar para mais custa uma porta fechada às 14h40 sem ninguém por perto.
// ---------------------------------------------------------------------------

import { RegistroDeCalibracao } from '../mpeh-kernel/calibration/registro';
import { ConstanteCalibrada } from '../mpeh-kernel/calibration/tipos';
import {
  AutoridadeDoHost,
  Criticidade as CriticidadeDoGate
} from '../mpeh-kernel/human-gate/tipos';
import { Relogio } from '../dominio/tempo';
import { criticidadeDoGate, PendenciaDeAprovacao } from './aprovacao';
import { QuebraDeVidro } from './emergencia';
import { EncaminhamentoDeCasos } from './autoridade';
import { EscalationCase } from '../dominio/escalonamento';

const CURADOR = 'Nível E — governança de acesso ColmeIA';
const VERIFICADO_EM = '2026-09-17';

/** Minutos, por faixa de criticidade do gate. */
export type JanelasDeAviso = Record<CriticidadeDoGate, number>;

/**
 * Quanto tempo ANTES do vencimento a aprovação vigente vira chamado.
 *
 * `CRITICA` é a única com procedência fora deste produto, e é a mesma da
 * vigência: a escala 12×36. Uma hora antes do fim do turno é quando a
 * passagem de plantão começa a ser preparada — o único momento do turno em
 * que quem tem alçada está previsivelmente acordado, junto e ainda no prédio.
 *
 * As outras três descem por proporção a partir dela, e a proporção é palpite
 * declarado. É por isso que as quatro ficam em sombra.
 */
export const ANTECEDENCIA_PADRAO: JanelasDeAviso = Object.freeze({
  CRITICA: 60,
  ALTA: 8 * 60,
  MEDIA: 2 * 24 * 60,
  BAIXA: 7 * 24 * 60
});

/**
 * Intervalo mínimo entre dois toques sobre a mesma pendência.
 *
 * Existe contra o defeito oposto ao do silêncio: o ciclo roda a cada minuto, e
 * sem este intervalo cada volta do relógio produziria um aviso novo. Mil
 * avisos por noite ensinam uma equipe a ignorar o canal, o que devolve o
 * sistema ao estado que este módulo veio corrigir — só que com a aparência de
 * estar funcionando.
 */
export const REFORCO_PADRAO: JanelasDeAviso = Object.freeze({
  CRITICA: 15,
  ALTA: 60,
  MEDIA: 4 * 60,
  BAIXA: 24 * 60
});

const RESSALVA_GERAL =
  'Intervalo derivado da prática de escala hospitalar, não da operação medida nesta ' +
  'instalação. Sobe de estatuto quando houver histórico de quanto tempo uma pendência ' +
  'leva para ser decidida neste hospital. Enquanto estiver em sombra, o efeito dele é ' +
  'apenas chamar uma pessoa — nunca conceder acesso, nunca estender aprovação.';

function constante(
  familia: 'antecedencia' | 'reforco',
  faixa: CriticidadeDoGate,
  valor: number,
  rotulo: string,
  procedencia: string
): ConstanteCalibrada<number> {
  return {
    id: `aprovacao.aviso.${familia}.${faixa}`,
    rotulo,
    valor,
    estatuto: 'SOMBRA',
    procedencia,
    curador: CURADOR,
    verificadoEm: VERIFICADO_EM,
    ressalva: RESSALVA_GERAL
  };
}

export const CONSTANTES_DE_AVISO: readonly ConstanteCalibrada<number>[] = Object.freeze([
  constante(
    'antecedencia',
    'CRITICA',
    ANTECEDENCIA_PADRAO.CRITICA,
    'Antecedência do aviso em endpoint de criticidade CRÍTICA',
    'Uma hora antes do fim do turno da escala 12×36 — a janela de passagem de plantão, ' +
      'em que quem tem alçada ainda está no prédio'
  ),
  constante(
    'antecedencia',
    'ALTA',
    ANTECEDENCIA_PADRAO.ALTA,
    'Antecedência do aviso em endpoint de criticidade ALTA',
    'Derivada da antecedência CRÍTICA por proporção de turno — palpite declarado'
  ),
  constante(
    'antecedencia',
    'MEDIA',
    ANTECEDENCIA_PADRAO.MEDIA,
    'Antecedência do aviso em endpoint de criticidade MÉDIA',
    'Derivada da antecedência CRÍTICA por proporção — palpite declarado'
  ),
  constante(
    'antecedencia',
    'BAIXA',
    ANTECEDENCIA_PADRAO.BAIXA,
    'Antecedência do aviso em endpoint de criticidade BAIXA',
    'Derivada da antecedência CRÍTICA por proporção semanal — palpite declarado'
  ),
  constante(
    'reforco',
    'CRITICA',
    REFORCO_PADRAO.CRITICA,
    'Intervalo entre toques em endpoint de criticidade CRÍTICA',
    'Ordem de grandeza de uma ronda de plantão — palpite declarado, não medição'
  ),
  constante(
    'reforco',
    'ALTA',
    REFORCO_PADRAO.ALTA,
    'Intervalo entre toques em endpoint de criticidade ALTA',
    'Derivado do intervalo CRÍTICO por proporção horária — palpite declarado'
  ),
  constante(
    'reforco',
    'MEDIA',
    REFORCO_PADRAO.MEDIA,
    'Intervalo entre toques em endpoint de criticidade MÉDIA',
    'Derivado do intervalo CRÍTICO por proporção — palpite declarado'
  ),
  constante(
    'reforco',
    'BAIXA',
    REFORCO_PADRAO.BAIXA,
    'Intervalo entre toques em endpoint de criticidade BAIXA',
    'Derivado do intervalo CRÍTICO por proporção diária — palpite declarado'
  )
]);

export function registroDeAviso(): RegistroDeCalibracao {
  return new RegistroDeCalibracao(CONSTANTES_DE_AVISO);
}

export interface JanelasDeAvisoLidas {
  antecedencia: JanelasDeAviso;
  reforco: JanelasDeAviso;
  avisos: readonly string[];
  emSombra: boolean;
}

/** Lê pela porta de sombra: valor e ressalva saem juntos, como em `vigencia.ts`. */
export function lerJanelasDeAviso(
  registro: RegistroDeCalibracao = registroDeAviso()
): JanelasDeAvisoLidas {
  const antecedencia: Record<string, number> = {};
  const reforco: Record<string, number> = {};
  const avisos: string[] = [];
  let emSombra = false;

  for (const constante of CONSTANTES_DE_AVISO) {
    const [, , familia, faixa] = constante.id.split('.');
    const leitura = registro.obterEmSombra<number>(constante.id);
    if (familia === 'antecedencia') antecedencia[faixa!] = leitura.valor;
    else reforco[faixa!] = leitura.valor;
    if (leitura.estatuto !== 'INSTRUMENTADA') {
      emSombra = true;
      avisos.push(leitura.aviso);
    }
  }

  return {
    antecedencia: antecedencia as unknown as JanelasDeAviso,
    reforco: reforco as unknown as JanelasDeAviso,
    avisos,
    emSombra
  };
}

/** Por que esta pessoa está sendo chamada agora. */
export type MotivoDoAviso =
  /** Ninguém decidiu ainda. */
  | 'DECISAO_PENDENTE'
  /** Uma pessoa assinou; a faixa crítica exige a segunda. */
  | 'SEGUNDA_ASSINATURA'
  /** Vigente, dentro da antecedência: ainda dá para renovar antes de fechar. */
  | 'PRESTES_A_VENCER'
  /** Já venceu: a porta parou de abrir. */
  | 'VENCIDA';

export interface AvisoDeAprovacao {
  /** Discriminante: convocar gente para decidir. */
  especie: 'APROVACAO';
  pedidoId: string;
  motivo: MotivoDoAviso;
  /** 1 é o primeiro toque; 2 em diante é insistência, não hierarquia. */
  degrau: number;
  faixa: CriticidadeDoGate;
  /** Papéis desta instalação que podem decidir esta faixa. Pode ser vazio. */
  papeisComAlcada: readonly string[];
  pendencia: PendenciaDeAprovacao;
  /** Frase determinística, pronta para qualquer canal. Nunca gerada por modelo. */
  texto: string;
  em: Date;
}

/**
 * O aviso da emergência — e ele é um ato de natureza diferente.
 *
 * O aviso de aprovação CONVOCA: há uma decisão esperando gente. O aviso de
 * emergência INFORMA: já aconteceu, alguém assumiu, e quem responde pela área
 * precisa saber agora. Tratar os dois como o mesmo objeto faria o segundo
 * herdar a paciência do primeiro — e a quebra de vidro não tem intervalo de
 * reforço a respeitar no primeiro toque, porque o primeiro toque é o fato.
 */
export interface AvisoDeEmergencia {
  especie: 'EMERGENCIA';
  quebraId: string;
  motivo: 'QUEBRA_DE_VIDRO' | 'REVISAO_PENDENTE';
  degrau: number;
  faixa: CriticidadeDoGate;
  papeisComAlcada: readonly string[];
  quebra: QuebraDeVidro;
  texto: string;
  em: Date;
}

/**
 * O aviso do assurance — e a terceira postura possível.
 *
 * As três espécies não são variações de estilo; são três relações diferentes
 * com o tempo, e cada uma pede uma insistência própria:
 *
 *   · APROVAÇÃO convoca uma decisão que falta, e insiste até alguém decidir.
 *   · EMERGÊNCIA informa um fato consumado, uma vez por fato.
 *   · ASSURANCE convoca trabalho operacional sobre uma condição que PERSISTE —
 *     e insiste até alguém RECONHECER o caso.
 *
 * A terceira é a única cujo laço fecha sozinho de forma legítima, e isso vale
 * notar: o caso de escalonamento tem `acknowledgedAt`, então existe um ato
 * humano que encerra a insistência sem resolver o problema. É exatamente o
 * desfecho que a fila de aprovação não tem (backlog 5e) — aqui ele já nasceu
 * no tipo, porque o ADR-0010 o pôs lá quando desenhou o escalonamento.
 */
export interface AvisoDeAssurance {
  especie: 'ASSURANCE';
  casoId: string;
  /** O porquê do chamado é o TIPO do caso. Não há segundo motivo a inventar. */
  tipo: EscalationCase['type'];
  degrau: number;
  faixa: CriticidadeDoGate;
  /** Papéis que respondem por este TIPO — nunca os que têm alçada de aprovar. */
  papeisComAlcada: readonly string[];
  caso: EscalationCase;
  texto: string;
  em: Date;
}

/** O que um canal do host recebe. Três espécies, um caminho. */
export type AvisoDoPlantao = AvisoDeAprovacao | AvisoDeEmergencia | AvisoDeAssurance;

export interface EntregaDeAviso {
  entregue: boolean;
  /** Por que entregou, ou por que não. Vai para a cadeia como está. */
  detalhe: string;
  /** Identificador do canal, quando ele devolve um. Nunca um segredo. */
  referencia?: string;
}

/**
 * A porta do host.
 *
 * Quem sabe o ramal do plantão, o aplicativo que a supervisora tem no celular
 * e quem está de fato na casa às 02h40 é o aplicativo de gestão, não este
 * produto. Reimplementar isso aqui produziria uma segunda verdade sobre quem
 * está de plantão — o mesmo defeito que `AutoridadeDoHost` existe para evitar
 * quanto a quem manda.
 */
export interface CanalDeAviso {
  readonly id: string;
  enviar(aviso: AvisoDoPlantao): Promise<EntregaDeAviso>;
}

/**
 * O padrão quando o host não ligou canal nenhum.
 *
 * Recusa a entrega e diz por quê. A alternativa — não chamar ninguém e não
 * registrar nada — produziria uma instalação em que a fila vence de madrugada
 * e a cadeia de auditoria não tem uma linha sequer sobre isso. Ausência de
 * canal é fato operacional, e fato vai para a cadeia.
 */
export const CANAL_AUSENTE: CanalDeAviso = {
  id: 'canal-ausente',
  async enviar() {
    return {
      entregue: false,
      detalhe:
        'Nenhum canal de aviso está configurado nesta instalação. O chamado foi ' +
        'computado e registrado, e ninguém foi efetivamente avisado. Enquanto for ' +
        'assim, a fila de aprovação só alcança quem abrir a tela.'
    };
  }
};

function chaveDoAviso(aviso: AvisoDoPlantao): string {
  switch (aviso.especie) {
    case 'APROVACAO':
      return aviso.pedidoId;
    case 'EMERGENCIA':
      return aviso.quebraId;
    case 'ASSURANCE':
      return aviso.casoId;
  }
}

/** Canal de bancada: guarda o que receberia e sempre entrega. */
export class CanalEmMemoria implements CanalDeAviso {
  readonly id = 'canal-em-memoria';
  readonly enviados: AvisoDoPlantao[] = [];

  async enviar(aviso: AvisoDoPlantao): Promise<EntregaDeAviso> {
    this.enviados.push(aviso);
    return {
      entregue: true,
      detalhe: `Aviso entregue ao canal de bancada para ${aviso.papeisComAlcada.length} papéis com alçada.`,
      referencia: `${chaveDoAviso(aviso)}#${aviso.degrau}`
    };
  }
}

/** O ato que a cadeia registra. Um por chamado, entregue ou não. */
export interface AtoDeAviso {
  aviso: AvisoDeAprovacao;
  canal: string;
  entrega: EntregaDeAviso;
}

export interface AtoDeAvisoDeEmergencia {
  aviso: AvisoDeEmergencia;
  canal: string;
  entrega: EntregaDeAviso;
}

export interface AtoDeAvisoDeAssurance {
  aviso: AvisoDeAssurance;
  canal: string;
  entrega: EntregaDeAviso;
}

export interface DiarioDeAviso {
  registrarAviso(ato: AtoDeAviso): void;
  /**
   * O chamado da emergência, entregue ou não.
   *
   * Método próprio, e não um parâmetro a mais no anterior, porque o elo que
   * entra na cadeia é de outro tipo: uma investigação que lê `chamado não
   * entregue` precisa saber se ninguém foi acordado para DECIDIR ou se ninguém
   * soube que a porta JÁ TINHA SIDO ABERTA. São perguntas diferentes, e a
   * segunda é a que tem consequência imediata.
   */
  registrarAvisoDeEmergencia(ato: AtoDeAvisoDeEmergencia): void;
  /**
   * O chamado do assurance, entregue ou não.
   *
   * Terceiro método pela mesma razão que existiu o segundo: o elo precisa dizer
   * QUE espécie de chamado não alcançou ninguém. "Divergência física aberta há
   * quarenta minutos e ninguém foi chamado" é uma frase que uma investigação
   * procura, e ela não pode estar escondida dentro de um tipo genérico.
   */
  registrarAvisoDeAssurance(ato: AtoDeAvisoDeAssurance): void;
}

/** O que a tela mostra sobre o chamado de uma pendência. */
export interface AvisoNaTela {
  pedidoId: string;
  entregue: boolean;
  texto: string;
}

/** O que a tela mostra sobre o chamado de uma quebra de vidro. */
export interface AvisoDeEmergenciaNaTela {
  quebraId: string;
  motivo: AvisoDeEmergencia['motivo'];
  entregue: boolean;
  texto: string;
}

/** O que a tela mostra sobre o chamado de um caso de escalonamento. */
export interface AvisoDeAssuranceNaTela {
  casoId: string;
  tipo: EscalationCase['type'];
  entregue: boolean;
  texto: string;
}

export interface ResumoDoPlantao {
  avisos: readonly AtoDeAviso[];
  /**
   * Os chamados da emergência, em lista própria.
   *
   * Separados dos de aprovação porque são outro ato — e porque uma tela que os
   * misturasse ordenaria a quebra de vidro pela urgência de uma pendência,
   * quando ela não é pendência: já aconteceu.
   */
  emergencias: readonly AtoDeAvisoDeEmergencia[];
  /**
   * Os chamados do assurance, em lista própria pelo mesmo motivo das outras
   * duas: são outro ato, com outra insistência e outro destinatário.
   */
  casos: readonly AtoDeAvisoDeAssurance[];
  entregues: number;
  naoEntregues: number;
  /** Chamados que não tinham a quem chamar: nenhum papel com alçada na faixa. */
  semAlcada: number;
}

const RESUMO_VAZIO: ResumoDoPlantao = Object.freeze({
  avisos: Object.freeze([]) as readonly AtoDeAviso[],
  emergencias: Object.freeze([]) as readonly AtoDeAvisoDeEmergencia[],
  casos: Object.freeze([]) as readonly AtoDeAvisoDeAssurance[],
  entregues: 0,
  naoEntregues: 0,
  semAlcada: 0
});

/** O que o plantão consulta sobre emergências. */
export interface EmergenciasNoPlantao {
  vigentes(agora: Date): readonly QuebraDeVidro[];
  pendentesDeRevisao(agora: Date): readonly QuebraDeVidro[];
}

export interface FilaDeAprovacao {
  pendencias(): readonly PendenciaDeAprovacao[];
}

export interface DependenciasDoPlantao {
  fila: FilaDeAprovacao;
  autoridade: AutoridadeDoHost;
  /**
   * Os papéis que existem nesta instalação.
   *
   * Vem do host pela mesma razão que a alçada vem: quem sabe os cargos de um
   * hospital é o hospital. A porta do kernel responde `podeDecidir(papel,
   * faixa)` — booleano —, então descobrir QUEM pode decidir exige a lista de
   * candidatos e uma sondagem, exatamente como o congelamento de alçada faz.
   */
  papeisConhecidos: readonly string[];
  relogio: Relogio;
  canal?: CanalDeAviso;
  /**
   * As quebras de vidro, quando o host as tem.
   *
   * Ausente significa que o plantão não fala de emergência — e não que não há
   * emergência. A distinção importa porque o silêncio aqui seria o pior de
   * todos: a quebra de vidro é o evento mais urgente deste produto.
   */
  emergencias?: EmergenciasNoPlantao;
  /**
   * Quem responde por cada tipo de caso.
   *
   * Ausente significa que o plantão não chama ninguém sobre divergência física
   * — e a tela é obrigada a dizer isso, pela mesma razão que diz que não há
   * canal. Uma revogação que nunca chegou à porta é o achado central deste
   * produto; descobri-lo e não chamar ninguém seria a versão mais cara da
   * negativa silenciosa.
   */
  encaminhamento?: EncaminhamentoDeCasos;
  antecedencia?: JanelasDeAviso;
  reforco?: JanelasDeAviso;
  diario?: DiarioDeAviso;
}

interface EstadoDoChamado {
  degrau: number;
  ultimoEm: Date;
}

function textoDoAviso(
  pendencia: PendenciaDeAprovacao,
  motivo: MotivoDoAviso,
  degrau: number,
  papeis: readonly string[],
  minutos: number | null
): string {
  const onde = `${pendencia.nomeDoEndpoint} (${pendencia.zonaId}, criticidade ${pendencia.criticidade})`;
  const quem =
    papeis.length === 0
      ? 'NENHUM papel desta instalação tem alçada para decidir esta faixa'
      : `Podem decidir: ${[...papeis].sort().join(', ')}`;
  const insistencia = degrau > 1 ? ` Toque ${degrau} sobre a mesma pendência.` : '';
  const prazo =
    minutos === null
      ? ''
      : minutos < 0
        ? ` Venceu há ${Math.round(Math.abs(minutos))} min.`
        : ` Vence em ${Math.round(minutos)} min.`;

  switch (motivo) {
    case 'DECISAO_PENDENTE':
      return (
        `Acesso de ${pendencia.personId} a ${onde} aguarda decisão humana desde ` +
        `${pendencia.abertoEm.toISOString()}. ${quem}.${insistencia}`
      );
    case 'SEGUNDA_ASSINATURA':
      return (
        `Acesso de ${pendencia.personId} a ${onde} tem uma assinatura e precisa da ` +
        `segunda, de pessoa distinta. ${quem}.${insistencia}`
      );
    case 'PRESTES_A_VENCER':
      return (
        `A aprovação de ${pendencia.personId} em ${onde} está vigente e vai vencer.` +
        `${prazo} Renovar antes evita que a porta pare de abrir com a pessoa na ` +
        `frente dela. ${quem}.${insistencia}`
      );
    case 'VENCIDA':
      return (
        `A aprovação de ${pendencia.personId} em ${onde} venceu e a porta parou de ` +
        `abrir.${prazo} Nada no material mudou: só o tempo passou, e exige nova ` +
        `revisão humana. ${quem}.${insistencia}`
      );
  }
}

/**
 * A frase da emergência.
 *
 * Note o que NÃO entra: a justificativa em texto livre que a pessoa escreveu ao
 * quebrar o vidro. Ela vai para a cadeia e para a revisão, onde é lida inteira
 * por quem tem que julgá-la; num canal que pode ser um SMS ou o visor de um
 * pager, copiar texto livre de origem humana é o caminho conhecido para
 * vazar, num aparelho sem controle de acesso, o que o ADR-0007 mantém fora da
 * decisão. A natureza declarada — taxonomia fechada — informa sem expor.
 */
function textoDaEmergencia(
  quebra: QuebraDeVidro,
  motivo: AvisoDeEmergencia['motivo'],
  papeis: readonly string[]
): string {
  const p = quebra.pedido;
  const onde = `${p.zonaId} (endpoint ${p.endpointId}, criticidade ${p.criticidade})`;
  const quem =
    papeis.length === 0
      ? 'NENHUM papel desta instalação responde por esta faixa'
      : `Respondem por esta faixa: ${[...papeis].sort().join(', ')}`;

  if (motivo === 'QUEBRA_DE_VIDRO') {
    return (
      `QUEBRA DE VIDRO em curso. ${p.invocadaPor} assumiu o acesso de ${p.personId} ` +
      `a ${onde} por ${p.natureza}. A porta está aberta desde ` +
      `${quebra.abertaEm.toISOString()} e fecha sozinha em ` +
      `${quebra.expiraEm.toISOString()}. Isto não é um pedido de autorização: ` +
      `já aconteceu, e vai a revisão obrigatória. ${quem}.`
    );
  }
  return (
    `A janela de emergência de ${p.personId} em ${onde}, invocada por ` +
    `${p.invocadaPor} por ${p.natureza}, fechou e a quebra de vidro ` +
    `${quebra.id} continua SEM REVISÃO. A exceção só se paga com a prestação de ` +
    `contas, e esta pendência não vence nem some com o tempo. ${quem}.`
  );
}

const ASSUNTO_DO_CASO: Readonly<Record<EscalationCase['type'], string>> = Object.freeze({
  REVOCATION_NOT_CONFIRMED: 'uma revogação que não chegou à porta',
  SYNC_EXHAUSTED_RETRIES: 'uma sincronização que esgotou as tentativas',
  ENDPOINT_CRITICAL_OFFLINE: 'uma porta crítica sem comunicação',
  GATEWAY_OFFLINE: 'um gateway sem comunicação',
  PROVIDER_UNAVAILABLE: 'um provedor indisponível',
  POLICY_CONFLICT: 'um conflito de política',
  LATENCY_ANOMALY: 'latência fora do esperado',
  UNKNOWN_PHYSICAL_STATE: 'um estado físico que o sistema não consegue afirmar',
  COVERAGE_GAP: 'uma zona de cuidado que ficaria sem ninguém com acesso'
});

/**
 * A frase do caso.
 *
 * `COVERAGE_GAP` tem fecho próprio, e é o único que tem: todos os outros tipos
 * avisam que uma porta pode abrir para quem não deveria entrar; este avisa que
 * uma porta não vai abrir para quem precisa. Dar a ele o mesmo texto dos demais
 * faria a única falha do conjunto que tem consequência assistencial parecer
 * mais uma linha de infraestrutura.
 */
function textoDoCaso(
  caso: EscalationCase,
  degrau: number,
  papeis: readonly string[]
): string {
  const quem =
    papeis.length === 0
      ? 'NENHUM papel desta instalação responde por este tipo de caso'
      : `Respondem por este tipo: ${[...papeis].sort().join(', ')}`;
  const insistencia = degrau > 1 ? ` Toque ${degrau} sobre o mesmo caso.` : '';
  const onde = caso.endpointId ? ` em ${caso.endpointId}` : '';
  const fecho =
    caso.type === 'COVERAGE_GAP'
      ? ' Aqui não é porta que abre para quem não devia: é porta que não abre para quem precisa.'
      : '';
  return (
    `Caso ${caso.id} (${caso.severity}) aberto desde ${caso.createdAt.toISOString()}: ` +
    `${ASSUNTO_DO_CASO[caso.type]}${onde}. ${caso.reason} ${quem}.` +
    `${fecho}${insistencia} O chamado só para quando alguém reconhecer o caso.`
  );
}

function horaCurta(data: Date): string {
  return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
}

function linhaDoAto(ato: AtoDeAviso): AvisoNaTela {
  const quando = horaCurta(ato.aviso.em);
  return {
    pedidoId: ato.aviso.pedidoId,
    entregue: ato.entrega.entregue,
    texto: ato.entrega.entregue
      ? `Chamado ${ato.aviso.degrau} às ${quando} por ${ato.canal}: ${ato.aviso.papeisComAlcada.length} papéis com alçada.`
      : `Ninguém foi avisado. ${ato.entrega.detalhe}`
  };
}

function linhaDoAtoDeEmergencia(ato: AtoDeAvisoDeEmergencia): AvisoDeEmergenciaNaTela {
  const quando = horaCurta(ato.aviso.em);
  const assunto =
    ato.aviso.motivo === 'QUEBRA_DE_VIDRO' ? 'Quebra de vidro' : 'Revisão pendente';
  return {
    quebraId: ato.aviso.quebraId,
    motivo: ato.aviso.motivo,
    entregue: ato.entrega.entregue,
    texto: ato.entrega.entregue
      ? `${assunto} comunicada às ${quando} por ${ato.canal} a ${ato.aviso.papeisComAlcada.length} papéis.`
      : `${assunto}: ninguém foi informado. ${ato.entrega.detalhe}`
  };
}

function linhaDoAtoDeAssurance(ato: AtoDeAvisoDeAssurance): AvisoDeAssuranceNaTela {
  const quando = horaCurta(ato.aviso.em);
  return {
    casoId: ato.aviso.casoId,
    tipo: ato.aviso.tipo,
    entregue: ato.entrega.entregue,
    texto: ato.entrega.entregue
      ? `Chamado ${ato.aviso.degrau} às ${quando} por ${ato.canal}: ${ato.aviso.papeisComAlcada.length} papéis respondem por este tipo.`
      : `Ninguém foi chamado sobre este caso. ${ato.entrega.detalhe}`
  };
}

/**
 * O plantão.
 *
 * Lê a fila, decide quem chamar e quando, e entrega pela porta do host. Não
 * decide acesso nenhum — é CONSULTIVO no sentido do ADR-0003: convoca gente e
 * não conclui nada sozinho.
 */
export class PlantaoDeAprovacao {
  private readonly estado = new Map<string, EstadoDoChamado>();
  /** O último chamado de cada pedido, para a tela não esquecer o ciclo anterior. */
  private readonly ultimoAto = new Map<string, AtoDeAviso>();
  /**
   * As emergências já comunicadas, por quebra e por motivo.
   *
   * Conjunto, e não intervalo de reforço: a emergência é comunicada UMA vez por
   * fato — uma quando o vidro quebra, outra quando a janela fecha com a revisão
   * em aberto — e nunca é repetida pelo canal. A razão é a que criou o intervalo
   * de reforço no chamado de aprovação, lida ao contrário: a revisão pendente
   * não vence nem some, então insistir por canal a cada ciclo tocaria para
   * sempre, e um canal que toca para sempre é um canal que a equipe desliga.
   * A permanência da dívida é trabalho da TELA, que a mostra enquanto existir; o
   * canal carrega FATOS, e um fato se comunica uma vez.
   */
  private readonly emergenciasComunicadas = new Set<string>();
  private readonly atosDeEmergencia = new Map<string, AtoDeAvisoDeEmergencia>();
  private readonly estadoDosCasos = new Map<string, EstadoDoChamado>();
  private readonly ultimoAtoDeCaso = new Map<string, AtoDeAvisoDeAssurance>();
  private readonly antecedencia: JanelasDeAviso;
  private readonly reforco: JanelasDeAviso;
  private readonly canal: CanalDeAviso;
  private readonly avisosDeSombra: readonly string[];

  constructor(private readonly deps: DependenciasDoPlantao) {
    const padrao = lerJanelasDeAviso();
    this.antecedencia = deps.antecedencia ?? padrao.antecedencia;
    this.reforco = deps.reforco ?? padrao.reforco;
    this.canal = deps.canal ?? CANAL_AUSENTE;
    this.avisosDeSombra =
      deps.antecedencia === undefined && deps.reforco === undefined ? padrao.avisos : [];
  }

  /** As ressalvas das janelas em sombra, para saírem coladas no chamado. */
  avisosDaCalibragem(): readonly string[] {
    return this.avisosDeSombra;
  }

  /** Um canal está de fato configurado? A tela precisa dizer quando não está. */
  get temCanal(): boolean {
    return this.canal.id !== CANAL_AUSENTE.id;
  }

  /**
   * Percorre a fila e chama quem precisa ser chamado.
   *
   * Idempotente dentro do intervalo de reforço: rodar o ciclo duas vezes no
   * mesmo minuto não produz dois toques, e isso é o que permite chamar esta
   * função a cada volta do relógio sem transformar o canal em ruído.
   */
  async despachar(): Promise<ResumoDoPlantao> {
    const pendencias = this.deps.fila.pendencias();
    // A fila vazia já não encerra o ciclo. Encerrava, e o defeito era exatamente
    // o que este produto chama de negativa silenciosa: a instalação em que
    // ninguém pediu aprovação nenhuma é justamente a instalação em que o vidro
    // foi quebrado — porque quebrar o vidro é o que se faz quando não dá tempo
    // de pedir.
    if (pendencias.length === 0 && this.deps.emergencias === undefined) return RESUMO_VAZIO;

    const agora = this.deps.relogio.agora();
    const atos: AtoDeAviso[] = [];
    let entregues = 0;
    let semAlcada = 0;

    for (const pendencia of pendencias) {
      const motivo = this.motivoDe(pendencia);
      if (motivo === null) continue;

      const faixa = criticidadeDoGate(pendencia.criticidade);
      const chave = `${pendencia.pedidoId}::${motivo}`;
      const anterior = this.estado.get(chave);
      if (anterior && !this.passouDoReforco(anterior.ultimoEm, agora, faixa)) continue;

      const degrau = (anterior?.degrau ?? 0) + 1;
      const papeisComAlcada = await this.papeisComAlcada(faixa);
      const aviso: AvisoDeAprovacao = {
        especie: 'APROVACAO',
        pedidoId: pendencia.pedidoId,
        motivo,
        degrau,
        faixa,
        papeisComAlcada,
        pendencia,
        texto: textoDoAviso(pendencia, motivo, degrau, papeisComAlcada, pendencia.minutosRestantes),
        em: agora
      };

      // Sem ninguém com alçada, não há a quem entregar — e fingir que houve
      // chamada seria pior do que o silêncio, porque produziria registro de um
      // socorro que não existe. O ato entra na cadeia dizendo exatamente isso.
      const entrega =
        papeisComAlcada.length === 0
          ? {
              entregue: false,
              detalhe:
                'Nenhum papel desta instalação tem alçada para decidir esta faixa de ' +
                'criticidade. Não há a quem recorrer: a pendência permanece aberta e ' +
                'depende de mudança de alçada, não de insistência.'
            }
          : await this.canal.enviar(aviso);

      if (papeisComAlcada.length === 0) semAlcada += 1;
      if (entrega.entregue) entregues += 1;

      const ato: AtoDeAviso = { aviso, canal: this.canal.id, entrega };
      atos.push(ato);
      this.ultimoAto.set(pendencia.pedidoId, ato);
      this.deps.diario?.registrarAviso(ato);
      this.estado.set(chave, { degrau, ultimoEm: agora });
    }

    const emergencias = await this.despacharEmergencias(agora);
    for (const ato of emergencias) {
      if (ato.aviso.papeisComAlcada.length === 0) semAlcada += 1;
      if (ato.entrega.entregue) entregues += 1;
    }

    const total = atos.length + emergencias.length;
    return {
      avisos: atos,
      emergencias,
      casos: [],
      entregues,
      naoEntregues: total - entregues,
      semAlcada
    };
  }

  /**
   * A varredura do assurance, em chamada separada — e o motivo é a ordem do
   * ciclo, não a estética.
   *
   * `despachar()` roda ANTES da materialização, porque o aviso mais valioso da
   * aprovação é o da que ainda está vigente e vai vencer. Os casos de
   * escalonamento só existem DEPOIS que o assurance rodou, no fim do ciclo.
   * Chamar as duas coisas no mesmo ponto faria uma das duas trabalhar sobre
   * fatos da volta anterior — e um chamado sobre a divergência do minuto
   * passado é uma promessa de que o produto acompanha, quebrada em silêncio.
   *
   * Idempotente pelo intervalo de reforço, como a aprovação. O laço fecha no
   * reconhecimento: caso reconhecido sai da varredura, mesmo sem estar
   * resolvido, porque o ato humano de assumir é o que a insistência buscava.
   */
  async despacharCasos(casos: readonly EscalationCase[]): Promise<ResumoDoPlantao> {
    const encaminhamento = this.deps.encaminhamento;
    if (!encaminhamento || casos.length === 0) return RESUMO_VAZIO;

    const agora = this.deps.relogio.agora();
    const atos: AtoDeAvisoDeAssurance[] = [];
    let entregues = 0;
    let semAlcada = 0;

    for (const caso of casos) {
      // Reconhecido, resolvido ou descartado: alguém assumiu, e insistir depois
      // disso é cobrar de quem já respondeu.
      if (caso.status !== 'OPEN') continue;

      const faixa = criticidadeDoGate(caso.severity);
      const anterior = this.estadoDosCasos.get(caso.id);
      if (anterior && !this.passouDoReforco(anterior.ultimoEm, agora, faixa)) continue;

      const degrau = (anterior?.degrau ?? 0) + 1;
      const papeisComAlcada = await encaminhamento.papeisPara(caso.type, caso.severity);
      const aviso: AvisoDeAssurance = {
        especie: 'ASSURANCE',
        casoId: caso.id,
        tipo: caso.type,
        degrau,
        faixa,
        papeisComAlcada,
        caso,
        texto: textoDoCaso(caso, degrau, papeisComAlcada),
        em: agora
      };

      const entrega =
        papeisComAlcada.length === 0
          ? {
              entregue: false,
              detalhe:
                'Nenhum papel desta instalação responde por este tipo de caso. O caso ' +
                'permanece aberto na tela e depende de alguém receber a atribuição, não ' +
                'de insistência.'
            }
          : await this.canal.enviar(aviso);

      if (papeisComAlcada.length === 0) semAlcada += 1;
      if (entrega.entregue) entregues += 1;

      const ato: AtoDeAvisoDeAssurance = { aviso, canal: this.canal.id, entrega };
      atos.push(ato);
      this.ultimoAtoDeCaso.set(caso.id, ato);
      this.deps.diario?.registrarAvisoDeAssurance(ato);
      this.estadoDosCasos.set(caso.id, { degrau, ultimoEm: agora });
    }

    return {
      avisos: [],
      emergencias: [],
      casos: atos,
      entregues,
      naoEntregues: atos.length - entregues,
      semAlcada
    };
  }

  /** O plantão chama sobre divergência física nesta instalação? */
  get encaminhaCasos(): boolean {
    return this.deps.encaminhamento !== undefined;
  }

  /** As linhas do último chamado de cada caso, de qualquer ciclo. */
  linhasAcumuladasDeCasos(): readonly AvisoDeAssuranceNaTela[] {
    return [...this.ultimoAtoDeCaso.values()].map((ato) => linhaDoAtoDeAssurance(ato));
  }

  /**
   * A varredura da emergência.
   *
   * Duas passagens, e a ordem entre elas é a ordem da urgência: primeiro o que
   * está acontecendo agora, depois a dívida que ficou. Quem recebe os dois no
   * mesmo minuto precisa ler o fato em curso antes do débito de ontem.
   *
   * A falta de `emergencias` nas dependências não é ausência de emergência — é
   * ausência de fonte. O plantão então não fala de emergência nenhuma, e é a
   * tela que denuncia o buraco, pelo mesmo desenho que `CANAL_AUSENTE` usa.
   */
  private async despacharEmergencias(agora: Date): Promise<readonly AtoDeAvisoDeEmergencia[]> {
    const fonte = this.deps.emergencias;
    if (!fonte) return [];

    const atos: AtoDeAvisoDeEmergencia[] = [];
    const candidatas: { quebra: QuebraDeVidro; motivo: AvisoDeEmergencia['motivo'] }[] = [
      ...fonte.vigentes(agora).map((quebra) => ({ quebra, motivo: 'QUEBRA_DE_VIDRO' as const })),
      // A janela já fechada e a revisão ainda aberta. `pendentesDeRevisao`
      // devolve também as ativas; elas já foram comunicadas acima como o fato em
      // curso, e comunicá-las de novo como dívida no mesmo minuto diria duas
      // coisas diferentes sobre o mesmo acesso.
      ...fonte
        .pendentesDeRevisao(agora)
        .filter((quebra) => quebra.estado === 'EXPIRADA')
        .map((quebra) => ({ quebra, motivo: 'REVISAO_PENDENTE' as const }))
    ];

    for (const { quebra, motivo } of candidatas) {
      const chave = `${quebra.id}::${motivo}`;
      if (this.emergenciasComunicadas.has(chave)) continue;

      const faixa = criticidadeDoGate(quebra.pedido.criticidade);
      // Quem responde pela faixa é a melhor aproximação que este produto tem de
      // "quem responde pela área", e a aproximação está declarada: alçada para
      // decidir e responsabilidade pela zona não são a mesma pergunta. Usar a
      // porta que existe é preferível a inventar uma segunda verdade sobre a
      // hierarquia do hospital — que é o que `AutoridadeDoHost` existe para
      // impedir.
      const papeisComAlcada = await this.papeisComAlcada(faixa);
      const aviso: AvisoDeEmergencia = {
        especie: 'EMERGENCIA',
        quebraId: quebra.id,
        motivo,
        degrau: 1,
        faixa,
        papeisComAlcada,
        quebra,
        texto: textoDaEmergencia(quebra, motivo, papeisComAlcada),
        em: agora
      };

      const entrega =
        papeisComAlcada.length === 0
          ? {
              entregue: false,
              detalhe:
                'Nenhum papel desta instalação responde por esta faixa de criticidade. ' +
                'A porta foi aberta por afirmação de uma pessoa e não há a quem comunicar ' +
                'o fato: a revisão depende de alguém receber alçada, não de insistência.'
            }
          : await this.canal.enviar(aviso);

      const ato: AtoDeAvisoDeEmergencia = { aviso, canal: this.canal.id, entrega };
      atos.push(ato);
      this.atosDeEmergencia.set(chave, ato);
      this.deps.diario?.registrarAvisoDeEmergencia(ato);
      // Marcado depois da entrega, e marcado mesmo quando ela falha: um canal
      // que recusou não fica melhor sendo chamado de novo no minuto seguinte, e
      // a falha já entrou na cadeia e está na tela. O que reabre o assunto é o
      // fato seguinte — a janela fechar sem revisão —, não o relógio.
      this.emergenciasComunicadas.add(chave);
    }

    return atos;
  }

  /** O que a tela mostra por pendência — inclusive quando ninguém foi avisado. */
  linhasParaTela(resumo: ResumoDoPlantao): readonly AvisoNaTela[] {
    return resumo.avisos.map((ato) => linhaDoAto(ato));
  }

  /**
   * As linhas do ÚLTIMO chamado de cada pedido, de qualquer ciclo.
   *
   * A tela precisa desta, e não da do ciclo corrente, por um motivo que só
   * aparece depois: uma aprovação vigente com folga no prazo não gera chamado
   * nenhum nesta volta, e mostrar só a volta atual escreveria "nenhum chamado"
   * embaixo de uma pendência que foi chamada quatro vezes de madrugada. A
   * pergunta do operador é "alguém foi avisado?", não "alguém foi avisado no
   * último minuto?".
   */
  linhasAcumuladas(): readonly AvisoNaTela[] {
    return [...this.ultimoAto.values()].map((ato) => linhaDoAto(ato));
  }

  /**
   * As linhas da emergência de qualquer ciclo — comunicar é ato de uma vez só.
   *
   * Uma linha por FATO, não por quebra: o vidro quebrado e a revisão cobrada
   * são dois avisos sobre coisas diferentes, e a tela mostra os dois.
   */
  linhasAcumuladasDeEmergencia(): readonly AvisoDeEmergenciaNaTela[] {
    return [...this.atosDeEmergencia.values()].map((ato) => linhaDoAtoDeEmergencia(ato));
  }

  /**
   * Motivo do chamado, ou `null` quando não há o que chamar.
   *
   * `RECUSADA` não gera aviso de propósito: uma pessoa já decidiu, e insistir
   * com quem recusou transforma o canal em pressão sobre uma decisão legítima.
   * Quem quiser reverter abre outro pedido — que nasce com material novo e
   * hash novo, como o ADR-0012 exige.
   */
  private motivoDe(pendencia: PendenciaDeAprovacao): MotivoDoAviso | null {
    switch (pendencia.estado) {
      case 'VENCIDA':
        return 'VENCIDA';
      case 'AGUARDANDO_SEGUNDA_ASSINATURA':
        return 'SEGUNDA_ASSINATURA';
      case 'AGUARDANDO_DECISAO':
        return 'DECISAO_PENDENTE';
      case 'RECUSADA':
        return null;
      case 'VIGENTE': {
        const restantes = pendencia.minutosRestantes;
        if (restantes === null) return null;
        const faixa = criticidadeDoGate(pendencia.criticidade);
        return restantes <= this.antecedencia[faixa] ? 'PRESTES_A_VENCER' : null;
      }
    }
  }

  private passouDoReforco(ultimo: Date, agora: Date, faixa: CriticidadeDoGate): boolean {
    const minutos = (agora.getTime() - ultimo.getTime()) / 60_000;
    return minutos >= this.reforco[faixa];
  }

  /**
   * Sonda a porta do host papel a papel.
   *
   * Mesmo movimento do congelamento de alçada em `aprovacao.ts`: o contrato do
   * kernel devolve booleano, e acrescentar um método a ele seria editar o
   * espelho, que o manifesto proíbe. O contrato que existe basta.
   */
  private async papeisComAlcada(faixa: CriticidadeDoGate): Promise<readonly string[]> {
    const podem: string[] = [];
    for (const papel of this.deps.papeisConhecidos) {
      if (await this.deps.autoridade.podeDecidir(papel, faixa)) podem.push(papel);
    }
    return podem;
  }
}
