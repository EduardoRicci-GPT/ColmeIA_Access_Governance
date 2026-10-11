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

---

## Releitura de 11/10/2026 — o que destas lacunas foi fechado, e o que o consolidado de outubro abriu

> Este arquivo é uma leitura DATADA, de 17/09/2026, com 522 verificações
> passando. Não foi reescrito: reescrevê-lo apagaria a procedência da leitura, e
> este repositório não troca um registro por uma versão mais lisonjeira dele.
> O que vem abaixo é o complemento, com 920 verificações.

**Das seis lacunas listadas, quatro foram fechadas.**

| Lacuna de 17/09 | Estado em 11/10 |
|---|---|
| 1. Competência não é modelada | fechada — ADR-0021 |
| 2. Responsabilidade temporária e escopo de delegação | fechada — ADR-0020, e o escopo de autoridade pelo ADR-0032 |
| 3. `Explain Access` como pergunta única | fechada — ADR-0022 |
| 4. Break-glass | fechada — ADR-0023, com aviso (ADR-0024) e score (ADR-0025) |
| 5. Passagem observada | **parcialmente** — o modelo existe (ADR-0033), a câmera não |
| 6. Normalização de eventos multimarcas | aberta, e agora mais cara |

A lacuna 5 merece uma palavra, porque a pesquisa havia recomendado
explicitamente NÃO atravessar aquela fronteira antes de dominar a primeira. O
consolidado de outubro a atravessou pela metade, e a metade escolhida é a certa:
o MODELO da passagem observada existe — identificador, afirmação, prova,
veículo, OS, missão — e nenhuma câmera foi integrada. O que se ganhou é a
disciplina escrita antes do hardware; o que se evitou é o LPR que autoriza por
limiar de confiança do sensor.

A lacuna 6 ficou mais cara por um motivo novo: o D-052 mostrou que normalizar
evento de fabricante não é só traduzir vocabulário — é saber a que RECURSO o
evento se refere. Um evento normalizado que preserva proveniência e aponta para
o canal errado é pior que um evento não normalizado, porque parece confiável.

**O que o consolidado de outubro abriu, e que esta releitura registra como
lacuna nova:**

### 7. Nenhuma das sete leituras novas foi exercida contra hardware

A revogabilidade do TTLock, do Control iD e do Seam está declarada a partir da
documentação do fabricante. `ProcedenciaDeRevogabilidade` tem o valor
`MEDIDA_EM_BANCADA` e ninguém o usa: é o lugar reservado para o dia em que
houver bancada. Enquanto isso, o portão de emissão decide sobre capacidade
anunciada — que é exatamente o que a pesquisa recomendou não tratar como
integração disponível.

### 8. O caminho de acesso é cadastro manual, e deve ser

Ninguém descobre automaticamente que uma porta tem chave mecânica. Quem sabe é
quem foi até lá. A lacuna não é de software: é de PROCESSO — um levantamento de
campo por endpoint, com data e nome, que nenhuma instalação fez ainda. Sem ele,
`avaliarExposicao` devolve `NAO_AVALIADA` para tudo, e a leitura mais útil do
D-051 fica muda.

### 9. A delegação de autoridade não tem fila nem aviso

Uma delegação que vence no meio do plantão seguinte cai em silêncio. O produto
já resolveu esse problema uma vez, para as aprovações (ADR-0016 e ADR-0018), e
não o resolveu aqui. Está declarado no ADR-0032 como a nona aparição possível do
D-022 — escrito agora para ser cobrado depois, que é como este repositório paga
dívida que ainda vai existir.

### 10. O isolamento entre tenants não é imposto por infraestrutura

`visibilidadeDe` diz o que o tenant PODE ver; nada impede uma consulta mal
escrita de ler além. Isolamento real exige persistência com escopo — e a
persistência continua sendo o item 1 do backlog, agora com uma razão a mais.
