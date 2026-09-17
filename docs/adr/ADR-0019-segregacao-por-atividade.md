# ADR-0019 — Segregação de funções separa atividades, não cargos, e exige revisão em vez de negar

- **Estado:** aceito
- **Data:** 2026-09-17
- **Complementa:** ADR-0014 (o erro simétrico), ADR-0013 (pesos com estatuto), ADR-0018 (o chamado)

## Contexto

O produto tinha `regraDeSegregacao(papelA, papelB)` desde a primeira entrega:
uma fábrica que nega o acesso quando dois papéis coexistem no mesmo vínculo.
Ela nunca foi usada, não estava no conjunto base de regras, e o backlog a
registrava como "existe como fábrica de regra; falta modelagem no papel e
tela". Três coisas explicam por que ela ficou parada.

**Par de papéis não escala, e o buraco é silencioso.** Segregar por par exige
escrever N² regras à mão. A instalação que esquecer um par fica descoberta — e,
pior, fica descoberta sem saber, porque ausência de regra tem exatamente a
mesma aparência de "não há conflito aqui". O controle interno clássico nunca
separou cargos: separa as quatro atividades que, reunidas na mesma pessoa,
deixam de se vigiar — **autorizar, executar, custodiar, conferir**. Cargos
mudam de nome a cada reforma administrativa; a razão pela qual não se deve
guardar o estoque e conferir o próprio estoque não muda.

**Negar é o desfecho errado.** Se alguém acumula duas atividades
incompatíveis, o problema não está na porta — está no acúmulo. Fechar a porta
deixa o acúmulo intacto: o inventário continua sendo guardado e conferido pela
mesma pessoa, só que agora ela pede a chave emprestada. E numa unidade pequena,
uma Santa Casa num domingo, acumular função não é exceção: é a escala possível.

**Uma matriz sem procedência é uma regra que ninguém responde.** Dizer
"custodiar e conferir são incompatíveis" é afirmar algo sobre o mundo, e este
produto já tem tratamento para afirmação sem lastro.

## Decisão

### 1. A incompatibilidade é entre atividades, num domínio com zonas

`DominioDeSegregacao` declara onde a separação vale (`zonas`), que atividades
cada papel exerce ali, e que pares não podem coexistir. Ligar a matriz a zonas
concretas não é detalhe: sem isso, quem acumula atividades da farmácia seria
barrado na entrada do administrativo — e um falso positivo assim ensina a
equipe a desligar a regra inteira.

### 2. O efeito é `REQUIRE_APPROVAL`, e é o coração deste ADR

O Freio (ADR-0014) já tinha dito a frase que vale aqui: *ele não bloqueia a
ação, bloqueia o silêncio sobre ela.* Conflito de segregação transfere ao
humano a única pergunta que o motor não pode responder — se aquele acúmulo é
aceitável naquela unidade, naquele plantão.

Isso só deixou de ser evasiva porque os dois ADRs anteriores existem. Antes do
ADR-0017, "exige revisão humana" era um marcador em relatório que ninguém
abria; antes do ADR-0018, era uma fila que só alcançava quem abrisse a tela.
Hoje o conflito abre pedido de fato e chama quem tem alçada — o que se vê no
cenário H11, em que a pendência nasce, entra na fila e vira chamado sem que
nenhuma linha de teste precise empurrar.

A prioridade fica acima da aprovação por criticidade e abaixo dos bloqueios
estruturais: vínculo encerrado continua negando antes de qualquer discussão
sobre segregação, porque quem não tem vínculo não tem função a segregar.

### 3. Duas origens de conflito, porque elas mandam consertar em lugares diferentes

- `ACUMULO_DE_PAPEIS` — duas funções distintas na mesma pessoa. Resolve-se
  redistribuindo a escala.
- `PAPEL_MAL_DESENHADO` — um único cargo que já nasce carregando custódia e
  conferência. Resolve-se no cadastro: toda pessoa que receber aquele papel vai
  carregar o conflito, e redistribuir escala não resolve nada.

Chamar os dois pelo mesmo nome mandaria a coordenação procurar no lugar errado.

### 4. A matriz declara procedência, curador e data — e a tela mostra

Os mesmos campos que `ConstanteCalibrada` exige, pela mesma razão. Duas
matrizes entram no conjunto base:

- **Medicamentos sob controle especial.** A Portaria SVS/MS 344/1998 submete as
  substâncias sob controle especial a escrituração e responsabilidade técnica
  farmacêutica. O que a norma estabelece é a responsabilidade e o registro;
  separar custódia de conferência é prática de controle interno **derivada**
  dela. A ressalva registra a diferença em vez de emprestar à prática a
  autoridade da norma.
- **Credenciais de acesso.** Política interna declarada, sem norma externa
  atrás — e vale registrar que a ColmeIA é parte do problema que descreve: ela
  é o sistema em que a concessão acontece, e a trilha que ela produz é a
  conferência.

### 5. A regra entra no conjunto base, e o acúmulo aparece mesmo sem porta

Fora do conjunto base, a segregação seria uma capacidade que cada instalação
lembraria de ligar — e a que esquecesse ficaria descoberta com a aparência de
quem não tem conflito. É o erro do ADR-0017 outra vez: a porta existia, e o
caminho real não passava por ela.

O ciclo também apura, por vínculo vigente, os conflitos **independentes de
porta**, e o painel ganha seção própria. Um acúmulo que só aparece quando
alguém tenta entrar é um acúmulo que a coordenação descobre pela ordem errada.

Quando os domínios não são passados ao ciclo, a tela **diz que a leitura está
desligada** em vez de exibir lista vazia. Vazio e desligado se parecem na tela,
e só um dos dois é notícia boa — a mesma distinção do canal de aviso ausente
(ADR-0018).

## Consequências

- A bateria vai de 500 para **524 verificações**; os cenários hospitalares, de
  41 para 65, e passam a se chamar H7–H11.
- `regraDeSegregacao` por par continua existindo, agora documentada como o
  instrumento rombudo: serve à instalação que precise cravar uma
  incompatibilidade nominal que não se acumula em hipótese alguma.
- As matrizes são passadas ao motor de política **e** ao ciclo pela mesma
  lista, explicitamente. Um padrão embutido no ciclo criaria uma segunda lista
  de domínios convivendo com a primeira, e duas verdades sobre o que é
  incompatível seria pior do que nenhuma.
- A verificação que carrega a decisão de produto está no H11 e é negativa:
  depois do acúmulo, a credencial da farmacêutica continua
  `DEVICE_GRANT_CONFIRMED` e nenhuma revogação é disparada.

## O que esta decisão NÃO resolve

- **As matrizes não foram ratificadas por instalação nenhuma.** A de
  medicamentos deriva de norma sem estar nela; a de credenciais é palpite
  fundamentado. Enquanto for assim, o efeito das duas é exigir revisão — nunca
  negar, nunca conceder.
- **Não há tela de configuração.** Editar domínio, zona ou par exige mexer no
  código, e uma política de primeira classe deveria ser versionada com autor e
  data, como a criticidade por instalação (item 8 do backlog).
- **A aprovação de um conflito não tem memória própria.** Ela vence com a
  vigência como qualquer outra (ADR-0016), o que é conservador e provavelmente
  correto — mas ninguém mediu quantas revisões por mês isso custa a uma
  unidade que opera com acúmulo permanente.
