// ---------------------------------------------------------------------------
// APROVAÇÃO HUMANA DE ACESSO — o human-gate do MPE-H no lugar do conjunto
//
// A versão anterior deste produto guardava aprovações num `Set<string>` com
// chaves `${vinculoId}::${endpointId}`. O ADR-0009 já registrava que aquilo era
// mínimo demais; o que não estava dito é que era mínimo do jeito perigoso.
//
// Uma chave num conjunto aprova A PORTA, para sempre, independentemente do que
// motivou a aprovação. Se a criticidade do endpoint subir de HIGH para
// CRITICAL, se o papel da pessoa mudar, se o vínculo virar de efetivo para
// prestador — a chave continua lá, e continua abrindo. O supervisor aprovou
// uma coisa e o sistema executa outra, sem que ninguém tenha mentido.
//
// O human-gate do kernel resolve isso ligando a aprovação ao HASH do material
// revisado. O material aqui é o conteúdo da decisão: quem, onde, com que
// papéis, sob que criticidade, por qual razão de política. Mude qualquer um
// desses, e o hash muda; mudou o hash, a aprovação deixa de valer SOZINHA —
// ninguém precisa lembrar de revogá-la.
//
// É a diferença entre uma autorização e um carimbo, que é como o próprio
// kernel descreve o defeito que ele corrige.
//
// O QUE O HASH NÃO COBRE, E FOI ACRESCENTADO DEPOIS
//
// O hash responde "o conteúdo continuou o mesmo?". Restavam duas perguntas que
// uma investigação hospitalar faz na mesma respiração, e que este arquivo
// respondia mal:
//
//   · QUEM APROVOU, COM QUE AUTORIDADE. O aprovador e o papel já vinham na
//     decisão, e a alçada era CONFERIDA — mas não guardada. Meses depois,
//     quando a pergunta chega, o papel pode ter mudado de teto, e a única
//     resposta possível seria "ele podia na época, acho". A alçada passa a ser
//     congelada no momento da decisão, sondando a mesma porta do host faixa a
//     faixa: o registro guarda até onde aquele papel podia decidir NAQUELE
//     instante, e não depende de o host lembrar.
//
//   · ATÉ QUANDO. Enquanto o material não mudasse, a aprovação valia para
//     sempre. Ver `vigencia.ts` — a permanência é o defeito, não a mudança.
// ---------------------------------------------------------------------------

import { abrirPedido, avaliar, selarBundle } from '../mpeh-kernel/human-gate/gate';
import {
  AutoridadeDoHost,
  Criticidade as CriticidadeDoGate,
  DecisaoDeGate,
  PedidoDeGate,
  VerdictoDoGate
} from '../mpeh-kernel/human-gate/tipos';
import { Criticidade } from '../dominio/topologia';
import { Relogio } from '../dominio/tempo';
import {
  JanelasDeVigencia,
  JANELAS_PADRAO,
  expiracaoDe,
  lerJanelas,
  minutosRestantes
} from './vigencia';

export type { AutoridadeDoHost, DecisaoDeGate, PedidoDeGate, VerdictoDoGate };

/** As quatro faixas, da mais baixa para a mais alta. Usada para sondar alçada. */
const FAIXAS: readonly CriticidadeDoGate[] = Object.freeze(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);

/**
 * Criticidade do endpoint → criticidade do gate.
 *
 * `CRITICAL` vira `CRITICA`, e isso tem consequência concreta: o kernel exige
 * DUAS pessoas distintas nessa faixa. Não é burocracia — é a única defesa
 * contra a fadiga de plantão, que é justamente quando um cofre de
 * psicotrópicos costuma ser liberado às pressas.
 */
export function criticidadeDoGate(criticidade: Criticidade): CriticidadeDoGate {
  switch (criticidade) {
    case 'LOW':
      return 'BAIXA';
    case 'MEDIUM':
      return 'MEDIA';
    case 'HIGH':
      return 'ALTA';
    case 'CRITICAL':
      return 'CRITICA';
  }
}

