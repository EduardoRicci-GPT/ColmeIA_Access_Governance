// ---------------------------------------------------------------------------
// OS SETE DELTAS DO CONSOLIDADO DE 10/10/2026
//
// Cada grupo abaixo guarda UMA afirmação do consolidado, e guarda sobretudo o
// que ela NEGA. É a diferença entre testar que o objeto novo existe e testar
// que o defeito antigo não volta:
//
//   D-051  uma credencial forte não descreve uma porta com chave mecânica.
//   D-052  o fabricante confirma o canal; só o campo confirma a porta.
//   D-053  um identificador observado não é prova de autorização.
//   D-054  restrição local suspende o exercício e NÃO revoga o direito.
//   D-055  emitir é assumir uma janela que a revogação não encurta.
//   D-056  observar não autoriza intervir.
//   D-057  visibilidade comercial não é autoridade institucional.
//
// E o último grupo é o que o D-022 exige: a bancada montada exerce as sete
// leituras, porque uma capacidade que só o teste chama é uma capacidade que não
// existe em produção.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, proximo, verificar } from './runner';
import {
  CAMINHOS_DA_BANCADA,
  DELEGACOES_DE_AUTORIDADE,
  DOMINIOS_DE_AUTORIDADE,
  INICIO,
  TENANTS_DA_BANCADA,
  aprovarCofre,
  montarBancada,
  tick
} from './bancada';
import {
  CaminhoDeAcesso,
  avaliarExposicao,
  avaliarProva,
  derivarPerfilDeRevogabilidade,
  forcaDoCaminho,
  frasePosRevogacao,
  lerExercicio,
  oQueFaltaParaEntrar,
  projetarVinculo,
  provaSustentaDecisao,
  reavaliarVinculo,
  RestricaoLocalDoRecurso,
  RestricoesLocaisEmMemoria,
  VinculoSemanticoFisico
} from '../packages/dominio';
import { limitarConfianca } from '../packages/physical-state-reconciliation/tipos';
import {
  abrirIncidente,
  autoridadeEfetiva,
  avaliarCondicao,
  avaliarEmissao,
  capacidadeDeRevogacaoDe,
  lerTetosResiduais,
  MaterialDeIntervencao,
  ObservacaoFisica,
  ordemDeIntervencao,
  PedidoDeIntervencao,
  podeDecidirNaOrganizacao,
  projetarIncidente,
  severidadeDoIncidente,
  vazamentoDeVisibilidade,
  visibilidadeDe
} from '../packages/governanca';
import { PolicyEngine, REGRAS_HOSPITALARES_BASE } from '../packages/policy-engine';
import { PhysicalStateReconciliationEngine } from '../packages/physical-state-reconciliation';
import { RelogioFixo } from '../packages/dominio/tempo';
import { ESTADO_DE_TENTATIVAS_INICIAL } from '../packages/dominio/escalonamento';
import { AtendenteDeAcesso } from '../packages/orquestracao/decisao-online';

const AGORA = new Date(INICIO);

// ===========================================================================
grupo('D-051 · a porta é tão forte quanto o seu elo mais fraco');
// ===========================================================================

const cofre = CAMINHOS_DA_BANCADA.find((c) => c.endpointId === 'ep-seg-1');
verificar('o cofre de psicotrópicos tem o caminho levantado', cofre !== undefined);

const forcaDoCofre = forcaDoCaminho(cofre!);
igual('e a força do caminho é FRACA, não FORTE', forcaDoCofre.forca, 'FRACA');
igual(
  'porque o elo mais fraco é a chave mecânica, e não a biometria',
  forcaDoCofre.eloMaisFraco?.especie === 'BYPASS' ? forcaDoCofre.eloMaisFraco.forma : '—',
  'CHAVE_MECANICA'
);
const exposicaoDoCofre = avaliarExposicao('CRITICAL', cofre!);
igual('num recurso CRITICAL isso é INACEITAVEL', exposicaoDoCofre.nivel, 'INACEITAVEL');
verificar(
  'e a explicação nomeia o elo, em vez de dar uma nota',
  exposicaoDoCofre.explicacao.includes('CHAVE_MECANICA')
);

const uti = CAMINHOS_DA_BANCADA.find((c) => c.endpointId === 'ep-uti-1')!;
const exposicaoDaUti = avaliarExposicao('HIGH', uti);
igual(
  'a barra antipânico da UTI não é defeito a corrigir: exige compensação',
  exposicaoDaUti.nivel,
  'EXIGE_COMPENSACAO'
);
verificar(
  'e a explicação manda compensar, dizendo explicitamente que não há ordem de remover',
  exposicaoDaUti.explicacao.includes('exposição a compensar') &&
    exposicaoDaUti.explicacao.includes('Não há aqui ordem de remover')
);
verificar(
  'a leitura marca o bypass como exigido por segurança de vida',
  forcaDoCaminho(uti).bypassDeVida.includes('BARRA_ANTIPANICO')
);

const naoLevantado: CaminhoDeAcesso = {
  endpointId: 'ep-novo',
  meios: [],
  procedencia: 'PRESUMIDA'
};
igual(
  'caminho não levantado NÃO é caminho forte',
  forcaDoCaminho(naoLevantado).forca,
  'NAO_AVALIADA'
);
igual(
  'e num recurso HIGH ele vira trabalho a fazer, não nota a dar',
  avaliarExposicao('HIGH', naoLevantado).nivel,
  'EXIGE_COMPENSACAO'
);
igual(
  'num recurso LOW permanece não avaliado, sem fingir',
  avaliarExposicao('LOW', naoLevantado).nivel,
  'NAO_AVALIADA'
);

const presumido: CaminhoDeAcesso = {
  endpointId: 'ep-presumido',
  meios: [{ especie: 'CREDENCIAL', metodo: 'BIOMETRIC' }],
  procedencia: 'PRESUMIDA'
};
igual(
  'biometria presumida em recurso HIGH não é aceitável: a presunção não é levantamento',
  avaliarExposicao('HIGH', presumido).nivel,
  'EXIGE_COMPENSACAO'
);
igual(
  'a mesma biometria, levantada em campo, é aceitável',
  avaliarExposicao('HIGH', { ...presumido, procedencia: 'LEVANTAMENTO_EM_CAMPO' }).nivel,
  'ACEITAVEL'
);

// ===========================================================================
grupo('D-055 · emitir é assumir uma janela que a revogação não encurta');
// ===========================================================================

const tetos = lerTetosResiduais();
verificar('os tetos de janela residual estão em SOMBRA', tetos.emSombra);
igual('o teto de um recurso CRITICAL é de 60 min', tetos.tetos.CRITICAL, 60);
igual('e um recurso LOW não tem teto declarado', tetos.tetos.LOW, null);

