# Ledger de decisões vindas da pesquisa

> **Procedência deste documento.** As decisões abaixo nasceram fora deste
> repositório, numa investigação conduzida em outra sessão (curadoria Íris,
> contraditório Ellion, radar diário de benchmark), entre 02/09 e 17/09/2026.
> Elas chegaram aqui por transcrição, trazidas pelo autor. Estão registradas
> como **decisões recebidas**, não como decisões tomadas neste código — o que
> já foi implementado está marcado, e o que não foi permanece pendente.
>
> Registrar a origem não é formalidade. Uma decisão sem procedência é uma
> regra que ninguém pode contestar por não saber a quem perguntar — a mesma
> exigência que este produto faz a pesos de score e a matrizes de segregação.

## Como ler a coluna de estado

| Estado | Significado |
|---|---|
| `IMPLEMENTADO` | existe em código, com verificação na bateria |
| `PARCIAL` | o princípio está honrado, o objeto nomeado não existe |
| `PENDENTE` | não existe, e a ausência tem consequência declarada |

---

## D-013 — Evidência contextual registra procedência, integridade e verificação

A evidência de um evento de acesso (vídeo, metadado, sensor) deve carregar
**origem, integridade e nível de verificação**, de forma independente do
evento de acesso em si. Vídeo não é uma URL pendurada num evento.

**Estado: `PENDENTE`.** Este produto ainda não tem câmera, sensor nem
evidência — a trilha registra o que o sistema fez, não o que foi observado.

## D-014 — Identidade, credencial e autorização são coisas distintas

Uma identidade reconhecida — mesmo por credencial confiável ou biometria —
**não produz entitlement automaticamente**.

**Estado: `IMPLEMENTADO` na parte que este produto alcança.** `CredentialMethod`
é método, não identidade; o direito nasce de política sobre vínculo, papel e
contexto, nunca da posse de uma credencial. Falta a parte biométrica, que
depende de D-015.

## D-015 — Vínculo biométrico pseudonimizado

Subsistemas biométricos devem receber o mínimo de informação pessoal
necessária. Atributos de RH, competência e responsabilidade permanecem
separados do template biométrico sempre que tecnicamente possível.

**Estado: `PARCIAL`.** A disciplina existe e está provada em outro eixo:
`context-projection` é a fronteira que impede dado clínico de alcançar o motor
(ADR-0007), e o mesmo princípio se aplicaria ao subsistema biométrico. O
objeto `BiometricSubjectBinding` não existe.

## D-016 — Identidade federada não implica autoridade federada

A confiança na identidade pode atravessar organizações e unidades. A
autorização continua sujeita à política local, à competência, à
responsabilidade e ao contexto.

**Estado: `IMPLEMENTADO` em 11/10/2026, pelo D-057.** `DominioDeAutoridade`,
`Tenant` e `DelegacaoDeAutoridade` separam visibilidade comercial de autoridade
institucional, e `autoridadeEfetiva` calcula POR organização — não há união de
papéis entre organizações, nem quando o vínculo é o mesmo. A defesa é
estrutural: a função não recebe o tenant (ADR-0032).

Permanece pendente o reconhecimento de identidade emitida por outra unidade: o
login federado é do host, e este produto só decide o que fazer com o papel
depois que a identidade chegou.

## D-017 — Observação não é julgamento

Nenhuma observação produzida por câmera, sensor, biometria ou IA constitui,
isoladamente, conclusão administrativa sobre a legitimidade de uma presença.
Ela pode **iniciar** avaliação contextual; reconhecer ou criar
responsabilidade institucional exige política, escopo de delegação e
autoridade humana.

**Estado: `IMPLEMENTADO` em 11/10/2026, pelos D-053 e D-056.** O princípio já
estava honrado (ADR-0003 e ADR-0004); o que faltava era o objeto, e agora há
dois. `IdentificadorObservado` separa o fato do sensor da afirmação e da prova,
e `avaliarProva` não tem ramo que alcance `PROVADA` a partir de observação
(ADR-0033). A cadeia
observação → avaliação → incidente → intervenção está separada por construção, e
um incidente de severidade alta não nasce de leitura de modelo.

