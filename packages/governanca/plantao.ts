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
  enviar(aviso: AvisoDeAprovacao): Promise<EntregaDeAviso>;
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

/** Canal de bancada: guarda o que receberia e sempre entrega. */
export class CanalEmMemoria implements CanalDeAviso {
  readonly id = 'canal-em-memoria';
  readonly enviados: AvisoDeAprovacao[] = [];

  async enviar(aviso: AvisoDeAprovacao): Promise<EntregaDeAviso> {
    this.enviados.push(aviso);
    return {
      entregue: true,
      detalhe: `Aviso entregue ao canal de bancada para ${aviso.papeisComAlcada.length} papéis com alçada.`,
      referencia: `${aviso.pedidoId}#${aviso.degrau}`
    };
  }
}

/** O ato que a cadeia registra. Um por chamado, entregue ou não. */
export interface AtoDeAviso {
  aviso: AvisoDeAprovacao;
  canal: string;
  entrega: EntregaDeAviso;
}

export interface DiarioDeAviso {
  registrarAviso(ato: AtoDeAviso): void;
}

/** O que a tela mostra sobre o chamado de uma pendência. */
export interface AvisoNaTela {
  pedidoId: string;
  entregue: boolean;
  texto: string;
}

export interface ResumoDoPlantao {
  avisos: readonly AtoDeAviso[];
  entregues: number;
  naoEntregues: number;
  /** Chamados que não tinham a quem chamar: nenhum papel com alçada na faixa. */
  semAlcada: number;
}

const RESUMO_VAZIO: ResumoDoPlantao = Object.freeze({
  avisos: Object.freeze([]) as readonly AtoDeAviso[],
  entregues: 0,
  naoEntregues: 0,
  semAlcada: 0
});

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
    if (pendencias.length === 0) return RESUMO_VAZIO;

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

    return {
      avisos: atos,
      entregues,
      naoEntregues: atos.length - entregues,
      semAlcada
    };
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