/** O que exatamente será revisado por uma pessoa. */
export interface MaterialDeRevisao {
  personId: string;
  relationshipId: string;
  endpointId: string;
  nomeDoEndpoint: string;
  zonaId: string;
  criticidade: Criticidade;
  papeis: readonly string[];
  tipoDeVinculo: string;
  razaoDaPolitica: string;
}

/**
 * Serialização canônica do material.
 *
 * Ordenada e explícita de propósito: `JSON.stringify` de objeto tem ordem de
 * chave dependente de como o objeto foi montado, e um hash que muda por causa
 * disso invalidaria aprovações boas — o que ensinaria a equipe a desligar o
 * gate. Papéis vão ordenados pela mesma razão.
 */
export function serializarMaterial(material: MaterialDeRevisao): string {
  const linhas = [
    `pessoa: ${material.personId}`,
    `vinculo: ${material.relationshipId} (${material.tipoDeVinculo})`,
    `papeis: ${[...material.papeis].sort().join(',')}`,
    `endpoint: ${material.endpointId} — ${material.nomeDoEndpoint}`,
    `zona: ${material.zonaId}`,
    `criticidade: ${material.criticidade}`,
    `razao: ${material.razaoDaPolitica}`
  ];
  return linhas.join('\n');
}

export function chaveDeAprovacao(relationshipId: string, endpointId: string): string {
  return `${relationshipId}::${endpointId}`;
}

/**
 * A consulta que o Entitlement Reconciliation faz.
 *
 * Note que ela recebe o MATERIAL, não só a chave: é o material que decide se a
 * aprovação ainda vale. Uma porta que devolvesse booleano a partir da chave
 * reintroduziria o defeito original.
 */
export interface ConsultaDeAprovacao {
  autorizado(material: MaterialDeRevisao): boolean;
  /** Explicação legível do bloqueio, para a fila de pendências. */
  explicar(material: MaterialDeRevisao): string;
}

/** Nada aprovado. É o padrão, e fecha. */
export const SEM_APROVACOES: ConsultaDeAprovacao = {
  autorizado: () => false,
  explicar: () => 'Nenhuma aprovação humana registrada para este acesso.'
};

/**
 * A autoridade de quem decidiu, congelada no instante da decisão.
 *
 * `ate` é o teto de criticidade que o papel alcançava então — reconstruído
 * perguntando `podeDecidir` faixa a faixa, porque a porta do kernel devolve
 * booleano e mudá-la seria editar o espelho. `null` significa que o papel não
 * decidia nem a faixa mais baixa, o que só acontece em decisão recusada pelo
 * gate — e é exatamente o caso que precisa ficar registrado.
 */
export interface AlcadaCongelada {
  aprovador: string;
  papel: string;
  decisao: DecisaoDeGate['decisao'];
  /** Teto do papel no momento da decisão. */
  ate: CriticidadeDoGate | null;
  /** Faixa que a decisão exigia. */
  exigida: CriticidadeDoGate;
  congeladaEm: string;
}

export interface RegistroDeAprovacao {
  pedido: PedidoDeGate;
  decisoes: DecisaoDeGate[];
  verdicto: VerdictoDoGate;
  material: string;
  /** Autoridade de cada decisão, como era quando foi tomada. */
  alcadas: AlcadaCongelada[];
  /** Quando o gate passou a autorizar. `null` enquanto não autorizou. */
  aprovadoEm: Date | null;
  /** Quando a autorização deixa de valer sozinha. `null` quando não expira. */
  expiraEm: Date | null;
  /** O material como objeto, para montar o ato de auditoria sem reparsear. */
  revisado: MaterialDeRevisao;
  /** O vencimento já foi anunciado ao diário? Anunciar duas vezes é ruído. */
  vencimentoAnunciado: boolean;
}

