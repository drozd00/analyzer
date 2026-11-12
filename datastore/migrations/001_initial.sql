CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS analysis;

CREATE TABLE raw.studies (
  id text NOT NULL,
  protocol_version text NOT NULL,
  title text NOT NULL,
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, protocol_version)
);
CREATE FUNCTION raw.prevent_study_redefinition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Study configuration is immutable; register a new protocol version';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER studies_immutable BEFORE UPDATE ON raw.studies
  FOR EACH ROW EXECUTE FUNCTION raw.prevent_study_redefinition();

CREATE TABLE raw.sessions (
  id uuid PRIMARY KEY,
  study_id text NOT NULL,
  participant_code text NOT NULL,
  dataset_kind text NOT NULL DEFAULT 'preflight' CHECK (dataset_kind IN ('preflight', 'pilot')),
  protocol_version text NOT NULL,
  group_code text NOT NULL CHECK (length(group_code) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (study_id, protocol_version) REFERENCES raw.studies(id, protocol_version),
  UNIQUE (study_id, protocol_version, participant_code)
);
CREATE INDEX sessions_study_kind_idx ON raw.sessions(study_id, protocol_version, dataset_kind);
CREATE TABLE raw.trials (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES raw.sessions(id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  variant text NOT NULL CHECK (length(variant) > 0),
  phase text NOT NULL CHECK (length(phase) > 0),
  repetition integer NOT NULL CHECK (repetition >= 0),
  scenario_id text NOT NULL,
  scenario jsonb NOT NULL CHECK (jsonb_typeof(scenario) = 'object'),
  page_id text,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'running', 'completed', 'aborted', 'interrupted')),
  started_at timestamptz,
  ended_at timestamptz,
  final_sequence integer CHECK (final_sequence > 0),
  UNIQUE (session_id, ordinal)
);
CREATE INDEX trials_session_phase_idx ON raw.trials(session_id, phase, variant);
CREATE TABLE raw.batches (
  id uuid PRIMARY KEY,
  trial_id uuid NOT NULL REFERENCES raw.trials(id),
  content_hash text NOT NULL,
  event_count integer NOT NULL CHECK (event_count > 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, trial_id)
);
CREATE TABLE raw.events (
  event_id text PRIMARY KEY,
  trial_id uuid NOT NULL REFERENCES raw.trials(id),
  batch_id uuid NOT NULL,
  page_id text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  ts_ms double precision NOT NULL CHECK (ts_ms >= 0 AND ts_ms < 'Infinity'::float8),
  wall_time timestamptz,
  source text NOT NULL CHECK (source IN ('browser', 'app')),
  type text NOT NULL,
  form_id text,
  field_id text,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trial_id, sequence),
  FOREIGN KEY (batch_id, trial_id) REFERENCES raw.batches(id, trial_id)
);

CREATE TABLE analysis.runs (
  id uuid PRIMARY KEY,
  study_id text NOT NULL,
  protocol_version text NOT NULL,
  study_profile jsonb NOT NULL,
  dataset_hash text NOT NULL,
  analyzer_version text NOT NULL,
  metrics_version text NOT NULL,
  code_revision text NOT NULL,
  config jsonb NOT NULL,
  manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE analysis.dim_variants (
  run_id uuid NOT NULL REFERENCES analysis.runs(id),
  id text NOT NULL,
  label text NOT NULL,
  PRIMARY KEY (run_id, id)
);
CREATE TABLE analysis.dim_fields (
  run_id uuid NOT NULL REFERENCES analysis.runs(id),
  id text NOT NULL,
  label text NOT NULL,
  PRIMARY KEY (run_id, id)
);
CREATE TABLE analysis.dim_phases (
  run_id uuid NOT NULL REFERENCES analysis.runs(id),
  id text NOT NULL,
  included_in_analysis boolean NOT NULL,
  PRIMARY KEY (run_id, id)
);
CREATE TABLE analysis.dim_groups (
  run_id uuid NOT NULL REFERENCES analysis.runs(id),
  id text NOT NULL,
  variant_order jsonb NOT NULL,
  PRIMARY KEY (run_id, id)
);
CREATE TABLE analysis.dim_participants (
  run_id uuid NOT NULL REFERENCES analysis.runs(id),
  session_id uuid NOT NULL,
  participant_code text NOT NULL,
  dataset_kind text NOT NULL,
  protocol_version text NOT NULL,
  group_code text NOT NULL,
  PRIMARY KEY (run_id, session_id),
  FOREIGN KEY (run_id, group_code) REFERENCES analysis.dim_groups(run_id, id)
);
CREATE TABLE analysis.dim_trials (
  run_id uuid NOT NULL,
  trial_id uuid NOT NULL,
  session_id uuid NOT NULL,
  variant_id text NOT NULL,
  ordinal integer NOT NULL,
  phase text NOT NULL,
  repetition integer NOT NULL,
  scenario_id text NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (run_id, trial_id),
  FOREIGN KEY (run_id, session_id) REFERENCES analysis.dim_participants(run_id, session_id),
  FOREIGN KEY (run_id, variant_id) REFERENCES analysis.dim_variants(run_id, id),
  FOREIGN KEY (run_id, phase) REFERENCES analysis.dim_phases(run_id, id)
);
CREATE TABLE analysis.fact_trial_metrics (
  run_id uuid NOT NULL,
  trial_id uuid NOT NULL,
  completed boolean NOT NULL,
  eligible boolean NOT NULL,
  completion_time_ms double precision,
  error_count integer NOT NULL,
  correction_count integer NOT NULL,
  submit_attempt_count integer NOT NULL,
  rejected_submit_count integer NOT NULL,
  input_count integer NOT NULL,
  delete_count integer NOT NULL,
  keyboard_navigation_count integer NOT NULL,
  pointer_count integer NOT NULL,
  focus_time_ms double precision NOT NULL,
  quality_flags jsonb NOT NULL,
  PRIMARY KEY (run_id, trial_id),
  FOREIGN KEY (run_id, trial_id) REFERENCES analysis.dim_trials(run_id, trial_id)
);
CREATE TABLE analysis.fact_field_metrics (
  run_id uuid NOT NULL,
  trial_id uuid NOT NULL,
  field_id text NOT NULL,
  focus_time_ms double precision NOT NULL,
  focus_count integer NOT NULL,
  input_count integer NOT NULL,
  delete_count integer NOT NULL,
  error_count integer NOT NULL,
  correction_count integer NOT NULL,
  PRIMARY KEY (run_id, trial_id, field_id),
  FOREIGN KEY (run_id, trial_id) REFERENCES analysis.dim_trials(run_id, trial_id),
  FOREIGN KEY (run_id, field_id) REFERENCES analysis.dim_fields(run_id, id)
);
COMMENT ON SCHEMA raw IS 'Original observations; identifiers are scoped by immutable study configuration, checked by the collecting API.';
COMMENT ON SCHEMA analysis IS 'Rebuildable snapshots; every metric dimension and fact belongs to one immutable analysis run.';