const pinOffline = derivarPerfilDeRevogabilidade({
  endpointId: 'ep-seg-1',
  metodo: 'PIN',
  capacidade: {
    revogacaoRemota: false,
    confirmaEstadoFisico: false,
    credenciaisOffline: true,
    temCaminhoDeSincronizacao: false
  },
  emitidaEm: AGORA
});
igual(
  'PIN offline sem sincronização e sem expiração é IRREVOGAVEL_ATE_EXPIRAR',
  pinOffline.modo,
  'IRREVOGAVEL_ATE_EXPIRAR'
);
igual('e a janela residual não é longa: é sem término previsto', pinOffline.janelaResidual.minutos, null);

const recusa = avaliarEmissao(
  {
    endpointId: 'ep-seg-1',
    nomeDoEndpoint: 'Cofre de psicotrópicos',
    criticidade: 'CRITICAL',
    metodo: 'PIN',
    emitidaEm: AGORA,
    capacidade: {
      revogacaoRemota: false,
      confirmaEstadoFisico: false,
      credenciaisOffline: true,
      temCaminhoDeSincronizacao: false
    },
    caminho: cofre
  },
  tetos
);
igual('emitir esse PIN no cofre CRITICAL é RECUSA', recusa.veredito, 'RECUSA');
verificar(
  'e a recusa é estrutural, não calibragem: a explicação diz que não se pede a chave de volta',
  recusa.explicacao.includes('pedir de volta')
);
verificar(
  'a recusa oferece caminhos em vez de só fechar',
  recusa.explicacao.includes('declarar expiração')
);

const comExpiracao = avaliarEmissao(
  {
    endpointId: 'ep-seg-1',
    nomeDoEndpoint: 'Cofre de psicotrópicos',
    criticidade: 'CRITICAL',
    metodo: 'PIN',
    emitidaEm: AGORA,
    expiraEm: new Date(AGORA.getTime() + 90 * 24 * 60 * 60_000),
    capacidade: {
      revogacaoRemota: false,
      confirmaEstadoFisico: false,
      credenciaisOffline: true,
      temCaminhoDeSincronizacao: false
    },
    caminho: cofre
  },
  tetos
);
igual('o mesmo PIN com 90 dias de expiração deixa de ser recusa', comExpiracao.veredito, 'EXIGE_APROVACAO');
igual('e passa a ser uma janela de 129.600 min', comExpiracao.janelaResidual.minutos, 129_600);
verificar('que estoura o teto do recurso', comExpiracao.excedeuTeto);
verificar(
  'o veredito carrega a ressalva de calibragem dos tetos',
  comExpiracao.ressalvas.length > 0
);

const boaEmissao = avaliarEmissao(
  {
    endpointId: 'ep-dc-1',
    nomeDoEndpoint: 'Datacenter — rack principal',
    criticidade: 'HIGH',
    metodo: 'BIOMETRIC',
    emitidaEm: AGORA,
    capacidade: {
      revogacaoRemota: true,
      confirmaEstadoFisico: true,
      credenciaisOffline: false,
      temCaminhoDeSincronizacao: true,
      minutosTipicosDeSincronizacao: 5
    },
    caminho: CAMINHOS_DA_BANCADA.find((c) => c.endpointId === 'ep-dc-1')
  },
  tetos
);
igual('biometria com revogação confirmada e gateway PERMITE', boaEmissao.veredito, 'PERMITE');
igual('com janela de 5 min', boaEmissao.janelaResidual.minutos, 5);

verificar(
  'a frase pós-revogação de um modo sem confirmação não afirma que a porta fechou',
  frasePosRevogacao({ ...pinOffline, modo: 'REMOTA_SEM_CONFIRMACAO' }).includes('não tem evidência')
);
verificar(
  'e a do modo irrevogável diz que a ordem não alcança o equipamento',
  frasePosRevogacao(pinOffline).includes('não alcança o equipamento')
);

const capacidadeSemGateway = capacidadeDeRevogacaoDe(
  {
    cloudApi: true,
    mobileSdk: false,
    localBle: true,
    gatewaySupport: true,
    webhookEvents: false,
    pollingEvents: true,
    offlineCredentials: true,
    remoteRevocation: true,
    remoteUnlock: true,
    bulkSync: true,
    userManagement: true,
    credentialManagement: true,
    physicalStateReconciliation: false,
    onlineDecision: false
  },
  { temGateway: false }
);
verificar(
  'API na nuvem não é caminho de sincronização: ela alcança a nuvem, não a fechadura',
  capacidadeSemGateway.temCaminhoDeSincronizacao === false
);

// ===========================================================================
grupo('D-052 · o fabricante confirma o canal, o campo confirma a porta');
// ===========================================================================

const vinculoVerificado: VinculoSemanticoFisico = {
  id: 'VINC-TESTE',
  endpointId: 'ep-uti-1',
  capacidade: 'REMOTE_REVOCATION',
  canal: { controladorId: 'gw-central', especie: 'RELE', indice: '2' },
  versao: 3,
  estado: 'VERIFICADO',
  versaoVerificada: 3,
  verificadoEm: AGORA,
  verificadoPor: 'engenharia-clinica'
};
igual('verificado na versão corrente permanece VERIFICADO', reavaliarVinculo(vinculoVerificado, 3).estado, 'VERIFICADO');

const envelhecido = reavaliarVinculo(vinculoVerificado, 4);
igual('o painel remexido faz a verificação envelhecer: DIVERGENTE', envelhecido.estado, 'DIVERGENTE');
verificar('e ninguém precisou lembrar de invalidá-la', envelhecido.verificacaoEnvelhecida);
verificar(
  'a explicação nomeia as duas versões',
  envelhecido.explicacao.includes('versão 3') && envelhecido.explicacao.includes('versão 4')
);

igual(
  'verificação sem versão registrada cai para DECLARADO: não é ancorável',
  reavaliarVinculo({ ...vinculoVerificado, versaoVerificada: undefined }).estado,
  'DECLARADO'
);

igual('vínculo verificado permite confiança CONFIRMED', limitarConfianca('CONFIRMED', 'VERIFICADO'), 'CONFIRMED');
igual('vínculo apenas declarado limita a PROBABLE', limitarConfianca('CONFIRMED', 'DECLARADO'), 'PROBABLE');
igual('vínculo divergente limita a UNKNOWN', limitarConfianca('CONFIRMED', 'DIVERGENTE'), 'UNKNOWN');
igual('vínculo não verificado limita a UNKNOWN', limitarConfianca('CONFIRMED', 'NAO_VERIFICADO'), 'UNKNOWN');
igual(
  'e vínculo ausente NÃO rebaixa nada: a cobrança é do score, não do rebaixamento silencioso',
  limitarConfianca('CONFIRMED', undefined),
  'CONFIRMED'
);

