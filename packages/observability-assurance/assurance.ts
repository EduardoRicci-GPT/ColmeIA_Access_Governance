// ---------------------------------------------------------------------------
// OBSERVABILITY & ASSURANCE ENGINE — o quarto motor
//
// Os três primeiros motores produzem verdade pontual: uma decisão, um direito,
// uma divergência. Este produz verdade AGREGADA — e agregar é onde a maioria
// dos sistemas de acesso começa a mentir, porque agregar é escolher o que
// desaparece.
//
// Três escolhas que este motor faz para não desaparecer com o que importa:
//
//   · A fila é ordenada por RISCO, nunca por data. Uma revogação crítica de
//     ontem vem antes de um endpoint secundário que caiu agora.
//   · Caso de escalonamento é DEDUPLICADO por chave estável. Cem ciclos de
//     reconciliação sobre a mesma divergência produzem um caso, não cem —
//     senão a fila vira ruído e ninguém a lê.
//   · Nenhum indicador é publicado sem componente. Score sem composição é
//     opinião com aparência de medida.
// ---------------------------------------------------------------------------

import { EscalationCase, TipoDeEscalonamento } from '../dominio/escalonamento';
import { EventoDeDominio } from '../dominio/eventos';
import { NivelDeRisco, ORDEM_DE_RISCO } from '../dominio/risco';
import { Relogio } from '../dominio/tempo';
import { PhysicalReconciliationResult } from '../physical-state-reconciliation/tipos';
import { AccessGovernanceHealth } from './health';
import { ArvoreDeHealth, EntradaDaHierarquia, calcularArvoreDeHealth } from './hierarquia';

export interface RelatorioDeAssurance {
  calculadoEm: Date;
  arvore: ArvoreDeHealth;
  /** Divergências ordenadas do maior risco para o menor. */
  filaDeRisco: readonly PhysicalReconciliationResult[];
  casosAbertos: readonly EscalationCase[];
  eventos: readonly EventoDeDominio[];
}

function tipoDeEscalonamento(resultado: PhysicalReconciliationResult): TipoDeEscalonamento {
  switch (resultado.natureza) {
    case 'REVOGACAO_NAO_CONFIRMADA':
      return 'REVOCATION_NOT_CONFIRMED';
    case 'ESTADO_DESCONHECIDO':
      return 'UNKNOWN_PHYSICAL_STATE';
    case 'GATEWAY_DEGRADADO':
      return 'GATEWAY_OFFLINE';
    case 'PROVEDOR_INDISPONIVEL':
      return 'PROVIDER_UNAVAILABLE';
    case 'CONFLITO_DE_POLITICA':
      return 'POLICY_CONFLICT';
    case 'LATENCIA_ANOMALA':
      return 'LATENCY_ANOMALY';
    default:
      return 'SYNC_EXHAUSTED_RETRIES';
  }
}

/** Chave estável do caso: mesma divergência, no mesmo lugar, é o mesmo caso. */
export function chaveDoCaso(resultado: PhysicalReconciliationResult): string {
  return [
    resultado.endpointId,
    resultado.credentialId ?? resultado.entitlementId ?? '-',
    resultado.natureza
  ].join('::');
}

export class ObservabilityAssuranceEngine {
  private readonly casos = new Map<string, EscalationCase>();
  private readonly ultimoScore = new Map<string, number>();
  private sequencia = 0;

  constructor(private readonly relogio: Relogio) {}

  avaliar(entrada: Omit<EntradaDaHierarquia, 'calculatedAt'>): RelatorioDeAssurance {
    const agora = this.relogio.agora();
    const arvore = calcularArvoreDeHealth({ ...entrada, calculatedAt: agora });

    const filaDeRisco = [...entrada.reconciliacoes].sort((a, b) => {
      const diferenca = ORDEM_DE_RISCO[b.riskLevel] - ORDEM_DE_RISCO[a.riskLevel];
      if (diferenca !== 0) return diferenca;
      const aberturaA = a.minutosEmAberto ?? 0;
      const aberturaB = b.minutosEmAberto ?? 0;
      return aberturaB - aberturaA || a.endpointId.localeCompare(b.endpointId);
    });

    const eventos: EventoDeDominio[] = [];
    for (const resultado of entrada.reconciliacoes) {
      if (!resultado.exigeEscalonamento) continue;
      const chave = chaveDoCaso(resultado);
      const existente = this.casos.get(chave);
      if (existente && existente.status !== 'RESOLVED' && existente.status !== 'DISMISSED') {
        // Caso já aberto: a divergência persiste, mas não vira caso novo.
        continue;
      }
      this.sequencia += 1;
      const caso: EscalationCase = {
        id: `ESC-${String(this.sequencia).padStart(5, '0')}`,
        type: tipoDeEscalonamento(resultado),
        severity: resultado.riskLevel,
        subjectId: resultado.personId,
        endpointId: resultado.endpointId,
        entitlementId: resultado.entitlementId,
        reason: resultado.reason,
        status: 'OPEN',
        createdAt: agora,
        evidencias: [chave, ...resultado.fatoresDeRisco]
      };
      this.casos.set(chave, caso);
      eventos.push({
        id: `EV-${caso.id}`,
        tipo: 'EscalationOpened',
        ocorridoEm: agora,
        registradoEm: agora,
        origemDeIngestao: 'LOCAL_EVENT',
        decisionOrigin: 'COLMEIA_POLICY_ENGINE',
        organizationId: entrada.organizationId,
        endpointId: resultado.endpointId,
        personId: resultado.personId,
        entitlementId: resultado.entitlementId,
        idempotencyKey: `ESCALATION::${chave}::${caso.id}`,
        resumo: `Caso ${caso.id} aberto (${caso.type}, severidade ${caso.severity}).`
      });
    }

    for (const health of arvore.porEscopo.values()) {
      const anterior = this.ultimoScore.get(health.escopoId);
      if (anterior !== undefined && anterior !== health.score) {
        eventos.push(this.eventoDeScore(entrada.organizationId, health, anterior, agora));
      }
      this.ultimoScore.set(health.escopoId, health.score);
    }

    return {
      calculadoEm: agora,
      arvore,
      filaDeRisco,
      casosAbertos: this.casosAbertos(),
      eventos
    };
  }

