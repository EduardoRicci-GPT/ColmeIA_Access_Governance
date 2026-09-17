// ---------------------------------------------------------------------------
// HEALTH SCORE — explicabilidade e hierarquia (itens 7, 8, 30)
//
// O exemplo da especificação é reproduzido literalmente:
//
//     87 / 100
//     −5: 2 endpoints offline
//     −3: 1 revogação pendente
//     −2: latência anormal
//     −3: conflito de política
//
// Reproduzi-lo não é ornamento: é a prova de que os pesos escolhidos não são
// arbitrários em relação à intenção declarada. Se um peso mudar sem discussão,
// este teste quebra — e a discussão acontece.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, proximo, verificar } from './runner';
import { calcularHealth, somaDosComponentes } from '../packages/observability-assurance/health';
import { IndicadoresDeAssurance } from '../packages/observability-assurance/indicadores';
import { montarBancada, tick } from './bancada';
import { montarPainel, verificarExplicabilidade } from '../packages/assurance-ui/painel';

const escopo = {
  organizationId: 'org-sinergentia',
  escopoId: 'hosp-aurora',
  nivel: 'FACILITY' as const,
  nome: 'Hospital Aurora',
  calculatedAt: new Date('2026-09-11T08:00:00')
};

const indicadores: IndicadoresDeAssurance = {
  escopoId: 'hosp-aurora',
  endpointsTotal: 10,
  endpointsOnline: 8,
  endpointsOffline: 2,
  endpointsDegraded: 0,
  gatewaysTotal: 2,
  gatewaysOffline: 0,
  gatewaysDegraded: 0,
  provedoresTotal: 1,
  provedoresIndisponiveis: 0,
  pendingRevocations: 1,
  pendingSynchronizations: 0,
  unreconciledStates: 0,
  highRiskConflicts: 1,
  staleCredentials: 0,
  anomalousLatencyCount: 1,
  backlogDeSincronizacao: 0,
  backlogDeEventos: 0,
  bateriasCriticas: 0,
  desviosDeRelogio: 0,
  pesoDeRevogacoesPendentes: 1,
  // O exemplo da especificação não tem emergência nenhuma, e é isso que ele
  // prova aqui: acrescentar a leitura da quebra de vidro não mexeu no 87.
  revisoesDeEmergenciaPendentes: 0,
  pesoDeRevisoesDeEmergencia: 0,
  repeticoesDeEmergencia: 0,
  zonasComRepeticao: []
};

grupo('Item 7 · o exemplo da especificação, reproduzido');
const health = calcularHealth(escopo, indicadores);
igual('o score é 87', health.score, 87);
igual('com quatro componentes', health.components.length, 4);

const detalhe = (id: string) => health.components.find((c) => c.id === id);
proximo('−5 por 2 endpoints offline em 10', detalhe('DISPONIBILIDADE')?.penalidade ?? 0, 5);
proximo('−3 por 1 revogação pendente', detalhe('REVOGACOES_PENDENTES')?.penalidade ?? 0, 3);
proximo('−2 por latência anormal', detalhe('LATENCIA')?.penalidade ?? 0, 2);
proximo('−3 por conflito de política', detalhe('CONFLITOS')?.penalidade ?? 0, 3);
proximo('e a soma fecha com o score', 100 - somaDosComponentes(health), 87);

grupo('Item 7 · não existe caminho que produza score sem composição');
const perfeito = calcularHealth(escopo, {
  ...indicadores,
  endpointsOffline: 0,
  endpointsOnline: 10,
  pendingRevocations: 0,
  pesoDeRevogacoesPendentes: 0,
  highRiskConflicts: 0,
  anomalousLatencyCount: 0
});
igual('sem penalidade, o score é 100', perfeito.score, 100);
igual('e a lista de componentes fica vazia, não inventada', perfeito.components.length, 0);
verificar(
  'todo componente carrega rótulo legível e contagem',
  health.components.every((c) => c.rotulo.length > 0 && c.contagem > 0 && c.detalhe.startsWith('-'))
);

grupo('Divergência é absoluta; disponibilidade é proporcional');
const redeGrande = calcularHealth(escopo, { ...indicadores, endpointsTotal: 800, endpointsOnline: 798 });
proximo(
  'dois endpoints offline em 800 quase não pesam',
  detalhe('DISPONIBILIDADE') ? redeGrande.components.find((c) => c.id === 'DISPONIBILIDADE')?.penalidade ?? 0 : 0,
  0.06,
  0.01
);
proximo(
  'mas a revogação pendente pesa igual: uma porta aberta é uma porta aberta',
  redeGrande.components.find((c) => c.id === 'REVOGACOES_PENDENTES')?.penalidade ?? 0,
  3
);

grupo('Criticidade do local pondera a revogação pendente');
const emAreaCritica = calcularHealth(escopo, { ...indicadores, pesoDeRevogacoesPendentes: 2 });
proximo('numa área CRITICAL, a mesma pendência custa o dobro', 100 - emAreaCritica.score, 13 + 3);

grupo('A emergência cobra a conta, nunca o ato de quebrar o vidro');
// A verificação mais importante deste bloco é a primeira, e ela é sobre
// incentivo, não sobre aritmética. Se invocar a exceção custasse score, o
// produto estaria cobrando da equipe exatamente o comportamento que quer que
// ela tenha — e o que se faz quando não se pode quebrar o vidro é escorar a
// porta, emprestar o crachá ou arrombar o armário, sem registro nenhum.
const comEmergenciaRevisada = calcularHealth(escopo, {
  ...indicadores,
  revisoesDeEmergenciaPendentes: 0,
  pesoDeRevisoesDeEmergencia: 0
});
igual('quebra invocada e revisada não move o score', comEmergenciaRevisada.score, health.score);
verificar(
  'e não cria componente nenhum',
  comEmergenciaRevisada.components.every((c) => c.id !== 'REVISOES_DE_EMERGENCIA')
);

