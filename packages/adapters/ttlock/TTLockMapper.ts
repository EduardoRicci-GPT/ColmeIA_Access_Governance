// ---------------------------------------------------------------------------
// TTLockMapper — a tradução que preserva a fronteira
//
// O mapeador existe para que o vocabulário do fabricante pare aqui. "eKey",
// "passcode", "lockId" e "gateway" são conceitos do produto TTLock; do lado de
// dentro só existem Credential, Endpoint e Gateway.
//
// Item 43 em forma executável: quando o próximo fabricante chegar, é este
// arquivo que se duplica — nunca o domínio.
// ---------------------------------------------------------------------------

import { CredentialMethod } from '../../dominio/topologia';
import { DeviceAccessState } from '../../dominio/estado';

/** Tipos de credencial do produto TTLock, traduzidos para métodos do domínio. */
export type CredencialTTLock = 'EKEY' | 'PASSCODE' | 'CARD' | 'FINGERPRINT';

export function metodoDoDominio(credencial: CredencialTTLock): CredentialMethod {
  switch (credencial) {
    case 'EKEY':
      return 'BLE';
    case 'PASSCODE':
      return 'PIN';
    case 'CARD':
      return 'CARD';
    case 'FINGERPRINT':
      return 'BIOMETRIC';
  }
}

/**
 * Tradução do estado reportado pelo fabricante.
 *
 * O caso `undefined` devolve DEVICE_SYNC_UNKNOWN em vez de assumir revogação.
 * Assumir o estado mais conveniente diante da ausência de dado é exatamente o
 * atalho que produz um painel verde sobre uma porta aberta.
 */
export function estadoDoDominio(presenteNaFechadura: boolean | undefined): DeviceAccessState {
  if (presenteNaFechadura === undefined) return 'DEVICE_SYNC_UNKNOWN';
  return presenteNaFechadura ? 'DEVICE_GRANT_CONFIRMED' : 'DEVICE_REVOCATION_CONFIRMED';
}

/**
 * Janela recorrente do domínio para a representação que a fechadura aceita.
 * Enquanto o formato do fabricante não estiver confirmado, a função devolve a
 * estrutura neutra e sinaliza a pendência — não um formato inventado.
 */
export interface JanelaTraduzida {
  suportada: boolean;
  pendencia?: string;
  minutoInicial: number;
  minutoFinal: number;
  diasDaSemana: readonly number[];
}

export function traduzirJanela(janela: {
  diasDaSemana: readonly number[];
  minutoInicial: number;
  minutoFinal: number;
  atravessaMeiaNoite: boolean;
}): JanelaTraduzida {
  return {
    suportada: false,
    pendencia: janela.atravessaMeiaNoite
      ? 'Turno que atravessa a meia-noite: confirmar se o fabricante aceita janela contínua ou exige duas faixas.'
      : 'Confirmar formato de janela recorrente aceito pelo fabricante.',
    minutoInicial: janela.minutoInicial,
    minutoFinal: janela.minutoFinal,
    diasDaSemana: janela.diasDaSemana
  };
}
