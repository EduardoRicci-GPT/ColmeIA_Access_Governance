# ADR-0033 — Identificador observado não é prova: a placa reconhecida adianta a conferência e não a substitui

**Estado:** aceito
**Data:** 2026-10-11
**Sucede:** ADR-0007 (projeção de atributos)
**Relacionado:** ADR-0008 (modo de decisão), ADR-0014 (o erro simétrico), D-014 e D-053 do consolidado de 10/10/2026

## Contexto

O produto já separa identidade de credencial e credencial de autorização desde o
D-014: `CredentialMethod` é método e não identidade, e o direito nasce de
política sobre vínculo, papel e contexto — nunca da posse de um crachá.

Falta a espécie que chega quando a portaria ganha câmera. Uma câmera de LPR lê
`ABC-1D23` no portão de serviço. Um reconhecimento facial devolve um rosto com
0,94 de confiança. Um leitor óptico decodifica o QR impresso na ordem de
serviço. Nenhum dos três é uma credencial apresentada: **ninguém apresentou
nada.** O sensor OBSERVOU, e observar é ato de terceiro sobre o qual o observado
não tem controle.

A diferença tem três degraus, e um sistema que trata o primeiro como o terceiro
abre o portão para qualquer placa clonada — e abre com registro impecável, dizendo
que o veículo autorizado entrou. Clonar uma placa custa menos que uma fechadura.

Há o erro simétrico, e ele é igualmente real (ADR-0014): negar manda o motorista
com a ordem de serviço na mão de volta ao telefone da portaria, onde nada fica
registrado e o portão abre do mesmo jeito.

## Decisão

**Os três degraus são objetos distintos, e a observação nunca alcança o
terceiro.**

`dominio/identificador.ts`:

| Degrau | Objeto | O que é |
|---|---|---|
| 1 | `IdentificadorObservado` | fato do sensor: `ABC-1***`, hora, sensor |
| 2 | `AfirmacaoDeIdentidade` | inferência: este identificador pertence a tal sujeito |
| 3 | `CredencialApresentada` + `VinculoDeCredencial` | prova: foi apresentada por quem a detém, e o vínculo foi estabelecido antes por quem tem alçada |

`avaliarProva` devolve três valores, e **a estrutura da função é a regra**: o
único ramo que alcança `PROVADA` exige credencial apresentada E vínculo de
credencial. Não há caminho em que uma observação, com qualquer confiança
declarada pelo sensor, chegue lá — e é por isso que a ordem dos testes na função
começa pela credencial, e não pelo sensor.

O valor do meio é o que o delta acrescenta. `APENAS_OBSERVADA` não é erro nem
recusa: é o estado honesto de um portão com câmera e sem credencial apresentada.
A política o trata como ausência de prova — `R-PROVA-DE-IDENTIFICADOR` produz
`REQUIRE_APPROVAL`, nunca `ALLOW` — e a operação o trata como fila que anda mais
rápido porque o sistema já sabe quem está chegando.

`provaSustentaDecisao` existe como função de uma linha, exportada de propósito:
é o ponto por onde o motor consome a leitura, e tê-la nomeada impede que algum
chamador escreva `prova !== 'NAO_PROVADA'` — que incluiria a observação e
desfaria o delta numa comparação distraída.

`oQueFaltaParaEntrar` existe pelo erro simétrico: a portaria recebe o que falta,
com a missão e a OS nomeadas, em vez de um "não autorizado".

## Consequências

- `confiancaDoSensor` é guardada como o fabricante a devolve e **não é usada como
  limiar de autorização**. Um produto que autorizasse acima de 0,9 estaria
  deixando o fabricante calibrar a porta, e o item 28 já decidiu que severidade
  não se terceiriza.
- `valorProjetado` é projeção — placa mascarada, hash, referência opaca —, nunca
  a imagem nem o template biométrico. Mesma disciplina que mantém diagnóstico
  fora do motor (ADR-0007).
- `afirmadaPor: 'SENSOR'` tem nome próprio: o sensor que decodifica a placa e
  consulta o cadastro sozinho está fazendo as duas coisas ao mesmo tempo, e
  registrar isso como `CADASTRO` esconderia que nenhum humano participou.
- Credencial apresentada **sem** vínculo de portador devolve `NAO_PROVADA`. Sem o
  vínculo, o que existe é um objeto que abre a porta — e um objeto não responde
  por nada.
- Vínculo de credencial diferente da apresentada devolve `NAO_PROVADA`: dois
  objetos com o mesmo nome na tela é o começo de uma investigação.
- `SujeitoVeiculo` cobre placa projetada, transportadora, vínculo do motorista,
  OS e missão — o pátio que um hospital move todo dia.
- `ObservedIdentifierRejectedAsProof` entra na cadeia. Sem esse elo, a trilha de
  um portão com câmera não distingue "ninguém chegou" de "chegou uma placa que o
  produto não aceitou como credencial".

## Alternativas descartadas

- **Autorizar acima de um limiar de confiança do sensor.** É o desenho corrente
  em produtos de LPR e é exatamente o que o delta nomeia: a confiança é sobre o
  reconhecimento do caractere, não sobre quem está dirigindo.
- **Negar quando só há observação.** Erro simétrico: empurra a decisão para o
  telefone, onde não há registro.
- **Tratar a observação como credencial de método novo.** Teria reaproveitado
  todo o maquinário existente e apagado a distinção: `CredentialMethod` é o que
  a pessoa apresenta, e ninguém apresenta uma placa.

## O que esta decisão NÃO resolve

- **`RESEARCH_REQUIRED`: LPR e reconhecimento facial reais.** Nada aqui fala com
  câmera. Integrar um exige avaliação de privacidade que não é decisão de
  software, e o produto não deve fingir que é.
- **`BiometricSubjectBinding` continua pendente** (D-015). O vínculo
  pseudonimizado entre template biométrico e sujeito não existe.
- **A corroboração é por janela de tempo.** Observação e apresentação a menos de
  cinco minutos corroboram; nada verifica que é o mesmo veículo no mesmo portão.
- **Nenhuma tela mostra o pátio.** O painel não tem seção de veículos,
  transportadoras ou ordens de serviço.
