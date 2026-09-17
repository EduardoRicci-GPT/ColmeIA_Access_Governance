// ---------------------------------------------------------------------------
// BANCADA HOSPITALAR — o cenário comum a toda a bateria
//
// Uma rede com dois hospitais, dez endpoints e quatro pessoas. Os números não
// são arbitrários: dez endpoints é o que torna o exemplo do item 7 verificável
// (2 offline em 10 = −5 pontos de disponibilidade), e a criticidade de cada
// porta é a que a especificação sugere no item 29.
//
// A bancada devolve o mundo montado e os quatro motores ligados, para que cada
// cenário só precise descrever o que muda — nunca remontar o hospital.
// ---------------------------------------------------------------------------

import { RelogioFixo } from '../packages/dominio/tempo';
import { DiarioNaTrilha, TrilhaDeAcesso } from '../packages/auditoria';
import {
  ALCADAS_HOSPITALARES,
  AutoridadeEmMemoria,
  CanalEmMemoria,
  GateDeAcesso,
  JANELAS_PADRAO,
  MaterialDeRevisao,
  PlantaoDeAprovacao
} from '../packages/governanca';
import { Endpoint, Gateway, NoDeHierarquia, ProviderConnection, Topologia } from '../packages/dominio/topologia';
import { Person, Relationship, Role } from '../packages/dominio/entitlement';
import {
  DOMINIOS_DE_SEGREGACAO_BASE,
  PolicyEngine,
  REGRAS_HOSPITALARES_BASE
} from '../packages/policy-engine';
import { EntitlementReconciliationEngine, MundoLogico } from '../packages/entitlement-reconciliation';
import { PhysicalStateReconciliationEngine } from '../packages/physical-state-reconciliation';
import { ObservabilityAssuranceEngine } from '../packages/observability-assurance';
import { MockAccessProvider, SimuladorDeMundoFisico } from '../packages/adapters/mock';
import { CicloDeGovernanca } from '../packages/orquestracao';
import {
  EntitlementsEmMemoria,
  RegistrosDeAcessoEmMemoria,
  SyncJobsEmMemoria
} from '../packages/persistencia';

export const NOS: NoDeHierarquia[] = [
  { id: 'org-sinergentia', nivel: 'ORGANIZATION', nome: 'Rede Sinergentia Saúde', paiId: null },
  { id: 'rede-sudeste', nivel: 'NETWORK', nome: 'Rede Sudeste', paiId: 'org-sinergentia' },
  { id: 'hosp-aurora', nivel: 'FACILITY', nome: 'Hospital Aurora', paiId: 'rede-sudeste' },
  { id: 'pred-central', nivel: 'BUILDING', nome: 'Prédio Central', paiId: 'hosp-aurora' },
  { id: 'z-uti', nivel: 'ZONE', nome: 'UTI Adulto', paiId: 'pred-central' },
  { id: 'z-farmacia', nivel: 'ZONE', nome: 'Farmácia', paiId: 'pred-central' },
  { id: 'z-cc', nivel: 'ZONE', nome: 'Centro Cirúrgico', paiId: 'pred-central' },
  { id: 'z-datacenter', nivel: 'ZONE', nome: 'Datacenter', paiId: 'pred-central' },
  { id: 'z-admin', nivel: 'ZONE', nome: 'Administrativo', paiId: 'pred-central' },
  { id: 'z-seguranca', nivel: 'ZONE', nome: 'Área de Segurança Excepcional', paiId: 'pred-central' }
];

function endpoint(
  id: string,
  nome: string,
  zonaId: string,
  criticidade: Endpoint['criticidade'],
  gatewayId: string
): Endpoint {
  return {
    id,
    nome,
    zonaId,
    facilityId: 'hosp-aurora',
    providerId: 'MOCK',
    providerConnectionId: 'conn-mock',
    gatewayId,
    criticidade,
    referenciaExterna: `EXT-${id.toUpperCase()}`,
    capacidades: ['REMOTE_REVOCATION', 'OFFLINE_CREDENTIALS', 'EVENT_STREAM'],
    metodosSuportados: ['CARD', 'PIN', 'BIOMETRIC']
  };
}

