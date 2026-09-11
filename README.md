# ColmeIA Access Governance

Controle de acesso para unidades de saúde, **derivado da Aletheia**: o kernel
MPE-H (Ledger · HumanGate · Calibration) é copiado, com selo de procedência, e os
dois canais determinísticos do R-VEP decidem por cruzamento 360° de hierarquia,
horário, agenda e local — não por tabela de regras.

E construído a partir de uma constatação incômoda: **saber quem deveria entrar
não é saber quem entra.**

Entre a decisão da organização e a fechadura existe uma cadeia de quatro elos
(nuvem do fabricante, gateway, equipamento, firmware) e cada um falha
independentemente. Um sistema que mostra "acesso revogado" assim que a nuvem
aceita a ordem está afirmando algo que não verificou. Na maior parte das vezes
ele acerta por sorte. Nas outras, existe uma porta aberta que o painel declara
fechada — e é exatamente nessas que alguém precisava saber.

O critério que governa o projeto inteiro:

> Um entitlement pode estar corretamente revogado na lógica da organização
> enquanto ainda existe risco físico, porque um dispositivo não recebeu a
> atualização.

Se o software não representa essa diferença, a arquitetura está incompleta.

---

## O que vem da Aletheia

| Do kernel MPE-H | O que faz aqui |
|---|---|
| **Ledger** | a auditoria é cadeia encadeada por hash, e todo elo declara o corpo que respondeu por ele |
| **HumanGate** | a aprovação é ligada ao hash do material revisado; mudou o material, deixa de valer sozinha |
| **Calibration** | os doze pesos do Health Score declaram estatuto — todos em SOMBRA, e a tela diz isso |
| **Filtro Zero** | pré-condição: quem é afetado por esta decisão, e o que genuinamente precisam |
| **O Freio** | o erro simétrico — uma zona de cuidado que ficaria sem ninguém capaz de entrar |
| **Guardrail estrutural** | porte com prova diferencial: esta política concede acesso, ou impõe obediência? |
| **R-VEP** | canal profundo, por **porta** — não copiado, porque exige Python e 350 ms |

A cópia é verificada por `npm run acesso:espelho`: editar o espelho quebra a
bateria, e a deriva em relação à origem é relatada.

## Os quatro motores

```
  POLICY ENGINE                    interpreta regras e contexto
        ↓
  ENTITLEMENT RECONCILIATION       quais direitos DEVERIAM existir
        ↓
  PHYSICAL STATE RECONCILIATION    o que foi de fato materializado
        ↓
  OBSERVABILITY & ASSURANCE        disponibilidade, divergência, atraso, risco
```

Os quatro são determinísticos. A IA opera **sobre** eles — resume, agrupa,
explica, prioriza — e não substitui nenhum. Não decide política, não classifica
severidade, e não afirma estado físico: toda frase que ela produzir sobre o
mundo físico atravessa a guarda de honestidade antes de chegar a uma pessoa.

## O que o sistema nunca faz

- **Não colapsa acesso num booleano.** `AccessState` tem quatro camadas
  (desejado, nuvem, provedor, dispositivo) mais a última confirmação *com
  evidência*. Há um lint que recusa `hasAccess` e parentes.
- **Não afirma o que não confirmou.** `aplicarGuardaDeHonestidade()` recusa "a
  porta está bloqueada" quando a confiança não é `CONFIRMED`, e substitui pela
  formulação honesta.
- **Não produz score sem composição.** O número é sempre `100 − Σ(componentes)`,
  e cada componente carrega rótulo, contagem e evidências.
- **Não inventa API de fabricante.** Adaptadores sem integração lançam
  `IntegracaoNaoDisponivel`; a suíte de conformidade *reprova* quem devolver
  resultado fabricado.
- **Não recebe dado clínico.** A camada de projeção converte "precaução
  respiratória" em `access_restriction_policy`, e o diagnóstico nunca atravessa.
- **Não presume aprovação.** Acesso `CRITICAL` exige duas assinaturas distintas
  contra o material selado — e a autoridade vem do RBAC do host, não daqui.
- **Não deixa uma zona de cuidado sem ninguém em silêncio.** A revogação segue;
  a lacuna vira caso escalado.

## Estrutura

```
colmeia-acesso/
  packages/
    mpeh-kernel/                      CÓPIA SELADA: Ledger · HumanGate · Calibration
    auditoria/                        trilha em cadeia + separação de corpos (ADR-0003)
    governanca/                       human-gate de acesso + porta AutoridadeDoHost
    contratos-estruturais/            Filtro Zero, O Freio, guardrail (porte com diferencial)
    leitura-360/                      porta do R-VEP e a análise de dois canais
    dominio/                          estado, topologia, eventos, telemetria, risco
    policy-engine/                    regras, conflito, fechamento por omissão
    entitlement-reconciliation/       quais direitos deveriam existir
    physical-state-reconciliation/    onde desejo e realidade divergem
    observability-assurance/          indicadores, Health Score, escalonamento
    context-projection/               a fronteira com o prontuário
    adapters/
      contrato/                       AccessProviderAdapter v2 + suíte de conformidade
      mock/                           Simulator v2 (determinístico)
      ttlock/  control-id/  seam/     INTERFACE_READY
    orquestracao/                     ciclo de governança, idempotência, retry
    persistencia/                     esquema SQL + repositórios em memória
    narrativa/                        guarda de honestidade + resumo operacional
    assurance-ui/                     view-model, timeline e renderizador do painel
  testes/                             P1, P2, H7–H10 e as demais suítes
  ferramentas/                        lint de estado booleano, gerador do painel
  docs/                               ADRs, análise de impacto, adapters, backlog, status
```

## Como rodar

```bash
npm run acesso:verificar    # pureza + lint de estado + espelho + 380 verificações
npm run acesso:painel       # gera .saida/painel-access-assurance.html
```

Suítes individualmente:

```bash
npx tsx colmeia-acesso/testes/cenario-p1.ts             # divergência física
npx tsx colmeia-acesso/testes/cenario-p2.ts             # telemetria de latência
npx tsx colmeia-acesso/testes/cenarios-hospitalares.ts  # H7–H10
```

## Estado da entrega

`IMPLEMENTED`: os quatro motores, o kernel MPE-H copiado e verificado, a trilha
em cadeia, a aprovação ligada ao conteúdo, os pesos com estatuto, o Filtro Zero e
O Freio, o guardrail estrutural, o contrato de adaptadores v2, o Health Score
hierárquico, a telemetria, o escalonamento, a projeção de contexto, a guarda de
honestidade, a timeline e a tela mínima.

`SIMULATED`: todo comportamento físico. Nenhuma linha tocou hardware.

`INTERFACE_READY`: TTLock, Control iD e Seam — os três passam na conformidade
**recusando** as operações de hardware, que é o estado correto antes da
integração.

Detalhamento completo, com riscos restantes: [`docs/status-de-entrega.md`](docs/status-de-entrega.md).

## Documentação

| Documento | Assunto |
|---|---|
| [`docs/analise-de-impacto.md`](docs/analise-de-impacto.md) | o que a atualização muda em cada camada, e os riscos de arquitetura |
| [`docs/status-de-entrega.md`](docs/status-de-entrega.md) | classificação do item 45 e riscos restantes |
| [`docs/backlog.md`](docs/backlog.md) | o que destrava o próximo passo |
| [`docs/adr/`](docs/adr/) | quinze decisões registradas, cinco delas nascidas de defeitos encontrados na própria bateria |
| [`docs/adapters/`](docs/adapters/) | TTLock, Control iD e Seam: o que existe, o que falta e por quê |
