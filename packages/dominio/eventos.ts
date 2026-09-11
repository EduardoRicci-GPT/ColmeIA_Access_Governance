// ---------------------------------------------------------------------------
// EVENTOS DE DOMÍNIO — o material da auditoria e da observabilidade
//
// Item 26. Um evento aqui não é log: é o registro imutável de que algo mudou
// de estado, com a ORIGEM da mudança declarada. A origem importa porque num
// hospital a mesma porta pode ter sido aberta por decisão do equipamento
// (modo standalone), por decisão da ColmeIA (modo online), pela nuvem do
// fabricante ou por um operador humano. Sem `decisionOrigin`, a auditoria
// consegue dizer QUE abriu, mas não QUEM decidiu — e é exatamente a segunda
// pergunta que uma investigação faz.
// ---------------------------------------------------------------------------

import { CredentialMethod, Criticidade, ProviderId, StatusDeConectividade } from './topologia';
import { DeviceAccessState } from './estado';
import { MotivoDeRevogacao } from './entitlement';

/** Item 15: quem decidiu. */
export type DecisionOrigin =
  | 'DEVICE_LOCAL'
  | 'COLMEIA_POLICY_ENGINE'
  | 'PROVIDER_CLOUD'
  | 'MANUAL_OPERATOR';

/** Item 38: por onde o evento entrou. */
export type OrigemDeIngestao =
  | 'WEBHOOK'
  | 'POLLING'
  | 'LOCAL_EVENT'
  | 'IMPORT'
  | 'SIMULATED_EVENT';

export type TipoDeEvento =
  | 'EntitlementGranted'
  | 'EntitlementRevoked'
  | 'PhysicalGrantRequested'
  | 'PhysicalGrantConfirmed'
  | 'PhysicalRevocationRequested'
  | 'PhysicalRevocationConfirmed'
  | 'PhysicalSyncPending'
  | 'EndpointOffline'
  | 'EndpointRecovered'
  | 'GatewayOffline'
  | 'GatewayRecovered'
  | 'LatencyThresholdExceeded'
  | 'AccessPolicyConflictDetected'
  | 'HealthScoreChanged'
  | 'CoverageGapDetected'
  | 'AccessAttempted'
  | 'EscalationOpened'
  | 'EscalationResolved';

export interface EventoDeDominio {
  id: string;
  tipo: TipoDeEvento;
  ocorridoEm: Date;
  /** Momento em que a ColmeIA soube. Difere de `ocorridoEm` em eventos atrasados. */
  registradoEm: Date;
  origemDeIngestao: OrigemDeIngestao;
  decisionOrigin?: DecisionOrigin;
  correlationId?: string;
  idempotencyKey?: string;
  organizationId: string;
  facilityId?: string;
  endpointId?: string;
  gatewayId?: string;
  providerId?: ProviderId;
  personId?: string;
  entitlementId?: string;
  credentialId?: string;
  /** Payload tipado por evento, mantido aberto para não travar a evolução. */
  dados?: Record<string, unknown>;
  /** Frase determinística para a auditoria. Não é gerada por modelo de linguagem. */
  resumo: string;
}

export interface AccessEvent extends EventoDeDominio {
  tipo: 'AccessAttempted';
  metodo: CredentialMethod;
  resultado: 'ALLOWED' | 'DENIED';
  motivo?: string;
}

export interface RegistroDeRevogacao {
  entitlementId: string;
  motivo: MotivoDeRevogacao;
  solicitadoEm: Date;
  confirmadoEm?: Date;
  estadoFisicoNaConfirmacao?: DeviceAccessState;
}

export interface EventoDeConectividade extends EventoDeDominio {
  statusAnterior: StatusDeConectividade;
  statusAtual: StatusDeConectividade;
}

export interface EventoDeHealthScore extends EventoDeDominio {
  tipo: 'HealthScoreChanged';
  escopoId: string;
  scoreAnterior: number;
  scoreAtual: number;
  criticidadeDoEscopo?: Criticidade;
}

/**
 * Armazém de eventos em memória com garantia de idempotência.
 *
 * Duplicata NÃO é erro: um webhook reentregue e um polling que alcança o mesmo
 * evento são o funcionamento normal do sistema (item 38). O armazém absorve a
 * repetição em silêncio e reporta quantas absorveu — porque o número de
 * duplicatas é sinal de saúde do canal de ingestão, não ruído.
 */
export class ArmazemDeEventos {
  private readonly eventos: EventoDeDominio[] = [];
  private readonly chaves = new Set<string>();
  private duplicatas = 0;

  registrar(evento: EventoDeDominio): boolean {
    const chave = evento.idempotencyKey ?? evento.id;
    if (this.chaves.has(chave)) {
      this.duplicatas += 1;
      return false;
    }
    this.chaves.add(chave);
    this.eventos.push(evento);
    return true;
  }

  registrarTodos(eventos: readonly EventoDeDominio[]): number {
    let aceitos = 0;
    for (const evento of eventos) if (this.registrar(evento)) aceitos += 1;
    return aceitos;
  }

  todos(): readonly EventoDeDominio[] {
    return [...this.eventos].sort((a, b) => a.ocorridoEm.getTime() - b.ocorridoEm.getTime());
  }

  porEndpoint(endpointId: string): readonly EventoDeDominio[] {
    return this.todos().filter((evento) => evento.endpointId === endpointId);
  }

  porPessoa(personId: string): readonly EventoDeDominio[] {
    return this.todos().filter((evento) => evento.personId === personId);
  }

  porCorrelacao(correlationId: string): readonly EventoDeDominio[] {
    return this.todos().filter((evento) => evento.correlationId === correlationId);
  }

  duplicatasAbsorvidas(): number {
    return this.duplicatas;
  }

  tamanho(): number {
    return this.eventos.length;
  }
}