/** O estado da vigência, para a fila de pendências e para a tela. */
export interface VigenciaDaAprovacao {
  aprovadoEm: Date | null;
  expiraEm: Date | null;
  minutosRestantes: number | null;
  vencida: boolean;
  /** Avisos das janelas em sombra. Sai junto do prazo, nunca depois dele. */
  avisos: readonly string[];
}

export const SEM_VIGENCIA: VigenciaDaAprovacao = Object.freeze({
  aprovadoEm: null,
  expiraEm: null,
  minutosRestantes: null,
  vencida: false,
  avisos: Object.freeze([]) as readonly string[]
});

/**
 * O que a tela precisa saber sobre um pedido.
 *
 * `VIGENTE` entra na mesma lista de propósito. A tentação é listar só o que
 * exige ação — vencidas e não decididas — e essa lista chega tarde por
 * construção: ela só ganha a linha quando a porta JÁ parou de abrir. Quem
 * poderia renovar precisa ver o prazo enquanto ele ainda corre, e por isso a
 * aprovação válida aparece com os minutos restantes, ordenada pela que vence
 * primeiro.
 *
 * Não há limiar de "prestes a vencer", e a ausência é deliberada: seria mais
 * um número sem calibragem, decidindo por conta própria o que merece susto.
 * A ordenação já põe o mais próximo no topo, e quem lê decide.
 */
export type EstadoDaPendencia =
  /** Autorizada, o prazo correu até o fim, a porta parou de abrir. */
  | 'VENCIDA'
  /** Pedido aberto, ninguém decidiu ainda. */
  | 'AGUARDANDO_DECISAO'
  /** Uma pessoa assinou; a faixa crítica exige a segunda. */
  | 'AGUARDANDO_SEGUNDA_ASSINATURA'
  /** Um humano recusou, com justificativa. Fica à vista: recusa não é silêncio. */
  | 'RECUSADA'
  /** Autorizada e dentro do prazo. */
  | 'VIGENTE';

export interface AssinaturaExibida {
  aprovador: string;
  papel: string;
  decisao: DecisaoDeGate['decisao'];
  /** Teto de autoridade no instante da decisão. */
  ate: CriticidadeDoGate | null;
}

export interface PendenciaDeAprovacao {
  pedidoId: string;
  personId: string;
  relationshipId: string;
  endpointId: string;
  nomeDoEndpoint: string;
  zonaId: string;
  criticidade: Criticidade;
  estado: EstadoDaPendencia;
  /** Frase determinística, pronta para a tela. Nunca gerada por modelo. */
  explicacao: string;
  abertoEm: Date;
  aprovadoEm: Date | null;
  expiraEm: Date | null;
  /** Negativo depois de vencida; `null` quando não há prazo. */
  minutosRestantes: number | null;
  assinaturas: readonly AssinaturaExibida[];
}

const ORDEM_DE_CRITICIDADE: Record<Criticidade, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3
};

/** Quem chega primeiro na tela. Menor é mais acima. */
const ORDEM_DO_ESTADO: Record<EstadoDaPendencia, number> = {
  VENCIDA: 0,
  AGUARDANDO_SEGUNDA_ASSINATURA: 1,
  AGUARDANDO_DECISAO: 2,
  RECUSADA: 3,
  VIGENTE: 4
};

/**
 * A ordem da fila, que é a decisão de produto desta tela.
 *
 * Vencida no topo porque é a única que MUDOU sem ninguém mandar: ontem abria,
 * hoje não abre, e o operador não foi avisado. Entre vencidas, a que venceu há
 * mais tempo lidera — é a que tem gente esperando há mais tempo.
 *
 * Segunda assinatura vem antes de "aguardando decisão" porque já há alguém
 * comprometido: falta uma pessoa, não duas, e o custo de concluir é metade.
 *
 * Vigentes fecham a lista, ordenadas pela que vence primeiro — que é a linha
 * que impede a próxima vencida de existir.
 */
