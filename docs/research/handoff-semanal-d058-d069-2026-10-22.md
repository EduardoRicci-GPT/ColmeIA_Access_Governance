# Handoff semanal vivo — Radar ColmeIA D-058 a D-069

Atualizado: 2026-10-22. Branch: `research/d058-d061-20261014`. PR de pesquisa: #1.

## Escopo e genealogia

| Achado | Foco | Fonte no repositório |
|---|---|---|
| D-058 | origem de sinal de campo | [D-058–D-061](./radar-d058-d061-2026-10-14.md) |
| D-059 | acompanhamento/escort | [D-058–D-061](./radar-d058-d061-2026-10-14.md) |
| D-060 | modo contingência e enforcement | [D-058–D-061](./radar-d058-d061-2026-10-14.md) |
| D-061 | fronteira entre SaaS e serviço regulado | [D-058–D-061](./radar-d058-d061-2026-10-14.md) |
| D-062 | ONVIF, conformidade e firmware | [D-062](./radar-d062-2026-10-15.md) |
| D-063 | portabilidade de credencial vs autorização | [D-063](./radar-d063-2026-10-16.md) |
| D-064 | assurance temporal | [D-064](./radar-d064-2026-10-17.md) |
| D-065 | cenas multirrecurso e convergência | [D-065](./radar-d065-2026-10-18.md) |
| D-066 | antipassback vs ocupação observada | [D-066](./radar-d066-2026-10-19.md) |
| D-067 | fechamento vs barreira segura | [D-067](./radar-d067-2026-10-20.md) |
| D-068 | locker, custódia e readiness | [D-068](./radar-d068-2026-10-21.md) |
| D-069 | referência de mídia vs preservação | [D-069](./radar-d069-2026-10-22.md) |

**Todos são achados de pesquisa, não declarações de implementação.** O estado do código deve ser conferido independentemente. A evidência externa precisa ser revalidada na fonte primária por versão, modelo e data. Alguns documentos são handoffs resumidos.

## ORIENTAÇÃO PARA CLAUDE CODE / CODEX

**Objetivo:** reconciliar D-058–D-069 com os quatro motores e o domínio já existente, preservar a arquitetura e promover apenas DELTA REAL com evidência técnica.

1. Leia `docs/research/ledger-de-decisoes.md`, `docs/research/mapa-de-lacunas.md`, `docs/backlog.md`, `docs/status-de-entrega.md`, ADRs e todos os documentos acima. Verifique se os arquivos citados existem e localize as implementações reais.
2. Para cada achado, produza uma matriz `JÁ EXISTE | PARCIAL | DELTA REAL | NÃO APLICÁVEL | RESEARCH_REQUIRED`, com evidência por caminho/linha, teste e impacto comercial/hospitalar.
3. Priorize reconciliação: D-058/064/066/067/069 na cadeia de observação e Evidence Assurance; D-059/063/068 em autoridade, competência, responsabilidade e custódia; D-060/065 em fallback, cena e convergência; D-061 requer revisão jurídica, não inferência automatizada.
4. Mantenha `UNKNOWN` em capabilities sem verificação por modelo/firmware/adapters. Não criar quinto motor; não executar comando inseguro em sistemas de evacuação ou assistência; não confundir evidência, autoria, competência e culpa.
5. Para cada DELTA REAL: ADR ou adendo, contratos de eventos e entidades, adapter mock/real distinguíveis, testes negativos e ponta a ponta, cobertura de timeline/Health Score/escalonamento, avaliação LGPD, validação de build e testes.
6. Atualize ledger, mapa de lacunas, backlog e status de entrega somente após testes; registre hashes, comandos e resultados. PRs pequenos, reversíveis e revisáveis. Não mescle este PR de pesquisa sem revisão humana.

## Critérios de aceite do ciclo

- Nenhuma capability comercial anunciada é classificada IMPLEMENTED sem teste de integração correspondente.
- Isolamento de tenant/unidade e federação de autoridade comprovados em testes.
- Presença, vídeo, RFID, comandos e relógios não se convertem em prova de autoria ou responsabilidade sem corroboração adequada.
- Contingência e rotas de fuga permanecem seguras; intervenções relevantes exigem autoridade humana.
- LGPD: finalidade, minimização, retenção e acesso auditável a mídias e dados de profissionais/pacientes.
- Relatório final lista itens implementados, simulados, interface-ready, dependentes de fabricante e pendentes de pesquisa.

## Manutenção

Para cada novo radar: criar `docs/research/radar-dNNN-AAAA-MM-DD.md`, acrescentar linha à tabela, atualizar handoff e vincular ao PR; não declarar sincronização sem ler o arquivo no GitHub após a gravação.
