// ---------------------------------------------------------------------------
// HEALTH SCORE POR HIERARQUIA — itens 8 e 30
//
// Rede Hospitalar: 91 · Hospital A: 87 · UTI do Hospital A: 72
//
// A decisão que sustenta esses três números é uma só, e não é óbvia: o score do
// pai NÃO é a média dos scores dos filhos. É recalculado sobre os MESMOS fatos,
// no escopo do pai.
//
// A média de filhos parece razoável e mente de duas maneiras. Ela dilui: uma
// UTI a 40 dentro de uma rede com quarenta unidades a 98 desaparece na média.
// E ela não abre: um score médio não tem componentes, então clicar nele não
// leva a lugar nenhum — o oposto exato do que o item 7 exige.
//
// Recalcular por escopo custa mais processamento e devolve algo que o
// coordenador consegue auditar: o -12 do hospital e o -28 da UTI apontam para
// as mesmas portas, com os mesmos identificadores.
// ---------------------------------------------------------------------------

import { Endpoint, NoDeHierarquia, StatusDeConectividade, Topologia, endpointsSob } from '../dominio/topologia';
import { DiagnosticoDeLatencia } from '../dominio/telemetria';
import { PhysicalReconciliationResult } from '../physical-state-reconciliation/tipos';
import { AccessGovernanceHealth, EvidenciasDeHealth, calcularHealth } from './health';
import { PesosLidos, lerPesos } from './calibragem';
import { calcularIndicadores } from './indicadores';

export interface EntradaDaHierarquia {
  organizationId: string;
  topologia: Topologia;
  conectividade: ReadonlyMap<string, StatusDeConectividade>;
  reconciliacoes: readonly PhysicalReconciliationResult[];
  latencias: readonly DiagnosticoDeLatencia[];
  conflitosPorZona?: ReadonlyMap<string, number>;
  backlogDeEventos?: number;
  backlogDeSincronizacaoPorEndpoint?: ReadonlyMap<string, number>;
  bateriasCriticasPorEndpoint?: ReadonlySet<string>;
  calculatedAt: Date;
  /**
   * Pesos lidos pela porta de calibragem, com os avisos que vêm junto.
   *
   * Não é `PesosDeHealth` puro de propósito: passar só os números permitiria
   * calcular o score sem carregar o estatuto deles, que é exatamente o que o
   * pacote Calibration existe para impedir.
   */
  calibragem?: PesosLidos;
}

export interface ArvoreDeHealth {
  /** Health por id de nó, incluindo o nível ENDPOINT. */
  porEscopo: ReadonlyMap<string, AccessGovernanceHealth>;
  raiz: AccessGovernanceHealth;
  /** Escopos ordenados do pior para o melhor score — a ordem que a tela usa. */
  ordenadosPorRisco: readonly AccessGovernanceHealth[];
  /** O estatuto dos pesos que produziram estes números. Viaja com eles. */
  calibragem: PesosLidos;
}

function evidenciasDoEscopo(
  endpoints: readonly Endpoint[],
  conectividade: ReadonlyMap<string, StatusDeConectividade>,
  reconciliacoes: readonly PhysicalReconciliationResult[]
): EvidenciasDeHealth {
  return {
    endpointsOffline: endpoints
      .filter((e) => {
        const status = conectividade.get(e.id) ?? 'UNKNOWN';
        return status === 'OFFLINE' || status === 'UNKNOWN';
      })
      .map((e) => e.id),
    endpointsDegraded: endpoints.filter((e) => conectividade.get(e.id) === 'DEGRADED').map((e) => e.id),
    revogacoesPendentes: reconciliacoes
      .filter((r) => r.estadoSemantico === 'DEVICE_REVOCATION_PENDING')
      .map((r) => r.credentialId ?? r.entitlementId ?? r.endpointId),
    sincronizacoesPendentes: reconciliacoes
      .filter((r) => r.estadoSemantico === 'DEVICE_GRANT_PENDING')
      .map((r) => r.credentialId ?? r.entitlementId ?? r.endpointId),
    naoReconciliados: reconciliacoes.filter((r) => r.confidence === 'UNKNOWN').map((r) => r.endpointId)
  };
}