export function compararPendencias(a: PendenciaDeAprovacao, b: PendenciaDeAprovacao): number {
  const porEstado = ORDEM_DO_ESTADO[a.estado] - ORDEM_DO_ESTADO[b.estado];
  if (porEstado !== 0) return porEstado;
  if (a.estado === 'VENCIDA' || a.estado === 'VIGENTE') {
    const ma = a.minutosRestantes ?? Number.POSITIVE_INFINITY;
    const mb = b.minutosRestantes ?? Number.POSITIVE_INFINITY;
    if (ma !== mb) return ma - mb;
  }
  const porCriticidade = ORDEM_DE_CRITICIDADE[b.criticidade] - ORDEM_DE_CRITICIDADE[a.criticidade];
  if (porCriticidade !== 0) return porCriticidade;
  return a.abertoEm.getTime() - b.abertoEm.getTime();
}

/**
 * Os três atos que a aprovação humana produz, para quem quiser registrá-los.
 *
 * A porta existe para que o gate NÃO conheça a trilha. Governança que importa
 * auditoria fica presa ao formato do ledger, e este produto precisa embarcar em
 * aplicativos de gestão que já têm a sua própria trilha — é o host que decide
 * onde o ato é gravado. O adaptador que liga esta porta ao ledger do MPE-H mora
 * em `auditoria/diario.ts`, do lado de lá da fronteira.
 */
export type AtoDeAprovacao =
  | {
      tipo: 'PEDIDA';
      pedido: PedidoDeGate;
      material: MaterialDeRevisao;
      solicitadoPor: string;
      em: Date;
    }
  | {
      tipo: 'DECIDIDA';
      pedido: PedidoDeGate;
      material: MaterialDeRevisao;
      alcada: AlcadaCongelada;
      justificativa: string;
      autorizadoAgora: boolean;
      em: Date;
    }
  | {
      tipo: 'VENCIDA';
      pedido: PedidoDeGate;
      material: MaterialDeRevisao;
      /** Quando venceu. */
      em: Date;
      /** Quando a ColmeIA percebeu — vencimento não tem ator que o anuncie. */
      observadoEm: Date;
      aprovadores: readonly string[];
    };

export interface DiarioDeAprovacao {
  registrar(ato: AtoDeAprovacao): void;
}

/**
 * O gate de acesso.
 *
 * `AutoridadeDoHost` vem de fora: o kernel não sabe o que é um supervisor de
 * plantão nem como se valida um token, e não deve saber. Num aplicativo de
 * gestão hospitalar, quem responde essa porta é o RBAC do próprio aplicativo —
 * que é exatamente o ponto de encaixe deste produto dentro dele.
 */
export class GateDeAcesso implements ConsultaDeAprovacao {
  private readonly registros = new Map<string, RegistroDeAprovacao>();
  private readonly verdictos = new Map<string, VerdictoDoGate>();
  private readonly avisosDeVigencia: readonly string[];
  private sequencia = 0;

  /**
   * As janelas entram por parâmetro porque são configuração de instalação — um
   * pronto-socorro e um arquivo morto não têm a mesma noção de "até quando".
   * O padrão são as constantes em sombra, e os avisos delas ficam guardados
   * para sair colados no prazo em toda leitura de vigência.
   */
  constructor(
    private readonly autoridade: AutoridadeDoHost,
    private readonly relogio: Relogio,
    private readonly janelas: JanelasDeVigencia = JANELAS_PADRAO,
    private readonly diario?: DiarioDeAprovacao
  ) {
    this.avisosDeVigencia = janelas === JANELAS_PADRAO ? lerJanelas().avisos : [];
  }

