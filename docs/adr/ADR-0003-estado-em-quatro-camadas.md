# ADR-0003 — Estado de acesso em quatro camadas, e a proibição do booleano

- **Estado:** aceito
- **Data:** 2026-09-11

## Contexto

`hasAccess: boolean` é a representação mais comum de estado de acesso em
software, e é a origem estrutural da falha que este produto existe para
eliminar. O booleano colapsa quatro perguntas independentes numa só:

1. A organização quer que esta pessoa entre?
2. O nosso registro reflete essa vontade?
3. O provedor aceitou a ordem?
4. O equipamento obedeceu?

## Decisão

`AccessState` tem quatro campos de estado mais duas marcas temporais:

```ts
type AccessState = {
  desiredState: DesiredAccessState
  cloudState: CloudAccessState
  providerState: ProviderAccessState
  deviceState: DeviceAccessState
  lastConfirmedState: DeviceAccessState | null
  lastSyncAt: Date | null
}
```

`lastConfirmedState` é campo separado de `deviceState` por uma razão que não é
redundância: o primeiro é **evidência** (o equipamento nos disse), o segundo é
**leitura** (o que o sistema conclui agora, possivelmente por inferência).
`null` em `lastConfirmedState` é estado legítimo e frequente — significa que o
equipamento nunca confirmou nada — e a interface é obrigada a mostrá-lo como
incerteza.

A única forma legítima de perguntar "a pessoa entra?" é `lerAcessoFisico()`, que
devolve **três** valores: `PERMITE_ENTRADA`, `NAO_PERMITE_ENTRADA` e
`INDETERMINADO`. O terceiro não é erro do chamador: é a resposta correta quando
não há evidência, e a obrigação de tratá-lo é o que impede a interface de mentir.

## Aplicação

A regra é verificada por `ferramentas/lint-estado-booleano.mjs`, que roda na
bateria e recusa `hasAccess`, `temAcesso`, `portaTrancada`, `sincronizado:
boolean` e afins. Booleanos sobre fatos genuinamente binários
(`vinculoVigente`, `bateriaCritica`, `decidiuLocalmente`) continuam permitidos —
o alvo é a representação do estado de acesso, não o tipo `boolean`.

No banco, a mesma decisão aparece como ausência de coluna: `access_state` tem
quatro colunas de estado e nenhuma booleana. Uma consulta que queira saber quem
entra na farmácia precisa declarar qual camada está perguntando, e essa fricção
é intencional.

## Consequências

- Todo consumidor de estado fica mais verboso. É o preço, e é o produto.
- O critério do item 41 passa a ser expressável em uma linha de teste:
  `desiredState === 'ENTITLEMENT_REVOKED' && lastConfirmedState === 'DEVICE_GRANT_CONFIRMED'`.
