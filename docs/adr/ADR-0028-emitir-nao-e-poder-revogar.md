# ADR-0028 — Emitir não é poder revogar: a força do caminho e a janela residual decidem a emissão

**Estado:** aceito
**Data:** 2026-10-11
**Sucede:** ADR-0004 (confiança e honestidade), ADR-0006 (Adapter Contract v2)
**Relacionado:** ADR-0013 (pesos com estatuto), D-051 e D-055 do consolidado de 10/10/2026

## Contexto

Este produto foi construído em volta de uma pergunta: *esta revogação chegou à
porta?* As quatro camadas de `AccessState` existem para responder a ela, o
Health Score a pontua, a timeline a desenha e o caso de escalonamento chama
alguém por causa dela.

A pergunta é feita DEPOIS da emissão. O consolidado de outubro aponta para a
anterior, que ninguém estava fazendo:

> no instante em que esta credencial for emitida, o que exatamente será
> necessário para fazê-la parar de funcionar — e quanto tempo isso leva?

A diferença é inteira. Uma eKey online numa fechadura com gateway revoga em
segundos e confirma. Um PIN offline de noventa dias gravado numa fechadura sem
comunicação não revoga: ele EXPIRA. Entre a ordem e o fim do risco há noventa
dias, e nenhuma tela, nenhum escalonamento e nenhum fabricante encurtam esse
intervalo.

E há o eixo paralelo, o D-051: o produto media a força do que a pessoa
APRESENTA, que é a medida que todo fabricante publica e que responde a uma
pergunta que ninguém faz do lado de fora da porta. A pergunta de fora é qual é o
MEIO MAIS FÁCIL de atravessar — e raramente é a credencial do projeto. É a chave
mecânica da portaria, a botoeira alcançável pelo vão, a senha de serviço que
três turnos conhecem, o modo livre programado para o horário de visita e nunca
revisto.

O que os dois deltas têm em comum é o instante: a emissão. Ali a decisão ainda é
reversível a custo zero. Um minuto depois, a janela residual já existe — e
existir é tudo o que ela precisa fazer.

O defeito, dito sem eufemismo: o ciclo decidia o direito com todo o rigor do
produto — vínculo, papel, turno, competência, segregação, aprovação humana ligada
ao hash do material revisado — e então materializava sem perguntar o que estava
materializando.

## Decisão

**A emissão passa a ser um ato governado, com portão próprio.**

`governanca/emissao.ts` cruza duas leituras antes de qualquer ordem ao provedor:

- **o caminho** (`dominio/caminho.ts`): `forcaDoCaminho` é o MÍNIMO dos elos, e
  `avaliarExposicao` o cruza com a criticidade do recurso;
- **a revogabilidade** (`dominio/revogabilidade.ts`): cinco modos, de
  `REMOTA_CONFIRMADA` a `IRREVOGAVEL_ATE_EXPIRAR`, cada um com sua janela
  residual.

E devolve três vereditos, com uma assimetria deliberada:

| Veredito | Quando | O que o ciclo faz |
|---|---|---|
| `PERMITE` | janela dentro do teto, exposição não inaceitável | materializa |
| `EXIGE_APROVACAO` | janela acima do teto, ou exposição inaceitável | materializa e registra; o achado vai ao score |
| `RECUSA` | sem término previsto, sem caminho de revogação, recurso CRITICAL | **retém a credencial** |

A assimetria é o ponto. Os tetos de janela residual por criticidade nunca foram
medidos contra a operação de um hospital: estão em SOMBRA no registro de
calibragem, como os pesos do Health Score (ADR-0013). **Um número sem estatuto
não derruba uma emissão** — ele convoca uma pessoa, e o veredito carrega a
ressalva junto.

A única `RECUSA` não depende de calibragem nenhuma, e a conjunção dos três
termos é o que a mantém estrutural: credencial **sem término previsto** E **sem
caminho de revogação** E em recurso **CRITICAL**. Ali o produto não está
escolhendo um limite: está se recusando a dar uma chave que não tem como pedir
de volta. A explicação da recusa oferece os três caminhos possíveis — declarar
expiração, instalar sincronização, escolher outro método — em vez de só fechar.

## Consequências

- `MeioDeAcesso` separa `CREDENCIAL` de `BYPASS`, e a segunda espécie é a que o
  produto não emitia, não sincronizava, não revogava e não sabia nomear.
- `BARRA_ANTIPANICO` e `INTERTRAVAMENTO_DE_INCENDIO` são FRACAS para o controle
  de acesso e inegociáveis para a segurança de vida. Daí `EXIGE_COMPENSACAO`
  existir como nível: um produto que só soubesse dizer ACEITÁVEL ou INACEITÁVEL
  obrigaria a instalação a mentir numa das duas direções, e o nível correto da
  maioria das portas de um hospital é o do meio.
- Caminho não levantado devolve `NAO_AVALIADA`, nunca `FORTE`. O default
  otimista deixaria toda porta ainda não conferida verde no painel, e apagaria o
  único incentivo que o levantamento tem.
- `frasePosRevogacao` existe para que nenhum chamador escreva "credencial
  revogada" sem passar por ela: em dois dos cinco modos, a frase correta contém
  a palavra "ainda".
- O portão roda SÓ na concessão. Revogar não cria janela residual — revogar é o
  que tenta fechá-la, e reavaliar ali faria o produto hesitar exatamente no ato
  que reduz risco.
- O Health Score ganha `JANELAS_RESIDUAIS`, com peso 2 — abaixo da revogação
  pendente (3), e a razão é o tempo verbal: a revogação pendente é porta que
  abre AGORA para quem já não devia entrar; a janela residual descoberta é porta
  que vai continuar abrindo QUANDO alguém mandar revogar.
- O ciclo ganha a porta `revogabilidade`, e **ausência não vira pior caso**.
  Usar `REVOGABILIDADE_DESCONHECIDA` por omissão reteria toda concessão de toda
  instalação que ainda não fez o levantamento, e um produto que não concede nada
  é desligado antes de ensinar nada. O relatório declara a lacuna
  (`emissaoAvaliada: false`) em vez de fingir.

## Alternativas descartadas

- **Reter também em `EXIGE_APROVACAO`.** Teria feito o portão parecer mais
  rigoroso e produziria o verdicto EXIGE_APROVACAO centenas de vezes por ciclo —
  porque a resposta é a mesma para toda credencial daquele método naquela porta.
  Alarme repetido é alarme ignorado.
- **Fila de aprovação por emissão.** O achado da emissão não é sobre a pessoa:
  é sobre o DESENHO daquela porta. Mandá-lo para a fila do supervisor pediria a
  ele que assinasse, a cada plantão, o mesmo fato de engenharia.
- **Medir força de credencial pelo que o fabricante publica.** Era o que o
  produto já fazia, e é a origem do delta.

## O que esta decisão NÃO resolve

- **Os tetos continuam em sombra.** Nenhum foi medido. A calibragem contra o
  tempo real de reação de uma instalação é trabalho de piloto.
- **A revogabilidade dos adaptadores reais é declarada, não medida.**
  `ProcedenciaDeRevogabilidade` tem o valor `MEDIDA_EM_BANCADA` e hoje ninguém
  o usa — é o lugar reservado para o dia em que houver bancada de hardware.
- **O caminho de acesso é cadastro manual.** Ninguém o descobre
  automaticamente, e nem deveria: quem sabe que existe chave mecânica é quem foi
  até a porta.
- **`TransactionPathAssurance` por transação não existe.** Exigiria telemetria
  de transação que este produto não coleta.
