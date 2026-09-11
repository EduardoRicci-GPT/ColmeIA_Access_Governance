// ---------------------------------------------------------------------------
// ESCALONAMENTO HUMANO — onde o automatismo termina
//
// Item 31 e 36. Retry infinito é a forma mais silenciosa de um sistema falhar:
// ele consome recurso, produz log, e nunca produz decisão. A política de
// tentativas existe para que o automatismo tenha FIM declarado — e o que vem
// depois do fim é uma pessoa, com nome, prazo e registro.
//
// O caso de escalonamento é, portanto, a interface entre a máquina e a
// responsabilidade institucional.
// ---------------------------------------------------------------------------

import { NivelDeRisco } from './risco';

export type StatusDeEscalonamento = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

export type TipoDeEscalonamento =
  | 'REVOCATION_NOT_CONFIRMED'
  | 'SYNC_EXHAUSTED_RETRIES'
  | 'ENDPOINT_CRITICAL_OFFLINE'
  | 'GATEWAY_OFFLINE'
  | 'PROVIDER_UNAVAILABLE'
  | 'POLICY_CONFLICT'
  | 'LATENCY_ANOMALY'
  | 'UNKNOWN_PHYSICAL_STATE'
  /**
   * Zona de cuidado que ficaria sem ninguém com acesso ativo.
   *
   * É o único tipo desta lista que denuncia FALTA de direito, e não excesso.
   * Todos os outros protegem contra a porta que abre para quem não deveria;
   * este protege contra a porta que não abre para quem precisa.
   */
  | 'COVERAGE_GAP';

export interface EscalationCase {
  id: string;
  type: TipoDeEscalonamento;
  severity: NivelDeRisco;
  subjectId?: string;
  endpointId?: string;
  entitlementId?: string;
  reason: string;
  status: StatusDeEscalonamento;
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  /** Eventos que sustentam o caso, para que a auditoria não dependa de memória. */
  evidencias: readonly string[];
}

/** Item 36: a política de tentativas, com fim declarado. */
export interface PoliticaDeRetry {
  maxAttempts: number;
  backoffInicialMs: number;
  fatorDeBackoff: number;
  backoffMaximoMs: number;
}

export const RETRY_PADRAO: Readonly<PoliticaDeRetry> = Object.freeze({
  maxAttempts: 5,
  backoffInicialMs: 30_000,
  fatorDeBackoff: 3,
  backoffMaximoMs: 900_000
});

export type StatusDeTentativa = 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'ESCALATED';

export interface EstadoDeTentativas {
  attempt: number;
  status: StatusDeTentativa;
  nextRetryAt: Date | null;
  ultimoErro?: string;
}

export function proximaTentativa(
  estado: EstadoDeTentativas,
  politica: PoliticaDeRetry,
  agora: Date,
  erro?: string
): EstadoDeTentativas {
  const tentativa = estado.attempt + 1;
  if (tentativa >= politica.maxAttempts) {
    return { attempt: tentativa, status: 'ESCALATED', nextRetryAt: null, ultimoErro: erro };
  }
  const bruto = politica.backoffInicialMs * Math.pow(politica.fatorDeBackoff, tentativa - 1);
  const espera = Math.min(bruto, politica.backoffMaximoMs);
  return {
    attempt: tentativa,
    status: 'PENDING',
    nextRetryAt: new Date(agora.getTime() + espera),
    ultimoErro: erro
  };
}

export const ESTADO_DE_TENTATIVAS_INICIAL: Readonly<EstadoDeTentativas> = Object.freeze({
  attempt: 0,
  status: 'PENDING' as StatusDeTentativa,
  nextRetryAt: null
});
