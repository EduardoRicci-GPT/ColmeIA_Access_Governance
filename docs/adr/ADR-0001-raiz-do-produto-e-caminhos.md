# ADR-0001 — Raiz do produto dentro da Aletheia, com os caminhos da especificação preservados

- **Estado:** aceito quanto aos caminhos; o enquadramento foi corrigido pelo ADR-0010
- **Data:** 2026-09-11
- **Conflito registrado com documento anterior:** sim (ver "Conflito" abaixo)

## Contexto

A especificação de atualização determina a criação de pacotes em caminhos
absolutos a partir da raiz do repositório: `/packages/physical-state-reconciliation`,
`/packages/observability-assurance`, `/packages/context-projection`,
`/packages/adapters/ttlock`, `/packages/adapters/control-id`, `/packages/adapters/seam`.

O repositório Aletheia já possui `packages/mpeh-kernel`, que é o kernel do
produto de notícias e está sob posse declarada de outra sessão (`COLMEIA.md`,
Regra 1). Criar os pacotes de governança de acesso diretamente em `packages/`
os misturaria com o kernel de um produto diferente, e violaria a partição de
posse que existe justamente para permitir trabalho paralelo.

## Decisão

O produto vive em `colmeia-acesso/`, e **dentro dessa raiz os caminhos da
especificação são preservados um a um**:

```
colmeia-acesso/packages/physical-state-reconciliation
colmeia-acesso/packages/observability-assurance
colmeia-acesso/packages/context-projection
colmeia-acesso/packages/adapters/{contrato,mock,ttlock,control-id,seam}
```

A subárvore é autossuficiente: tem `tsconfig.json` próprio (com prova de pureza,
nos moldes de `packages/mpeh-kernel/tsconfig.json`), bateria própria em
`testes/`, ferramentas próprias em `ferramentas/` e documentação própria em
`docs/`. Não importa nada da Aletheia e nada da Aletheia importa dela.

## Conflito com a definição anterior

A especificação diz `/packages/<nome>`; a entrega usa
`colmeia-acesso/packages/<nome>`. O conflito é de PREFIXO, não de estrutura: a
árvore interna, os nomes de pacote e as fronteiras entre eles são exatamente os
especificados. A rastreabilidade da decisão anterior fica preservada por este
registro.

Se o produto for extraído para repositório próprio — o que a Regra 7 do
`COLMEIA.md` sugere como caminho natural quando um módulo amadurece — bastará
promover `colmeia-acesso/` a raiz, e os caminhos da especificação passam a valer
literalmente, sem nenhuma alteração de import.

## Consequências

- A bateria da Aletheia (`npm run verificar`) passa a cobrir também este código,
  porque o `tsc --noEmit` da raiz varre o repositório inteiro. Isso é desejado:
  o sistema imunológico comum vale para as duas frentes.
- Nenhum arquivo existente da Aletheia foi modificado, exceto `package.json`
  (scripts novos, prefixados `acesso:`) e `.gitignore` (diretório de saída).
- O acoplamento entre os dois produtos é zero, e verificável: nenhum import
  atravessa a fronteira em nenhuma direção.

## Alternativas rejeitadas

**Criar repositório novo.** Seria mais limpo a longo prazo, mas o fluxo de
trabalho desta rodada opera sobre branches designadas em três repositórios
existentes, e abrir um quarto fora desse acordo é decisão do autor, não da
sessão.

**Usar `packages/` diretamente.** Rejeitada pela Regra 1 do `COLMEIA.md`:
`packages/` está sob posse declarada de outra frente.
