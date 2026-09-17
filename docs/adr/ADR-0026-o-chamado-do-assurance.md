# ADR-0026 — O chamado do assurance: o achado central do produto passa a chamar alguém

**Estado:** aceito
**Data:** 2026-09-17
**Sucede:** ADR-0018 (o chamado a quem pode decidir), ADR-0024 (o aviso da emergência)
**Relacionado:** ADR-0010 (escalonamento humano), item 16 do backlog

## Contexto

A timeline de auditoria deste produto abre com a cena que justifica a
existência dele:

```
13:40:03  equipamento offline — revogação pendente
14:12:03  revogação confirmada
```

Trinta e dois minutos em que a organização considerava o acesso encerrado e a
porta abria. O produto inteiro foi construído para enxergar esses trinta e dois
minutos: a reconciliação física os detecta, o Health Score os pontua, a
timeline os desenha, o caso de escalonamento os nomeia.

E ninguém era chamado.

O ADR-0018 deu canal à fila de APROVAÇÃO. O ADR-0024 deu canal à EMERGÊNCIA. O
achado central — a revogação que nunca chegou à porta — continuava sendo
descoberto, pontuado, exibido e silencioso, alcançando apenas quem abrisse a
tela. É a quinta ocorrência do padrão que o ledger deste repositório registra
como D-022, e a mais cara delas, porque a porta que não chamava ninguém era a
que o produto existe para vigiar.

## Decisão

O plantão ganha a **terceira espécie** de aviso. As três não são variações de
estilo: são três relações diferentes com o tempo, e cada uma pede uma
insistência própria.

- **APROVAÇÃO** convoca uma decisão que falta, e insiste até alguém decidir.
- **EMERGÊNCIA** informa um fato consumado, uma vez por fato.
- **ASSURANCE** convoca trabalho operacional sobre uma condição que PERSISTE, e
  insiste até alguém RECONHECER o caso.

A terceira é a única cujo laço fecha de forma legítima sem resolver o problema,
e isso merece registro: `EscalationCase` já tinha `acknowledgedAt` desde o
ADR-0010. Existe um ato humano — assumir — que encerra a cobrança sem consertar
nada, e é exatamente o desfecho que a fila de aprovação não tem (backlog 5e).
Aqui ele não precisou ser inventado: estava no tipo, esperando alguém usá-lo.

### Quem é chamado: a segunda porta do host

`AutoridadeDoHost.podeDecidir(papel, faixa)` responde *"esta pessoa pode
AUTORIZAR um acesso desta criticidade?"*. Um caso de escalonamento não pede
autorização nenhuma: pede alguém que vá até o gateway, abra chamado com o
fabricante ou remaneje a escala. Aprovar o cofre de psicotrópicos e consertar um
gateway caído são competências diferentes, e reaproveitar a alçada chamaria a
diretoria técnica às 3h por causa de uma catraca sem comunicação.

Por isso `EncaminhamentoDeCasos` é porta nova, e o encaminhamento é por **TIPO**
de caso — que é como um hospital de fato se organiza: gateway offline é TI,
revogação não confirmada é segurança, zona de cuidado sem cobertura é
coordenação assistencial. A tabela é do host; a de referência
(`ENCAMINHAMENTO_HOSPITALAR`) segue o padrão de `ALCADAS_HOSPITALARES`.

Duas escolhas dessa tabela merecem defesa. `COVERAGE_GAP` vai para a coordenação
de enfermagem, e não para a segurança: é o único tipo que denuncia FALTA de
direito, e quem resolve falta de gente numa zona de cuidado é quem monta a
escala. `POLICY_CONFLICT` vai para duas áreas, porque o conflito costuma ser de
desenho — alguém acumulou papéis incompatíveis — e desfazer isso é decisão
conjunta de quem opera e de quem responde pela política.

### Não há limiar de severidade, e a ausência é deliberada

A tentação era declarar "abaixo de HIGH, não acorda ninguém". Um limiar
escondido na porta produziria o defeito oposto ao que se quer: casos que somem
sem deixar rastro de terem sumido.

