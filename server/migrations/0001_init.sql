-- Peerly initial schema.
--
-- The FSD's business rules are enforced HERE, not only in application code:
--   BR-02  no self-evaluation            -> peer_ratings.no_self_evaluation
--   BR-03  one rating per pair per assessment -> peer_ratings unique (assessment, evaluator, evaluated)
--   BR-01  evaluate only your own group  -> composite FKs into group_members
--   BR-10  one group per student per class -> group_members unique (class_id, student_id)
--   OR-07  a race between concurrent requests cannot create a duplicate
--   FR-27  audit is append-only          -> triggers that refuse UPDATE and DELETE
--
-- Money/marks use numeric, never float: binary floats cannot represent 0.1
-- exactly, and these values end up on an academic record.

/* ------------------------------------------------------------------ *
 * Enumerations
 * ------------------------------------------------------------------ */
CREATE TYPE user_role AS ENUM ('admin', 'lecturer', 'student');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'unverified');
CREATE TYPE match_status AS ENUM ('matched', 'unmatched', 'conflict');
CREATE TYPE assessment_status AS ENUM ('draft', 'open', 'closed');
CREATE TYPE submission_status AS ENUM ('draft', 'submitted');
CREATE TYPE token_purpose AS ENUM ('activation', 'recovery');

/* ------------------------------------------------------------------ *
 * Users — FR-01, FR-02, AS-01
 * ------------------------------------------------------------------ */
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role            user_role   NOT NULL,
  name            text        NOT NULL CHECK (btrim(name) <> ''),
  surname         text        NOT NULL CHECK (btrim(surname) <> ''),
  email           text        NOT NULL,
  student_number  text,
  -- Null until the holder sets their own password at activation (FR-01, FR-03).
  password_hash   text,
  status          user_status NOT NULL DEFAULT 'unverified',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- A student is matched to a class list by student number, so they must have one.
  CONSTRAINT students_have_a_student_number
    CHECK (role <> 'student' OR student_number IS NOT NULL)
);

-- Sign-in is case-insensitive on e-mail, so uniqueness must be too.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
-- AS-01: each student number identifies exactly one person.
CREATE UNIQUE INDEX users_student_number_key ON users (student_number)
  WHERE student_number IS NOT NULL;

/* ------------------------------------------------------------------ *
 * Sessions — SR-05 (server-side revocation), CI-08
 * ------------------------------------------------------------------ */
CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Only the hash is stored: a leaked database must not yield usable sessions.
  token_hash   text        NOT NULL UNIQUE,
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- Absolute lifetime (SR-05: 12 hours); idle expiry is derived from last_seen_at.
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  user_agent   text,
  ip           inet
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id) WHERE revoked_at IS NULL;

/* ------------------------------------------------------------------ *
 * Activation and recovery tokens — FR-03, FR-06
 * ------------------------------------------------------------------ */
CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     token_purpose NOT NULL,
  token_hash  text          NOT NULL UNIQUE,
  expires_at  timestamptz   NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose)
  WHERE consumed_at IS NULL;

/* ------------------------------------------------------------------ *
 * Classes — BR-11 (owned by the responsible lecturer)
 * ------------------------------------------------------------------ */
CREATE TABLE classes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code     text        NOT NULL CHECK (btrim(module_code) <> ''),
  name            text        NOT NULL CHECK (btrim(name) <> ''),
  academic_period text        NOT NULL,
  lecturer_id     uuid        NOT NULL REFERENCES users (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_code, academic_period)
);
CREATE INDEX classes_lecturer_idx ON classes (lecturer_id);

/* ------------------------------------------------------------------ *
 * Class enrolments — FR-08, FR-09, FR-04
 * ------------------------------------------------------------------ */
CREATE TABLE enrolments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id         uuid         NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  student_number   text         NOT NULL,
  imported_name    text         NOT NULL,
  imported_surname text         NOT NULL,
  imported_email   text,
  match_status     match_status NOT NULL DEFAULT 'unmatched',
  -- Deliberately nullable: an unmatched or conflicting enrolment has no account.
  user_id          uuid         REFERENCES users (id) ON DELETE SET NULL,
  match_note       text,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  -- A student number appears at most once on a class list (FR-08 duplicate check).
  UNIQUE (class_id, student_number),
  CONSTRAINT matched_enrolments_have_an_account
    CHECK (match_status <> 'matched' OR user_id IS NOT NULL)
);
-- One account cannot occupy two enrolment rows in the same class.
CREATE UNIQUE INDEX enrolments_one_account_per_class
  ON enrolments (class_id, user_id) WHERE user_id IS NOT NULL;

