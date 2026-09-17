# ADR-0023 — A emergência troca autorização prévia por prestação de contas posterior

- **Estado:** aceito
- **Data:** 2026-09-17
- **Complementa:** ADR-0009 (aprovação humana), ADR-0016 (vigência), ADR-0021 (competência)
- **Corrige:** um defeito que a própria bancada encontrou — ver "O defeito que o B1 achou"

## Contexto

O produto exige duas assinaturas distintas em faixa crítica, e a exigência está
certa: é a defesa contra a fadiga de plantão, que é justamente quando um cofre
de psicotrópicos costuma ser liberado às pressas.

Ela também é a resposta errada numa parada cardíaca, porque as duas pessoas que
deveriam assinar estão ocupadas — possivelmente com o mesmo paciente.

Um sistema que só conhece a deliberação tem duas saídas conhecidas: atrasar o
atendimento, ou ser contornado. **A segunda é a que acontece** — a porta é
escorada, o crachá é emprestado, o vidro do armário é quebrado de verdade. E aí
não há registro nenhum, que é o pior desfecho possível.

## Decisão

### 1. O que se troca é o momento do controle, não o controle

Não se troca controle por conveniência: autorização prévia vira **prestação de
contas posterior**. Quem invoca assume, com nome, que havia emergência — e essa
afirmação vai a revisão obrigatória.

Por isso o desenho é **caro em visibilidade e barato em tempo**:

- invocar é imediato, porque é disso que se trata;
- invocar em silêncio é impossível: três atos entram na cadeia;
- a janela é curta por construção, medida em minutos;
- a revisão posterior é pendência que **não se fecha sozinha**;
- a pendência de aprovação original **não desaparece** — a quebra de vidro abre
  a porta agora, e não aprova nada.

### 2. A linha que a emergência não atravessa

Emergência justifica pular **deliberação** e **escala**. Não justifica pular
**vínculo** nem **qualificação**.

Isso exigiu reorganizar as prioridades da política em três faixas:

| Faixa | Regras | Por quê |
|---|---|---|
| `IMPEDIMENTO_ABSOLUTO` (120) | vínculo, ordem de serviço, habilitação suspensa | Não são falta de permissão. A quebra de vidro concede permissão depressa, e não há como conceder depressa uma qualificação que a pessoa não tem. |
| `QUEBRA_DE_VIDRO` (110) | a emergência declarada | Acima do turno de propósito: a enfermeira cujo plantão terminou dez minutos atrás e que está no corredor é exatamente quem atende a parada. |
| `BLOQUEIO_ESTRUTURAL` (100) e abaixo | turno, restrição sanitária, competência pendente, segregação, criticidade | Todas são formas de deliberação, e é a deliberação que a emergência não comporta. |

**A restrição sanitária ser ultrapassada é a decisão mais discutível do
conjunto**, e fica registrada como tal. O argumento: numa parada dentro de um
isolamento, quem entra é quem está na porta, de EPI, e quem decide isso é o
protocolo assistencial — não a fechadura. A revisão posterior vê o caso, com o
paciente já atendido.

### 3. As janelas são curtas, e a mais consequente é a mais curta

Quinze minutos em `CRITICAL`, e a inversão é intencional: quanto mais
consequente a porta, menos tempo ela fica aberta por afirmação de uma pessoa só.

As quatro estão em **SOMBRA**, como as janelas de vigência e de aviso. A direção
do efeito é o que autoriza usá-las assim mesmo — elas só **encurtam** a exceção;
nunca a estendem, nunca dispensam a revisão.

### 4. A repetição é dado, não veredicto

O registro conta as quebras por zona. Três numa semana na mesma farmácia é
achado relevante — e o sistema **não conclui nada sobre isso**. Decidir que
houve abuso é acusação, e acusação é jurisdição humana (ADR-0003).

## O defeito que o B1 achou

O cenário B1 falhou na primeira execução, e a falha era da implementação.

Quando a janela fecha, a política volta a `REQUIRE_APPROVAL` — e ali o motor
**mantém** o direito existente em `KEEP`, comportamento correto desde o
ADR-0009: exigir aprovação não revoga o que já existe.

Só que aquele `KEEP` pressupunha uma coisa que deixou de valer: que o direito
existente **foi aprovado**, ou nunca foi materializado. A quebra de vidro
materializa sem aprovar. O resultado seria a emergência virando **concessão
permanente e silenciosa** — exatamente o destino de todo break-glass mal
desenhado, e exatamente o que o cabeçalho do módulo diz querer evitar.

A correção: `Entitlement` passa a declarar `origemDaConcessao`, e um direito
nascido de quebra de vidro é **revogado** quando a janela fecha sem aprovação,
com motivo próprio (`EMERGENCY_WINDOW_CLOSED`). A pendência de aprovação
permanece aberta, porque nada foi aprovado.

### E um segundo defeito, latente desde antes

Ao acrescentar a explicação nova, o cenário topou com o filtro da fila de
pendências:

```ts
acoes.filter((acao) => acao.explicacao.includes('pendente'))
```

Comportamento amarrado a prosa. A primeira reescrita de frase esvaziaria a fila
**em silêncio** — e uma fila de aprovação vazia parece boa notícia. Virou campo
explícito (`aguardaAprovacao`), e a fila passou a ser filtrada por fato.

## Consequências

- A bateria vai de 612 para **638 verificações**; os cenários de 155 para 181,
  com B1–B4.
- `MotivoDeRevogacao` ganha `EMERGENCY_WINDOW_CLOSED`, e a trilha passa a
  distinguir "revogado porque a política mudou" de "revogado porque a
  emergência acabou".
- Três tipos de evento novos. Invocar e revisar são **HUMANO** (ADR-0003);
  expirar não é: o tempo passou.
- `MundoLogico` ganha `emergencias`, ausente por omissão — e ausência nunca
  significa emergência presumida.

## O que esta decisão NÃO resolve

- ~~**Ninguém é chamado quando o vidro quebra.**~~ Resolvido pelo ADR-0024: o
  plantão ganhou uma segunda espécie de aviso, que informa um fato em vez de
  convocar uma decisão.
- ~~**A revisão pendente não aparece na tela.**~~ Resolvido pelo ADR-0024, com a
  dívida ordenada da mais antiga para a mais nova.
- ~~**O Health Score não sente a repetição.**~~ Resolvido pelo ADR-0025, que
  cobra a conta em aberto e a repetição — nunca o ato de quebrar o vidro.
- **Quem invoca é uma string.** Ligar isso à sessão autenticada do aplicativo
  de gestão é o mesmo trabalho pendente da identidade do aprovador (ADR-0016),
  e aqui é mais grave: a prestação de contas posterior depende inteiramente de
  saber quem afirmou.
