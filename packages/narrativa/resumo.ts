// ---------------------------------------------------------------------------
// RESUMO OPERACIONAL — item 32
//
// «Há três revogações pendentes na Farmácia porque o gateway está offline
//  desde 08:17.»
//
// A frase do exemplo tem três partes e nenhuma delas é opinião: a contagem, o
// lugar e a causa. Todas saem de dados determinísticos já apurados pelos
// motores. É por isso que este módulo produz a frase SEM modelo de linguagem.
//
// O papel da IA aparece depois e é outro: agrupar quando houver dezenas de
// linhas, escolher o que mostrar primeiro para um público específico, explicar
// a um gestor não técnico o que significa "revogação pendente". Nenhuma dessas
// tarefas exige inventar fato — e o texto que ela produzir ainda passa pela
// guarda de honestidade antes de chegar a alguém.
// ---------------------------------------------------------------------------

import { Gateway, NoDeHierarquia, Topologia } from '../dominio/topologia';
import { PhysicalReconciliationResult } from '../physical-state-reconciliation/tipos';
import { NivelDeRisco, ORDEM_DE_RISCO } from '../dominio/risco';

export interface LinhaDeResumo {
  texto: string;
  risco: NivelDeRisco;
  escopoId: string;
  quantidade: number;
  /** Causa atribuída, quando há uma identificável. `null` quando não há. */
  causa: string | null;
}

function horaCurta(data: Date | undefined): string | null {
  if (!data) return null;
  const hora = String(data.getHours()).padStart(2, '0');
  const minuto = String(data.getMinutes()).padStart(2, '0');
  return `${hora}:${minuto}`;
}

/**
 * Agrupa divergências por zona e atribui causa quando ela é DEDUTÍVEL.
 *
 * "Quando é dedutível" faz trabalho pesado aqui. Se todos os endpoints com
 * revogação pendente numa zona dependem do mesmo gateway, e esse gateway está
 * offline, a causa é atribuível. Se dois dos cinco dependem de outro gateway
 * que está de pé, a causa NÃO é o gateway — e o resumo diz que há mais de um
 * fator, em vez de escolher o mais conveniente.
 */
export function resumirDivergencias(
  topologia: Topologia,
  resultados: readonly PhysicalReconciliationResult[]
): readonly LinhaDeResumo[] {
  const endpointsPorId = new Map(topologia.endpoints.map((e) => [e.id, e]));
  const nosPorId = new Map<string, NoDeHierarquia>(topologia.nos.map((no) => [no.id, no]));
  const gatewaysPorId = new Map<string, Gateway>(topologia.gateways.map((g) => [g.id, g]));

  const porZona = new Map<string, PhysicalReconciliationResult[]>();
  for (const resultado of resultados) {
    if (resultado.action === 'NONE') continue;
    const zona = endpointsPorId.get(resultado.endpointId)?.zonaId ?? 'zona-desconhecida';
    const lista = porZona.get(zona) ?? [];
    lista.push(resultado);
    porZona.set(zona, lista);
  }

  const linhas: LinhaDeResumo[] = [];
  for (const [zonaId, itens] of porZona) {
    const nomeDaZona = nosPorId.get(zonaId)?.nome ?? zonaId;
    const pendentes = itens.filter((item) => item.estadoSemantico === 'DEVICE_REVOCATION_PENDING');
    const alvo = pendentes.length > 0 ? pendentes : itens;

    let piorRisco: NivelDeRisco = 'LOW';
    for (const item of alvo) {
      if (ORDEM_DE_RISCO[item.riskLevel] > ORDEM_DE_RISCO[piorRisco]) piorRisco = item.riskLevel;
    }

    const gatewaysEnvolvidos = new Set(
      alvo.map((item) => endpointsPorId.get(item.endpointId)?.gatewayId).filter((id): id is string => !!id)
    );
    let causa: string | null = null;
    if (gatewaysEnvolvidos.size === 1) {
      const gatewayId = [...gatewaysEnvolvidos][0];
      const gateway = gatewayId ? gatewaysPorId.get(gatewayId) : undefined;
      if (gateway && (gateway.status === 'OFFLINE' || gateway.status === 'UNKNOWN')) {
        const desde = horaCurta(gateway.lastSeenAt);
        causa = desde
          ? `o gateway está offline desde ${desde}`
          : 'o gateway está offline (sem registro de última comunicação)';
      }
    } else if (gatewaysEnvolvidos.size > 1) {
      causa = `há ${gatewaysEnvolvidos.size} gateways envolvidos: a causa não é única`;
    }

    const substantivo =
      pendentes.length > 0
        ? `${pendentes.length} revogaç${pendentes.length === 1 ? 'ão pendente' : 'ões pendentes'}`
        : `${itens.length} divergência${itens.length === 1 ? '' : 's'}`;

    linhas.push({
      texto: `Há ${substantivo} em ${nomeDaZona}${causa ? ` porque ${causa}` : ''}.`,
      risco: piorRisco,
      escopoId: zonaId,
      quantidade: alvo.length,
      causa
    });
  }

  return linhas.sort(
    (a, b) => ORDEM_DE_RISCO[b.risco] - ORDEM_DE_RISCO[a.risco] || b.quantidade - a.quantidade
  );
}
