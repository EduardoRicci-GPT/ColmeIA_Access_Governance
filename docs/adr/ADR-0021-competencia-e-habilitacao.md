# ADR-0021 — Competência não é papel, e a falha dela tem três direções

- **Estado:** aceito
- **Data:** 2026-09-17
- **Complementa:** ADR-0014 (o erro simétrico), ADR-0019 (segregação por atividade), ADR-0020 (responsabilidade temporária)
- **Fecha:** a lacuna que o ADR-0020 declarou em aberto

## Contexto

Este produto tratava competência como papel. `role-enfermagem-uti` respondia a
duas perguntas ao mesmo tempo: *"que função a instituição lhe atribuiu?"* e
*"o que esta pessoa está habilitada a fazer?"*.

São perguntas diferentes, e a confusão tinha consequência precisa: o motor
concederia acesso a quem tem o cargo e não tem a habilitação vigente. Na
farmácia e na UTI, isso é a diferença entre estar lotado e poder exercer.

Três propriedades separam as duas, e nenhuma é detalhe:

**Competência vence.** Registro em conselho tem anuidade; ACLS vale dois anos;
NR-32 exige reciclagem. Papel não expira — enquanto ninguém mexer no cadastro,
ele é o que é. Competência muda de estado sozinha, com o tempo, exatamente como
a vigência de uma aprovação (ADR-0016).

**Quem emite não é o hospital.** COREN, CRM e CRF não são departamentos da
instituição. O hospital é leitor da competência, não autor — e por isso ela
chega pela porta do host e carrega procedência, como todo número deste produto.

**Ela é suspensa por fora.** Um profissional pode estar ativo no RH e suspenso
pelo conselho. Nenhuma autoridade da instalação revoga essa suspensão.

## Decisão

### 1. Três falhas, três direções de efeito

A tentação é tratar toda falha de competência como negativa. Seria simples, e
reintroduziria o erro simétrico que o ADR-0014 nomeou: numa madrugada, a
anuidade atrasada de um enfermeiro fecharia a UTI para a única pessoa presente,
e o custo do rigor recairia sobre o paciente, não sobre quem esqueceu de
renovar.

| Estado | Efeito | Por quê |
|---|---|---|
| **SUSPENSA** | `DENY`, entre os bloqueios estruturais | Decisão de autoridade externa. O que falta não é permissão, é qualificação — e permissão é a única coisa que uma alçada interna sabe conceder. |
| **VENCIDA** | `REQUIRE_APPROVAL` | Alguém com alçada decide se o plantão segue, e o registro fica. Fechar sozinho põe o custo no lugar errado. |
| **NÃO DECLARADA** | `REQUIRE_APPROVAL` | Ausência de evidência nunca autoriza — e também nunca condena sozinha. |

A suspensão é a única que fecha porta sem pedir opinião, e isso é deliberado:
ela é o único caso em que a negativa não vem daqui.

### 2. Exigência ausente não é evidência ausente

Quando a instalação **não declarou** exigência para a zona, competência não se
aplica — nem como falha, nem como pendência.

A distinção parece sutil e decide o comportamento no pior dia: tratar as duas
igual faria toda porta do hospital fechar no momento em que a integração com o
conselho ficasse muda, que é precisamente quando menos se pode fechá-las. É a
mesma disciplina que separa `DEVICE_SYNC_UNKNOWN` de `DEVICE_REVOCATION_CONFIRMED`
(ADR-0004): não saber é um estado, e não o pior estado.

### 3. O motor recebe leitura projetada, nunca a carteira profissional

`LeituraDeCompetencia` carrega atende, suspensa e o que falta. Não carrega
número de registro, emissor nem data de verificação — quem precisa do detalhe é
a tela de quem vai resolver, e ela busca na fonte.

A habilitação guarda `referenciaDoRegistro`, referência opaca, nunca o número
no conselho: é dado pessoal que este produto não precisa para decidir acesso, e
a mesma fronteira que mantém diagnóstico fora do motor (ADR-0007) mantém a
carteira profissional fora dele.

### 4. A designação de responsabilidade passa a conferir, com uma assimetria

O ADR-0020 aceitou a palavra do host sobre competência, porque competência não
existia como objeto. Agora existe, e o registro confere — **exceto** que um
`INSUFICIENTE` afirmado por quem pede nunca é relaxado pela leitura.

Quem está na operação pode saber de uma suspensão que ainda não chegou ao nosso
registro, e usar o cadastro para desautorizar a pessoa mais próxima do fato
seria confiar na cópia contra a fonte.

Suspensão recusa a designação. Vencida e não declarada não recusam: a
designação vale, e a porta continua pedindo revisão humana. **Designar apoio e
abrir a porta são dois atos**, e é bom que sejam.

## Consequências

- A bateria vai de 554 para **574 verificações**; os cenários hospitalares vão
  de 97 para 120, com C1–C4 somando-se a H7–H11 e E1–E4.
- Cinco verificações existentes falharam na integração, e falharam **certo**:
  a pessoa designada para apoiar a UTI não tinha registro de enfermagem, e o
  motor segurou a porta. Os testes foram corrigidos; a implementação, não.
- `C1` prova a assimetria inteira: o conselho suspende, o direito é revogado, o
  equipamento confirma — e **não** vira pendência de aprovação, porque não há a
  quem recorrer.
- `C4` prova a composição das duas metades da formulação que a pesquisa
  alcançou: o supervisor designa apoio legítimo, e a porta da UTI continua
  fechada porque designar responsabilidade não cria competência.
- `MundoLogico` ganha `competencias`, ausente por omissão. Sem a porta ligada,
  nenhuma exigência existe e nada muda.

## O que esta decisão NÃO resolve

- **Ninguém renova nada por aqui.** O produto lê habilitação; quem emite,
  suspende e renova é o conselho, e a integração com ele não existe. Hoje o
  host declara, e a data de verificação fica registrada para que ninguém
  confunda leitura velha com fato atual.
- **A exigência é por zona, não por atividade.** A farmácia exige NR-32 para
  qualquer porta dela, e o desenho mais fino — exigir competência pela
  atividade que a pessoa exerce naquele domínio, ligando isto à matriz de
  segregação (ADR-0019) — está no backlog.
- **Não há tela.** A fila de aprovação já mostra a razão, que nomeia a
  competência faltante, mas não existe visão de quem está prestes a vencer. É
  o mesmo defeito que o ADR-0017 corrigiu para a vigência da aprovação, e que
  aqui ainda não foi corrigido.
- **As exigências não foram ratificadas por instalação nenhuma.** A da UTI
  aponta a Lei 7.498/1986; a da farmácia é prática de controle interno
  derivada da NR-32, e a ressalva diz isso.
