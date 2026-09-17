# ADR-0027 — Sinergentia³: o modelo é faculdade, não provedor

**Estado:** aceito
**Data:** 2026-09-17
**Origem da doutrina (segunda mão):** Aletheia — `src/data/faculdades.ts`, `src/data/sinergentiaStatus.ts`, `src/services/verificadorAncoragem.ts`, `src/services/roteadorFaculdades.ts`
**Fonte primária, não conferida:** `Ricci-I-Next/MPEH_Sinergentia-` e `Ricci-I-Next/MPEH-Sinergentia` — fora do alcance desta sessão
**Relacionado:** ADR-0003 (separação de corpos), ADR-0007 (fronteira de dado clínico), ADR-0011 (calibragem), item 15 e item 10 do backlog

## Contexto

O pedido era integrar a Sinergentia³ neste produto para torná-lo mais
independente de IA externa, mantendo IA externa só quando necessária. Antes de
escrever qualquer linha, três achados da análise mudam a forma do trabalho.

**Primeiro: o runtime não estava ao alcance desta sessão.**

> **CORREÇÃO, mesma data.** A primeira redação deste parágrafo dizia que "o
> runtime não existe como código a ser copiado". Estava ERRADO, e o erro é do
> tipo que este produto trata com mais severidade: uma conclusão afirmada com
> mais alcance do que a evidência sustentava. O que eu havia examinado eram os
> repositórios visíveis na sessão — `MPEH-Sinergentia-K3-Runtime`, que é um fork
> de monorepo de agente de terceiro sem material Sinergentia dentro, e
> `Sinergentia-Book`, que tem só um README. Disso concluí ausência, quando a
> leitura honesta era "não encontrei nos lugares em que olhei".
>
> O runtime EXISTE: `Ricci-I-Next/MPEH_Sinergentia-`, privado, com atividade no
> mesmo dia desta decisão, e há também `Ricci-I-Next/MPEH-Sinergentia` — que é
> provavelmente o `MPEH_Sinergentia_A11` citado no cabeçalho de
> `agentesGovernados.ts` da Aletheia. Ambos estão fora do escopo desta sessão
> por serem de outro proprietário, e não por não existirem.

O que esta decisão usou como fonte foi, portanto, a doutrina **como implementada
na Aletheia**: o registro de identidade, o registro de faculdades, o roteador em
cascata, o verificador de ancoragem e o motor de capacidade reduzida. É fonte
legítima e é fonte de segunda mão.

**Segundo: a origem mantém o laboratório em sombra.** O registro público diz
`laboratorioEstado: 'SHADOW_INTEGRATION_CANDIDATE'` e
`runtimeAtivoNaAletheia: false`. Copiar para cá um runtime que a origem mantém
em sombra lhe daria, por mudança de endereço, uma autoridade que ele não tem na
origem — exatamente o que o estatuto de calibração deste produto impede para um
número. O que atravessa é a doutrina, reimplementada nesta casa e verificada
aqui. O que não atravessa é código em sombra fingindo estatuto.

Este argumento sobrevive à correção acima, e é o que mantém a decisão de pé: ele
não dependia de o runtime não existir. Dependia de ele estar em SHADOW na
origem, e está.

**Terceiro, e é o que inverte o desenho: este produto não tem IA nenhuma para
reduzir.** A ColmeIA é integralmente determinística hoje. "Tornar-se mais
independente de IA externa" não é, aqui, remover dependência: é impedir que ela
se instale quando o item 15 do backlog ("camada de IA sobre o assurance") for
implementado. A pergunta certa não é onde encaixar um modelo — é o que sobra
para um modelo depois que os instrumentos determinísticos fizeram o que sabem.

## Decisão

A frase que governa o pacote inteiro é da Aletheia e é a decisão, não o enfeite:

> "A Aletheia não tem um provedor de IA. Tem FACULDADES. Um **provedor** é de
> quem se depende; uma **faculdade** é o que se usa."

Entra em `packages/sinergentia/`, com quatro peças e uma inversão.

### A identidade é feita de três negativas

Do registro público da origem: `autoridade: { decisao: false, acaoExterna:
false, numerica: false }`. Três "não" que respondem a três perguntas distintas
— não decide acesso, não age sobre equipamento ou cadeia, não produz número — e
que são verificáveis em teste, não declarados em comentário.

