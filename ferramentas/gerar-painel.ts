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

import { aprovarCofre, materialDoCofre, montarBancada, tick } from '../testes/bancada';
import { construirLinhaDoTempo } from '../packages/assurance-ui/timeline';
import {
  montarPainel,
  ordenarHabilitacoes,
  ordenarResponsabilidades
} from '../packages/assurance-ui/painel';
import { explicarAcesso } from '../packages/narrativa/explicacao';
import { avisosDaEmergencia } from '../packages/governanca';
import { PolicyEngine, REGRAS_HOSPITALARES_BASE } from '../packages/policy-engine';
import { renderizarPainel } from '../packages/assurance-ui/render';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.resolve(process.argv[2] ?? path.join(raiz, '.saida', 'painel-access-assurance.html'));

const bancada = montarBancada();

// 08:00 — o turno começa. O cofre CRITICAL entra na fila de aprovação e só
// é materializado depois de duas assinaturas contra o material selado.
const primeiro = await tick(bancada);
await aprovarCofre(bancada, materialDoCofre(primeiro));
await tick(bancada, 1_000);
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

// 08:25 — parada no leito 3 da UTI. O cofre de psicotrópicos é CRITICAL e o
// gate exige duas assinaturas de pessoas distintas; as duas estão ocupadas,
// possivelmente com o mesmo paciente. O vidro é quebrado, a janela é de quinze
// minutos, e a revisão nasce aberta.
bancada.emergencias.invocar({
  id: 'VIDRO-DEMO',
  personId: 'p-clara',
  relationshipId: 'vin-clara',
  endpointId: 'ep-cofre-psico',
  zonaId: 'z-farmacia',
  criticidade: 'CRITICAL',
  natureza: 'PARADA_CARDIORRESPIRATORIA',
  justificativa: 'Parada em curso; psicotrópico do carro de emergência, sem tempo de deliberar.',
  invocadaPor: 'clara.enfermagem',
  em: bancada.relogio.agora()
});
await tick(bancada, 60_000);

// 09:50 — noventa minutos depois, nada foi confirmado. O risco amadurece, e a
// janela da emergência já fechou há mais de uma hora sem que ninguém revisasse:
// é a dívida que a seção de quebra de vidro existe para não deixar sumir.
const relatorio = await tick(bancada, 90 * 60_000);

const integridade = await bancada.trilha.verificarIntegridade();
const timelines = [];
for (const credencial of ['CRED-vin-marina-ep-farm-2', 'CRED-vin-rui-ep-seg-1']) {
  const endpointId = credencial.endsWith('ep-seg-1') ? 'ep-seg-1' : 'ep-farm-2';
  const elos = await bancada.trilha.trilhaDe(`COR::${endpointId}::${credencial}`);
  timelines.push(construirLinhaDoTempo(credencial, elos, integridade));
}

// O caso a explicar é escolhido deterministicamente: a primeira pendência da
// fila, que já vem ordenada por urgência de porta fechada (ADR-0017); na
// ausência dela, o topo da fila de risco. Escolher "o mais recente" daria à
// tela um caso diferente a cada volta do relógio, e nenhuma razão para ele.
const pendencias = bancada.gate.pendencias();
const alvo =
  pendencias.length > 0
    ? { relationshipId: pendencias[0]!.relationshipId, endpointId: pendencias[0]!.endpointId }
    : relatorio.assurance.filaDeRisco.length > 0
      ? {
          relationshipId: 'vin-rui',
          endpointId: relatorio.assurance.filaDeRisco[0]!.endpointId
        }
      : null;

const explicacao = alvo
  ? await explicarAcesso(alvo, {
      mundo: bancada.mundo,
      politica: new PolicyEngine(REGRAS_HOSPITALARES_BASE),
      registros: bancada.registros,
      relogio: bancada.relogio,
      gate: bancada.gate,
      responsabilidades: bancada.responsabilidades,
      trilha: bancada.trilha
    })
  : undefined;

const habilitacoes = bancada.mundo.pessoas.flatMap((pessoa) =>
  bancada.competencias.habilitacoesDe(pessoa.id)
);

const painel = montarPainel(bancada.mundo.topologia, relatorio.assurance, timelines, {
  responsabilidades: ordenarResponsabilidades(
    bancada.responsabilidades.todas(),
    bancada.relogio.agora()
  ),
  habilitacoes: ordenarHabilitacoes(habilitacoes, bancada.relogio.agora()),
  emergencias: {
    quebras: bancada.emergencias.todas(),
    // Comunicar é ato de uma vez só, então a tela lê o acumulado — nunca o
    // ciclo corrente, que estaria vazio noventa minutos depois do fato.
    chamados: bancada.plantao.linhasAcumuladasDeEmergencia(),
    avisos: avisosDaEmergencia(),
    ligada: true
  },
  explicacao,
  aprovacoes: {
  fila: bancada.gate.pendencias(),
  avisos: bancada.gate.avisosDaVigencia(),
  // O chamado do último ciclo entra na tela junto da fila. Sem isto, cada
  // cartão apareceria sem linha de aviso — e um cartão sem linha diria ao
  // operador que o assunto está com alguém, quando pode não estar com ninguém.
  chamados: bancada.plantao.linhasAcumuladas(),
    temCanal: bancada.plantao.temCanal
  },
  segregacao: {
  linhas: relatorio.conflitosDeSegregacao.map((achado) => ({
    relationshipId: achado.relationshipId,
    personId: achado.personId,
    rotulo: achado.conflito.rotulo,
    origem: achado.conflito.origem,
    atividades: achado.conflito.atividades.join(' × '),
    papeis: achado.conflito.papeisEnvolvidos,
    explicacao: achado.conflito.explicacao,
    procedencia: achado.conflito.procedencia
  })),
    avaliada: relatorio.segregacaoAvaliada
  }
});
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
console.log(`  Fila de aprovação: ${painel.filaDeAprovacao.length} pedido(s)`);
for (const pendencia of painel.filaDeAprovacao) {
  const prazo =
    pendencia.minutosRestantes === null
      ? 'sem prazo'
      : `${Math.round(pendencia.minutosRestantes)} min restantes`;
  console.log(`    · ${pendencia.nomeDoEndpoint} — ${pendencia.estado} (${prazo})`);
}
console.log(
  `  Cadeia de auditoria: ${integridade.total} elo(s), ${integridade.integra ? 'ÍNTEGRA' : 'ROMPIDA'}`
);
console.log(`  Calibragem: ${painel.avisoDeCalibragem ?? 'todos os pesos instrumentados'}`);
console.log(`  Freio da parceria: ${relatorio.freio.decisao} — ${relatorio.freio.motivo}`);
for (const linha of painel.resumo) console.log(`  · ${linha.texto}`);
