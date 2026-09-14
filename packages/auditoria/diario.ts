// ---------------------------------------------------------------------------
// DIÁRIO DE APROVAÇÃO — o ato humano entra na cadeia
//
// A trilha existe para responder três perguntas: quem tinha acesso, até quando
// e por quê. Até aqui ela respondia bem as duas primeiras e mal a terceira,
// porque o "por quê" de um acesso aprovado é uma PESSOA, e a decisão dessa
// pessoa não deixava elo. O ledger registrava fielmente a concessão do direito,
// a ordem enviada ao equipamento e a confirmação do dispositivo — toda a
// execução — e era mudo sobre o ato que autorizou tudo aquilo.
//
// A consequência prática aparece numa investigação. Pergunta-se "quem liberou o
// cofre?" e a cadeia mostra `EntitlementGranted` assinado por
// `entitlement-reconciliation`: o motor. Verdadeiro e inútil — o motor executou
// uma decisão que estava guardada num `Map` em memória, fora da cadeia, sem
// sequência contígua, sem encadeamento por hash e sem recomputação. Justamente
// o elo que mais precisa resistir a adulteração era o único que não estava na
// estrutura que resiste.
//
// POR QUE O DIÁRIO ACUMULA EM VEZ DE GRAVAR
//
// A porta do gate é síncrona: `autorizado()` responde no meio do laço do motor
// de reconciliação e não pode esperar por E/S. O ledger é assíncrono, porque
// encadear por hash é assíncrono. Fazer a ponte com promessa solta resolveria a
// assinatura e criaria o defeito: elo gravado fora de ordem, falha de escrita
// virando rejeição não tratada, e uma cadeia cuja sequência depende de quem
// ganhou a corrida. Acumular e drenar num ponto determinado mantém a cadeia
// reproduzível — que é a única propriedade pela qual ela vale alguma coisa.
// ---------------------------------------------------------------------------

import {
  AtoDeAprovacao,
  DiarioDeAprovacao,
  MaterialDeRevisao
} from '../governanca/aprovacao';
import { EventoDeDominio } from '../dominio/eventos';
import { TrilhaDeAcesso } from './trilha';

export interface OpcoesDoDiario {
  organizationId: string;
  facilityId?: string;
  prefixoDeId?: string;
}

/** Frase determinística, sem modelo de linguagem — como todo resumo da trilha. */
function resumoDoAto(ato: AtoDeAprovacao): string {
  const onde = `${ato.material.nomeDoEndpoint} (${ato.material.criticidade})`;
  switch (ato.tipo) {
    case 'PEDIDA':
      return (
        `Aprovação humana solicitada por ${ato.solicitadoPor} para liberar ` +
        `${ato.material.personId} em ${onde}. Razão: ${ato.material.razaoDaPolitica}`
      );
    case 'DECIDIDA': {
      const { alcada } = ato;
      const verbo = alcada.decisao === 'APROVADO' ? 'aprovou' : 'recusou';
      // O teto de autoridade entra no resumo, e não só nos dados: quem lê a
      // linha da trilha precisa ver a alçada sem abrir o payload, porque é a
      // pergunta seguinte em toda investigação — "e essa pessoa podia?".
      const teto = alcada.ate ?? 'NENHUMA';
      const fecho = ato.autorizadoAgora
        ? 'Com esta decisão o gate passou a autorizar.'
        : 'O gate ainda não autoriza.';
      return (
        `${alcada.aprovador} (${alcada.papel}, alçada até ${teto}) ${verbo} o acesso de ` +
        `${ato.material.personId} em ${onde}. Justificativa: ${ato.justificativa} ${fecho}`
      );
    }
    case 'VENCIDA':
      return (
        `A vigência da aprovação de ${ato.material.personId} em ${onde} venceu. ` +
        `Concedida por ${ato.aprovadores.join(', ') || '—'}; nada no material mudou, ` +
        'e é por isso que só o tempo a derrubou. Exige nova revisão humana.'
      );
  }
}

/**
 * Projeção do material para o payload do evento.
 *
 * Explícita, campo a campo, e é de propósito: copiar o material inteiro faria a
 * trilha herdar, sem ninguém decidir, todo campo que um dia for acrescentado ao
 * que se revisa. A fronteira de dado clínico do ADR-0007 se mantém porque
 * alguém escreve esta lista, não porque o objeto de origem se comporta.
 */