Um tipo que não deve acordar ninguém é um tipo roteado para NENHUM papel — e o
chamado sai assim mesmo, declarando que não havia a quem recorrer. É a mesma
disciplina de `CANAL_AUSENTE`: não ter destinatário é fato desta instalação, e
fato vai para a cadeia e para a tela. `LATENCY_ANOMALY` está na tabela de
referência com a lista vazia, de propósito, para que a decisão de não acordar
ninguém por causa dela esteja ESCRITA.

### Duas chamadas no ciclo, em dois momentos

`despachar()` roda antes da materialização, porque o aviso mais valioso da
aprovação é o da que ainda está vigente e vai vencer. Os casos de escalonamento
só existem depois que o assurance rodou, no fim do ciclo. Juntar as duas coisas
num ponto só faria uma delas trabalhar sobre os fatos da volta anterior — e um
chamado sobre a divergência do minuto passado é uma promessa de acompanhamento
quebrada em silêncio.

O relatório do ciclo recebe os dois despachos somados num resumo só: quem lê
quer saber quantas pessoas foram chamadas e quantas ficaram sem chamada, não em
que passo cada chamada saiu.

### Na tela

A tabela de casos ganhou uma coluna: **Chamado**. Ela responde a pergunta
seguinte de quem lê — *alguém sabe disto?* — e nunca fica em branco: a ausência
de linha vira "ninguém foi chamado", porque a ausência é resposta também.

## Alternativas descartadas

**Reaproveitar `papeisComAlcada`.** Chamaria quem aprova acesso para consertar
infraestrutura. A aproximação que foi aceitável na emergência — onde o destino
era *quem responde pela área* e a alçada é a melhor porta existente — aqui seria
simplesmente errada.

**Chamar sobre toda divergência, e não sobre casos.** O assurance já decide o
que merece escalonamento, com política de tentativas e fim declarado
(ADR-0010). Chamar antes disso seria inventar um segundo critério de gravidade
ao lado de um que já existe e já é determinístico.

**Encerrar a insistência por decurso de prazo.** Devolveria o produto ao estado
em que o problema some sozinho da fila sem ninguém ter assumido. O laço fecha no
reconhecimento, que é ato de gente.

## Consequências

- A bateria vai de 696 para **715 verificações**; a suíte da aprovação de 166
  (era 147), com o bloco da terceira espécie.
- `TipoDeEvento` ganha `EscalationNotified` e
  `EscalationNotificationUndelivered`. O não entregue é o que mais importa:
  "caso aberto há quarenta minutos e ninguém foi chamado" é a frase que uma
  investigação procura.
- `DiarioDeAviso` chega a três métodos, todos obrigatórios. Quem implementa a
  porta é forçado a decidir o que faz com cada espécie, em vez de herdar
  silêncio por omissão.
- `PlantaoDeChamados` ganha `despacharCasos`, e o ciclo passa a chamá-lo no
  passo 5.5.
- A bancada monta o encaminhamento de referência. Se a bancada não liga,
  produção também não liga — e este ADR existe porque essa frase já se provou
  verdadeira três vezes.

## O que esta decisão NÃO resolve

- **Continua sendo um CARGO, não uma pessoa.** O chamado alcança
  `supervisao-de-seguranca`, não quem está de plantão às 02h40. É a mesma lacuna
  do backlog 5c, agora valendo para as três espécies.
- **Nenhum canal real existe.** `CanalEmMemoria` é bancada; o primeiro canal de
  verdade é integração (backlog 5d), e agora ele carrega três espécies em vez de
  uma.
- **O reconhecimento não tem prazo.** Um caso reconhecido e nunca resolvido para
  de chamar e fica aberto para sempre. Cobrar o resolvedor é outro laço, e
  fechá-lo exige decidir o que é prazo aceitável — governança do hospital, não
  software.
- **A tabela de encaminhamento vive no código.** Como as matrizes de segregação
  (ADR-0019), ela deveria ser versionada com autor e data, junto do item 8 do
  backlog.
