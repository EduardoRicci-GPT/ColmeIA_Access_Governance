# TTLockAdapter

| | |
|---|---|
| **Status de integração** | `INTERFACE_READY` → bloqueado em `REQUIRES_VENDOR_INTEGRATION` |
| **Caminho** | `colmeia-acesso/packages/adapters/ttlock/` |
| **Prioridade** | alta (bancada de hardware real) |
| **Conformidade v2** | passa, **recusando** todas as operações de hardware |

## O que existe

| Arquivo | Papel |
|---|---|
| `TTLockAdapter.ts` | implementa `AccessProviderAdapter` v2; lança `IntegracaoNaoDisponivel` em tudo que tocaria hardware |
| `TTLockCapabilities.ts` | capacidades do provedor, cada uma com estado (`CONFIRMADO`/`PROVISORIO`) e base declarada |
| `TTLockClient.ts` | fronteira de rede: lista das operações necessárias e a pendência de cada uma |
| `TTLockMapper.ts` | tradução eKey/passcode/cartão/biometria → `CredentialMethod`; estado do fabricante → `DeviceAccessState` |
| `TTLockEventos.ts` | caracterização do canal de eventos e a janela de incerteza que ele impõe |

O teste de contrato roda em `colmeia-acesso/testes/contrato-adapters.ts`, junto
com os outros três, contra a mesma suíte — decisão tomada para que a garantia
seja do CONTRATO e não de cada implementação.

## O que não existe, e por quê

**Nenhuma URL, rota, nome de campo ou verbo do fabricante.** Não é omissão: é
recusa a inventar API.

Um cliente com endpoints imaginados seria pior que cliente nenhum. Ele
compilaria, passaria em teste com mock, entraria em revisão parecendo pronto —
e só falharia contra o servidor real, depois de a arquitetura já ter sido
desenhada em cima de um formato que não existe. Trocar um formato inventado pelo
real, tarde, custa mais que escrever do zero.

## Capacidades declaradas — todas PROVISÓRIAS

As catorze capacidades em `DECLARACAO_TTLOCK` descrevem a **categoria de
produto** (fechadura eletrônica com nuvem, gateway Wi-Fi opcional, credencial
offline por eKey e senha), não uma leitura de documentação confirmada. Cada uma
carrega a base do palpite. Nenhuma está marcada `CONFIRMADO`, e o teste verifica
isso.

## As quatro perguntas que travam a integração

**1. A revogação funciona sem gateway?**
A pergunta mais consequente. Se a revogação remota exige gateway, então uma
senha já distribuída para uma fechadura sem gateway **não é revogável
remotamente** — e o sistema precisa representar isso como pendência física
permanente até visita técnica ou expiração da credencial, não como falha
transitória de sincronização. Muda o modelo de risco de instalações inteiras.

**2. Existe webhook, ou só polling?**
Com polling de 5 minutos, a janela de incerteza é estrutural e a interface
precisa declará-la, em vez de fingir tempo real. Sem entrega garantida, a
reconciliação ativa (`reconcilePhysicalState`) deixa de ser opcional.

**3. A hora do equipamento é exposta?**
Sem ela não há detecção de desvio de relógio — e sem detecção de desvio, toda
janela temporal aplicada pela fechadura é inverificável.

**4. Qual o formato de janela recorrente aceito?**
Especificamente: um turno 19h–07h é uma janela contínua ou exige duas faixas?
`traduzirJanela()` devolve `suportada: false` com essa pendência escrita, em vez
de adivinhar.

## Caminho até `IMPLEMENTED`

1. Obter documentação técnica oficial e conta de desenvolvedor.
2. Responder às quatro perguntas acima e converter cada capacidade
   `PROVISORIO` → `CONFIRMADO`, ou corrigir o valor.
3. Implementar `TTLockClient` contra a API real, com o segredo em cofre
   (`referenciaDoSegredo`, nunca o segredo em código ou banco).
4. Bancada: uma fechadura, um gateway, e os cenários P1 e H10 executados contra
   hardware — inclusive desligando o gateway da tomada.
5. Só então `statusDeIntegracao: 'IMPLEMENTED'`.
