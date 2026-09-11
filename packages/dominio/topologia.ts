// ---------------------------------------------------------------------------
// TOPOLOGIA FÍSICA — onde o direito se materializa
//
// A hierarquia existe porque o risco não é uniforme. Uma porta administrativa
// offline é um chamado de manutenção; a mesma falha na farmácia de
// quimioterápicos é um evento de conformidade. O sistema não consegue
// classificar risco sem saber ONDE o endpoint está e O QUE ele guarda.
//
// Organization → Network → Facility → Building → Zone → Endpoint
//
// Cada nível é opcional exceto Organization e Endpoint: uma clínica única não
// tem rede, um prédio único não precisa ser declarado. O que não pode faltar é
// a cadeia de pais, porque é ela que faz o Health Score subir na hierarquia.
// ---------------------------------------------------------------------------

import { DeviceAccessState } from './estado';

export type NivelDeHierarquia =
  | 'ORGANIZATION'
  | 'NETWORK'
  | 'FACILITY'
  | 'BUILDING'
  | 'ZONE'
  | 'ENDPOINT';

/**
 * Criticidade hospitalar do ponto de acesso (item 29 da especificação).
 * É configurável por instalação: o que é HIGH num hospital geral pode ser
 * CRITICAL num hospital oncológico. O default declarado abaixo é ponto de
 * partida, não doutrina.
 */
export type Criticidade = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const CRITICIDADE_SUGERIDA: Readonly<Record<string, Criticidade>> = Object.freeze({
  SALA_ADMINISTRATIVA: 'LOW',
  ALMOXARIFADO_GERAL: 'MEDIUM',
  FARMACIA: 'HIGH',
  DATACENTER: 'HIGH',
  CENTRO_CIRURGICO_RESTRITO: 'HIGH',
  AREA_DE_SEGURANCA_EXCEPCIONAL: 'CRITICAL'
});

export const ORDEM_DE_CRITICIDADE: Readonly<Record<Criticidade, number>> = Object.freeze({
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3
});

export interface NoDeHierarquia {
  id: string;
  nivel: NivelDeHierarquia;
  nome: string;
  /** `null` apenas na raiz (ORGANIZATION). */
  paiId: string | null;
}

export type ProviderId =
  | 'MOCK'
  | 'TTLOCK'
  | 'CONTROL_ID'
  | 'SEAM'
  | 'SALTO'
  | 'BRIVO'
  | 'OTHER';

export type StatusDeConectividade = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'UNKNOWN';

/**
 * Conexão com o provedor — a nuvem do fabricante, não o equipamento.
 * Existe separada do Gateway porque as três camadas falham independentemente:
 * a nuvem pode cair com o gateway de pé, e vice-versa.
 */
export interface ProviderConnection {
  id: string;
  providerId: ProviderId;
  organizationId: string;
  status: StatusDeConectividade;
  lastSeenAt?: Date;
  /** Credenciais NÃO vivem aqui. Aqui vive apenas a referência ao cofre. */
  referenciaDeCredencial?: string;
}

/** Item 10: o gateway é entidade de primeira classe, não detalhe do endpoint. */
export interface Gateway {
  id: string;
  providerId: ProviderId;
  facilityId: string;
  status: StatusDeConectividade;
  lastSeenAt?: Date;
  metadata: Record<string, unknown>;
}

export type EstadoDeFirmware = 'CURRENT' | 'OUTDATED' | 'DEGRADED' | 'UNKNOWN';

export interface DeviceHealth {
  bateriaPercentual?: number;
  bateriaCritica: boolean;
  firmware: EstadoDeFirmware;
  /** Diferença entre o relógio do equipamento e o relógio do sistema, em ms. */
  desvioDeRelogioMs?: number;
  sinalPercentual?: number;
}

export interface DeviceStatus {
  endpointId: string;
  connectivity: StatusDeConectividade;
  gatewayId?: string;
  lastSeenAt?: Date;
  lastSyncAt?: Date;
  health: DeviceHealth;
  /** Quantas credenciais o equipamento declara ter pendentes de sincronização. */
  backlogDeSincronizacao: number;
}

