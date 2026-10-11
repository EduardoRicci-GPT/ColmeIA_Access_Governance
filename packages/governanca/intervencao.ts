// ---------------------------------------------------------------------------
// AUTORIDADE DE INTERVENÇÃO — D-056: observar não autoriza intervir
//
// Quando a governança de acesso alcança o ambiente físico de uma unidade de
// saúde, ela encontra sistemas que não são portas: porta corta-fogo, elevador,
// rede de gases medicinais, climatização de bloco cirúrgico, bomba de água,
// quadro de energia. O produto chega a eles por um caminho legítimo — todos
// têm acesso restrito, todos têm quem responde por eles, e todos geram
// observação.
//
// E é aí que o delta aparece. A cadeia que vai da observação à intervenção tem
// quatro atos distintos, e um sistema de facilities mal desenhado os colapsa em
// um:
//
//   OBSERVAÇÃO     um sensor, uma pessoa ou um modelo relata um fato.
//   AVALIAÇÃO      alguém classifica a condição com critério declarado.
//   INCIDENTE      a instituição reconhece que há um fato a tratar.
//   INTERVENÇÃO    alguém com alçada autoriza um ato sobre o equipamento.
//
// O colapso é tentador porque parece eficiência: o sensor detecta pressão baixa
// na rede de oxigênio, o sistema "sabe" que isso é crítico, e aciona o
// religamento da linha de reserva sozinho. Em noventa e nove por cento dos
// casos funciona. No centésimo, o sensor estava com deriva, a linha de reserva
// estava em manutenção, e o sistema desligou a rede principal de um bloco
// cirúrgico com três salas ocupadas.
//
// O ADR-0003 já tinha reservado o vocabulário para isto antes de haver o que
// pôr nele: CONSULTIVO lê, mede e propõe; HUMANO aprova o que o automatismo não
// pode; EXECUTIVO materializa. Um sensor é CONSULTIVO. Um modelo de linguagem
// que triou a observação é CONSULTIVO. Nenhum dos dois atravessa para HUMANO
// por ter acertado muitas vezes.
//
// O QUE ESTE MÓDULO GARANTE, POR CONSTRUÇÃO
//
//  · `avaliar` não abre incidente. `abrirIncidente` exige avaliação.
//  · `autorizarIntervencao` exige decisão humana com assinatura conferida pelo
//    host e alçada para a criticidade — é o mesmo human-gate das aprovações de
//    acesso, com o mesmo hash ligando a decisão ao conteúdo revisado.
//  · nenhuma função deste arquivo comanda equipamento. `ordemDeIntervencao` só
//    existe depois de AUTORIZADA, e devolve um REGISTRO: quem executa é a
//    camada executiva, por outro caminho, e com este registro na mão.
//  · observação de modelo não pode ser a única sustentação de um incidente
//    CRÍTICO. O modelo tria e explica; a condição crítica exige um fato humano
//    ou instrumental embaixo.
// ---------------------------------------------------------------------------

import { AutoridadeDoHost, Criticidade as CriticidadeDoGate, DecisaoDeGate } from '../mpeh-kernel/human-gate/tipos';
import { selarBundle } from '../mpeh-kernel/human-gate/gate';
import { NivelDeRisco, ORDEM_DE_RISCO } from '../dominio/risco';
import { IncidenteFisicoProjetado } from '../dominio/incidente';
import { VerdictoDeAutoridadeFederada } from './federacao';

export type EspecieDeSistemaFisico =
  | 'PORTA_CORTA_FOGO'
  | 'ELEVADOR'
  | 'GASES_MEDICINAIS'
  | 'CLIMATIZACAO'
  | 'AGUA'
  | 'ENERGIA'
  | 'FECHADURA_OU_CONTROLE_DE_ACESSO';

