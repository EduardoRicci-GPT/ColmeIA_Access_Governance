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
| 5b | Notificação de quem tem alçada | a fila aparece para quem abre a tela; um prazo ainda pode vencer de madrugada sem ninguém ver. Quem é acordado, por qual canal, com qual escalonamento se ninguém responde |

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
| 13 | Segregação de funções como política de primeira classe | hoje existe como fábrica de regra (`regraDeSegregacao`); falta modelagem no papel e tela |
| 14 | Anti-passback e ocupação máxima | capacidades já previstas em `CapacidadeDeEndpoint`, sem motor correspondente |
| 15 | Camada de IA sobre o assurance | resumo por público, agrupamento e priorização — sempre sobre dados determinísticos e sempre atrás da guarda de honestidade |
| 16 | Notificação e plantão | quem é acordado, por qual severidade, em qual canal, com qual escalonamento se ninguém responder |

## Explicitamente fora de escopo por ora

- **Integração com prontuário além da projeção de atributos.** A camada
  `context-projection` é a fronteira, e ela é fechada por decisão (ADR-0007).
- **Tratamento de template biométrico.** Biometria é método de credencial; o
  template deve permanecer no equipamento sempre que o fabricante permitir.
- **Abertura remota como funcionalidade de operação corriqueira.** A capacidade
  existe no contrato; transformá-la em botão de tela exige política de
  auditoria própria que ainda não foi escrita.

## Dívidas técnicas conhecidas

| Dívida | Onde | Por que foi aceita |
|---|---|---|
| Repositórios apenas em memória | `packages/persistencia` | a porta está definida e a suíte roda contra ela; trocar o substrato não muda os testes |
| Índice de auditoria sem paginação | `IndiceDeAuditoria` | volume real ainda desconhecido; paginação sem medida seria palpite |
| `MockAccessProvider.agoraDaUltimaOperacao()` deriva o tempo da telemetria | `packages/adapters/mock` | evita injetar relógio no adaptador; funciona porque o simulador é determinístico, mas é uma amarração que um adaptador real não deve copiar |
| Resumo operacional agrupa apenas por zona | `packages/narrativa/resumo.ts` | agrupar por causa raiz exige o grafo de dependência endpoint→gateway→provedor completo, que só a integração real vai validar |
