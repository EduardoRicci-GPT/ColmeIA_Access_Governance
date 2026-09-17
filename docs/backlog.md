# Backlog revisado — ColmeIA Access Governance

> Entregável 12 do item 44. Ordenado por **o que destrava o próximo passo**, não
> por tamanho. Cada item diz o que muda quando ele existir.

## Agora — destrava a bancada de hardware

| # | Item | O que muda |
|---|---|---|
| 1 | Documentação oficial TTLock + conta de desenvolvedor | converte 14 capacidades de `PROVISORIO` para `CONFIRMADO` ou corrige; responde a pergunta da revogação sem gateway |
| 2 | Documentação Control iD do modo online e da leitura da base local | decide se a reconciliação física ativa é possível neste fabricante — o que muda a estratégia de assurance para catracas |
| 3 | Adaptador PostgreSQL contra a suíte já existente | tira o produto da memória de processo; expõe concorrência e volume |
| 4 | ~~Aprovação humana completa: identidade, alçada, prazo, trilha~~ — **feito**, ADR-0016 | o registro responde quem aprovou, com que alçada naquele instante, até quando vale, e deixa elo na cadeia |
| 5 | ~~Fila de aprovação na tela, com o prazo à vista~~ — **feito**, ADR-0017 | a fila aparece ordenada por urgência de porta fechada, o ciclo passou a abrir o pedido que a política exigiu (ninguém abria), e a vigente entra na lista com o prazo à vista |
| 5b | ~~Notificação de quem tem alçada~~ — **feito**, ADR-0018 | o ciclo chama os papéis com alçada antes de o prazo vencer, a ausência de canal virou fato registrado em vez de silêncio, e o diário da aprovação — que ninguém drenava fora dos testes — passou a chegar à cadeia |
| 5c | Escala de plantão pela porta do host | hoje o chamado alcança um CARGO, não uma pessoa: o produto sabe quais papéis podem decidir, e não quem está acordado às 02h40. Exige que o aplicativo de gestão entregue a escala |
| 5d | Primeiro canal de aviso real | `CanalEmMemoria` é bancada. O primeiro canal de verdade (aplicativo, ramal, plantão) é integração, e a porta já está no lugar |
| 5e | Desfecho para o chamado sem resposta | passado o último degrau, o sistema insiste para sempre. Fechar o laço exige decidir o que é desfecho aceitável quando ninguém com alçada responde — governança do hospital, não software |

## Depois — destrava a implantação

| # | Item | O que muda |
|---|---|---|
| 6 | Workers reais para os jobs do item 35 | hoje o ciclo é chamado explicitamente; falta agendador, fila e observabilidade dos próprios jobs |
| 7 | Calibração de pesos com um hospital real | os pesos atuais reproduzem a intenção da especificação, não a realidade de uma instalação |
| 8 | Configuração de criticidade por instalação | `CRITICIDADE_SUGERIDA` é ponto de partida; precisa de tela e de versionamento da decisão |
| 9 | Migração de estado herdado | todo registro entra como `DEVICE_SYNC_UNKNOWN`; precisa de rotina de primeira reconciliação em massa e de comunicação do resultado |
| 10 | Validação da tela com Facilities, Segurança, TI e Qualidade | quatro públicos, quatro necessidades; a tela atual atende a um |

## Em seguida — amadurece o produto

| # | Item | O que muda |
|---|---|---|
| 11 | Modo online do Control iD ponta a ponta | prova o fluxo do item 16 contra equipamento real, com `decisionOrigin` registrado |
| 12 | Pesquisa Seam (cobertura BR, custo, latência, granularidade) | decide se a hipótese do agregador se sustenta; a pergunta 1 sozinha pode encerrá-la |
| 13 | ~~Segregação de funções como política de primeira classe~~ — **feito**, ADR-0019 | a incompatibilidade passou a ser entre ATIVIDADES (autorizar, executar, custodiar, conferir) num domínio com zonas, entrou no conjunto base de regras, exige revisão humana em vez de negar, e o acúmulo aparece na tela mesmo sem porta envolvida |
| 13b | Tela de configuração das matrizes de segregação | editar domínio, zona ou par exige mexer no código. Política de primeira classe deveria ser versionada com autor e data, junto do item 8 |
| 13c | Ratificação das matrizes por instalação | a de medicamentos deriva da Portaria SVS/MS 344/1998 sem estar nela; a de credenciais é palpite fundamentado. Enquanto não forem ratificadas, o efeito das duas é só exigir revisão |
| 14 | Anti-passback e ocupação máxima | capacidades já previstas em `CapacidadeDeEndpoint`, sem motor correspondente |
| 15 | Camada de IA sobre o assurance | resumo por público, agrupamento e priorização — sempre sobre dados determinísticos e sempre atrás da guarda de honestidade |
| 16 | ~~Notificação e plantão para o assurance~~ — **feito**, ADR-0026 | o caso de escalonamento virou a terceira espécie de aviso, com encaminhamento por TIPO (gateway é TI, revogação é segurança, cobertura é enfermagem) e insistência que só para no RECONHECIMENTO — o desfecho que a fila de aprovação não tem |
| 16b | Prazo para o caso reconhecido e não resolvido | reconhecer encerra a cobrança; um caso assumido e esquecido para de chamar e fica aberto para sempre. Fechar esse laço exige decidir prazo aceitável — governança do hospital |
| 16c | Tabela de encaminhamento versionada | como as matrizes de segregação (13b), a rota por tipo vive no código e deveria ter autor, data e tela, junto do item 8 |

