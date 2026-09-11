# ADR-0006 — Capacidade antes de ação, e adaptador não integrado recusa

- **Estado:** aceito
- **Data:** 2026-09-11

## Contexto

Integrar fabricantes de controle de acesso é onde arquiteturas desta categoria
apodrecem. Duas falhas se repetem:

1. O sistema descobre que a fechadura não faz revogação remota no momento em que
   tenta revogar — depois de já ter prometido à interface que revogaria.
2. O adaptador ainda não integrado devolve algo plausível para não quebrar o
   fluxo, e o banco passa a conter a afirmação de que uma porta obedeceu, sem
   que porta alguma exista.

## Decisão 1 — capacidade é declaração, não chamada remota

`getProviderCapabilities()` e `getEndpointCapabilities()` respondem SEM rede e
SEM credencial, inclusive em adaptador não integrado. Isso permite que o motor
decida antes de agir, e que a tela diga "este modelo exige visita técnica" em
vez de "revogado".

A suíte de conformidade verifica coerência: `gatewaySupport: true` exige
`getGatewayStatus`; `physicalStateReconciliation: true` exige
`reconcilePhysicalState`; capacidade negada não pode ser exercida com sucesso.

## Decisão 2 — a maturidade vive no código

Todo adaptador declara `statusDeIntegracao` (`IMPLEMENTED` · `SIMULATED` ·
`INTERFACE_READY` · `REQUIRES_VENDOR_INTEGRATION` · `RESEARCH_REQUIRED`) e
`pendenciaDeIntegracao`. Adaptador não-`IMPLEMENTED` com pendência vazia reprova
na conformidade.

## Decisão 3 — o não integrado LANÇA

Toda operação que tocaria hardware num adaptador não integrado lança
`IntegracaoNaoDisponivel`, com o nome da operação e a pendência concreta. A
suíte de conformidade **reprova** um adaptador não integrado que devolva
resultado — as duas formas de passar (operar ou recusar) são igualmente
rigorosas.

## Decisão 4 — a invariante de honestidade do resultado

```
status CONFIRMED exige physicalConfirmation CONFIRMED
```

Um adaptador que responda `CONFIRMED / NOT_CONFIRMED` afirma que a porta obedeceu
e, na mesma estrutura, que ninguém viu. É a alucinação operacional nascendo na
camada mais funda, onde a interface não tem como desmenti-la.

`NOT_SUPPORTED` é distinto de `NOT_CONFIRMED`: o primeiro diz "este fabricante
nunca confirmará, e o sistema precisa conviver com isso" — ressalva permanente
de projeto; o segundo diz "ainda não confirmou, e deve confirmar" — pendência
com prazo.

## Consequências

- Integrar um fabricante novo exige Adapter + Capability Mapping, e nada do
  domínio (item 43). A suíte de conformidade é o que torna essa promessa
  verificável em vez de aspiracional.
- Três adaptadores de fabricante já existem e passam na suíte recusando. Isso
  não é "quase pronto": é a fronteira desenhada e provada antes da integração,
  que é a ordem certa.
