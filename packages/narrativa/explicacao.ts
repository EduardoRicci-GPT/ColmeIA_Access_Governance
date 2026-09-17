// ---------------------------------------------------------------------------
// EXPLICAR ACESSO — pessoa × recurso × instante, numa pergunta só
//
// A explicação já existia neste produto, espalhada por seis lugares: a razão
// da decisão de política, o verdicto do gate, a alçada congelada, a leitura de
// competência, a descrição da divergência física e os componentes do score.
// Cada uma correta, nenhuma completa. Uma auditoria pergunta uma vez só, e
// quem responde não deveria precisar montar o quebra-cabeça de cabeça.
//
// DUAS PERGUNTAS QUE PARECEM UMA
//
// "Fulano tem acesso?" é ambígua, e a ambiguidade é justamente o defeito que
// este produto existe para corrigir. Ela pode significar:
//
//   · a organização quer que ele entre? — pergunta lógica, decidida por
//     política, vínculo, competência e aprovação humana;
//   · a porta abre para ele? — pergunta física, decidida pelo equipamento,
//     e que só o equipamento pode confirmar.
//
// Uma explicação que respondesse só a primeira reintroduziria a mentira
// original: diria "tem acesso" sobre uma credencial que o equipamento nunca
// recebeu. Por isso as duas saem sempre juntas, e separadas.
//
// RECOMPUTAR NÃO É RECONSTITUIR
//
// Perguntar sobre AGORA é recomputar: o mundo está aqui, a política roda de
// novo, e a resposta é a mesma que o motor daria. Perguntar sobre ONTEM ÀS
// 14h32 é outra coisa — este produto guarda os ATOS na cadeia, não o ESTADO do
// mundo naquele instante. Rodar a política de hoje sobre a pergunta de ontem
// produziria uma resposta plausível e falsa.
//
// Então a explicação recusa o verdicto retroativo e entrega o que de fato
// sabe: a sequência de elos daquela pessoa naquele endpoint até o instante
// perguntado. Menos sedutor, e é o que existe. Guardar estado histórico para
// responder de verdade está no backlog, e não será fingido enquanto não
// estiver feito.
// ---------------------------------------------------------------------------

import { AccessState } from '../dominio/estado';
import { Relogio } from '../dominio/tempo';
import { Endpoint } from '../dominio/topologia';
import { EventoDeDominio } from '../dominio/eventos';
import { Relationship } from '../dominio/entitlement';
import { MundoLogico, montarContexto } from '../entitlement-reconciliation/motor';
import { PolicyEngine } from '../policy-engine/motor';
import { DecisaoDePolitica } from '../policy-engine/tipos';
import { AlcadaCongelada, VerdictoDoGate, VigenciaDaAprovacao } from '../governanca/aprovacao';
import { ResponsabilidadeTemporaria } from '../governanca/responsabilidade';
import { RepositorioDeRegistrosDeAcesso } from '../persistencia/repositorios';

export interface PerguntaDeAcesso {
  relationshipId: string;
  endpointId: string;
  /** Ausente significa agora. Instante passado muda a natureza da resposta. */
  em?: Date;
}

export type VereditoDaExplicacao =
  | 'PERMITE'
  | 'EXIGE_REVISAO'
  | 'NEGA'
  /** Não há vínculo ou endpoint com esse identificador. */
  | 'SEM_SUJEITO'
  /** Pergunta sobre o passado: os atos são conhecidos, o verdicto não. */
  | 'NAO_RECONSTITUIVEL';

export type LeituraDaCamada =
  | 'SUSTENTA'
  | 'BLOQUEIA'
  | 'EXIGE_REVISAO'
  | 'NAO_SE_APLICA'
  | 'DESCONHECIDO';

export interface CamadaDaExplicacao {
  nome: string;
  leitura: LeituraDaCamada;
  texto: string;
}

export interface EstadoFisicoNaExplicacao {
  /** Houve alguma confirmação do equipamento alguma vez? */
  confirmado: boolean;
  estado: AccessState | null;
  texto: string;
}

export interface ExplicacaoDeAcesso {
  pergunta: PerguntaDeAcesso;
  /** `RECOMPUTADA` responde pelo agora; `RECONSTRUIDA` narra a cadeia. */
  natureza: 'RECOMPUTADA' | 'RECONSTRUIDA';
  veredito: VereditoDaExplicacao;
  camadas: readonly CamadaDaExplicacao[];
  estadoFisico: EstadoFisicoNaExplicacao;
  regrasAplicadas: readonly string[];
  conflitos: readonly string[];
  /** O efeito veio do fechamento padrão, e não de uma regra que disse algo. */
  porOmissao: boolean;
  /** Frases determinísticas, na ordem de leitura. Nunca geradas por modelo. */
  linhas: readonly string[];
}