const relogioFisico = new RelogioFixo(INICIO);
const motorFisico = new PhysicalStateReconciliationEngine(relogioFisico);
const entradaCoerente = {
  endpointId: 'ep-uti-1',
  credentialId: 'CRED-TESTE',
  criticidade: 'HIGH' as const,
  estado: {
    desiredState: 'ENTITLEMENT_ACTIVE' as const,
    cloudState: 'CLOUD_GRANT_CREATED' as const,
    providerState: 'PROVIDER_GRANT_ACCEPTED' as const,
    deviceState: 'DEVICE_GRANT_CONFIRMED' as const,
    lastConfirmedState: 'DEVICE_GRANT_CONFIRMED' as const,
    lastSyncAt: new Date(INICIO)
  },
  conectividadeDoEndpoint: 'ONLINE' as const,
  statusDoProvedor: 'ONLINE' as const,
  tentativas: { ...ESTADO_DE_TENTATIVAS_INICIAL }
};

const comVinculoBom = motorFisico.reconciliar({ ...entradaCoerente, vinculoSemantico: 'VERIFICADO' });
igual('tudo coerente com vínculo verificado: confiança CONFIRMED', comVinculoBom.confidence, 'CONFIRMED');
igual('e nada a fazer', comVinculoBom.action, 'NONE');

const comVinculoRuim = motorFisico.reconciliar({ ...entradaCoerente, vinculoSemantico: 'NAO_VERIFICADO' });
igual(
  'tudo coerente, e ninguém sabe se é esta porta: o estado é DESCONHECIDO',
  comVinculoRuim.estadoSemantico,
  'DEVICE_SYNC_UNKNOWN'
);
igual('a confiança é UNKNOWN', comVinculoRuim.confidence, 'UNKNOWN');
igual('a ação é VERIFY', comVinculoRuim.action, 'VERIFY');
igual(
  'e a natureza tem nome próprio',
  comVinculoRuim.natureza,
  'VINCULO_SEMANTICO_NAO_VERIFICADO'
);
verificar(
  'a frase diz que a evidência é verdadeira e é sobre outro objeto',
  comVinculoRuim.reason.includes('não é sobre esta porta')
);

const divergenciaReal = motorFisico.reconciliar({
  ...entradaCoerente,
  estado: { ...entradaCoerente.estado, desiredState: 'ENTITLEMENT_REVOKED' },
  vinculoSemantico: 'NAO_VERIFICADO'
});
igual(
  'uma revogação que não chegou continua dominando o vínculo não verificado',
  divergenciaReal.estadoSemantico,
  'DEVICE_REVOCATION_PENDING'
);
igual('e a confiança dela também é limitada pelo vínculo', divergenciaReal.confidence, 'UNKNOWN');

igual(
  'a projeção leva o estado REAVALIADO, não o gravado',
  projetarVinculo(vinculoVerificado, 9).estado,
  'DIVERGENTE'
);

// ===========================================================================
grupo('D-054 · a restrição local suspende o exercício e não revoga o direito');
// ===========================================================================

function restricao(parcial: Partial<RestricaoLocalDoRecurso> = {}): RestricaoLocalDoRecurso {
  return {
    id: 'RES-1',
    zonaId: 'z-uti',
    especie: 'PROCEDIMENTO_EM_CURSO',
    efeito: 'SUSPENDE_EXERCICIO',
    janela: { inicio: new Date(AGORA.getTime() - 60_000) },
    papeisQueAtravessam: [],
    declaradaPor: 'coordenacao-de-enfermagem',
    declaradaEm: AGORA,
    motivo: 'procedimento em curso no leito 3',
    ...parcial
  };
}

const semRestricao = lerExercicio({
  endpointId: 'ep-uti-1',
  zonaId: 'z-uti',
  papeis: ['role-enfermagem-uti'],
  agora: AGORA,
  restricoes: []
});
igual('sem restrição declarada o exercício é NAO_AVALIADO', semRestricao.exercicio, 'NAO_AVALIADO');
verificar(
  'e a frase não finge que isso é liberação por decisão',
  semRestricao.explicacao.includes('não é o mesmo que estar liberado')
);

const suspenso = lerExercicio({
  endpointId: 'ep-uti-1',
  zonaId: 'z-uti',
  papeis: ['role-enfermagem-uti'],
  agora: AGORA,
  restricoes: [restricao()]
});
igual('procedimento em curso suspende o exercício', suspenso.exercicio, 'SUSPENSO_LOCALMENTE');
verificar(
  'e a frase diz, com estas palavras, que nada foi revogado',
  suspenso.explicacao.includes('Nada foi revogado')
);
verificar(
  'e que a entrada volta sem reemissão',
  suspenso.explicacao.includes('sem reemissão')
);

const atravessou = lerExercicio({
  endpointId: 'ep-uti-1',
  zonaId: 'z-uti',
  papeis: ['role-enfermagem-uti'],
  agora: AGORA,
  restricoes: [restricao({ papeisQueAtravessam: ['role-enfermagem-uti'] })]
});
igual('o papel que atravessa entra', atravessou.exercicio, 'EXERCIVEL');
igual('e a travessia fica registrada', atravessou.atravessadas.length, 1);
igual('sem apagar a restrição', atravessou.restricoes.length, 1);

const duas = lerExercicio({
  endpointId: 'ep-uti-1',
  zonaId: 'z-uti',
  papeis: ['role-manutencao'],
  agora: AGORA,
  restricoes: [
    restricao({ id: 'RES-A', especie: 'MANUTENCAO_PROGRAMADA', papeisQueAtravessam: ['role-manutencao'] }),
    restricao({ id: 'RES-B', especie: 'INTERDICAO_SANITARIA' })
  ]
});
igual(
  'atravessar a manutenção não atravessa a interdição sanitária',
  duas.exercicio,
  'SUSPENSO_LOCALMENTE'
);

const corroboracao = lerExercicio({
  endpointId: 'ep-uti-1',
  zonaId: 'z-uti',
  papeis: ['role-manutencao'],
  agora: AGORA,
  restricoes: [restricao({ especie: 'PRIVACIDADE_DO_PACIENTE', efeito: 'EXIGE_CORROBORACAO' })]
});
igual('a privacidade do paciente pede um segundo fato', corroboracao.exercicio, 'EXIGE_CORROBORACAO');

const vencida = lerExercicio({
  endpointId: 'ep-uti-1',
  zonaId: 'z-uti',
  papeis: [],
  agora: AGORA,
  restricoes: [
    restricao({
      janela: { inicio: new Date(AGORA.getTime() - 7_200_000), fim: new Date(AGORA.getTime() - 3_600_000) }
    })
  ]
});
igual('restrição vencida não incide', vencida.exercicio, 'EXERCIVEL');

const semEscopo = lerExercicio({
  endpointId: 'ep-uti-1',
  zonaId: 'z-uti',
  papeis: [],
  agora: AGORA,
  restricoes: [restricao({ zonaId: undefined, endpointId: undefined })]
});
igual(
  'restrição sem escopo não incide sobre tudo: cadastro incompleto não é bloqueio geral',
  semEscopo.exercicio,
  'EXERCIVEL'
);

