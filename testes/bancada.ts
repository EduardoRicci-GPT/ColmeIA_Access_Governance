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
  ENCAMINHAMENTO_HOSPITALAR,
  EncaminhamentoPorTipo,
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
import {
  Faculdade,
  PedidoAFaculdade,
  RespostaDaFaculdade,
  RoteadorDeFaculdades
} from '../packages/sinergentia';
import { NucleoDeterministico } from '../packages/narrativa/leitura';
import { Relogio } from '../packages/dominio/tempo';
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
import { AtendenteDeAcesso } from '../packages/orquestracao/decisao-online';
import {
  CaminhoDeAcesso,
  CaminhosEmMemoria,
  RestricoesLocaisEmMemoria,
  VinculoSemanticoFisico,
  VinculosEmMemoria
} from '../packages/dominio';
import {
  ConferenciaFederadaEmMemoria,
  DelegacaoDeAutoridade,
  DominioDeAutoridade,
  MesaDeIntervencao,
  RegistroDeIncidentesFisicos,
  RevogabilidadeEmMemoria,
  Tenant
} from '../packages/governanca';
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

// ---------------------------------------------------------------------------
// O QUE O CONSOLIDADO DE OUTUBRO ACRESCENTOU À BANCADA
//
// Os quatro blocos abaixo existem para que os deltas D-051 a D-057 tenham, na
// bancada, quem os chame — e não apenas um teste que os exercite de lado. É a
// regra do D-022 aplicada no mesmo dia em que a capacidade nasce, em vez de
// seis meses depois.
//
// Os valores são escolhidos para serem VERDADEIROS sobre um hospital, não para
// serem convenientes: o cofre de psicotrópicos tem chave mecânica, as portas da
// UTI têm barra antipânico, e isso faz a leitura de exposição dizer coisas
// incômodas sobre esta bancada. Dizer coisas incômodas sobre um hospital real é
// o produto funcionando.
// ---------------------------------------------------------------------------

/**
 * Os caminhos de acesso levantados em campo (D-051).
 *
 * Note o que o levantamento revela, e que nenhum cadastro de credencial
 * revelaria: o cofre de psicotrópicos é CRITICAL, tem biometria, e tem uma
 * chave mecânica — porque toda farmácia hospitalar tem, para o dia em que a
 * eletrônica falhar com um paciente esperando analgesia. A leitura de exposição
 * fica INACEITÁVEL, e está certa: a biometria descreve como entram as pessoas
 * honestas.
 *
 * As portas da UTI e do centro cirúrgico têm barra antipânico. Também FRACA
 * para o controle de acesso, e inegociável para a segurança de vida — é o caso
 * que o módulo trata com `EXIGE_COMPENSACAO` em vez de recusa, porque não há
 * aqui nada a corrigir, e há muito a vigiar.
 */
export const CAMINHOS_DA_BANCADA: readonly CaminhoDeAcesso[] = Object.freeze([
  {
    endpointId: 'ep-seg-1',
    meios: [
      { especie: 'CREDENCIAL', metodo: 'BIOMETRIC' },
      { especie: 'CREDENCIAL', metodo: 'CARD' },
      { especie: 'BYPASS', forma: 'CHAVE_MECANICA' }
    ],
    procedencia: 'LEVANTAMENTO_EM_CAMPO',
    levantadoPor: 'engenharia-clinica',
    observacao: 'Chave mecânica mantida no cofre da farmácia, com livro de retirada.'
  },
  {
    endpointId: 'ep-uti-1',
    meios: [
      { especie: 'CREDENCIAL', metodo: 'CARD' },
      { especie: 'BYPASS', forma: 'BARRA_ANTIPANICO' }
    ],
    procedencia: 'LEVANTAMENTO_EM_CAMPO'
  },
  {
    endpointId: 'ep-uti-2',
    meios: [
      { especie: 'CREDENCIAL', metodo: 'CARD' },
      { especie: 'BYPASS', forma: 'BARRA_ANTIPANICO' }
    ],
    procedencia: 'LEVANTAMENTO_EM_CAMPO'
  },
  {
    endpointId: 'ep-cc-1',
    meios: [
      { especie: 'CREDENCIAL', metodo: 'CARD' },
      { especie: 'BYPASS', forma: 'BARRA_ANTIPANICO' }
    ],
    procedencia: 'LEVANTAMENTO_EM_CAMPO'
  },
  {
    endpointId: 'ep-farm-1',
    meios: [
      { especie: 'CREDENCIAL', metodo: 'CARD' },
      { especie: 'BYPASS', forma: 'CHAVE_MECANICA' }
    ],
    procedencia: 'LEVANTAMENTO_EM_CAMPO'
  },
  {
    endpointId: 'ep-farm-2',
    meios: [
      { especie: 'CREDENCIAL', metodo: 'CARD' },
      { especie: 'BYPASS', forma: 'CHAVE_MECANICA' }
    ],
    procedencia: 'LEVANTAMENTO_EM_CAMPO'
  },
  {
    endpointId: 'ep-dc-1',
    meios: [
      { especie: 'CREDENCIAL', metodo: 'BIOMETRIC' },
      { especie: 'CREDENCIAL', metodo: 'CARD' }
    ],
    procedencia: 'LEVANTAMENTO_EM_CAMPO'
  },
  {
    endpointId: 'ep-adm-1',
    meios: [
      { especie: 'CREDENCIAL', metodo: 'CARD' },
      { especie: 'BYPASS', forma: 'BOTOEIRA_INTERNA' }
    ],
    procedencia: 'LEVANTAMENTO_EM_CAMPO'
  },
  {
    endpointId: 'ep-adm-2',
    meios: [
      { especie: 'CREDENCIAL', metodo: 'CARD' },
      { especie: 'BYPASS', forma: 'BOTOEIRA_INTERNA' }
    ],
    procedencia: 'LEVANTAMENTO_EM_CAMPO'
  },
  {
    endpointId: 'ep-adm-3',
    meios: [
      { especie: 'CREDENCIAL', metodo: 'CARD' },
      { especie: 'BYPASS', forma: 'BOTOEIRA_INTERNA' }
    ],
    procedencia: 'LEVANTAMENTO_EM_CAMPO'
  }
]);

