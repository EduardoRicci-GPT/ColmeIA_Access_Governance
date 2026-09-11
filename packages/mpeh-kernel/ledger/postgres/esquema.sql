-- ---------------------------------------------------------------------------
-- LEDGER EM POSTGRES — onde a imutabilidade deixa de ser convenção
--
-- ESTADO: NÃO EXECUTADO. Não há Postgres, docker nem driver `pg` na máquina em
-- que este arquivo foi escrito (04/09/2026). Ele é a especificação do que o
-- adaptador terá de satisfazer, e não uma migração testada. Tratá-lo como
-- pronto seria repetir o defeito que a Onda 9 encontrou no Prumo do aplicativo:
-- parecia cadeia de evidência e não era.
--
-- A VERIFICAÇÃO ESTÁ DEFINIDA E ESPERANDO
--
-- `packages/mpeh-kernel/ledger/conformidade.ts` já roda contra memória e
-- localStorage, com 63 checagens verdes. O adaptador de Postgres é conforme
-- quando passar NA MESMA suíte, sem que ela seja afrouxada para ele.
--
-- POR QUE ISTO É O ITEM DE MAIOR CONSEQUÊNCIA DA EXTRAÇÃO
--
-- Na Aletheia, append-only é propriedade do código: o serviço não expõe
-- `remover`, e um gate confere isso por reflexão. É garantia que cai no dia em
-- que alguém escrever o método — ou usar o ORM direto.
--
-- O guia de integração exige a garantia do banco, com a frase "a imutabilidade
-- é do banco, não do ORM". A diferença importa num produto de regulação médica:
-- uma trilha que a aplicação pode reescrever não é trilha de auditoria.
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. A tabela
--
-- `tenant_id` é obrigatório por INV-INT-1 do guia: nenhum schema do MPE-H
-- existe sem tenant. A sequência é contígua POR ledger, não global.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_records (
  tenant_id         text        NOT NULL,
  ledger_id         text        NOT NULL,
  sequencia         bigint      NOT NULL,
  id                text        NOT NULL,
  tipo              text        NOT NULL,
  objeto            text        NOT NULL,
  decisao           text        NOT NULL,
  autor             text        NOT NULL,
  corpo             text        NOT NULL,
  detalhes          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  registrado_em     timestamptz NOT NULL,
  prior_event_hash  text        NOT NULL,
  this_event_hash   text        NOT NULL,

  -- É esta restrição que faz o papel do `SequenciaJaExiste` do kernel. Duas
  -- escritas concorrentes montam a mesma sequência; o banco aceita uma. A
  -- perdedora relê o topo e tenta de novo — o registro atrasa, não some.
  CONSTRAINT ledger_records_pk PRIMARY KEY (tenant_id, ledger_id, sequencia),

  CONSTRAINT ledger_corpo_valido
    CHECK (corpo IN ('DIRETIVO', 'CONSULTIVO', 'EXECUTIVO', 'HUMANO')),

  -- Hash é SHA-256 em hexadecimal minúsculo. A gênese, e só ela, tem elo
  -- anterior vazio.
  CONSTRAINT ledger_hash_valido
    CHECK (this_event_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ledger_elo_anterior_valido
    CHECK (
      (sequencia = 0 AND prior_event_hash = '')
      OR (sequencia > 0 AND prior_event_hash ~ '^[0-9a-f]{64}$')
    )
);

-- ---------------------------------------------------------------------------
-- 2. Sem lacuna, e sem elo pendurado no vazio
--
-- A verificação do kernel apanha lacuna na LEITURA. Aqui ela é impedida na
-- ESCRITA: um evento cuja sequência não seja topo+1, ou cujo elo anterior não
-- seja o hash do topo, é recusado antes de existir.
--
-- Repare que isto torna impossível o ataque "elo anexado com elo anterior
-- inventado" que a suíte exercita — no Postgres ele não chega a ser gravado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ledger_recusa_elo_invalido()
RETURNS trigger AS $$
DECLARE
  topo_sequencia bigint;
  topo_hash      text;
BEGIN
  SELECT sequencia, this_event_hash
    INTO topo_sequencia, topo_hash
    FROM ledger_records
   WHERE tenant_id = NEW.tenant_id
     AND ledger_id = NEW.ledger_id
   ORDER BY sequencia DESC
   LIMIT 1;

  IF topo_sequencia IS NULL THEN
    IF NEW.sequencia <> 0 THEN
      RAISE EXCEPTION 'ledger %/%: primeira sequência deve ser 0, veio %',
        NEW.tenant_id, NEW.ledger_id, NEW.sequencia;
    END IF;
    IF NEW.prior_event_hash <> '' THEN
      RAISE EXCEPTION 'ledger %/%: gênese não pode ter elo anterior',
        NEW.tenant_id, NEW.ledger_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.sequencia <> topo_sequencia + 1 THEN
    RAISE EXCEPTION 'ledger %/%: lacuna de sequência — esperada %, veio %',
      NEW.tenant_id, NEW.ledger_id, topo_sequencia + 1, NEW.sequencia;
  END IF;

  IF NEW.prior_event_hash <> topo_hash THEN
    RAISE EXCEPTION 'ledger %/%: elo anterior não corresponde ao topo',
      NEW.tenant_id, NEW.ledger_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_recusa_elo_invalido_trg ON ledger_records;
CREATE TRIGGER ledger_recusa_elo_invalido_trg
  BEFORE INSERT ON ledger_records
  FOR EACH ROW EXECUTE FUNCTION ledger_recusa_elo_invalido();

-- ---------------------------------------------------------------------------
-- 3. A parte que não é opcional
--
-- Sem isto, tudo acima é decoração: a aplicação ainda poderia editar a decisão
-- registrada e manter os hashes, e a trilha viraria ficção editável.
--
-- `app_role` é o papel que a aplicação usa. Ele INSERE e SELECIONA, e não tem
-- como atualizar nem apagar. Migrações usam outro papel, e cada uso dele é um
-- ato administrativo registrado fora daqui.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_records FROM PUBLIC;
-- DESCOMENTE ajustando o nome do papel da aplicação:
-- REVOKE UPDATE, DELETE, TRUNCATE ON ledger_records FROM app_role;
-- GRANT  SELECT, INSERT              ON ledger_records TO   app_role;

-- Rejeita UPDATE e DELETE mesmo para papel privilegiado que esqueça o REVOKE.
-- Defesa em profundidade: o REVOKE é a regra, isto é a rede embaixo dela.
CREATE OR REPLACE FUNCTION ledger_e_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_records é append-only: % recusado', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_append_only_trg ON ledger_records;
CREATE TRIGGER ledger_append_only_trg
  BEFORE UPDATE OR DELETE ON ledger_records
  FOR EACH ROW EXECUTE FUNCTION ledger_e_append_only();

COMMIT;

-- ---------------------------------------------------------------------------
-- O QUE FALTA PROVAR, QUANDO HOUVER BANCO
--
--   1. A suíte de conformidade passa contra este esquema, sem afrouxamento.
--      O alvo NÃO deve declarar `adulterar` — se a aplicação conseguir
--      adulterar, o REVOKE não está valendo, e é isso que se quer descobrir.
--   2. As 20 escritas simultâneas da suíte produzem 20 elos contíguos com
--      conexões distintas, e não numa só — concorrência de verdade.
--   3. UPDATE e DELETE diretos falham com o papel da aplicação.
--   4. O hash recomputado em SQL (pgcrypto, digest(..., 'sha256')) confere com
--      o do kernel para o mesmo conteúdo canônico. Se divergir, a cadeia só é
--      verificável por nós — e cadeia que só o autor verifica não é evidência.
-- ---------------------------------------------------------------------------