/**
 * Quem relatou. A terceira opção é a que obriga este campo a existir.
 *
 * `MODELO` é a parceria cognitiva relatando — a Sinergentia³ lendo um conjunto
 * de eventos e dizendo "isto parece deriva de sensor, e não queda de pressão".
 * É leitura útil e é CONSULTIVA: o ADR-0027 já estabeleceu que a parceria não
 * decide, não age no mundo e não produz número. Marcar a origem é o que permite
 * ao resto do módulo recusar que ela seja a única base de um incidente crítico.
 */
export type OrigemDaObservacao = 'SENSOR' | 'PESSOA' | 'MODELO';

export interface ObservacaoFisica {
  id: string;
  sistemaId: string;
  especie: EspecieDeSistemaFisico;
  /** Zona em que o sistema está, para encaminhamento e score. */
  zonaId?: string;
  observadoEm: Date;
  origem: OrigemDaObservacao;
  /** Quem ou o que observou: id do sensor, nome da pessoa, id da faculdade. */
  observadoPor: string;
  relato: string;
  /** Medida, quando há. Observação sem medida não é observação pior. */
  medida?: { grandeza: string; valor: number; unidade: string };
}

export type Condicao = 'NORMAL' | 'ATENCAO' | 'ANORMAL' | 'INDETERMINADA';

/**
 * A avaliação da condição — ato separado, com critério declarado.
 *
 * `criterio` é obrigatório, e é a defesa contra a avaliação que se justifica
 * por si mesma. "Pressão em 3,2 bar, abaixo do mínimo operacional de 4,0
 * declarado pela engenharia clínica" é critério. "Anormal" não é.
 */
export interface AvaliacaoDeCondicao {
  id: string;
  observacaoIds: readonly string[];
  condicao: Condicao;
  criterio: string;
  avaliadaPor: string;
  avaliadaEm: Date;
  /** Verdadeiro quando quem avaliou é a parceria cognitiva, e não gente. */
  avaliacaoDeModelo?: boolean;
}

export type StatusDeIncidente = 'ABERTO' | 'EM_TRATAMENTO' | 'ENCERRADO' | 'DESCARTADO';

export interface IncidenteFisico {
  id: string;
  avaliacaoId: string;
  sistemaId: string;
  especie: EspecieDeSistemaFisico;
  zonaId?: string;
  severidade: NivelDeRisco;
  status: StatusDeIncidente;
  abertoEm: Date;
  abertoPor: string;
  /** Papéis a quem o caso foi encaminhado. Vazio = ninguém foi chamado. */
  papeisEncaminhados: readonly string[];
  /** Observações e avaliações que o sustentam. */
  evidencias: readonly string[];
  encerradoEm?: Date;
  encerradoPor?: string;
}

export type EspecieDeIntervencao =
  | 'INSPECAO'
  | 'ISOLAMENTO'
  | 'DESLIGAMENTO'
  | 'RELIGAMENTO'
  | 'DESTRAVA_GERAL'
  | 'SUBSTITUICAO';

/**
 * Criticidade da intervenção, e não do sistema.
 *
 * Inspecionar a rede de gases é BAIXA; desligá-la é CRITICA. O mesmo sistema
 * produz pedidos de alçadas diferentes, e usar a criticidade do SISTEMA faria
 * uma inspeção de rotina acordar a diretoria técnica — o mesmo defeito que
 * `EncaminhamentoPorTipo` existe para evitar do outro lado.
 */
export const CRITICIDADE_DA_INTERVENCAO: Readonly<
  Record<EspecieDeIntervencao, CriticidadeDoGate>
> = Object.freeze({
  INSPECAO: 'BAIXA',
  ISOLAMENTO: 'ALTA',
  DESLIGAMENTO: 'CRITICA',
  RELIGAMENTO: 'ALTA',
  DESTRAVA_GERAL: 'CRITICA',
  SUBSTITUICAO: 'MEDIA'
});

