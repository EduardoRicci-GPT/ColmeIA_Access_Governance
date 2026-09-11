// ---------------------------------------------------------------------------
// TELEMETRIA DE LATÊNCIA — a diferença entre "o sistema está lento" e um
// diagnóstico
//
// Item 6 e cenário P2. Um usuário que espera três segundos na porta relata "o
// sistema está lento". A frase é verdadeira e inútil: não diz se a demora
// nasceu na política, na API do fabricante, no gateway ou no firmware da
// fechadura. Cada uma dessas causas tem um dono diferente e um prazo de
// correção diferente.
//
// Registrar seis marcas temporais em vez de uma transforma uma reclamação em
// um chamado endereçável. É a mesma disciplina de separar estado lógico de
// estado físico, aplicada ao tempo.
// ---------------------------------------------------------------------------

export interface AccessOperationTelemetry {
  operationId: string;
  correlationId?: string;
  endpointId?: string;
  providerId?: string;

  requestReceivedAt: Date;
  policyDecisionAt?: Date;
  providerRequestAt?: Date;
  providerResponseAt?: Date;
  deviceExecutedAt?: Date;
  eventConfirmedAt?: Date;

  decisionLatencyMs?: number;
  providerLatencyMs?: number;
  deviceExecutionLatencyMs?: number;
  confirmationLatencyMs?: number;
  totalLatencyMs?: number;
}

export type EtapaDaOperacao = 'POLICY' | 'PROVIDER' | 'DEVICE' | 'CONFIRMATION';

export type SaudeDeEtapa = 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';

export interface LimiaresDeLatencia {
  policyDegradadoMs: number;
  policyCriticoMs: number;
  providerDegradadoMs: number;
  providerCriticoMs: number;
  deviceDegradadoMs: number;
  deviceCriticoMs: number;
  confirmacaoDegradadoMs: number;
  confirmacaoCriticoMs: number;
}

/**
 * Limiares padrão. São opinião calibrável, não física — por isso vivem numa
 * constante nomeada e não espalhados em `if`s pelo motor.
 */
export const LIMIARES_PADRAO: Readonly<LimiaresDeLatencia> = Object.freeze({
  policyDegradadoMs: 150,
  policyCriticoMs: 500,
  providerDegradadoMs: 400,
  providerCriticoMs: 1_500,
  deviceDegradadoMs: 1_500,
  deviceCriticoMs: 5_000,
  confirmacaoDegradadoMs: 5_000,
  confirmacaoCriticoMs: 30_000
});

export interface DiagnosticoDeEtapa {
  etapa: EtapaDaOperacao;
  latenciaMs?: number;
  saude: SaudeDeEtapa;
  rotulo: string;
}

export interface DiagnosticoDeLatencia {
  operationId: string;
  /** Escopo do diagnóstico. Sem ele, a latência não sobe na hierarquia. */
  endpointId?: string;
  etapas: readonly DiagnosticoDeEtapa[];
  /** Etapa que responde pela maior parcela do tempo. `null` se nada foi medido. */
  etapaDominante: EtapaDaOperacao | null;
  piorSaude: SaudeDeEtapa;
  totalLatencyMs?: number;
  /** Frase determinística, pronta para tela e para auditoria. */
  explicacao: string;
}

function delta(inicio: Date | undefined, fim: Date | undefined): number | undefined {
  if (!inicio || !fim) return undefined;
  return fim.getTime() - inicio.getTime();
}

/** Preenche as latências derivadas sem sobrescrever o que já veio medido. */
export function calcularLatencias(bruta: AccessOperationTelemetry): AccessOperationTelemetry {
  const decisionLatencyMs = bruta.decisionLatencyMs ?? delta(bruta.requestReceivedAt, bruta.policyDecisionAt);
  const providerLatencyMs = bruta.providerLatencyMs ?? delta(bruta.providerRequestAt, bruta.providerResponseAt);
  const deviceExecutionLatencyMs =
    bruta.deviceExecutionLatencyMs ?? delta(bruta.providerResponseAt, bruta.deviceExecutedAt);
  const confirmationLatencyMs =
    bruta.confirmationLatencyMs ?? delta(bruta.deviceExecutedAt, bruta.eventConfirmedAt);
  const fim = bruta.eventConfirmedAt ?? bruta.deviceExecutedAt ?? bruta.providerResponseAt ?? bruta.policyDecisionAt;
  const totalLatencyMs = bruta.totalLatencyMs ?? delta(bruta.requestReceivedAt, fim);

  return {
    ...bruta,
    decisionLatencyMs,
    providerLatencyMs,
    deviceExecutionLatencyMs,
    confirmationLatencyMs,
    totalLatencyMs
  };
}

