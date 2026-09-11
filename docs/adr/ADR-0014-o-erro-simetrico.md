# ADR-0014 — O Freio da parceria, e o erro que o resto do sistema não vê

- **Estado:** aceito
- **Data:** 2026-09-11

## O viés que a especificação carrega sem nomear

Lida inteira, a especificação está desenhada contra **um** erro: sobrar direito.
Revogação pendente, porta que ainda abre, credencial órfã, estado sem evidência —
tudo aponta para o mesmo medo. É legítimo, e é metade.

O Filtro Zero obriga a fazer a pergunta que revela a outra metade: *quem é
afetado pelo que estou prestes a fazer?* Numa UTI, os afetados não são só quem
está na porta — são os pacientes da zona e a equipe que depende daquela porta
abrir. E aí o erro simétrico aparece: **faltar direito numa zona de cuidado não é
um telefonema, é uma porta que não abre para quem precisa entrar correndo.**

Um sistema que só mede acesso indevido otimiza contra um dos dois erros e fica
cego para o outro. O outro mata mais rápido.

## Decisão

Antes de materializar cada lote, o ciclo conta quantas pessoas distintas têm
acesso ativo por zona, **antes e depois** das ações, e pergunta ao freio se alguma
zona de cuidado (criticidade `HIGH` ou `CRITICAL`) ficaria com zero.

Repare na inversão: no motor físico, criticidade alta agrava o risco de **sobrar**
direito. Aqui, agrava o risco de **faltar**. É o mesmo dado servindo a dois medos
opostos, e o sistema precisa saber os dois.

## A decisão difícil: o que fazer quando o freio dispara

As duas respostas óbvias estão erradas:

- **Segurar a revogação** deixaria alguém desligado com acesso à UTI. O sistema
  cometeria, em silêncio, exatamente a falha de segurança que existe para impedir.
- **Revogar e seguir** deixaria a unidade descoberta sem que ninguém soubesse até
  a próxima emergência.

A leitura do freio resolve: o que ele transfere ao humano é a **decisão**, não a
execução da segurança. Então:

> A revogação **segue**. A lacuna de cobertura vira caso escalado, com severidade,
> nome da zona e a frase que diz de quem é a decisão. O freio não bloqueia a ação —
> **bloqueia o silêncio sobre ela**.

*"A presença não termina no acionamento — termina na transferência."*

## Fail-closed, sem travar

Sem Filtro Zero respondido, a avaliação é `nao_avaliada` e transfere ao humano —
ausência de avaliação nunca autoriza. Mas a revogação ainda segue, pelo mesmo
motivo acima. O que é fail-closed aqui é o **conhecimento**, não a execução da
segurança.

O sinal de instinto acompanha como aviso e **não freia**: um gate que freasse por
instinto produziria paralisia analítica.

## Novo tipo de escalonamento

`COVERAGE_GAP` é o único tipo da lista que denuncia **falta** de direito. Todos os
outros protegem contra a porta que abre para quem não deveria; este protege
contra a porta que não abre para quem precisa. Ele é deduplicado por chave
estável e fica **fora** do encerramento automático por reconciliação física — sem
isso, seria fechado no mesmo ciclo em que nasceu, porque não aparece na lista de
divergências físicas e essa ausência seria lida como "resolvido".