export interface PedidoDeIntervencao {
  id: string;
  incidenteId: string;
  /**
   * A organização ASSISTENCIAL em que a intervenção vai acontecer.
   *
   * Está aqui por causa do D-057, e é um campo que parecia redundante até o
   * delta mostrar por que não é: num sistema multicliente, quem aprova uma
   * intervenção pode ter papel numa organização e nenhum papel nesta. Sem a
   * organização no pedido, a conferência de autoridade federada não tem contra
   * o que conferir, e a integradora que mantém as fechaduras passa a autorizar
   * desligamento de rede de gases.
   */
  organizationId: string;
  sistemaId: string;
  especie: EspecieDeIntervencao;
  justificativa: string;
  pedidoPor: string;
  pedidoEm: Date;
  /** Sistemas e zonas afetados se a intervenção acontecer. */
  afetados: readonly string[];
}

export type MotivoDeRecusaDeIntervencao =
  | 'SEM_DECISAO_HUMANA'
  | 'ASSINATURA_INVALIDA'
  | 'SEM_ALCADA'
  | 'RECUSADO_PELO_HUMANO'
  | 'JUSTIFICATIVA_AUSENTE'
  | 'CONTEUDO_MUDOU_APOS_REVISAO'
  | 'ORIGEM_CONSULTIVA'
  | 'INCIDENTE_NAO_ABERTO'
  /**
   * O aprovador tem o papel, e não o tem NESTA organização (D-057).
   *
   * Motivo próprio, e não reaproveitamento de `SEM_ALCADA`: as duas recusas
   * exigem providências opostas. `SEM_ALCADA` sobe o caso para quem decide
   * mais alto; esta diz que o caso está na mesa errada, e subir não resolve.
   */
  | 'AUTORIDADE_NAO_FEDERADA';

export interface VerdictoDeIntervencao {
  autorizada: boolean;
  motivo?: MotivoDeRecusaDeIntervencao;
  explicacao: string;
  registro: {
    pedidoId: string;
    incidenteId: string;
    bundleHash: string;
    criticidade: CriticidadeDoGate;
    autorizadoPor?: string;
    papel?: string;
  };
}

/** O material que uma pessoa revisa antes de autorizar uma intervenção. */
export interface MaterialDeIntervencao {
  incidenteId: string;
  sistemaId: string
  especie: EspecieDeSistemaFisico;
  severidade: NivelDeRisco;
  intervencao: EspecieDeIntervencao;
  justificativa: string;
  afetados: readonly string[];
  /** Condição avaliada e o critério que a sustentou. */
  condicao: Condicao;
  criterio: string;
  /** Quantas observações sustentam o incidente, e de que origens. */
  origensDaObservacao: readonly OrigemDaObservacao[];
}

export function serializarMaterialDeIntervencao(material: MaterialDeIntervencao): string {
  return [
    material.incidenteId,
    material.sistemaId,
    material.especie,
    material.severidade,
    material.intervencao,
    material.justificativa,
    [...material.afetados].sort().join(','),
    material.condicao,
    material.criterio,
    [...material.origensDaObservacao].sort().join(',')
  ].join('§');
}

/**
 * Severidade do incidente a partir da condição e da espécie do sistema.
 *
 * Tabela declarada, como `classificarRisco` — e pela mesma razão do item 28:
 * severidade define quem é acordado às 3h e o que entra em relatório de
 * conformidade. Um número que muda de execução para execução não sustenta
 * nenhuma das duas coisas.
 */
const PISO_POR_ESPECIE: Readonly<Record<EspecieDeSistemaFisico, NivelDeRisco>> = Object.freeze({
  PORTA_CORTA_FOGO: 'HIGH',
  ELEVADOR: 'MEDIUM',
  GASES_MEDICINAIS: 'CRITICAL',
  CLIMATIZACAO: 'MEDIUM',
  AGUA: 'HIGH',
  ENERGIA: 'HIGH',
  FECHADURA_OU_CONTROLE_DE_ACESSO: 'MEDIUM'
});

