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
| 16 | Notificação e plantão para o assurance | o ADR-0018 resolveu o chamado da APROVAÇÃO; divergência física, endpoint offline e caso de escalonamento continuam sem canal — e a porta `CanalDeAviso` já existe para ser reaproveitada |

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
| Estado do plantão apenas em memória | `PlantaoDeAprovacao` | o degrau e o instante do último toque vivem num `Map`; reiniciar o processo faz o primeiro toque recomeçar. Erra para o lado de chamar de novo, que é o lado certo — mas precisa de persistência junto com o item 3 |
| Repositórios apenas em memória | `packages/persistencia` | a porta está definida e a suíte roda contra ela; trocar o substrato não muda os testes |
| Índice de auditoria sem paginação | `IndiceDeAuditoria` | volume real ainda desconhecido; paginação sem medida seria palpite |
| `MockAccessProvider.agoraDaUltimaOperacao()` deriva o tempo da telemetria | `packages/adapters/mock` | evita injetar relógio no adaptador; funciona porque o simulador é determinístico, mas é uma amarração que um adaptador real não deve copiar |
| Resumo operacional agrupa apenas por zona | `packages/narrativa/resumo.ts` | agrupar por causa raiz exige o grafo de dependência endpoint→gateway→provedor completo, que só a integração real vai validar |
