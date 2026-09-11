# ControlIDAdapter

| | |
|---|---|
| **Status de integração** | `INTERFACE_READY` → bloqueado em `RESEARCH_REQUIRED` no modo online |
| **Caminho** | `colmeia-acesso/packages/adapters/control-id/` |
| **Prioridade** | alta — igual à do TTLock |
| **Conformidade v2** | passa, **recusando** todas as operações de hardware |

## Por que a mesma prioridade do TTLock

Por uma razão de mercado, não de engenharia: é este fabricante que valida o
cenário institucional brasileiro — catraca de portaria, leitor de setor,
biometria em área restrita. É o equipamento que um hospital brasileiro **já tem
instalado** quando a ColmeIA chega. Integrar bem aqui é a diferença entre
substituir um sistema e conviver com ele.

## O que este adaptador obriga a arquitetura a ter

Dois modos de operação que a TTLock não tem:

**Standalone** — o equipamento decide sozinho, com a base local.
**Online** — o equipamento consulta um servidor no instante em que a pessoa se
apresenta (item 16).

Os dois produzem o mesmo evento físico — porta aberta — e responsáveis
completamente diferentes pela decisão. Um sistema de governança que não registre
essa diferença consegue dizer que a porta abriu e **não** consegue dizer quem
autorizou. Numa auditoria hospitalar, é a segunda pergunta que importa.

Daí `decisionOrigin` (`DEVICE_LOCAL` · `COLMEIA_POLICY_ENGINE` ·
`PROVIDER_CLOUD` · `MANUAL_OPERATOR`) ser campo de primeira classe do evento de
domínio, e não metadado.

## O terceiro caso, que não é óbvio

Modo online + decisão local **por timeout**. Não é `DEVICE_LOCAL` puro nem
`COLMEIA_POLICY_ENGINE`: é uma decisão local que o sistema PEDIU e não conseguiu
atender.

Registrar como `DEVICE_LOCAL` esconderia a falha da ColmeIA dentro do registro
do equipamento. Registrar como ColmeIA esconderia que a política não foi
aplicada. Por isso existe `decisaoLocalPorFalhaDaColmeia()`: a contagem desses
eventos é indicador de assurance, e não ruído de log.

O comportamento padrão declarado em `PERFIL_PADRAO` é
`comportamentoNoTimeout: 'FALLBACK_LOCAL'` — escolha legítima (uma catraca que
trava em pane paralisa um pronto-socorro) que precisa ser declarada, porque
significa que a base local pode conter a credencial recém-revogada.

## Fluxo do modo online (implementado no Mock, não no fabricante)

```
pessoa apresenta credencial
  → equipamento envia evento
  → ColmeIA recebe
  → Policy Engine avalia em modo ACCESS (a escala DECIDE aqui)
  → ALLOW / DENY
  → resposta ao equipamento
  → evento físico confirmado, com decisionOrigin registrado
```

## Pendências de pesquisa

1. Protocolo e formato do modo online (requisição do equipamento ao servidor).
2. A base local pode ser lida integralmente, para reconciliação física?
3. O equipamento informa quando decidiu localmente por timeout?
4. Limites de usuários e de regras de acesso por equipamento.
5. Formato da credencial biométrica — o template sai do equipamento?

A pergunta 2 é a que mais importa para este produto: sem leitura da base local,
a única evidência de estado físico é o fluxo de eventos, e evento perdido vira
incerteza permanente.

A pergunta 5 tem implicação de privacidade, não só técnica: template biométrico
que sai do equipamento vira dado biométrico sob custódia do sistema, com todo o
regime que isso implica. A arquitetura prefere que **não** saia — a biometria é
método de credencial (item 23), e o direito não depende dela.
