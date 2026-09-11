# SeamAdapter

| | |
|---|---|
| **Status de integração** | `RESEARCH_REQUIRED` (interface pronta) |
| **Caminho** | `colmeia-acesso/packages/adapters/seam/` |
| **Prioridade** | estratégica, não operacional |
| **Conformidade v2** | passa, **recusando** todas as operações |

## O que este adaptador é

Não é mais um fabricante: é uma **camada agregadora**. Existe para testar uma
hipótese comercial, não técnica — a de que a ColmeIA pode governar o direito e
delegar a materialização a um intermediário que já fala com dezenas de marcas.

Se a hipótese se confirmar, o custo de cada novo fabricante cai
substancialmente. Se não se confirmar, é melhor saber agora, por um limite
declarado no adaptador, do que depois, por um vazamento de responsabilidade que
já custou uma reescrita.

## A fronteira, em código

```
COLMEIA decide o direito · SEAM materializa · DEVICE executa
```

`RESPONSABILIDADES_INDELEGAVEIS` é uma lista executável, verificada em teste:

```
policy · hierarchy · context · risk ·
segregation_of_duties · human_approval · hospital_workflows
```

Se um dia for necessário mandar qualquer um desses para o agregador para que
algo funcione, a hipótese está refutada. O teste existe para que essa refutação
seja visível, e não descoberta por acidente três sprints depois.

## O custo que a delegação cobra

Ao materializar por terceiro, a confirmação física passa a ser afirmação **do
agregador** sobre o equipamento, e não do equipamento. É um elo a mais na
corrente de incerteza.

Consequência declarada em `PENDENCIA_SEAM` e verificada em teste: **a confiança
máxima desta via é `PROBABLE`, nunca `CONFIRMED`** — a menos que a pesquisa
mostre que o agregador repassa confirmação de origem, distinguindo "o fabricante
me disse" de "eu mandei e presumo".

Note que `CAPACIDADES_SEAM.physicalStateReconciliation` está declarado `false`
por essa mesma razão.

## Pesquisa pendente

1. Cobertura real de fabricantes **relevantes no Brasil** — a cobertura
   divulgada por agregadores costuma ser dominada por marcas residenciais
   norte-americanas, que não são as instaladas num hospital brasileiro.
2. Latência acrescentada pela camada agregadora (entra na telemetria como
   `providerLatencyMs`, e o item 21 exige poder atribuí-la).
3. Granularidade da confirmação física repassada.
4. Modelo de custo por dispositivo, e o que ele faz com a viabilidade numa rede
   de 200 portas.
5. O que acontece com a governança quando o agregador fica indisponível — se o
   direito continua materializado nos equipamentos (bom) ou se a camada é
   caminho obrigatório (risco de dependência).

A pergunta 1 sozinha pode encerrar a avaliação. Vale respondê-la primeiro.
