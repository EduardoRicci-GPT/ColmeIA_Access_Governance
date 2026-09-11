# ADR-0010 — O produto deriva da Aletheia por cópia do kernel MPE-H

- **Estado:** aceito
- **Data:** 2026-09-11
- **Corrige:** o enquadramento do ADR-0001, que tratava a separação como questão de posse de diretório
- **Origem:** correção do autor — *"é a partir de uma cópia e não devemos perder o original"*

## Contexto

A primeira entrega construiu o produto **ao lado** da Aletheia: subárvore isolada,
zero imports atravessando a fronteira, Policy Engine escrito do zero como tabela
de regras. O ADR-0001 justificou a separação e não percebeu que ela era o
defeito.

A razão de derivar da Aletheia nunca foi reuso de código por economia. Foi que a
decisão de liberar uma área ou um locker **não sai de uma tabela de regras**: sai
do cruzamento 360° de hierarquia, horário, agenda, local, vínculo e contexto —
que é precisamente o que o MPE com R-VEP faz. Um motor próprio, por melhor
escrito, decide por critério diferente do resto do ecossistema. Duas frentes com
o mesmo nome e critérios divergentes é pior que uma frente só.

## Decisão

O kernel MPE-H — **Ledger · HumanGate · Calibration** — é **copiado** para
`colmeia-acesso/packages/mpeh-kernel/`, bit-a-bit, com `MPEH_MANIFEST.json`
registrando sha256 de cada arquivo, commit de origem e a regra do espelho.

### Por que cópia, e não import

O destino declarado é rodar **dentro de aplicativos de gestão hospitalar**. Um
produto embarcável não pode depender do checkout de outro repositório para
compilar. A cópia torna a subárvore autossuficiente, ao custo de exigir sincronia
deliberada — custo que `ferramentas/verificar-espelho-mpeh.mjs` cobra:

- **integridade da cópia**: editar o espelho quebra a bateria, aqui e agora;
- **deriva da origem**: quando a origem está no disco, a diferença é
  **relatada** — a origem evoluir é normal; evoluir sem ninguém notar não é.

### O que NÃO foi copiado, e por quê

| Item | Motivo |
|---|---|
| `engine/mpe_rvep_legacy.py` | espelho bit-a-bit do corpus MPEH sob regra própria; exige Python no host. Entra por **porta** (`LeitorDeContexto360`), ver ADR-0015 |
| `src/services/guardrailEstrutural.ts` | copiado e **revertido**: não compila sob a configuração estrita deste produto, e editar espelho é o que o manifesto proíbe. Virou **porte com prova diferencial** (ADR-0015) |
| `wsg/` | quarto pacote da ordem do guia; ainda não extraído na origem |

## O que mudou no produto

| Antes (escrito do zero) | Agora (MPE-H) |
|---|---|
| `ArmazemDeEventos` + `IndiceDeAuditoria` | `Ledger` — cadeia encadeada por hash (ADR-0011) |
| `aprovacoes: Set<string>` | human-gate ligado ao `bundleHash` (ADR-0012) |
| `PESOS_PADRAO` congelado | `ConstanteCalibrada` em SOMBRA (ADR-0013) |
| — | Filtro Zero e O Freio (ADR-0014) |
| — | guardrail estrutural e porta do R-VEP (ADR-0015) |

O original permanece intacto: nenhum arquivo da Aletheia foi modificado para
acomodar este produto.
