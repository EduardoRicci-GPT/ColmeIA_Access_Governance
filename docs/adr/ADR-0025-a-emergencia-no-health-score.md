# ADR-0025 — A emergência no Health Score: cobrar a conta sem cobrar o socorro

**Estado:** aceito
**Data:** 2026-09-17
**Sucede:** ADR-0023 (quebra de vidro), ADR-0024 (o aviso da emergência)
**Relacionado:** ADR-0011 (calibragem dos pesos), item 7 (score que abre)

## Contexto

O ADR-0023 fechou com três dívidas declaradas; a segunda e a terceira foram
pagas pelo ADR-0024 e por este. A que sobrava aqui era: *"o Health Score não
sente a repetição. Três quebras na mesma zona deveriam pesar; hoje são um número
que ninguém lê."*

`contagemPorZona()` existia desde o primeiro dia da quebra de vidro e nenhum
score a lia. É o mesmo padrão que o ledger deste repositório registra como
D-022, aplicado a um número em vez de a uma porta: uma leitura que só é exercida
em teste é uma leitura que não existe.

Mas o caminho óbvio — "quebrou o vidro, perde ponto" — é uma armadilha, e vale
dizer exatamente por quê.

## A armadilha, e a decisão que a evita

Um score que penalizasse a invocação criaria pressão para não invocar. E o que
se faz quando não se pode quebrar o vidro já está descrito no topo de
`emergencia.ts`: escorar a porta, emprestar o crachá, arrombar o armário de
verdade. Nenhuma dessas três deixa registro. O produto teria trocado uma exceção
auditada por uma exceção invisível, e o painel ficaria mais verde justamente
enquanto a operação piorasse — que é o artifício que este produto recusa desde o
item 41.

Então a decisão central é de RECORTE, não de peso:

**O score não vê a quebra de vidro. Vê a conta que ficou.**

Isso se desdobra em duas leituras separadas, e separá-las é deliberado:

**`REVISOES_DE_EMERGENCIA`** conta as quebras cuja janela já fechou e que
ninguém revisou. Uma quebra EM CURSO não entra: é atendimento acontecendo. Uma
quebra invocada e revisada no mesmo turno custa **zero** — e há verificação
dedicada a isso, porque é a propriedade da qual tudo o mais depende. O peso
(2) fica deliberadamente ABAIXO do da revogação pendente (3), por natureza: uma
revogação pendente é porta que abre agora para quem não devia entrar; uma
revisão em aberto é dívida sobre uma porta que já fechou. As duas contam; só uma
é risco vivo. A ponderação por criticidade do endpoint reaproveita o
multiplicador que já pondera a revogação pendente, em vez de inventar uma
segunda escala.

**`EMERGENCIA_RECORRENTE`** conta as repetições além da primeira, por zona. Aqui
o peso é maior (3), e também por natureza: a repetição não é um incidente, é o
sintoma de um modelo de acesso que não serve para o trabalho daquela zona — a
escala não fecha, ou a política pede duas assinaturas onde nunca há duas
pessoas. Isso não se resolve revisando mais depressa.

E há uma linha que este componente não atravessa. O ADR-0023 registrou que
julgar repetição é jurisdição humana, e continua sendo: o rótulo diz *"o caminho
normal de acesso não está dando conta do trabalho que se faz ali"*, a evidência
é a **zona**, e nenhuma pessoa aparece. O achado é sobre o desenho da
organização. O score não acusa ninguém, e há verificação disso também.

## A janela de recorrência, e por que ela precisou existir

Sem janela, a contagem de uma zona só cresce, o score dela nunca volta a subir, e
uma unidade que corrigiu a causa fica marcada para sempre — o que ensina a
equipe a ignorar o número em vez de consertar o que o produz.

Trinta dias, em SOMBRA como todo o resto, com a procedência declarada: é o ciclo
de fechamento administrativo e de escala hospitalar, o período sobre o qual uma
coordenação de fato senta e revisa o que aconteceu. A direção do efeito é o que
autoriza usar um valor em sombra: a janela decide apenas o que o score NOTA.
Mais curta esquece antes, mais longa lembra mais, e nenhuma das duas abre porta.

O registro, note-se, não esquece nada. Só o score tem janela — e há verificação
separando as duas coisas.