/* ------------------------------------------------------------------ *
 * Groups — FR-10, FR-11, BR-10
 * ------------------------------------------------------------------ */
CREATE TABLE groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     uuid        NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  group_number int         NOT NULL CHECK (group_number > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, group_number),
  -- Referenced by group_members so a member's class cannot drift from its group's.
  UNIQUE (id, class_id)
);

CREATE TABLE group_members (
  group_id   uuid NOT NULL,
  class_id   uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, student_id),
  -- BR-10: a student belongs to exactly one group within a class.
  UNIQUE (class_id, student_id),
  FOREIGN KEY (group_id, class_id) REFERENCES groups (id, class_id) ON DELETE CASCADE
);

/* ------------------------------------------------------------------ *
 * Assessments — FR-12, FR-13
 * ------------------------------------------------------------------ */
CREATE TABLE assessments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id           uuid              NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  name               text              NOT NULL CHECK (btrim(name) <> ''),
  description        text              NOT NULL DEFAULT '',
  status             assessment_status NOT NULL DEFAULT 'draft',
  opens_at           timestamptz       NOT NULL,
  closes_at          timestamptz       NOT NULL,
  max_mark           numeric(6, 2)     NOT NULL DEFAULT 100 CHECK (max_mark > 0),
  calculated_at      timestamptz,
  calculation_run_id uuid,
  created_by         uuid              REFERENCES users (id),
  created_at         timestamptz       NOT NULL DEFAULT now(),
  -- FR-12: the closing time must be later than the opening time.
  CONSTRAINT closes_after_it_opens CHECK (closes_at > opens_at),
  UNIQUE (id, class_id)
);
CREATE INDEX assessments_class_idx ON assessments (class_id);

-- Which of the class's groups take part (FR-12).
CREATE TABLE assessment_groups (
  assessment_id uuid NOT NULL,
  group_id      uuid NOT NULL,
  class_id      uuid NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  PRIMARY KEY (assessment_id, group_id),
  -- Both sides must belong to the same class as the assessment.
  FOREIGN KEY (assessment_id, class_id) REFERENCES assessments (id, class_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id, class_id) REFERENCES groups (id, class_id) ON DELETE CASCADE
);

/* ------------------------------------------------------------------ *
 * Rating options — OR-19 (configuration, not literals in code)
 * ------------------------------------------------------------------ */
CREATE TABLE rating_options (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text          NOT NULL UNIQUE,
  description   text          NOT NULL,
  -- BR-15/UI-09: lecturer-facing only. Never serialised to a student response.
  hidden_value  numeric(6, 3) NOT NULL,
  display_order int           NOT NULL UNIQUE,
  active        boolean       NOT NULL DEFAULT true
);

/* ------------------------------------------------------------------ *
 * Submissions and peer ratings — FR-15, FR-16, BR-01 to BR-05
 * ------------------------------------------------------------------ */
CREATE TABLE submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid              NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  evaluator_id  uuid              NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status        submission_status NOT NULL DEFAULT 'draft',
  submitted_at  timestamptz,
  created_at    timestamptz       NOT NULL DEFAULT now(),
  updated_at    timestamptz       NOT NULL DEFAULT now(),
  -- One submission per evaluator per assessment; an amendment supersedes it.
  UNIQUE (assessment_id, evaluator_id),
  UNIQUE (id, assessment_id),
  CONSTRAINT submitted_rows_have_a_timestamp
    CHECK (status <> 'submitted' OR submitted_at IS NOT NULL)
);

CREATE TABLE peer_ratings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id    uuid          NOT NULL,
  assessment_id    uuid          NOT NULL,
  group_id         uuid          NOT NULL,
  evaluator_id     uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  evaluated_id     uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating_option_id uuid          NOT NULL REFERENCES rating_options (id),
  -- FR-17: optional, length limited.
  comment          text          CHECK (comment IS NULL OR char_length(comment) <= 500),
  created_at       timestamptz   NOT NULL DEFAULT now(),

  -- BR-02: a student may never evaluate themselves.
  CONSTRAINT no_self_evaluation CHECK (evaluator_id <> evaluated_id),
  -- BR-03: exactly one rating per evaluator/evaluated/assessment.
  UNIQUE (assessment_id, evaluator_id, evaluated_id),
  -- The rating belongs to a submission for the same assessment.
  FOREIGN KEY (submission_id, assessment_id) REFERENCES submissions (id, assessment_id) ON DELETE CASCADE,
  -- BR-01: both parties must be members of the group being rated. Enforced
  -- declaratively, so a hand-crafted API request cannot rate outside the group.
  CONSTRAINT evaluator_is_in_the_group
    FOREIGN KEY (group_id, evaluator_id) REFERENCES group_members (group_id, student_id) ON DELETE CASCADE,
  CONSTRAINT evaluated_is_in_the_group
    FOREIGN KEY (group_id, evaluated_id) REFERENCES group_members (group_id, student_id) ON DELETE CASCADE
);
CREATE INDEX peer_ratings_assessment_idx ON peer_ratings (assessment_id);
CREATE INDEX peer_ratings_evaluated_idx ON peer_ratings (assessment_id, evaluated_id);

