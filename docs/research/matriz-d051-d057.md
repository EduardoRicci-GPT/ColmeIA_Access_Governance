# Matriz de reconciliação D-051 → D-057

> **Procedência.** Os sete deltas chegaram no consolidado executivo da semana de
> 4 a 10/10/2026, produzido fora deste repositório (curadoria Íris,
> contraditório Ellion), e trazidos aqui pelo autor. O consolidado pedia,
> como Etapa 0, que o código fosse confrontado antes de qualquer linha nova —
> e que o resultado desse confronto fosse registrado. Este arquivo é esse
> registro.
>
> A regra que ele honra está no próprio consolidado: *"Radar descobre → Delta
> propõe → Code confronta → Implementação modifica → Testes verificam →
> Repositório comprova."* O que vem abaixo é a etapa "confronta", feita contra
> o código em `main` em 11/10/2026, com a bateria de 756 verificações rodando.

## Como ler a coluna de estado

| Estado | Significado |
|---|---|
| `JA EXISTE` | o objeto e o comportamento existem, com verificação na bateria |
| `PARCIAL` | o princípio está honrado em outro eixo; o objeto nomeado não existia |
| `DELTA REAL` | não existia, e a ausência tinha consequência operacional |
| `RESEARCH_REQUIRED` | depende de decisão, hardware ou avaliação que este código não tem |

---

## D-051 — Strong Credential ≠ Strong Access Path

**Antes: `DELTA REAL`.** O produto media a força do que a pessoa APRESENTA —
`CredentialMethod`, `metodosSuportados`, `EndpointCapabilities` — e não tinha
vocabulário nenhum para o que ATRAVESSA a porta sem passar pelo sistema. Grep
por `bypass`, `exposicao` e `caminho de acesso` não devolvia nada.

A consequência era específica: um leitor biométrico numa porta com chave
mecânica de cópia livre aparecia no produto como porta biométrica. O achado é
que a credencial escolhida descreve como entram as pessoas honestas.

**Agora:** `packages/dominio/caminho.ts`. `MeioDeAcesso` com duas espécies
(`CREDENCIAL` e `BYPASS`), `forcaDoCaminho` como MÍNIMO dos elos, e
`avaliarExposicao` cruzando a força com a criticidade do recurso. Duas decisões
que merecem ser lidas: caminho não levantado devolve `NAO_AVALIADA` e nunca
`FORTE`; e `BARRA_ANTIPANICO` / `INTERTRAVAMENTO_DE_INCENDIO` são FRACAS para o
controle de acesso e inegociáveis para a segurança de vida — daí
`EXIGE_COMPENSACAO` existir como nível, em vez de só `ACEITAVEL` e
`INACEITAVEL`.

**Consumido por:** o portão de emissão (`governanca/emissao.ts`), que é chamado
pelo ciclo. Não há regra de política sobre exposição, e a ausência é
deliberada: negar a entrada de uma enfermeira não corrige a chave mecânica do
cofre. O achado é de facilities, e vai para quem conserta.

## D-052 — Signal ≠ Meaning

**Antes: `DELTA REAL`.** A reconciliação física inteira repousava numa
pressuposição nunca escrita: que `ep-uti-3` corresponde à porta da UTI 3. A
correspondência era uma linha de configuração que ninguém conferiu caminhando
até a porta.

O modo de falha é o mais silencioso do produto, porque o comando FUNCIONA: a
nuvem aceita, o controlador atua, o evento de confirmação volta, a trilha
registra "revogação confirmada no equipamento" — e a porta que trancou foi a do
depósito ao lado. Tudo verde, tudo verde sobre outra porta.

**Agora:** `packages/dominio/vinculo-semantico.ts` e o teto de confiança em
`physical-state-reconciliation/tipos.ts`. Quatro estados (`VERIFICADO`,
`DECLARADO`, `DIVERGENTE`, `NAO_VERIFICADO`), versionamento da configuração
física, e `reavaliarVinculo` comparando a versão da verificação com a corrente —
de modo que um painel remexido envelheça a conferência sem ninguém ter de
lembrar de invalidá-la.

**Consumido por:** o motor físico, numa guarda própria (a quarta das seis), e
pelo Health Score, com componente `VINCULOS_SEMANTICOS`. A escolha de NÃO
rebaixar confiança quando o vínculo é apenas ausente está justificada no código:
rebaixar mil linhas de uma instalação sem cadastro deixaria o painel amarelo
inteiro, e painel amarelo inteiro não é lido.

## D-053 — Observed Identifier ≠ Credential Proof