export function severidadeDoIncidente(
  especie: EspecieDeSistemaFisico,
  condicao: Condicao
): NivelDeRisco {
  const piso = PISO_POR_ESPECIE[especie];
  switch (condicao) {
    case 'ANORMAL':
      return piso;
    case 'ATENCAO':
      return ORDEM_DE_RISCO[piso] > ORDEM_DE_RISCO.MEDIUM ? 'MEDIUM' : piso;
    case 'INDETERMINADA':
      // Não saber a condição de uma rede de gases medicinais não é "normal com
      // ressalva". A indeterminação herda o piso da espécie, pela mesma razão
      // que `DEVICE_SYNC_UNKNOWN` conta como indisponível no Health Score.
      return piso;
    default:
      return 'LOW';
  }
}

export interface ResultadoDeAvaliacao {
  avaliacao: AvaliacaoDeCondicao;
  /** Verdadeiro quando a avaliação, por si, NÃO pode abrir incidente crítico. */
  exigeFatoNaoModelado: boolean;
  explicacao: string;
}

/**
 * Avalia a condição — e não abre incidente.
 *
 * A separação é o delta. Uma função que avaliasse e abrisse incidente no mesmo
 * ato tornaria impossível perguntar depois quem decidiu que aquilo era um
 * incidente: a resposta seria "o código".
 */
export function avaliarCondicao(params: {
  id: string;
  observacoes: readonly ObservacaoFisica[];
  condicao: Condicao;
  criterio: string;
  avaliadaPor: string;
  avaliadaEm: Date;
  avaliacaoDeModelo?: boolean;
}): ResultadoDeAvaliacao {
  const origens = new Set(params.observacoes.map((o) => o.origem));
  const somenteModelo = origens.size > 0 && origens.size === 1 && origens.has('MODELO');
  const avaliacao: AvaliacaoDeCondicao = {
    id: params.id,
    observacaoIds: params.observacoes.map((o) => o.id),
    condicao: params.condicao,
    criterio: params.criterio,
    avaliadaPor: params.avaliadaPor,
    avaliadaEm: params.avaliadaEm,
    avaliacaoDeModelo: params.avaliacaoDeModelo
  };
  return {
    avaliacao,
    exigeFatoNaoModelado: somenteModelo,
    explicacao: somenteModelo
      ? 'Toda a sustentação desta avaliação vem de leitura de modelo. Serve para triar e ' +
        'explicar; não sustenta incidente de severidade alta sem um fato instrumental ou humano.'
      : `Condição ${params.condicao} avaliada por ${params.avaliadaPor} sob critério declarado.`
  };
}

export interface ResultadoDeAbertura {
  incidente: IncidenteFisico | null;
  recusa?: 'SEM_CRITERIO' | 'SOMENTE_MODELO_EM_SEVERIDADE_ALTA' | 'CONDICAO_NORMAL';
  explicacao: string;
}

/**
 * Abre o incidente — exige avaliação, e recusa dois casos.
 *
 * A recusa por `SOMENTE_MODELO_EM_SEVERIDADE_ALTA` é a aplicação local do
 * ADR-0027: a parceria cognitiva lê e propõe, e um incidente de severidade alta
 * sobre rede de gases é exatamente o tipo de fato que não pode nascer de prosa.
 * Note que a recusa NÃO descarta a leitura do modelo: ela exige que haja um
 * fato instrumental ou humano embaixo, e a leitura continua entre as evidências.
 */
