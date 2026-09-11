# Contrato da porta do Ledger

O que **qualquer** substrato precisa garantir para servir ao Ledger do kernel MPE-H.

Não é documentação descritiva: é o enunciado da suíte executável em
`conformidade.ts`. Um adaptador é conforme quando passa nela — não quando o
autor acha que passa.

## Estado em 04/09/2026

| Substrato | Conformidade | Onde roda |
|---|---|---|
| memória | **63 checagens verdes** | `npm run verificar` |
| `localStorage` (Aletheia) | **63 checagens verdes** | `npm run verificar` |
| Postgres | **não executado** | falta banco na máquina |

O esquema Postgres está escrito em `postgres/esquema.sql` e **não foi rodado
uma única vez**. Está declarado como especificação, não como migração pronta.

## As cinco obrigações

### 1. Append-only na superfície

O armazenamento não expõe `remover`, `atualizar`, `editar`, `limpar` nem
equivalente. O que o kernel não sabe pedir, o adaptador não precisa oferecer —
a ausência é a interface.

A suíte confere isso por reflexão sobre o protótipo e as chaves próprias.

### 2. Recusa de sequência repetida

`anexar` **deve** lançar `SequenciaJaExiste` quando já houver evento naquela
sequência.

É a obrigação mais importante do contrato, e a menos óbvia. Sem ela, duas
escritas concorrentes montam a mesma sequência e uma sobrescreve a outra em
silêncio. Foi exatamente o que aconteceu na Aletheia antes da Onda 11: numa
reprodução com 20 registros simultâneos, **19 desapareceram e a cadeia restante
ainda se declarava íntegra**.

Registro que some é ruim. Registro que some sem que a verificação perceba
transforma a cadeia em mentira por omissão, o que é pior do que não ter cadeia.

No Postgres essa recusa vem de `PRIMARY KEY (tenant_id, ledger_id, sequencia)`
— não é código do adaptador, é o banco.

### 3. Exclusão mútua real

`emExclusaoMutua` serializa escritas concorrentes no mesmo ledger. O kernel
**não escolhe o mecanismo** e exige o efeito:

- memória: fila em processo
- `localStorage`: `navigator.locks` entre abas, com fila em processo como piso
- Postgres: transação; a serialização é do banco

A suíte dispara 20 escritas simultâneas e exige 20 elos com sequências
contíguas de 0 a 19.

### 4. Leitura em ordem, sem alias

`ler()` devolve a cadeia em ordem de sequência. Deve devolver **cópias**: quem
lê não pode alterar a cadeia por referência.

### 5. Imutabilidade do substrato — a que separa os brinquedos

O adaptador de produção **não deve conseguir** reescrever a cadeia por fora.

A suíte trata isso de frente. O alvo declara `adulterar` apenas se conseguir
escrever por fora; nesse caso os quatro ataques são exercitados (conteúdo
editado, elo religado, elo removido do meio, elo forjado no fim). Se o alvo
**não** declara `adulterar`, a suíte registra `PULADA — o alvo não permite
escrever por fora` e segue.

Isso é deliberado: a ausência da porta de adulteração é o comportamento
desejado num substrato de produção, e pular por essa razão é resultado, não
lacuna. O que a suíte nunca faz é omitir que pulou.

**Memória e `localStorage` falham este critério por natureza** — qualquer pessoa
sentada no navegador reescreve o `localStorage`. É por isso que a cadeia da
Aletheia detecta adulteração em vez de impedi-la, e é por isso que o guia de
integração exige Postgres com `REVOKE UPDATE, DELETE`. A diferença entre
detectar e impedir é a diferença entre uma trilha que testemunha e uma trilha
que a aplicação pode reescrever.

## Reprodutibilidade por terceiro

A suíte serializa a cadeia, verifica fora do ledger que a produziu, e exige o
mesmo veredito.

Uma cadeia que só o próprio sistema sabe conferir não é evidência. Por isso o
conteúdo canônico está fixado em ordem explícita em `cadeia.ts`, e não deixado
a cargo da ordem de construção dos objetos — e por isso o item 4 do "falta
provar" do esquema SQL exige que o hash recomputado em `pgcrypto` confira com o
do kernel.

## Como submeter um adaptador novo

```ts
await verificarConformidade({
  nome: 'postgres',
  criar: () => new ArmazenamentoPostgres(pool, { tenant, ledger: crypto.randomUUID() })
  // sem `adulterar`: se a aplicação conseguir reescrever, o REVOKE não está valendo
});
```

Se passar sem afrouxar a suíte, é conforme pela mesma régua dos outros dois.
