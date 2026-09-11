# ADR-0012 — A aprovação humana é ligada ao conteúdo revisado

- **Estado:** aceito
- **Data:** 2026-09-11
- **Substitui:** ADR-0009, que corrigiu o comportamento e manteve a estrutura errada

## Contexto

O ADR-0009 corrigiu um defeito real: `REQUIRE_APPROVAL` concedia acesso enquanto
escrevia "aprovação humana obrigatória" no log. A correção foi manter o direito
em `KEEP` até haver aprovação registrada — registrada num `Set<string>` de chaves
`${relationshipId}::${endpointId}`.

O que o ADR-0009 não viu: **uma chave num conjunto aprova a porta, para sempre,
independentemente do que motivou a aprovação.** Sobe a criticidade do endpoint,
muda o papel da pessoa, o vínculo vira prestador — a chave continua lá, e
continua abrindo. O supervisor aprovou uma coisa e o sistema executa outra, sem
que ninguém tenha mentido.

É o ataque mais simples que existe contra revisão humana, e o único que um
booleano — ou uma chave — jamais detecta.

## Decisão

O human-gate do MPE-H substitui o conjunto. A aprovação é ligada ao **hash do
material revisado**:

```
pessoa · vínculo (tipo) · papéis (ordenados) · endpoint · zona · criticidade · razão da política
```

Mude qualquer um, e o hash muda; mudou o hash, a aprovação **deixa de valer
sozinha** — ninguém precisa lembrar de revogá-la.

Três consequências que a estrutura anterior não tinha:

1. **Criticidade `CRITICAL` exige duas pessoas distintas.** Não é burocracia: é a
   defesa contra a fadiga de plantão, que é justamente quando um cofre de
   psicotrópicos é liberado às pressas.
2. **A autoridade vem do host.** `AutoridadeDoHost` é porta: num aplicativo de
   gestão hospitalar, quem responde é o RBAC do próprio aplicativo. Reimplementar
   aqui produziria uma segunda verdade sobre quem manda no hospital.
3. **O material viaja na ação.** A fila de pendências da tela mostra exatamente o
   que será aprovado — uma fila que mostrasse só "Fulano quer entrar no cofre"
   pediria ao supervisor que assinasse um resumo.

## Defeito encontrado durante a implementação

`reavaliar(material)` gravava o verdicto **sempre**. Consultar *"e se a
criticidade tivesse mudado?"* apagava o registro da aprovação verdadeira, e o
acesso legítimo passava a ser negado por causa de uma pergunta.

Corrigido: o verdicto guardado só é atualizado quando o material consultado é o
mesmo que foi revisado. **Consulta não muda o que foi aprovado** — num sistema de
governança, a distinção entre um registro e um rascunho é essa.

E `decidir` avalia contra o material **selado no pedido**, não contra o que veio
na chamada: avaliar contra o parâmetro permitiria ao chamador aprovar uma coisa
apresentando outra, invertendo o gate.