export function abrirIncidente(params: {
  id: string;
  avaliacao: AvaliacaoDeCondicao;
  observacoes: readonly ObservacaoFisica[];
  sistemaId: string;
  especie: EspecieDeSistemaFisico;
  zonaId?: string;
  abertoPor: string;
  abertoEm: Date;
  papeisEncaminhados?: readonly string[];
}): ResultadoDeAbertura {
  if (params.avaliacao.criterio.trim() === '') {
    return {
      incidente: null,
      recusa: 'SEM_CRITERIO',
      explicacao:
        'Avaliação sem critério declarado não abre incidente. Um incidente que não diz por que ' +
        'é incidente não se audita e não se encerra.'
    };
  }
  if (params.avaliacao.condicao === 'NORMAL') {
    return {
      incidente: null,
      recusa: 'CONDICAO_NORMAL',
      explicacao: 'Condição avaliada como normal. Não há incidente a abrir, e a observação fica no registro.'
    };
  }

  const severidade = severidadeDoIncidente(params.especie, params.avaliacao.condicao);
  const origens = new Set(params.observacoes.map((o) => o.origem));
  const somenteModelo = origens.size === 1 && origens.has('MODELO');
  if (somenteModelo && ORDEM_DE_RISCO[severidade] >= ORDEM_DE_RISCO.HIGH) {
    return {
      incidente: null,
      recusa: 'SOMENTE_MODELO_EM_SEVERIDADE_ALTA',
      explicacao:
        `Severidade ${severidade} sustentada apenas por leitura de modelo. A leitura segue válida ` +
        'como triagem e como explicação, e o incidente espera um fato instrumental ou humano. ' +
        'A parceria cognitiva lê e propõe; não constata.'
    };
  }

  return {
    incidente: {
      id: params.id,
      avaliacaoId: params.avaliacao.id,
      sistemaId: params.sistemaId,
      especie: params.especie,
      zonaId: params.zonaId,
      severidade,
      status: 'ABERTO',
      abertoEm: params.abertoEm,
      abertoPor: params.abertoPor,
      papeisEncaminhados: params.papeisEncaminhados ?? [],
      evidencias: [params.avaliacao.id, ...params.observacoes.map((o) => o.id)]
    },
    explicacao:
      `Incidente ${severidade} aberto sobre ${params.especie} (${params.sistemaId}), ` +
      `sustentado por ${params.observacoes.length} observação(ões). ` +
      ((params.papeisEncaminhados ?? []).length === 0
        ? 'Nenhum papel foi encaminhado: este incidente não chamou ninguém, e o registro diz isso.'
        : `Encaminhado a: ${(params.papeisEncaminhados ?? []).join(', ')}.`)
  };
}

/**
 * A mesa de intervenção — o human-gate aplicado ao equipamento físico.
 *
 * Usa o mesmo mecanismo das aprovações de acesso: o hash do material revisado,
 * a assinatura conferida pelo host, a alçada por criticidade. Reusar é a
 * decisão certa aqui, e não economia: uma segunda implementação de aprovação
 * humana neste repositório produziria duas verdades sobre quem pode decidir, e
 * o ADR-0012 existe exatamente contra isso.
 */
/**
 * A conferência de autoridade federada (D-057), como porta.
 *
 * Entra por construtor e é opcional: numa instalação de um hospital só, a
 * pergunta não tem conteúdo e a mesa opera com a alçada por papel, como antes.
 * Numa instalação multicliente, ela é o que impede a herança indevida — e é
 * nela que o D-057 ganha um chamador de produção, em vez de ficar sendo uma
 * capacidade correta que só o teste exerce.
 */
export interface ConferenciaDeAutoridadeFederada {
  papelVale(params: {
    relationshipId: string;
    organizationId: string;
    papel: string;
    agora: Date;
  }): VerdictoDeAutoridadeFederada;
}

export class MesaDeIntervencao {
  constructor(
    private readonly autoridade: AutoridadeDoHost,
    private readonly federacao?: ConferenciaDeAutoridadeFederada
  ) {}

  /** O pedido e o hash do que será revisado. */
  async prepararMaterial(
    pedido: PedidoDeIntervencao,
    material: MaterialDeIntervencao
  ): Promise<{ bundleHash: string; criticidade: CriticidadeDoGate; conteudo: string }> {
    const conteudo = serializarMaterialDeIntervencao(material);
    return {
      bundleHash: await selarBundle(conteudo),
      criticidade: CRITICIDADE_DA_INTERVENCAO[pedido.especie],
      conteudo
    };
  }

