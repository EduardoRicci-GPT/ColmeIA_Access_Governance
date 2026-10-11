# ADR-0031 — Observar não autoriza intervir: os quatro atos entre o sensor e o equipamento

**Estado:** aceito
**Data:** 2026-10-11
**Sucede:** ADR-0003 (separação de autoridade, via kernel MPE-H), ADR-0027 (Sinergentia³)
**Relacionado:** ADR-0009 (aprovação humana), ADR-0012 (aprovação ligada ao conteúdo), ADR-0026 (o chamado do assurance), D-056 do consolidado de 10/10/2026

## Contexto

Quando a governança de acesso alcança o ambiente físico de uma unidade de saúde,
encontra sistemas que não são portas: porta corta-fogo, elevador, rede de gases
medicinais, climatização de bloco cirúrgico, bomba de água, quadro de energia.
O produto chega a eles por um caminho legítimo — todos têm acesso restrito,
todos têm quem responde por eles, e todos geram observação.

A cadeia que vai da observação à intervenção tem quatro atos distintos, e um
sistema de facilities mal desenhado os colapsa em um:

| Ato | Quem | Corpo (ADR-0003) |
|---|---|---|
| OBSERVAÇÃO | sensor, pessoa ou modelo relata um fato | CONSULTIVO |
| AVALIAÇÃO | alguém classifica a condição com critério declarado | CONSULTIVO |
| INCIDENTE | a instituição reconhece que há um fato a tratar | CONSULTIVO |
| INTERVENÇÃO | alguém com alçada autoriza um ato sobre o equipamento | HUMANO |

O colapso é tentador porque parece eficiência: o sensor detecta pressão baixa na
rede de oxigênio, o sistema "sabe" que isso é crítico, e aciona o religamento da
linha de reserva sozinho. Em noventa e nove por cento dos casos funciona. No
centésimo, o sensor estava com deriva, a linha de reserva estava em manutenção,
e o sistema desligou a rede principal de um bloco cirúrgico com três salas
ocupadas.

O vocabulário estava reservado desde o ADR-0003, antes de haver o que pôr nele.
O ledger registrava D-017 (observação não é julgamento) e D-018 (capacidade não
implica autoridade) como pendentes. Não havia objeto nenhum.

## Decisão

**Os quatro atos são separados por construção, e não por disciplina de quem
chama.**

`governanca/intervencao.ts`:

- `avaliarCondicao` **não abre incidente**. Uma função que avaliasse e abrisse no
  mesmo ato tornaria impossível perguntar depois quem decidiu que aquilo era um
  incidente — a resposta seria "o código".
- `abrirIncidente` exige avaliação **com critério declarado**. "Pressão em 3,2
  bar, abaixo do mínimo operacional de 4,0 declarado pela engenharia clínica" é
  critério; "anormal" não é.
- `MesaDeIntervencao.autorizar` exige decisão humana contra o **hash do material
  revisado**, com assinatura conferida pelo host e alçada para a criticidade. É
  o mesmo human-gate das aprovações de acesso — reusar é decisão, não economia:
  uma segunda implementação de aprovação humana produziria duas verdades sobre
  quem pode decidir, e o ADR-0012 existe contra isso.
- `ordemDeIntervencao` **lança** quando a intervenção não foi autorizada. Uma
  ordem construível sem autorização seria uma ordem que alguém, algum dia,
  construiria.

A criticidade da alçada é da **intervenção**, não do sistema. Inspecionar a rede
de gases é BAIXA; desligá-la é CRITICA. Usar a criticidade do sistema faria uma
inspeção de rotina acordar a diretoria técnica — o mesmo defeito que
`EncaminhamentoPorTipo` existe para evitar do outro lado.

E a recusa que liga este ADR ao ADR-0027: **um incidente de severidade alta não
nasce de prosa.** Quando toda a sustentação vem de leitura de modelo,
`abrirIncidente` recusa com `SOMENTE_MODELO_EM_SEVERIDADE_ALTA`. A recusa NÃO
descarta a leitura — ela segue entre as evidências e segue valendo como triagem
e explicação. O que ela exige é um fato instrumental ou humano embaixo. A
parceria cognitiva lê e propõe; não constata.

## Consequências

- Sete espécies de sistema físico, cada uma com piso de severidade declarado em
  tabela, como `classificarRisco` — pela mesma razão do item 28: severidade
  define quem é acordado às 3h e o que entra em relatório de conformidade, e um
  número que muda de execução para execução não sustenta nenhuma das duas.
- Condição `INDETERMINADA` herda o piso da espécie. Não saber a condição de uma
  rede de gases medicinais não é "normal com ressalva" — é a mesma disciplina
  que faz `DEVICE_SYNC_UNKNOWN` contar como indisponível no Health Score.
- O Health Score ganha `INCIDENTES_SEM_AUTORIDADE`, com peso 3 — igual à
  revogação pendente, e acima dos outros dois pesos de outubro. É o único dos
  três em que há um fato acontecendo e ninguém a caminho: a rede de gases com
  pressão anormal, o incidente aberto, a lista de papéis encaminhados vazia.
- **Esta é a sétima ocorrência do D-022 neste repositório, e a primeira que
  nasce pontuada.** As seis anteriores foram capacidades corretas descobertas
  sem chamador meses depois; esta entra no número no mesmo dia em que a
  capacidade existe. O peso cobra a AUSÊNCIA de encaminhamento, nunca a
  existência do incidente.
- `ENCAMINHAMENTO_DE_INCIDENTES` manda gases medicinais para engenharia clínica
  **e** diretoria técnica, porque desligar uma rede de gases é decisão que
  ninguém toma sozinho.
- `InterventionAuthorized` e `InterventionDenied` entram na cadeia pelo corpo
  HUMANO; observar, avaliar, abrir e pedir caem no consultivo, corretamente.
- A mesa aceita uma `ConferenciaDeAutoridadeFederada` opcional (ADR-0032), com
  motivo de recusa próprio: ter alçada e não ter autoridade naquela organização
  exigem providências opostas.

## Alternativas descartadas

- **Automatizar a intervenção de baixo risco.** Teria sido defensável para
  `INSPECAO`, e abriria o precedente: o próximo degrau é `RELIGAMENTO`, e o
  seguinte é a lista de exceções crescendo até a separação virar formalidade.
- **Severidade por modelo.** O item 28 já decidiu: a IA lê a tabela e explica;
  não a reescreve.
- **Um só objeto `Incidente` com campos de observação e autorização.** Teria
  menos código e tornaria o colapso dos quatro atos uma questão de disciplina —
  e disciplina não sobrevive à primeira sexta-feira em que alguém precisa
  terminar uma tela.

## O que esta decisão NÃO resolve

- **Nada aqui fala com equipamento.** `ordemDeIntervencao` devolve registro, não
  comando. Toda a execução física continua `SIMULATED`.
- **O encaminhamento continua sendo CARGO, não pessoa.** Mesma lacuna do
  backlog 5c, agora valendo para incidentes físicos.
- **Nenhum sensor real.** As observações entram pela porta do host; não há
  integração com BMS, com central de incêndio nem com telemetria de gases.
- **O incidente não tem prazo.** Assumido e nunca encerrado, ele sai do score e
  fica aberto para sempre. Cobrar o resolvedor exige decidir o que é prazo
  aceitável, e isso é governança do hospital.
