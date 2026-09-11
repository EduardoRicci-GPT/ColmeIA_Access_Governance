// ---------------------------------------------------------------------------
// SIMULADOR v2 — os modos de falha que o hardware real tem (item 19)
//
// Um simulador que só responde "ok" prova que o caminho feliz compila. Este
// existe para produzir os estados que o produto foi feito para representar: a
// ordem aceita que não chegou, o evento que se perdeu, a sincronização que
// gravou metade e devolveu sucesso, o relógio que derrapou.
//
// Todos determinísticos. Um cenário de divergência que falha uma vez em trinta
// execuções é indistinguível de um sistema saudável.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import { MockAccessProvider, SimuladorDeMundoFisico, GeradorDeterministico } from '../packages/adapters/mock';
import { RETRY_PADRAO, proximaTentativa, ESTADO_DE_TENTATIVAS_INICIAL } from '../packages/dominio/escalonamento';
import { montarBancada, tick } from './bancada';

const t0 = new Date('2026-09-11T08:00:00');
const pedido = (chave: string) => ({
  idempotencyKey: chave,
  correlationId: 'C1',
  endpointId: 'ep-1',
  referenciaExterna: 'EXT-1',
  solicitadoEm: t0,
  personId: 'p-1',
  credentialId: 'cred-1',
  metodo: 'CARD' as const,
  inicio: t0
});

grupo('Determinismo: mesma semente, mesma sequência');
const a = new GeradorDeterministico(42);
const b = new GeradorDeterministico(42);
verificar(
  'dez sorteios idênticos',
  Array.from({ length: 10 }, () => a.proximo()).join(',') ===
    Array.from({ length: 10 }, () => b.proximo()).join(',')
);
verificar('semente zero não trava o gerador', new GeradorDeterministico(0).proximo() > 0);

grupo('Nuvem do provedor indisponível: a ordem não é aceita');
const simOffline = new SimuladorDeMundoFisico({ provedorOnline: false });
const advOffline = new MockAccessProvider(simOffline);
const rOffline = await advOffline.grantAccess(pedido('K-OFFLINE'));
igual('status FAILED', rOffline.status, 'FAILED');
igual('sem confirmação física', rOffline.physicalConfirmation, 'NOT_CONFIRMED');
verificar('e a mensagem nomeia a causa', rOffline.message?.includes('provedor') === true, rOffline.message);

grupo('Equipamento offline: a nuvem aceita, a porta não sabe');
const simEndpoint = new SimuladorDeMundoFisico({ endpointsOffline: ['ep-1'] });
const advEndpoint = new MockAccessProvider(simEndpoint);
const rEndpoint = await advEndpoint.grantAccess(pedido('K-EP'));
igual('status PENDING', rEndpoint.status, 'PENDING');
igual('e physicalConfirmation NOT_CONFIRMED', rEndpoint.physicalConfirmation, 'NOT_CONFIRMED');
verificar(
  'a distinção entre aceito e aplicado está na mensagem',
  rEndpoint.message?.includes('enfileirada') === true,
  rEndpoint.message
);
igual('o backlog do endpoint reflete a ordem parada', simEndpoint.backlogDe('ep-1'), 1);

grupo('Gateway offline com endpoint de pé: também não aplica');
const simGw = new SimuladorDeMundoFisico({ gatewaysOffline: ['gw-1'] });
const advGw = new MockAccessProvider(simGw, { gatewayPorEndpoint: { 'ep-1': 'gw-1' } });
const rGw = await advGw.grantAccess(pedido('K-GW'));
igual('a ordem fica pendente', rGw.status, 'PENDING');
verificar('e a causa nomeada é o gateway', rGw.message?.includes('Gateway') === true, rGw.message);

grupo('Item 37 · idempotência: mesma chave, mesma operação');
const simIdem = new SimuladorDeMundoFisico();
const advIdem = new MockAccessProvider(simIdem);
const primeira = await advIdem.grantAccess(pedido('K-IDEM'));
const segunda = await advIdem.grantAccess(pedido('K-IDEM'));
igual('o operationId se repete', primeira.operationId, segunda.operationId);
igual('e só uma ordem entrou na fila', simIdem.backlogDe('ep-1'), 1);

grupo('Evento perdido: o sistema fica desatualizado e precisa perguntar');
const simPerda = new SimuladorDeMundoFisico({ probabilidadeDePerdaDeEvento: 1 });
const advPerda = new MockAccessProvider(simPerda);
await advPerda.grantAccess(pedido('K-PERDA'));
const processamento = simPerda.processar(new Date(t0.getTime() + 60_000));
igual('a ordem foi executada no equipamento', processamento.executadas.length, 1);
igual('mas nenhum evento chegou', processamento.eventosEmitidos, 0);
igual('e o evento foi contabilizado como perdido', simPerda.totalDeEventosPerdidos(), 1);

