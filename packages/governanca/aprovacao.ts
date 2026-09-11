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

export type { AutoridadeDoHost, DecisaoDeGate, PedidoDeGate, VerdictoDoGate };

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

export interface RegistroDeAprovacao {
  pedido: PedidoDeGate;
  decisoes: DecisaoDeGate[];
  verdicto: VerdictoDoGate;
  material: string;
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
  private sequencia = 0;

  constructor(
    private readonly autoridade: AutoridadeDoHost,
    private readonly relogio: Relogio
  ) {}

  /** Abre o pedido e sela o material que a pessoa vai revisar. */
  async abrir(material: MaterialDeRevisao, solicitadoPor: string): Promise<PedidoDeGate> {
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
    registro.decisoes.push({
      ...decisao,
      pedidoId: registro.pedido.id,
      bundleHash: registro.pedido.bundleHash,
      decididoEm: this.relogio.agora().toISOString()
    });
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
    return verdicto;
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
    return registro.material === serializarMaterial(material);
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
    return registro.verdicto.explicacao;
  }

  verdictoDe(relationshipId: string, endpointId: string): VerdictoDoGate | undefined {
    return this.verdictos.get(chaveDeAprovacao(relationshipId, endpointId));
  }

  pedidosAbertos(): readonly PedidoDeGate[] {
    return [...this.registros.values()]
      .filter((r) => !r.verdicto.autorizado)
      .map((r) => r.pedido);
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
