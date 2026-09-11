# Status de entrega — ColmeIA Access Governance v0.1

> Entregáveis 13 e 14 do item 44, sob a classificação obrigatória do item 45.
> A coluna de status é a parte mais importante deste documento. Um relatório que
> some `IMPLEMENTED` com `INTERFACE_READY` numa barra de progresso engana quem o
> lê — e quem o escreve.

## Legenda

| Status | Significado |
|---|---|
| `IMPLEMENTED` | código escrito, testado, funcionando de ponta a ponta |
| `SIMULATED` | comportamento reproduzido pelo simulador; hardware real não participou |
| `INTERFACE_READY` | contrato e tradução prontos; a integração externa não existe |
| `REQUIRES_VENDOR_INTEGRATION` | bloqueado por documentação/credencial do fabricante |
| `RESEARCH_REQUIRED` | a decisão de integrar ainda depende de pesquisa |

---

## 1. Núcleo lógico

| Componente | Status | Observação |
|---|---|---|
| Policy Engine | `IMPLEMENTED` | fecha por omissão; conflito não se resolve sozinho; dois modos de decisão |
| Regras hospitalares de base | `IMPLEMENTED` | vínculo, OS, turno, aprovação em área crítica, concessão por papel e por lotação |
| Entitlement Reconciliation | `IMPLEMENTED` | GRANT / REVOKE / UPDATE_WINDOW / KEEP, com detecção de direito órfão |
| Aprovação humana | `IMPLEMENTED` (mínima) | conjunto de chaves; falta identidade do aprovador, alçada, prazo e trilha |
| Modelo de identidade e vínculo | `IMPLEMENTED` | Person, Relationship, Role, Entitlement, Credential, janela recorrente |

## 2. Núcleo físico

| Componente | Status | Observação |
|---|---|---|
| `AccessState` de quatro camadas | `IMPLEMENTED` | com lint que recusa colapso em booleano |
| Physical State Reconciliation | `IMPLEMENTED` | cinco guardas ordenadas por precedência operacional |
| Classificação determinística de risco | `IMPLEMENTED` | piso por natureza, ponderação por criticidade, agravamento por tempo |
| Reconciliação ativa (`reconcilePhysicalState`) | `IMPLEMENTED` no contrato / `SIMULATED` na execução | nenhum fabricante real responde ainda |
| Detecção de desvio de relógio | `IMPLEMENTED` / `SIMULATED` | invalida leitura temporal; exige que o fabricante exponha a hora do equipamento |
| Detecção de credential drift | `IMPLEMENTED` / `SIMULATED` | depende de leitura da base local do equipamento |

## 3. Assurance

| Componente | Status | Observação |
|---|---|---|
| Health Score explicável | `IMPLEMENTED` | derivado dos componentes; exemplo do item 7 reproduzido em teste |
| Health Score hierárquico | `IMPLEMENTED` | 20 escopos calculados na bancada; pai não é média dos filhos |
| Indicadores de assurance | `IMPLEMENTED` | os quinze do item 5 |
| Telemetria de latência | `IMPLEMENTED` | seis marcas, quatro latências derivadas, atribuição por etapa |
| Escalonamento humano | `IMPLEMENTED` | caso deduplicado por chave estável, encerrado automaticamente quando a divergência some |
| Política de retry com fim declarado | `IMPLEMENTED` | backoff 30s → 90s → 270s → 810s, depois `ESCALATE` |
| Guarda anti-alucinação | `IMPLEMENTED` | seis padrões de afirmação categórica; recusa **e** substitui |
| Resumo operacional determinístico | `IMPLEMENTED` | agrupa por zona e atribui causa apenas quando dedutível |

## 4. Interface e auditoria

| Componente | Status | Observação |
|---|---|---|
| Tela Access Assurance (mínima) | `IMPLEMENTED` | view-model puro + renderizador HTML sem egresso |
| Timeline de auditoria | `IMPLEMENTED` | evento no instante em que ocorreu; janelas de risco medidas |
| Armazém de eventos idempotente | `IMPLEMENTED` | duplicata absorvida e contabilizada |
| Índice de auditoria por correlação | `IMPLEMENTED` | em memória |

## 5. Persistência

| Componente | Status | Observação |
|---|---|---|
| Esquema relacional | `IMPLEMENTED` (escrito) | 15 tabelas; `idempotency_key` UNIQUE em `sync_job` e `domain_event` |
| Repositórios em memória | `IMPLEMENTED` | é o substrato que a bateria exercita |
| Adaptador PostgreSQL | **não existe** | a porta está definida; a implementação é trabalho seguinte |

## 6. Adaptadores