const motor = new PolicyEngine(REGRAS_HOSPITALARES_BASE);
const pedidoBase = {
  personId: 'p-eduardo',
  relationshipId: 'vin-eduardo',
  endpointId: 'ep-uti-1',
  momento: AGORA,
  origem: 'COLMEIA_POLICY_ENGINE' as const,
  contexto: {
    organizationId: 'org-sinergentia',
    facilityId: 'hosp-aurora',
    zonaId: 'z-uti',
    criticidadeDoEndpoint: 'HIGH' as const,
    papeis: ['role-enfermagem-uti'],
    unidadesLotadas: ['z-uti'],
    zonasAutorizadas: ['z-uti'],
    vinculoVigente: true,
    turnoVigente: true
  }
};

const emAccess = motor.decidir({
  ...pedidoBase,
  id: 'PED-ACCESS',
  modo: 'ACCESS',
  contexto: {
    ...pedidoBase.contexto,
    exercicioLocal: 'SUSPENSO_LOCALMENTE',
    especiesDeRestricaoLocal: ['PROCEDIMENTO_EM_CURSO']
  }
});
igual('em modo ACCESS a restrição local nega o instante', emAccess.efeito, 'DENY');
verificar('e a regra que venceu é a da restrição local', emAccess.regrasAplicadas.includes('R-RESTRICAO-LOCAL'));
verificar(
  'a justificativa diz que o direito permanece vigente',
  emAccess.razao.includes('direito permanece vigente')
);

const emEntitlement = motor.decidir({
  ...pedidoBase,
  id: 'PED-ENT',
  modo: 'ENTITLEMENT',
  contexto: {
    ...pedidoBase.contexto,
    exercicioLocal: 'SUSPENSO_LOCALMENTE',
    especiesDeRestricaoLocal: ['PROCEDIMENTO_EM_CURSO']
  }
});
igual('em modo ENTITLEMENT a MESMA restrição não decide nada', emEntitlement.efeito, 'ALLOW');
verificar(
  'nenhuma regra de restrição local foi aplicada ao direito',
  !emEntitlement.regrasAplicadas.some((r) => r.startsWith('R-RESTRICAO-LOCAL'))
);

const bloqueioLocal = motor.decidir({
  ...pedidoBase,
  id: 'PED-BLOQUEIO',
  modo: 'ACCESS',
  contexto: {
    ...pedidoBase.contexto,
    quebraDeVidroAtiva: true,
    exercicioLocal: 'SUSPENSO_LOCALMENTE',
    especiesDeRestricaoLocal: ['BLOQUEIO_LOCAL_DO_EQUIPAMENTO']
  }
});
igual('nem a quebra de vidro atravessa um bloqueio acionado na própria porta', bloqueioLocal.efeito, 'DENY');
verificar(
  'e a frase explica por que: a tela não promete o que a fechadura não cumpre',
  bloqueioLocal.razao.includes('pararia de procurar')
);

const corroboracaoNaPolitica = motor.decidir({
  ...pedidoBase,
  id: 'PED-CORROB',
  modo: 'ACCESS',
  contexto: { ...pedidoBase.contexto, exercicioLocal: 'EXIGE_CORROBORACAO' }
});
igual('a corroboração vai para revisão humana, e não para negativa', corroboracaoNaPolitica.efeito, 'REQUIRE_APPROVAL');

const suspensoVenceCorroboracao = motor.decidir({
  ...pedidoBase,
  id: 'PED-ESCADA',
  modo: 'ACCESS',
  contexto: { ...pedidoBase.contexto, exercicioLocal: 'SUSPENSO_LOCALMENTE', provaDeIdentificador: 'APENAS_OBSERVADA' }
});
igual(
  'a escada de prioridades mantém a negativa acima da exigência de revisão',
  suspensoVenceCorroboracao.efeito,
  'DENY'
);

// ===========================================================================
grupo('D-053 · identificador observado não é prova de autorização');
// ===========================================================================

const placa = {
  id: 'OBS-1',
  especie: 'PLACA_DE_VEICULO' as const,
  valorProjetado: 'ABC-1***',
  observadoEm: AGORA,
  sensorId: 'cam-portaria-servico',
  confiancaDoSensor: 0.98
};

const soObservado = avaliarProva({ endpointId: 'ep-adm-1', agora: AGORA, observado: placa });
igual('uma placa reconhecida é APENAS_OBSERVADA', soObservado.prova, 'APENAS_OBSERVADA');
verificar('e isso não sustenta decisão de acesso', !provaSustentaDecisao(soObservado.prova));
verificar(
  'a explicação diz por que a confiança do sensor não muda isso',
  soObservado.explicacao.includes('clonar placa')
);

const comConfiancaMaxima = avaliarProva({
  endpointId: 'ep-adm-1',
  agora: AGORA,
  observado: { ...placa, confiancaDoSensor: 1 }
});
igual('nem com confiança 1,0 a observação vira prova', comConfiancaMaxima.prova, 'APENAS_OBSERVADA');

const provada = avaliarProva({
  endpointId: 'ep-adm-1',
  agora: AGORA,
  observado: placa,
  apresentada: {
    credentialId: 'CRED-MOTORISTA',
    metodo: 'CARD',
    endpointId: 'ep-adm-1',
    apresentadaEm: new Date(AGORA.getTime() + 60_000)
  },
  vinculo: {
    credentialId: 'CRED-MOTORISTA',
    relationshipId: 'vin-jonas',
    personId: 'p-jonas',
    vinculadoEm: new Date(AGORA.getTime() - 86_400_000),
    vinculadoPor: 'portaria'
  }
});
igual('credencial apresentada e vinculada é PROVADA', provada.prova, 'PROVADA');
verificar('e a observação do sensor corrobora', provada.corroborado);
verificar(
  'a explicação diz que a prova não depende do sensor',
  provada.explicacao.includes('corroborar é o uso correto')
);

const semVinculo = avaliarProva({
  endpointId: 'ep-adm-1',
  agora: AGORA,
  apresentada: {
    credentialId: 'CRED-ORFA',
    metodo: 'CARD',
    endpointId: 'ep-adm-1',
    apresentadaEm: AGORA
  }
});
igual('credencial sem vínculo de portador não prova nada', semVinculo.prova, 'NAO_PROVADA');
verificar(
  'porque um objeto que abre a porta não responde por nada',
  semVinculo.explicacao.includes('não responde por nada')
);

const credencialTrocada = avaliarProva({
  endpointId: 'ep-adm-1',
  agora: AGORA,
  apresentada: {
    credentialId: 'CRED-A',
    metodo: 'CARD',
    endpointId: 'ep-adm-1',
    apresentadaEm: AGORA
  },
  vinculo: {
    credentialId: 'CRED-B',
    relationshipId: 'vin-jonas',
    personId: 'p-jonas',
    vinculadoEm: AGORA,
    vinculadoPor: 'portaria'
  }
});
igual('vínculo de outra credencial não prova', credencialTrocada.prova, 'NAO_PROVADA');

