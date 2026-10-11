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
import { EstadoDoVinculo } from '../dominio/vinculo-semantico';

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

/**
 * O TETO de confiança que o estado do vínculo semântico impõe (D-052).
 *
 * A função mora aqui, e não em `dominio/vinculo-semantico.ts`, por direção de
 * dependência: `dominio/` não conhece `ConfiancaFisica`, que é tipo deste
 * motor. Inverter a seta faria o domínio depender de um motor, que é o
 * acoplamento que a camada existe para evitar.
 *
 * A leitura em uma frase: o fabricante confirma o CANAL; só o levantamento em
 * campo confirma a PORTA. Por isso um vínculo apenas declarado não permite
 * `CONFIRMED` — e um vínculo divergente ou inexistente não permite nem
 * `PROBABLE`. Não é desconfiança do equipamento: é que a evidência dele é sobre
 * outro objeto que não aquele cujo nome está na tela.
 */
export const TETO_DE_CONFIANCA_POR_VINCULO: Readonly<Record<EstadoDoVinculo, ConfiancaFisica>> =
  Object.freeze({
    VERIFICADO: 'CONFIRMED',
    DECLARADO: 'PROBABLE',
    DIVERGENTE: 'UNKNOWN',
    NAO_VERIFICADO: 'UNKNOWN'
  });

const ORDEM_DE_CONFIANCA: Readonly<Record<ConfiancaFisica, number>> = Object.freeze({
  UNKNOWN: 0,
  PROBABLE: 1,
  CONFIRMED: 2
});

/**
 * Aplica o teto. Vínculo ausente da entrada NÃO limita nada — e a escolha é
 * deliberada, ainda que contrarie o pessimismo do resto do produto: limitar por
 * ausência rebaixaria de uma vez toda leitura de toda instalação que ainda não
 * cadastrou vínculos, e um painel que fica amarelo inteiro deixa de ser lido.
 * Quem cobra o levantamento é o Health Score, com componente próprio e nome
 * próprio, e não o rebaixamento silencioso de mil linhas.
 */
export function limitarConfianca(
  confianca: ConfiancaFisica,
  estadoDoVinculo?: EstadoDoVinculo
): ConfiancaFisica {
  if (estadoDoVinculo === undefined) return confianca;
  const teto = TETO_DE_CONFIANCA_POR_VINCULO[estadoDoVinculo];
  return ORDEM_DE_CONFIANCA[confianca] <= ORDEM_DE_CONFIANCA[teto] ? confianca : teto;
}

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
  /**
   * O estado do vínculo semântico deste endpoint, JÁ REAVALIADO contra a
   * versão corrente da configuração (D-052).
   *
   * Ausente significa que a instalação não cadastrou vínculos — e não limita a
   * confiança, pela razão escrita em `limitarConfianca`.
   */
  vinculoSemantico?: EstadoDoVinculo;
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