const canal = await advPerda.getAccessEvents();
igual('o canal de eventos está vazio', canal.eventos.length, 0);

const leitura = simPerda.estadoFisico('ep-1', new Date(t0.getTime() + 60_000));
igual('a reconciliação ativa revela a verdade', leitura.estado, 'DEVICE_GRANT_CONFIRMED');
verificar('a leitura direta é o único caminho para sair da incerteza', leitura.confiavel);

grupo('Sincronização parcial: sucesso pela metade não é sucesso');
const simParcial = new SimuladorDeMundoFisico({ fracaoDeSincronizacao: 0.5 });
const advParcial = new MockAccessProvider(simParcial);
const rParcial = await advParcial.syncCredential({
  idempotencyKey: 'K-PARCIAL',
  correlationId: 'C',
  endpointId: 'ep-1',
  referenciaExterna: 'EXT-1',
  solicitadoEm: t0,
  credentialIds: ['c1', 'c2', 'c3', 'c4'],
  modo: 'FULL'
});
igual('o resultado é PENDING, não CONFIRMED', rParcial.status, 'PENDING');
verificar(
  'e a mensagem diz quantas ficaram de fora',
  rParcial.message?.includes('2 de 4') === true,
  rParcial.message
);

grupo('Credential drift: a fechadura tem o que o registro não conhece');
const simDrift = new SimuladorDeMundoFisico();
simDrift.injetarDrift('ep-1', 'CARTAO-ANTIGO-9931');
const snapshot = simDrift.estadoFisico('ep-1', t0);
verificar(
  'a leitura física expõe a credencial órfã',
  snapshot.credenciais?.some((c) => c.referenciaExterna === 'CARTAO-ANTIGO-9931') === true
);
verificar(
  'e ela não tem credentialId do nosso lado — é exatamente o sinal de drift',
  snapshot.credenciais?.find((c) => c.referenciaExterna === 'CARTAO-ANTIGO-9931')?.credentialId === undefined
);

grupo('Provedor que não sabe ler estado físico diz que não sabe');
const simCego = new SimuladorDeMundoFisico({ suportaReconciliacaoFisica: false });
const cego = simCego.estadoFisico('ep-1', t0);
igual('o estado é declarado desconhecido', cego.estado, 'DEVICE_SYNC_UNKNOWN');
igual('a lista de credenciais é null, não vazia', cego.credenciais, null);
verificar('e a leitura se declara não confiável', !cego.confiavel);

grupo('Desvio de relógio invalida qualquer janela temporal');
const bancada = montarBancada();
await tick(bancada);
await tick(bancada, 3_000);
bancada.simulador.aplicar({ desvioDeRelogioMs: { 'ep-uti-1': 20 * 60_000 } });
const relatorioRelogio = await tick(bancada, 60_000);
const comDesvio = relatorioRelogio.reconciliacoesFisicas.find((r) => r.endpointId === 'ep-uti-1');
igual('a natureza é o desvio de relógio', comDesvio?.natureza, 'DESVIO_DE_RELOGIO');
igual('a ação é verificar', comDesvio?.action, 'VERIFY');
igual('e a leitura vira desconhecida', comDesvio?.confidence, 'UNKNOWN');
verificar(
  'a frase explica por que nenhuma janela do equipamento é confiável',
  comDesvio?.reason.includes('Nenhuma janela temporal') === true,
  comDesvio?.reason
);

grupo('Item 36 · a política de tentativas tem fim declarado');
let estado = { ...ESTADO_DE_TENTATIVAS_INICIAL };
const esperas: number[] = [];
for (let i = 0; i < RETRY_PADRAO.maxAttempts; i += 1) {
  const anterior = estado;
  estado = proximaTentativa(anterior, RETRY_PADRAO, t0, 'falha simulada');
  if (estado.nextRetryAt) esperas.push(estado.nextRetryAt.getTime() - t0.getTime());
}
igual('o backoff cresce geometricamente', esperas.join(','), '30000,90000,270000,810000');
igual('e a quinta tentativa escala, não tenta de novo', estado.status, 'ESCALATED');
igual('sem próxima tentativa agendada', estado.nextRetryAt, null);

fechar('Simulador v2 e políticas de repetição');