/** Só o que a explicação consulta do gate — não a classe inteira. */
export interface GateNaExplicacao {
  verdictoDe(relationshipId: string, endpointId: string): VerdictoDoGate | undefined;
  vigenciaDe(relationshipId: string, endpointId: string): VigenciaDaAprovacao;
  alcadasDe(relationshipId: string, endpointId: string): readonly AlcadaCongelada[];
}

export interface ResponsabilidadesNaExplicacao {
  todas(): readonly ResponsabilidadeTemporaria[];
}

export interface TrilhaNaExplicacao {
  porEndpoint(endpointId: string): Promise<readonly { evento: EventoDeDominio }[]>;
}

export interface FontesDaExplicacao {
  mundo: MundoLogico;
  politica: PolicyEngine;
  registros: RepositorioDeRegistrosDeAcesso;
  relogio: Relogio;
  gate?: GateNaExplicacao;
  responsabilidades?: ResponsabilidadesNaExplicacao;
  trilha?: TrilhaNaExplicacao;
}

function credencialDe(relationshipId: string, endpointId: string): string {
  return `CRED-${relationshipId}-${endpointId}`;
}

function horario(data: Date): string {
  return data.toISOString();
}

function camadaDoEstadoFisico(estado: AccessState | null): EstadoFisicoNaExplicacao {
  if (estado === null) {
    return {
      confirmado: false,
      estado: null,
      texto:
        'Não há registro de credencial para esta dupla. O direito pode existir na lógica ' +
        'da organização sem que nada tenha sido enviado ao equipamento — e é por isso que ' +
        'esta seção existe separada da anterior.'
    };
  }
  const confirmado = estado.lastConfirmedState !== null;
  const quando = estado.lastSyncAt === null ? 'nunca' : horario(estado.lastSyncAt);
  return {
    confirmado,
    estado,
    texto: confirmado
      ? `O equipamento confirmou ${estado.lastConfirmedState} na última sincronização (${quando}). ` +
        `O desejado é ${estado.desiredState}; a nuvem está em ${estado.cloudState}.`
      : `O equipamento NUNCA confirmou estado para esta credencial. Desejado ${estado.desiredState}, ` +
        `nuvem ${estado.cloudState}, dispositivo ${estado.deviceState}. Última sincronização: ${quando}. ` +
        'Ausência de confirmação não é negativa nem concessão: é desconhecimento, e ele é dito.'
  };
}

