#!/usr/bin/env node
// ---------------------------------------------------------------------------
// LINT DE ESTADO BOOLEANO — o item 2 como condição de CI
//
// "Nunca usar um único booleano `hasAccess = true/false` como representação
//  completa do estado."
//
// Uma regra escrita em documento sobrevive até a primeira sexta-feira em que
// alguém precisa terminar uma tela. Este lint a torna executável: qualquer
// campo, variável ou propriedade que colapse acesso físico num booleano faz a
// bateria falhar, com o arquivo e a linha.
//
// O que ele NÃO proíbe: booleanos legítimos sobre fatos que realmente são
// binários — `vinculoVigente`, `bateriaCritica`, `decidiuLocalmente`. A
// distinção está na lista de radicais abaixo: o alvo é a representação do
// ESTADO DE ACESSO, não o uso de booleanos em geral.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignorar = new Set(['node_modules', 'dist', '.git', 'ferramentas']);

/** Padrões que colapsam estado de acesso num booleano. */
const PROIBIDOS = [
  { padrao: /\bhasAccess\b/, motivo: 'hasAccess colapsa quatro camadas de estado numa só' },
  { padrao: /\btemAcesso\b/, motivo: 'temAcesso colapsa quatro camadas de estado numa só' },
  { padrao: /\b(isRevoked|revogado)\s*[:=]\s*(true|false|boolean)\b/, motivo: 'revogação não é booleano: há revogação lógica e confirmação física' },
  { padrao: /\b(isGranted|concedido)\s*[:=]\s*(true|false|boolean)\b/, motivo: 'concessão não é booleano: aceita pela nuvem ≠ aplicada no equipamento' },
  { padrao: /\b(acessoLiberado|accessGranted)\s*[:=]\s*(true|false|boolean)\b/, motivo: 'estado de acesso exige as quatro camadas' },
  { padrao: /\bportaTrancada\b|\bdoorLocked\s*[:=]\s*(true|false|boolean)/, motivo: 'estado da porta sem evidência é DEVICE_SYNC_UNKNOWN, não false' },
  { padrao: /\bsincronizado\s*[:=]\s*(true|false|boolean)\b/, motivo: 'sincronização tem confirmação, pendência e desconhecimento' }
];

function listar(diretorio) {
  const saida = [];
  for (const nome of readdirSync(diretorio)) {
    if (ignorar.has(nome)) continue;
    const arquivo = path.join(diretorio, nome);
    if (statSync(arquivo).isDirectory()) saida.push(...listar(arquivo));
    else if (/\.tsx?$/.test(nome)) saida.push(arquivo);
  }
  return saida;
}

const achados = [];
for (const arquivo of listar(raiz)) {
  const linhas = readFileSync(arquivo, 'utf8').split(/\r?\n/);
  linhas.forEach((linha, indice) => {
    // Comentário que CITA a proibição é o lugar certo para ela aparecer.
    const semComentario = linha.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    for (const { padrao, motivo } of PROIBIDOS) {
      if (padrao.test(semComentario)) {
        achados.push(`${path.relative(raiz, arquivo)}:${indice + 1} — ${motivo}\n      ${linha.trim()}`);
      }
    }
  });
}

if (achados.length > 0) {
  console.error('LINT DE ESTADO BOOLEANO REPROVADO — o item 2 foi violado:');
  for (const achado of achados) console.error(`  · ${achado}`);
  process.exit(1);
}

console.log('LINT DE ESTADO BOOLEANO APROVADO — nenhum colapso de estado de acesso em booleano.');
