// ---------------------------------------------------------------------------
// ADAPTER CONTRACT v2 — tipos (itens 11, 12, 13)
//
// A fronteira mais importante do produto passa por aqui. Item 43: integrar um
// fabricante novo deve exigir um Adapter e um Capability Mapping, e nada mais.
// Se um fornecedor obrigar a mexer em `Person`, `Entitlement` ou `Policy`, o
// acoplamento vazou — e o custo do próximo fornecedor será o mesmo deste.
//
// Por isso o adaptador declara CAPACIDADE antes de executar AÇÃO. Um sistema
// que só descobre que a fechadura não faz revogação remota no momento em que
// tenta revogar já perdeu: ele prometeu à interface algo que o hardware não
// entrega. Declarar capacidade primeiro permite que o motor decida ANTES —
// e que a tela diga "este modelo exige visita técnica" em vez de "revogado".
// ---------------------------------------------------------------------------

import { CredentialMethod, DeviceStatus, GatewayStatus, ProviderId } from '../../dominio/topologia';
import { DeviceAccessState } from '../../dominio/estado';

/** Item 45: o estado de maturidade vive no código, não só no relatório. */
export type StatusDeIntegracao =
  | 'IMPLEMENTED'
  | 'SIMULATED'
  | 'INTERFACE_READY'
  | 'REQUIRES_VENDOR_INTEGRATION'
  | 'RESEARCH_REQUIRED';

export interface ProviderCapabilities {
  cloudApi: boolean;
  mobileSdk: boolean;
  localBle: boolean;
  gatewaySupport: boolean;
  webhookEvents: boolean;
  pollingEvents: boolean;
  offlineCredentials: boolean;
  remoteRevocation: boolean;
  remoteUnlock: boolean;
  bulkSync: boolean;
  userManagement: boolean;
  credentialManagement: boolean;
  /** O provedor sabe dizer, sob demanda, o que o equipamento realmente tem? */
  physicalStateReconciliation: boolean;
  /** O equipamento consulta a ColmeIA no instante do acesso (modo online)? */
  onlineDecision: boolean;
}

export type StatusDeOperacao = 'ACCEPTED' | 'CONFIRMED' | 'PENDING' | 'FAILED' | 'UNKNOWN';

/**
 * `physicalConfirmation` é o campo que impede a mentira estrutural do item 4.
 *
 * NOT_SUPPORTED não é sinônimo de NOT_CONFIRMED. O primeiro diz "este
 * fabricante nunca confirmará, e o sistema precisa conviver com isso"; o
 * segundo diz "ainda não confirmou, e deve confirmar". A interface trata os
 * dois de formas opostas: o primeiro vira ressalva permanente de projeto, o
 * segundo vira pendência com prazo.
 */
export type ConfirmacaoFisica = 'CONFIRMED' | 'NOT_CONFIRMED' | 'NOT_SUPPORTED';

export interface ProviderOperationResult {
  operationId: string;
  provider: ProviderId;
  status: StatusDeOperacao;
  physicalConfirmation: ConfirmacaoFisica;
  providerReference?: string;
  message?: string;
  requestedAt: Date;
  completedAt?: Date;
  /** Estado físico que o provedor afirma, quando afirma algo. */
  estadoFisicoReportado?: DeviceAccessState;
}

export interface RequisicaoBase {
  /** Item 37: sem chave de idempotência o adaptador recusa a operação. */
  idempotencyKey: string;
  correlationId: string;
  endpointId: string;
  /** Referência do endpoint no sistema do fabricante. */
  referenciaExterna: string;
  solicitadoEm: Date;
}

export interface GrantRequest extends RequisicaoBase {
  personId: string;
  credentialId: string;
  metodo: CredentialMethod;
  inicio: Date;
  fim?: Date;
  /** Janela recorrente já resolvida em minutos, para provedores que a suportam. */
  janelaRecorrente?: {
    diasDaSemana: readonly number[];
    minutoInicial: number;
    minutoFinal: number;
    atravessaMeiaNoite: boolean;
  };
}

export interface RevokeRequest extends RequisicaoBase {
  personId: string;
  credentialId: string;
  /** Referência da credencial no fabricante, quando conhecida. */
  referenciaDaCredencial?: string;
  motivo: string;
}

export interface SyncRequest extends RequisicaoBase {
  credentialIds: readonly string[];
  /** Sincronização completa recarrega tudo; incremental só o delta. */
  modo: 'FULL' | 'INCREMENTAL';
}

export interface CredencialObservada {
  credentialId?: string;
  referenciaExterna: string;
  metodo: CredentialMethod;
  presente: boolean;
  expiraEm?: Date;
}

/** O que o equipamento AFIRMA ter, contra o que a ColmeIA acha que ele tem. */
export interface PhysicalStateSnapshot {
  endpointId: string;
  capturadoEm: Date;
  /** `null` quando o provedor não sabe informar (e diz que não sabe). */
  credenciais: readonly CredencialObservada[] | null;
  estado: DeviceAccessState;
  confiavel: boolean;
  observacao?: string;
}

export interface AccessEventDoProvedor {
  eventoExternoId: string;
  endpointId: string;
  ocorridoEm: Date;
  tipo: 'ACCESS_GRANTED' | 'ACCESS_DENIED' | 'SYNC_CONFIRMED' | 'REVOCATION_CONFIRMED' | 'DEVICE_STATUS';
  personReferencia?: string;
  credencialReferencia?: string;
  metodo?: CredentialMethod;
  /** Item 15: quem decidiu — o equipamento sozinho ou a ColmeIA. */
  decidiuLocalmente: boolean;
  dados?: Record<string, unknown>;
}

export interface PaginaDeEventos {
  eventos: readonly AccessEventDoProvedor[];
  proximoCursor?: string;
}

export type { DeviceStatus, GatewayStatus };

/**
 * Erro que um adaptador ainda não integrado DEVE lançar.
 *
 * Não é placeholder: é contrato. Um adaptador INTERFACE_READY que devolvesse
 * `{ status: 'CONFIRMED' }` para agradar o chamador introduziria no sistema
 * exatamente a alucinação operacional que o item 33 proíbe — e o faria na
 * camada mais difícil de auditar.
 */
export class IntegracaoNaoDisponivel extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly operacao: string,
    readonly statusDeIntegracao: StatusDeIntegracao,
    readonly pendencia: string
  ) {
    super(
      `[${provider}] ${operacao} indisponível: integração em estado ${statusDeIntegracao}. ${pendencia}`
    );
    this.name = 'IntegracaoNaoDisponivel';
  }
}