function camadasDoContexto(
  vinculo: Relationship,
  endpoint: Endpoint,
  mundo: MundoLogico,
  decisao: DecisaoDePolitica,
  agora: Date,
  fontes: FontesDaExplicacao
): CamadaDaExplicacao[] {
  const contexto = montarContexto(mundo, vinculo, endpoint, agora);
  const camadas: CamadaDaExplicacao[] = [];

  camadas.push({
    nome: 'Vínculo',
    leitura: contexto.vinculoVigente ? 'SUSTENTA' : 'BLOQUEIA',
    texto: contexto.vinculoVigente
      ? `Vínculo ${vinculo.id} (${vinculo.tipo}) vigente em ${horario(agora)}.`
      : `Vínculo ${vinculo.id} NÃO está vigente em ${horario(agora)}. Sem vínculo não há ` +
        'direito a discutir: é o bloqueio que vem antes de todos os outros.'
  });

  camadas.push({
    nome: 'Turno',
    leitura: contexto.turnoVigente ? 'SUSTENTA' : 'BLOQUEIA',
    texto: vinculo.escala
      ? contexto.turnoVigente
        ? 'O instante perguntado está dentro da janela de turno escalada.'
        : 'O instante perguntado está FORA da janela de turno escalada.'
      : 'Este vínculo não tem escala declarada, e por isso o turno não restringe.'
  });

  const porPapel = contexto.zonasAutorizadas.includes(endpoint.zonaId);
  const porLotacao = vinculo.unidadesLotadas.includes(endpoint.zonaId);
  camadas.push({
    nome: 'Papel e lotação',
    leitura: porPapel || porLotacao ? 'SUSTENTA' : 'NAO_SE_APLICA',
    texto:
      porPapel || porLotacao
        ? `A zona ${endpoint.zonaId} é alcançada ${porPapel ? 'pelos papéis ' + vinculo.roleIds.join(', ') : ''}` +
          `${porPapel && porLotacao ? ' e ' : ''}${porLotacao ? 'pela lotação do vínculo' : ''}.`
        : `Nem os papéis (${vinculo.roleIds.join(', ') || '—'}) nem a lotação ` +
          `(${vinculo.unidadesLotadas.join(', ') || '—'}) alcançam a zona ${endpoint.zonaId}.`
  });

  const temporarias = (fontes.responsabilidades?.todas() ?? []).filter(
    (r) =>
      r.relationshipId === vinculo.id &&
      r.zonaId === endpoint.zonaId &&
      r.validaDe.getTime() <= agora.getTime() &&
      agora.getTime() < r.validaAte.getTime() &&
      r.estado === 'ATIVA'
  );
  camadas.push({
    nome: 'Responsabilidade temporária',
    leitura: temporarias.length > 0 ? 'SUSTENTA' : 'NAO_SE_APLICA',
    texto:
      temporarias.length > 0
        ? temporarias
            .map(
              (r) =>
                `${r.concedidaPor} designou ${r.tipo} por ${r.motivo}, válida até ` +
                `${horario(r.validaAte)} (escopo ${r.escopoId}, competência na concessão: ` +
                `${r.competenciaNaConcessao}).`
            )
            .join(' ')
        : 'Nenhuma responsabilidade temporária vigente nesta zona para este vínculo.'
  });

  const competencia = contexto.competencia;
  camadas.push({
    nome: 'Competência',
    leitura: !competencia?.exigida
      ? 'NAO_SE_APLICA'
      : competencia.atende
        ? 'SUSTENTA'
        : competencia.suspensa
          ? 'BLOQUEIA'
          : 'EXIGE_REVISAO',
    texto: competencia?.explicacao ?? 'Esta zona não declara exigência de competência.'
  });

  const segregacao = decisao.regrasAplicadas.includes('R-SEGREGACAO-POR-ATIVIDADE');
  camadas.push({
    nome: 'Segregação de funções',
    leitura: segregacao ? 'EXIGE_REVISAO' : 'NAO_SE_APLICA',
    texto: segregacao
      ? 'Há acúmulo de atividades incompatíveis nesta zona; a regra pede revisão humana, ' +
        'e não fecha a porta — numa unidade pequena o acúmulo costuma ser a escala possível.'
      : 'Nenhum acúmulo de atividade incompatível apurado nesta zona.'
  });

  camadas.push({
    nome: 'Política',
    leitura:
      decisao.efeito === 'ALLOW'
        ? 'SUSTENTA'
        : decisao.efeito === 'DENY'
          ? 'BLOQUEIA'
          : 'EXIGE_REVISAO',
    texto:
      `Efeito ${decisao.efeito} por ${decisao.regrasAplicadas.join(', ') || 'fechamento padrão'}. ` +
      `${decisao.razao}${decisao.porOmissao ? ' (nenhuma regra disse nada: fechou por omissão.)' : ''}`
  });

  if (decisao.efeito === 'REQUIRE_APPROVAL') {
    const verdicto = fontes.gate?.verdictoDe(vinculo.id, endpoint.id);
    const vigencia = fontes.gate?.vigenciaDe(vinculo.id, endpoint.id);
    const alcadas = fontes.gate?.alcadasDe(vinculo.id, endpoint.id) ?? [];
    const autorizado = verdicto?.autorizado === true && vigencia?.vencida !== true;
    camadas.push({
      nome: 'Aprovação humana',
      leitura: autorizado ? 'SUSTENTA' : 'EXIGE_REVISAO',
      texto: !verdicto
        ? 'A política exige revisão humana e NENHUM pedido foi aberto para este acesso.'
        : autorizado
          ? `Aprovado por ${alcadas
              .filter((a) => a.decisao === 'APROVADO')
              .map((a) => `${a.aprovador} (${a.papel}, alçada até ${a.ate ?? 'NENHUMA'})`)
              .join(', ')}. ` +
            `Vigente${vigencia?.expiraEm ? ` até ${horario(vigencia.expiraEm)}` : ''}.`
          : `Ainda não autoriza: ${verdicto.explicacao}`
    });
  }

  const capacidades = endpoint.capacidades ?? [];
  {
    const ausentes: string[] = [];
    if (!capacidades.includes('REMOTE_REVOCATION')) ausentes.push('revogação remota');
    if (!capacidades.includes('EVENT_STREAM')) ausentes.push('fluxo de eventos');
    if (ausentes.length > 0) {
      camadas.push({
        nome: 'Capacidade do equipamento',
        leitura: 'DESCONHECIDO',
        texto:
          `Este endpoint não suporta: ${ausentes.join(', ')}. A resposta lógica acima não ` +
          'muda por causa disso, mas a confirmação física tem limite declarado — e é bom ' +
          'saber disso antes de confiar nela.'
      });
    }
  }

  return camadas;
}

/**
 * A pergunta única.
 *
 * Devolve o veredito lógico E o estado físico, separados, porque respondê-los
 * juntos é a confusão que este produto inteiro existe para desfazer.
 */
