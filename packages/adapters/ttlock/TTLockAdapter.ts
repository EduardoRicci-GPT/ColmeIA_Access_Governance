// ---------------------------------------------------------------------------
// TTLockAdapter — INTERFACE_READY / REQUIRES_VENDOR_INTEGRATION
//
// O adaptador está inteiro do lado de cá da fronteira: capacidades declaradas,
// mapeamento de credencial, canal de eventos caracterizado, estados traduzidos.
// O que falta é do lado de lá — documentação técnica confirmada e credenciais
// de uma conta real.
//
// Toda operação que tocaria o hardware lança `IntegracaoNaoDisponivel`. Isso é
// o contrato, não uma pendência de código: um adaptador que devolvesse
// "CONFIRMED" para não quebrar o fluxo colocaria no banco de dados a afirmação
// de que uma porta obedeceu, sem que porta alguma existisse. A suíte de
// conformidade recusa esse adaptador — e é para recusá-lo que ela existe.
// ---------------------------------------------------------------------------

import { EndpointCapabilities, GatewayStatus, ProviderId, DeviceStatus } from '../../dominio/topologia';
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
import { CAPACIDADES_TTLOCK } from './TTLockCapabilities';
import { CredenciaisTTLock, TTLockClient } from './TTLockClient';
import { metodoDoDominio } from './TTLockMapper';

export const PENDENCIA_TTLOCK =
  'Requer documentação técnica confirmada do fabricante e credenciais de conta de teste. ' +
  'Confirmar antes de integrar: comportamento da revogação sem gateway, existência de webhook, ' +
  'exposição da hora do equipamento e formato de janela recorrente.';

export class TTLockAdapter implements AccessProviderAdapter {
  readonly providerId: ProviderId = 'TTLOCK';
  readonly statusDeIntegracao: StatusDeIntegracao = 'INTERFACE_READY';
  readonly pendenciaDeIntegracao = PENDENCIA_TTLOCK;

  private readonly cliente: TTLockClient;

  constructor(credenciais: CredenciaisTTLock | null = null) {
    this.cliente = new TTLockClient(credenciais, this.statusDeIntegracao);
  }

  /** Declarar capacidade não exige rede — e por isso continua respondendo. */
  async getProviderCapabilities(): Promise<ProviderCapabilities> {
    return CAPACIDADES_TTLOCK;
  }

  async getEndpointCapabilities(endpointId: string): Promise<EndpointCapabilities> {
    return {
      endpointId,
      capacidades: ['OFFLINE_CREDENTIALS', 'REMOTE_REVOCATION', 'REMOTE_UNLOCK', 'EVENT_STREAM'],
      metodosSuportados: (['EKEY', 'PASSCODE', 'CARD', 'FINGERPRINT'] as const).map(metodoDoDominio)
    };
  }

  async grantAccess(_input: GrantRequest): Promise<ProviderOperationResult> {
    return this.cliente.recusar('eKeyIssue');
  }

  async revokeAccess(_input: RevokeRequest): Promise<ProviderOperationResult> {
    return this.cliente.recusar('credentialRevoke');
  }

  async syncCredential(_input: SyncRequest): Promise<ProviderOperationResult> {
    return this.cliente.recusar('lockStatus');
  }

  async getDeviceStatus(_endpointId: string): Promise<DeviceStatus> {
    return this.cliente.recusar('lockStatus');
  }

  async getGatewayStatus(_gatewayId: string): Promise<GatewayStatus> {
    return this.cliente.recusar('gatewayStatus');
  }

  async getAccessEvents(_cursor?: string): Promise<PaginaDeEventos> {
    throw new IntegracaoNaoDisponivel(
      'TTLOCK',
      'accessRecords',
      this.statusDeIntegracao,
      'Confirmar granularidade e cursor estável dos registros de acesso.'
    );
  }
}
