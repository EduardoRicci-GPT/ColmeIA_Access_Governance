# ADR-0013 — Os pesos do Health Score declaram o próprio estatuto

- **Estado:** aceito
- **Data:** 2026-09-11
- **Complementa:** ADR-0005

## Contexto

O ADR-0005 acertou a estrutura do score: derivado dos componentes, nunca
atribuído, proporcional para disponibilidade e absoluto para divergência. E
declarou os pesos assim:

```ts
export const PESOS_PADRAO = Object.freeze({ revogacaoPendente: 3, /* … */ })
```

Congelado, com cara de decisão tomada. E não era: era um palpite informado,
escrito por quem implementou, **sem dono, sem origem textual, e sem nada que
dissesse a quem lê o painel que aquele −3 não tem autoridade nenhuma**.

## Decisão

Os doze pesos viram `ConstanteCalibrada` no registro do MPE-H, cada um com id,
rótulo, valor, **estatuto**, procedência textual, curador, data de conferência e
ressalva.

**Nenhum está em `INSTRUMENTADA`.** Todos em `SOMBRA`, porque nenhum foi
calibrado contra a operação de um hospital real. O registro é montado exigindo
`INSTRUMENTADA` para decidir, de modo que `obterParaDecisao` **lança** para todos
eles — e a única leitura possível é `obterEmSombra`, que entrega o valor junto
do aviso.

O afrouxamento existe no kernel (`exigidoParaDecidir`) e **não é usado aqui**:
afrouxar sem calibrar seria dar autoridade a um número por conveniência.

## O efeito no produto

O score continua sendo calculado e continua sendo útil — em sombra não é sem
valor. O que muda é que a tela é **obrigada** a dizer que os pesos ainda não
foram ratificados: a ressalva vive no modelo de visão
(`PainelDeAssurance.avisoDeCalibragem`), e não num rodapé escrito à mão que
desaparece na primeira redação de tela feita com pressa.

O peso mais sensível — `revogacaoPendente` — declara na própria ressalva por que
é o mais sensível: *"traduz em número a frase do item 41, e uma calibragem baixa
demais faria o painel esverdear sobre porta aberta."*

É a mesma disciplina que mantém o I²E em sombra na Aletheia, aplicada aqui. E é
o que impede um número de sair da bancada parecendo medida.
