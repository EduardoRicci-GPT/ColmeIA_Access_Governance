# ADR-0032 — Visibilidade não é autoridade: a federação separa o contrato comercial do domínio institucional

**Estado:** aceito
**Data:** 2026-10-11
**Sucede:** ADR-0001 (raiz do produto), ADR-0009 (aprovação humana)
**Relacionado:** ADR-0003 (separação de autoridade), ADR-0020 (responsabilidade temporária), D-016 e D-057 do consolidado de 10/10/2026

## Contexto

A hierarquia deste produto vai de `ORGANIZATION` a `ENDPOINT`, e é uma hierarquia
de LUGARES. Funciona para o Health Score, que sobe somando fatos sobre portas.

Quem opera a ColmeIA em escala não é um hospital. É uma integradora com trinta
clientes, ou uma rede com doze unidades sob um CNPJ e quatro sob outro, ou um
hospital que terceirizou a manutenção das fechaduras. A hierarquia de lugares
não descreve nenhuma dessas relações, e a tentação é esticá-la: criar um nó acima
da organização para a integradora, e deixar a autoridade subir por ele como o
score sobe.

Esticar a hierarquia assim produz o pior defeito que um produto multicliente pode
ter: **o administrador da integradora passa a poder aprovar acesso ao cofre de
psicotrópicos de um hospital que ele nunca visitou**, porque o nó dele é pai do
nó do hospital. Não é escalada de privilégio por bug — é escalada por desenho, e
nenhum teste de permissão a pega, porque o sistema está funcionando como foi
modelado.

Há um segundo caso, mais sutil. A mesma pessoa trabalha em dois hospitais da
mesma rede. Identidade federada resolve o login — ela entra com uma credencial
só, e isso é bom. O que não pode acontecer é o direito atravessar junto: ser
enfermeira-chefe no Hospital A não torna ninguém enfermeira-chefe no Hospital B.

O D-016 do ledger já dizia isso em 17/09 e estava `PENDENTE`.

## Decisão

**Visibilidade comercial e autoridade institucional são dois eixos
independentes, e a independência é estrutural.**

`governanca/federacao.ts`:

- **`Tenant`** é quem paga, administra frota e abre chamado. O campo chama-se
  `organizacoesAtendidas` — uma lista de quem ele ATENDE, não de quem ele
  comanda. `visibilidadeDe` devolve as faixas que ele pode ver
  (`INVENTARIO_E_SAUDE`, `EVENTOS_TECNICOS`, `CHAMADOS_E_SINCRONIZACAO`), e
  **nenhuma faixa inclui decisão**.
- **`DominioDeAutoridade`** pertence a uma organização assistencial. A ausência
  de `tenantId` nessa interface é literal e deliberada: acrescentá-lo seria o
  primeiro passo para a herança indevida voltar.
- **`DelegacaoDeAutoridade`** é o único caminho pelo qual autoridade se move, com
  cinco campos que nenhuma delegação implícita teria: de onde vem, para quem, com
  que escopo, por quanto tempo, e quem assinou. A ausência de qualquer um deles é
  o que distingue delegação de vazamento.

E a defesa principal: **`autoridadeEfetiva` não recebe o tenant.** Não é uma
verificação que alguém poderia esquecer de fazer — é uma informação que a função
não tem. O mesmo vale para `podeDecidirNaOrganizacao`: não há como um chamador
passar a credencial comercial e obter autorização institucional, porque o
parâmetro não existe.

Três propriedades que os testes guardam:

1. a árvore comercial não influencia o resultado, porque não entra;
2. o cálculo é POR organização — papéis de outra não são unidos, nem quando o
   `relationshipId` é o mesmo;
3. delegação vencida não conta, e delegação de papel que o domínio de origem não
   possui também não: ninguém delega o que não tem.

## Consequências

- `visibilidadeDe` devolve a **ressalva junto da lista**, no tipo de retorno. Uma
  função que devolvesse só a lista permitiria exibir "integradora X: 30
  hospitais" sem dizer o que aquilo significa — e é dessa omissão que nasce a
  expectativa de que visibilidade implique comando.
- `vazamentoDeVisibilidade` existe para que o invariante seja verificável em
  produção, e não só em teste: devolve as organizações que o tenant vê e não
  deveria, sempre vazio num sistema correto.
- A `MesaDeIntervencao` (ADR-0031) consome a conferência federada e tem motivo de
  recusa próprio, `AUTORIDADE_NAO_FEDERADA`. Não é reaproveitamento de
  `SEM_ALCADA`: as duas recusas exigem providências opostas — a primeira sobe o
  caso para quem decide mais alto, a segunda diz que o caso está na mesa errada,
  e subir não resolve.
- `PedidoDeIntervencao` ganha `organizationId`. Parecia campo redundante até o
  delta mostrar que não é: sem a organização no pedido, a conferência não tem
  contra o que conferir.
- O vínculo do aprovador viaja separado do identificador que assinou, porque são
  coisas diferentes: o aprovador é a identidade, o vínculo é o que carrega papel
  numa organização, e a mesma identidade pode ter vínculo em duas.
- `FederatedAuthorityDenied` entra na cadeia pelo corpo DIRETIVO: recusar
  herança de autoridade é decisão sobre quem manda, não medição de nada. Num
  sistema multicliente, a pergunta da auditoria é "o administrador da integradora
  chegou a decidir algo aqui?", e a resposta só existe se a recusa tiver sido
  registrada.

## Alternativas descartadas

- **Um nível `TENANT` acima de `ORGANIZATION` na hierarquia de lugares.** É a
  alternativa óbvia e é o defeito: faria a autoridade subir pela árvore
  comercial do mesmo jeito que o score sobe pela árvore física.
- **Verificar o tenant dentro de `autoridadeEfetiva`.** Teria funcionado
  enquanto ninguém esquecesse. Não receber o parâmetro é mais forte do que
  verificá-lo.
- **Unir papéis de todas as organizações de uma identidade federada.** Resolveria
  o login e quebraria o isolamento: é exatamente o segundo caso do contexto.
- **Delegação por pessoa, e não por vínculo.** O produto decidiu desde o
  ADR-0001 que o acesso deriva do vínculo, não da pessoa. Delegar para a pessoa
  reintroduziria aqui a confusão que o domínio já tinha resolvido.

## O que esta decisão NÃO resolve

- **O isolamento de dados não é imposto por infraestrutura.** `visibilidadeDe`
  diz o que o tenant PODE ver; nada impede uma consulta mal escrita de ler além.
  Isolamento real exige persistência com escopo — e a persistência é o item 1 do
  backlog.
- **Não há autenticação de tenant.** Quem afirma ser a integradora é o host; este
  módulo confia no que recebe, como confia na `AutoridadeDoHost`.
- **A delegação não tem fila nem aviso.** Uma delegação que vence no meio do
  plantão seguinte cai em silêncio, e o produto já resolveu esse problema uma vez
  para as aprovações (ADR-0016, ADR-0018). Repeti-lo aqui é trabalho pendente, e
  é a oitava aparição possível do D-022 — declarada agora, para que seja cobrada
  depois.
- **Nenhuma tela mostra a federação.** O painel Access Assurance não tem seção de
  tenant, visibilidade ou delegação.