/**
 * Os vínculos semânticos canal–recurso (D-052).
 *
 * Todos VERIFICADOS na versão 1 da configuração, com nome de quem esteve na
 * porta — o estado em que uma instalação bem feita começa. Os cenários que
 * precisam da divergência a produzem como ela acontece no mundo: avançando a
 * versão, que é o que o painel sendo remexido faz.
 */
export function VINCULOS_DA_BANCADA(): VinculoSemanticoFisico[] {
  return ENDPOINTS.map((endpoint, indice) => ({
    id: `VINC-${endpoint.id}`,
    endpointId: endpoint.id,
    capacidade: 'REMOTE_REVOCATION' as const,
    canal: {
      controladorId: endpoint.gatewayId ?? 'gw-central',
      especie: 'RELE' as const,
      indice: String(indice + 1)
    },
    versao: 1,
    estado: 'VERIFICADO' as const,
    versaoVerificada: 1,
    verificadoEm: new Date(INICIO),
    verificadoPor: 'engenharia-clinica',
    evidencia: `OS-2026-${String(indice + 1).padStart(3, '0')} — acionamento conferido no local`
  }));
}

/**
 * Os tenants comerciais e os domínios de autoridade institucional (D-057).
 *
 * `integra-sul` é a integradora que instalou e mantém as fechaduras dos dois
 * hospitais. Ela vê inventário, saúde e chamados — e os domínios de autoridade
 * abaixo não a mencionam, porque não pode mencioná-la: autoridade institucional
 * não nasce de contrato de manutenção.
 *
 * `org-vale-verde` existe nesta bancada por um motivo só: provar que o papel não
 * atravessa organização. A mesma pessoa, o mesmo vínculo, a mesma identidade —
 * e nenhuma autoridade do outro lado.
 */
export const TENANTS_DA_BANCADA: readonly Tenant[] = Object.freeze([
  {
    id: 'tenant-integra-sul',
    nome: 'Integra Sul Sistemas',
    especie: 'INTEGRADORA',
    organizacoesAtendidas: ['org-sinergentia', 'org-vale-verde']
  }
]);

export const DOMINIOS_DE_AUTORIDADE: readonly DominioDeAutoridade[] = Object.freeze([
  {
    id: 'dom-aurora-seguranca',
    organizationId: 'org-sinergentia',
    unidadeIds: [],
    papeisLocais: ['supervisao-de-seguranca', 'gerencia-de-facilities'],
    relationshipIds: ['vin-rui']
  },
  {
    id: 'dom-aurora-diretoria',
    organizationId: 'org-sinergentia',
    unidadeIds: [],
    papeisLocais: ['diretoria-tecnica', 'diretoria-administrativa', 'engenharia-clinica'],
    relationshipIds: ['vin-rita', 'vin-paulo']
  },
  {
    id: 'dom-integra-sul',
    organizationId: 'org-integra-sul',
    unidadeIds: [],
    papeisLocais: ['administracao-de-frota'],
    relationshipIds: ['vin-ivo']
  }
]);

export const DELEGACOES_DE_AUTORIDADE: readonly DelegacaoDeAutoridade[] = Object.freeze([]);

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
  /** Os caminhos de acesso levantados (D-051). */
  caminhos: CaminhosEmMemoria;
  /** O que se sabe sobre revogar, por endpoint (D-055). */
  revogabilidade: RevogabilidadeEmMemoria;
  /** Os vínculos semânticos canal–recurso (D-052). */
  vinculos: VinculosEmMemoria;
  /** As restrições locais dos recursos (D-054). Nasce vazio. */
  restricoes: RestricoesLocaisEmMemoria;
  /** Os incidentes físicos (D-056). Nasce vazio. */
  incidentes: RegistroDeIncidentesFisicos;
  /** A mesa que autoriza intervenção, com conferência federada (D-056 + D-057). */
  mesaDeIntervencao: MesaDeIntervencao;
  /** O atendente da decisão de modo ACCESS — a porta online do ADR-0008. */
  atendente: AtendenteDeAcesso;
  mundo: MundoLogico;
}

