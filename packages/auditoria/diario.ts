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
import {
  AtoDeAviso,
  AtoDeAvisoDeAssurance,
  AtoDeAvisoDeEmergencia,
  DiarioDeAviso
} from '../governanca/plantao';
import { AtoDeResponsabilidade, DiarioDeResponsabilidade } from '../governanca/responsabilidade';
import { AtoDeEmergencia, DiarioDeEmergencia } from '../governanca/emergencia';
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
/** Frase determinística para o chamado, entregue ou não. */
function resumoDoAviso(ato: AtoDeAviso): string {
  const { aviso } = ato;
  const onde = `${aviso.pendencia.nomeDoEndpoint} (${aviso.pendencia.criticidade})`;
  const alvo =
    aviso.papeisComAlcada.length === 0
      ? 'nenhum papel com alçada nesta instalação'
      : `${aviso.papeisComAlcada.length} papéis com alçada (${[...aviso.papeisComAlcada].sort().join(', ')})`;
  const cabeca =
    `Chamado ${aviso.degrau} por ${aviso.motivo} sobre o acesso de ` +
    `${aviso.pendencia.personId} em ${onde}, dirigido a ${alvo}`;
  return ato.entrega.entregue
    ? `${cabeca}. Entregue pelo canal ${ato.canal}.`
    : `${cabeca}. NÃO entregue: ${ato.entrega.detalhe}`;
}

/** Frase determinística para os quatro atos da exceção operacional. */
function resumoDaResponsabilidade(ato: AtoDeResponsabilidade): string {
  switch (ato.tipo) {
    case 'PEDIDA':
      return (
        `Exceção operacional solicitada para ${ato.pedido.personId} em ` +
        `${ato.pedido.zonaId}: ${ato.pedido.tipo} por ${ato.pedido.motivo}, ` +
        `${ato.pedido.duracaoMinutos} min. Competência informada: ${ato.pedido.competencia}.`
      );
    case 'RECUSADA':
      return `${ato.decididoPor} recusou a exceção (${ato.recusa}). ${ato.explicacao}`;
    case 'CONCEDIDA': {
      const r = ato.responsabilidade;
      const corte = ato.duracaoReduzida ? ' Prazo reduzido pelo teto do escopo.' : '';
      return (
        `${r.concedidaPor} designou ${r.tipo} para ${r.personId} em ${r.zonaId}, ` +
        `por ${r.motivo}, até ${r.validaAte.toISOString()}.${corte} ` +
        `Competência na concessão: ${r.competenciaNaConcessao}.`
      );
    }
    case 'ENCERRADA': {
      const r = ato.responsabilidade;
      return ato.causa === 'VENCIMENTO'
        ? `A responsabilidade temporária de ${r.personId} em ${r.zonaId} venceu. ` +
            'Ninguém a encerrou: o prazo acabou, e os direitos derivados dela caem ' +
            'na próxima reconciliação.'
        : `${r.encerradaPor ?? '—'} encerrou antes do prazo a responsabilidade de ` +
            `${r.personId} em ${r.zonaId}. O apoio terminou; os direitos também.`;
    }
  }
}

/** Frase determinística para os três atos da emergência. */
function resumoDaEmergencia(ato: AtoDeEmergencia): string {
  const p = ato.quebra.pedido;
  const onde = `${p.endpointId} (${p.zonaId}, ${p.criticidade})`;
  switch (ato.tipo) {
    case 'INVOCADA':
      return (
        `${p.invocadaPor} quebrou o vidro em ${onde} por ${p.natureza}: "${p.justificativa}". ` +
        `A porta abre até ${ato.quebra.expiraEm.toISOString()}; nada foi aprovado, e a ` +
        'revisão obrigatória nasce aberta.'
      );
    case 'EXPIRADA':
      return (
        `A janela de emergência de ${p.invocadaPor} em ${onde} fechou. O acesso volta a ` +
        'depender do caminho normal; a revisão continua pendente até que gente a feche.'
      );
    case 'REVISADA':
      return (
        `${ato.revisao.revisadaPor} revisou a quebra de vidro de ${p.invocadaPor} em ${onde}: ` +
        `${ato.revisao.verdicto}. ${ato.revisao.nota}`
      );
  }
}

