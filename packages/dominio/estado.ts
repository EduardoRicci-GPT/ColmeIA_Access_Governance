// ---------------------------------------------------------------------------
// ESTADO DE ACESSO — quatro camadas, nunca um booleano
//
// Este é o arquivo que carrega o critério arquitetural mais importante da
// especificação (item 41):
//
//   "Um entitlement pode estar corretamente revogado na lógica da organização
//    enquanto ainda existe risco físico porque um dispositivo não recebeu a
//    atualização."
//
// Um booleano `hasAccess` não consegue dizer isso. Ele colapsa quatro
// perguntas independentes numa só:
//
//   1. A organização QUER que esta pessoa entre?      → desiredState
//   2. O nosso registro na nuvem reflete essa vontade? → cloudState
//   3. O provedor ACEITOU a ordem?                     → providerState
//   4. O EQUIPAMENTO obedeceu?                         → deviceState
//
// As quatro podem divergir, e cada divergência tem causa e risco próprios.
// Colapsar isso num booleano é exatamente o defeito que faz um sistema de
// controle de acesso dizer "acesso revogado" enquanto a porta ainda abre.
//
// Por isso `lastConfirmedState` é campo separado de `deviceState`: o primeiro é
// EVIDÊNCIA (o equipamento nos disse), o segundo é LEITURA (o que achamos
// agora, possivelmente inferido). Quando não há evidência, o estado é
// DEVICE_SYNC_UNKNOWN — e o sistema tem a obrigação de dizer que não sabe.
// ---------------------------------------------------------------------------

import { Relogio, idadeEmMinutos } from './tempo';

/** O que a organização determinou. Produzido pelo Entitlement Reconciliation. */
export type DesiredAccessState =
  | 'ENTITLEMENT_ACTIVE'
  | 'ENTITLEMENT_EXPIRED'
  | 'ENTITLEMENT_REVOKED'
  | 'ENTITLEMENT_ABSENT';

/** O que o nosso registro autoritativo (a ColmeIA) gravou. */
export type CloudAccessState =
  | 'CLOUD_GRANT_CREATED'
  | 'CLOUD_GRANT_REVOKED'
  | 'CLOUD_GRANT_ABSENT'
  | 'CLOUD_UNKNOWN';

/** O que a nuvem do fabricante respondeu à nossa ordem. */
export type ProviderAccessState =
  | 'PROVIDER_GRANT_ACCEPTED'
  | 'PROVIDER_REVOCATION_ACCEPTED'
  | 'PROVIDER_PENDING'
  | 'PROVIDER_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_UNKNOWN';

/** O que o equipamento físico está, de fato, executando. */
export type DeviceAccessState =
  | 'DEVICE_GRANT_CONFIRMED'
  | 'DEVICE_GRANT_PENDING'
  | 'DEVICE_REVOCATION_CONFIRMED'
  | 'DEVICE_REVOCATION_PENDING'
  | 'DEVICE_SYNC_UNKNOWN'
  | 'DEVICE_OFFLINE'
  | 'DEVICE_DEGRADED';

export interface AccessState {
  desiredState: DesiredAccessState;
  cloudState: CloudAccessState;
  providerState: ProviderAccessState;
  deviceState: DeviceAccessState;
  /** Última leitura com EVIDÊNCIA do equipamento. `null` = nunca confirmou. */
  lastConfirmedState: DeviceAccessState | null;
  lastSyncAt: Date | null;
}

/** Estados de equipamento que carregam evidência, e não inferência. */
const ESTADOS_CONFIRMADOS: ReadonlySet<DeviceAccessState> = new Set<DeviceAccessState>([
  'DEVICE_GRANT_CONFIRMED',
  'DEVICE_REVOCATION_CONFIRMED'
]);

export function estadoTemConfirmacaoFisica(estado: DeviceAccessState): boolean {
  return ESTADOS_CONFIRMADOS.has(estado);
}

/**
 * A única forma legítima de perguntar "a pessoa consegue entrar?".
 *
 * Retorna três respostas, nunca duas. `INDETERMINADO` não é um erro do
 * chamador: é a resposta correta quando o sistema não tem evidência. Quem
 * consumir isto é obrigado a tratar o terceiro caso — e é essa obrigação que
 * impede a interface de mentir.
 */
