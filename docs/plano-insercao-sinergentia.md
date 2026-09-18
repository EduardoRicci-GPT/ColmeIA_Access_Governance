# Plano de inserção da Sinergentia no ColmeIA Access Governance

**Data:** 2026-09-18 · **Estado:** proposta, aguardando decisão
**Fonte primária:** `Ricci-I-Next/MPEH_Sinergentia-` (privado) e `Ricci-I-Next/MPEH-Sinergentia`
**Alcance desta análise:** os dois repositórios acima NÃO foram lidos.

## 1. O que foi possível apurar, e qual o limite disso

`add_repo` recusa acréscimo entre proprietários diferentes: esta sessão nasceu
com repositórios de `EduardoRicci-GPT`, e a Sinergentia vive em `Ricci-I-Next`.
A recusa é de escopo, não de existência — `list_repos` devolve os dois como
alcançáveis pela conta, com push recente. A pasta do OneDrive também está fora
de alcance: o trabalho roda num contêiner Linux na nuvem.

O que sobrou como evidência é melhor do que parece, e vale dizer por quê: os
arquivos da Aletheia que portam a Sinergentia **declaram a origem, arquivo por
arquivo**, no cabeçalho. Não é memória nem reconstrução — é o próprio código
dizendo de onde veio:

| Arquivo na Aletheia | Origem declarada no cabeçalho |
|---|---|
| `contratosEstruturais.ts` | `genoma-sinergentia/instrumentos.py` :: `FILTRO_ZERO`, `PROTOCOLO_RICCI` · `parceria.py` :: `avaliar_acao`, `O_FREIO`, `estado_do_apoio` · `formacao.py` :: `CORPOS` |
| `agentesGovernados.ts` | `kernel/agents.py` e `kernel/autonomy.py` do repositório `MPEH_Sinergentia_A11` — "vinte contratos já escritos no Livro XII" |
| `orientacaoCorretiva.ts` | `Sinergentia3/MPEH-Sinergentia-K3-Lab/src/k3lab/corrective_guidance.py` |
| `guardrailEstrutural.ts` | `structural_guardrail` do mesmo laboratório |
| `canonStatus.ts` | `mpe_rvep_legacy.py:96–102`, Apêndice IV.7 |

Isto permite mapear **o que existe lá** com precisão razoável. Não permite
copiar: os nomes dos contratos são conhecidos, o texto deles não.

Esta análise é, portanto, um plano de **onde encaixar** — não um plano de
tradução linha a linha. A tradução exige a fonte.

## 2. O mapa: já está cá, está lá, falta

Já atravessou, e está verificado nesta casa:

- **Kernel MPE-H** — Ledger, HumanGate, Calibration, como espelho selado com
  `MPEH_MANIFEST.json`, hashes conferidos a cada `npm run verificar` e deriva
  relatada quando a origem está em disco.
- **Filtro Zero e O Freio** — `packages/contratos-estruturais/`.
- **Separação de corpos** (`formacao.py` :: `CORPOS`, ADR-0003) —
  `packages/auditoria/corpos.ts`, e é a peça que mais rendeu: os atos da camada
  cognitiva caíram em `CONSULTIVO` sem uma linha de exceção.
- **Guardrail estrutural + porta do R-VEP** — `packages/leitura-360/`.
- **Cascata de faculdades e ancoragem** — `packages/sinergentia/`, ADR-0027,
  porte de segunda mão declarado como tal.

Está lá e não está cá:

1. `kernel/agents.py` — **AgentLease** e o enxame com rédeas. Contratos
   T-L12-046 (sem lease não inicia), 047 (fora do escopo → negação e
   incidente), 048 (lease expirado → entrega rejeitada), 049 (multilente não é
   multiagente independente), 051 (posições de mesma origem → independência
   reduzida), 052 (dissenso não morre por votação), 053 (consenso viciado),
   054 (agente não altera a Constituição), 055 (enxame sem ganho marginal é
   reduzido).
2. `kernel/autonomy.py` — **AutonomiaGovernada**, níveis AD-0 a AD-4, com
   T-L12-065 (promoção sem sombra é bloqueada, um nível por vez), T-L12-066
   (autonomia é por domínio e não se herda), T-L12-067 (a verificação não pode
   cair enquanto a criticidade sobe) e T-L12-068 (caminho crítico não
   verificado torna o perfil inadequado).