const faltaParaEntrar = oQueFaltaParaEntrar(soObservado, {
  id: 'veic-1',
  placaProjetada: 'ABC-1***',
  transportadoraId: 'transp-residuos',
  ordemDeServicoId: 'OS-4471',
  missao: 'coleta de resíduo infectante'
});
verificar('a portaria recebe o que falta, e não um "não autorizado"', faltaParaEntrar.includes('OS-4471'));
verificar('com a missão nomeada', faltaParaEntrar.includes('coleta de resíduo infectante'));

const naPolitica = motor.decidir({
  ...pedidoBase,
  id: 'PED-PLACA',
  modo: 'ACCESS',
  contexto: { ...pedidoBase.contexto, provaDeIdentificador: 'APENAS_OBSERVADA' }
});
igual('a observação CONVOCA conferência, não concede nem nega', naPolitica.efeito, 'REQUIRE_APPROVAL');
verificar(
  'e a regra que venceu é a da prova',
  naPolitica.regrasAplicadas.includes('R-PROVA-DE-IDENTIFICADOR')
);

// ===========================================================================
grupo('D-056 · observar não autoriza intervir');
// ===========================================================================

const observacaoDeSensor: ObservacaoFisica = {
  id: 'OBS-GAS-1',
  sistemaId: 'rede-o2-bloco-cirurgico',
  especie: 'GASES_MEDICINAIS',
  zonaId: 'z-cc',
  observadoEm: AGORA,
  origem: 'SENSOR',
  observadoPor: 'sensor-pressao-o2-cc',
  relato: 'pressão de linha em 3,2 bar',
  medida: { grandeza: 'pressao', valor: 3.2, unidade: 'bar' }
};
const observacaoDeModelo: ObservacaoFisica = {
  id: 'OBS-GAS-2',
  sistemaId: 'rede-o2-bloco-cirurgico',
  especie: 'GASES_MEDICINAIS',
  zonaId: 'z-cc',
  observadoEm: AGORA,
  origem: 'MODELO',
  observadoPor: 'faculdade-de-triagem',
  relato: 'a série de leituras sugere queda sustentada, e não deriva de sensor'
};

const avaliacaoSoDeModelo = avaliarCondicao({
  id: 'AVAL-1',
  observacoes: [observacaoDeModelo],
  condicao: 'ANORMAL',
  criterio: 'leitura do modelo sobre a série das últimas seis horas',
  avaliadaPor: 'faculdade-de-triagem',
  avaliadaEm: AGORA,
  avaliacaoDeModelo: true
});
verificar('avaliação sustentada só por modelo é marcada como tal', avaliacaoSoDeModelo.exigeFatoNaoModelado);

const recusaDeAbertura = abrirIncidente({
  id: 'INC-1',
  avaliacao: avaliacaoSoDeModelo.avaliacao,
  observacoes: [observacaoDeModelo],
  sistemaId: 'rede-o2-bloco-cirurgico',
  especie: 'GASES_MEDICINAIS',
  zonaId: 'z-cc',
  abertoPor: 'faculdade-de-triagem',
  abertoEm: AGORA
});
igual('um incidente CRÍTICO não nasce de prosa', recusaDeAbertura.incidente, null);
igual('e a recusa tem nome', recusaDeAbertura.recusa, 'SOMENTE_MODELO_EM_SEVERIDADE_ALTA');
verificar(
  'sem descartar a leitura do modelo: ela segue valendo como triagem',
  recusaDeAbertura.explicacao.includes('triagem')
);

const semCriterio = abrirIncidente({
  id: 'INC-2',
  avaliacao: { ...avaliacaoSoDeModelo.avaliacao, criterio: '  ' },
  observacoes: [observacaoDeSensor],
  sistemaId: 'rede-o2-bloco-cirurgico',
  especie: 'GASES_MEDICINAIS',
  abertoPor: 'engenharia-clinica',
  abertoEm: AGORA
});
igual('avaliação sem critério declarado não abre incidente', semCriterio.recusa, 'SEM_CRITERIO');

igual(
  'condição INDETERMINADA numa rede de gases herda o piso da espécie',
  severidadeDoIncidente('GASES_MEDICINAIS', 'INDETERMINADA'),
  'CRITICAL'
);
igual(
  'e a mesma indeterminação num elevador vale MEDIUM',
  severidadeDoIncidente('ELEVADOR', 'INDETERMINADA'),
  'MEDIUM'
);

const avaliacaoHumana = avaliarCondicao({
  id: 'AVAL-2',
  observacoes: [observacaoDeSensor, observacaoDeModelo],
  condicao: 'ANORMAL',
  criterio: 'pressão em 3,2 bar, abaixo do mínimo operacional de 4,0 declarado pela engenharia clínica',
  avaliadaPor: 'engenharia-clinica',
  avaliadaEm: AGORA
});
verificar('com fato instrumental embaixo, a avaliação não exige mais nada', !avaliacaoHumana.exigeFatoNaoModelado);

const abertura = abrirIncidente({
  id: 'INC-3',
  avaliacao: avaliacaoHumana.avaliacao,
  observacoes: [observacaoDeSensor, observacaoDeModelo],
  sistemaId: 'rede-o2-bloco-cirurgico',
  especie: 'GASES_MEDICINAIS',
  zonaId: 'z-cc',
  abertoPor: 'engenharia-clinica',
  abertoEm: AGORA
});
verificar('o incidente abre', abertura.incidente !== null);
igual('com severidade CRITICAL', abertura.incidente?.severidade, 'CRITICAL');
igual('e sem ninguém encaminhado, porque ninguém foi', abertura.incidente?.papeisEncaminhados.length, 0);
verificar(
  'e o registro DIZ que não chamou ninguém',
  abertura.explicacao.includes('não chamou ninguém')
);
verificar(
  'a leitura do modelo continua entre as evidências',
  abertura.incidente?.evidencias.includes('OBS-GAS-2') === true
);
verificar(
  'a projeção leva o encaminhamento vazio ao painel',
  projetarIncidente(abertura.incidente!).papeisEncaminhados.length === 0 &&
    projetarIncidente(abertura.incidente!).emAberto
);

const pedidoDeDesligamento: PedidoDeIntervencao = {
  id: 'INTV-1',
  incidenteId: 'INC-3',
  organizationId: 'org-sinergentia',
  sistemaId: 'rede-o2-bloco-cirurgico',
  especie: 'DESLIGAMENTO',
  justificativa: 'isolar a linha para troca do regulador',
  pedidoPor: 'engenharia-clinica',
  pedidoEm: AGORA,
  afetados: ['z-cc', 'sala-3', 'sala-4']
};
const materialDaIntervencao: MaterialDeIntervencao = {
  incidenteId: 'INC-3',
  sistemaId: 'rede-o2-bloco-cirurgico',
  especie: 'GASES_MEDICINAIS',
  severidade: 'CRITICAL',
  intervencao: 'DESLIGAMENTO',
  justificativa: 'isolar a linha para troca do regulador',
  afetados: ['z-cc', 'sala-3', 'sala-4'],
  condicao: 'ANORMAL',
  criterio: avaliacaoHumana.avaliacao.criterio,
  origensDaObservacao: ['SENSOR', 'MODELO']
};