## Explicitamente fora de escopo por ora

- **Integração com prontuário além da projeção de atributos.** A camada
  `context-projection` é a fronteira, e ela é fechada por decisão (ADR-0007).
- **Tratamento de template biométrico.** Biometria é método de credencial; o
  template deve permanecer no equipamento sempre que o fabricante permitir.
- **Abertura remota como funcionalidade de operação corriqueira.** A capacidade
  existe no contrato; transformá-la em botão de tela exige política de
  auditoria própria que ainda não foi escrita.

## Nascidas da pesquisa trazida em 17/09 (ver `docs/research/`)

| # | Item | O que muda |
|---|---|---|
| 20 | ~~`Competencia` como objeto de primeira classe~~ — **feito**, ADR-0021 | habilitação com emissor, validade e suspensão. Suspensa nega; vencida e não declarada exigem revisão humana; exigência ausente não é evidência ausente. A designação de responsabilidade passou a conferir em vez de aceitar a palavra de quem pede |
| 20b | Exigência de competência por ATIVIDADE, não por zona | hoje a farmácia exige NR-32 para qualquer porta dela. O desenho fino liga a exigência à atividade que a pessoa exerce no domínio, casando com a matriz de segregação (ADR-0019) |
| 20c | ~~Tela de habilitações prestes a vencer~~ — **feito** | suspensa no topo, vencida depois, vigente com o prazo à vista. Sem limiar de "prestes a vencer", pela mesma razão do ADR-0017 |
| 20d | Integração com conselho de classe | o produto lê habilitação e não renova nada. Hoje o host declara, com data de verificação registrada para que leitura velha não passe por fato atual |
| 21 | ~~`ResponsabilidadeTemporaria` + `EscopoDeDelegacao` + pedido de exceção~~ — **feito**, ADR-0020 | o supervisor designa responsabilidade dentro da sua autoridade, com motivo e prazo; o motor deriva os acessos e os revoga no vencimento, sem ninguém precisar lembrar de desfazer |
| 21b | Detecção da exceção sem alguém abrir o pedido | hoje o pedido precisa ser aberto por uma pessoa. Detectar exige passagem observada — câmera e sensor —, e a pesquisa recomendou não atravessar essa fronteira antes de dominar a governança de acesso |
| 21c | Segunda aprovação para designações sensíveis | o campo existe no desenho do escopo e não foi implementado. Hoje toda designação dentro do escopo vale com uma assinatura |
| 21d | Leitura gerencial do remanejamento | quantas vezes a UTI pediu apoio, de onde veio, em que horários. A tela já lista as designações vigentes; falta agregar o histórico — é provavelmente o subproduto mais valioso da exceção operacional |
| 22 | ~~`Explicar acesso` — pessoa × recurso × instante~~ — **feito**, ADR-0022 | uma pergunta, duas respostas separadas (lógica e física), camadas nomeadas com leitura própria, e recusa explícita do verdicto retroativo |
| 22b | ~~Tela de Explicar acesso~~ — **feito** | o caso mais consequente do ciclo aparece camada a camada, com o estado físico em bloco próprio. Escolha determinística: a primeira pendência da fila, ou o topo da fila de risco |
| 22d | Explicar acesso sob demanda, e não só o caso escolhido | a tela é um relatório estático; escolher um caso por ciclo é o que cabe nela. Perguntar por qualquer pessoa × recurso exige servidor, e o motor já responde |
| 22c | Estado histórico para reconstituir o passado | hoje o verdicto retroativo é recusado, porque guardamos atos e não o estado do mundo. Responder de verdade exige snapshot por instante, com custo de armazenamento a decidir |
| 23 | ~~Break-glass assistencial~~ — **feito**, ADR-0023 | a emergência abre a porta agora e não aprova nada: janela curta em sombra, três atos na cadeia, revisão obrigatória que não se fecha sozinha, e o direito revogado quando a janela fecha |
| 23b | ~~Chamar o plantão quando o vidro quebra~~ — **feito**, ADR-0024 | o plantão ganhou uma segunda espécie de aviso. O de aprovação CONVOCA e insiste; o de emergência INFORMA e se comunica uma vez por fato — o vidro quebrando, e a janela fechando com a revisão em aberto. Tipo próprio na cadeia (`BreakGlassNotified`), e o não entregue também |
| 23c | ~~Revisão pendente na tela~~ — **feito**, ADR-0024 | a dívida aparece ordenada da MAIS ANTIGA para a mais nova, ao contrário de toda outra fila desta tela: aqui nada está por vencer, e uma afirmação que ninguém conferiu não melhora com o tempo |
| 23e | ~~Repetição de quebra de vidro no Health Score~~ — **feito**, ADR-0025 | duas leituras separadas: a conta de revisão em aberto e a repetição por zona. O score nunca cobra o ato de quebrar o vidro, porque cobrá-lo criaria pressão para escorar a porta em vez de invocar a exceção |
| 23f | Janela de recorrência por zona, e não uma para a instalação inteira | uma UTI e um arquivo administrativo têm ciclos de revisão diferentes e hoje dividem o mesmo mês |
| 23g | Confirmação de que a conta foi vista | o score desce e a tela mostra; nada garante que alguém olhou. É a mesma lacuna do chamado (ADR-0024) |
| 23d | Quem responde pela área ≠ quem tem alçada na faixa | o chamado da emergência procura os papéis com alçada, que é a melhor porta existente e não é a mesma pergunta. Responsabilidade por zona exige uma porta nova no host |
| 24 | Normalização de eventos de fabricante com proveniência | hoje cada adaptador entrega evento já no vocabulário do domínio; com três fabricantes reais, a tradução vira o lugar onde o significado se perde em silêncio |
| 25 | Vínculo biométrico pseudonimizado | quando houver biometria, o subsistema recebe um identificador, não o RH da pessoa. A fronteira já existe para dado clínico (ADR-0007) e vale igual aqui |