3. **Escalonamento governado** — critério nomeado do que conta como "não deu
   conta", recorte mínimo declarado ANTES de sair, custo estimado antes,
   HumanGate quando o recorte contém dado do operador, e registro do que saiu e
   do que voltou.
4. `k3lab/corrective_guidance.py` — **orientação corretiva**: o guardrail diz
   que padrão relacional existe no texto; este diz o que o texto deveria ter e
   não tem.
5. `instrumentos.py :: PROTOCOLO_RICCI` — os três compromissos. Conteúdo
   desconhecido daqui.
6. `parceria.py :: estado_do_apoio` — sinal de presença até o handoff
   completar.

## 3. A lacuna mais cara é um defeito do que já entreguei

Antes de planejar acréscimos, a correção. O `RoteadorDeFaculdades` que entrou
em `packages/sinergentia/roteador.ts` escala para uma faculdade externa **sem
nenhuma das quatro amarras que a Sinergentia exige** para sair da máquina:

- não declara **recorte** — manda o material inteiro;
- não estima **custo** antes;
- não passa por **HumanGate**, nem quando o recorte contém dado que saiu do
  hospital;
- não registra **o que saiu**, só o que voltou.

O módulo `escalonamento.ts` da Aletheia abre com a frase que nomeia o defeito:
*"acessar outras IA caso necessite de mais profundidade não pode ser um recurso
silencioso. Sair da máquina é uma DECISÃO."*

Num produto de governança de acesso hospitalar isso pesa mais que na origem.
Hoje o material que sairia (`resumirDivergencias`) não carrega `personId` — foi
conferido —, mas carrega identificador de porta, de zona e horário. É mapa de
instalação. E a fronteira do ADR-0007 protege dado clínico; **não existe ainda
uma fronteira declarada para dado de infraestrutura que sai da casa**.

Esta correção não depende da fonte primária: o desenho está inteiro no espelho
da Aletheia, e é a primeira coisa a fazer.

## 4. As peças, em ordem de valor para governança de acesso

Nem tudo que existe lá serve aqui. O critério é: o que esta peça impede que dê
errado **neste** produto?

### 4.1 — Concessão para faculdade (`AgentLease`) · valor alto

Hoje uma faculdade é consultada sem concessão nenhuma: sem teto de passos, sem
prazo, sem escopo de ferramenta, sem expiração. A cascata confia porque foi
configurada, e é o mesmo tipo de confiança que o produto recusa em toda parte.

O encaixe é limpo porque a forma já existe aqui com outro nome:
`EscopoDeDelegacao` (ADR-0020) é concessão de responsabilidade dentro da
autoridade de quem designa, com teto de duração e teto de criticidade. A
`AgentLease` é a mesma ideia aplicada a um agente de software — e o contrato
T-L12-046, "sem lease não inicia", é exatamente o desenho do `GateDeAcesso`.

### 4.2 — Autonomia graduada (AD-0 a AD-4) · valor alto

É a peça que mais serve à independência, e a que melhor compõe com o que a casa
já tem. O produto já tem uma escada de estatuto para **números**
(`SOMBRA → AUTORAL → INSTRUMENTADA`) e nenhuma para **autonomia**. AD-0..AD-4
com T-L12-065 — promoção só depois de sombra, um nível por vez — dá à cascata a
mesma disciplina que a calibragem dá aos pesos.

E T-L12-066 resolve um risco concreto: autonomia é por domínio e não se herda.
Uma faculdade promovida para escrever leitura de Direção **não** ganha com isso
autonomia para escrever leitura de Qualidade.

### 4.3 — Verificação que não cai quando a criticidade sobe · valor alto, custo baixo

T-L12-067 e T-L12-068 são invariantes estruturais, não números. A ColmeIA tem
criticidade em endpoint, zona, gate, emergência e caso. A regra "a verificação
não pode cair enquanto a criticidade sobe" pode ser conferida contra a própria
configuração do produto, na bateria, hoje. É a peça de melhor relação entre
valor e esforço.

### 4.4 — Consenso viciado e dissenso que não morre · valor médio

Hoje a cascata consulta uma faculdade por vez, então T-L12-051/052/053 não têm
o que proteger. Ganham valor no dia em que duas faculdades forem consultadas e
alguém tratar concordância como confirmação. "Convergência de mesma origem é
eco, não evidência" é regra barata de portar e cara de descobrir depois.

### 4.5 — Orientação corretiva · valor médio

