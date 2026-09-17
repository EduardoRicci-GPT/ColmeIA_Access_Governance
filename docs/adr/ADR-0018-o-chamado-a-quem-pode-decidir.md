# ADR-0018 — O chamado a quem pode decidir, e o diário que ninguém drenava

- **Estado:** aceito
- **Data:** 2026-09-17
- **Complementa:** ADR-0017 (a fila existe e aparece), ADR-0016 (vigência, alçada e trilha), ADR-0003 (separação de corpos)

## Contexto

O ADR-0017 pôs a fila de aprovação na tela e fechou nomeando o que não
resolvia:

> **Ninguém é notificado.** A fila aparece para quem abrir a tela. Plantão,
> canal e escalonamento de quem não responde continuam no backlog, e sem eles
> um prazo ainda pode vencer de madrugada sem ninguém ver.

Numa unidade de saúde isso não é limitação de interface — é horário. A
aprovação do cofre de psicotrópicos é concedida às 02h40, sob a janela de doze
horas da escala 12×36; ela vence às 14h40, e quem poderia renová-la trabalhou
de madrugada e foi dormir. A porta para de abrir no meio do plantão seguinte, e
a descoberta acontece na porta, com alguém na frente dela.

Uma tela que informa apenas quem já está olhando informa exatamente quem menos
precisa ser informado.

### O que a implementação revelou: ninguém drenava o diário

O ADR-0016 criou o diário da aprovação, explicou por que ele **acumula e
drena** em vez de gravar na hora — porta síncrona de um lado, ledger assíncrono
do outro — e deixou o ponto de drenagem para "quem sabe quando é seguro
gravar". Fora dos testes, ninguém sabia.

`GateDeAcesso` era construído em dois lugares reais, e nos dois **sem diário**.
Nenhuma linha de `packages/` chamava `drenar()`. Os três atos da aprovação
humana — pedido, decisão, vencimento — existiam como capacidade demonstrada em
uma suíte e não chegavam à cadeia em execução nenhuma.

É a mesma forma de defeito que o ADR-0017 encontrou: a porta existe, o
adaptador existe, o teste prova, e o caminho de produção não chama. Pela
terceira vez neste produto o elo que falta é o último — e sempre o que liga o
sistema a uma pessoa.

## Decisão

### 1. O ciclo drena o diário, num ponto único por volta

`CicloDeGovernanca` ganha `diarioDeAprovacao` e drena depois de selar os
próprios eventos, devolvendo `atosDeAprovacaoRegistrados` no relatório. Um
ponto único por ciclo é o que mantém a cadeia reproduzível; `ocorridoEm` em
cada elo preserva a ordem dos fatos, que a ordem de inserção não precisa
carregar.

A bancada passa a montar o gate **com** diário. Ela é o sistema montado: se não
liga ali, não liga em produção — e foi exatamente por não ligar ali que o
defeito atravessou dois ADRs.

### 2. Quem é chamado: os papéis com alçada, sondados na porta que já existe

`PlantaoDeAprovacao` lê a fila e, para cada pendência, descobre quais papéis
podem decidir aquela faixa perguntando `podeDecidir` papel a papel — o mesmo
movimento do congelamento de alçada (ADR-0016), pela mesma razão: o contrato do
kernel devolve booleano, e acrescentar um método a ele seria editar o espelho.

Chamar quem não pode decidir é ruído, e é também uma mentira discreta: o
registro diria "chamamos alguém" tendo chamado quem não resolve.

**Quando nenhum papel tem alçada, o sistema não finge que chamou.** O canal não
é acionado, o ato entra na cadeia dizendo que não há a quem recorrer, e a tela
mostra isso. É o análogo, na aprovação, da zona descoberta do Freio: a pendência
não depende de insistência, depende de mudança de alçada.

### 3. Por qual canal: uma porta do host, e a ausência dela é fato

`CanalDeAviso` é implementada pelo aplicativo de gestão — quem sabe o ramal do
plantão e quem está na casa às 02h40 é ele, não este produto. O padrão **não é
o silêncio**: é `CANAL_AUSENTE`, que recusa a entrega e diz por quê, gerando
`AccessApprovalNotificationUndelivered` na cadeia e, na tela, a frase "ninguém
foi avisado" no lugar de um espaço em branco.

