# ADR-0005 — Health Score derivado dos componentes, proporcional para disponibilidade e absoluto para divergência

- **Estado:** aceito
- **Data:** 2026-09-11

## Contexto

O item 7 exige: "nunca produzir score sem explicar sua composição". Exigências
assim costumam virar convenção de equipe, e convenções de equipe sobrevivem até
a primeira sexta-feira apertada.

## Decisão 1 — o score é derivado, não atribuído

Não existe caminho em `calcularHealth` que atribua `score` diretamente. O número
é sempre `100 − Σ(penalidades dos componentes)`. Para mover o número é preciso
criar um componente, e todo componente carrega id, rótulo legível, penalidade,
contagem e evidências (ids de endpoints, casos, credenciais).

A função `somaDosComponentes()` e a invariante `verificarExplicabilidade()` são
testadas: se algum caminho produzir score que não feche com a composição, a
bateria falha.

No banco, `health_component` referencia `health_snapshot` com `ON DELETE
CASCADE`, e a aplicação não grava snapshot sem componentes.

## Decisão 2 — duas famílias de penalidade

**Proporcional (disponibilidade).** Dois endpoints offline entre dez é uma rede
com problema; dois entre oitocentos é terça-feira. Penalidade =
`peso × (offline / total)`.

**Absoluta (divergência).** Uma revogação pendente é uma porta que abre para
quem não deveria entrar. Ela não fica menos grave porque o hospital é grande.
Penalidade = `peso × contagem`, ponderada pela criticidade do endpoint
(LOW 0,5× · MEDIUM 1× · HIGH 1,5× · CRITICAL 2×), com teto por família.

Diluir divergência pelo tamanho da rede seria o artifício que faz um painel
parecer verde enquanto o risco cresce — e é o comportamento padrão de quase todo
dashboard que agrega por média.

## Decisão 3 — o score do pai não é a média dos filhos

É recalculado no escopo do pai, sobre os mesmos fatos. A média mente de duas
maneiras: dilui (uma UTI a 40 dentro de quarenta unidades a 98 desaparece) e não
abre (um score médio não tem componentes, então clicar nele não leva a lugar
nenhum — o oposto do que o item 7 exige).

Custa mais processamento e devolve um número auditável: o −12 do hospital e o
−28 da UTI apontam para as mesmas portas, com os mesmos identificadores.

## Calibração

Os pesos vivem em `PESOS_PADRAO`, exportados e substituíveis. A calibração é
decisão institucional: um hospital que opera 40% da frota em modo offline por
projeto não pode ser medido pela curva de um que opera tudo online.

O teste `health-score.ts` reproduz literalmente o exemplo da especificação
(87/100 = −5 offline −3 revogação −2 latência −3 conflito). Mudar um peso sem
discutir quebra esse teste, e a discussão acontece.
