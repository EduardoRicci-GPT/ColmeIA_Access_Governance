# ADR-0029 — Sinal não é significado: a correspondência canal–recurso é verificável e versionada

**Estado:** aceito
**Data:** 2026-10-11
**Sucede:** ADR-0004 (confiança e honestidade)
**Relacionado:** ADR-0002 (quatro motores), ADR-0011 (auditoria e cadeia), D-052 do consolidado de 10/10/2026

## Contexto

A reconciliação física deste produto repousa numa pressuposição que nunca foi
escrita: que o endpoint `ep-uti-3` corresponde à porta da UTI 3.

Essa correspondência não é um fato do sistema. É uma linha de configuração que
alguém digitou numa instalação, provavelmente às pressas, provavelmente a partir
de uma planilha do integrador, e que ninguém conferiu caminhando até a porta.
Entre o identificador que o produto comanda e a folha de madeira que se abre há
uma cadeia inteira — controlador, número do relé, fiação, fechadura — e cada
degrau dela é um lugar onde "relé 2" pode significar outra coisa.

A consequência não é que o comando falha. É pior: **o comando funciona.** A
nuvem aceita, o controlador atua, o evento de confirmação volta, a trilha
registra "revogação confirmada no equipamento" — e a porta que trancou foi a do
depósito ao lado.

Esse é o modo de falha mais perigoso de um sistema de controle de acesso
multimarcas, porque ele não aparece em painel nenhum: o produto inteiro, com
suas quatro camadas de estado e sua cadeia encadeada por hash, passa a produzir
evidência honesta sobre o objeto errado. Tudo verde, e tudo verde sobre outra
porta.

## Decisão

**A correspondência entre o canal comandado e o recurso nomeado é um objeto do
domínio, com estado, procedência e versão.**

`dominio/vinculo-semantico.ts` declara `VinculoSemanticoFisico` ligando
`endpointId` + `capacidade` a um `CanalFisico` (controlador, espécie, índice),
em quatro estados:

- `VERIFICADO` — alguém esteve na porta, acionou e viu abrir, com data, nome e
  evidência;
- `DECLARADO` — alguém digitou a correspondência. É o estado em que toda
  instalação nasce, e é honesto dizer que é isso;
- `DIVERGENTE` — a conferência apontou outra porta, ou a versão avançou depois
  dela;
- `NAO_VERIFICADO` — o canal é comandado e ninguém disse a que corresponde.

E o motor físico ganha um **teto de confiança**: a evidência do fabricante é
sobre o CANAL, e nenhuma leitura pode valer mais do que a correspondência entre
o canal e a porta cujo nome está na tela. Vínculo verificado permite
`CONFIRMED`; declarado limita a `PROBABLE`; divergente e não verificado limitam
a `UNKNOWN`.

**A versão é o que faz isto funcionar na prática.** Painéis de controle de
acesso são remexidos: troca de fechadura, obra na ala, manutenção que
reaproveita um relé livre. A verificação de junho não vale para a fiação de
outubro. `reavaliarVinculo` compara a versão da verificação com a corrente na
LEITURA, e não na escrita — de modo que um vínculo cuja versão avançou volte
sozinho para `DIVERGENTE`, sem ninguém ter de lembrar de invalidá-lo.

## Consequências

- O motor físico ganha uma guarda própria, a quarta das seis, e a posição dela é
  argumentada: **depois** das duas de divergência, porque uma revogação que não
  chegou é urgência maior que uma correspondência não conferida; e **antes** da
  coerência obsoleta, porque "falta conferir a porta" e "falta confirmação
  recente" são achados diferentes e vão para filas diferentes.
- A guarda devolve `DEVICE_SYNC_UNKNOWN`, e não o estado exigido: afirmar o
  estado exigido seria dizer que a porta está como se quer, quando o que se sabe
  é que o CANAL está como se quer.
- `NaturezaDeDivergencia` ganha `VINCULO_SEMANTICO_NAO_VERIFICADO`, e ela escala
  com a criticidade: comandar o canal errado numa sala administrativa é chamado
  de manutenção; na rede de gases medicinais é evento de conformidade.
- O Health Score ganha `VINCULOS_SEMANTICOS`, com peso 2. O que esse peso cobra
  não é risco de porta aberta — é a **confiabilidade da evidência** sobre um
  conjunto de portas. Um vínculo não verificado não deixa ninguém entrar
  indevidamente; ele faz a trilha afirmar coisas verdadeiras sobre o objeto
  errado, e um sistema cuja evidência não se ancora deixa de servir ao que
  existe para servir.
- O divergente pesa 1,5× o não verificado, porque são achados de naturezas
  diferentes: um é trabalho que ninguém fez, o outro é conferência que FOI feita
  e não bateu.
- Verificado sem registrar a versão cai para `DECLARADO`. Uma verificação que
  não se ancora numa versão não distingue a porta de hoje da porta de junho.
- `SemanticBindingVerified` entra na cadeia pelo corpo HUMANO: quem esteve na
  porta é uma pessoa, com nome e data. A divergência é leitura e cai no
  consultivo.

## Alternativas descartadas

- **Rebaixar a confiança por ausência de vínculo.** Teria sido o default
  pessimista coerente com o resto do produto, e está errado aqui: rebaixaria de
  uma vez toda leitura de toda instalação que ainda não cadastrou vínculos, e um
  painel que fica amarelo inteiro deixa de ser lido. A cobrança do levantamento
  acontece no score, com nome próprio, e não no rebaixamento silencioso de mil
  linhas.
- **Invalidar a verificação na escrita, quando a versão avança.** Exigiria que
  alguém lembrasse de propagar a invalidação — e o produto já tem seis
  ocorrências catalogadas de capacidades corretas que ninguém chamava.
- **Descobrir a correspondência automaticamente.** Não há como: a única prova é
  alguém acionar e ver a porta certa abrir.

## O que esta decisão NÃO resolve

- **A verificação é manual, e deve ser.** O produto não tem como conferir
  fiação; o que ele pode fazer é exigir que a conferência seja registrada e
  cobrar quando ela envelhece.
- **A versão da configuração é declarada pela instalação.** Se ninguém a avançar
  depois de uma obra, a verificação continuará parecendo válida. É a mesma
  dependência de cadastro que a escala de turno tem.
- **Uma capacidade por vínculo.** O ciclo consulta `REMOTE_REVOCATION`, que é a
  que ele comanda quando o risco é de porta aberta. Um endpoint cujo relé de
  destrava e de revogação sejam canais distintos exigiria consultar as duas, e
  nenhum cenário da bancada tem esse caso ainda.