O ADR-0003 já tinha o lugar certo reservado antes de haver o que pôr nele: os
atos desta camada caem em **CONSULTIVO** pela regra de corpo que já existia,
sem uma linha de exceção. Não foi coincidência feliz; foi a separação de
autoridade funcionando como separação de autoridade deve funcionar.

### A inversão: o degrau determinístico é o primeiro, não o último

Na Aletheia o núcleo determinístico responde quando nenhum modelo responde —
capacidade reduzida, recibo honesto de indisponibilidade. Aqui ele é o **degrau
zero**, consultado sempre e primeiro, e é uma faculdade como qualquer outra:
implementa a mesma porta, entra no mesmo catálogo, tem taxa de fabricação
medida (zero, e não por mérito — é que não gera frase nova, então não tem como
inventar âncora).

A razão da inversão é de domínio. A Aletheia analisa material aberto, onde a
leitura qualitativa é o produto: sem modelo, resta pouco. A ColmeIA apura estado
de acesso com instrumentos que já produzem frase pronta e exata. Aqui o modelo
não preenche ausência — ele reescreve presença.

E a regra que decorre disso é a mais importante deste ADR:

> **A escalada só acontece quando o degrau determinístico DECLARA que não
> atende. Nunca quando ele atende mal.**

"Atende mal" é julgamento de qualidade, e quem julgaria seria outro modelo. A
partir daí a cascata inteira vira decoração, porque o degrau caro passa a ser
consultado sempre. É assim que uma casa independente vira cliente.

### O que sobra para um modelo, medido contra o que o produto já tem

O item 15 pedia "resumo por público, agrupamento e priorização". Confrontado
com o código, quase tudo já estava feito: agrupar é `resumirDivergencias`;
priorizar é a fila por risco e o Health Score que abre em componentes; atribuir
causa já existe, e com uma regra que nenhum modelo respeitaria sozinho — causa
só é atribuída quando é dedutível.

Sobra a FORMA, e sobra para dois dos quatro públicos. "2 revogações pendentes em
Farmácia porque o gateway está offline desde 08:14" é completa e suficiente para
Segurança e TI. Para Direção e Qualidade é verdadeira e inútil: uma pede
consequência institucional, a outra pede conformidade a norma, e nenhuma das
duas é dedutível do material.

Então **dois dos quatro públicos deste produto nunca acionam modelo nenhum** —
não por economia, mas porque não precisam. É a forma concreta de independência:
não recusar o modelo, e sim reduzir a superfície em que ele é necessário até
sobrar só o que é mesmo dele.

### A ancoragem: prosa que inventa é descartada, não corrigida

O instrumento vem da Aletheia e o caso que o originou está registrado lá: o
modelo recebeu uma manchete sobre um "resort na Flórida" e escreveu
"Mar-a-Lago", que não estava em lugar nenhum da fonte.

Nomes, números e identificadores são ÂNCORAS: ou estão na fonte, ou foram
inventados. Não há terceira possibilidade. Verbos e conectivos não são âncoras,
porque reformular é o trabalho que se está pedindo.

A versão desta casa é mais estreita que a da origem, e mais afiada por isso. A
Aletheia carrega uma lista longa de palavras portuguesas que abrem frase sem
serem nome próprio — "Paralelamente", "Ambos", "Vários" —, cada uma acrescentada
depois de um falso positivo medido; é conhecimento caro e específico de prosa
jornalística aberta. Aqui o domínio ancora em duas classes e só nelas:
identificadores (`ep-farm-2`, `z-uti`, `VIDRO-00001`) e números. Não há nome
próprio livre a julgar, porque pessoa não entra em prosa deste produto por
decisão anterior (ADR-0007). Copiar a lista seria carregar acerto de outro campo
sem a medição que o sustenta.

E não corrige. Reprovou, a prosa é **descartada** e o material determinístico —
que nunca foi jogado fora — é entregue no lugar. Corrigir exigiria adivinhar o
que o modelo quis dizer, e devolveria um texto meio-inventado com aparência de
conferido.

### Na cadeia, e na tela

Dois tipos de evento: `CognitiveReadingRouted` e `CognitiveProseDiscarded`. O
segundo é o que vale — é a evidência de que a guarda funciona e, se um dia parar
de aparecer em instalação nenhuma, é também a evidência de que alguém a
desligou. Uma guarda que nunca deixa rastro é indistinguível de uma guarda
ausente.

