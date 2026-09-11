# ADR-0004 — `confidence` descreve a materialização, não a última leitura

- **Estado:** aceito
- **Data:** 2026-09-11
- **Origem:** defeito encontrado pelo cenário P1 durante a própria implementação

## Contexto

O `PhysicalReconciliationResult` carrega um campo `confidence` com três valores:
`CONFIRMED`, `PROBABLE`, `UNKNOWN`. A primeira implementação o calculava como
"quão confiável é a nossa última leitura do equipamento": leitura recente e
equipamento online produziam `CONFIRMED`.

O cenário P1 expôs o defeito. Na situação central do produto — direito revogado,
equipamento offline, última confirmação sendo a **concessão antiga** — aquela
fórmula devolvia `CONFIRMED`. E `CONFIRMED` é exatamente o valor que autoriza a
guarda de honestidade a deixar passar a frase "o acesso foi revogado e a porta
está trancada".

Ou seja: a evidência da concessão que estávamos tentando desfazer servia de aval
para afirmar que ela tinha sido desfeita. A alucinação operacional que o item 33
proíbe nasceria dentro do motor determinístico, com aparência de rigor.

## Decisão

`confidence` responde a uma pergunta diferente, e ela é declarada no tipo:
**quanta evidência existe de que o estado físico ATUAL corresponde ao estado
desejado.**

Havendo divergência:

- `UNKNOWN` — nunca houve evidência, ou a cadeia (provedor → gateway →
  equipamento) está rompida e não há como saber se a correção chegou;
- `PROBABLE` — a ordem foi aceita e a cadeia está de pé, mas a confirmação ainda
  não voltou;
- `CONFIRMED` — **nunca**, enquanto houver divergência.

## Consequências

- A guarda de honestidade passa a recusar a frase categórica em P1, como deve.
- Um efeito colateral desejado: o painel deixou de exibir "leitura confirmada"
  ao lado de "revogação pendente", combinação que era visualmente tranquilizante
  e factualmente falsa.
- O campo `minutosDesdeConfirmacao` continua exposto, para quem quiser saber a
  idade da última evidência — a informação não se perdeu, mudou de nome e de
  lugar.

## Lição registrada

O defeito não era de código: era de vocabulário. Duas perguntas diferentes
disputavam o mesmo campo, e o nome curto (`confidence`) não obrigava ninguém a
escolher. Campos que respondem perguntas diferentes precisam de nomes que digam
qual pergunta respondem — e, quando não dá, de um comentário que diga.
