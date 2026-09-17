# ADR-0024 — O aviso da emergência: comunicar um fato não é convocar uma decisão

**Estado:** aceito
**Data:** 2026-09-17
**Sucede:** ADR-0018 (o chamado a quem pode decidir), ADR-0023 (quebra de vidro)

## Contexto

O ADR-0023 fechou declarando o que não resolvia, e a primeira linha daquela
lista era a mais desconfortável de todas: *"ninguém é chamado quando o vidro
quebra. A porta existe; falta ligá-la."*

Vale dizer com precisão o que isso significava. O produto tinha o desenho
inteiro da exceção — janela curta calibrada em sombra, três atos na cadeia,
revisão obrigatória que não se fecha sozinha, direito revogado quando a janela
fecha. Tinha também um plantão que sabia sondar quem tem alçada, escolher canal
e registrar a não entrega. As duas coisas nunca se falavam. Às 02h40, a porta do
cofre abria por afirmação de uma pessoa, e a única forma de alguém ficar sabendo
era abrir a tela — que é exatamente o estado que o ADR-0018 existiu para
corrigir, reproduzido um nível acima.

É o defeito que este repositório já nomeou três vezes e registrou como D-022 no
ledger de decisões: *a porta que ninguém chama é uma negativa silenciosa*. Um
módulo que compila, tem contrato limpo e nenhum chamador é indistinguível, em
produção, de um módulo que não existe — com a agravante de parecer resolvido na
leitura do código.

## Decisão

O plantão passa a ter **duas espécies de aviso**, e a distinção é a decisão
central deste ADR.

O aviso de aprovação **CONVOCA**: há uma decisão esperando gente, e por isso ele
insiste — degrau após degrau, respeitando um intervalo de reforço por faixa de
criticidade, até que alguém decida.

O aviso de emergência **INFORMA**: já aconteceu, alguém assumiu, e quem responde
pela área precisa saber agora. Tratar os dois como o mesmo objeto faria o
segundo herdar a paciência do primeiro — e a quebra de vidro não tem intervalo
de reforço a respeitar no primeiro toque, porque o primeiro toque é o fato.

Disso decorrem três escolhas que merecem ser justificadas uma a uma.

**Dois fatos por quebra, e nenhum reforço.** O canal comunica quando o vidro
quebra e comunica de novo quando a janela fecha com a revisão em aberto. Nunca
mais. A tentação era óbvia — a revisão pendente não vence nem some, logo caberia
cobrá-la indefinidamente. É a leitura errada do mesmo princípio que criou o
intervalo de reforço: um canal que toca para sempre é um canal que a equipe
desliga, e desligado ele não carrega mais nem o fato. A permanência da dívida é
trabalho da **tela**, que a mostra enquanto existir; o canal carrega fatos, e um
fato se comunica uma vez.

**O texto do aviso não carrega a justificativa livre.** A pessoa que quebra o
vidro escreve por extenso o que estava acontecendo, e esse texto é indispensável
— para a cadeia e para quem revisa, que o lê inteiro. Num canal que pode ser o
visor de um pager ou um SMS, num aparelho sem controle de acesso, copiar texto
livre de origem humana é o caminho conhecido para vazar o que o ADR-0007 mantém
fora da decisão. A natureza declarada, de taxonomia fechada, informa sem expor.

**Tipo próprio na cadeia.** `BreakGlassNotified` e
`BreakGlassNotificationUndelivered`, e não o reaproveitamento de
`AccessApprovalNotified`. Uma investigação que lê "chamado não entregue"
precisa saber se ninguém foi acordado para **decidir** ou se ninguém soube que a
porta **já tinha sido aberta**. São perguntas diferentes, e a segunda é a que
tem consequência imediata.

Na tela, a seção de quebra de vidro ordena ao contrário de todas as outras
filas deste painel, e a inversão é deliberada. Nas outras, o topo é o que vence
primeiro — o próximo acesso a parar de funcionar. Aqui não há nada por vencer: a
janela fecha sozinha, e o que fica é uma afirmação que ninguém conferiu. Por
isso a faixa de revisão pendente ordena da **mais antiga** para a mais nova. Uma
quebra de vidro sem revisão há três semanas não ficou menos grave por ter
envelhecido; ficou mais, e uma lista cronológica invertida a empurraria para o
rodapé exatamente enquanto ela piora.

## Alternativas descartadas

**Um único tipo de aviso com um campo `urgente`.** Preservaria a simetria do
código e destruiria a do domínio: o objeto continuaria carregando `pedidoId`,
`degrau` e uma pendência que a emergência não tem, e a primeira manutenção
descuidada aplicaria o intervalo de reforço da aprovação ao fato consumado.

**Cobrar a revisão pendente a cada ciclo.** Descartada pela razão acima — e
porque produziria, numa instalação com uma dívida antiga, um canal que só toca
sobre ela, soterrando a próxima emergência de verdade.

**Esconder da tela a quebra já revisada.** Some quem quiser fingir que não houve
exceção. A revisada fica no fim da lista, com o verdicto à vista, porque a
contagem por zona — que é onde a repetição aparece — precisa ter o que ler.

## Consequências

- A bateria vai de 638 para **670 verificações**; os cenários hospitalares de
  181 para 213, com B5 e B6.
- `DiarioDeAviso` ganha um segundo método, obrigatório. Quem implementa a porta
  passa a ser forçado a decidir o que faz com a emergência, em vez de herdar o
  silêncio por omissão.
- `PlantaoDeAprovacao` deixa de encerrar o ciclo quando a fila de aprovação está
  vazia. Era o caminho mais curto para o defeito: a instalação em que ninguém
  pediu aprovação nenhuma é justamente a instalação em que o vidro foi quebrado,
  porque quebrar o vidro é o que se faz quando não dá tempo de pedir.
- A bancada e o gerador de painel passam a montar a emergência ligada ao
  plantão. Se a bancada não liga, produção também não liga — e o ADR-0023 é a
  prova de que essa frase não é retórica.

## O que esta decisão NÃO resolve

- **Quem responde pela área não é quem tem alçada na faixa.** O aviso procura os
  papéis com alçada porque é a porta que existe, e a aproximação está declarada
  no código. Responsabilidade por zona exige uma porta nova no host — e inventar
  uma segunda verdade sobre a hierarquia do hospital é o que `AutoridadeDoHost`
  existe para impedir.
- **O Health Score continua sem sentir a repetição.** `contagemPorZona()` existe
  e nenhum score a lê. Três quebras na mesma zona no mesmo mês é achado de
  governança, e atravessar esse indicador pela hierarquia do assurance é
  trabalho próprio (backlog 23e).
- **Ninguém confirma que recebeu.** A entrega é o que o canal do host reporta;
  não há acusação de leitura. Uma emergência comunicada a um pager que ficou na
  gaveta é, para esta cadeia, uma emergência comunicada.
- **Quem invoca continua sendo uma string.** Segue valendo integralmente o que o
  ADR-0023 registrou: a prestação de contas posterior depende inteiramente de
  saber quem afirmou.