## Duas portas sobre o mesmo registro

`MundoLogico` passou a ter dois campos apontando para o mesmo
`RegistroDeQuebraDeVidro`: `emergencias`, tipado como `ConsultaDeEmergencia`, e
`historicoDeEmergencias`, tipado como `HistoricoDeEmergencias`.

Parece redundância e não é. O motor de política enxerga só o booleano — "há
janela ativa para este vínculo nesta porta?" —, e o histórico fica fora do
alcance dele **de propósito**: um motor que soubesse quantas vezes a pessoa já
quebrou o vidro estaria a um passo de decidir a porta com base nisso, e aí a
exceção teria virado antecedente. A observabilidade precisa do histórico, e o
uso dela é de outra natureza: não decide porta nenhuma, orienta prioridade.

Duas portas sobre um objeto é como se diz isso no tipo, em vez de no comentário.

A travessia usa uma projeção escrita à mão (`QuebraDeVidroProjetada`), pela mesma
razão que a trilha projeta o material de revisão campo a campo: uma cópia por
referência faria o próximo campo acrescentado à emergência atravessar sozinho,
sem ninguém decidir que podia. Não atravessam a justificativa livre, a natureza,
quem invocou nem a nota da revisão — o score não precisa de nenhuma delas para
orientar prioridade, e quem precisa lê o registro, não o painel.

## Alternativas descartadas

**Penalizar a invocação.** A armadilha descrita acima. Descartada por incentivo,
não por aritmética.

**Um limiar de repetição ("três na mesma zona no mesmo mês").** Exigiria um
segundo número calibrado para decidir o que conta como muito. A penalidade
proporcional dispensa o limiar: a segunda quebra já custa, a quarta custa mais,
e ninguém precisou arbitrar onde fica a fronteira do abuso.

**Somar as duas leituras num componente só.** A repetição desapareceria dentro
da dívida assim que alguém revisasse — e a zona que quebra o vidro toda semana e
revisa direitinho é exatamente o caso que o produto mais precisa enxergar.

**Decaimento por tempo na dívida de revisão.** Uma revisão em aberto há três
semanas pesar mais que uma de ontem é defensável, e exigiria uma terceira
constante. A tela já ordena a dívida da mais antiga para a mais nova
(ADR-0024), que é onde a idade da conta tem consequência sem virar número.

## Consequências

- A bateria vai de 670 para **696 verificações**; os cenários hospitalares de
  213 para 227, com B7 e B8, e o Health Score de 19 para 30.
- `PesosDeHealth` ganha dois pesos, e o registro de calibragem vai de 12 para
  **14 constantes** — todas em SOMBRA, como as anteriores. O teste que conta os
  pesos continua com o número explícito, de propósito: um peso que entre sem
  ninguém decidir move o score de todo mundo em silêncio.
- `AccessGovernanceHealth` ganha `pendingBreakGlassReviews` e
  `recurringBreakGlass`. O score continua abrindo: `somaDosComponentes` fecha
  com a emergência dentro, e há verificação.
- O recorte por escopo é o mesmo de todo o resto — a conta aparece no endpoint,
  na zona, no hospital e na rede, recalculada sobre os mesmos fatos, com o mesmo
  identificador por trás (item 8).
- Um achado do caminho: o cenário B5 e o gerador de painel invocavam a quebra
  sobre um endpoint que não existe na topologia da bancada. O registro não
  conhece a topologia — quem sabe as portas é o host —, então a quebra era aceita
  e sumia do score sem reclamar. Corrigido, com uma verificação que impede a
  volta.

## O que esta decisão NÃO resolve

- **Ninguém confirma que a conta foi vista.** O score desce, a tela mostra, e
  nada garante que alguém olhou. Confirmação de leitura é a mesma lacuna que o
  ADR-0024 declarou para o chamado.
- **A janela de recorrência é uma só para toda a instalação.** Uma UTI e um
  arquivo administrativo têm ciclos de revisão diferentes, e hoje dividem o mesmo
  mês.
- **Nenhum dos catorze pesos está calibrado.** Segue valendo o ADR-0011: o
  número orienta prioridade e não sustenta decisão sozinho — e estes dois
  nasceram com a mesma ressalva dos outros doze.