/** Frase determinística do chamado da emergência, entregue ou não. */
function resumoDoAvisoDeEmergencia(ato: AtoDeAvisoDeEmergencia): string {
  const { aviso } = ato;
  const p = aviso.quebra.pedido;
  const onde = `${p.zonaId} / ${p.endpointId} (${p.criticidade})`;
  const alvo =
    aviso.papeisComAlcada.length === 0
      ? 'nenhum papel com alçada nesta instalação'
      : `${aviso.papeisComAlcada.length} papéis com alçada (${[...aviso.papeisComAlcada].sort().join(', ')})`;
  const assunto =
    aviso.motivo === 'QUEBRA_DE_VIDRO'
      ? `quebra de vidro ${aviso.quebra.id} em curso, invocada por ${p.invocadaPor}`
      : `revisão pendente da quebra de vidro ${aviso.quebra.id}, cuja janela já fechou`;
  const cabeca = `Comunicada ${assunto} sobre ${p.personId} em ${onde}, dirigida a ${alvo}`;
  return ato.entrega.entregue
    ? `${cabeca}. Entregue pelo canal ${ato.canal}.`
    : `${cabeca}. NÃO entregue: ${ato.entrega.detalhe}`;
}

/** Frase determinística do chamado sobre um caso de escalonamento. */
function resumoDoAvisoDeAssurance(ato: AtoDeAvisoDeAssurance): string {
  const { aviso, entrega } = ato;
  const alvo =
    aviso.papeisComAlcada.length === 0
      ? 'nenhum papel responsável por este tipo nesta instalação'
      : `${aviso.papeisComAlcada.length} papéis responsáveis (${[...aviso.papeisComAlcada].sort().join(', ')})`;
  const cabeca =
    `Chamado ${aviso.degrau} sobre o caso ${aviso.casoId} (${aviso.tipo}, ` +
    `severidade ${aviso.caso.severity}), dirigido a ${alvo}`;
  return entrega.entregue
    ? `${cabeca}. Entregue pelo canal ${ato.canal}.`
    : `${cabeca}. NÃO entregue: ${entrega.detalhe}`;
}