export interface GatewayStatus {
  gatewayId: string;
  status: StatusDeConectividade;
  lastSeenAt?: Date;
  endpointsAtendidos: number;
}

export type CapacidadeDeEndpoint =
  | 'REMOTE_UNLOCK'
  | 'REMOTE_REVOCATION'
  | 'OFFLINE_CREDENTIALS'
  | 'SCHEDULE_ENFORCEMENT'
  | 'EVENT_STREAM'
  | 'ANTI_PASSBACK'
  | 'ONLINE_DECISION';

export interface EndpointCapabilities {
  endpointId: string;
  capacidades: readonly CapacidadeDeEndpoint[];
  metodosSuportados: readonly CredentialMethod[];
  maximoDeCredenciais?: number;
}

/**
 * Item 23: biometria é MÉTODO de credencial, nunca fundamento do direito.
 * O entitlement não sabe por qual método foi materializado.
 */
export type CredentialMethod =
  | 'CARD'
  | 'PIN'
  | 'QR'
  | 'NFC'
  | 'BLE'
  | 'BIOMETRIC'
  | 'MOBILE_WALLET';

/**
 * Item 9: o endpoint não é entidade estática. Identidade, capacidade,
 * conectividade, saúde, provedor, gateway, firmware e estado físico são
 * dimensões distintas — e cada uma pode estar desatualizada por um motivo
 * diferente.
 */
export interface Endpoint {
  id: string;
  nome: string;
  zonaId: string;
  facilityId: string;
  providerId: ProviderId;
  providerConnectionId: string;
  gatewayId?: string;
  criticidade: Criticidade;
  /** Referência externa no sistema do fabricante (lockId, deviceId, doorId). */
  referenciaExterna: string;
  capacidades: readonly CapacidadeDeEndpoint[];
  metodosSuportados: readonly CredentialMethod[];
  /** Último estado físico confirmado por evidência do próprio equipamento. */
  ultimoEstadoConfirmado?: DeviceAccessState;
}

export interface Topologia {
  nos: readonly NoDeHierarquia[];
  endpoints: readonly Endpoint[];
  gateways: readonly Gateway[];
  conexoes: readonly ProviderConnection[];
}

/** Cadeia do nó até a raiz, incluindo o próprio nó. Vazia se o id não existir. */
export function cadeiaAteRaiz(topologia: Topologia, noId: string): readonly NoDeHierarquia[] {
  const indice = new Map(topologia.nos.map((no) => [no.id, no]));
  const cadeia: NoDeHierarquia[] = [];
  let atual = indice.get(noId);
  const visitados = new Set<string>();
  while (atual && !visitados.has(atual.id)) {
    visitados.add(atual.id);
    cadeia.push(atual);
    atual = atual.paiId ? indice.get(atual.paiId) : undefined;
  }
  return cadeia;
}

/** Todos os endpoints sob um nó da hierarquia, em qualquer profundidade. */
export function endpointsSob(topologia: Topologia, noId: string): readonly Endpoint[] {
  const filhosPorPai = new Map<string, string[]>();
  for (const no of topologia.nos) {
    if (!no.paiId) continue;
    const lista = filhosPorPai.get(no.paiId) ?? [];
    lista.push(no.id);
    filhosPorPai.set(no.paiId, lista);
  }
  const alcancados = new Set<string>([noId]);
  const fila = [noId];
  while (fila.length > 0) {
    const atual = fila.shift();
    if (atual === undefined) break;
    for (const filho of filhosPorPai.get(atual) ?? []) {
      if (alcancados.has(filho)) continue;
      alcancados.add(filho);
      fila.push(filho);
    }
  }
  // O endpoint pertence a uma zona; a zona é que pende da hierarquia. Testar
  // `facilityId` aqui também traria endpoints de zonas irmãs quando o escopo é
  // um prédio — e um escopo que vaza endpoints produz score que não fecha.
  return topologia.endpoints.filter(
    (endpoint) => endpoint.id === noId || alcancados.has(endpoint.zonaId)
  );
}