const bancada = montarBancada();
const material = materialDaIntervencao;
const prep = await bancada.mesaDeIntervencao.prepararMaterial(pedidoDeDesligamento, material);
igual('desligar uma rede de gases é decisão de faixa CRITICA', prep.criticidade, 'CRITICA');

const semAlcada = await bancada.mesaDeIntervencao.autorizar({
  pedido: pedidoDeDesligamento,
  incidente: abertura.incidente!,
  material,
  decisao: {
    pedidoId: 'INTV-1',
    bundleHash: prep.bundleHash,
    decisao: 'APROVADO',
    aprovador: 'sofia.seguranca',
    papel: 'supervisao-de-seguranca',
    justificativa: 'autorizo o isolamento',
    decididoEm: AGORA.toISOString(),
    assinatura: 'token-sofia'
  },
  relationshipDoAprovador: 'vin-rui'
});
verificar('a supervisão de segurança não autoriza desligar gases', !semAlcada.autorizada);
igual('porque a alçada não alcança a faixa CRITICA', semAlcada.motivo, 'SEM_ALCADA');

const materialMudado = { ...material, afetados: ['z-cc'] };
const hashVelho = await bancada.mesaDeIntervencao.autorizar({
  pedido: pedidoDeDesligamento,
  incidente: abertura.incidente!,
  material: materialMudado,
  decisao: {
    pedidoId: 'INTV-1',
    bundleHash: prep.bundleHash,
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'autorizo',
    decididoEm: AGORA.toISOString(),
    assinatura: 'token-rita'
  },
  relationshipDoAprovador: 'vin-rita'
});
verificar('mudar os afetados depois da revisão invalida a autorização', !hashVelho.autorizada);
igual('e o motivo é o conteúdo', hashVelho.motivo, 'CONTEUDO_MUDOU_APOS_REVISAO');

const autorizada = await bancada.mesaDeIntervencao.autorizar({
  pedido: pedidoDeDesligamento,
  incidente: abertura.incidente!,
  material,
  decisao: {
    pedidoId: 'INTV-1',
    bundleHash: prep.bundleHash,
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'autorizo o isolamento, com as salas 3 e 4 já remanejadas',
    decididoEm: AGORA.toISOString(),
    assinatura: 'token-rita'
  },
  relationshipDoAprovador: 'vin-rita'
});
verificar('a diretoria técnica autoriza', autorizada.autorizada);
verificar(
  'e a ordem só existe depois disso',
  ordemDeIntervencao(pedidoDeDesligamento, autorizada, AGORA).autorizadaPor === 'rita.diretoria'
);

let ordemSemAutorizacao = false;
try {
  ordemDeIntervencao(pedidoDeDesligamento, semAlcada, AGORA);
} catch {
  ordemSemAutorizacao = true;
}
verificar('ordem sem autorização nem se constrói', ordemSemAutorizacao);

// ===========================================================================
grupo('D-057 · visibilidade comercial não é autoridade institucional');
// ===========================================================================

const integradora = TENANTS_DA_BANCADA[0]!;
const visibilidade = visibilidadeDe(integradora);
igual('a integradora vê os dois hospitais', visibilidade.organizacoes.length, 2);
verificar(
  'e nenhuma faixa de visibilidade inclui decisão',
  !visibilidade.faixas.some((faixa) => String(faixa).includes('DECISAO'))
);
verificar(
  'a ressalva viaja com a resposta, e diz que nada decorre dela',
  visibilidade.ressalva.includes('Nenhuma decisão de acesso')
);

const autoridadeDaIntegradora = autoridadeEfetiva({
  relationshipId: 'vin-ivo',
  organizationId: 'org-sinergentia',
  dominios: DOMINIOS_DE_AUTORIDADE,
  delegacoes: DELEGACOES_DE_AUTORIDADE,
  agora: AGORA
});
igual('e o administrador dela não tem papel nenhum no hospital', autoridadeDaIntegradora.papeis.length, 0);
verificar(
  'a explicação diz que visibilidade mostra equipamento e não decide porta',
  autoridadeDaIntegradora.explicacao.includes('não decide porta')
);

const autoridadeLocal = autoridadeEfetiva({
  relationshipId: 'vin-rui',
  organizationId: 'org-sinergentia',
  dominios: DOMINIOS_DE_AUTORIDADE,
  delegacoes: DELEGACOES_DE_AUTORIDADE,
  agora: AGORA
});
verificar('quem tem domínio no hospital tem papel', autoridadeLocal.papeis.includes('supervisao-de-seguranca'));

const noOutroHospital = podeDecidirNaOrganizacao(
  {
    relationshipId: 'vin-rui',
    organizationId: 'org-vale-verde',
    dominios: DOMINIOS_DE_AUTORIDADE,
    delegacoes: DELEGACOES_DE_AUTORIDADE,
    agora: AGORA
  },
  ['supervisao-de-seguranca']
);
verificar('o mesmo vínculo não decide no outro hospital', !noOutroHospital.autorizado);
igual('e o motivo nomeia a causa', noOutroHospital.motivo, 'PAPEL_DE_OUTRA_ORGANIZACAO');
verificar(
  'a explicação diz que a identidade atravessa e o papel não',
  noOutroHospital.explicacao.includes('identidade atravessa organizações; o papel não')
);

const delegacaoAlem = autoridadeEfetiva({
  relationshipId: 'vin-clara',
  organizationId: 'org-sinergentia',
  dominios: DOMINIOS_DE_AUTORIDADE,
  delegacoes: [
    {
      id: 'DEL-1',
      dominioOrigemId: 'dom-aurora-seguranca',
      relationshipDestinoId: 'vin-clara',
      escopo: 'OPERACIONAL',
      papeis: ['supervisao-de-seguranca', 'diretoria-tecnica'],
      vigencia: { inicio: new Date(AGORA.getTime() - 3_600_000) },
      concedidaPor: 'rui.seguranca',
      motivo: 'cobertura de férias'
    }
  ],
  agora: AGORA
});
verificar(
  'a delegação entrega o que o domínio de origem tem',
  delegacaoAlem.papeis.includes('supervisao-de-seguranca')
);
verificar(
  'e descarta o que ele não tem: ninguém delega o que não possui',
  !delegacaoAlem.papeis.includes('diretoria-tecnica')
);

