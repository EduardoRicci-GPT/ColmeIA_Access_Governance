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
  EscopoDeDelegacao,
  EXIGENCIAS_HOSPITALARES,
  GateDeAcesso,
  JANELAS_PADRAO,
  MaterialDeRevisao,
  PlantaoDeAprovacao,
  RegistroDeCompetencias,
  RegistroDeQuebraDeVidro,
  RegistroDeResponsabilidades
} from '../packages/governanca';
import { Endpoint, Gateway, NoDeHierarquia, ProviderConnection, Topologia } from '../packages/dominio/topologia';
import { Person, Relationship, Role } from '../packages/dominio/entitlement';
import { HabilitacaoDaPessoa } from '../packages/governanca';
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

/**
 * Escopos de delegação de referência.
 *
 * Note o que a supervisão da UTI NÃO alcança: a Área de Segurança Excepcional
 * (CRITICAL) e o Datacenter. Um mecanismo de exceção sem limite é o caminho
 * mais curto para contornar toda a política — bastaria um supervisor
 * complacente para que qualquer pessoa chegasse a qualquer lugar.
 */
export const ESCOPOS_DE_DELEGACAO: readonly EscopoDeDelegacao[] = Object.freeze([
  {
    id: 'escopo-supervisao-uti',
    autoridade: 'sofia.seguranca',
    organizationId: 'org-sinergentia',
    facilityId: 'hosp-aurora',
    zonas: ['z-uti'],
    tiposPermitidos: ['APOIO_ASSISTENCIAL', 'COBERTURA_TEMPORARIA', 'APOIO_EMERGENCIAL'],
    duracaoMaximaMinutos: 12 * 60,
    criticidadeMaxima: 'HIGH'
  },
  {
    id: 'escopo-facilities',
    autoridade: 'paulo.diretoria',
    organizationId: 'org-sinergentia',
    facilityId: 'hosp-aurora',
    zonas: ['z-uti', 'z-farmacia', 'z-admin', 'z-datacenter'],
    tiposPermitidos: ['APOIO_TECNICO', 'COBERTURA_TEMPORARIA'],
    duracaoMaximaMinutos: 4 * 60,
    criticidadeMaxima: 'HIGH',
    // Mesmo dentro das zonas, o cofre não é designável por esta autoridade.
    recursosProibidos: ['z-seguranca']
  }
]);

/**
 * Habilitações de referência.
 *
 * Eduardo tem registro de enfermagem vigente e trabalha na UTI, que o exige.
 * Marina tem NR-32 e trabalha na farmácia, que o exige. Clara é do
 * administrativo, cuja zona não declara exigência nenhuma — e por isso ela
 * atravessa o dia sem que competência se aplique. É o caso mais comum num
 * hospital, e o que mais erra quem confunde exigência ausente com evidência
 * ausente.
 */
export function HABILITACOES_DA_BANCADA(): HabilitacaoDaPessoa[] {
  return [
    {
      personId: 'p-eduardo',
      competenciaId: 'registro-de-enfermagem',
      estado: 'VIGENTE',
      validaAte: new Date('2027-03-31T00:00:00'),
      referenciaDoRegistro: 'ref-coren-0001',
      verificadoEm: new Date('2026-09-01T00:00:00')
    },
    {
      personId: 'p-marina',
      competenciaId: 'nr-32',
      estado: 'VIGENTE',
      validaAte: new Date('2027-06-30T00:00:00'),
      verificadoEm: new Date('2026-09-01T00:00:00')
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
  responsabilidades: RegistroDeResponsabilidades;
  competencias: RegistroDeCompetencias;
  emergencias: RegistroDeQuebraDeVidro;
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

  // A quebra de vidro é do host: quem afirma emergência é a pessoa que está
  // lá. A bancada monta o registro para que a exceção exista no sistema
  // montado, e não apenas em teste.
  const emergencias = new RegistroDeQuebraDeVidro(relogio, undefined, diario);

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
    // O registro de emergências entra no plantão, e é por isso que ele é
    // construído antes dele: sem esta linha, o vidro quebra às 02h40 e o
    // produto não chama ninguém — que é o defeito que o ADR-0023 declarou em
    // aberto ao ser escrito.
    emergencias,
    diario
  });

  // Os escopos de delegação da instalação. O supervisor da UTI designa apoio à
  // UTI e nada além dela; a gerência de facilities alcança mais zonas e para
  // antes da faixa crítica. Sem escopo declarado, nenhuma autoridade designa.
  // As habilitações vêm do host. Aqui, a bancada declara as de referência — e
  // declara também a de quem NÃO tem, porque é isso que o cenário testa.
  const competencias = new RegistroDeCompetencias(
    relogio,
    HABILITACOES_DA_BANCADA(),
    EXIGENCIAS_HOSPITALARES
  );

  // O registro de responsabilidades CONFERE a habilitação em vez de aceitar a
  // palavra de quem pede — o laço que o ADR-0020 deixou declarado em aberto.
  const responsabilidades = new RegistroDeResponsabilidades(
    relogio,
    ESCOPOS_DE_DELEGACAO,
    diario,
    competencias
  );

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
    // As responsabilidades temporárias entram ao lado da lotação, nunca
    // dentro dela: o RH continua dizendo a verdade do RH.
    responsabilidades,
    competencias,
    emergencias,
    // O MESMO registro, pela porta larga. Duas portas sobre um objeto é como
    // este produto diz, no tipo, que o motor de política não pode ver o
    // histórico: só a observabilidade pode.
    historicoDeEmergencias: emergencias,
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
    responsabilidades,
    competencias,
    emergencias,
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
