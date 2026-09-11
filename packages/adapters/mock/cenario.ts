// ---------------------------------------------------------------------------
// CENÁRIO DE SIMULAÇÃO — item 19
//
// O simulador v1 respondia "ok" a tudo. Um simulador assim prova apenas que o
// caminho feliz compila; ele não é capaz de gerar o único estado que este
// produto existe para representar, que é a divergência.
//
// Cada campo abaixo corresponde a um modo de falha REAL de controle de acesso
// físico, e nenhum deles é exótico:
//
//   · fechadura a bateria que dorme e perde o comando;
//   · gateway alimentado por tomada que a limpeza desliga;
//   · nuvem do fabricante em manutenção às 2h;
//   · webhook entregue uma vez, no vazio, sem retentativa;
//   · sincronização que grava 40 das 60 credenciais e retorna sucesso;
//   · relógio do equipamento que derrapa e passa a aplicar a janela errada.
//
// Um sistema de governança de acesso que nunca viu esses estados em teste vai
// vê-los pela primeira vez em produção, num hospital.
// ---------------------------------------------------------------------------

export interface CenarioDeSimulacao {
  semente: number;

  /** Nuvem do fabricante disponível? */
  provedorOnline: boolean;
  /** Latência simulada da API do provedor, em ms. */
  latenciaDoProvedorMs: number;

  /** Gateways offline, por id. */
  gatewaysOffline: readonly string[];
  /** Endpoints offline, por id. */
  endpointsOffline: readonly string[];
  /** Endpoints degradados (respondem, mas sem garantia). */
  endpointsDegradados: readonly string[];

  /** Tempo entre aceitar e executar no equipamento, em ms. */
  latenciaDoEquipamentoMs: number;
  /** Atraso entre executar e confirmar por evento, em ms. */
  atrasoDeConfirmacaoMs: number;

  /** Probabilidade de um evento de confirmação se perder no caminho. */
  probabilidadeDePerdaDeEvento: number;
  /** Fração das credenciais que uma sincronização FULL efetivamente grava. */
  fracaoDeSincronizacao: number;

  /** Credenciais que existem no equipamento e não no registro (drift). */
  driftDeCredenciais: readonly { endpointId: string; referenciaExterna: string }[];

  /** Desvio de relógio por endpoint, em ms. */
  desvioDeRelogioMs: Readonly<Record<string, number>>;
  /** Percentual de bateria por endpoint. */
  bateriaPercentual: Readonly<Record<string, number>>;
  /** Endpoints com firmware degradado. */
  firmwareDegradado: readonly string[];

  /** O provedor sabe reconciliar estado físico sob demanda? */
  suportaReconciliacaoFisica: boolean;
  /** O provedor confirma fisicamente, ou apenas aceita ordens? */
  confirmaFisicamente: boolean;
}

export const CENARIO_SAUDAVEL: Readonly<CenarioDeSimulacao> = Object.freeze({
  semente: 20260911,
  provedorOnline: true,
  latenciaDoProvedorMs: 70,
  gatewaysOffline: [],
  endpointsOffline: [],
  endpointsDegradados: [],
  latenciaDoEquipamentoMs: 200,
  atrasoDeConfirmacaoMs: 300,
  probabilidadeDePerdaDeEvento: 0,
  fracaoDeSincronizacao: 1,
  driftDeCredenciais: [],
  desvioDeRelogioMs: {},
  bateriaPercentual: {},
  firmwareDegradado: [],
  suportaReconciliacaoFisica: true,
  confirmaFisicamente: true
});

export function comCenario(
  base: CenarioDeSimulacao,
  ajustes: Partial<CenarioDeSimulacao>
): CenarioDeSimulacao {
  return { ...base, ...ajustes };
}