**Antes: `PARCIAL`.** O princípio irmão — identidade ≠ credencial ≠ autorização
— já estava implementado desde o D-014: `CredentialMethod` é método e não
identidade, e o direito nasce de política sobre vínculo. O que não existia era a
espécie que chega quando a portaria ganha câmera: grep por `placa`, `veiculo`,
`observado` (como identificador) não devolvia nada.

**Agora:** `packages/dominio/identificador.ts`. Os três degraus separados —
`IdentificadorObservado` (fato do sensor), `AfirmacaoDeIdentidade` (inferência),
`CredencialApresentada` + `VinculoDeCredencial` (prova) — e `avaliarProva`, cuja
estrutura é a regra: nenhum ramo da função alcança `PROVADA` a partir de
observação, com qualquer confiança declarada pelo sensor.

`SujeitoVeiculo` cobre placa, transportadora, motorista, OS e missão, e
`oQueFaltaParaEntrar` existe porque a alternativa é a tela dizer "não
autorizado" a um motorista com a ordem de serviço na mão — e a portaria resolver
por telefone, que é onde nada fica registrado.

**Consumido por:** `R-PROVA-DE-IDENTIFICADOR`, que produz `REQUIRE_APPROVAL` e
nunca `ALLOW`, e pelo atendente de decisão online.

**Permanece `RESEARCH_REQUIRED`:** LPR e reconhecimento facial reais. Nada neste
código fala com câmera, e integrar um exige avaliação de privacidade que não é
decisão de software.

## D-054 — Entitlement ≠ Immediate Exercisability

**Antes: `PARCIAL`.** `restricaoDaZona` e `nivelDeRestricao` existiam no
contexto de política, e a regra sanitária os consumia. O que não existia era a
distinção entre o DIREITO e o EXERCÍCIO dele num instante — privacidade de
paciente, procedimento em curso, ocupação máxima, manutenção, bloqueio local.

A gravidade do delta está no erro que ele impede, porque é um erro que parece
certo: implementar "não entra agora" como revogação. Isso dispara ordem ao
fabricante por causa de uma obra de duas horas, exige reemissão depois, grava na
trilha "direito revogado" onde houve "sala ocupada" — e põe dois motores a
discordar permanentemente sobre o mesmo fato.

**Agora:** `packages/dominio/restricao-local.ts`, com leitura separada
(`ExercicioDoDireito`) que o `desiredState` não conhece. Duas regras novas em
modo ACCESS, e a assimetria com o modo ENTITLEMENT é o delta inteiro — guardada
por teste: a MESMA restrição que nega o instante não decide nada sobre o direito.

Um terceiro caso ganhou lugar próprio: `BLOQUEIO_LOCAL_DO_EQUIPAMENTO` nega
inclusive sob quebra de vidro, porque conceder em software uma porta trancada por
dentro faria a tela prometer o que a fechadura não cumpre — e num corredor, às
3h, essa frase faz alguém parar de procurar outro caminho.

## D-055 — Issuance ≠ Revocability

**Antes: `DELTA REAL`, e o mais consequente dos sete.** Todo o produto sabia
responder "esta revogação chegou à porta?" — é a pergunta que justifica as quatro
camadas de estado. Ninguém fazia a pergunta anterior: no instante da emissão, o
que será necessário para esta credencial parar de funcionar, e quanto tempo isso
leva?

O ciclo decidia o direito com todo o rigor — vínculo, papel, turno, competência,
segregação, aprovação humana ligada ao hash do material — e materializava sem
perguntar o que estava materializando. Um PIN offline de noventa dias numa
fechadura sem gateway encerra a discussão que a aprovação acabou de ter.

**Agora:** `packages/dominio/revogabilidade.ts` (cinco modos, janela residual
com `null` significando SEM TÉRMINO PREVISTO) e `packages/governanca/emissao.ts`
(o portão, com tetos por criticidade em SOMBRA no registro de calibragem).

A assimetria dos vereditos é a decisão de produto: os tetos em sombra
**convocam** uma pessoa e nunca recusam sozinhos; a única `RECUSA` é estrutural
e independe de calibragem — credencial sem término previsto, sem caminho de
revogação, em recurso CRITICAL. Ali o produto não escolhe um limite: recusa-se a
dar uma chave que não tem como pedir de volta.

**Consumido por:** o ciclo, em `materializar`, antes de qualquer ordem e só na
concessão (revogar não cria janela — revogar é o que tenta fechá-la). E pelo
Health Score, componente `JANELAS_RESIDUAIS`.

## D-056 — Safety Observation ≠ Intervention Authority

**Antes: `PARCIAL`.** O vocabulário estava reservado desde o ADR-0003 —
CONSULTIVO lê e propõe, HUMANO aprova, EXECUTIVO materializa — e o D-017
(observação não é julgamento) e o D-018 (capacidade não implica autoridade)
estavam no ledger como pendentes. Não havia objeto nenhum: grep por
`intervencao`, `incidente` (como entidade) e `observacao` física não devolvia
nada aplicável.

