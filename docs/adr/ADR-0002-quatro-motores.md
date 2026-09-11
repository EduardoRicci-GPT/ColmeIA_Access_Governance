# ADR-0002 — Quatro motores, e a IA sobre eles, nunca no lugar deles

- **Estado:** aceito
- **Data:** 2026-09-11

## Contexto

A arquitetura anterior tinha dois motores: Policy Engine e Entitlement
Reconciliation. Os dois juntos respondem "quais direitos deveriam existir" — e
nada além disso. Nenhum dos dois sabe se uma porta abre.

A tentação natural, num produto que já usa modelos de linguagem em outras
frentes do ecossistema, é fechar essa lacuna com IA: pedir ao modelo que
interprete o estado dos equipamentos e informe o operador. Essa é a decisão que
este ADR recusa.

## Decisão

Quatro motores determinísticos, em sequência, com a IA operando *sobre* os
quatro:

1. **Policy Engine** — interpreta regras e contexto.
2. **Entitlement Reconciliation** — quais direitos deveriam existir.
3. **Physical State Reconciliation** — o que foi de fato materializado.
4. **Observability & Assurance** — disponibilidade, divergência, atraso, risco.

A IA pode resumir, agrupar, explicar, sugerir prioridade e propor investigação.
Não pode decidir política, não pode classificar severidade e não pode afirmar
estado físico. Toda frase que ela produzir sobre estado físico atravessa a
guarda de honestidade (ADR-0004) antes de chegar a uma pessoa.

## Por quê

Três motivos, em ordem de peso:

**Auditabilidade.** Uma decisão de acesso hospitalar precisa ser reproduzível
anos depois, diante de um auditor. Função pura de (regras, entrada) reproduz;
inferência não.

**Responsabilidade.** Severidade define quem é acordado às 3h e o que entra em
relatório de conformidade. Uma severidade que muda de execução para execução não
sustenta nenhuma dessas duas coisas.

**Modo de falha.** Um motor determinístico que erra, erra sempre igual — e o
erro é encontrável por teste. Um modelo que erra raramente é muito mais difícil
de flagrar, e o erro chega em produção.

## Consequências

- O custo de escrever cada regra é maior: a tabela de risco é código, não prompt.
- Em compensação, os cenários P1, P2 e H7–H10 são verificáveis por bateria, e
  qualquer mudança de peso ou limiar quebra um teste e provoca discussão.
- A IA continua sendo o que traz valor de LEITURA: transformar dezoito linhas de
  divergência em "há três revogações pendentes na Farmácia porque o gateway caiu
  às 08:17" é trabalho de linguagem, e ela o faz bem — sobre dados que não
  inventou.