  /**
   * Abre o pedido e sela o material que a pessoa vai revisar.
   *
   * IDEMPOTENTE sobre material idêntico, e isso não é conveniência: o ciclo de
   * governança roda a cada minuto e reabre o pedido enquanto ninguém decidir.
   * Sem esta guarda, cada ciclo criaria um registro novo por cima do anterior
   * e APAGARIA a primeira assinatura — numa faixa crítica, que exige duas, a
   * segunda pessoa nunca chegaria, porque a primeira seria esquecida a cada
   * volta do relógio. O pedido só é substituído quando o material MUDA, e aí
   * substituir é o certo: o que será executado deixou de ser o que foi
   * revisado, e a aprovação antiga já não valia pelo hash.
   */
  async abrir(material: MaterialDeRevisao, solicitadoPor: string): Promise<PedidoDeGate> {
    const chaveExistente = chaveDeAprovacao(material.relationshipId, material.endpointId);
    const jaAberto = this.registros.get(chaveExistente);
    if (jaAberto && jaAberto.material === serializarMaterial(material)) return jaAberto.pedido;
    this.sequencia += 1;
    const conteudo = serializarMaterial(material);
    const pedido = await abrirPedido({
      id: `GATE-${String(this.sequencia).padStart(5, '0')}`,
      operacao: `Liberar acesso de ${material.personId} ao endpoint ${material.nomeDoEndpoint}`,
      justificativa: material.razaoDaPolitica,
      conteudoParaRevisao: conteudo,
      criticidade: criticidadeDoGate(material.criticidade),
      solicitadoPor,
      agora: this.relogio.agora().toISOString()
    });
    this.registros.set(chaveDeAprovacao(material.relationshipId, material.endpointId), {
      pedido,
      decisoes: [],
      material: conteudo,
      alcadas: [],
      aprovadoEm: null,
      expiraEm: null,
      revisado: material,
      vencimentoAnunciado: false,
      verdicto: {
        autorizado: false,
        motivo: 'SEM_DECISAO',
        explicacao: 'Pedido aberto, aguardando decisão humana.',
        registro: {
          pedidoId: pedido.id,
          bundleHash: pedido.bundleHash,
          aprovadores: [],
          criticidade: pedido.criticidade
        }
      }
    });
    this.diario?.registrar({
      tipo: 'PEDIDA',
      pedido,
      material,
      solicitadoPor,
      em: this.relogio.agora()
    });
    return pedido;
  }

  /** Registra uma decisão humana e reavalia o pedido. */
  async decidir(
    material: MaterialDeRevisao,
    decisao: Omit<DecisaoDeGate, 'pedidoId' | 'bundleHash' | 'decididoEm'>
  ): Promise<VerdictoDoGate> {
    const chave = chaveDeAprovacao(material.relationshipId, material.endpointId);
    const registro = this.registros.get(chave);
    if (!registro) {
      throw new Error(
        `não há pedido aberto para ${chave}. Decisão humana não cria pedido: ` +
          'aprovar algo que ninguém pediu é carimbo, não autorização.'
      );
    }
    const decididoEm = this.relogio.agora();
    const completa: DecisaoDeGate = {
      ...decisao,
      pedidoId: registro.pedido.id,
      bundleHash: registro.pedido.bundleHash,
      decididoEm: decididoEm.toISOString()
    };
    registro.decisoes.push(completa);
    // A alçada é congelada ANTES de avaliar, e vale para aprovação e recusa:
    // a recusa de quem não tinha autoridade é um fato de auditoria tão
    // relevante quanto a aprovação de quem tinha.
    registro.alcadas.push(await this.congelarAlcada(completa, registro.pedido.criticidade));
    // Avalia contra o material SELADO no pedido — que é o que a pessoa viu.
    // Avaliar contra o material recebido na chamada permitiria que o chamador
    // aprovasse uma coisa apresentando outra, invertendo o gate.
    const verdicto = await avaliar({
      pedido: registro.pedido,
      decisoes: registro.decisoes,
      conteudoAtual: registro.material,
      autoridade: this.autoridade
    });
    registro.verdicto = verdicto;
    this.verdictos.set(chave, verdicto);
    // O relógio da vigência começa quando o gate PASSA a autorizar, não quando
    // a primeira pessoa assina: numa faixa crítica são duas, e contar da
    // primeira daria à segunda uma janela menor do que a que ela concedeu.
    if (verdicto.autorizado && registro.aprovadoEm === null) {
      registro.aprovadoEm = decididoEm;
      registro.expiraEm = expiracaoDe(decididoEm, registro.pedido.criticidade, this.janelas);
    }
    this.diario?.registrar({
      tipo: 'DECIDIDA',
      pedido: registro.pedido,
      material: registro.revisado,
      alcada: registro.alcadas[registro.alcadas.length - 1]!,
      justificativa: completa.justificativa,
      autorizadoAgora: verdicto.autorizado,
      em: decididoEm
    });
    return verdicto;
  }