**Agora:** `packages/governanca/intervencao.ts`, com os quatro atos separados por
construção — `avaliarCondicao` não abre incidente, `abrirIncidente` exige
avaliação com critério declarado, `MesaDeIntervencao.autorizar` exige decisão
humana contra o hash do material revisado, e `ordemDeIntervencao` lança se a
intervenção não foi autorizada.

Duas recusas que merecem leitura. `SOMENTE_MODELO_EM_SEVERIDADE_ALTA`: um
incidente de severidade alta sobre rede de gases não nasce de prosa — e a
recusa não descarta a leitura do modelo, que segue entre as evidências como
triagem. E a criticidade da alçada é da INTERVENÇÃO, não do sistema:
inspecionar a rede de gases é BAIXA, desligá-la é CRITICA.

**Permanece `SIMULATED`:** nada neste módulo fala com equipamento físico.
`ordemDeIntervencao` devolve um registro para a camada executiva, e não um
comando.

## D-057 — Hierarchical Visibility ≠ Federated Authority

**Antes: `DELTA REAL`.** A hierarquia `Organization → … → Endpoint` é uma
hierarquia de LUGARES, e funciona para o Health Score, que sobe somando fatos
sobre portas. A tentação era esticá-la: criar um nó acima da organização para a
integradora e deixar a autoridade subir por ele como o score sobe.

O defeito que isso produz não é escalada de privilégio por bug — é escalada por
desenho. O administrador da integradora passaria a aprovar acesso ao cofre de
psicotrópicos de um hospital que nunca visitou, porque o nó dele é pai do nó do
hospital, e nenhum teste de permissão pega isso: o sistema está funcionando como
foi modelado.

**Agora:** `packages/governanca/federacao.ts`. Visibilidade comercial
(`visibilidadeDe`, que devolve a ressalva junto da lista) e autoridade
institucional (`autoridadeEfetiva`) são independentes, e a defesa é estrutural:
a função de autoridade NÃO RECEBE o tenant. Não é uma verificação que alguém
poderia esquecer de fazer — é uma informação que a função não tem.

O segundo caso é mais sutil e tem teste próprio: a mesma pessoa em dois
hospitais da mesma rede. A identidade atravessa organizações; o papel não.

**Consumido por:** `MesaDeIntervencao`, por `ConferenciaDeAutoridadeFederada`,
com motivo de recusa próprio (`AUTORIDADE_NAO_FEDERADA`) — porque ter alçada e
não ter autoridade aqui exigem providências opostas: a primeira sobe o caso, e a
segunda diz que o caso está na mesa errada.

---

## O que o confronto encontrou e o consolidado não previa

**O modo ACCESS não tinha chamador.** O ADR-0008 separou dois modos de decisão
com argumento correto, `REGRA_TURNO` guardava `modo === 'ACCESS'`, o tipo
existia, o motor aceitava os dois — e nenhuma execução deste repositório jamais
montou um pedido em modo ACCESS. A capacidade estava completa, testada por
dentro, e sem chamador desde o segundo dia do produto.

O achado veio ao escrever as regras de D-053 e D-054, que só fazem sentido em
modo ACCESS: ficou visível que elas nasceriam mortas. É a oitava ocorrência do
padrão que o ledger registra como D-022 — e a mais antiga delas.

A correção está em `packages/orquestracao/decisao-online.ts`
(`AtendenteDeAcesso`), com uma honestidade que o modo exigia: um endpoint que
não declara `ONLINE_DECISION` não recebe resposta nenhuma, porque ele decidiu
sozinho, e inventar uma resposta nossa para um ato já consumado misturaria o
corpo que executa com o que decide.

## O que o consolidado pediu e este código NÃO fez

- **`TransactionPathAssurance` como objeto próprio** (D-051). O que existe é
  `LeituraDeExposicao`, que responde à mesma pergunta num nível acima. Um objeto
  por transação exigiria telemetria de transação que este produto não coleta.
- **`BiometricSubjectBinding`** (D-015, retomado pelo D-053). O vínculo
  pseudonimizado continua pendente, como o ledger já registrava.
- **Persistência.** Tudo o que os sete deltas acrescentaram vive em memória,
  como o resto do produto. PostgreSQL continua sendo o item 1 do backlog.
- **Bancada de hardware.** Nenhuma das sete leituras foi exercida contra
  equipamento real. A revogabilidade do TTLock, do Control iD e do Seam está
  declarada a partir da documentação do fabricante, não medida — e é por isso
  que `ProcedenciaDeRevogabilidade` tem o valor `MEDIDA_EM_BANCADA`, hoje não
  usado por ninguém.
