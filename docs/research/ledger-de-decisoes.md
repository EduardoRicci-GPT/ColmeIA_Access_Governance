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

**Estado: `PENDENTE`.** A hierarquia `Organization → … → Endpoint` existe e o
Health Score já é calculado por nível, mas não há `TrustDomain` nem
reconhecimento de identidade emitida por outra unidade.

## D-017 — Observação não é julgamento

Nenhuma observação produzida por câmera, sensor, biometria ou IA constitui,
isoladamente, conclusão administrativa sobre a legitimidade de uma presença.
Ela pode **iniciar** avaliação contextual; reconhecer ou criar
responsabilidade institucional exige política, escopo de delegação e
autoridade humana.

**Estado: `IMPLEMENTADO` como princípio, `PENDENTE` como fluxo.** O produto
já separa rigorosamente medir de decidir (ADR-0003: DIRETIVO, CONSULTIVO,
EXECUTIVO, HUMANO) e já recusa afirmar estado físico não confirmado
(ADR-0004). O que falta é o objeto que este princípio governaria — não há
passagem observada porque não há observação.

## D-018 — Capacidade não implica autoridade

Possuir capacidade técnica para observar, decidir ou executar uma ação não
concede autoridade institucional para realizá-la. `AuthorityBoundary` deve ser
avaliado independentemente de `DeviceCapability`.

**Estado: `PARCIAL`.** `CapacidadeDeEndpoint` e `CapacidadeDeProvedor` já
existem e já governam o que pode ser pedido a cada equipamento; a alçada
humana é congelada por decisão (ADR-0016). O que não existe é o limite de
**delegação** — um supervisor não tem escopo declarado, porque ainda não há
supervisor no modelo.

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
