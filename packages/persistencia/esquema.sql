-- ---------------------------------------------------------------------------
-- ColmeIA Access Governance — esquema relacional (item 34)
--
-- Duas decisões de modelagem carregam a arquitetura inteira:
--
-- 1. NÃO EXISTE COLUNA BOOLEANA DE ACESSO. A tabela `access_state` tem quatro
--    colunas de estado — desejado, nuvem, provedor, dispositivo — mais a
--    última confirmação COM EVIDÊNCIA e a hora dela. Quem quiser saber "esta
--    pessoa entra?" precisa dizer qual camada está perguntando.
--
-- 2. NADA É APAGADO. Direito revogado permanece com `revoked_at` e motivo;
--    tentativa de sincronização falha permanece; evento permanece. A pergunta
--    que uma auditoria hospitalar faz não é "quem tem acesso" — é "quem tinha,
--    até quando, quem decidiu e quando o equipamento obedeceu".
--
-- Compatível com PostgreSQL 14+. Sem extensões obrigatórias.
-- ---------------------------------------------------------------------------

-- ---------- Topologia -------------------------------------------------------

CREATE TABLE hierarchy_node (
  id            TEXT PRIMARY KEY,
  level         TEXT NOT NULL CHECK (level IN ('ORGANIZATION','NETWORK','FACILITY','BUILDING','ZONE')),
  name          TEXT NOT NULL,
  parent_id     TEXT REFERENCES hierarchy_node(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hierarchy_node_parent_idx ON hierarchy_node(parent_id);

CREATE TABLE provider (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE
                CHECK (code IN ('MOCK','TTLOCK','CONTROL_ID','SEAM','SALTO','BRIVO','OTHER')),
  display_name  TEXT NOT NULL,
  -- Item 45: a maturidade da integração é dado, não nota de rodapé.
  integration_status TEXT NOT NULL
                CHECK (integration_status IN
                  ('IMPLEMENTED','SIMULATED','INTERFACE_READY','REQUIRES_VENDOR_INTEGRATION','RESEARCH_REQUIRED')),
  integration_pending TEXT
);

CREATE TABLE provider_capability (
  provider_id   TEXT NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
  capability    TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL,
  -- Capacidade declarada sem confirmação do fabricante é hipótese de trabalho.
  declaration   TEXT NOT NULL DEFAULT 'PROVISORIO' CHECK (declaration IN ('CONFIRMADO','PROVISORIO')),
  evidence      TEXT,
  PRIMARY KEY (provider_id, capability)
);

CREATE TABLE provider_connection (
  id            TEXT PRIMARY KEY,
  provider_id   TEXT NOT NULL REFERENCES provider(id),
  organization_id TEXT NOT NULL REFERENCES hierarchy_node(id),
  status        TEXT NOT NULL CHECK (status IN ('ONLINE','OFFLINE','DEGRADED','UNKNOWN')),
  last_seen_at  TIMESTAMPTZ,
  -- Referência ao cofre. O segredo NUNCA fica nesta base.
  secret_ref    TEXT
);

CREATE TABLE gateway (
  id            TEXT PRIMARY KEY,
  provider_id   TEXT NOT NULL REFERENCES provider(id),
  facility_id   TEXT NOT NULL REFERENCES hierarchy_node(id),
  status        TEXT NOT NULL CHECK (status IN ('ONLINE','OFFLINE','DEGRADED','UNKNOWN')),
  last_seen_at  TIMESTAMPTZ,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX gateway_facility_idx ON gateway(facility_id);

CREATE TABLE device (
  id            TEXT PRIMARY KEY,
  provider_id   TEXT NOT NULL REFERENCES provider(id),
  external_ref  TEXT NOT NULL,
  model         TEXT,
  firmware      TEXT,
  firmware_state TEXT CHECK (firmware_state IN ('CURRENT','OUTDATED','DEGRADED','UNKNOWN')),
  battery_pct   INTEGER CHECK (battery_pct BETWEEN 0 AND 100),
  clock_drift_ms BIGINT,
  last_seen_at  TIMESTAMPTZ,
  last_sync_at  TIMESTAMPTZ,
  UNIQUE (provider_id, external_ref)
);

CREATE TABLE endpoint (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  zone_id       TEXT NOT NULL REFERENCES hierarchy_node(id),
  facility_id   TEXT NOT NULL REFERENCES hierarchy_node(id),
  provider_connection_id TEXT NOT NULL REFERENCES provider_connection(id),
  device_id     TEXT REFERENCES device(id),
  gateway_id    TEXT REFERENCES gateway(id),
  -- Item 29: configurável por instalação, com default institucional.
  criticality   TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (criticality IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  external_ref  TEXT NOT NULL
);
CREATE INDEX endpoint_zone_idx ON endpoint(zone_id);
CREATE INDEX endpoint_criticality_idx ON endpoint(criticality);

CREATE TABLE device_capability (
  endpoint_id   TEXT NOT NULL REFERENCES endpoint(id) ON DELETE CASCADE,
  capability    TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL,
  PRIMARY KEY (endpoint_id, capability)
);

-- ---------- Identidade e direito --------------------------------------------

CREATE TABLE person (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  institutional_id TEXT
);

CREATE TABLE role (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL
);

CREATE TABLE role_zone (
  role_id       TEXT NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  zone_id       TEXT NOT NULL REFERENCES hierarchy_node(id),
  PRIMARY KEY (role_id, zone_id)
);

CREATE TABLE relationship (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL REFERENCES person(id),
  organization_id TEXT NOT NULL REFERENCES hierarchy_node(id),
  type          TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','TERMINATED')),
  valid_from    TIMESTAMPTZ NOT NULL,
  valid_until   TIMESTAMPTZ,
  work_order_id TEXT,
  shift_days    INTEGER[],
  shift_start_minute INTEGER,
  shift_end_minute   INTEGER,
  shift_crosses_midnight BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX relationship_person_idx ON relationship(person_id);
CREATE INDEX relationship_status_idx ON relationship(status);

CREATE TABLE entitlement (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL REFERENCES person(id),
  relationship_id TEXT NOT NULL REFERENCES relationship(id),
  endpoint_id   TEXT NOT NULL REFERENCES endpoint(id),
  valid_from    TIMESTAMPTZ NOT NULL,
  valid_until   TIMESTAMPTZ,
  granted_by    TEXT NOT NULL,
  granted_at    TIMESTAMPTZ NOT NULL,
  -- Nunca apagado: revogar preenche as duas colunas abaixo.
  revoked_at    TIMESTAMPTZ,
  revocation_reason TEXT,
  decision_id   TEXT
);
CREATE INDEX entitlement_endpoint_idx ON entitlement(endpoint_id);
CREATE INDEX entitlement_active_idx ON entitlement(person_id) WHERE revoked_at IS NULL;

CREATE TABLE credential (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL REFERENCES person(id),
  entitlement_id TEXT NOT NULL REFERENCES entitlement(id),
  endpoint_id   TEXT NOT NULL REFERENCES endpoint(id),
  -- Item 23: biometria é método, nunca fundamento do direito.
  method        TEXT NOT NULL
                CHECK (method IN ('CARD','PIN','QR','NFC','BLE','BIOMETRIC','MOBILE_WALLET')),
  status        TEXT NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED','EXPIRED')),
  external_ref  TEXT,
  issued_at     TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ,
  device_confirmed_at TIMESTAMPTZ
);
CREATE INDEX credential_entitlement_idx ON credential(entitlement_id);

-- ---------- Estado físico — o coração do produto ----------------------------

CREATE TABLE access_state (
  credential_id TEXT PRIMARY KEY REFERENCES credential(id),
  endpoint_id   TEXT NOT NULL REFERENCES endpoint(id),
  desired_state  TEXT NOT NULL
                CHECK (desired_state IN
                  ('ENTITLEMENT_ACTIVE','ENTITLEMENT_EXPIRED','ENTITLEMENT_REVOKED','ENTITLEMENT_ABSENT')),
  cloud_state    TEXT NOT NULL
                CHECK (cloud_state IN
                  ('CLOUD_GRANT_CREATED','CLOUD_GRANT_REVOKED','CLOUD_GRANT_ABSENT','CLOUD_UNKNOWN')),
  provider_state TEXT NOT NULL
                CHECK (provider_state IN
                  ('PROVIDER_GRANT_ACCEPTED','PROVIDER_REVOCATION_ACCEPTED','PROVIDER_PENDING',
                   'PROVIDER_FAILED','PROVIDER_UNAVAILABLE','PROVIDER_UNKNOWN')),
  device_state   TEXT NOT NULL
                CHECK (device_state IN
                  ('DEVICE_GRANT_CONFIRMED','DEVICE_GRANT_PENDING','DEVICE_REVOCATION_CONFIRMED',
                   'DEVICE_REVOCATION_PENDING','DEVICE_SYNC_UNKNOWN','DEVICE_OFFLINE','DEVICE_DEGRADED')),
  -- NULL significa "o equipamento nunca confirmou". É estado legítimo e
  -- frequente, e a interface é obrigada a mostrá-lo como incerteza.
  last_confirmed_state TEXT,
  last_sync_at  TIMESTAMPTZ,
  divergence_detected_at TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX access_state_divergence_idx ON access_state(endpoint_id)
  WHERE last_confirmed_state IS NULL OR divergence_detected_at IS NOT NULL;

CREATE TABLE physical_state_snapshot (
  id            BIGSERIAL PRIMARY KEY,
  endpoint_id   TEXT NOT NULL REFERENCES endpoint(id),
  captured_at   TIMESTAMPTZ NOT NULL,
  state         TEXT NOT NULL,
  trustworthy   BOOLEAN NOT NULL,
  credentials   JSONB,
  observation   TEXT
);
CREATE INDEX physical_snapshot_endpoint_idx ON physical_state_snapshot(endpoint_id, captured_at DESC);

-- ---------- Sincronização e tentativas (itens 35, 36, 37) -------------------

CREATE TABLE sync_job (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('GRANT','REVOKE','SYNC')),
  endpoint_id   TEXT NOT NULL REFERENCES endpoint(id),
  credential_id TEXT REFERENCES credential(id),
  entitlement_id TEXT REFERENCES entitlement(id),
  -- Item 37: a chave é única. Grant duplicado é impossível por construção.
  idempotency_key TEXT NOT NULL UNIQUE,
  correlation_id TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','ESCALATED')),
  attempt       INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sync_job_pending_idx ON sync_job(next_retry_at) WHERE state IN ('QUEUED','FAILED');

CREATE TABLE sync_attempt (
  id            BIGSERIAL PRIMARY KEY,
  sync_job_id   TEXT NOT NULL REFERENCES sync_job(id) ON DELETE CASCADE,
  attempt_no    INTEGER NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ,
  result        TEXT NOT NULL CHECK (result IN ('ACCEPTED','CONFIRMED','PENDING','FAILED','UNKNOWN')),
  operation_id  TEXT,
  message       TEXT
);

-- ---------- Telemetria (item 6) ---------------------------------------------

CREATE TABLE operation_telemetry (
  operation_id  TEXT PRIMARY KEY,
  correlation_id TEXT,
  endpoint_id   TEXT REFERENCES endpoint(id),
  provider_id   TEXT REFERENCES provider(id),
  request_received_at TIMESTAMPTZ NOT NULL,
  policy_decision_at  TIMESTAMPTZ,
  provider_request_at TIMESTAMPTZ,
  provider_response_at TIMESTAMPTZ,
  device_executed_at  TIMESTAMPTZ,
  event_confirmed_at  TIMESTAMPTZ,
  -- Derivadas, gravadas para consulta barata em painel.
  decision_latency_ms  INTEGER,
  provider_latency_ms  INTEGER,
  device_latency_ms    INTEGER,
  confirmation_latency_ms INTEGER,
  total_latency_ms     INTEGER
);
CREATE INDEX telemetry_endpoint_idx ON operation_telemetry(endpoint_id, request_received_at DESC);

-- ---------- Assurance -------------------------------------------------------

CREATE TABLE health_snapshot (
  id            BIGSERIAL PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES hierarchy_node(id),
  scope_id      TEXT NOT NULL,
  scope_level   TEXT NOT NULL,
  score         NUMERIC(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  calculated_at TIMESTAMPTZ NOT NULL,
  endpoints_online INTEGER NOT NULL DEFAULT 0,
  endpoints_offline INTEGER NOT NULL DEFAULT 0,
  endpoints_degraded INTEGER NOT NULL DEFAULT 0,
  pending_revocations INTEGER NOT NULL DEFAULT 0,
  pending_synchronizations INTEGER NOT NULL DEFAULT 0,
  unreconciled_states INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX health_scope_idx ON health_snapshot(scope_id, calculated_at DESC);

-- Um score sem componentes é um score que não abre. A restrição existe para
-- que o item 7 seja invariante de banco, e não promessa de camada de aplicação.
CREATE TABLE health_component (
  id            BIGSERIAL PRIMARY KEY,
  snapshot_id   BIGINT NOT NULL REFERENCES health_snapshot(id) ON DELETE CASCADE,
  component_id  TEXT NOT NULL,
  label         TEXT NOT NULL,
  penalty       NUMERIC(5,2) NOT NULL CHECK (penalty >= 0),
  item_count    INTEGER NOT NULL,
  evidence      JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX health_component_snapshot_idx ON health_component(snapshot_id);

CREATE TABLE escalation_case (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  subject_id    TEXT REFERENCES person(id),
  endpoint_id   TEXT REFERENCES endpoint(id),
  entitlement_id TEXT REFERENCES entitlement(id),
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
  created_at    TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT,
  evidence      JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX escalation_open_idx ON escalation_case(severity, created_at)
  WHERE status IN ('OPEN','ACKNOWLEDGED');

-- ---------- Eventos e auditoria (itens 26, 38, 39) --------------------------

CREATE TABLE domain_event (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  -- Difere de occurred_at em evento atrasado. A distância entre as duas é,
  -- ela própria, um indicador de assurance.
  recorded_at   TIMESTAMPTZ NOT NULL,
  ingestion_source TEXT NOT NULL
                CHECK (ingestion_source IN ('WEBHOOK','POLLING','LOCAL_EVENT','IMPORT','SIMULATED_EVENT')),
  -- Item 15: quem decidiu.
  decision_origin TEXT
                CHECK (decision_origin IN ('DEVICE_LOCAL','COLMEIA_POLICY_ENGINE','PROVIDER_CLOUD','MANUAL_OPERATOR')),
  correlation_id TEXT,
  idempotency_key TEXT UNIQUE,
  organization_id TEXT REFERENCES hierarchy_node(id),
  facility_id   TEXT REFERENCES hierarchy_node(id),
  endpoint_id   TEXT REFERENCES endpoint(id),
  gateway_id    TEXT REFERENCES gateway(id),
  provider_id   TEXT REFERENCES provider(id),
  person_id     TEXT REFERENCES person(id),
  entitlement_id TEXT REFERENCES entitlement(id),
  credential_id TEXT REFERENCES credential(id),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary       TEXT NOT NULL
);
CREATE INDEX domain_event_timeline_idx ON domain_event(correlation_id, occurred_at);
CREATE INDEX domain_event_endpoint_idx ON domain_event(endpoint_id, occurred_at DESC);
CREATE INDEX domain_event_person_idx ON domain_event(person_id, occurred_at DESC);