  /**
   * Autoriza — ou não — a intervenção.
   *
   * A ordem das recusas é a ordem da honestidade: primeiro o que não é decisão
   * (incidente fechado, justificativa vazia), depois o que é decisão inválida
   * (hash divergente, assinatura, alçada), e só então a recusa humana legítima.
   * Inverter essa ordem faria uma recusa por falta de alçada aparecer na trilha
   * como recusa de mérito.
   */
  async autorizar(params: {
    pedido: PedidoDeIntervencao;
    incidente: IncidenteFisico;
    material: MaterialDeIntervencao;
    decisao: DecisaoDeGate;
    /**
     * O vínculo institucional de quem decide, para a conferência federada.
     *
     * Separado de `decisao.aprovador` porque são coisas diferentes: o aprovador
     * é a identidade que assinou, e o vínculo é o que carrega papel numa
     * organização. A mesma identidade pode ter vínculo em duas, e é exatamente
     * esse o caso que o D-057 existe para não confundir.
     */
    relationshipDoAprovador?: string;
  }): Promise<VerdictoDeIntervencao> {
    const { bundleHash, criticidade, conteudo } = await this.prepararMaterial(
      params.pedido,
      params.material
    );
    const registro = {
      pedidoId: params.pedido.id,
      incidenteId: params.incidente.id,
      bundleHash,
      criticidade
    };

    if (params.incidente.status !== 'ABERTO' && params.incidente.status !== 'EM_TRATAMENTO') {
      return {
        autorizada: false,
        motivo: 'INCIDENTE_NAO_ABERTO',
        explicacao:
          `O incidente está ${params.incidente.status}. Intervir sobre incidente encerrado é ` +
          'agir sem fato: se há fato novo, há incidente novo.',
        registro
      };
    }

    if ((params.decisao.justificativa ?? '').trim() === '') {
      return {
        autorizada: false,
        motivo: 'JUSTIFICATIVA_AUSENTE',
        explicacao:
          'Autorização sem justificativa não é decisão: é carimbo. Vale para a recusa também.',
        registro
      };
    }

    const hashAtual = await selarBundle(conteudo);
    if (params.decisao.bundleHash !== hashAtual) {
      return {
        autorizada: false,
        motivo: 'CONTEUDO_MUDOU_APOS_REVISAO',
        explicacao:
          'O material mudou depois da revisão. A autorização estava ligada ao conteúdo revisado, ' +
          'e não ao pedido — mostrar uma coisa e executar outra é o ataque que o hash impede.',
        registro
      };
    }

    if (!(await this.autoridade.assinaturaConfere(params.decisao))) {
      return {
        autorizada: false,
        motivo: 'ASSINATURA_INVALIDA',
        explicacao: `A assinatura apresentada não corresponde a ${params.decisao.aprovador}.`,
        registro
      };
    }

    if (!(await this.autoridade.podeDecidir(params.decisao.papel, criticidade))) {
      return {
        autorizada: false,
        motivo: 'SEM_ALCADA',
        explicacao:
          `${params.decisao.papel} não tem alçada para autorizar ${params.pedido.especie} ` +
          `(criticidade ${criticidade}) sobre ${params.pedido.sistemaId}. ` +
          'O caso sobe; não se resolve aqui.',
        registro
      };
    }

    // A conferência federada vem DEPOIS da alçada e ANTES da recusa humana, e
    // a posição é deliberada: ter alçada e não ter a autoridade aqui são duas
    // recusas distintas, e a trilha precisa poder dizer qual delas aconteceu.
    if (this.federacao && params.relationshipDoAprovador) {
      const verdicto = this.federacao.papelVale({
        relationshipId: params.relationshipDoAprovador,
        organizationId: params.pedido.organizationId,
        papel: params.decisao.papel,
        agora: params.pedido.pedidoEm
      });
      if (!verdicto.autorizado) {
        return {
          autorizada: false,
          motivo: 'AUTORIDADE_NAO_FEDERADA',
          explicacao:
            `${params.decisao.aprovador} exerce ${params.decisao.papel}, e não o exerce em ` +
            `${params.pedido.organizationId}. ${verdicto.explicacao} ` +
            'Visibilidade sobre os equipamentos de uma organização não confere autoridade ' +
            'institucional nela — e subir o caso não resolve: ele está na mesa errada.',
          registro
        };
      }
    }

    if (params.decisao.decisao === 'RECUSADO') {
      return {
        autorizada: false,
        motivo: 'RECUSADO_PELO_HUMANO',
        explicacao:
          `${params.decisao.aprovador} (${params.decisao.papel}) recusou: ${params.decisao.justificativa}`,
        registro: { ...registro, autorizadoPor: params.decisao.aprovador, papel: params.decisao.papel }
      };
    }

    return {
      autorizada: true,
      explicacao:
        `${params.pedido.especie} sobre ${params.pedido.sistemaId} autorizada por ` +
        `${params.decisao.aprovador} (${params.decisao.papel}): ${params.decisao.justificativa}. ` +
        `Afetados declarados: ${params.pedido.afetados.join(', ') || 'nenhum declarado'}.`,
      registro: { ...registro, autorizadoPor: params.decisao.aprovador, papel: params.decisao.papel }
    };
  }
}