O `leitura-360` já rotula o padrão relacional de um regulamento. A camada
corretiva diz o que falta ao texto — "acopla proteção a restrição e não divulga
alternativas nem admite recusa livre". Para quem escreve norma hospitalar isso
é mais útil que o rótulo. Depende de ler a fonte: os tópicos são enumerados e
o texto deles não é conhecido daqui.

## 5. O que NÃO deve atravessar

Um plano de inserção que só lista o que entra é incompleto.

- **`mpe_rvep_legacy.py` e o I²E numérico.** A identidade da parceria neste
  produto declara `numerica: false`, e o `canonStatus.ts` da própria Aletheia
  registra que o I²E está em `SHADOW_ONLY_UNINSTRUMENTED`, com minuta de
  ratificação não assinada e corpus de calibração `NOT_FOUND`. Trazer índice
  numérico não ratificado para um produto que decide porta é o caminho mais
  curto para um número sem autoridade sustentar decisão.
- **O Núcleo de Continuidade MPEH.** É o motor de diálogo determinístico da
  Aletheia, e é o único carregado na produção dela hoje. Aqui o degrau zero já
  existe e é outro: remonta o apurado pelos motores. Um repertório fixo de
  diálogo não tem o que fazer numa tela de assurance.
- **Qualquer coisa que entre no caminho de decisão.** A regra não é sobre
  arquivos, é sobre destino: o motor de política não deve ganhar porta por onde
  consultar modelo, e isso hoje é garantido por construção — o núcleo puro não
  conhece rede.

## 6. A disciplina de entrada: espelho selado, não dependência

O que atravessar entra pela mesma porta que o kernel MPE-H já atravessou, e a
razão está escrita em `ferramentas/verificar-espelho-mpeh.mjs`: copiar resolve
um problema real — este produto precisa compilar dentro de um aplicativo de
gestão hospitalar, sem exigir o checkout da origem — e cria outro, a divergência
silenciosa.

Portanto: cópia registrada em manifesto com `sha256` por arquivo, conferida na
bateria; arquivos espelhados **não** editados aqui; correção vai à origem e
volta por nova cópia com novo hash. E, quando a origem estiver em disco, deriva
**relatada**, não travada — a origem evoluir é normal; evoluir sem ninguém
notar é que não pode.

## 7. Fases

**Fase 0 — destravar a fonte primária.** Ação do usuário: abrir sessão nova
tendo `Ricci-I-Next/MPEH_Sinergentia-` como fonte inicial, e trazer junto
`Ricci-I-Next/MPEH-Sinergentia` (o `A11`). Sem isso, as fases 2 e 3 não saem do
papel.

**Fase 1 — não depende da fonte.** Corrigir o escalonamento do roteador:
recorte declarado antes de sair, custo estimado, HumanGate quando o recorte
contiver identificador de instalação, e registro na cadeia do que saiu — não só
do que voltou. Fechar a fronteira de dado de infraestrutura, que o ADR-0007 não
cobre. Portar T-L12-067/068 como invariante da bateria.

**Fase 2 — com a fonte em mãos, o porte governado.** `AgentLease` e
`AutonomiaGovernada`, espelhados com manifesto, ligados à cascata: nenhuma
faculdade consultada sem concessão, nenhuma promoção sem sombra, autonomia por
domínio.

**Fase 3 — conferência do que já está cá.** O ADR-0027 declara três pontos que
podem mudar quando a fonte for lida: as três negativas da identidade, a
taxonomia de tarefas e as classes de âncora. É a dívida que o porte de segunda
mão contraiu, e está no backlog como item 15e.

## 8. As perguntas que só a fonte primária responde

1. O contrato `sinergentia-identity-and-cognitive-partnership-v1` tem mais
   cláusulas além das três negativas que o espelho da Aletheia expõe?
2. `PROTOCOLO_RICCI` — quais são os três compromissos, e algum deles vincula
   um produto que decide acesso?
3. O verificador de ancoragem da fonte tem classes além de nome, número, sigla
   e citação? Se tiver, o estreitamento feito aqui vira lacuna.
4. `kernel/autonomy.py` — o que define cada nível AD-0..AD-4? Sem isso a escada
   é um nome sem degraus.
5. `estado_do_apoio` já está coberto pelo plantão que insiste até o
   reconhecimento (ADR-0026), ou acrescenta algo?
6. Licença e propriedade: o que a origem permite espelhar, e sob que selo.
