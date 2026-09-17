# ADR-0022 — Explicar acesso: uma pergunta, duas respostas, e a recusa do verdicto retroativo

- **Estado:** aceito
- **Data:** 2026-09-17
- **Complementa:** ADR-0004 (confiança e honestidade), ADR-0011 (auditoria e cadeia)
- **Origem:** a pesquisa em `docs/research/` chamou esta função de estratégica

## Contexto

A explicação já existia, espalhada por seis lugares: a razão da decisão de
política, o verdicto do gate, a alçada congelada, a leitura de competência, a
descrição da divergência física e os componentes do Health Score. Cada uma
correta, nenhuma completa.

Uma auditoria pergunta uma vez só. Obrigar quem responde a montar o
quebra-cabeça de cabeça é transformar seis respostas honestas numa resposta
provável.

## Decisão

### 1. A pergunta é ambígua, e a ambiguidade é o defeito original

*"Fulano tem acesso?"* pode significar duas coisas:

- **a organização quer que ele entre?** — decidida por política, vínculo,
  competência, responsabilidade e aprovação humana;
- **a porta abre para ele?** — decidida pelo equipamento, e que só o
  equipamento confirma.

`explicarAcesso` devolve as duas, **sempre juntas e sempre separadas**. Uma
explicação que respondesse só a primeira reintroduziria exatamente a mentira
que este produto existe para corrigir: diria "tem acesso" sobre uma credencial
que o equipamento nunca recebeu.

O cenário X2 congela isso: com a habilitação suspensa, o veredito lógico é
`NEGA` **e** o último estado confirmado continua sendo `DEVICE_GRANT_CONFIRMED`.
As duas afirmações são verdadeiras ao mesmo tempo, e apresentá-las como uma só
seria falso.

### 2. Camadas nomeadas, não um parágrafo

A resposta é uma lista ordenada — vínculo, turno, papel e lotação,
responsabilidade temporária, competência, segregação, política, aprovação
humana, capacidade do equipamento — e cada camada declara se **sustenta**,
**bloqueia**, **exige revisão**, **não se aplica** ou é **desconhecida**.

Quem lê descobre em qual linha a resposta virou, em vez de reler um texto
procurando a frase decisiva. Isso também impede um tipo específico de engano:
uma camada que não se aplica deixa de parecer uma camada que aprovou.

### 3. Recomputar não é reconstituir — e o verdicto retroativo é recusado

Perguntar sobre **agora** é recomputar: o mundo está aqui, a política roda de
novo, e a resposta é a mesma que o motor daria.

Perguntar sobre **ontem às 14h32** é outra coisa. Este produto guarda os
**atos** na cadeia, não o **estado do mundo** naquele instante. Rodar a política
de hoje sobre a pergunta de ontem produziria uma resposta plausível e falsa — e
plausível é pior do que ausente, porque uma auditoria acreditaria nela.

Então a explicação recusa o verdicto retroativo (`NAO_RECONSTITUIVEL`), diz por
quê, e entrega o que de fato sabe: a sequência de elos daquele endpoint até o
instante perguntado. Menos sedutor, e é o que existe.

Guardar estado histórico para responder de verdade entra no backlog. Não será
fingido enquanto não estiver feito — é a mesma regra que impede afirmar
revogação física sem confirmação (ADR-0004).

### 4. Pergunta sem sujeito não inventa resposta

Vínculo ou endpoint inexistente devolve `SEM_SUJEITO`, e não `NEGA`. A
diferença importa: negar sugere que houve avaliação e ela deu negativo. Aqui
não houve avaliação nenhuma.

## Consequências

- A bateria vai de 574 para **597 verificações**; os cenários de 120 para 140,
  com X1–X4.
- A função vive em `narrativa/`, ao lado da guarda de honestidade e do resumo
  operacional — é o mesmo assunto: frase determinística sobre dado apurado,
  nunca texto gerado por modelo.
- As dependências entram por portas estreitas (`GateNaExplicacao`,
  `ResponsabilidadesNaExplicacao`, `TrilhaNaExplicacao`), e não como as classes
  inteiras. Explicar é leitura; quem lê não precisa poder decidir.
- Todas as camadas são recomputadas a cada chamada. Nada é cacheado, porque um
  cache de explicação envelheceria em silêncio — e explicação velha apresentada
  como atual é a forma mais discreta de mentir.

## O que esta decisão NÃO resolve

- **Não há tela.** A função devolve modelo de visão e frases prontas; ninguém
  as renderiza ainda. A pesquisa chamava isso de "tela Explain Access", e por
  enquanto é uma chamada de código.
- **O passado continua irrespondível.** Reconstituir de verdade exige guardar
  o estado do mundo por instante, ou reexecutar a política sobre um snapshot —
  decisão de arquitetura com custo de armazenamento que ainda não foi tomada.
- **A explicação não diz o que fazer.** Ela diz por que está assim. Sugerir a
  ação seguinte — renovar habilitação, designar responsabilidade, abrir pedido
  — é trabalho de quem conhece a operação, e a IA sobre dado determinístico
  seria o lugar certo, atrás da guarda de honestidade.
- **Capacidade do equipamento aparece só quando falta algo.** Endpoint
  completo não ganha linha, o que é econômico e assimétrico; a tela pode querer
  a lista inteira.
