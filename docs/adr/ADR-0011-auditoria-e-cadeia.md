# ADR-0011 — A auditoria é cadeia encadeada por hash, e todo elo declara o corpo

- **Estado:** aceito
- **Data:** 2026-09-11
- **Substitui:** o armazém de eventos em array da primeira entrega

## Contexto

A primeira versão guardava eventos num array ordenado por data. Funcionava — e
provava nada. Um array pode perder um elemento do meio sem que nenhuma leitura
note. Num produto cuja razão de existir é responder *"quem tinha acesso, até
quando e por quê"*, a linha do tempo que sustenta a resposta precisa ser
**evidência**, e evidência é o que resiste a ser adulterada em silêncio.

## Decisão

`TrilhaDeAcesso` envolve o `Ledger<TipoDeEvento>` do kernel. Três garantias que
o array não tinha:

- **sequência contígua** — apanha evento removido do meio, que é como se esconde
  o que foi decidido;
- **encadeamento por hash** — apanha elo religado a outro ponto;
- **recomputação** — apanha conteúdo editado com os hashes mantidos.

O relógio entra injetado: cadeia cujo hash depende do relógio de parede não é
reproduzível, e cadeia não reproduzível não serve de evidência. A bateria roda
com `RelogioFixo` e a cadeia é idêntica a cada execução.

A deduplicação por chave de idempotência fica **fora** do ledger: o ledger é
append-only e não deve conhecer regra de domínio. Filtrar antes preserva a
propriedade de que todo elo é um fato distinto.

## A separação de autoridade, e a precedência que eu errei

O kernel exige `CorpoDeOrigem` em todo elo (ADR-0003 do MPE-H). O mapeamento
para os quatro motores não precisou ser inventado:

| Corpo | Quem | O que responde |
|---|---|---|
| `DIRETIVO` | Policy Engine, Entitlement Reconciliation | decide o direito |
| `CONSULTIVO` | Observability & Assurance | lê, mede, propõe |
| `EXECUTIVO` | adaptadores e equipamentos | materializa e reporta |
| `HUMANO` | operador, aprovador, supervisor | aprova, recusa, encerra |

**A primeira implementação inverteu a precedência**, e o cenário P1 apanhou: o
corpo vinha de `decisionOrigin`, de modo que toda ordem física enviada pela
ColmeIA aparecia como ato `DIRETIVO`. A cadeia perdia exatamente a separação que
o ADR-0003 existe para preservar — decisão e execução vinham carimbadas iguais,
e a decisão deixava de ser conferível antes de virar ato.

A regra correta: **o corpo vem do TIPO do evento**, que diz que espécie de ato
ele é. `decisionOrigin` responde outra pergunta — quem decidiu o que está sendo
executado — e fica nos detalhes. A exceção é o humano: quando uma pessoa age, o
ato é dela, qualquer que seja o tipo.

### A mistura é contada, não escondida

A catraca em modo standalone decide **e** executa. Registrar como `EXECUTIVO`
puro esconderia a mistura; como `DIRETIVO`, esconderia que a ColmeIA não
participou. O elo recebe `EXECUTIVO` e `detalhes.misturouCorpos = true` — e
`TrilhaDeAcesso.misturasDeCorpo()` soma quantas vezes isso aconteceu, que é
indicador de assurance, não ruído de log.
