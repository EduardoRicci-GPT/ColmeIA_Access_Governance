// ---------------------------------------------------------------------------
// CONFORMIDADE DOS ADAPTADORES (itens 11, 12, 13, 45)
//
// A mesma suíte roda contra os quatro. O simulado precisa passar operando; os
// três de fabricante precisam passar RECUSANDO. As duas formas de passar são
// igualmente rigorosas, e é essa simetria que impede o pior resultado possível
// numa integração: um adaptador que devolve sucesso porque ainda não existe.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import { verificarConformidadeDoAdaptador } from '../packages/adapters/contrato/conformidade';
import { IntegracaoNaoDisponivel } from '../packages/adapters/contrato/tipos';
import { MockAccessProvider, SimuladorDeMundoFisico } from '../packages/adapters/mock';
import { TTLockAdapter, capacidadesProvisorias } from '../packages/adapters/ttlock';
import { ControlIDAdapter, origemDaDecisao, decisaoLocalPorFalhaDaColmeia } from '../packages/adapters/control-id';
import { RESPONSABILIDADES_INDELEGAVEIS, SeamAdapter } from '../packages/adapters/seam';

const contexto = {
  endpointId: 'ep-uti-1',
  referenciaExterna: 'EXT-EP-UTI-1',
  personId: 'p-eduardo',
  credentialId: 'CRED-teste',
  momento: new Date('2026-09-11T08:00:00')
};

async function rodar(nome: string, adaptador: Parameters<typeof verificarConformidadeDoAdaptador>[0]) {
  grupo(`Contrato v2 · ${nome} (${adaptador.statusDeIntegracao})`);
  const achados = await verificarConformidadeDoAdaptador(adaptador, contexto);
  for (const achado of achados) verificar(achado.nome, achado.passou, achado.detalhe);
  verificar('a suíte exerceu verificações', achados.length > 0, `${achados.length} achados`);
}

await rodar('MockAccessProvider', new MockAccessProvider(new SimuladorDeMundoFisico()));
await rodar('TTLockAdapter', new TTLockAdapter());
await rodar('ControlIDAdapter', new ControlIDAdapter());
await rodar('SeamAdapter', new SeamAdapter());

grupo('Maturidade declarada no código, não só no relatório (item 45)');
igual('Mock: IMPLEMENTED', new MockAccessProvider(new SimuladorDeMundoFisico()).statusDeIntegracao, 'IMPLEMENTED');
igual('TTLock: INTERFACE_READY', new TTLockAdapter().statusDeIntegracao, 'INTERFACE_READY');
igual('Control iD: INTERFACE_READY', new ControlIDAdapter().statusDeIntegracao, 'INTERFACE_READY');
igual('Seam: RESEARCH_REQUIRED', new SeamAdapter().statusDeIntegracao, 'RESEARCH_REQUIRED');

grupo('A recusa carrega a pendência, não uma mensagem genérica');
try {
  await new TTLockAdapter().revokeAccess({
    idempotencyKey: 'K',
    correlationId: 'C',
    endpointId: 'ep',
    referenciaExterna: 'X',
    solicitadoEm: new Date(),
    personId: 'p',
    credentialId: 'c',
    motivo: 'teste'
  });
  verificar('TTLock recusou a revogação', false, 'não lançou');
} catch (erro) {
  const e = erro as IntegracaoNaoDisponivel;
  verificar('TTLock recusou com o erro do contrato', e instanceof IntegracaoNaoDisponivel);
  verificar(
    'e a mensagem nomeia a pendência concreta',
    e.pendencia.includes('gateway'),
    e.pendencia
  );
}

grupo('TTLock · capacidades declaradas são hipóteses rastreáveis');
const provisorias = capacidadesProvisorias();
verificar(
  'toda capacidade do TTLock está marcada como provisória',
  provisorias.length >= 14,
  `${provisorias.length} capacidade(s) provisória(s)`
);
verificar(
  'inclusive a revogação remota, que depende de gateway',
  provisorias.includes('remoteRevocation')
);

grupo('Control iD · a origem da decisão é registrada (itens 15 e 16)');
igual(
  'decisão tomada pela ColmeIA em modo online',
  origemDaDecisao({ modo: 'ONLINE', decidiuLocalmente: false }),
  'COLMEIA_POLICY_ENGINE'
);
igual(
  'decisão tomada pelo próprio equipamento',
  origemDaDecisao({ modo: 'STANDALONE', decidiuLocalmente: true }),
  'DEVICE_LOCAL'
);
verificar(
  'decisão local por timeout é contabilizada como falha da ColmeIA, não como projeto',
  decisaoLocalPorFalhaDaColmeia({ modo: 'ONLINE', decidiuLocalmente: true, porTimeout: true })
);
verificar(
  'e decisão local em modo standalone NÃO é falha',
  !decisaoLocalPorFalhaDaColmeia({ modo: 'STANDALONE', decidiuLocalmente: true })
);

grupo('Seam · a fronteira do item 18 é explícita');
for (const responsabilidade of ['policy', 'risk', 'human_approval', 'hospital_workflows']) {
  verificar(
    `"${responsabilidade}" está na lista do que a ColmeIA não delega`,
    RESPONSABILIDADES_INDELEGAVEIS.includes(responsabilidade)
  );
}
verificar(
  'e o adaptador declara que a confiança máxima da via agregada é PROBABLE',
  new SeamAdapter().pendenciaDeIntegracao.includes('PROBABLE'),
  new SeamAdapter().pendenciaDeIntegracao
);

fechar('Contrato de adaptadores v2');