  /**
   * Reconstrói o teto de autoridade do papel perguntando faixa a faixa.
   *
   * A porta do host responde `podeDecidir(papel, criticidade)` — booleano. O
   * teto não é perguntável diretamente, e acrescentar um método à porta seria
   * editar o espelho do kernel, que o manifesto proíbe. Sondar as quatro
   * faixas usa o contrato que existe e chega ao mesmo fato.
   */
  private async congelarAlcada(
    decisao: DecisaoDeGate,
    exigida: CriticidadeDoGate
  ): Promise<AlcadaCongelada> {
    let ate: CriticidadeDoGate | null = null;
    for (const faixa of FAIXAS) {
      if (await this.autoridade.podeDecidir(decisao.papel, faixa)) ate = faixa;
    }
    return {
      aprovador: decisao.aprovador,
      papel: decisao.papel,
      decisao: decisao.decisao,
      ate,
      exigida,
      congeladaEm: decisao.decididoEm
    };
  }

  /**
   * Reavalia contra o material ATUAL. É aqui que a proteção acontece: se a
   * criticidade do endpoint mudou, ou o papel da pessoa mudou, o hash de agora
   * não bate com o revisado e o gate bloqueia por
   * `CONTEUDO_MUDOU_APOS_REVISAO`.
   *
   * O verdicto guardado só é ATUALIZADO quando o material consultado é o mesmo
   * que foi revisado. A primeira versão gravava sempre, e isso produzia um
   * defeito silencioso: consultar "e se a criticidade tivesse mudado?" apagava
   * o registro da aprovação verdadeira, e o acesso legítimo passava a ser
   * negado por causa de uma pergunta. Consulta não muda o que foi aprovado —
   * num sistema de governança, essa distinção é a diferença entre um registro e
   * um rascunho.
   */
  async reavaliar(material: MaterialDeRevisao): Promise<VerdictoDoGate> {
    const chave = chaveDeAprovacao(material.relationshipId, material.endpointId);
    const registro = this.registros.get(chave);
    if (!registro) return SEM_PEDIDO;
    const conteudoAtual = serializarMaterial(material);
    const verdicto = await avaliar({
      pedido: registro.pedido,
      decisoes: registro.decisoes,
      conteudoAtual,
      autoridade: this.autoridade
    });
    if (conteudoAtual === registro.material) {
      registro.verdicto = verdicto;
      this.verdictos.set(chave, verdicto);
    }
    return verdicto;
  }

  /**
   * Leitura síncrona do último verdicto, para o motor de reconciliação.
   *
   * Confere o hash do material atual ANTES de responder: um verdicto em cache
   * sobre material que mudou é exatamente a fraude que o gate impede, e seria
   * ridículo reintroduzi-la no cache.
   */
  autorizado(material: MaterialDeRevisao): boolean {
    const chave = chaveDeAprovacao(material.relationshipId, material.endpointId);
    const registro = this.registros.get(chave);
    if (!registro) return false;
    if (!registro.verdicto.autorizado) return false;
    if (registro.material !== serializarMaterial(material)) return false;
    return !this.vencido(registro);
  }