export class DiarioNaTrilha
  implements DiarioDeAprovacao, DiarioDeAviso, DiarioDeResponsabilidade, DiarioDeEmergencia
{
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

  /**
   * O chamado a quem pode decidir, entregue ou não.
   *
   * Os dois desfechos entram na cadeia, e o não entregue é o que mais importa:
   * numa instalação sem canal configurado, ele é o único registro de que a
   * fila venceu de madrugada sem que ninguém fosse acordado. Gravar só o
   * sucesso produziria uma trilha em que a operação parece silenciosa porque
   * correu bem.
   *
   * Sem `decisionOrigin`: chamar gente não é decisão de ninguém — é a máquina
   * convocando, e o ADR-0003 chama isso de CONSULTIVO.
   */
  registrarAviso(ato: AtoDeAviso): void {
    this.sequencia += 1;
    const prefixo = this.opcoes.prefixoDeId ?? 'APROV';
    const id = `${prefixo}-${String(this.sequencia).padStart(5, '0')}`;
    const tipo = ato.entrega.entregue
      ? 'AccessApprovalNotified'
      : 'AccessApprovalNotificationUndelivered';
    const { aviso } = ato;

    this.pendentes.push({
      id,
      tipo,
      ocorridoEm: aviso.em,
      registradoEm: aviso.em,
      origemDeIngestao: 'LOCAL_EVENT',
      idempotencyKey: `${aviso.pedidoId}::${tipo}::${aviso.motivo}::${aviso.degrau}`,
      organizationId: this.opcoes.organizationId,
      facilityId: this.opcoes.facilityId,
      endpointId: aviso.pendencia.endpointId,
      personId: aviso.pendencia.personId,
      dados: {
        pedidoId: aviso.pedidoId,
        motivo: aviso.motivo,
        degrau: aviso.degrau,
        faixa: aviso.faixa,
        // Papéis, nunca pessoas: quem está de plantão hoje é fato do host, e
        // copiá-lo para cá criaria uma segunda verdade sobre a escala.
        papeisComAlcada: [...aviso.papeisComAlcada].sort(),
        canal: ato.canal,
        entregue: ato.entrega.entregue,
        detalhe: ato.entrega.detalhe,
        referencia: ato.entrega.referencia
      },
      resumo: resumoDoAviso(ato)
    });
  }

  /**
   * A comunicação da emergência a quem responde pela área.
   *
   * Tipo próprio na cadeia, e não `AccessApprovalNotified` reaproveitado: o elo
   * precisa dizer QUE FATO não alcançou ninguém. Um chamado de aprovação não
   * entregue custa uma decisão atrasada; uma quebra de vidro não comunicada
   * custa uma porta que foi aberta por afirmação de uma pessoa sem que ninguém
   * com alçada soubesse — e é essa a linha que uma investigação procura.
   *
   * Sem `decisionOrigin`, como todo chamado: comunicar não é decidir.
   */
  registrarAvisoDeEmergencia(ato: AtoDeAvisoDeEmergencia): void {
    this.sequencia += 1;
    const prefixo = this.opcoes.prefixoDeId ?? 'APROV';
    const id = `${prefixo}-${String(this.sequencia).padStart(5, '0')}`;
    const tipo = ato.entrega.entregue
      ? 'BreakGlassNotified'
      : 'BreakGlassNotificationUndelivered';
    const { aviso } = ato;
    const p = aviso.quebra.pedido;

    this.pendentes.push({
      id,
      tipo,
      ocorridoEm: aviso.em,
      registradoEm: aviso.em,
      origemDeIngestao: 'LOCAL_EVENT',
      idempotencyKey: `${aviso.quebraId}::${tipo}::${aviso.motivo}`,
      organizationId: this.opcoes.organizationId,
      facilityId: this.opcoes.facilityId,
      endpointId: p.endpointId,
      personId: p.personId,
      dados: {
        quebraId: aviso.quebraId,
        motivo: aviso.motivo,
        faixa: aviso.faixa,
        zonaId: p.zonaId,
        natureza: p.natureza,
        invocadaPor: p.invocadaPor,
        expiraEm: aviso.quebra.expiraEm.toISOString(),
        // Papéis, nunca pessoas — pela mesma razão do chamado de aprovação.
        papeisComAlcada: [...aviso.papeisComAlcada].sort(),
        canal: ato.canal,
        entregue: ato.entrega.entregue,
        detalhe: ato.entrega.detalhe,
        referencia: ato.entrega.referencia
      },
      resumo: resumoDoAvisoDeEmergencia(ato)
    });
  }

  /**
   * Os atos da exceção operacional.
   *
   * Os quatro entram, inclusive a recusa: a tentativa de designar fora do
   * escopo é fato de auditoria tão relevante quanto a designação legítima — e
   * frequentemente mais, porque é ali que se vê alguém procurando a porta
   * lateral.
   */
  registrarResponsabilidade(ato: AtoDeResponsabilidade): void {
    this.sequencia += 1;
    const prefixo = this.opcoes.prefixoDeId ?? 'APROV';
    const id = `${prefixo}-${String(this.sequencia).padStart(5, '0')}`;
    const tipo =
      ato.tipo === 'PEDIDA'
        ? 'TemporaryResponsibilityRequested'
        : ato.tipo === 'RECUSADA'
          ? 'TemporaryResponsibilityDenied'
          : ato.tipo === 'CONCEDIDA'
            ? 'TemporaryResponsibilityGranted'
            : 'TemporaryResponsibilityEnded';

    const alvo = ato.tipo === 'PEDIDA' || ato.tipo === 'RECUSADA' ? ato.pedido : ato.responsabilidade;
    const ocorridoEm = ato.em;
    const registradoEm = ato.tipo === 'ENCERRADA' ? ato.observadoEm : ato.em;

    this.pendentes.push({
      id,
      tipo,
      ocorridoEm,
      registradoEm,
      origemDeIngestao: 'LOCAL_EVENT',
      // Só designar e recusar têm ator humano. Pedir é o sistema convocando; o
      // vencimento não é decisão de ninguém.
      decisionOrigin:
        ato.tipo === 'CONCEDIDA' || ato.tipo === 'RECUSADA' ? 'MANUAL_OPERATOR' : undefined,
      idempotencyKey: `${alvo.id}::${tipo}`,
      organizationId: this.opcoes.organizationId,
      facilityId: alvo.facilityId,
      personId: alvo.personId,
      dados: {
        zonaId: alvo.zonaId,
        tipoDeResponsabilidade: alvo.tipo,
        ...(ato.tipo === 'PEDIDA' || ato.tipo === 'RECUSADA'
          ? {
              pedidoId: ato.pedido.id,
              motivo: ato.pedido.motivo,
              competencia: ato.pedido.competencia,
              duracaoPedidaMinutos: ato.pedido.duracaoMinutos
            }
          : {}),
        ...(ato.tipo === 'RECUSADA'
          ? { recusa: ato.recusa, decididoPor: ato.decididoPor }
          : {}),
        ...(ato.tipo === 'CONCEDIDA' || ato.tipo === 'ENCERRADA'
          ? {
              responsabilidadeId: ato.responsabilidade.id,
              concedidaPor: ato.responsabilidade.concedidaPor,
              escopoId: ato.responsabilidade.escopoId,
              motivo: ato.responsabilidade.motivo,
              competenciaNaConcessao: ato.responsabilidade.competenciaNaConcessao,
              validaDe: ato.responsabilidade.validaDe.toISOString(),
              validaAte: ato.responsabilidade.validaAte.toISOString()
            }
          : {}),
        ...(ato.tipo === 'ENCERRADA' ? { causa: ato.causa } : {})
      },
      resumo: resumoDaResponsabilidade(ato)
    });
  }

  /**
   * Os três atos da emergência.
   *
   * O invocado entra imediatamente, e é isso que torna impossível quebrar o
   * vidro em silêncio — a única coisa que este desenho não admite. `EXPIRADA`
   * separa as duas datas, porque o fim da janela não tem ator: o tempo passou.
   */
  registrarEmergencia(ato: AtoDeEmergencia): void {
    this.sequencia += 1;
    const prefixo = this.opcoes.prefixoDeId ?? 'APROV';
    const id = `${prefixo}-${String(this.sequencia).padStart(5, '0')}`;
    const tipo =
      ato.tipo === 'INVOCADA'
        ? 'BreakGlassInvoked'
        : ato.tipo === 'EXPIRADA'
          ? 'BreakGlassExpired'
          : 'BreakGlassReviewed';
    const p = ato.quebra.pedido;

    this.pendentes.push({
      id,
      tipo,
      ocorridoEm: ato.em,
      registradoEm: ato.tipo === 'EXPIRADA' ? ato.observadoEm : ato.em,
      origemDeIngestao: 'LOCAL_EVENT',
      decisionOrigin: ato.tipo === 'EXPIRADA' ? undefined : 'MANUAL_OPERATOR',
      idempotencyKey: `${ato.quebra.id}::${tipo}`,
      organizationId: this.opcoes.organizationId,
      facilityId: this.opcoes.facilityId,
      endpointId: p.endpointId,
      personId: p.personId,
      dados: {
        quebraId: ato.quebra.id,
        zonaId: p.zonaId,
        criticidade: p.criticidade,
        natureza: p.natureza,
        invocadaPor: p.invocadaPor,
        justificativa: p.justificativa,
        expiraEm: ato.quebra.expiraEm.toISOString(),
        ...(ato.tipo === 'REVISADA'
          ? {
              revisadaPor: ato.revisao.revisadaPor,
              verdicto: ato.revisao.verdicto,
              nota: ato.revisao.nota
            }
          : {})
      },
      resumo: resumoDaEmergencia(ato)
    });
  }

  /**
   * O chamado sobre a divergência física.
   *
   * Sem `decisionOrigin`, como todo chamado: convocar não é decidir. E com o
   * TIPO do caso nos dados, porque é ele que responde a pergunta seguinte de
   * qualquer investigação — "chamaram sobre o quê?".
   */
  registrarAvisoDeAssurance(ato: AtoDeAvisoDeAssurance): void {
    this.sequencia += 1;
    const prefixo = this.opcoes.prefixoDeId ?? 'APROV';
    const id = `${prefixo}-${String(this.sequencia).padStart(5, '0')}`;
    const tipo = ato.entrega.entregue
      ? 'EscalationNotified'
      : 'EscalationNotificationUndelivered';
    const { aviso } = ato;

    this.pendentes.push({
      id,
      tipo,
      ocorridoEm: aviso.em,
      registradoEm: aviso.em,
      origemDeIngestao: 'LOCAL_EVENT',
      idempotencyKey: `${aviso.casoId}::${tipo}::${aviso.degrau}`,
      organizationId: this.opcoes.organizationId,
      facilityId: this.opcoes.facilityId,
      endpointId: aviso.caso.endpointId,
      personId: aviso.caso.subjectId,
      dados: {
        casoId: aviso.casoId,
        tipoDeCaso: aviso.tipo,
        severidade: aviso.caso.severity,
        degrau: aviso.degrau,
        faixa: aviso.faixa,
        // Papéis, nunca pessoas — pela mesma razão dos outros dois chamados.
        papeisComAlcada: [...aviso.papeisComAlcada].sort(),
        canal: ato.canal,
        entregue: ato.entrega.entregue,
        detalhe: ato.entrega.detalhe,
        referencia: ato.entrega.referencia
      },
      resumo: resumoDoAvisoDeAssurance(ato)
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