/**
 * A ordem de intervenção — um REGISTRO, não um comando.
 *
 * Nada neste módulo fala com equipamento, e esta função é onde a tentação
 * moraria. Ela devolve o que a camada executiva precisa para agir, com a
 * autorização dentro, e lança quando a intervenção não foi autorizada — porque
 * uma ordem construível sem autorização seria uma ordem que alguém, algum dia,
 * construiria.
 */
export interface OrdemDeIntervencao {
  pedidoId: string;
  incidenteId: string;
  sistemaId: string;
  especie: EspecieDeIntervencao;
  autorizadaPor: string;
  papel: string;
  bundleHash: string;
  emitidaEm: Date;
  afetados: readonly string[];
}

export function ordemDeIntervencao(
  pedido: PedidoDeIntervencao,
  verdicto: VerdictoDeIntervencao,
  emitidaEm: Date
): OrdemDeIntervencao {
  if (!verdicto.autorizada || !verdicto.registro.autorizadoPor || !verdicto.registro.papel) {
    throw new Error(
      `Intervenção ${pedido.id} não autorizada (${verdicto.motivo ?? 'sem motivo'}): não há ordem a emitir.`
    );
  }
  return {
    pedidoId: pedido.id,
    incidenteId: pedido.incidenteId,
    sistemaId: pedido.sistemaId,
    especie: pedido.especie,
    autorizadaPor: verdicto.registro.autorizadoPor,
    papel: verdicto.registro.papel,
    bundleHash: verdicto.registro.bundleHash,
    emitidaEm,
    afetados: pedido.afetados
  };
}

/**
 * Encaminhamento de referência dos incidentes físicos.
 *
 * Mesma forma de `ENCAMINHAMENTO_HOSPITALAR`, e a mesma decisão sobre a rota
 * vazia: gases medicinais vão para a engenharia clínica E para a diretoria
 * técnica, porque desligar uma rede de gases é decisão que ninguém toma
 * sozinho. A tabela é do host; esta é a de referência.
 */
export const ENCAMINHAMENTO_DE_INCIDENTES: Readonly<
  Record<EspecieDeSistemaFisico, readonly string[]>
