# ADR-0009 — Aprovação humana não é presumida

- **Estado:** aceito
- **Data:** 2026-09-11
- **Origem:** defeito encontrado ao escrever o cenário H10

## Contexto

A política hospitalar marca certos acessos como `REQUIRE_APPROVAL` — tipicamente
endpoints de criticidade `CRITICAL`, como cofre de psicotrópicos ou área de
segurança excepcional. A intenção é registrar que alguém, com nome, respondeu
por aquela entrada.

A primeira implementação do Entitlement Reconciliation traduzia
`REQUIRE_APPROVAL` em ação `GRANT` com a explicação "aprovação humana
obrigatória antes da materialização". Ou seja: concedia o acesso e escrevia no
log que aprovação era obrigatória. O texto estava certo e o comportamento era o
oposto dele.

## Decisão

`REQUIRE_APPROVAL` produz ação `KEEP` — o direito **não é materializado** —
enquanto não houver aprovação registrada. A aprovação entra pelo mundo lógico,
como conjunto explícito de chaves `${relationshipId}::${endpointId}`, e só
então a ação vira `GRANT`.

As pendências ficam listadas em `pendentesDeAprovacao`, para que a tela de
governança possa mostrá-las a quem tem alçada.

## Consequências

- Um acesso crítico nunca é concedido por inércia do sistema.
- O cenário H10 passa a ser honesto: o supervisor de segurança tem acesso ao
  cofre porque existe uma aprovação registrada na bancada, não porque a política
  cedeu.
- A modelagem da aprovação nesta rodada é mínima (um conjunto de chaves). Uma
  implementação de produção precisa de identidade do aprovador, prazo de
  validade, alçada e trilha — está no backlog, com prioridade alta.

## Lição registrada

O defeito estava na distância entre a mensagem e o efeito. A mensagem descrevia
a regra correta; o código fazia outra coisa. Em sistemas de governança isso é
especialmente perigoso, porque a mensagem é o que o auditor lê — e ela passaria
na auditoria enquanto a porta abria.
