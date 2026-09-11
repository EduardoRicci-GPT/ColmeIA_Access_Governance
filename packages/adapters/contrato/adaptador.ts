// ---------------------------------------------------------------------------
// AccessProviderAdapter v2 — a interface (item 12)
// ---------------------------------------------------------------------------

import { DeviceStatus, GatewayStatus, EndpointCapabilities, ProviderId } from '../../dominio/topologia';
import {
  GrantRequest,
  PaginaDeEventos,
  PhysicalStateSnapshot,
  ProviderCapabilities,
  ProviderOperationResult,
  RevokeRequest,
  StatusDeIntegracao,
  SyncRequest
} from './tipos';

export interface AccessProviderAdapter {
  readonly providerId: ProviderId;
  /** Item 45: cada adaptador declara a própria maturidade, verificável em teste. */
  readonly statusDeIntegracao: StatusDeIntegracao;
  /** O que falta para sair do estado atual. Vazio apenas quando IMPLEMENTED. */
  readonly pendenciaDeIntegracao: string;

  getProviderCapabilities(): Promise<ProviderCapabilities>;
  getEndpointCapabilities(endpointId: string): Promise<EndpointCapabilities>;

  grantAccess(input: GrantRequest): Promise<ProviderOperationResult>;
  revokeAccess(input: RevokeRequest): Promise<ProviderOperationResult>;
  syncCredential(input: SyncRequest): Promise<ProviderOperationResult>;

  getDeviceStatus(endpointId: string): Promise<DeviceStatus>;
  getGatewayStatus?(gatewayId: string): Promise<GatewayStatus>;

  getAccessEvents(cursor?: string): Promise<PaginaDeEventos>;

  reconcilePhysicalState?(endpointId: string): Promise<PhysicalStateSnapshot>;
}