A prosa inventada **não** entra na cadeia por extenso: só as âncoras que ela
introduziu. A cadeia é o único lugar deste produto onde tudo é verdade
conferida.

Na tela, cada leitura diz quem a escreveu **antes** do texto. Um parágrafo já
absorvido não se desfaz porque o rodapé informou a procedência.

## Alternativas descartadas

**Copiar o runtime da Aletheia.** Daria estatuto por mudança de endereço a
código que a origem mantém em sombra.

**Um adaptador de provedor, ao modo corrente.** Produziria exatamente a palavra
que a doutrina recusa. Provedor é de quem se depende.

**Escalar por qualidade percebida.** Exigiria um juiz, e o juiz seria outro
modelo. A escalada acontece por declaração de insuficiência, que é ato do degrau
determinístico sobre si mesmo.

**Corrigir a prosa reprovada em vez de descartá-la.** Adivinhação com aparência
de conferência.

**Deixar o roteador funcionar sem degrau zero.** Ele lança, pelo mesmo desenho
do leitor do R-VEP que lança em vez de aproximar: um produto que depende de
modelo para falar não deve ser alcançável por configuração distraída.

## Consequências

- A bateria vai de 715 para **756 verificações**; a suíte nova tem 41.
- Nenhum caminho do roteador devolve silêncio. O pior desfecho é entregar o
  apurado dizendo que ninguém o reescreveu e por quê — capacidade reduzida, não
  indisponibilidade.
- O núcleo puro continua sem conhecer rede: a faculdade é porta injetada, como
  `CanalDeAviso` e `AutoridadeDoHost`. Isso garante **por construção** que o
  motor de política não tenha por onde consultar modelo nenhum.
- Um defeito apanhado no caminho e corrigido: a explicação da rota dizia
  "respondido pelo núcleo determinístico" quando o degrau zero havia DECLINADO e
  ninguém mais existia na cascata — verdadeiro, e calado sobre o fato de que a
  leitura pedida não foi produzida. A condição passou a ser "o degrau zero
  atendeu", e o texto declara "o que está acima é o material apurado, não a
  leitura pedida".

## O que esta decisão NÃO resolve

- **A conferência contra a fonte primária está pendente.** Esta implementação é
  porte de doutrina lida em segunda mão. Quando `Ricci-I-Next/MPEH_Sinergentia-`
  estiver ao alcance, três coisas precisam ser conferidas contra ele, e cada uma
  pode mudar código: (1) o contrato de identidade e as três negativas, que aqui
  vieram do espelho da Aletheia e não do original; (2) a taxonomia de tarefas e
  de escolas, que aqui foi reduzida ao que este domínio usa; (3) o verificador de
  ancoragem, que aqui foi deliberadamente estreitado para identificadores e
  números — se a fonte primária tiver classes que este domínio também precisa, a
  redução vira lacuna. Enquanto a conferência não acontecer, este pacote é
  `INTERFACE_READY` quanto à fidelidade à origem, e `IMPLEMENTED` quanto ao
  comportamento verificado aqui.
- **Nenhuma faculdade real existe.** `FaculdadeDeBancada` é bancada. A primeira
  faculdade de verdade — local ou remota — é integração, e a porta já está no
  lugar. A cascata de uma instalação sem faculdade contratada é o degrau zero
  sozinho, e o produto funciona inteiro assim.
- **A taxa de fabricação não é medida em produção.** O campo existe, a ancoragem
  produz o dado, e nada ainda acumula a série por faculdade. Sem isso, escolher
  entre duas faculdades continua sendo preferência, não medição — que é
  exatamente o que a doutrina da origem recusa.
- **A ancoragem cobre uma falha, não todas.** Um texto pode não introduzir
  âncora nenhuma e ainda assim distorcer o sentido. O instrumento não se
  apresenta como mais do que é, aqui como na origem.
- **O orçamento do ciclo e o circuito não estão calibrados.** São palpites
  declarados, e diferentemente dos pesos do Health Score ainda não passaram pelo
  registro de calibragem. Enquanto não passarem, o efeito deles é apenas
  interromper mais cedo uma tentativa de melhorar algo que já funciona.