const comContaAberta = calcularHealth(escopo, {
  ...indicadores,
  revisoesDeEmergenciaPendentes: 1,
  pesoDeRevisoesDeEmergencia: 1
});
proximo('a conta em aberto custa −2', 100 - comContaAberta.score, 13 + 2);
proximo(
  'e numa porta CRITICAL custa o dobro, como a revogação pendente',
  100 -
    calcularHealth(escopo, {
      ...indicadores,
      revisoesDeEmergenciaPendentes: 1,
      pesoDeRevisoesDeEmergencia: 2
    }).score,
  13 + 4
);
verificar(
  'abaixo da revogação pendente, porque a porta desta já fechou',
  (comContaAberta.components.find((c) => c.id === 'REVISOES_DE_EMERGENCIA')?.penalidade ?? 0) <
    (comContaAberta.components.find((c) => c.id === 'REVOGACOES_PENDENTES')?.penalidade ?? 0)
);

grupo('Repetição é achado sobre o desenho, e o rótulo é obrigado a dizer isso');
const semRepeticao = calcularHealth(escopo, { ...indicadores, repeticoesDeEmergencia: 0 });
verificar(
  'uma quebra sozinha na zona não é repetição',
  semRepeticao.components.every((c) => c.id !== 'EMERGENCIA_RECORRENTE')
);
const repetida = calcularHealth(escopo, {
  ...indicadores,
  repeticoesDeEmergencia: 2,
  zonasComRepeticao: ['z-farmacia']
});
proximo('duas repetições custam −6', 100 - repetida.score, 13 + 6);
const componenteDaRepeticao = repetida.components.find((c) => c.id === 'EMERGENCIA_RECORRENTE');
verificar(
  'o rótulo aponta o caminho normal de acesso, e não quem invocou',
  (componenteDaRepeticao?.rotulo ?? '').includes('caminho normal de acesso'),
  componenteDaRepeticao?.rotulo ?? '(ausente)'
);
verificar(
  'e a evidência é a zona — nunca uma pessoa',
  componenteDaRepeticao?.evidencias.join(',') === 'z-farmacia',
  componenteDaRepeticao?.evidencias.join(',') ?? '(vazio)'
);
// O teto existe pela mesma razão de todos os outros: uma zona com histórico
// ruim não pode zerar sozinha o score do hospital inteiro, senão o painel para
// de distinguir "isto aqui precisa de atenção" de "tudo está perdido".
proximo(
  'e a família tem teto, como todas as outras',
  calcularHealth(escopo, { ...indicadores, repeticoesDeEmergencia: 40 }).components.find(
    (c) => c.id === 'EMERGENCIA_RECORRENTE'
  )?.penalidade ?? 0,
  15
);
verificar(
  'o número continua abrindo com a emergência dentro',
  100 - somaDosComponentes(repetida) === repetida.score
);

grupo('Item 8 · o score do pai NÃO é a média dos filhos');
const b = montarBancada();
await tick(b);
await tick(b, 3_000);
b.simulador.colocarEndpointOffline('ep-uti-1');
b.simulador.colocarEndpointOffline('ep-uti-2');
b.mundo = {
  ...b.mundo,
  vinculos: b.mundo.vinculos.map((v) =>
    v.id === 'vin-eduardo' ? { ...v, situacao: 'TERMINATED' as const } : v
  )
};
const relatorio = await tick(b, 60_000);
const painel = montarPainel(b.mundo.topologia, relatorio.assurance);

const uti = painel.escopos.find((e) => e.escopoId === 'z-uti');
const hospital = painel.escopos.find((e) => e.escopoId === 'hosp-aurora');
const organizacao = painel.escopos.find((e) => e.escopoId === 'org-sinergentia');
const zonas = painel.escopos.filter((e) => e.nivel === 'ZONE');
const mediaDasZonas = zonas.reduce((soma, z) => soma + z.score, 0) / zonas.length;

verificar('a UTI é o escopo mais penalizado', (uti?.score ?? 100) < (hospital?.score ?? 0), `UTI ${uti?.score} × hospital ${hospital?.score}`);
verificar(
  'e o hospital não é a média das zonas',
  Math.abs((hospital?.score ?? 0) - mediaDasZonas) > 0.5,
  `hospital ${hospital?.score}, média das zonas ${Math.round(mediaDasZonas * 100) / 100}`
);
verificar(
  'o escopo da organização existe e abre em componentes',
  (organizacao?.componentes.length ?? 0) > 0,
  organizacao?.componentes.map((c) => c.detalhe).join(' | ')
);
verificar(
  'os mesmos endpoints aparecem como evidência nos dois níveis',
  (uti?.componentes.find((c) => c.id === 'DISPONIBILIDADE')?.evidencias ?? []).includes('ep-uti-1') &&
    (hospital?.componentes.find((c) => c.id === 'DISPONIBILIDADE')?.evidencias ?? []).includes('ep-uti-1')
);

grupo('Invariante da tela');
const falhas = verificarExplicabilidade(painel);
verificar('nenhum cartão exibe score que não feche', falhas.length === 0, falhas.join(' | '));
verificar(
  'a fila da tela está ordenada por risco, não por data',
  painel.filaDeRisco.every((item, i, lista) => {
    const ordem = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    return i === 0 || ordem[lista[i - 1]!.risco] >= ordem[item.risco];
  })
);

fechar('Health Score — composição, pesos e hierarquia');