export function calcularArvoreDeHealth(entrada: EntradaDaHierarquia): ArvoreDeHealth {
  const porEscopo = new Map<string, AccessGovernanceHealth>();
  const calibragem = entrada.calibragem ?? lerPesos();
  const pesos = calibragem.pesos;

  const escoposDeNo: readonly NoDeHierarquia[] = entrada.topologia.nos;
  const escoposDeEndpoint: readonly NoDeHierarquia[] = entrada.topologia.endpoints.map((endpoint) => ({
    id: endpoint.id,
    nivel: 'ENDPOINT' as const,
    nome: endpoint.nome,
    paiId: endpoint.zonaId
  }));

  for (const no of [...escoposDeNo, ...escoposDeEndpoint]) {
    const endpoints = endpointsSob(entrada.topologia, no.id);
    const idsDoEscopo = new Set(endpoints.map((e) => e.id));
    const reconciliacoes = entrada.reconciliacoes.filter((r) => idsDoEscopo.has(r.endpointId));
    const gateways = entrada.topologia.gateways.filter((gateway) =>
      endpoints.some((endpoint) => endpoint.gatewayId === gateway.id)
    );
    const conexoes = entrada.topologia.conexoes.filter((conexao) =>
      endpoints.some((endpoint) => endpoint.providerConnectionId === conexao.id)
    );
    const zonas = new Set(endpoints.map((e) => e.zonaId));
    let conflitos = 0;
    for (const [zona, quantidade] of entrada.conflitosPorZona ?? []) {
      if (zonas.has(zona)) conflitos += quantidade;
    }
    let baterias = 0;
    for (const endpoint of endpoints) {
      if (entrada.bateriasCriticasPorEndpoint?.has(endpoint.id)) baterias += 1;
    }
    const backlog = new Map<string, number>();
    for (const [endpointId, valor] of entrada.backlogDeSincronizacaoPorEndpoint ?? []) {
      if (idsDoEscopo.has(endpointId)) backlog.set(endpointId, valor);
    }

    const indicadores = calcularIndicadores({
      escopoId: no.id,
      endpoints,
      conectividade: entrada.conectividade,
      gateways,
      conexoes,
      reconciliacoes,
      // Latência sem endpoint declarado é infraestrutura compartilhada: conta
      // no escopo raiz, não numa porta específica.
      latencias: entrada.latencias.filter((l) =>
        l.endpointId === undefined ? no.paiId === null : idsDoEscopo.has(l.endpointId)
      ),
      conflitosDePolitica: conflitos,
      backlogDeEventos: no.nivel === 'ORGANIZATION' ? entrada.backlogDeEventos : 0,
      backlogDeSincronizacaoPorEndpoint: backlog,
      bateriasCriticas: baterias
    });

    porEscopo.set(
      no.id,
      calcularHealth(
        {
          organizationId: entrada.organizationId,
          facilityId: endpoints[0]?.facilityId,
          escopoId: no.id,
          nivel: no.nivel,
          nome: no.nome,
          calculatedAt: entrada.calculatedAt
        },
        indicadores,
        evidenciasDoEscopo(endpoints, entrada.conectividade, reconciliacoes),
        pesos
      )
    );
  }

  const raizDeclarada = entrada.topologia.nos.find((no) => no.paiId === null);
  const raiz = (raizDeclarada && porEscopo.get(raizDeclarada.id)) ?? [...porEscopo.values()][0];
  if (!raiz) {
    throw new Error('Topologia sem nós: não há escopo para calcular Health Score.');
  }

  const ordenadosPorRisco = [...porEscopo.values()].sort(
    (a, b) => a.score - b.score || a.escopoId.localeCompare(b.escopoId)
  );

  return { porEscopo, raiz, ordenadosPorRisco, calibragem };
}