| Adaptador | Status | O que falta |
|---|---|---|
| `MockAccessProvider` | `IMPLEMENTED` (adaptador) sobre mundo `SIMULATED` | — |
| `TTLockAdapter` | `INTERFACE_READY` / `REQUIRES_VENDOR_INTEGRATION` | documentação oficial, conta de teste, quatro perguntas em `docs/adapters/ttlock.md` |
| `ControlIDAdapter` | `INTERFACE_READY` / `RESEARCH_REQUIRED` | protocolo do modo online, leitura da base local |
| `SeamAdapter` | `INTERFACE_READY` / `RESEARCH_REQUIRED` | cobertura de fabricantes no Brasil, custo, granularidade da confirmação |

Os três de fabricante **passam na suíte de conformidade recusando** todas as
operações de hardware. Isso é o estado correto, não um estado incompleto: a
fronteira está desenhada e provada antes da integração.

## 7. Itens explicitamente simulados

Nenhum destes tocou hardware real. São reproduzidos de forma determinística pelo
`SimuladorDeMundoFisico`:

| Comportamento | Status |
|---|---|
| Provedor cloud online/offline | `SIMULATED` |
| Gateway online/offline | `SIMULATED` |
| Endpoint online/offline/degradado | `SIMULATED` |
| Provedor lento / equipamento lento | `SIMULATED` |
| Evento perdido | `SIMULATED` |
| Confirmação atrasada | `SIMULATED` |
| Sincronização parcial | `SIMULATED` |
| Backlog de revogação | `SIMULATED` |
| Credential drift | `SIMULATED` |
| Desvio de relógio | `SIMULATED` |
| Bateria baixa | `SIMULATED` |
| Firmware degradado | `SIMULATED` |
| Revogação física | `SIMULATED` |
| Biometria | `INTERFACE_READY` — modelada como método de credencial; nenhum template biométrico é tratado |
| Fluxos de evento (webhook/polling) | `SIMULATED` |
| Modo online do Control iD | `SIMULATED` no Mock; `RESEARCH_REQUIRED` no fabricante |

## 8. Bateria

`npm run acesso:verificar` — **244 verificações, todas passando**.

| Suíte | Verificações |
|---|---|
| Cenário P1 — divergência física | 30 |
| Cenário P2 — telemetria de latência | 19 |
| Cenários hospitalares H7–H10 | 33 |
| Contrato de adaptadores v2 | 57 |
| Health Score — composição, pesos e hierarquia | 19 |
| Projeção de contexto e credenciais | 25 |
| Simulador v2 e políticas de repetição | 33 |
| Honestidade de estado | 28 |

Mais dois gates: `acesso:lint` (pureza — sem DOM, sem Node, `strict`,
`noUncheckedIndexedAccess`) e `acesso:lint-estado` (o item 2 como condição de CI).

## 9. Riscos restantes

**Técnicos**

1. **Nenhuma linha foi validada contra hardware.** Todo o comportamento físico é
   hipótese até a bancada. A arquitetura foi desenhada para que a descoberta
   custe um adaptador, não uma reescrita — mas isso ainda não foi provado.
2. **As capacidades declaradas do TTLock são todas provisórias.** Uma delas
   errada (`remoteRevocation` sem gateway, em especial) muda o modelo de risco
   de instalações inteiras.
3. **Persistência real não existe.** Concorrência, transação e volume não foram
   exercitados. A suíte roda sobre memória de processo único.
4. **A calibração dos pesos do Health Score é um palpite informado.** Reproduz o
   exemplo da especificação, o que prova coerência com a intenção — não que os
   pesos estejam certos para um hospital específico.
5. **A aprovação humana é mínima.** Sem identidade, alçada, prazo e trilha, ela
   registra que houve aprovação, não quem aprovou nem com que autoridade.

**Operacionais**

6. **O Health Score inicial de qualquer instalação existente vai parecer ruim**,
   porque todo estado herdado entra como `DEVICE_SYNC_UNKNOWN`. É correto e vai
   ser mal recebido. Precisa ser explicado na implantação: o score não piorou, a
   ignorância que já existia passou a ser medida.
7. **A honestidade de estado vai ser questionada pela própria equipe de
   produto.** "Revogação solicitada · sincronização pendente · última
   confirmação 08:42 · endpoint offline" parece pior que "Acesso revogado". A
   guarda existe porque a pressão para encurtar é permanente.
8. **Fallback local em modo online** (Control iD) significa que, na oscilação de
   rede, o equipamento pode aplicar uma credencial recém-revogada. É legítimo e
   precisa ser declarado por instalação.

**De escopo**

9. **O Seam pode não valer a pena.** A cobertura de fabricantes relevantes no
   Brasil é a pergunta que sozinha encerra a avaliação, e ainda não foi feita.
10. **A tela é mínima.** Foi desenhada para provar que o score abre e que a fila
    ordena por risco. Não foi validada com Facilities, Segurança, TI ou
    Qualidade — que são quatro públicos com necessidades diferentes.
