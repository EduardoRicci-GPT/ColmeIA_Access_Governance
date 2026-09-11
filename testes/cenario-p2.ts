// ---------------------------------------------------------------------------
// CENÁRIO P2 — latência obrigatória (item 21)
//
// Policy Engine 40 ms · Provedor 70 ms · Equipamento 3.100 ms
//
// O sistema precisa dizer três coisas separadas — decisão saudável, provedor
// saudável, execução degradada — e não uma só: "o sistema está lento".
//
// A diferença entre as duas formulações é o endereço do chamado. A primeira
// manda alguém olhar o firmware da fechadura. A segunda manda a equipe de
// infraestrutura procurar um gargalo que não existe, enquanto a porta continua
// levando três segundos para abrir na frente de um paciente em maca.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import { LIMIARES_PADRAO, diagnosticarLatencia } from '../packages/dominio/telemetria';

const base = new Date('2026-09-11T08:00:00.000');
const somar = (ms: number) => new Date(base.getTime() + ms);

const telemetria = {
  operationId: 'OP-P2',
  correlationId: 'COR-P2',
  endpointId: 'ep-uti-1',
  requestReceivedAt: base,
  policyDecisionAt: somar(40),
  providerRequestAt: somar(40),
  providerResponseAt: somar(110),
  deviceExecutedAt: somar(3_210),
  eventConfirmedAt: somar(3_260)
};

grupo('P2 · latências derivadas das marcas temporais');
const diagnostico = diagnosticarLatencia(telemetria, LIMIARES_PADRAO);
const etapa = (nome: string) => diagnostico.etapas.find((e) => e.etapa === nome);

igual('decisão de política levou 40 ms', etapa('POLICY')?.latenciaMs, 40);
igual('provedor levou 70 ms', etapa('PROVIDER')?.latenciaMs, 70);
igual('equipamento levou 3.100 ms', etapa('DEVICE')?.latenciaMs, 3_100);
igual('confirmação levou 50 ms', etapa('CONFIRMATION')?.latenciaMs, 50);
igual('o total é a soma da cadeia', diagnostico.totalLatencyMs, 3_260);

grupo('P2 · o diagnóstico atribui a demora à etapa certa');
igual('política: saudável', etapa('POLICY')?.saude, 'HEALTHY');
igual('provedor: saudável', etapa('PROVIDER')?.saude, 'HEALTHY');
igual('equipamento: degradado', etapa('DEVICE')?.saude, 'DEGRADED');
igual('a etapa dominante é o equipamento', diagnostico.etapaDominante, 'DEVICE');
igual('a pior saúde da operação é DEGRADED', diagnostico.piorSaude, 'DEGRADED');

grupo('P2 · a explicação nomeia as três etapas separadamente');
verificar(
  'a frase cita a decisão de política como saudável',
  diagnostico.explicacao.includes('Decisão de política: saudável'),
  diagnostico.explicacao
);
verificar(
  'a frase cita a resposta do provedor como saudável',
  diagnostico.explicacao.includes('Resposta do provedor: saudável'),
  diagnostico.explicacao
);
verificar(
  'a frase cita a execução no equipamento como degradada',
  diagnostico.explicacao.includes('Execução no equipamento: degradada'),
  diagnostico.explicacao
);
verificar(
  'e atribui explicitamente a maior parcela do tempo',
  diagnostico.explicacao.includes('Maior parcela do tempo: Execução no equipamento'),
  diagnostico.explicacao
);
verificar(
  'a explicação NÃO culpa o sistema genericamente',
  !/sistema (est[áa] )?lento/i.test(diagnostico.explicacao),
  diagnostico.explicacao
);

grupo('P2 · medição ausente não vira zero');
const parcial = diagnosticarLatencia({ operationId: 'OP-P2B', requestReceivedAt: base });
igual('etapa sem marca fica UNKNOWN, não HEALTHY', parcial.etapas[0]?.saude, 'UNKNOWN');
igual('sem medição, nenhuma etapa é dominante', parcial.etapaDominante, null);
verificar(
  'e a explicação declara a falta de medição',
  parcial.explicacao.includes('Sem medição suficiente'),
  parcial.explicacao
);

grupo('P2 · o degrau crítico existe e é distinto do degradado');
const critico = diagnosticarLatencia({
  operationId: 'OP-P2C',
  requestReceivedAt: base,
  providerResponseAt: base,
  deviceExecutedAt: somar(6_000)
});
igual('3,1 s degrada; 6 s é crítico', critico.etapas[2]?.saude, 'CRITICAL');

fechar('Cenário P2 — telemetria de latência');
