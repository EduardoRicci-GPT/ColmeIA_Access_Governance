#!/usr/bin/env node
// ---------------------------------------------------------------------------
// VERIFICADOR DO ESPELHO MPE-H
//
// O kernel MPE-H (Ledger · HumanGate · Calibration) é CÓPIA, não dependência.
// Copiar resolve um problema real — este produto precisa compilar dentro de um
// aplicativo de gestão hospitalar, sem exigir o checkout da Aletheia — e cria
// outro, que é a divergência silenciosa: alguém corrige um defeito aqui, a
// origem nunca fica sabendo, e as duas frentes passam a decidir por critérios
// diferentes com o mesmo nome.
//
// Este verificador impede o segundo problema de duas maneiras:
//
//   1. INTEGRIDADE DA CÓPIA — cada arquivo confere com o sha256 registrado no
//      manifesto. Editar o espelho quebra a bateria, aqui, agora.
//   2. DERIVA EM RELAÇÃO À ORIGEM — quando a origem está no disco (mesmo
//      repositório), compara os dois lados e RELATA a diferença. Relatar, e não
//      travar: a origem evoluir é normal e esperado; o que não pode é evoluir
//      sem ninguém notar.
//
// A regra do manifesto é a mesma do ENGINE_MANIFEST.json da Aletheia:
// correção vai para a origem e volta por nova cópia com novo hash.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const espelho = path.resolve(aqui, '..', 'packages', 'mpeh-kernel');
const manifesto = JSON.parse(readFileSync(path.join(espelho, 'MPEH_MANIFEST.json'), 'utf8'));

const sha = (caminho) => createHash('sha256').update(readFileSync(caminho)).digest('hex');

const quebrados = [];
const ausentes = [];
for (const arquivo of manifesto.arquivos) {
  const caminho = path.join(espelho, arquivo.caminho);
  if (!existsSync(caminho)) {
    ausentes.push(arquivo.caminho);
    continue;
  }
  const atual = sha(caminho);
  if (atual !== arquivo.sha256) {
    quebrados.push(`${arquivo.caminho}\n      manifesto: ${arquivo.sha256}\n      em disco : ${atual}`);
  }
}

console.log(`ESPELHO MPE-H — ${manifesto.arquivos.length} arquivo(s), origem ${manifesto.origem.repositorio}@${manifesto.origem.commit.slice(0, 8)}`);

if (ausentes.length > 0 || quebrados.length > 0) {
  console.error('\nESPELHO MPE-H REPROVADO — a cópia foi alterada:');
  for (const a of ausentes) console.error(`  · AUSENTE: ${a}`);
  for (const q of quebrados) console.error(`  · ALTERADO: ${q}`);
  console.error(`\n${manifesto.regra}`);
  process.exit(1);
}

// --- Deriva em relação à origem, quando ela está no disco -------------------
const origem = path.resolve(aqui, '..', '..', manifesto.origem.caminho);
if (!existsSync(origem)) {
  console.log('ESPELHO ÍNTEGRO. Origem não está neste checkout: deriva não verificada.');
  process.exit(0);
}

const derivados = [];
for (const arquivo of manifesto.arquivos) {
  const naOrigem = path.join(origem, arquivo.caminho);
  if (!existsSync(naOrigem)) {
    derivados.push(`${arquivo.caminho} — não existe mais na origem`);
    continue;
  }
  if (sha(naOrigem) !== arquivo.sha256) derivados.push(`${arquivo.caminho} — a origem mudou desde a cópia`);
}

if (derivados.length > 0) {
  console.log('\nESPELHO ÍNTEGRO, mas a ORIGEM AVANÇOU:');
  for (const d of derivados) console.log(`  · ${d}`);
  console.log('\nNão é falha: é aviso. Recopie deliberadamente e atualize o manifesto,');
  console.log('ou registre por que esta frente fica na versão antiga.');
  process.exit(0);
}

console.log('ESPELHO MPE-H APROVADO — cópia íntegra e em dia com a origem.');