function classificar(latencia: number | undefined, degradado: number, critico: number): SaudeDeEtapa {
  if (latencia === undefined) return 'UNKNOWN';
  if (latencia >= critico) return 'CRITICAL';
  if (latencia >= degradado) return 'DEGRADED';
  return 'HEALTHY';
}

const ROTULO_DE_ETAPA: Readonly<Record<EtapaDaOperacao, string>> = Object.freeze({
  POLICY: 'Decisão de política',
  PROVIDER: 'Resposta do provedor',
  DEVICE: 'Execução no equipamento',
  CONFIRMATION: 'Confirmação do evento'
});

const ROTULO_DE_SAUDE: Readonly<Record<SaudeDeEtapa, string>> = Object.freeze({
  HEALTHY: 'saudável',
  DEGRADED: 'degradada',
  CRITICAL: 'crítica',
  UNKNOWN: 'sem medição'
});

const ORDEM_DE_SAUDE: Readonly<Record<SaudeDeEtapa, number>> = Object.freeze({
  HEALTHY: 0,
  UNKNOWN: 1,
  DEGRADED: 2,
  CRITICAL: 3
});

export function diagnosticarLatencia(
  telemetria: AccessOperationTelemetry,
  limiares: LimiaresDeLatencia = LIMIARES_PADRAO
): DiagnosticoDeLatencia {
  const t = calcularLatencias(telemetria);
  const etapas: DiagnosticoDeEtapa[] = [
    {
      etapa: 'POLICY',
      latenciaMs: t.decisionLatencyMs,
      saude: classificar(t.decisionLatencyMs, limiares.policyDegradadoMs, limiares.policyCriticoMs),
      rotulo: ROTULO_DE_ETAPA.POLICY
    },
    {
      etapa: 'PROVIDER',
      latenciaMs: t.providerLatencyMs,
      saude: classificar(t.providerLatencyMs, limiares.providerDegradadoMs, limiares.providerCriticoMs),
      rotulo: ROTULO_DE_ETAPA.PROVIDER
    },
    {
      etapa: 'DEVICE',
      latenciaMs: t.deviceExecutionLatencyMs,
      saude: classificar(t.deviceExecutionLatencyMs, limiares.deviceDegradadoMs, limiares.deviceCriticoMs),
      rotulo: ROTULO_DE_ETAPA.DEVICE
    },
    {
      etapa: 'CONFIRMATION',
      latenciaMs: t.confirmationLatencyMs,
      saude: classificar(
        t.confirmationLatencyMs,
        limiares.confirmacaoDegradadoMs,
        limiares.confirmacaoCriticoMs
      ),
      rotulo: ROTULO_DE_ETAPA.CONFIRMATION
    }
  ];

  const medidas = etapas.filter((etapa) => etapa.latenciaMs !== undefined);
  let dominante: EtapaDaOperacao | null = null;
  let maiorLatencia = -1;
  for (const etapa of medidas) {
    const valor = etapa.latenciaMs ?? -1;
    if (valor > maiorLatencia) {
      maiorLatencia = valor;
      dominante = etapa.etapa;
    }
  }

  let piorSaude: SaudeDeEtapa = 'HEALTHY';
  for (const etapa of etapas) {
    if (ORDEM_DE_SAUDE[etapa.saude] > ORDEM_DE_SAUDE[piorSaude]) piorSaude = etapa.saude;
  }

  const partes = etapas
    .filter((etapa) => etapa.saude !== 'UNKNOWN')
    .map((etapa) => `${etapa.rotulo}: ${ROTULO_DE_SAUDE[etapa.saude]} (${etapa.latenciaMs} ms)`);
  const atribuicao =
    dominante === null
      ? 'Sem medição suficiente para atribuir a demora a uma etapa.'
      : `Maior parcela do tempo: ${ROTULO_DE_ETAPA[dominante]}.`;

  return {
    operationId: t.operationId,
    endpointId: t.endpointId,
    etapas,
    etapaDominante: dominante,
    piorSaude,
    totalLatencyMs: t.totalLatencyMs,
    explicacao: `${partes.join(' · ')}${partes.length > 0 ? ' · ' : ''}${atribuicao}`
  };
}