Permanece `RESEARCH_REQUIRED` a passagem observada com câmera real: nada aqui
fala com sensor.

## D-018 — Capacidade não implica autoridade

Possuir capacidade técnica para observar, decidir ou executar uma ação não
concede autoridade institucional para realizá-la. `AuthorityBoundary` deve ser
avaliado independentemente de `DeviceCapability`.

**Estado: `IMPLEMENTADO` em 11/10/2026.** O escopo de delegação chegou em duas
etapas: `EscopoDeDelegacao` para responsabilidade temporária (ADR-0020) e
`DelegacaoDeAutoridade` para autoridade institucional (ADR-0032), esta com
origem, destino, escopo, vigência e quem assinou. A ausência de qualquer um dos
cinco é o que distingue delegação de vazamento.

E o D-056 acrescentou o caso que faltava do lado do equipamento: a criticidade
da alçada é da INTERVENÇÃO, não do sistema. Inspecionar a rede de gases é
BAIXA; desligá-la é CRITICA.

## D-019 — Estado físico não confirmado não é sucesso

Uma alteração no estado lógico só pode ser declarada fisicamente efetivada
quando houver evidência suficiente de reconciliação. Ausência de confirmação
produz lacuna, não sucesso presumido.

**Estado: `IMPLEMENTADO`, e é a espinha dorsal do produto.** Quatro camadas de
`AccessState`, `DEVICE_SYNC_UNKNOWN` como estado inicial legítimo,
`confidence: UNKNOWN`, cenário P1 inteiro dedicado a provar isso, e um gate de
CI (`lint:estado`) que quebra a bateria se alguém reintroduzir um booleano.

## D-020 — Eventos de fabricante precisam de normalização com proveniência

O domínio não deve depender da taxonomia proprietária de eventos de cada
fabricante. Todo evento normalizado deve preservar sua origem e permitir
rastreamento até a observação original.

**Estado: `PARCIAL`.** `origemDeIngestao` (`WEBHOOK`, `POLLING`,
`LOCAL_EVENT`, `IMPORT`, `SIMULATED_EVENT`) e `decisionOrigin` já preservam
proveniência, e `TipoDeEvento` já é vocabulário próprio. Falta o passo
explícito de normalização — hoje cada adaptador entrega evento já no formato
do domínio, o que funciona com um adaptador simulado e não sobrevive a três
fabricantes reais.

## D-021 — Confiança técnica é contextual

A confiança atribuída a uma observação depende não apenas do algoritmo que a
produziu, mas da saúde, versão, proveniência e estado operacional da
capacidade utilizada.

**Estado: `PARCIAL`.** `confidence` já é função do estado do equipamento e da
idade da leitura — uma leitura recente do estado *anterior* não confirma a
revogação (ADR-0004, defeito corrigido pela própria bateria). Falta declarar
versão, saúde e local de execução da capacidade.

---

## Consolidado de 4 a 10/10/2026 — os sete deltas de outubro

> Mesma procedência das decisões acima: investigação conduzida fora deste
> repositório, trazida pelo autor em 11/10/2026 como consolidado executivo. A
> matriz de confronto contra o código está em `matriz-d051-d057.md`, e foi
> construída ANTES de qualquer linha nova — como o próprio consolidado pedia.

## D-051 — Strong Credential ≠ Strong Access Path

A segurança de um ponto de acesso é a do seu elo mais fraco, e o elo mais fraco
raramente é a credencial que o projeto escolheu: é a chave mecânica da portaria,
a botoeira alcançável pelo vão, a senha de serviço do instalador, o modo livre
programado e nunca revisto.

**Estado: `IMPLEMENTADO` (ADR-0028).** `MeioDeAcesso` separa credencial de
bypass, `forcaDoCaminho` é o MÍNIMO dos elos, e `avaliarExposicao` cruza a força
com a criticidade do recurso. Caminho não levantado devolve `NAO_AVALIADA`, e
nunca `FORTE`.

Consumido pelo portão de emissão. Não há regra de política sobre exposição, e a
ausência é deliberada: negar a entrada de uma enfermeira não corrige a chave
mecânica do cofre — o achado é de facilities e vai para quem conserta.

