"""SQL statements grouped by registration, snapshot reads and analysis writes."""

REGISTER_STUDY = """
    INSERT INTO raw.studies(id,protocol_version,title,configuration)
    VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING id
"""
SELECT_STUDY = "SELECT configuration FROM raw.studies WHERE id=%s AND protocol_version=%s"

BEGIN_SNAPSHOT = "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
STUDY_SCOPE = "s.study_id=%s AND s.protocol_version=%s AND s.dataset_kind=%s"
SELECT_SESSIONS = "SELECT s.* FROM raw.sessions s WHERE " + STUDY_SCOPE + " ORDER BY s.id"
SELECT_TRIALS = (
    "SELECT t.* FROM raw.trials t JOIN raw.sessions s ON s.id=t.session_id WHERE "
    + STUDY_SCOPE
    + " ORDER BY t.session_id,t.ordinal"
)
SELECT_EVENTS = (
    "SELECT e.* FROM raw.events e JOIN raw.trials t ON t.id=e.trial_id "
    "JOIN raw.sessions s ON s.id=t.session_id WHERE "
    + STUDY_SCOPE
    + " ORDER BY e.trial_id,e.sequence"
)

SELECT_RUN = "SELECT manifest FROM analysis.runs WHERE id=%s"
INSERT_RUN = """
    INSERT INTO analysis.runs
        (id,dataset_hash,analyzer_version,metrics_version,code_revision,config,manifest,
         study_id,protocol_version,study_profile)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""
INSERT_VARIANTS = "INSERT INTO analysis.dim_variants(run_id,id,label) VALUES (%s,%s,%s)"
INSERT_FIELDS = "INSERT INTO analysis.dim_fields(run_id,id,label) VALUES (%s,%s,%s)"
INSERT_PHASES = "INSERT INTO analysis.dim_phases(run_id,id,included_in_analysis) VALUES (%s,%s,%s)"
INSERT_GROUPS = "INSERT INTO analysis.dim_groups(run_id,id,variant_order) VALUES (%s,%s,%s)"
INSERT_PARTICIPANTS = """
    INSERT INTO analysis.dim_participants
        (run_id,session_id,participant_code,dataset_kind,protocol_version,group_code)
    VALUES (%s,%s,%s,%s,%s,%s)
"""
INSERT_TRIALS = """
    INSERT INTO analysis.dim_trials
        (run_id,trial_id,session_id,variant_id,ordinal,phase,repetition,scenario_id,status)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""
INSERT_TRIAL_METRICS = """
    INSERT INTO analysis.fact_trial_metrics
        (run_id,trial_id,completed,eligible,completion_time_ms,error_count,correction_count,
         submit_attempt_count,rejected_submit_count,input_count,delete_count,
         keyboard_navigation_count,pointer_count,focus_time_ms,quality_flags)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""
INSERT_FIELD_METRICS = """
    INSERT INTO analysis.fact_field_metrics
        (run_id,trial_id,field_id,focus_time_ms,focus_count,input_count,delete_count,error_count,correction_count)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""
