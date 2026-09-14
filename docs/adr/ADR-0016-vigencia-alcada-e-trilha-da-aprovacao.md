# ADR-0016 — A aprovação humana tem prazo, alçada congelada e elo na cadeia

- **Estado:** aceito
- **Data:** 2026-09-14
- **Complementa:** ADR-0012 (aprovação ligada ao conteúdo), ADR-0011 (auditoria e cadeia), ADR-0013 (pesos com estatuto)

## Contexto

O ADR-0012 ligou a aprovação ao hash do material revisado, e com isso fechou o
ataque mais simples contra revisão humana: mostrar uma coisa e executar outra.
Fechou esse, e só esse. Três perguntas de investigação hospitalar continuavam
sem resposta no registro, e as três aparecem na mesma conversa:

**"Até quando essa aprovação vale?"** Enquanto o material não mudasse, para
sempre. A supervisora que libera o cofre de psicotrópicos às 02h40 está
aprovando *aquele plantão* — aquela escala, aquela equipe na casa, aquele
motivo. O material que ela revisou pode continuar idêntico dezoito meses
depois, e a assinatura dela continuaria abrindo a porta. Nada mudou, e é
exatamente por isso que nada expirava: **a permanência era o defeito, não a
mudança.**

**"Essa pessoa podia aprovar isso?"** A alçada era conferida na hora e
descartada em seguida. A resposta meses depois dependia do teto que o papel tem
*hoje* — e papel muda de teto. Um cargo rebaixado transformaria retroativamente
uma decisão legítima em irregular, e um cargo promovido faria o contrário, que
é pior.

**"Quem liberou?"** A cadeia respondia `EntitlementGranted`, autor
`entitlement-reconciliation` — o motor. Verdadeiro e inútil: o motor executava
uma decisão guardada num `Map` em memória, **fora** da cadeia. O ledger tem
sequência contígua, encadeamento por hash e recomputação justamente para
resistir a adulteração silenciosa, e o único ato que ninguém pode adulterar em
silêncio era o que não estava lá.

## Decisão

### 1. Vigência, com o estatuto dos números deste produto

Toda aprovação passa a ter prazo, por faixa de criticidade, em
`governanca/vigencia.ts`. As quatro janelas são `ConstanteCalibrada` em
**SOMBRA**, lidas por `obterEmSombra`, como os pesos do Health Score
(ADR-0013). `CRITICA` é a única com procedência externa ao produto: doze horas,
o turno da escala 12×36 que a CLT reconhece no art. 59-A e que é o padrão de
enfermagem hospitalar no Brasil — a aprovação morre com o plantão que a pediu,
que é o que uma supervisora entende por "autorizei" sem que ninguém precise
explicar. As outras três descem por proporção, e essa proporção é palpite
declarado.

**Por que um valor em sombra pode agir aqui, se um peso do score não pode:** a
diferença está na direção do efeito. O peso move um número para cima ou para
baixo e por isso não sustenta decisão sozinho. A janela **só fecha** — nunca
concede acesso que não tenha sido aprovado, nunca estende aprovação nenhuma, e
o único desfecho que produz é exigir que uma pessoa reveja. Errar para menos
custa uma revisão a mais; não expirar custa uma porta aberta por decisão que
ninguém tomou hoje. É a mesma regra que governa o resto: *ausência de avaliação
nunca autoriza.*

Três consequências de projeto, cada uma contra um modo de falha concreto:

- **O relógio começa quando o gate passa a autorizar**, não na primeira
  assinatura. Numa faixa crítica são duas pessoas; contar da primeira daria à
  segunda uma janela menor do que a que ela concedeu.
- **A aprovação vencida volta para a fila de pendências.** Deixá-la fora faria
  o prazo derrubar acessos sem avisar que há o que revisar — a forma mais
  eficiente de ensinar uma equipe a aumentar a janela até o infinito.
- **O prazo sai com o aviso de sombra colado**, na mesma estrutura de retorno.
  Uma tela que mostrasse "vence às 14h40" sem o aviso exibiria como medida um
  número que ninguém mediu.

### 2. Alçada congelada no instante da decisão

O registro passa a guardar, por decisão, o teto de criticidade que aquele papel
alcançava **então** — reconstruído sondando `podeDecidir` faixa a faixa, porque
a porta do kernel devolve booleano e acrescentar um método a ela seria editar o
espelho, que o `MPEH_MANIFEST.json` proíbe. O contrato que existe basta para
chegar ao mesmo fato.

Vale também para a **recusa**: a tentativa de quem não tinha alçada é fato de
auditoria tão relevante quanto a aprovação de quem tinha, e frequentemente mais.

### 3. Os três atos entram na cadeia

`AccessApprovalRequested`, `AccessApprovalDecided` e `AccessApprovalExpired`
passam a ser tipos de evento, com corpo declarado: pedir revisão é
**CONSULTIVO** (convoca gente, decide nada), decidir é **HUMANO** por definição
do tipo — não só quando o evento vem carimbado com `MANUAL_OPERATOR` —, e
constatar vencimento é **CONSULTIVO**.

O vencimento é o único ato **sem ator**: ninguém o executa, ele acontece. O elo
nasce na primeira leitura que o constata, e o evento separa as duas datas —
`ocorridoEm` é quando venceu, `registradoEm` é quando a ColmeIA soube. O par já
existia no domínio para webhook atrasado, e descreve este caso com a mesma
precisão.

O gate **não** conhece a trilha: declara a porta `DiarioDeAprovacao`, e
`auditoria/diario.ts` a liga ao ledger. Governança que importa auditoria fica
presa ao formato do ledger, e este produto precisa embarcar em aplicativos de
gestão que já têm a sua própria trilha.

O diário **acumula e drena** em vez de gravar na hora, porque a porta do gate é
síncrona — `autorizado()` responde no meio do laço do motor — e o ledger é
assíncrono. Fazer a ponte com promessa solta resolveria a assinatura e criaria
o defeito: elo fora de ordem, falha de escrita virando rejeição não tratada, e
uma cadeia cuja sequência depende de quem ganhou a corrida. Cadeia não
reproduzível não é evidência.

## Consequências

- A suíte de aprovação vai de 27 para 74 verificações; a bateria, de 380 para
  427.
- `verdictoDe` passa a ter significado estrito: responde *o que a pessoa
  decidiu*, não *vale agora*. Quem precisa da segunda pergunta chama
  `autorizado` ou `vigenciaDe` — e é por isso que o motor de reconciliação usa
  aquelas duas.
- O congelamento da alçada só se prova quando o presente muda, e a bateria
  prova: rebaixar o papel depois da decisão não reescreve a autoridade de
  então.
- A projeção do material para o payload do evento é escrita campo a campo. A
  fronteira de dado clínico do ADR-0007 se mantém porque alguém escreve a
  lista, não porque o objeto de origem se comporta.

## O que esta decisão NÃO resolve

- **As janelas continuam em sombra**, e sobem de estatuto só com histórico real
  de revisões e de acessos em porta aprovada para confrontá-las.
- **A tela não mostra a fila de aprovação.** `pedidosAbertos()` já devolve as
  vencidas junto das nunca decididas, e nenhum painel consome isso ainda. Um
  prazo que vence sem aparecer para quem poderia renovar é um prazo que produz
  porta fechada na hora errada — é o próximo passo óbvio, e está no backlog.
- **A identidade do aprovador continua sendo a string que o host manda.** Ligar
  isso a matrícula, conselho de classe ou sessão assinada é trabalho do
  aplicativo de gestão, e a porta já está no lugar certo para recebê-lo.
