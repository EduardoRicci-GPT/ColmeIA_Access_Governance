# ADR-0015 — Dois canais determinísticos, e o R-VEP por porta

- **Estado:** aceito
- **Data:** 2026-09-11

## Contexto

O radar R-VEP da Aletheia executa um snapshot Python selado num processo
isolado, com sha256 conferido antes de cada execução, e custa ~350 ms por
leitura. Duas consequências para este produto:

1. **Não é copiável.** O snapshot é espelho bit-a-bit do corpus MPEH sob regra
   própria, e exige Python no host. Um aplicativo de gestão hospitalar não é
   obrigado a ter Python.
2. **Não cabe no caminho de decisão de uma porta.** Ninguém espera 350 ms de
   subprocesso com o crachá encostado no leitor.

A Aletheia já enfrentou esse dilema e a solução dela é o padrão adotado aqui.

## Decisão — dois canais

| Canal | O que lê | Custo | Depende de calibragem? |
|---|---|---|---|
| **Estrutural** (porte TS) | a relação: quem manda, quem pode recusar, quem fica isento | microssegundos | **não** — não tem limiar |
| **Lexical** (R-VEP) | densidade de sinais, I²E, vetor de poder | ~350 ms, subprocesso | sim, e está em sombra |

O estrutural roda **sempre**, inclusive no caminho quente. O lexical roda
**quando disponível**, fora do caminho crítico — na autoria da política, na
auditoria do ciclo, na revisão de um regulamento.

Aplicado a acesso, o canal estrutural responde a uma pergunta que nenhuma tabela
de regras responde: **esta política concede acesso, ou impõe obediência?** Uma
norma que manda liberar, proíbe recusar e isenta quem a escreveu tem a forma de
uma captura, por mais razoável que soe o texto.

## Ausência é declarada, nunca preenchida

`SemRadar` é a implementação padrão e ela **lança** em vez de aproximar. Falha do
radar também é falha — vira `lexical: AUSENTE` com o motivo real, e a análise se
declara **parcial**. Não existe caminho que produza leitura estimada ou de
memória: ausência de avaliação nunca autoriza.

Quando os dois canais falam e discordam, **a discordância é o dado**. Um texto
que o radar lê como neutro e o guardrail lê como restritivo é exatamente o caso
que merece olho humano: texto calmo pode carregar coerção.

## Porte, não espelho — e a prova

Copiar `guardrailEstrutural.ts` bit-a-bit foi **tentado e revertido**: ele não
compila sob a configuração estrita deste produto (`leiaAssim` pode conter
`undefined` pelo tipo, embora não possa na prática), e editar espelho é o que o
manifesto proíbe.

Em vez de afrouxar a configuração ou violar a regra, o porte vem com **prova
diferencial**: `testes/contratos-estruturais.ts` roda este código e o da origem
sobre o mesmo corpus e exige resultado idêntico, pulando quando a origem não está
no checkout. É a mesma disciplina que a Aletheia aplica entre o `.ts` e o `.py`
selado — o porte não substitui o original, presta contas a ele.

## Achado sobre a origem, registrado e não corrigido aqui

`FREE_REFUSAL` casa `"sem punição"` e `"without penalty"`, e **não** casa
`"sem penalidade"` — que, em português institucional brasileiro, é ao menos tão
comum. Um regulamento hospitalar que diga *"o profissional pode recusar sem
penalidade"* perde a salvaguarda e é lido como mais coercivo do que é.

Não corrigido no porte: quebraria a prova diferencial, e a decisão é da origem,
que presta contas ao `structural_guardrail.py` selado. Um teste **congela** o
comportamento atual, para que a lacuna não se perca — e para que, quando a origem
a corrigir, o teste quebre e alguém saiba por quê.
