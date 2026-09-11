# Análise de impacto — ColmeIA Access Governance

> Entregável 1 do item 44. Escrito antes do código e revisado depois dele: os
> itens marcados **(revisado)** mudaram durante a implementação, e o motivo está
> declarado.

## 1. O que a atualização muda na natureza do produto

A arquitetura anterior respondia a uma pergunta: *quais direitos deveriam
existir?* A atualização acrescenta três, e as três são de natureza diferente:

| Pergunta | Motor | Natureza da resposta |
|---|---|---|
| Quais direitos deveriam existir? | Entitlement Reconciliation | dedutiva — sai das regras |
| Eles foram materializados? | Physical State Reconciliation | empírica — depende de evidência externa |
| Quanto isso custa em risco? | Observability & Assurance | avaliativa — depende de calibração institucional |

A consequência mais profunda não é o número de motores: é que o sistema deixa de
ser **fechado**. Um motor dedutivo é completo — dadas as regras e os fatos, a
resposta existe. Um motor empírico é incompleto por construção: quando o
equipamento está mudo, a resposta correta é "não sei", e isso precisa ser
representável em todas as camadas, do tipo TypeScript ao rótulo da tela.

Todo o resto desta análise decorre disso.

## 2. Impacto por camada

### 2.1 Domínio — impacto ALTO, sem retrocompatibilidade

`AccessState` com quatro camadas substitui qualquer representação booleana. Não
há caminho de migração automático: um `hasAccess: true` do modelo anterior não
contém informação suficiente para preencher os quatro campos — especificamente,
não diz se houve confirmação física, que é justamente o dado novo.

**Migração exigida:** todo registro herdado entra como
`lastConfirmedState: null` (`DEVICE_SYNC_UNKNOWN`) e sobe para confirmado apenas
após a primeira reconciliação física bem-sucedida. Isso fará o Health Score
inicial de qualquer instalação existente parecer ruim. **Isso é correto e deve
ser explicado ao cliente na implantação:** o score não piorou, a ignorância que
já existia passou a ser medida.

### 2.2 Adaptadores — impacto ALTO, contrato v1 incompatível

O contrato v2 acrescenta `getProviderCapabilities`, `getDeviceStatus`,
`getGatewayStatus?`, `reconcilePhysicalState?` e padroniza
`ProviderOperationResult` com `physicalConfirmation`. Um adaptador v1 que
devolvia `boolean` não satisfaz v2.

### 2.3 Persistência — impacto ALTO

Tabelas novas: `provider`, `provider_capability`, `provider_connection`,
`gateway`, `device`, `device_capability`, `access_state`,
`physical_state_snapshot`, `sync_job`, `sync_attempt`, `operation_telemetry`,
`health_snapshot`, `health_component`, `escalation_case`, `domain_event`.

Duas restrições estruturais: `sync_job.idempotency_key` é `UNIQUE` (grant
duplicado é impossível por construção) e `domain_event.idempotency_key` é
`UNIQUE` (webhook reentregue não duplica auditoria).

### 2.4 Interface — impacto ALTO, e é onde a resistência vai aparecer

A tela não pode mais dizer "Acesso revogado". Precisa dizer quatro linhas.
Isso vai ser questionado por quem pede a tela, porque quatro linhas parecem
piores que duas palavras. A resposta está no item 4 e é de arquitetura, não de
UX: as duas palavras são falsas quando o endpoint não confirmou.

A guarda (`aplicarGuardaDeHonestidade`) não apenas recusa: **substitui** pela
formulação honesta. Recusar sem oferecer alternativa empurraria o desenvolvedor
de volta para o atalho.

### 2.5 IA — impacto MÉDIO, e de escopo, não de tecnologia

A IA perde território (não decide política nem severidade) e ganha um papel mais
defensável: transformar dezoito linhas de divergência em uma frase que um
coordenador de enfermagem entende às 3h da manhã. O resumo determinístico
(`resumirDivergencias`) já produz o esqueleto dessa frase sem modelo algum; o
modelo entra para agrupar, priorizar por público e explicar.