  private eventoDeScore(
    organizationId: string,
    health: AccessGovernanceHealth,
    anterior: number,
    agora: Date
  ): EventoDeDominio {
    this.sequencia += 1;
    return {
      id: `EV-SCORE-${String(this.sequencia).padStart(5, '0')}`,
      tipo: 'HealthScoreChanged',
      ocorridoEm: agora,
      registradoEm: agora,
      origemDeIngestao: 'LOCAL_EVENT',
      organizationId,
      idempotencyKey: `SCORE::${health.escopoId}::${agora.toISOString()}::${health.score}`,
      dados: {
        escopoId: health.escopoId,
        nivel: health.nivel,
        scoreAnterior: anterior,
        scoreAtual: health.score,
        componentes: health.components.map((componente) => componente.detalhe)
      },
      resumo: `${health.nome}: ${anterior} → ${health.score} (${health.components.length} componente(s)).`
    };
  }

  reconhecerCaso(chave: string, porQuem: string): EscalationCase | null {
    const caso = this.casos.get(chave);
    if (!caso) return null;
    const atualizado: EscalationCase = {
      ...caso,
      status: 'ACKNOWLEDGED',
      acknowledgedAt: this.relogio.agora(),
      acknowledgedBy: porQuem
    };
    this.casos.set(chave, atualizado);
    return atualizado;
  }

  resolverCaso(chave: string, porQuem: string): EscalationCase | null {
    const caso = this.casos.get(chave);
    if (!caso) return null;
    const atualizado: EscalationCase = {
      ...caso,
      status: 'RESOLVED',
      resolvedAt: this.relogio.agora(),
      resolvedBy: porQuem
    };
    this.casos.set(chave, atualizado);
    return atualizado;
  }

  /**
   * Encerra automaticamente os casos cuja divergência sumiu do ciclo atual.
   * É o passo 13 do cenário P1: quando o equipamento volta e confirma a
   * revogação, o risco não é "esquecido" — é ENCERRADO, com hora.
   */
  encerrarCasosResolvidos(resultados: readonly PhysicalReconciliationResult[]): readonly EscalationCase[] {
    const aindaAbertas = new Set(
      resultados.filter((r) => r.exigeEscalonamento || r.action !== 'NONE').map(chaveDoCaso)
    );
    const encerrados: EscalationCase[] = [];
    for (const [chave, caso] of this.casos) {
      if (caso.status === 'RESOLVED' || caso.status === 'DISMISSED') continue;
      if (aindaAbertas.has(chave)) continue;
      const atualizado: EscalationCase = {
        ...caso,
        status: 'RESOLVED',
        resolvedAt: this.relogio.agora(),
        resolvedBy: 'reconciliacao-automatica'
      };
      this.casos.set(chave, atualizado);
      encerrados.push(atualizado);
    }
    return encerrados;
  }

  casosAbertos(): readonly EscalationCase[] {
    return [...this.casos.values()]
      .filter((caso) => caso.status === 'OPEN' || caso.status === 'ACKNOWLEDGED')
      .sort((a, b) => ORDEM_DE_RISCO[b.severity] - ORDEM_DE_RISCO[a.severity] || a.id.localeCompare(b.id));
  }

  todosOsCasos(): readonly EscalationCase[] {
    return [...this.casos.values()];
  }

  piorSeveridadeAberta(): NivelDeRisco | null {
    const abertos = this.casosAbertos();
    return abertos[0]?.severity ?? null;
  }
}