export const ENDPOINTS: Endpoint[] = [
  endpoint('ep-uti-1', 'UTI — porta principal', 'z-uti', 'HIGH', 'gw-central'),
  endpoint('ep-uti-2', 'UTI — sala de medicação', 'z-uti', 'HIGH', 'gw-central'),
  endpoint('ep-farm-1', 'Farmácia — porta principal', 'z-farmacia', 'HIGH', 'gw-central'),
  endpoint('ep-farm-2', 'Farmácia — sala de quimioterápicos', 'z-farmacia', 'HIGH', 'gw-central'),
  endpoint('ep-cc-1', 'Centro Cirúrgico — antessala restrita', 'z-cc', 'HIGH', 'gw-central'),
  endpoint('ep-dc-1', 'Datacenter — rack principal', 'z-datacenter', 'HIGH', 'gw-predio-b'),
  endpoint('ep-adm-1', 'Administrativo — diretoria', 'z-admin', 'LOW', 'gw-predio-b'),
  endpoint('ep-adm-2', 'Administrativo — arquivo', 'z-admin', 'LOW', 'gw-predio-b'),
  endpoint('ep-adm-3', 'Administrativo — copa', 'z-admin', 'LOW', 'gw-predio-b'),
  endpoint('ep-seg-1', 'Cofre de psicotrópicos', 'z-seguranca', 'CRITICAL', 'gw-central')
];

export const GATEWAYS: Gateway[] = [
  {
    id: 'gw-central',
    providerId: 'MOCK',
    facilityId: 'hosp-aurora',
    status: 'ONLINE',
    metadata: { localizacao: 'CPD do bloco clínico' }
  },
  {
    id: 'gw-predio-b',
    providerId: 'MOCK',
    facilityId: 'hosp-aurora',
    status: 'ONLINE',
    metadata: { localizacao: 'Sala técnica do bloco administrativo' }
  }
];

export const CONEXOES: ProviderConnection[] = [
  {
    id: 'conn-mock',
    providerId: 'MOCK',
    organizationId: 'org-sinergentia',
    status: 'ONLINE',
    referenciaDeCredencial: 'cofre://mock/conta-de-testes'
  }
];

export const PAPEIS: Role[] = [
  { id: 'role-enfermagem-uti', nome: 'Enfermagem UTI', zonasAutorizadas: ['z-uti'] },
  { id: 'role-farmacia', nome: 'Farmácia clínica', zonasAutorizadas: ['z-farmacia'] },
  { id: 'role-manutencao', nome: 'Manutenção predial', zonasAutorizadas: ['z-datacenter'] },
  { id: 'role-administrativo', nome: 'Administrativo', zonasAutorizadas: ['z-admin'] },
  { id: 'role-seguranca', nome: 'Supervisão de segurança', zonasAutorizadas: ['z-seguranca'] }
];

export const PESSOAS: Person[] = [
  { id: 'p-eduardo', nomeDeExibicao: 'Eduardo (enfermeiro)', identificadorInstitucional: 'MAT-1042' },
  { id: 'p-marina', nomeDeExibicao: 'Marina (farmacêutica)', identificadorInstitucional: 'MAT-2210' },
  { id: 'p-jonas', nomeDeExibicao: 'Jonas (prestador)', identificadorInstitucional: 'PREST-88' },
  { id: 'p-clara', nomeDeExibicao: 'Clara (administrativo)', identificadorInstitucional: 'MAT-3301' },
  { id: 'p-rui', nomeDeExibicao: 'Rui (supervisor de segurança)', identificadorInstitucional: 'MAT-0007' }
];

export const INICIO = '2026-09-11T08:00:00';