## D-052 — Signal ≠ Meaning

Comandar o relé 2 não é abrir a porta da UTI 3. Entre o identificador que o
produto comanda e a folha que se abre há controlador, número de relé, fiação e
fechadura, e cada degrau é um lugar onde o significado pode ter mudado.

**Estado: `IMPLEMENTADO` (ADR-0029).** `VinculoSemanticoFisico` com quatro
estados, versionamento da configuração física, e teto de confiança no motor
físico: a evidência do fabricante é sobre o CANAL, e nenhuma leitura pode valer
mais do que a correspondência entre o canal e a porta cujo nome está na tela.

O modo de falha que ele impede é o mais silencioso do produto: o comando
FUNCIONA, a confirmação volta, e a porta que trancou foi a do depósito ao lado.

## D-053 — Observed Identifier ≠ Credential Proof

Um identificador observado por sensor — placa, rosto, crachá lido por câmera —
não é credencial apresentada e não prova autorização.

**Estado: `IMPLEMENTADO` (ADR-0033).** Três degraus separados, e `avaliarProva`
sem ramo que alcance `PROVADA` a partir de observação, com qualquer confiança
declarada pelo sensor. `APENAS_OBSERVADA` convoca conferência: a placa adianta a
fila e não substitui a apresentação.

**`RESEARCH_REQUIRED`:** LPR e reconhecimento facial reais, que exigem integração
verificada e avaliação de privacidade.

## D-054 — Entitlement ≠ Immediate Exercisability

Privacidade de paciente, procedimento em curso, ocupação máxima, manutenção e
bloqueio local impedem a entrada AGORA sem revogar o direito de ninguém.

**Estado: `IMPLEMENTADO` (ADR-0030).** `ExercicioDoDireito` é leitura separada
que o `desiredState` não conhece, e as regras novas só decidem em modo ACCESS.
A assimetria é o delta: a MESMA restrição que nega o instante não decide nada
sobre o direito, e há teste que a guarda.

`BLOQUEIO_LOCAL_DO_EQUIPAMENTO` ganhou lugar próprio em impedimento absoluto —
nem a quebra de vidro o atravessa, porque conceder em software uma porta
trancada por dentro faz a tela prometer o que a fechadura não cumpre.

## D-055 — Issuance ≠ Revocability

Emitir é assumir uma janela residual que a revogação não encurta. Um PIN offline
de noventa dias numa fechadura sem gateway não se revoga: ele expira.

**Estado: `IMPLEMENTADO` (ADR-0028), e é o mais consequente dos sete.** O ciclo
decidia o direito com todo o rigor do produto e materializava sem perguntar o
que estava materializando. Agora `avaliarEmissao` roda antes de qualquer ordem,
com tetos por criticidade em SOMBRA — eles convocam uma pessoa e nunca recusam
sozinhos. A única recusa é estrutural: credencial sem término previsto, sem
caminho de revogação, em recurso CRITICAL.

## D-056 — Safety Observation ≠ Intervention Authority

Observar um sistema físico não autoriza intervir nele. A cadeia tem quatro atos
— observação, avaliação, incidente, intervenção — e colapsá-los produz o sistema
que desliga a rede de oxigênio de um bloco cirúrgico com três salas ocupadas.

**Estado: `IMPLEMENTADO` como fluxo, `SIMULATED` como execução (ADR-0031).** Os
quatro atos separados por construção, autorização contra o hash do material
revisado, e `ordemDeIntervencao` que lança quando não houve autorização. Nada
neste módulo fala com equipamento.

A recusa que liga este delta ao ADR-0027: um incidente de severidade alta não
nasce de prosa. Quando toda a sustentação vem de leitura de modelo, a abertura é
recusada — sem descartar a leitura, que segue valendo como triagem.

## D-057 — Hierarchical Visibility ≠ Federated Authority

Administrar comercialmente uma frota de equipamentos não confere autoridade
institucional sobre as organizações atendidas.

**Estado: `IMPLEMENTADO` (ADR-0032), e fecha o D-016.** Visibilidade comercial e
autoridade institucional são eixos independentes, e a defesa é estrutural:
`autoridadeEfetiva` não recebe o tenant. Não é verificação que alguém poderia
esquecer — é informação que a função não tem.