export type LeituraDeAcessoFisico = 'PERMITE_ENTRADA' | 'NAO_PERMITE_ENTRADA' | 'INDETERMINADO';

export function lerAcessoFisico(estado: AccessState): LeituraDeAcessoFisico {
  switch (estado.lastConfirmedState) {
    case 'DEVICE_GRANT_CONFIRMED':
      // A confirmação é do passado. Se depois disso pedimos revogação e o
      // equipamento não respondeu, a evidência velha não vale como negativa —
      // mas também não vale como positiva atual.
      return estado.deviceState === 'DEVICE_REVOCATION_PENDING' ? 'INDETERMINADO' : 'PERMITE_ENTRADA';
    case 'DEVICE_REVOCATION_CONFIRMED':
      return estado.deviceState === 'DEVICE_GRANT_PENDING' ? 'INDETERMINADO' : 'NAO_PERMITE_ENTRADA';
    default:
      return 'INDETERMINADO';
  }
}

/** O estado desejado exige presença do direito no equipamento? */
export function desejaConcessao(desejado: DesiredAccessState): boolean {
  return desejado === 'ENTITLEMENT_ACTIVE';
}

/** Estado físico que o desejo lógico exige do equipamento. */
export function estadoFisicoDesejado(desejado: DesiredAccessState): DeviceAccessState {
  return desejaConcessao(desejado) ? 'DEVICE_GRANT_CONFIRMED' : 'DEVICE_REVOCATION_CONFIRMED';
}

/** Há divergência entre o que a organização quer e o que foi confirmado? */
export function haDivergenciaFisica(estado: AccessState): boolean {
  const exigido = estadoFisicoDesejado(estado.desiredState);
  return estado.lastConfirmedState !== exigido;
}

export interface IdadeDoEstado {
  minutosDesdeUltimaSincronizacao: number | null;
  nuncaSincronizou: boolean;
}

export function idadeDoEstado(estado: AccessState, relogio: Relogio): IdadeDoEstado {
  const minutos = idadeEmMinutos(estado.lastSyncAt, relogio.agora());
  return { minutosDesdeUltimaSincronizacao: minutos, nuncaSincronizou: minutos === null };
}

export const ESTADO_INICIAL_DESCONHECIDO: Readonly<AccessState> = Object.freeze({
  desiredState: 'ENTITLEMENT_ABSENT',
  cloudState: 'CLOUD_GRANT_ABSENT',
  providerState: 'PROVIDER_UNKNOWN',
  deviceState: 'DEVICE_SYNC_UNKNOWN',
  lastConfirmedState: null,
  lastSyncAt: null
});

/**
 * Rótulos em português para a interface. Ficam aqui, junto do tipo, porque um
 * estado novo sem rótulo deve quebrar a compilação — e não aparecer na tela
 * como string técnica diante de um coordenador de enfermagem às 3h da manhã.
 */
export const ROTULO_DE_ESTADO_FISICO: Readonly<Record<DeviceAccessState, string>> = Object.freeze({
  DEVICE_GRANT_CONFIRMED: 'Concessão confirmada no equipamento',
  DEVICE_GRANT_PENDING: 'Concessão solicitada, aguardando o equipamento',
  DEVICE_REVOCATION_CONFIRMED: 'Revogação confirmada no equipamento',
  DEVICE_REVOCATION_PENDING: 'Revogação solicitada, aguardando o equipamento',
  DEVICE_SYNC_UNKNOWN: 'Sincronização desconhecida',
  DEVICE_OFFLINE: 'Equipamento offline',
  DEVICE_DEGRADED: 'Equipamento degradado'
});

export const ROTULO_DE_ESTADO_DESEJADO: Readonly<Record<DesiredAccessState, string>> = Object.freeze({
  ENTITLEMENT_ACTIVE: 'Direito ativo',
  ENTITLEMENT_EXPIRED: 'Direito expirado',
  ENTITLEMENT_REVOKED: 'Direito revogado',
  ENTITLEMENT_ABSENT: 'Sem direito'
});
