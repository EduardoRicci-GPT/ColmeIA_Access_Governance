# ADR-0030 — O exercício e o direito: a restrição local suspende o instante e não revoga nada

**Estado:** aceito
**Data:** 2026-10-11
**Sucede:** ADR-0003 (estado em quatro camadas), ADR-0008 (modo de decisão)
**Relacionado:** ADR-0007 (projeção de atributos), ADR-0023 (quebra de vidro), D-054 do consolidado de 10/10/2026

## Contexto

O produto distingue quatro camadas entre a vontade da instituição e a porta.
Falta uma distinção que não é de camada, e sim de natureza: entre o DIREITO e o
EXERCÍCIO do direito num instante.

A enfermeira escalada para a UTI 3 naquele turno tem o direito. Se a UTI 3 está
com procedimento em curso, ou com a privacidade de um paciente declarada pela
chefia, ou interditada para manutenção do ar-condicionado, ela não entra AGORA.
E o direito dela continua inteiro.

A forma óbvia de implementar "não entra agora" é revogar. É fácil, funciona na
primeira demonstração, e destrói o produto:

- a revogação dispara ordem ao fabricante, que dispara sincronização em todos os
  equipamentos da zona, por causa de uma obra de duas horas;
- quando a obra termina, alguém tem de REEMITIR — e se ninguém lembrar, a
  enfermeira perdeu um direito que ninguém decidiu tirar;
- a trilha passa a registrar "direito revogado" onde houve "sala ocupada", e
  seis meses depois a auditoria não distingue um do outro;
- a próxima reconciliação lógica vê um direito que a política sustenta e que não
  existe, e o reemite sozinha — produzindo churn permanente entre dois motores
  que discordam sobre o mesmo fato.

Nada disso é falha de implementação. É consequência de colapsar duas perguntas
numa só — o mesmo defeito do `hasAccess` booleano, um nível acima.

## Decisão

**A restrição local produz uma leitura separada, e o `desiredState` não a
conhece.**

`dominio/restricao-local.ts` declara `RestricaoLocalDoRecurso` em seis espécies
— privacidade do paciente, procedimento em curso, ocupação máxima, manutenção
programada, interdição sanitária, bloqueio local do equipamento — com dois
efeitos, e nenhum deles revoga:

- `SUSPENDE_EXERCICIO` — não entra agora;
- `EXIGE_CORROBORACAO` — entra se houver um segundo fato. É o efeito que
  descreve a privacidade do paciente melhor do que a suspensão: a enfermeira
  entra no quarto, o técnico de TI não entra sozinho.

A leitura é `ExercicioDoDireito`, e **ela só decide em modo ACCESS**. Em modo
ENTITLEMENT o valor está no contexto e nenhuma regra o lê. Essa assimetria é a
decisão inteira, e tem teste que a guarda: a MESMA restrição que nega o instante
não decide nada sobre o direito.

Três regras entram no conjunto base: `R-RESTRICAO-LOCAL` (DENY, prioridade 85, acima da
restrição sanitária porque é mais específica — aquela é um perfil da zona, esta
é um fato daquele recurso naquele instante), `R-CORROBORACAO-LOCAL`
(REQUIRE_APPROVAL, 64) e `R-BLOQUEIO-LOCAL`.

A escada de prioridades ganhou uma regra explícita: **as exigências de revisão
ficam abaixo de toda negativa.** `REQUIRE_APPROVAL` numa prioridade maior que um
`DENY` venceria a negativa, e uma sala interditada passaria a ser "entre com
autorização do plantão".

`R-BLOQUEIO-LOCAL` é o caso que ganhou lugar próprio, em `IMPEDIMENTO_ABSOLUTO`:
alguém girou a tranca ou apertou o botão de bloqueio. O produto pode conceder em
software, e a porta não vai abrir. Deixar essa regra abaixo da quebra de vidro
seria pior que inútil — a tela diria "acesso liberado pela emergência" a quem
está do lado de fora de uma porta trancada por dentro, e num corredor, às 3h,
essa frase faz alguém parar de procurar outro caminho.

**E o default aqui é otimista, ao contrário do resto do motor.** Em política de
acesso, o fechamento por omissão protege; em restrição local, ele trancaria toda
porta de todo hospital que ainda não integrou o sistema de ocupação de leitos.
Uma restrição que não foi declarada não existe — e o que não existe não suspende
nada. `NAO_AVALIADO` é o valor que a instalação sem integração recebe, e a frase
diz que isso não é o mesmo que estar liberado por decisão.

## Consequências

- `MundoLogico` ganha `restricoesLocais`, pela porta do host: quem conhece
  ocupação de leito, procedimento em curso e ordem de manutenção é o sistema
  assistencial e o de facilities. Reimplementar isso aqui produziria uma segunda
  verdade sobre o que está acontecendo na sala — a pior espécie, porque decide
  porta.
- O que atravessa a fronteira é a RESTRIÇÃO, não o motivo clínico dela.
  `PRIVACIDADE_DO_PACIENTE` é projeção suficiente; o diagnóstico que a justifica
  fica no prontuário (ADR-0007, itens 24 e 25).
- Atravessar por papel **não apaga** a restrição: ela continua vigente, continua
  na trilha, e a leitura registra que alguém passou por cima dela. A diferença
  entre atravessar e apagar é a diferença entre um registro de exceção e um
  buraco no histórico.
- A travessia é verificada POR RESTRIÇÃO, e não para o conjunto: atravessar a
  manutenção não atravessa a interdição sanitária, ainda que a mesma pessoa
  tenha os dois papéis.
- Restrição sem escopo não incide sobre nada. Incidir sobre tudo transformaria um
  cadastro incompleto num bloqueio geral.
- `LocalConstraintDeclared` entra na cadeia pelo corpo HUMANO — quem interdita a
  sala é gente com responsabilidade —, e `LocalExerciseSuspended` pelo
  consultivo, porque é leitura.

## Alternativas descartadas

- **Revogar e reemitir.** Descartada pelos quatro motivos do contexto.
- **Uma quinta camada em `AccessState`.** Teria parecido simétrico e está errado:
  as quatro camadas descrevem a distância entre a vontade e o equipamento, e o
  exercício não é um ponto nessa linha — é outra pergunta sobre o mesmo instante.
- **Tratar o bloqueio local como as outras espécies.** Faria a quebra de vidro
  conceder sobre porta trancada por dentro.
- **Fechamento por omissão também aqui.** Trancaria todo hospital sem integração
  de ocupação.

## O que esta decisão NÃO resolve

- **A corroboração não tem mecânica própria.** `EXIGE_CORROBORACAO` vira
  `REQUIRE_APPROVAL`, e quem resolve é a fila de aprovação humana que já existe.
  "Entrou acompanhado" como fato registrável é outro trabalho.
- **Nenhuma integração real de ocupação, procedimento ou manutenção existe.** A
  porta está aberta e o host é que a liga; sem isso, o exercício é
  `NAO_AVALIADO` para sempre.
- **A ocupação máxima não é contada por ninguém.** A espécie existe no tipo; o
  contador de pessoas dentro da sala é dado de presença, e presença é o item que
  o backlog ainda registra como arquitetura aprovada e não implementada.