## 3. Riscos de arquitetura identificados

### 3.1 O risco do relógio **(revisado)**

Descoberto durante a implementação: se o equipamento aplica janelas temporais e
o relógio dele derrapa, **nenhuma** decisão temporal dele é confiável — inclusive
as janelas de turno que ele deveria estar aplicando. Um desvio de 20 minutos
significa que o plantonista noturno entra 20 minutos antes do permitido, e o
sistema não tem como saber.

Tratado como primeira guarda do motor físico, com ação `VERIFY` e confiança
`UNKNOWN`. Não é detalhe de manutenção: é invalidação de leitura.

### 3.2 O risco da sincronização parcial

Gravar 40 de 60 credenciais e retornar sucesso é modo de falha real e
silencioso. O simulador o reproduz e o MockAccessProvider rebaixa o resultado
para `PENDING` com a contagem na mensagem.

### 3.3 O risco do evento perdido

Com polling e sem entrega garantida — que é a hipótese atual para TTLock — um
evento ausente NÃO prova que o fato não ocorreu. Consequência arquitetural: a
reconciliação física por consulta direta deixa de ser luxo e vira o único
caminho para sair de `DEVICE_SYNC_UNKNOWN` nesses provedores.

### 3.4 O risco do fallback local **(revisado)**

Equipamentos Control iD em modo online costumam ter comportamento de timeout
configurável. `FALLBACK_LOCAL` significa que, quando a rede oscila, o
equipamento volta a decidir com a base que tem — que pode conter a credencial
recém-revogada. É escolha legítima (uma catraca que trava em pane paralisa um
pronto-socorro), mas precisa ser **declarada**, porque muda o que o Health Score
deve considerar risco. Por isso `decisaoLocalPorFalhaDaColmeia()` existe e é
contabilizável.

### 3.5 O risco do elo a mais (Seam)

Ao materializar por agregador, a confirmação física passa a ser afirmação DO
AGREGADOR sobre o equipamento. É um elo a mais na corrente de incerteza. Por
isso o `SeamAdapter` declara que a confiança máxima desta via é `PROBABLE`.

### 3.6 O risco de alarme falso

Um sistema que gera alarme falso é abandonado tão rápido quanto um que não gera
alarme. Três mitigações implementadas: a ingestão roda ANTES da reconciliação
física (reconciliar sobre evidência velha geraria divergência fantasma); o ciclo
é reentrante (rodar duas vezes sem mudança não emite ordem nova — testado em
H8); casos de escalonamento são deduplicados por chave estável.

## 4. O que NÃO foi impactado, e por que isso é o sinal de saúde

`Person`, `Relationship`, `Role`, `Entitlement` e `Credential` não mudaram para
acomodar nenhum dos três fabricantes. Pelo item 43, é o teste de acoplamento:
se um fornecedor exigisse mexer neles, haveria vazamento de responsabilidade.

Não exigiu. A prova é a suíte de conformidade rodando igual contra quatro
adaptadores com capacidades diferentes.

## 5. Esforço e sequência recomendada

| Frente | Estado | Próximo passo |
|---|---|---|
| Núcleo lógico + físico + assurance | entregue e testado | calibrar pesos com o cliente |
| Persistência | esquema entregue, repositórios em memória | implementar adaptador Postgres contra a mesma suíte |
| Mock / Simulator v2 | entregue | ampliar cenários conforme o campo ensinar |
| TTLock | INTERFACE_READY | obter documentação oficial e conta de teste |
| Control iD | INTERFACE_READY | obter documentação do modo online |
| Seam | RESEARCH_REQUIRED | avaliar cobertura de fabricantes no Brasil e custo |
| Tela Access Assurance | mínima entregue | validar com Facilities e Segurança |
| Aprovação humana | mínima (conjunto de chaves) | identidade, alçada, prazo e trilha |