  explicar(material: MaterialDeRevisao): string {
    const chave = chaveDeAprovacao(material.relationshipId, material.endpointId);
    const registro = this.registros.get(chave);
    if (!registro) return SEM_APROVACOES.explicar(material);
    if (registro.material !== serializarMaterial(material)) {
      return (
        'O material mudou depois da revisão humana — criticidade, papéis ou vínculo ' +
        'não são mais os que foram aprovados. A aprovação deixou de valer sozinha.'
      );
    }
    if (this.vencido(registro)) {
      const quem = registro.alcadas
        .filter((a) => a.decisao === 'APROVADO')
        .map((a) => `${a.aprovador} (${a.papel})`)
        .join(', ');
      return (
        `A vigência desta aprovação venceu em ${registro.expiraEm?.toISOString() ?? '—'}. ` +
        `Ela foi concedida por ${quem || '—'} e continua registrada; o que caducou é o ` +
        'poder dela de autorizar hoje. Nada no material mudou: mudou o tempo, e tempo ' +
        'demais sem revisão é decisão que ninguém tomou. É preciso nova revisão humana.'
      );
    }
    return registro.verdicto.explicacao;
  }

  /**
   * Venceu? Falso quando não há prazo ou quando ainda nem foi autorizado.
   *
   * O vencimento é o único dos três atos SEM ator: ninguém o executa, ele
   * acontece. Por isso o elo nasce na primeira leitura que o constata, e o
   * evento separa as duas datas — `ocorridoEm` é quando venceu, `registradoEm`
   * é quando a ColmeIA soube. O domínio já tinha esse par para webhook
   * atrasado, e ele descreve este caso com a mesma precisão.
   */
  private vencido(registro: RegistroDeAprovacao): boolean {
    if (registro.expiraEm === null) return false;
    const agora = this.relogio.agora();
    const venceu = agora.getTime() >= registro.expiraEm.getTime();
    if (venceu && !registro.vencimentoAnunciado) {
      registro.vencimentoAnunciado = true;
      this.diario?.registrar({
        tipo: 'VENCIDA',
        pedido: registro.pedido,
        material: registro.revisado,
        em: registro.expiraEm,
        observadoEm: agora,
        aprovadores: registro.verdicto.registro.aprovadores
      });
    }
    return venceu;
  }

  /**
   * O prazo, com os avisos de sombra colados.
   *
   * Devolver o prazo sem os avisos permitiria a uma tela mostrar "vence às
   * 14h40" como se fosse medida. A estrutura de retorno impede: quem exibe o
   * prazo tem o aviso na mão, e escondê-lo passa a ser ato.
   */
  vigenciaDe(relationshipId: string, endpointId: string): VigenciaDaAprovacao {
    const registro = this.registros.get(chaveDeAprovacao(relationshipId, endpointId));
    if (!registro || registro.aprovadoEm === null) return SEM_VIGENCIA;
    return {
      aprovadoEm: registro.aprovadoEm,
      expiraEm: registro.expiraEm,
      minutosRestantes: minutosRestantes(registro.expiraEm, this.relogio.agora()),
      vencida: this.vencido(registro),
      avisos: this.avisosDeVigencia
    };
  }

  /** A autoridade de cada decisão, como era no instante em que foi tomada. */
  alcadasDe(relationshipId: string, endpointId: string): readonly AlcadaCongelada[] {
    return this.registros.get(chaveDeAprovacao(relationshipId, endpointId))?.alcadas ?? [];
  }

  /**
   * Responde "o que a pessoa decidiu", não "vale agora".
   *
   * A distinção é deliberada: o verdicto é do kernel e continua sendo o
   * registro fiel da decisão humana, inclusive depois de vencida. Quem precisa
   * saber se vale hoje chama `autorizado` ou `vigenciaDe` — e é por isso que o
   * motor de reconciliação usa aquelas duas, e não esta.
   */
  verdictoDe(relationshipId: string, endpointId: string): VerdictoDoGate | undefined {
    return this.verdictos.get(chaveDeAprovacao(relationshipId, endpointId));
  }