function projetar(material: MaterialDeRevisao): Record<string, unknown> {
  return {
    personId: material.personId,
    relationshipId: material.relationshipId,
    endpointId: material.endpointId,
    zonaId: material.zonaId,
    criticidade: material.criticidade,
    papeis: [...material.papeis].sort(),
    tipoDeVinculo: material.tipoDeVinculo
  };
}

/**
 * Adaptador entre o gate e o ledger.
 *
 * Implementa a porta síncrona que a governança declara e acumula os eventos até
 * que alguém drene. Quem drena é quem sabe quando é seguro gravar: no ciclo, o
 * orquestrador; na bancada, o teste.
 */
export class DiarioNaTrilha implements DiarioDeAprovacao {
  private readonly pendentes: EventoDeDominio[] = [];
  private sequencia = 0;

  constructor(
    private readonly trilha: TrilhaDeAcesso,
    private readonly opcoes: OpcoesDoDiario
  ) {}

  registrar(ato: AtoDeAprovacao): void {
    this.sequencia += 1;
    const prefixo = this.opcoes.prefixoDeId ?? 'APROV';
    const id = `${prefixo}-${String(this.sequencia).padStart(5, '0')}`;
    const tipo =
      ato.tipo === 'PEDIDA'
        ? 'AccessApprovalRequested'
        : ato.tipo === 'DECIDIDA'
          ? 'AccessApprovalDecided'
          : 'AccessApprovalExpired';

    // `ocorridoEm` × `registradoEm`: iguais nos dois atos que têm ator, e
    // diferentes no vencimento, que aconteceu antes de alguém constatar. O par
    // já existia no domínio para webhook atrasado; aqui ele diz a verdade sobre
    // um fato que nenhum ator produziu.
    const ocorridoEm = ato.em;
    const registradoEm = ato.tipo === 'VENCIDA' ? ato.observadoEm : ato.em;

    this.pendentes.push({
      id,
      tipo,
      ocorridoEm,
      registradoEm,
      origemDeIngestao: 'LOCAL_EVENT',
      // Só a decisão tem origem humana. Pedir é o motor convocando gente, e
      // vencer não é decisão de ninguém — carimbar os três como humanos faria a
      // cadeia atribuir a uma pessoa o que ela não fez.
      decisionOrigin: ato.tipo === 'DECIDIDA' ? 'MANUAL_OPERATOR' : undefined,
      idempotencyKey: `${ato.pedido.id}::${tipo}::${this.sequencia}`,
      organizationId: this.opcoes.organizationId,
      facilityId: this.opcoes.facilityId,
      endpointId: ato.material.endpointId,
      personId: ato.material.personId,
      dados: {
        pedidoId: ato.pedido.id,
        // O hash do material revisado vai junto: é o que liga este elo ao
        // conteúdo exato que a pessoa viu, e sem ele a trilha registraria que
        // houve decisão sem poder dizer sobre o quê.
        bundleHash: ato.pedido.bundleHash,
        criticidadeDoGate: ato.pedido.criticidade,
        material: projetar(ato.material),
        ...(ato.tipo === 'DECIDIDA'
          ? {
              aprovador: ato.alcada.aprovador,
              papel: ato.alcada.papel,
              decisao: ato.alcada.decisao,
              alcadaAte: ato.alcada.ate,
              alcadaExigida: ato.alcada.exigida
            }
          : {}),
        ...(ato.tipo === 'VENCIDA' ? { aprovadores: [...ato.aprovadores] } : {})
      },
      resumo: resumoDoAto(ato)
    });
  }

  /** Quantos atos aguardam gravação. */
  get pendencias(): number {
    return this.pendentes.length;
  }

  /**
   * Grava o acumulado na cadeia, em ordem, e devolve quantos elos entraram.
   *
   * O autor é `operador` mesmo no pedido e no vencimento: o assunto do elo é a
   * decisão humana, e atribuí-lo a um dos motores faria a cadeia parecer dizer
   * que um motor aprovou acesso — que é exatamente a confusão que o ADR-0003
   * existe para impedir.
   */
  async drenar(): Promise<number> {
    const lote = this.pendentes.splice(0, this.pendentes.length);
    return this.trilha.registrarTodos(lote, 'operador');
  }
}
