# ColmeIA Access Governance

Controle de acesso para unidades de saúde — construído a partir de uma
constatação incômoda: **saber quem deveria entrar não é saber quem entra.**

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

## Estrutura

```
colmeia-acesso/
  packages/
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
npm run acesso:verificar    # pureza + lint de estado + 244 verificações
npm run acesso:painel       # gera .saida/painel-access-assurance.html
```

Suítes individualmente:

```bash
npx tsx colmeia-acesso/testes/cenario-p1.ts             # divergência física
npx tsx colmeia-acesso/testes/cenario-p2.ts             # telemetria de latência
npx tsx colmeia-acesso/testes/cenarios-hospitalares.ts  # H7–H10
```

## Estado da entrega

`IMPLEMENTED`: os quatro motores, o contrato de adaptadores v2, o Health Score
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
| [`docs/adr/`](docs/adr/) | nove decisões registradas, duas delas nascidas de defeitos encontrados na própria bateria |
| [`docs/adapters/`](docs/adapters/) | TTLock, Control iD e Seam: o que existe, o que falta e por quê |
