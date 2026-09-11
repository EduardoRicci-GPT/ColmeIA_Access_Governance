// ---------------------------------------------------------------------------
// GERADOR DO PAINEL ACCESS ASSURANCE
//
// Roda um turno hospitalar completo contra o MockAccessProvider e escreve o
// painel. O cenário é deliberadamente misto — coisas que funcionaram, coisas
// que estão pendentes e coisas que o sistema não sabe — porque um painel só
// prova alguma coisa quando precisa mostrar as três ao mesmo tempo.
//
//   node --import tsx colmeia-acesso/ferramentas/gerar-painel.ts [saida.html]
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { montarBancada, tick } from '../testes/bancada';
import { construirLinhaDoTempo } from '../packages/assurance-ui/timeline';
import { montarPainel } from '../packages/assurance-ui/painel';
import { renderizarPainel } from '../packages/assurance-ui/render';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.resolve(process.argv[2] ?? path.join(raiz, '.saida', 'painel-access-assurance.html'));

const bancada = montarBancada();

// 08:00 — o turno começa. Direitos concedidos e materializados.
await tick(bancada);
await tick(bancada, 3_000);

// 08:17 — o gateway do bloco clínico cai. Farmácia e UTI ficam sem alcance.
bancada.relogio.avancarMs(14 * 60_000);
bancada.simulador.colocarGatewayOffline('gw-central');
bancada.simulador.colocarEndpointOffline('ep-farm-1');
bancada.simulador.colocarEndpointOffline('ep-farm-2');
bancada.mundo = {
  ...bancada.mundo,
  topologia: {
    ...bancada.mundo.topologia,
    gateways: bancada.mundo.topologia.gateways.map((g) =>
      g.id === 'gw-central'
        ? { ...g, status: 'OFFLINE' as const, lastSeenAt: bancada.relogio.agora() }
        : g
    )
  }
};

// 08:20 — o RH encerra dois vínculos: a farmacêutica e o supervisor de segurança.
bancada.mundo = {
  ...bancada.mundo,
  vinculos: bancada.mundo.vinculos.map((v) =>
    v.id === 'vin-marina' || v.id === 'vin-rui' ? { ...v, situacao: 'TERMINATED' as const } : v
  )
};
await tick(bancada, 3 * 60_000);

// 09:50 — noventa minutos depois, nada foi confirmado. O risco amadurece.
const relatorio = await tick(bancada, 90 * 60_000);

const timelines = ['CRED-vin-marina-ep-farm-2', 'CRED-vin-rui-ep-seg-1'].map((credencial) => {
  const endpointId = credencial.endsWith('ep-seg-1') ? 'ep-seg-1' : 'ep-farm-2';
  return construirLinhaDoTempo(credencial, bancada.auditoria.trilha(`COR::${endpointId}::${credencial}`));
});

const painel = montarPainel(bancada.mundo.topologia, relatorio.assurance, timelines);
const html = renderizarPainel(painel, { documentoCompleto: true });

mkdirSync(path.dirname(destino), { recursive: true });
writeFileSync(destino, html, 'utf8');

// Fragmento sem <html>/<head>/<body>, para publicação como Artifact.
const fragmento = destino.replace(/\.html$/, '.fragmento.html');
writeFileSync(fragmento, renderizarPainel(painel, { documentoCompleto: false }), 'utf8');

console.log(`Painel escrito em ${destino}`);
console.log(`  Health Score da organização: ${painel.raiz.score}/100`);
console.log(`  Escopos avaliados: ${painel.escopos.length}`);
console.log(`  Divergências na fila: ${painel.filaDeRisco.length}`);
console.log(`  Itens sem evidência física: ${painel.incertezas}`);
console.log(`  Casos de escalonamento abertos: ${painel.casos.length}`);
for (const linha of painel.resumo) console.log(`  · ${linha.texto}`);