const delegacaoVencida = podeDecidirNaOrganizacao(
  {
    relationshipId: 'vin-clara',
    organizationId: 'org-sinergentia',
    dominios: DOMINIOS_DE_AUTORIDADE,
    delegacoes: [
      {
        id: 'DEL-2',
        dominioOrigemId: 'dom-aurora-seguranca',
        relationshipDestinoId: 'vin-clara',
        escopo: 'OPERACIONAL',
        papeis: ['supervisao-de-seguranca'],
        vigencia: {
          inicio: new Date(AGORA.getTime() - 7_200_000),
          fim: new Date(AGORA.getTime() - 3_600_000)
        },
        concedidaPor: 'rui.seguranca',
        motivo: 'cobertura de férias'
      }
    ],
    agora: AGORA
  },
  ['supervisao-de-seguranca']
);
verificar('delegação vencida não decide', !delegacaoVencida.autorizado);
igual('e tem motivo próprio', delegacaoVencida.motivo, 'DELEGACAO_VENCIDA');

igual(
  'sem vazamento, a lista de visibilidade além do contrato é vazia',
  vazamentoDeVisibilidade(integradora, ['org-sinergentia', 'org-vale-verde']).length,
  0
);
igual(
  'e um contrato que perdeu um hospital é detectado',
  vazamentoDeVisibilidade(integradora, ['org-sinergentia']).length,
  1
);

const intervencaoDaIntegradora = await bancada.mesaDeIntervencao.autorizar({
  pedido: pedidoDeDesligamento,
  incidente: abertura.incidente!,
  material,
  decisao: {
    pedidoId: 'INTV-1',
    bundleHash: prep.bundleHash,
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'autorizo',
    decididoEm: AGORA.toISOString(),
    assinatura: 'token-rita'
  },
  relationshipDoAprovador: 'vin-ivo'
});
verificar(
  'na mesa de intervenção, o vínculo da integradora não autoriza nada',
  !intervencaoDaIntegradora.autorizada
);
igual(
  'e a recusa é de autoridade federada, não de alçada: subir o caso não resolve',
  intervencaoDaIntegradora.motivo,
  'AUTORIDADE_NAO_FEDERADA'
);

// ===========================================================================
grupo('A bancada é o sistema montado: as sete leituras têm quem as chame');
// ===========================================================================

const viva = montarBancada();
const primeiro = await tick(viva);

verificar('o ciclo avalia emissão de verdade', primeiro.emissaoAvaliada);
verificar('e avaliou pelo menos uma', primeiro.emissoes.length > 0);
igual('nenhuma retida nesta bancada em dia', primeiro.emissoesRetidas, 0);
verificar(
  'as janelas residuais projetadas chegam ao relatório',
  primeiro.janelasResiduais.length === primeiro.emissoes.length
);
verificar(
  'e nenhuma estoura o teto, porque o MOCK revoga e confirma',
  primeiro.janelasResiduais.every((janela) => !janela.excedeuTeto)
);
verificar(
  'o elo da avaliação de emissão entra na cadeia',
  primeiro.eventosDoCiclo.some((evento) => evento.tipo === 'CredentialIssuanceEvaluated')
);

const raiz = primeiro.assurance.arvore.raiz;
igual('nenhuma janela residual descoberta no score', raiz.uncoveredResidualWindows, 0);
igual('nenhum vínculo semântico pendente', raiz.unverifiedSemanticBindings, 0);
igual('nenhum incidente sem autoridade', raiz.physicalIncidentsWithoutAuthority, 0);
verificar(
  'e o score não tem componente nenhum dos três',
  !raiz.components.some((c) =>
    ['JANELAS_RESIDUAIS', 'VINCULOS_SEMANTICOS', 'INCIDENTES_SEM_AUTORIDADE'].includes(c.id)
  )
);

// Agora o painel é remexido: a obra troca a fechadura do cofre.
viva.vinculos.avancarVersao('ep-seg-1');
const depoisDaObra = await tick(viva, 60_000);
igual(
  'a verificação envelheceu e o score passa a cobrá-la',
  depoisDaObra.assurance.arvore.raiz.unverifiedSemanticBindings,
  1
);
const componenteDeVinculo = depoisDaObra.assurance.arvore.raiz.components.find(
  (c) => c.id === 'VINCULOS_SEMANTICOS'
);
verificar('com componente nomeado', componenteDeVinculo !== undefined);
verificar(
  'que diz que a conferência NÃO bateu',
  componenteDeVinculo?.rotulo.includes('NÃO bateu') === true
);
verificar(
  'e aponta o vínculo como evidência',
  componenteDeVinculo?.evidencias.includes('VINC-ep-seg-1') === true
);
proximo(
  'a penalidade abre: peso 2 × 1 divergente × 1,5',
  componenteDeVinculo?.penalidade ?? 0,
  3
);
verificar(
  'e o score fecha pela soma dos componentes, como sempre',
  Math.abs(
    100 -
      depoisDaObra.assurance.arvore.raiz.components.reduce((soma, c) => soma + c.penalidade, 0) -
      depoisDaObra.assurance.arvore.raiz.score
  ) < 0.011
);

// E agora o caso que fecha o D-055 dentro do ciclo, com o cenário completo:
// duas pessoas com alçada aprovam a entrada no cofre de psicotrópicos — a
// decisão de acesso está correta, revisada e assinada contra o hash do material
// —, e o caminho de revogação daquela porta desaparece. A chave que o ciclo
// entregaria não teria como ser pedida de volta.
//
// A sequência importa: primeiro a aprovação, porque é ela que faz a concessão
// chegar à materialização. Sem esse passo a emissão nunca seria avaliada, e o
// teste passaria sem ter exercitado nada.
const pendenteDoCofre = primeiro.pendentesDeAprovacao.find((acao) => acao.endpointId === 'ep-seg-1');
verificar('o cofre nasce pendente de aprovação humana', pendenteDoCofre !== undefined);
await aprovarCofre(viva, pendenteDoCofre!.material);

viva.revogabilidade.declarar('ep-seg-1', {
  revogacaoRemota: false,
  confirmaEstadoFisico: false,
  credenciaisOffline: true,
  temCaminhoDeSincronizacao: false
});
const comCofreSemVolta = await tick(viva, 60_000);
const avaliacaoDoCofre = comCofreSemVolta.emissoes.find((e) => e.perfil.endpointId === 'ep-seg-1');
verificar('com a aprovação dada, a emissão no cofre é avaliada', avaliacaoDoCofre !== undefined);
igual('e é RECUSADA', avaliacaoDoCofre?.veredito, 'RECUSA');
igual('o ciclo retém uma emissão', comCofreSemVolta.emissoesRetidas, 1);
verificar(
  'o elo da retenção entra na cadeia',
  comCofreSemVolta.eventosDoCiclo.some((evento) => evento.tipo === 'CredentialIssuanceWithheld')
);
verificar(
  'nenhum direito foi concedido no cofre: o que se reteve é a CHAVE',
  !comCofreSemVolta.eventosDoCiclo.some(
    (evento) => evento.tipo === 'EntitlementGranted' && evento.endpointId === 'ep-seg-1'
  )
);
verificar(
  'e a decisão de política continua tendo concedido — a retenção é outro ato',
  comCofreSemVolta.acoesLogicas.some(
    (acao) => acao.endpointId === 'ep-seg-1' && acao.decisao.efeito === 'REQUIRE_APPROVAL'
  )
);
igual(
  'a janela residual do cofre fica sem término previsto',
  avaliacaoDoCofre?.janelaResidual.minutos,
  null
);