O segundo caso tem teste próprio: a mesma pessoa em dois hospitais da mesma rede.
A identidade atravessa organizações; o papel não.

---

## Decisão que a implementação acrescentou, e que a pesquisa não previa

**D-022 — A porta que ninguém chama é uma negativa silenciosa.**

Três vezes seguidas, neste código, o defeito encontrado não foi uma regra
errada: foi um caminho que existia e que nenhuma execução real percorria. A
política exigia revisão humana e ninguém abria o pedido (ADR-0017); o diário
levava o ato humano à cadeia e ninguém o drenava (ADR-0018); a matriz de
segregação existia como fábrica de regra e não estava no conjunto base
(ADR-0019).

O padrão é específico o bastante para virar regra de revisão: **toda porta
declarada deve ter, na bancada, quem a chame** — e a bancada é o sistema
montado, não um teste isolado. Uma capacidade que só é exercida em teste é
uma capacidade que não existe em produção.

Uma quarta vez, e desta a regra já existia: o ADR-0023 entregou a quebra de
vidro inteira e o plantão nunca foi avisado dela. O que mudou é que o defeito
foi **declarado ao ser cometido**, na seção "o que esta decisão não resolve",
em vez de descoberto meses depois — e é assim que se paga uma dívida que ainda
vai existir: escrevendo-a no lugar em que quem vier depois vai tropeçar nela.
O ADR-0024 a quitou.

Uma quinta, e esta é a variante mais discreta do padrão: `contagemPorZona()`
existia desde o primeiro dia da quebra de vidro e nenhum Health Score a lia. Não
era uma porta sem chamador — era uma LEITURA sem leitor, que compila, tem teste
e não muda número nenhum. O ADR-0025 a ligou, e a regra ganha a extensão que
faltava: **um indicador que nenhum score consome é um indicador que não
existe.**

E uma sexta, que é a mais cara de todas e por isso fecha a série: o caso de
escalonamento. A revogação que nunca chegou à porta — o achado que justifica a
existência deste produto — era detectada pela reconciliação, pontuada pelo
score, desenhada na timeline, nomeada como caso, e não chamava ninguém. O
ADR-0026 a ligou. Vale registrar o que as seis têm em comum: nenhuma era um
erro de lógica. Todas eram capacidades corretas, testadas, sem chamador — e
seis ocorrências no mesmo repositório dizem que este é o modo de falha
característico de um produto construído por camadas bem separadas.

**Sétima e oitava, em 11/10/2026, e as duas mudam algo sobre o padrão.**

A sétima é a primeira que nasce pontuada. O incidente físico aberto sem ninguém
encaminhado (D-056) entrou no Health Score no mesmo dia em que a capacidade
existe, em vez de ser descoberto meses depois — e o componente cobra a AUSÊNCIA
de encaminhamento, nunca a existência do incidente. Pagar a dívida no ato de
contraí-la é mais barato do que escrevê-la para quem vier depois.

A oitava é a mais antiga de todas, e só apareceu porque os deltas de outubro a
esbarraram: **o modo ACCESS não tinha chamador.** O ADR-0008 separou os dois
modos de decisão com argumento correto, `REGRA_TURNO` guardava
`modo === 'ACCESS'`, o tipo existia, o motor aceitava os dois — e nenhuma
execução deste repositório jamais montou um pedido em modo ACCESS. Desde o
segundo dia do produto. O achado veio ao escrever as regras de D-053 e D-054,
que só fazem sentido nesse modo: ficou visível que elas nasceriam mortas.

O que as oito ensinam, somadas: **o padrão não é sobre esquecimento. É sobre a
ordem em que um produto por camadas é construído.** A camada que declara a
capacidade é escrita por quem está pensando na capacidade; o chamador pertence a
outra camada, escrita noutro dia, por quem está pensando noutra coisa. O
intervalo entre os dois dias é onde a dívida nasce — e a única defesa que
funcionou até agora foi a bancada montada: se a bancada não liga, produção
também não liga.