/* ------------------------------------------------------------------ *
 * Group marks — FR-21
 * ------------------------------------------------------------------ */
CREATE TABLE group_marks (
  assessment_id uuid          NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  group_id      uuid          NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  base_mark     numeric(6, 2) CHECK (base_mark IS NULL OR base_mark >= 0),
  entered_by    uuid          REFERENCES users (id),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, group_id)
);

/* ------------------------------------------------------------------ *
 * Calculation — FR-22, FR-23, OR-09 (results must stay explainable)
 * ------------------------------------------------------------------ */
CREATE TABLE calculation_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid        NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  run_by        uuid        NOT NULL REFERENCES users (id),
  rule_version  text        NOT NULL,
  -- The exact limits, rounding and exclusions applied, frozen with the run, so a
  -- mark stays explainable even after the configuration changes (OR-09, OR-19).
  config        jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calculation_runs_assessment_idx ON calculation_runs (assessment_id, created_at DESC);

CREATE TABLE calculated_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid          NOT NULL REFERENCES calculation_runs (id) ON DELETE CASCADE,
  assessment_id     uuid          NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  student_id        uuid          NOT NULL REFERENCES users (id),
  group_id          uuid          NOT NULL REFERENCES groups (id),
  ratings_received  int           NOT NULL DEFAULT 0,
  mean_received     numeric(8, 4),
  group_mean        numeric(8, 4),
  raw_factor        numeric(8, 4),
  adjustment_factor numeric(8, 4),
  base_mark         numeric(6, 2),
  final_mark        numeric(6, 2),
  flags             text[]        NOT NULL DEFAULT '{}',
  UNIQUE (run_id, student_id)
);
CREATE INDEX calculated_results_assessment_idx ON calculated_results (assessment_id);

CREATE TABLE mark_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   uuid          NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  student_id      uuid          NOT NULL REFERENCES users (id),
  -- BR-08: the calculated mark is retained, never replaced.
  calculated_mark numeric(6, 2) NOT NULL,
  override_mark   numeric(6, 2) NOT NULL CHECK (override_mark >= 0),
  -- FR-24: an unexplained mark adjustment is exactly what this system exists to
  -- eliminate, so the reason is mandatory at the database level.
  reason          text          NOT NULL CHECK (char_length(btrim(reason)) > 0),
  overridden_by   uuid          NOT NULL REFERENCES users (id),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, student_id)
);

/* ------------------------------------------------------------------ *
 * Audit — FR-27, SR-15. Append-only, enforced by the database.
 * ------------------------------------------------------------------ */
-- Deliberately NO foreign keys: an audit entry must outlive the row it describes
-- (FR-28 keeps the record of a deletion), and referential actions must never be
-- able to rewrite the log.
CREATE TABLE audit_entries (
  id                 bigserial PRIMARY KEY,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  actor_id           uuid,
  actor_name         text        NOT NULL,
  actor_role         user_role,
  event_type         text        NOT NULL,
  object_description text        NOT NULL,
  detail             text        NOT NULL DEFAULT '',
  class_id           uuid,
  assessment_id      uuid,
  before_state       jsonb,
  after_state        jsonb
);
CREATE INDEX audit_entries_occurred_idx ON audit_entries (occurred_at DESC);
CREATE INDEX audit_entries_class_idx ON audit_entries (class_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION audit_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

-- No user, including a System Administrator, may amend or delete an entry
-- through the application (FR-27, SR-15).
CREATE TRIGGER audit_entries_no_update
  BEFORE UPDATE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit_is_append_only();

CREATE TRIGGER audit_entries_no_delete
  BEFORE DELETE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION audit_is_append_only();
