# ADR-0017 — A fila de aprovação existe, é aberta pelo ciclo e aparece na tela

- **Estado:** aceito
- **Data:** 2026-09-15
- **Complementa:** ADR-0016 (vigência, alçada e trilha), ADR-0012 (aprovação ligada ao conteúdo), ADR-0009

## Contexto

O ADR-0016 deu prazo à aprovação humana e fechou dizendo o que não resolvia:

> A tela não mostra a fila de aprovação. `pedidosAbertos()` já devolve as
> vencidas junto das nunca decididas, e nenhum painel consome isso. Um prazo
> que vence sem aparecer para quem poderia renovar é um prazo que produz porta
> fechada na hora errada.

Ao implementar essa tela, um teste falhou por um motivo que não era o da tela —
e o motivo era pior do que a ausência dela.

### O que a implementação revelou: ninguém abria pedido

`gate.abrir()` só era chamado em **teste**. Em `packages/` inteiro, nenhuma
linha abria um pedido de aprovação.

A cadeia funcionava até a véspera do humano e parava ali: a política marcava
`REQUIRE_APPROVAL`, o motor de entitlement mantinha o direito em `KEEP` — que é
o comportamento correto desde o ADR-0009 —, o relatório do ciclo listava o caso
em `pendentesDeAprovacao`, e **o pedido que uma pessoa decidiria nunca era
aberto**. O gate esperava para sempre por um pedido que nada criava.

O efeito em produção seria uma negativa silenciosa: acesso que nunca vem, sem
ninguém a quem recorrer e sem nada na tela — a forma mais educada de negar, e a
mais difícil de contestar. A tela que este ADR acrescenta teria nascido
decorativa: uma lista permanentemente vazia sobre um sistema que exige revisão
humana o tempo todo.

## Decisão

### 1. O ciclo abre o pedido que a política exigiu

`CicloDeGovernanca` ganha a dependência `aberturaDeAprovacao` e, depois do
Freio e antes de materializar, abre um pedido para cada ação em
`pendentesDeAprovacao`. O material já viajava na ação desde o ADR-0012 — é o
mesmo conteúdo cujo hash liga a aprovação ao que será executado.

A porta é estreita por desenho: o ciclo **abre**; quem **decide** é gente, por
outro caminho. Um motor que pudesse decidir não seria um gate.

### 2. `abrir` é idempotente sobre material idêntico

Esta guarda não é conveniência, é a condição para o item anterior existir. O
ciclo roda a cada minuto e reabre o pedido enquanto ninguém decidir. Sem
idempotência, cada volta criaria um registro novo por cima do anterior e
**apagaria a primeira assinatura** — numa faixa crítica, que exige duas pessoas
distintas, a segunda nunca alcançaria a primeira, e a porta permaneceria
fechada por um defeito que se parece com rigor.

O pedido só é substituído quando o material **muda**, e aí substituir é o
certo: o que será executado deixou de ser o que foi revisado, e a aprovação
antiga já não valia pelo hash (ADR-0012).

**O teste H10 dependia do comportamento destrutivo.** Ele assinava por
`rita.diretoria`, conferia que uma assinatura não basta, e então chamava
`aprovarCofre()` — que reabria o pedido, apagava a assinatura de Rita e assinava
por Rita e Paulo. Passava por acidente. Com `abrir` idempotente, o que resta no
teste é o que resta na vida real: alguém diferente assinar. O teste foi
corrigido; a implementação, não.

### 3. A fila na tela, ordenada por urgência de porta fechada

`pendencias()` devolve **todo** pedido que já existiu, com estado e prazo, e
`montarPainel` passou a carregá-la. A ordem é a decisão de produto:

| # | Estado | Por quê nesta posição |
|---|---|---|
| 1 | `VENCIDA` | É a única que **mudou sem ninguém mandar**: ontem abria, hoje não abre, e o operador não foi avisado. Entre vencidas, a que venceu há mais tempo lidera — tem gente esperando há mais tempo. |
| 2 | `AGUARDANDO_SEGUNDA_ASSINATURA` | Já há alguém comprometido. Falta uma pessoa, não duas, e o custo de concluir é metade. |
| 3 | `AGUARDANDO_DECISAO` | Por criticidade, depois por antiguidade. |
| 4 | `RECUSADA` | Fica à vista: recusa não é silêncio. |
| 5 | `VIGENTE` | Pela que vence primeiro — é a linha que impede a próxima `VENCIDA` de existir. |

**A aprovação válida entra na mesma lista de propósito.** A tentação é listar só
o que exige ação, e essa lista chega tarde por construção: ela só ganha a linha
quando a porta **já** parou de abrir. Quem poderia renovar precisa ver o prazo
enquanto ele ainda corre.

**Não há limiar de "prestes a vencer", e a ausência é deliberada.** Seria mais
um número sem calibragem, decidindo por conta própria o que merece susto. A
ordenação põe o mais próximo no topo e quem lê decide — que é a mesma disciplina
dos pesos do Health Score (ADR-0013) e das janelas de vigência (ADR-0016).

### 4. Distinção preservada entre duas perguntas

`pedidosAbertos()` responde *"o que precisa de gente AGORA"* e é o que o motor
consulta. `pendencias()` responde *"o que uma pessoa precisa ver"*, e inclui as
vigentes. Fundir as duas faria o motor tratar aprovação válida como pendência.

Uma precisão que o estado exige: só é `AGUARDANDO_SEGUNDA_ASSINATURA` quando o
kernel diz `APROVACOES_INSUFICIENTES`. Assinatura inválida ou aprovador sem
alçada **também** deixam decisões no registro, e chamá-las de segunda assinatura
pendente diria à tela que há meio caminho andado onde não há nenhum.

## Consequências

- A bateria vai de 427 para **453 verificações**; a suíte de aprovação, de 74
  para 100.
- O painel gerado passa a mostrar a fila. No cenário da bancada:
  `Cofre de psicotrópicos — VIGENTE (613 min restantes)`.
- O ciclo ganhou um efeito colateral declarado. Ele continua reentrante: rodar
  duas vezes sem mudança no mundo não cria pedido novo nem apaga assinatura, e
  isso é testado.
- A assinatura exibida traz a alçada **daquele instante** (ADR-0016), não a de
  hoje — é o que permite responder "essa pessoa podia?" sem depender de o cargo
  não ter mudado desde então.

## O que esta decisão NÃO resolve

- **Ninguém é notificado.** A fila aparece para quem abrir a tela. Plantão,
  canal e escalonamento de quem não responde continuam no backlog, e sem eles
  um prazo ainda pode vencer de madrugada sem ninguém ver.
- **Não há ação na tela.** A fila mostra; aprovar continua exigindo o caminho
  do host, com token e alçada. Pôr um botão aqui exige decidir como a sessão
  autenticada do aplicativo de gestão chega até o gate — e isso é integração,
  não interface.
- **A tela segue não validada com Facilities, Segurança, TI e Qualidade.** São
  quatro públicos; esta seção foi desenhada para o primeiro.
