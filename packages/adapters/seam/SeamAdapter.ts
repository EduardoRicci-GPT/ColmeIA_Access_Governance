// ---------------------------------------------------------------------------
// SeamAdapter — RESEARCH_REQUIRED / INTERFACE_READY
//
// O terceiro adaptador não é mais um fabricante: é uma CAMADA AGREGADORA. Ele
// existe para testar uma hipótese comercial, não técnica — a de que a ColmeIA
// pode governar o direito e delegar a materialização para um intermediário que
// já fala com dezenas de marcas.
//
// A fronteira do item 18, em forma de código:
//
//     COLMEIA decide o direito · SEAM materializa · DEVICE executa
//
// O que NUNCA atravessa essa fronteira: política, hierarquia, contexto
// hospitalar, risco, segregação de funções, aprovação humana, fluxo de
// trabalho clínico. Se um dia for necessário mandar qualquer um desses para o
// agregador para que algo funcione, a hipótese está refutada — e é melhor
// saber disso agora, por um limite declarado no adaptador, do que depois, por
// um vazamento de responsabilidade que já custou uma reescrita.
//
// Há um custo que a delegação cobra e que o desenho precisa assumir: ao
// materializar por terceiro, a confirmação física passa a ser uma afirmação DO
// AGREGADOR sobre o equipamento, e não do equipamento. O sistema ganha um elo
// a mais na corrente de incerteza — e o campo `physicalConfirmation` desta
// camada precisa ser lido com essa ressalva.
// ---------------------------------------------------------------------------

import { DeviceStatus, EndpointCapabilities, GatewayStatus, ProviderId } from '../../dominio/topologia';
import { AccessProviderAdapter } from '../contrato/adaptador';
import {
  GrantRequest,
  IntegracaoNaoDisponivel,
  PaginaDeEventos,
  ProviderCapabilities,
  ProviderOperationResult,
  RevokeRequest,
  StatusDeIntegracao,
  SyncRequest
} from '../contrato/tipos';

export const CAPACIDADES_SEAM: Readonly<ProviderCapabilities> = Object.freeze({
  cloudApi: true,
  mobileSdk: true,
  localBle: false,
  gatewaySupport: true,
  webhookEvents: true,
  pollingEvents: true,
  offlineCredentials: true,
  remoteRevocation: true,
  remoteUnlock: true,
  bulkSync: true,
  userManagement: true,
  credentialManagement: true,
  physicalStateReconciliation: false,
  onlineDecision: false
});

/** O que a ColmeIA jamais delega. Lista executável, verificada em teste. */
export const RESPONSABILIDADES_INDELEGAVEIS: readonly string[] = Object.freeze([
  'policy',
  'hierarchy',
  'context',
  'risk',
  'segregation_of_duties',
  'human_approval',
  'hospital_workflows'
]);

export const PENDENCIA_SEAM =
  'Pesquisa pendente: cobertura real de fabricantes relevantes no Brasil, latência da camada ' +
  'agregadora, granularidade da confirmação física repassada e modelo de custo por dispositivo. ' +
  'Enquanto a confirmação física for afirmação do agregador sobre o equipamento, a confiança ' +
  'máxima desta via é PROBABLE, nunca CONFIRMED.';

export class SeamAdapter implements AccessProviderAdapter {
  readonly providerId: ProviderId = 'SEAM';
  readonly statusDeIntegracao: StatusDeIntegracao = 'RESEARCH_REQUIRED';
  readonly pendenciaDeIntegracao = PENDENCIA_SEAM;

  async getProviderCapabilities(): Promise<ProviderCapabilities> {
    return CAPACIDADES_SEAM;
  }

  async getEndpointCapabilities(endpointId: string): Promise<EndpointCapabilities> {
    return {
      endpointId,
      capacidades: ['REMOTE_UNLOCK', 'REMOTE_REVOCATION', 'OFFLINE_CREDENTIALS', 'EVENT_STREAM'],
      metodosSuportados: ['CARD', 'PIN', 'MOBILE_WALLET', 'BLE']
    };
  }

  async grantAccess(_input: GrantRequest): Promise<ProviderOperationResult> {
    return this.recusar('grantAccess');
  }

  async revokeAccess(_input: RevokeRequest): Promise<ProviderOperationResult> {
    return this.recusar('revokeAccess');
  }

  async syncCredential(_input: SyncRequest): Promise<ProviderOperationResult> {
    return this.recusar('syncCredential');
  }

  async getDeviceStatus(_endpointId: string): Promise<DeviceStatus> {
    return this.recusar('getDeviceStatus');
  }

  async getGatewayStatus(_gatewayId: string): Promise<GatewayStatus> {
    return this.recusar('getGatewayStatus');
  }

  async getAccessEvents(_cursor?: string): Promise<PaginaDeEventos> {
    return this.recusar('getAccessEvents');
  }

  private recusar(operacao: string): never {
    throw new IntegracaoNaoDisponivel('SEAM', operacao, this.statusDeIntegracao, PENDENCIA_SEAM);
  }
}