> = Object.freeze({
  PORTA_CORTA_FOGO: Object.freeze(['gerencia-de-facilities', 'supervisao-de-seguranca']) as readonly string[],
  ELEVADOR: Object.freeze(['gerencia-de-facilities']) as readonly string[],
  GASES_MEDICINAIS: Object.freeze(['engenharia-clinica', 'diretoria-tecnica']) as readonly string[],
  CLIMATIZACAO: Object.freeze(['gerencia-de-facilities']) as readonly string[],
  AGUA: Object.freeze(['gerencia-de-facilities']) as readonly string[],
  ENERGIA: Object.freeze(['gerencia-de-facilities', 'diretoria-tecnica']) as readonly string[],
  FECHADURA_OU_CONTROLE_DE_ACESSO: Object.freeze(['supervisao-de-seguranca']) as readonly string[]
});

/**
 * Projeta o incidente para a observabilidade.
 *
 * Único caminho até o indicador, e o campo que importa é `papeisEncaminhados`:
 * vazio significa que o incidente não chamou ninguém. Projetar em vez de passar
 * o incidente inteiro mantém a seta de dependência na direção certa — o painel
 * lê `dominio/`, nunca `governanca/` — e impede que observação, critério e
 * justificativa de intervenção alcancem a tela de score, onde não têm o que
 * fazer.
 */
export function projetarIncidente(incidente: IncidenteFisico): IncidenteFisicoProjetado {
  return {
    incidenteId: incidente.id,
    sistemaId: incidente.sistemaId,
    zonaId: incidente.zonaId,
    severidade: incidente.severidade,
    papeisEncaminhados: incidente.papeisEncaminhados,
    emAberto: incidente.status === 'ABERTO' || incidente.status === 'EM_TRATAMENTO'
  };
}

/**
 * Registro de incidentes físicos em memória — para bancada e piloto.
 *
 * Implementa a consulta que o ciclo e o painel leem, e guarda os incidentes
 * inteiros para a trilha. A separação entre o que ele GUARDA e o que ele
 * PROJETA é o ponto: quem pede a projeção recebe severidade e encaminhamento, e
 * não o critério da avaliação nem a justificativa da intervenção — que são
 * material de auditoria, não de painel.
 */
export class RegistroDeIncidentesFisicos {
  private readonly incidentes = new Map<string, IncidenteFisico>();

  registrar(incidente: IncidenteFisico): void {
    this.incidentes.set(incidente.id, incidente);
  }

  /** Marca o incidente como em tratamento, nomeando quem assumiu. */
  assumir(incidenteId: string, papeis: readonly string[]): IncidenteFisico | undefined {
    const atual = this.incidentes.get(incidenteId);
    if (!atual) return undefined;
    const atualizado: IncidenteFisico = {
      ...atual,
      status: 'EM_TRATAMENTO',
      papeisEncaminhados: [...new Set([...atual.papeisEncaminhados, ...papeis])]
    };
    this.incidentes.set(incidenteId, atualizado);
    return atualizado;
  }

  encerrar(incidenteId: string, por: string, em: Date): IncidenteFisico | undefined {
    const atual = this.incidentes.get(incidenteId);
    if (!atual) return undefined;
    const atualizado: IncidenteFisico = {
      ...atual,
      status: 'ENCERRADO',
      encerradoEm: em,
      encerradoPor: por
    };
    this.incidentes.set(incidenteId, atualizado);
    return atualizado;
  }

  obter(incidenteId: string): IncidenteFisico | undefined {
    return this.incidentes.get(incidenteId);
  }

  todos(): readonly IncidenteFisico[] {
    return [...this.incidentes.values()];
  }

  /**
   * A projeção para o assurance. `agora` entra na assinatura e não é usada
   * para filtrar: o status do incidente é o que decide se ele está em aberto, e
   * não o relógio. O parâmetro existe para que a porta tenha a mesma forma de
   * `HistoricoDeEmergencias` — e para que uma implementação do host que PRECISE
   * do relógio não tenha de mudar o contrato.
   */
  projetarParaAssurance(agora: Date): readonly IncidenteFisicoProjetado[] {
    void agora;
    return this.todos().map(projetarIncidente);
  }
}
