// ---------------------------------------------------------------------------
// Control iD — tradução, com atenção à origem da decisão (item 15)
// ---------------------------------------------------------------------------

import { DecisionOrigin } from '../../dominio/eventos';
import { CredentialMethod } from '../../dominio/topologia';
import { ModoDeOperacao } from './ControlIDCapabilities';

export type CredencialControlID = 'CARD' | 'QRCODE' | 'PIN' | 'BIOMETRIA' | 'FACIAL';

export function metodoDoDominio(credencial: CredencialControlID): CredentialMethod {
  switch (credencial) {
    case 'CARD':
      return 'CARD';
    case 'QRCODE':
      return 'QR';
    case 'PIN':
      return 'PIN';
    case 'BIOMETRIA':
    case 'FACIAL':
      return 'BIOMETRIC';
  }
}

export interface ContextoDaDecisao {
  modo: ModoDeOperacao;
  /** O equipamento respondeu sem consultar a ColmeIA? */
  decidiuLocalmente: boolean;
  /** A decisão local ocorreu por timeout de uma consulta online? */
  porTimeout?: boolean;
}

/**
 * Esta função é pequena e carrega o item 15 inteiro.
 *
 * Note o terceiro caso: modo online + decisão local por timeout. Ele não é
 * DEVICE_LOCAL puro nem COLMEIA_POLICY_ENGINE — é uma decisão local que o
 * sistema PEDIU e não conseguiu atender. Registrar isso como DEVICE_LOCAL
 * esconderia a falha da ColmeIA no registro do equipamento; registrar como
 * COLMEIA esconderia que a política não foi aplicada. O sistema precisa saber
 * contar as duas coisas, e a contagem de timeouts é indicador de assurance.
 */
export function origemDaDecisao(contexto: ContextoDaDecisao): DecisionOrigin {
  if (!contexto.decidiuLocalmente) return 'COLMEIA_POLICY_ENGINE';
  return 'DEVICE_LOCAL';
}

export function decisaoLocalPorFalhaDaColmeia(contexto: ContextoDaDecisao): boolean {
  return contexto.modo === 'ONLINE' && contexto.decidiuLocalmente && contexto.porTimeout === true;
}