Essa escolha é a mesma lição que a Aletheia acabou de cobrar em três camadas
diferentes na mesma semana: o adaptador que lança e o chamador que engole; o
servidor que sabe e a tela que apaga; o inventário que registra e o semáforo
que diz "ok". Um canal ausente que não reclama seria a quarta ocorrência, e
desta vez em cima de uma porta hospitalar.

### 4. Com qual insistência: degrau, e a palavra é essa

O degrau conta **insistência**, não escalada hierárquica. Todos os papéis com
alçada já foram chamados no primeiro toque; inventar um nível acima deles seria
modelar uma hierarquia que este produto não conhece.

O intervalo entre toques existe contra o defeito oposto ao do silêncio: o ciclo
roda a cada minuto, e sem ele cada volta do relógio produziria um aviso novo.
Mil avisos por noite ensinam uma equipe a ignorar o canal — o que devolve o
sistema ao estado que este módulo veio corrigir, agora com aparência de estar
funcionando.

**Recusa não gera chamado.** Uma pessoa já decidiu, e insistir com quem recusou
transforma o canal em pressão sobre decisão legítima. Quem quiser reverter abre
outro pedido, que nasce com material e hash novos (ADR-0012).

### 5. O limiar que o ADR-0017 recusou, e por que aqui ele é inevitável

Aquele ADR registrou, sobre a fila na tela:

> Não há limiar de "prestes a vencer", e a ausência é deliberada. Seria mais um
> número sem calibragem, decidindo por conta própria o que merece susto.

Continua valendo **para quem está lendo**: a ordenação põe o mais próximo no
topo e quem lê decide. O aviso não tem leitor ainda. Ele precisa escolher o
INSTANTE de interromper uma pessoa, e nenhuma ordenação escolhe instante. O
limiar deixa de ser evitável.

Sendo inevitável, vai para onde todo número inevitável vai neste produto: oito
`ConstanteCalibrada` em **SOMBRA** — quatro de antecedência, quatro de reforço
—, lidas por `obterEmSombra`, com a ressalva colada ao valor. `CRITICA` é a
única com procedência fora do produto: sessenta minutos, a janela de passagem
de plantão da escala 12×36, que é o único momento previsível do turno em que
quem tem alçada ainda está no prédio. As outras três descem por proporção, e a
proporção é palpite declarado.

O argumento que autoriza um valor em sombra a agir é o mesmo das janelas de
vigência, e pela mesma propriedade: **direção do efeito**. Um aviso só chama
gente. Nunca concede acesso, nunca estende aprovação, nunca cala. Errar para
menos custa um telefonema a mais; errar para mais custa uma porta fechada às
14h40 sem ninguém por perto.

## Consequências

- A bateria vai de 453 para **500 verificações**; a suíte de aprovação, de 100
  para 147.
- O relatório do ciclo passa a responder duas perguntas que não tinha como
  responder: quantos atos humanos entraram na cadeia, e quem foi chamado.
- Dois tipos de evento novos, e o não entregue é o que mais importa: numa
  instalação sem canal, ele é o único registro de que a fila venceu sem que
  ninguém fosse acordado. Os dois são **CONSULTIVOS** (ADR-0003) — chamar gente
  não decide nada.
- O payload do chamado guarda **papéis, nunca pessoas**. Quem está de plantão
  hoje é fato do host; copiá-lo para cá criaria uma segunda verdade sobre a
  escala, que é o defeito que `AutoridadeDoHost` existe para evitar quanto a
  quem manda.
- O despacho é idempotente dentro do intervalo de reforço, e isso é testado: é
  a propriedade que permite chamá-lo a cada minuto.

## O que esta decisão NÃO resolve

- **Não há escala de plantão.** O chamado sabe quais PAPÉIS podem decidir, e
  não quem está acordado agora. Quem dorme e quem está na casa é fato do
  aplicativo de gestão, e enquanto ele não entregar isso pela porta, o aviso
  das 02h40 alcança um cargo, não uma pessoa.
- **Ninguém responde pelo não respondido.** Se o último degrau passa e nada
  acontece, o sistema continua insistindo. Fechar esse laço exige decidir o que
  é um desfecho aceitável quando nenhuma pessoa com alçada responde — e essa é
  uma decisão de governança do hospital, não de software.
- **Nenhum canal real foi escrito.** `CanalEmMemoria` é bancada; o primeiro
  canal de verdade é trabalho de integração, e a porta está no lugar certo para
  recebê-lo.
- **As janelas continuam em sombra**, e sobem de estatuto só com histórico de
  quanto tempo uma pendência leva para ser decidida neste hospital.