## Nascidas da extração para repositório próprio

| # | Item | O que muda |
|---|---|---|
| 17 | Corpus selado para a prova diferencial do guardrail | fora do repositório da Aletheia, a prova cai de 3 verificações para 1 que declara não ter rodado. Congelar corpus e saídas esperadas num artefato com hash — como o `MPEH_MANIFEST.json` já faz — devolve a prova sem exigir o checkout da origem |
| 18 | Aviso de deriva do espelho sem a origem em disco | `npm run espelho` confere a integridade da cópia, mas não a deriva: a origem pode avançar sem que ninguém note. Uma checagem que leia o commit da origem pela API do GitHub resolveria, ao custo de uma dependência de rede num gate hoje offline |
| 19 | CI própria | o repositório não tem workflow. `npm run verificar` roda à mão, e a Aletheia deixou de compilar esta árvore por acidente de configuração — o que era acoplamento indevido, mas também era o único gate automático que existia |

## Dívidas técnicas conhecidas

| Dívida | Onde | Por que foi aceita |
|---|---|---|
| Estado do plantão apenas em memória | `PlantaoDeAprovacao` | o degrau e o instante do último toque vivem num `Map`; reiniciar o processo faz o primeiro toque recomeçar. Erra para o lado de chamar de novo, que é o lado certo — mas precisa de persistência junto com o item 3 |
| Repositórios apenas em memória | `packages/persistencia` | a porta está definida e a suíte roda contra ela; trocar o substrato não muda os testes |
| Índice de auditoria sem paginação | `IndiceDeAuditoria` | volume real ainda desconhecido; paginação sem medida seria palpite |
| `MockAccessProvider.agoraDaUltimaOperacao()` deriva o tempo da telemetria | `packages/adapters/mock` | evita injetar relógio no adaptador; funciona porque o simulador é determinístico, mas é uma amarração que um adaptador real não deve copiar |
| Resumo operacional agrupa apenas por zona | `packages/narrativa/resumo.ts` | agrupar por causa raiz exige o grafo de dependência endpoint→gateway→provedor completo, que só a integração real vai validar |