export function vinculosIniciais(): Relationship[] {
  return [
    {
      id: 'vin-eduardo',
      personId: 'p-eduardo',
      organizationId: 'org-sinergentia',
      tipo: 'EMPLOYEE',
      situacao: 'ACTIVE',
      vigencia: { inicio: new Date('2024-01-01T00:00:00') },
      roleIds: ['role-enfermagem-uti'],
      unidadesLotadas: ['z-uti'],
      // Turno diurno 07h–19h, de segunda a sexta.
      escala: { diasDaSemana: [1, 2, 3, 4, 5], minutoInicial: 420, minutoFinal: 1140, atravessaMeiaNoite: false }
    },
    {
      id: 'vin-marina',
      personId: 'p-marina',
      organizationId: 'org-sinergentia',
      tipo: 'EMPLOYEE',
      situacao: 'ACTIVE',
      vigencia: { inicio: new Date('2023-05-01T00:00:00') },
      roleIds: ['role-farmacia'],
      unidadesLotadas: ['z-farmacia']
    },
    {
      id: 'vin-jonas',
      personId: 'p-jonas',
      organizationId: 'org-sinergentia',
      tipo: 'CONTRACTOR',
      situacao: 'ACTIVE',
      vigencia: { inicio: new Date('2026-09-11T08:00:00'), fim: new Date('2026-09-11T16:00:00') },
      roleIds: ['role-manutencao'],
      unidadesLotadas: [],
      ordemDeServicoId: 'OS-4471'
    },
    {
      id: 'vin-clara',
      personId: 'p-clara',
      organizationId: 'org-sinergentia',
      tipo: 'EMPLOYEE',
      situacao: 'ACTIVE',
      vigencia: { inicio: new Date('2022-02-01T00:00:00') },
      roleIds: ['role-administrativo'],
      unidadesLotadas: ['z-admin']
    },
    {
      id: 'vin-rui',
      personId: 'p-rui',
      organizationId: 'org-sinergentia',
      tipo: 'EMPLOYEE',
      situacao: 'ACTIVE',
      vigencia: { inicio: new Date('2021-03-01T00:00:00') },
      roleIds: ['role-seguranca'],
      unidadesLotadas: ['z-seguranca']
    }
  ];
}

export function topologiaInicial(): Topologia {
  return {
    nos: NOS,
    endpoints: ENDPOINTS,
    gateways: GATEWAYS.map((g) => ({ ...g })),
    conexoes: CONEXOES.map((c) => ({ ...c }))
  };
}

export interface Bancada {
  relogio: RelogioFixo;
  simulador: SimuladorDeMundoFisico;
  adaptador: MockAccessProvider;
  ciclo: CicloDeGovernanca;
  assurance: ObservabilityAssuranceEngine;
  trilha: TrilhaDeAcesso;
  gate: GateDeAcesso;
  diario: DiarioNaTrilha;
  plantao: PlantaoDeAprovacao;
  canal: CanalEmMemoria;
  autoridade: AutoridadeEmMemoria;
  registros: RegistrosDeAcessoEmMemoria;
  entitlements: EntitlementsEmMemoria;
  syncJobs: SyncJobsEmMemoria;
  mundo: MundoLogico;
}

export function montarBancada(opcoes: { inicio?: string; cenario?: Parameters<typeof SimuladorDeMundoFisico.prototype.aplicar>[0] } = {}): Bancada {
  const relogio = new RelogioFixo(opcoes.inicio ?? INICIO);
  const simulador = new SimuladorDeMundoFisico({ semente: 20260911 });
  if (opcoes.cenario) simulador.aplicar(opcoes.cenario);

  const gatewayPorEndpoint: Record<string, string> = {};
  for (const ep of ENDPOINTS) if (ep.gatewayId) gatewayPorEndpoint[ep.id] = ep.gatewayId;

  const adaptador = new MockAccessProvider(simulador, { gatewayPorEndpoint });
  const policy = new PolicyEngine(REGRAS_HOSPITALARES_BASE);
  const entitlementEngine = new EntitlementReconciliationEngine(policy, relogio);
  const physicalEngine = new PhysicalStateReconciliationEngine(relogio);
  const assurance = new ObservabilityAssuranceEngine(relogio);

  const registros = new RegistrosDeAcessoEmMemoria();
  const entitlements = new EntitlementsEmMemoria();
  const syncJobs = new SyncJobsEmMemoria();
  const trilha = new TrilhaDeAcesso({ relogio });

  // A autoridade vem do host. Na bancada, é esta implementação de referência;
  // num aplicativo de gestão hospitalar, é o RBAC do próprio aplicativo.
  const autoridade = new AutoridadeEmMemoria(ALCADAS_HOSPITALARES);
  autoridade.credenciar('rita.diretoria', 'token-rita');
  autoridade.credenciar('paulo.diretoria', 'token-paulo');
  autoridade.credenciar('sofia.seguranca', 'token-sofia');
  // O diário existia e ninguém o montava fora de um teste: o gate era
  // construído sem ele, nada drenava, e os três atos da aprovação humana —
  // pedido, decisão, vencimento — não chegavam à cadeia em execução nenhuma.
  // A bancada é o sistema montado; se ela não liga, produção também não liga.
  const diario = new DiarioNaTrilha(trilha, { organizationId: 'org-sinergentia' });
  const gate = new GateDeAcesso(autoridade, relogio, JANELAS_PADRAO, diario);

  // O canal é do host. Aqui é o de bancada; numa instalação sem canal, o
  // padrão é `CANAL_AUSENTE`, que recusa a entrega e diz por quê — é o que
  // impede "ninguém foi avisado" de virar silêncio.
  const canal = new CanalEmMemoria();
  const plantao = new PlantaoDeAprovacao({
    fila: gate,
    autoridade,
    papeisConhecidos: ALCADAS_HOSPITALARES.map((alcada) => alcada.papel),
    relogio,
    canal,
    diario
  });

  const ciclo = new CicloDeGovernanca({
    relogio,
    entitlementEngine,
    physicalEngine,
    assuranceEngine: assurance,
    adaptador,
    registros,
    entitlements,
    syncJobs,
    trilha,
    // O ciclo abre o pedido que a política exigiu; decidir continua sendo ato
    // humano, por `aprovarCofre()`.
    aberturaDeAprovacao: gate,
    plantao,
    diarioDeAprovacao: diario,
    // A MESMA lista que montou as regras. Passar outra criaria duas verdades
    // sobre o que é incompatível, e a tela discordaria da porta.
    dominiosDeSegregacao: DOMINIOS_DE_SEGREGACAO_BASE
  });

  const mundo: MundoLogico = {
    organizationId: 'org-sinergentia',
    pessoas: PESSOAS,
    vinculos: vinculosIniciais(),
    papeis: PAPEIS,
    topologia: topologiaInicial(),
    entitlementsVigentes: [],
    // O cofre de psicotrópicos é CRITICAL: a política exige aprovação humana,
    // e o gate exige DUAS pessoas distintas nessa faixa. A aprovação é aberta
    // e decidida em `aprovarCofre()`, contra o material selado.
    aprovacoes: gate
  };

  return {
    relogio,
    simulador,
    adaptador,
    ciclo,
    assurance,
    trilha,
    gate,
    diario,
    plantao,
    canal,
    autoridade,
    registros,
    entitlements,
    syncJobs,
    mundo
  };
}