/**
 * Faculdade de bancada: reescreve sem inventar, ou inventa de propósito.
 *
 * As duas metades são necessárias. A primeira prova que a cascata entrega prosa
 * quando ela é legítima; a segunda prova que a guarda descarta quando não é — e
 * uma guarda sem teste que a veja reprovar é uma guarda que ninguém sabe se
 * funciona.
 */
export class FaculdadeDeBancada implements Faculdade {
  readonly escola = 'doadora' as const;
  readonly protocolo = 'openai-chat' as const;
  readonly tarefas = ['leitura_por_publico', 'sintese_curta'] as const;
  readonly recebidos: PedidoAFaculdade[] = [];

  constructor(
    readonly id: string,
    readonly nome: string,
    readonly local: boolean,
    private readonly escrever: (pedido: PedidoAFaculdade) => RespostaDaFaculdade | Error
  ) {}

  async responder(pedido: PedidoAFaculdade): Promise<RespostaDaFaculdade> {
    this.recebidos.push(pedido);
    const saida = this.escrever(pedido);
    if (saida instanceof Error) throw saida;
    return saida;
  }
}

/**
 * O roteador da bancada: só o degrau zero.
 *
 * É o padrão de uma instalação que não contratou faculdade nenhuma — e o
 * produto tem de funcionar inteiro assim. Os cenários que exercitam a cascata
 * montam o roteador deles com as faculdades que querem provar.
 */
export function roteadorDeterministico(relogio: Relogio): RoteadorDeFaculdades {
  return new RoteadorDeFaculdades(
    [
      {
        faculdade: new NucleoDeterministico(),
        degrau: 0,
        // Zero por construção: o núcleo não gera frase nova, então não tem como
        // inventar âncora. Não é mérito dele — é o que ele é.
        taxaDeFabricacao: 0,
        prosasVerificadas: 0
      }
    ],
    relogio
  );
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
    // Quem responde por cada TIPO de caso — a segunda porta do host. Sem ela, o
    // produto descobre a divergência, pontua o score, mostra na tela e não
    // chama ninguém.
    encaminhamento: new EncaminhamentoPorTipo(ENCAMINHAMENTO_HOSPITALAR),
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

  // As seis portas do consolidado de outubro, montadas AQUI e não em cada
  // cenário: é o que faz delas parte do sistema, e não de um teste.
  const caminhos = new CaminhosEmMemoria(CAMINHOS_DA_BANCADA);
  const vinculos = new VinculosEmMemoria(VINCULOS_DA_BANCADA());
  const restricoes = new RestricoesLocaisEmMemoria();
  const incidentes = new RegistroDeIncidentesFisicos();
  // O MOCK revoga remotamente, confirma estado físico e tem gateway: é o
  // melhor caso, e é deliberado que a bancada comece nele. Os cenários que
  // precisam do caso ruim o declaram, como a vida declara.
  const revogabilidade = new RevogabilidadeEmMemoria(
    ENDPOINTS.map((endpoint) => ({
      endpointId: endpoint.id,
      revogacaoRemota: true,
      confirmaEstadoFisico: true,
      credenciaisOffline: true,
      temCaminhoDeSincronizacao: endpoint.gatewayId !== undefined,
      minutosTipicosDeSincronizacao: 5
    }))
  );
  const mesaDeIntervencao = new MesaDeIntervencao(
    autoridade,
    new ConferenciaFederadaEmMemoria(DOMINIOS_DE_AUTORIDADE, DELEGACOES_DE_AUTORIDADE)
  );
  const atendente = new AtendenteDeAcesso(policy, relogio, false);

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
    dominiosDeSegregacao: DOMINIOS_DE_SEGREGACAO_BASE,
    // As quatro leituras de outubro chegam ao ciclo pelas portas do host.
    // Ligá-las na bancada é o que impede que elas sejam capacidade correta sem
    // chamador — e o que faz o Health Score desta bancada responder por elas.
    revogabilidade,
    caminhos,
    vinculosSemanticos: vinculos,
    incidentesFisicos: incidentes
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
    aprovacoes: gate,
    // Nasce vazio, e isso NÃO fecha porta nenhuma: é a única consulta deste
    // mundo cuja ausência é otimista, pela razão escrita em
    // `dominio/restricao-local.ts`.
    restricoesLocais: restricoes
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
    caminhos,
    revogabilidade,
    vinculos,
    restricoes,
    incidentes,
    mesaDeIntervencao,
    atendente,
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