  /**
   * Pendências: nunca decididas E vencidas.
   *
   * A aprovação vencida volta para a fila porque é exatamente isso que ela
   * virou — um pedido aguardando gente. Deixá-la fora faria o prazo derrubar
   * acessos sem que ninguém fosse avisado de que há o que revisar, que é a
   * forma mais eficiente de ensinar uma equipe a aumentar a janela até o
   * infinito.
   */
  pedidosAbertos(): readonly PedidoDeGate[] {
    return [...this.registros.values()]
      .filter((r) => !r.verdicto.autorizado || this.vencido(r))
      .map((r) => r.pedido);
  }

  /**
   * A fila da tela: TODO pedido que já existiu, com estado e prazo.
   *
   * Difere de `pedidosAbertos()` de propósito. Aquele responde "o que precisa
   * de gente AGORA" e é o que o motor consulta; este responde "o que uma
   * pessoa precisa ver", e inclui as aprovações válidas justamente porque o
   * prazo delas é a informação que evita a próxima vencida.
   */
  pendencias(): readonly PendenciaDeAprovacao[] {
    const agora = this.relogio.agora();
    return [...this.registros.values()]
      .map((registro) => {
        const vencida = this.vencido(registro);
        const estado: EstadoDaPendencia = registro.verdicto.autorizado
          ? vencida
            ? 'VENCIDA'
            : 'VIGENTE'
          : registro.verdicto.motivo === 'RECUSADO_PELO_HUMANO'
            ? 'RECUSADA'
            : // Só é "falta a segunda" quando o kernel diz que faltam
              // aprovações. Assinatura inválida ou aprovador sem alçada
              // TAMBÉM deixam decisões no registro, e chamá-las de segunda
              // assinatura pendente diria à tela que há meio caminho andado
              // onde não há nenhum.
              registro.verdicto.motivo === 'APROVACOES_INSUFICIENTES'
              ? 'AGUARDANDO_SEGUNDA_ASSINATURA'
              : 'AGUARDANDO_DECISAO';
        return {
          pedidoId: registro.pedido.id,
          personId: registro.revisado.personId,
          relationshipId: registro.revisado.relationshipId,
          endpointId: registro.revisado.endpointId,
          nomeDoEndpoint: registro.revisado.nomeDoEndpoint,
          zonaId: registro.revisado.zonaId,
          criticidade: registro.revisado.criticidade,
          estado,
          explicacao: vencida ? this.explicar(registro.revisado) : registro.verdicto.explicacao,
          abertoEm: new Date(registro.pedido.criadoEm),
          aprovadoEm: registro.aprovadoEm,
          expiraEm: registro.expiraEm,
          minutosRestantes: minutosRestantes(registro.expiraEm, agora),
          assinaturas: registro.alcadas.map((alcada) => ({
            aprovador: alcada.aprovador,
            papel: alcada.papel,
            decisao: alcada.decisao,
            ate: alcada.ate
          }))
        } satisfies PendenciaDeAprovacao;
      })
      .sort(compararPendencias);
  }

  /** Os avisos das janelas em sombra, para saírem colados na fila. */
  avisosDaVigencia(): readonly string[] {
    return this.avisosDeVigencia;
  }

  /** Conteúdo exato submetido à revisão — a prova de o que foi mostrado. */
  async selo(material: MaterialDeRevisao): Promise<string> {
    return selarBundle(serializarMaterial(material));
  }
}

const SEM_PEDIDO: VerdictoDoGate = {
  autorizado: false,
  motivo: 'SEM_DECISAO',
  explicacao: 'Nenhum pedido de aprovação foi aberto para este acesso.',
  registro: { pedidoId: '—', bundleHash: '', aprovadores: [], criticidade: 'BAIXA' }
};