export async function explicarAcesso(
  pergunta: PerguntaDeAcesso,
  fontes: FontesDaExplicacao
): Promise<ExplicacaoDeAcesso> {
  const agora = fontes.relogio.agora();
  const em = pergunta.em ?? agora;
  const registro = fontes.registros.obter(
    credencialDe(pergunta.relationshipId, pergunta.endpointId)
  );
  const estadoFisico = camadaDoEstadoFisico(registro?.estado ?? null);

  // Passado: os atos são conhecidos, o mundo daquele instante não. Recomputar
  // a política de hoje e apresentar como resposta de ontem seria plausível e
  // falso — e este produto não troca honestidade por conveniência de tela.
  if (em.getTime() < agora.getTime() - 1000) {
    const elos = (await fontes.trilha?.porEndpoint(pergunta.endpointId)) ?? [];
    const relevantes = elos
      .map((elo) => elo.evento)
      .filter((evento) => evento.ocorridoEm.getTime() <= em.getTime());
    return {
      pergunta,
      natureza: 'RECONSTRUIDA',
      veredito: 'NAO_RECONSTITUIVEL',
      camadas: [
        {
          nome: 'Instante perguntado',
          leitura: 'DESCONHECIDO',
          texto:
            `A pergunta é sobre ${horario(em)}, e este produto guarda os ATOS na cadeia, ` +
            'não o ESTADO do mundo naquele instante. Rodar a política de agora sobre uma ' +
            'pergunta de então produziria resposta plausível e falsa. O que segue é o que ' +
            'de fato se sabe: a sequência de elos até aquele momento.'
        }
      ],
      estadoFisico,
      regrasAplicadas: [],
      conflitos: [],
      porOmissao: false,
      linhas: [
        `Pergunta sobre ${horario(em)} — verdicto NÃO reconstituível.`,
        ...relevantes.map((evento) => `${horario(evento.ocorridoEm)} · ${evento.tipo} · ${evento.resumo}`),
        relevantes.length === 0 ? 'Nenhum elo registrado neste endpoint até o instante.' : '',
        estadoFisico.texto
      ].filter((linha) => linha.length > 0)
    };
  }

  const vinculo = fontes.mundo.vinculos.find((v) => v.id === pergunta.relationshipId);
  const endpoint = fontes.mundo.topologia.endpoints.find((e) => e.id === pergunta.endpointId);
  if (!vinculo || !endpoint) {
    return {
      pergunta,
      natureza: 'RECOMPUTADA',
      veredito: 'SEM_SUJEITO',
      camadas: [
        {
          nome: 'Sujeito',
          leitura: 'DESCONHECIDO',
          texto: !vinculo
            ? `Não há vínculo ${pergunta.relationshipId} neste mundo.`
            : `Não há endpoint ${pergunta.endpointId} nesta topologia.`
        }
      ],
      estadoFisico,
      regrasAplicadas: [],
      conflitos: [],
      porOmissao: false,
      linhas: ['A pergunta não encontra sujeito ou recurso: não há o que explicar.']
    };
  }

  const decisao = fontes.politica.decidir({
    id: `EXPLICA-${pergunta.relationshipId}-${pergunta.endpointId}`,
    modo: 'ENTITLEMENT',
    personId: vinculo.personId,
    relationshipId: vinculo.id,
    endpointId: endpoint.id,
    momento: agora,
    origem: 'MANUAL_OPERATOR',
    contexto: montarContexto(fontes.mundo, vinculo, endpoint, agora)
  });

  const camadas = camadasDoContexto(vinculo, endpoint, fontes.mundo, decisao, agora, fontes);
  const aprovacao = camadas.find((c) => c.nome === 'Aprovação humana');
  const veredito: VereditoDaExplicacao =
    decisao.efeito === 'DENY'
      ? 'NEGA'
      : decisao.efeito === 'ALLOW'
        ? 'PERMITE'
        : aprovacao?.leitura === 'SUSTENTA'
          ? 'PERMITE'
          : 'EXIGE_REVISAO';

  return {
    pergunta,
    natureza: 'RECOMPUTADA',
    veredito,
    camadas,
    estadoFisico,
    regrasAplicadas: decisao.regrasAplicadas,
    conflitos: decisao.conflitos.map((c) => `${c.regraA} × ${c.regraB}: ${c.descricao}`),
    porOmissao: decisao.porOmissao,
    linhas: [
      `${vinculo.personId} em ${endpoint.nome} (${endpoint.zonaId}, ${endpoint.criticidade}) ` +
        `às ${horario(agora)}: ${veredito}.`,
      ...camadas.map((camada) => `${camada.nome} — ${camada.leitura}: ${camada.texto}`),
      `Estado físico — ${estadoFisico.confirmado ? 'confirmado' : 'sem confirmação'}: ${estadoFisico.texto}`
    ]
  };
}