// Um incidente físico aberto e sem ninguém chamado entra no score.
const observacaoDaBancada: ObservacaoFisica = {
  id: 'OBS-BANCADA',
  sistemaId: 'porta-corta-fogo-cc',
  especie: 'PORTA_CORTA_FOGO',
  zonaId: 'z-cc',
  observadoEm: viva.relogio.agora(),
  origem: 'PESSOA',
  observadoPor: 'brigada-de-incendio',
  relato: 'porta corta-fogo travada aberta com um calço'
};
const avaliacaoDaBancada = avaliarCondicao({
  id: 'AVAL-BANCADA',
  observacoes: [observacaoDaBancada],
  condicao: 'ANORMAL',
  criterio: 'porta corta-fogo deve permanecer fechada e livre; calço impede o fechamento',
  avaliadaPor: 'brigada-de-incendio',
  avaliadaEm: viva.relogio.agora()
});
const incidenteDaBancada = abrirIncidente({
  id: 'INC-BANCADA',
  avaliacao: avaliacaoDaBancada.avaliacao,
  observacoes: [observacaoDaBancada],
  sistemaId: 'porta-corta-fogo-cc',
  especie: 'PORTA_CORTA_FOGO',
  zonaId: 'z-cc',
  abertoPor: 'brigada-de-incendio',
  abertoEm: viva.relogio.agora()
});
viva.incidentes.registrar(incidenteDaBancada.incidente!);
const comIncidente = await tick(viva, 60_000);
igual(
  'o incidente sem ninguém chamado entra no score',
  comIncidente.assurance.arvore.raiz.physicalIncidentsWithoutAuthority,
  1
);
const componenteDeIncidente = comIncidente.assurance.arvore.raiz.components.find(
  (c) => c.id === 'INCIDENTES_SEM_AUTORIDADE'
);
verificar(
  'com rótulo que diz que o fato está acontecendo e não há quem responda',
  componenteDeIncidente?.rotulo.includes('não há quem responda') === true
);
verificar(
  'o incidente aparece no escopo do centro cirúrgico',
  (comIncidente.assurance.arvore.porEscopo.get('z-cc')?.physicalIncidentsWithoutAuthority ?? 0) === 1
);
verificar(
  'e não aparece no escopo da UTI',
  (comIncidente.assurance.arvore.porEscopo.get('z-uti')?.physicalIncidentsWithoutAuthority ?? 0) === 0
);

viva.incidentes.assumir('INC-BANCADA', ['gerencia-de-facilities', 'supervisao-de-seguranca']);
const comIncidenteAssumido = await tick(viva, 60_000);
igual(
  'assumido por quem responde, o incidente sai do número — e continua em aberto',
  comIncidenteAssumido.assurance.arvore.raiz.physicalIncidentsWithoutAuthority,
  0
);
verificar(
  'o que o score cobrava era a ausência de quem responde, não o incidente',
  viva.incidentes.obter('INC-BANCADA')?.status === 'EM_TRATAMENTO'
);

// A decisão de modo ACCESS, que o ADR-0008 declarou e nada percorria.
const restricaoDaUti = new RestricoesLocaisEmMemoria([
  {
    id: 'RES-UTI-PROC',
    zonaId: 'z-uti',
    especie: 'PROCEDIMENTO_EM_CURSO',
    efeito: 'SUSPENDE_EXERCICIO',
    janela: { inicio: new Date(viva.relogio.agora().getTime() - 60_000) },
    papeisQueAtravessam: [],
    declaradaPor: 'coordenacao-de-enfermagem',
    declaradaEm: viva.relogio.agora(),
    motivo: 'procedimento em curso no leito 3'
  }
]);
viva.mundo = { ...viva.mundo, restricoesLocais: restricaoDaUti };

const respostaOnline = viva.atendente.responder(viva.mundo, {
  id: 'CONSULTA-1',
  relationshipId: 'vin-eduardo',
  endpointId: 'ep-uti-1',
  metodo: 'CARD'
});
igual('a porta online responde', respostaOnline.decisao?.efeito, 'DENY');
igual('e a leitura do exercício vai junto', respostaOnline.exercicio, 'SUSPENSO_LOCALMENTE');
verificar(
  'a explicação diz que o direito continua vigente',
  respostaOnline.explicacao.includes('Nada foi revogado')
);

const direitoDepois = viva.entitlements
  .vigentes()
  .find((e) => e.endpointId === 'ep-uti-1' && e.relationshipId === 'vin-eduardo');
verificar('e o direito continua lá, sem revogação', direitoDepois !== undefined && !direitoDepois.revogadoEm);

const depoisDaConsulta = await tick(viva, 60_000);
verificar(
  'o ciclo seguinte não revoga nada por causa da restrição',
  !depoisDaConsulta.acoesLogicas.some(
    (acao) => acao.endpointId === 'ep-uti-1' && acao.tipo === 'REVOKE'
  )
);

const semDecisaoOnline = new AtendenteDeAcesso(
  new PolicyEngine(REGRAS_HOSPITALARES_BASE),
  viva.relogio,
  true
);
const recusaDeResponder = semDecisaoOnline.responder(viva.mundo, {
  id: 'CONSULTA-2',
  relationshipId: 'vin-eduardo',
  endpointId: 'ep-uti-1'
});
igual(
  'um endpoint sem ONLINE_DECISION não recebe resposta inventada',
  recusaDeResponder.naoRespondido,
  'ENDPOINT_SEM_DECISAO_ONLINE'
);
igual('e a decisão é nula, não um negado', recusaDeResponder.decisao, null);
verificar(
  'a frase diz que a ColmeIA não participou daquele acesso',
  recusaDeResponder.explicacao.includes('não participou')
);

const placaNaPortaria = viva.atendente.responder(viva.mundo, {
  id: 'CONSULTA-3',
  relationshipId: 'vin-clara',
  endpointId: 'ep-adm-1',
  observado: {
    id: 'OBS-PORTARIA',
    especie: 'PLACA_DE_VEICULO',
    valorProjetado: 'XYZ-9***',
    observadoEm: viva.relogio.agora(),
    sensorId: 'cam-portaria',
    confiancaDoSensor: 0.99
  }
});
igual('a placa na portaria convoca conferência', placaNaPortaria.decisao?.efeito, 'REQUIRE_APPROVAL');
igual('e a prova é APENAS_OBSERVADA', placaNaPortaria.prova, 'APENAS_OBSERVADA');

fechar('Deltas D-051 a D-057 — consolidado de 10/10/2026');
