// ---------------------------------------------------------------------------
// ControlIDAdapter — INTERFACE_READY / RESEARCH_REQUIRED
//
// Prioridade igual à do TTLock, por uma razão de mercado e não de engenharia:
// é este fabricante que valida o cenário institucional brasileiro — catraca de
// portaria, leitor de setor, biometria em área restrita. É o equipamento que
// um hospital já tem instalado quando a ColmeIA chega.
//
// O modo online (item 16) é o que este adaptador precisa provar, e ele está
// implementado no Mock: o equipamento pergunta, a ColmeIA decide, o
// equipamento executa, o evento confirma. O que falta é o protocolo real.
// ---------------------------------------------------------------------------

import { DeviceStatus, EndpointCapabilities, ProviderId } from '../../dominio/topologia';
import { AccessProviderAdapter } from '../contrato/adaptador';
import {
  GrantRequest,
  IntegracaoNaoDisponivel,
  PaginaDeEventos,
  PhysicalStateSnapshot,
  ProviderCapabilities,
  ProviderOperationResult,
  RevokeRequest,
  StatusDeIntegracao,
  SyncRequest
} from '../contrato/tipos';
import { CAPACIDADES_CONTROL_ID, PENDENCIAS_DE_PESQUISA, PERFIL_PADRAO } from './ControlIDCapabilities';
import { ControlIDClient, CredenciaisControlID } from './ControlIDClient';
import { metodoDoDominio } from './ControlIDMapper';

export const PENDENCIA_CONTROL_ID =
  'Requer confirmação do protocolo de modo online e da leitura da base local. ' +
  PENDENCIAS_DE_PESQUISA.join(' ');

export class ControlIDAdapter implements AccessProviderAdapter {
  readonly providerId: ProviderId = 'CONTROL_ID';
  readonly statusDeIntegracao: StatusDeIntegracao = 'INTERFACE_READY';
  readonly pendenciaDeIntegracao = PENDENCIA_CONTROL_ID;
  readonly perfil = PERFIL_PADRAO;

  private readonly cliente: ControlIDClient;

  constructor(credenciais: CredenciaisControlID | null = null) {
    this.cliente = new ControlIDClient(credenciais, this.statusDeIntegracao);
  }

  async getProviderCapabilities(): Promise<ProviderCapabilities> {
    return CAPACIDADES_CONTROL_ID;
  }

  async getEndpointCapabilities(endpointId: string): Promise<EndpointCapabilities> {
    return {
      endpointId,
      capacidades: [
        'OFFLINE_CREDENTIALS',
        'REMOTE_REVOCATION',
        'REMOTE_UNLOCK',
        'EVENT_STREAM',
        'SCHEDULE_ENFORCEMENT',
        'ONLINE_DECISION',
        'ANTI_PASSBACK'
      ],
      metodosSuportados: (['CARD', 'QRCODE', 'PIN', 'BIOMETRIA', 'FACIAL'] as const).map(metodoDoDominio)
    };
  }

  async grantAccess(_input: GrantRequest): Promise<ProviderOperationResult> {
    return this.cliente.recusar('credentialUpsert');
  }

  async revokeAccess(_input: RevokeRequest): Promise<ProviderOperationResult> {
    return this.cliente.recusar('credentialRevoke');
  }

  async syncCredential(_input: SyncRequest): Promise<ProviderOperationResult> {
    return this.cliente.recusar('accessRuleUpsert');
  }

  async getDeviceStatus(_endpointId: string): Promise<DeviceStatus> {
    return this.cliente.recusar('eventStream');
  }

  async getAccessEvents(_cursor?: string): Promise<PaginaDeEventos> {
    throw new IntegracaoNaoDisponivel(
      'CONTROL_ID',
      'eventStream',
      this.statusDeIntegracao,
      'Confirmar se o evento distingue decisão local por timeout de decisão local por projeto.'
    );
  }

  async reconcilePhysicalState(_endpointId: string): Promise<PhysicalStateSnapshot> {
    return this.cliente.recusar('readLocalBase');
  }
}