/** Atualiza o mundo com os direitos vigentes antes do próximo tick. */
export function sincronizarMundo(bancada: Bancada): MundoLogico {
  bancada.mundo = { ...bancada.mundo, entitlementsVigentes: bancada.entitlements.vigentes() };
  return bancada.mundo;
}

/** Avança o relógio, processa o mundo físico e roda um tick do ciclo. */
export async function tick(bancada: Bancada, avancoMs = 0) {
  if (avancoMs > 0) bancada.relogio.avancarMs(avancoMs);
  bancada.simulador.processar(bancada.relogio.agora());
  return bancada.ciclo.executar(sincronizarMundo(bancada));
}

/**
 * Aprovação humana do cofre de psicotrópicos, do jeito que o gate exige.
 *
 * Duas decisões de pessoas DISTINTAS, porque a criticidade é CRITICA. O
 * material é selado antes e conferido depois: se qualquer fato do acesso mudar
 * entre a revisão e a execução, a aprovação para de valer sem que ninguém
 * precise revogá-la.
 */
export async function aprovarCofre(bancada: Bancada, material: MaterialDeRevisao) {
  // O pedido já foi aberto pelo ciclo; `abrir` aqui é idempotente e serve para
  // a bancada funcionar mesmo num cenário que não tenha rodado um tick antes.
  await bancada.gate.abrir(material, 'ciclo-de-governanca');
  await bancada.gate.decidir(material, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Supervisor de segurança precisa de acesso ao cofre no plantão noturno.',
    assinatura: 'token-rita'
  });
  return bancada.gate.decidir(material, {
    decisao: 'APROVADO',
    aprovador: 'paulo.diretoria',
    papel: 'diretoria-administrativa',
    justificativa: 'Segunda aprovação, conforme exigido para criticidade CRITICA.',
    assinatura: 'token-paulo'
  });
}

/** O material pendente do cofre, tal como o motor o montou neste ciclo. */
export function materialDoCofre(relatorio: { pendentesDeAprovacao: readonly { material: MaterialDeRevisao }[] }) {
  const pendente = relatorio.pendentesDeAprovacao.find((a) => a.material.endpointId === 'ep-seg-1');
  if (!pendente) throw new Error('nenhuma pendência de aprovação para ep-seg-1 neste ciclo');
  return pendente.material;
}
