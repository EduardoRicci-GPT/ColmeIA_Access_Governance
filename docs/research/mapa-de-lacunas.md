# O que a pesquisa pediu e o que este código responde

> Leitura cruzada entre a especificação acumulada na investigação (02/09 a
> 17/09/2026) e o estado do repositório em 17/09/2026, com 522 verificações
> passando. Serve para responder uma pergunta só: **o que ainda falta, e o que
> a falta custa?**

## O que já está de pé

| Pedido da pesquisa | Onde vive |
|---|---|
| Quatro motores em sequência | `policy-engine`, `entitlement-reconciliation`, `physical-state-reconciliation`, `observability-assurance` |
| Estado lógico ≠ estado físico, sem booleano | `dominio/estado.ts` + gate de CI `lint:estado` |
| `ENTITLEMENT` × `ACCESS` como perguntas distintas | `ModoDeDecisao` |
| Contrato de adaptadores v2 com capacidades | `adapters/contrato` |
| Simulador determinístico com modos de falha | `adapters/mock` (xorshift com semente) |
| TTLock, Control iD, Seam sem inventar API | os três passam na conformidade **recusando** |
| `decisionOrigin` distinguindo quem decidiu | `dominio/eventos.ts` |
| Health Score explicável e hierárquico | `observability-assurance/health.ts` |
| Pesos com estatuto declarado | doze constantes em SOMBRA (ADR-0013) |
| Trilha imutável e reconstrução temporal | ledger encadeado por hash (ADR-0011) |
| Idempotência, correlação e política de retry | `orquestracao/idempotencia.ts`, `dominio/escalonamento.ts` |
| Minimização de dado clínico | `context-projection` (ADR-0007) |
| Segregação de funções com revisão humana | `policy-engine/segregacao.ts` (ADR-0019) |
| Aprovação humana ligada ao conteúdo, com prazo e alçada | ADR-0012, ADR-0016 |
| Fila de aprovação e chamado a quem decide | ADR-0017, ADR-0018 |

## O que falta, em ordem do que custa mais

### 1. Competência não é modelada

A pesquisa chegou a uma formulação precisa: *"quem, por competência e
responsabilidade vigente, deveria possuir qual direito"*. Este código modela
**papel** e **vínculo**, e trata competência como se fosse papel.

Não são a mesma coisa, e a diferença aparece na farmácia: um profissional
pode ter o cargo e não ter a habilitação vigente. Hoje o motor concederia.
Enquanto competência não for objeto próprio, a resposta do produto à pergunta
que a pesquisa formulou é incompleta — e ele não sabe que é.

### 2. Responsabilidade temporária e escopo de delegação

O achado mais original da investigação: o hospital não funciona só pela escala
formal do RH. A auxiliar que atravessa a porta da UTI fora da escala pode
estar cobrindo um déficit real, e o supervisor da unidade pode reconhecer isso
— **concedendo responsabilidade, não portas**, dentro do limite da sua
autoridade, com motivo e prazo. O sistema deriva os acessos.

Este é o encaixe natural do que já existe: `GateDeAcesso` já congela alçada,
`PlantaoDeAprovacao` já chama quem pode decidir, `CicloDeGovernanca` já
reconcilia. Falta `TemporaryResponsibility`, `DelegationScope` e
`AccessExceptionRequest` — e, sem eles, toda exceção legítima continua sendo
resolvida fora do sistema, que é onde ela não deixa rastro.

### 3. `Explain Access` como pergunta única

A explicação existe em pedaços: `razao` na decisão de política, `explicacao`
no verdicto do gate, `descreverReconciliacao` na divergência física,
componentes no score. Não existe a função que a pesquisa chamou de
estratégica: **pessoa × recurso × instante → ALLOW/DENY/REVIEW + por quê**.

Montá-la é barato, porque os dados já estão todos lá. Não montá-la deixa a
resposta espalhada por quatro lugares — e uma auditoria pergunta uma vez só.

### 4. Break-glass

A emergência assistencial não está modelada. Hoje um acesso urgente em faixa
crítica depende de duas assinaturas, o que numa parada cardíaca é a resposta
errada. O desenho já discutido — privilégio temporário + justificativa +
auditoria reforçada + revisão obrigatória depois — não existe em código.

### 5. Passagem observada (`Passage Assurance`)

Depende de câmera e sensor, que este produto não tem. Fica registrado com o
princípio que o governa (D-017): observação inicia avaliação, não conclui
julgamento. É a fronteira em que a ColmeIA deixa de ser governança de acesso e
começa a ser governança de ambiente físico — e a pesquisa recomendou
explicitamente **não** atravessá-la antes de dominar a primeira.

### 6. Normalização de eventos multimarcas

Hoje cada adaptador entrega evento já no vocabulário do domínio. Funciona com
um adaptador simulado; com três fabricantes reais, a tradução vira o lugar
onde o significado se perde em silêncio.

## O que a pesquisa recomendou NÃO fazer agora

- **Não criar mais um motor** para presença, evidência ou automação contextual
  antes que os quatro existentes estejam provados contra hardware.
- **Não tratar capacidade anunciada por fabricante como integração
  disponível.** Vale para Aliro, Safetrust, Alcatraz, Splan, HiveWatch, Acre e
  os demais: nenhum deles tem adaptador aqui, e o estado correto de todos é
  `RESEARCH_REQUIRED`.
- **Não deixar a IA no caminho crítico da abertura.** Já é regra deste código
  e continua sendo.
