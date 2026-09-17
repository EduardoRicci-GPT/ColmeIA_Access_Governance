# ADR-0020 — O supervisor concede responsabilidade, não portas

- **Estado:** aceito
- **Data:** 2026-09-17
- **Complementa:** ADR-0009 (aprovação humana), ADR-0016 (vigência e alçada), ADR-0019 (segregação por atividade)
- **Origem:** pesquisa registrada em `docs/research/` — o achado mais original da investigação que precedeu este código

## Contexto

Este produto derivava direitos de fatos formais: vínculo, papel, lotação,
escala, ordem de serviço. Todos vêm do RH, e todos descrevem o **planejamento**.

A operação hospitalar não cabe inteira nesse retrato. A auxiliar da Clínica
Médica que atravessa a porta da UTI às 14h32 pode estar cobrindo um déficit
real, atendendo uma intercorrência ou acompanhando uma transferência — e
nenhuma dessas hipóteses aparece na escala, porque nenhuma foi planejada. Numa
unidade pequena, num domingo, isso não é exceção: é a escala possível.

Um sistema que só conhece o planejamento tem duas saídas, e as duas corroem:

- **Barrar.** A porta não abre para quem precisa entrar, e a equipe aprende a
  contornar o sistema — com a porta escorada, com o crachá emprestado, com o
  acesso pedido de favor. O controle passa a existir no papel.
- **Aceitar em silêncio.** O acesso acontece e não deixa rastro do porquê. O
  sistema registra que a porta abriu e não sabe dizer se deveria.

Nenhuma das duas é governança. A primeira é rigidez, a segunda é cegueira.

## Decisão

### 1. A unidade de concessão é a responsabilidade, não o acesso

O supervisor não diz "abra a porta 7 para a Maria". Ele diz: *"a Maria está
apoiando a minha unidade, por este motivo, até este horário."* O motor deriva
os acessos, e os revoga sozinho quando o prazo vence.

A diferença não é de vocabulário, é de natureza do objeto. Conceder porta é ato
que não expira, não explica e não se reconcilia — alguém precisa lembrar de
desfazer, e é sempre alguém que não estava lá quando o apoio acabou. Conceder
responsabilidade cria um fato com prazo, motivo e autor, e o resto do produto
já sabe o que fazer com um fato desses: o ciclo reconcilia direitos a cada
volta desde o primeiro dia.

### 2. A responsabilidade entra AO LADO da lotação, nunca dentro dela

A integração usa a máquina que já existia: `REGRA_CONCESSAO_POR_LOTACAO` já
concede acesso às unidades em que a pessoa está lotada, e a responsabilidade
temporária acrescenta uma zona à leitura de contexto — **sem tocar em
`vinculo.unidadesLotadas`**.

A tentação era reescrever a lotação: seria menos código e funcionaria. E faria
o sistema mentir sobre o cadastro para obter um efeito de política. A auxiliar
segue lotada na Clínica Médica enquanto apoia a UTI, porque é isso que é
verdade, e o teste verifica exatamente essa não-mudança.

### 3. O acesso derivado é o mínimo, e a criticidade é o corte

A designação nomeia uma zona; o escopo da autoridade declara um teto de
criticidade; e o filtro acontece **por endpoint**. O supervisor da UTI designa
apoio à UTI, e isso não arrasta junto o que estiver acima do seu teto.

O teto não substitui o gate: endpoint `CRITICAL` dentro do teto continua
exigindo aprovação humana pelo caminho normal (ADR-0009). Designar
responsabilidade abre a discussão; não a encerra.

### 4. `EscopoDeDelegacao` é o que impede isto de virar porta lateral

Um mecanismo de exceção sem limite é o caminho mais curto para contornar toda a
política: bastaria um supervisor complacente para que qualquer pessoa chegasse
a qualquer lugar. O escopo declara zonas, tipos designáveis, teto de duração,
teto de criticidade e recursos vedados — e é conferido **antes de qualquer
outra coisa**, porque não importa se o motivo é bom quando quem decide não
podia decidir.

Quando a recusa é de alcance, o resultado diz que **outra autoridade
resolveria**. Quando é de qualificação, diz que nenhuma resolve.

### 5. Competência: o que não conseguimos verificar, declaramos

Exceção operacional não cria habilitação. Quem não pode executar o
procedimento continua não podendo, e nenhuma autoridade desta instalação
suprime esse requisito — o que falta ali não é permissão, é qualificação.

Só que este produto ainda modela **papel**, não competência. Então o pedido
carrega o estado que o host afirma, e os três valores têm consequências
distintas: `INSUFICIENTE` recusa; `VALIDA` segue; e `NAO_VERIFICADA` **segue
registrada** — na explicação, no registro e na cadeia.

Assumir válida transformaria a ausência de checagem em aprovação tácita.
Recusar tudo que não foi verificado travaria a operação por uma lacuna nossa,
não do hospital. Declarar é a única saída honesta enquanto competência não for
objeto próprio (backlog 20).

### 6. Os quatro atos entram na cadeia, inclusive a recusa

`TemporaryResponsibilityRequested`, `Denied`, `Granted` e `Ended`. Designar e
recusar são **HUMANO** (ADR-0003); pedir é o sistema convocando gente; o
vencimento não é decisão de ninguém, e separa `ocorridoEm` de `registradoEm`
como todo vencimento neste produto (ADR-0016).

A recusa entra porque a tentativa de designar fora do escopo é fato de
auditoria tão relevante quanto a designação legítima — e frequentemente mais,
porque é ali que se vê alguém procurando a porta lateral.

## Consequências

- A bateria vai de 522 para **554 verificações**; os cenários hospitalares
  passam a cobrir E1–E4 além de H7–H11.
- O cenário E1 prova a cadeia inteira sem intervenção: designação → direito
  derivado → confirmação no equipamento → vencimento → revogação →
  confirmação. Ninguém lembra de desfazer porque não há o que lembrar.
- `MundoLogico` ganha `responsabilidades`, ausente por omissão. Sem a porta
  ligada, o comportamento é idêntico ao anterior — e isso é testado.
- A bancada declara dois escopos com limites diferentes, e o que a supervisão
  da UTI **não** alcança é parte do exemplo: datacenter fora das zonas, cofre
  vedado por recurso proibido.

## O que esta decisão NÃO resolve

- **Competência continua sendo papel.** É a lacuna que mais afasta este código
  da formulação que a pesquisa alcançou — *"por competência e responsabilidade
  vigente"* —, e metade dela agora existe.
- **Ninguém detecta a exceção sozinho.** O pedido precisa ser aberto por
  alguém: não há passagem observada, porque não há câmera nem sensor. A
  detecção automática é a fronteira em que este produto deixaria de governar
  acesso e começaria a governar ambiente físico, e a própria pesquisa
  recomendou não atravessá-la antes de dominar a primeira.
- **Não há segunda aprovação para designações sensíveis.** O campo existe no
  desenho do escopo e não foi implementado; hoje toda designação dentro do
  escopo vale com uma assinatura só.
- **O dado gerencial ainda não é lido.** Quantas vezes uma unidade pediu apoio,
  de onde veio, em que horários — o registro já existe e ninguém agrega. É
  provavelmente o subproduto mais valioso disto, e está no backlog.
