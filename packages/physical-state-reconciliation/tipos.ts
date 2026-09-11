// ---------------------------------------------------------------------------
// PHYSICAL STATE RECONCILIATION — tipos
//
// O terceiro motor existe porque os dois primeiros, juntos, ainda não bastam.
// O Policy Engine sabe o que a norma quer. O Entitlement Reconciliation sabe
// quais direitos deveriam existir. Nenhum dos dois sabe se a porta abre.
//
// A pergunta deste motor é estreita e desconfortável: entre o que mandamos e o
// que há EVIDÊNCIA de ter acontecido no equipamento, qual é a distância, qual é
// a confiança nessa leitura, e qual o risco de ela estar errada?
// ---------------------------------------------------------------------------

import { AccessState, DeviceAccessState } from '../dominio/estado';
import { Criticidade, DeviceHealth, StatusDeConectividade } from '../dominio/topologia';
import { EstadoDeTentativas } from '../dominio/escalonamento';
import { NaturezaDeDivergencia, NivelDeRisco } from '../dominio/risco';

export type AcaoFisica = 'NONE' | 'SYNC' | 'RETRY' | 'REVOKE' | 'VERIFY' | 'ESCALATE';

/**
 * Confiança na leitura, não na intenção.
 *
 * CONFIRMED — o equipamento nos disse, e disse recentemente.
 * PROBABLE  — o equipamento nos disse, mas faz tempo; ou está degradado.
 * UNKNOWN   — não temos evidência. Este é o valor que a interface é obrigada a
 *             mostrar como incerteza, e não maquiar de verde (item 4).
 */
export type ConfiancaFisica = 'CONFIRMED' | 'PROBABLE' | 'UNKNOWN';

export interface PhysicalReconciliationResult {
  endpointId: string;
  credentialId?: string;
  entitlementId?: string;
  personId?: string;
  desiredState: string;
  observedState: string | null;
  /** Estado semântico resultante — o que a tela e a auditoria devem exibir. */
  estadoSemantico: DeviceAccessState;
  confidence: ConfiancaFisica;
  action: AcaoFisica;
  riskLevel: NivelDeRisco;
  natureza: NaturezaDeDivergencia;
  reason: string;
  /** Termos que compuseram o risco, para abrir o número na interface. */
  fatoresDeRisco: readonly string[];
  minutosEmAberto: number | null;
  minutosDesdeConfirmacao: number | null;
  /** Verdadeiro quando o automatismo se esgotou e o caso é de pessoa. */
  exigeEscalonamento: boolean;
}

export interface EntradaDeReconciliacaoFisica {
  endpointId: string;
  credentialId?: string;
  entitlementId?: string;
  personId?: string;
  criticidade: Criticidade;
  estado: AccessState;
  conectividadeDoEndpoint: StatusDeConectividade;
  /** Ausente quando o endpoint não depende de gateway (BLE direto, standalone). */
  statusDoGateway?: StatusDeConectividade;
  statusDoProvedor: StatusDeConectividade;
  saudeDoEquipamento?: DeviceHealth;
  tentativas: EstadoDeTentativas;
  /** Quando a divergência foi detectada pela primeira vez. */
  divergenciaDetectadaEm?: Date;
}

export interface LimiaresFisicos {
  /** Confirmação mais antiga que isto vira PROBABLE, e pede VERIFY. */
  minutosParaObsolescencia: number;
  /** Divergência aberta há mais que isto escala, mesmo sem esgotar tentativas. */
  minutosParaEscalonarRevogacao: number;
  minutosParaEscalonarConcessao: number;
  /** Desvio de relógio acima disto invalida a leitura de janelas temporais. */
  desvioDeRelogioToleradoMs: number;
}

export const LIMIARES_FISICOS_PADRAO: Readonly<LimiaresFisicos> = Object.freeze({
  minutosParaObsolescencia: 24 * 60,
  minutosParaEscalonarRevogacao: 60,
  minutosParaEscalonarConcessao: 12 * 60,
  desvioDeRelogioToleradoMs: 60_000
});

export interface ResumoDaReconciliacaoFisica {
  momento: Date;
  resultados: readonly PhysicalReconciliationResult[];
  revogacoesPendentes: number;
  concessoesPendentes: number;
  estadosDesconhecidos: number;
  escalonamentos: number;
  piorRisco: NivelDeRisco;
}
