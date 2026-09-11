// ---------------------------------------------------------------------------
// ACCESS TIMELINE — item 39
//
// A timeline é o artefato de maior valor de auditoria deste produto, e o
// motivo é que ela responde à única pergunta que uma investigação faz de
// verdade: não "qual é o estado?", mas "o que aconteceu, em que ordem, e
// quanto tempo o risco ficou aberto?".
//
//   08:00:00  direito concedido
//   08:00:02  provedor aceitou
//   08:00:04  equipamento confirmou
//   13:40:00  vínculo encerrado
//   13:40:01  direito revogado
//   13:40:02  provedor aceitou
//   13:40:03  equipamento offline — revogação pendente
//   14:12:01  equipamento voltou, sincronização iniciada
//   14:12:03  revogação confirmada
//
// Entre 13:40:03 e 14:12:03 há trinta e dois minutos em que a organização
// considerava o acesso encerrado e a porta abria. Nenhum relatório de estado
// mostra esses trinta e dois minutos. A timeline mostra — e é por isso que ela
// é construída a partir dos eventos, com `ocorridoEm` e `registradoEm`
// separados: evento que chega atrasado aparece no lugar em que ACONTECEU, não
// no lugar em que foi sabido.
// ---------------------------------------------------------------------------

import { EventoDeDominio, TipoDeEvento } from '../dominio/eventos';

export interface EntradaDaTimeline {
  hora: string;
  ocorridoEm: Date;
  tipo: TipoDeEvento;
  rotulo: string;
  detalhe: string;
  /** Minutos entre o fato e o momento em que o sistema soube. */
  atrasoDeConhecimentoMin: number;
  origem: string;
}

export interface JanelaDeRisco {
  /** Evento que abriu a janela. Uma janela de concessão pendente e uma de
   *  revogação pendente duram o mesmo tempo e valem coisas opostas. */
  tipoDeAbertura: TipoDeEvento;
  aberturaEm: Date;
  fechamentoEm: Date | null;
  minutos: number | null;
  descricao: string;
}

export interface LinhaDoTempo {
  chave: string;
  entradas: readonly EntradaDaTimeline[];
  /** Intervalos em que houve divergência física conhecida. */
  janelasDeRisco: readonly JanelaDeRisco[];
}

const ROTULO: Readonly<Record<TipoDeEvento, string>> = Object.freeze({
  EntitlementGranted: 'Direito concedido',
  EntitlementRevoked: 'Direito revogado',
  PhysicalGrantRequested: 'Concessão enviada ao provedor',
  PhysicalGrantConfirmed: 'Concessão confirmada pelo equipamento',
  PhysicalRevocationRequested: 'Revogação enviada ao provedor',
  PhysicalRevocationConfirmed: 'Revogação confirmada pelo equipamento',
  PhysicalSyncPending: 'Sincronização pendente no equipamento',
  EndpointOffline: 'Endpoint sem comunicação',
  EndpointRecovered: 'Endpoint restabelecido',
  GatewayOffline: 'Gateway sem comunicação',
  GatewayRecovered: 'Gateway restabelecido',
  LatencyThresholdExceeded: 'Latência acima do limiar',
  AccessPolicyConflictDetected: 'Conflito de política detectado',
  HealthScoreChanged: 'Health Score alterado',
  AccessAttempted: 'Tentativa de acesso',
  EscalationOpened: 'Caso de escalonamento aberto',
  EscalationResolved: 'Caso de escalonamento encerrado'
});

function horaCompleta(data: Date): string {
  const hh = String(data.getHours()).padStart(2, '0');
  const mm = String(data.getMinutes()).padStart(2, '0');
  const ss = String(data.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Eventos que ABREM uma janela de risco físico. */
const ABRE_RISCO: ReadonlySet<TipoDeEvento> = new Set<TipoDeEvento>([
  'PhysicalSyncPending',
  'PhysicalRevocationRequested'
]);

/** Eventos que FECHAM a janela. */
const FECHA_RISCO: ReadonlySet<TipoDeEvento> = new Set<TipoDeEvento>([
  'PhysicalRevocationConfirmed',
  'PhysicalGrantConfirmed'
]);

export function construirLinhaDoTempo(
  chave: string,
  eventos: readonly EventoDeDominio[]
): LinhaDoTempo {
  const ordenados = [...eventos].sort((a, b) => a.ocorridoEm.getTime() - b.ocorridoEm.getTime());

  const entradas: EntradaDaTimeline[] = ordenados.map((evento) => ({
    hora: horaCompleta(evento.ocorridoEm),
    ocorridoEm: evento.ocorridoEm,
    tipo: evento.tipo,
    rotulo: ROTULO[evento.tipo],
    detalhe: evento.resumo,
    atrasoDeConhecimentoMin:
      Math.round(((evento.registradoEm.getTime() - evento.ocorridoEm.getTime()) / 60_000) * 10) / 10,
    origem: evento.decisionOrigin ?? evento.origemDeIngestao
  }));

  const janelas: JanelaDeRisco[] = [];
  let aberta: { em: Date; descricao: string; tipo: TipoDeEvento } | null = null;
  for (const evento of ordenados) {
    if (ABRE_RISCO.has(evento.tipo) && !aberta) {
      aberta = { em: evento.ocorridoEm, descricao: evento.resumo, tipo: evento.tipo };
      continue;
    }
    if (FECHA_RISCO.has(evento.tipo) && aberta) {
      janelas.push({
        tipoDeAbertura: aberta.tipo,
        aberturaEm: aberta.em,
        fechamentoEm: evento.ocorridoEm,
        minutos: Math.round(((evento.ocorridoEm.getTime() - aberta.em.getTime()) / 60_000) * 10) / 10,
        descricao: aberta.descricao
      });
      aberta = null;
    }
  }
  if (aberta) {
    janelas.push({
      tipoDeAbertura: aberta.tipo,
      aberturaEm: aberta.em,
      fechamentoEm: null,
      minutos: null,
      descricao: `${aberta.descricao} (ainda em aberto)`
    });
  }

  return { chave, entradas, janelasDeRisco: janelas };
}
