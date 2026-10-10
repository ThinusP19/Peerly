-- Self-ratings, and a rating scale the client can adjust (2026-10-10).
--
-- Client feedback on the pilot asked for two things this schema refused.
--
-- 1. Self-evaluation. BR-02 (agreed 2026-09-22) excluded it, and 0001 enforced
--    that with a CHECK. The client's own Felder spreadsheet counts a member's
--    rating of themselves, and they have now asked for the system to do the
--    same: every member rates the whole group, themselves included, and the
--    self-rating counts towards their mark like any other. The CHECK goes.
--    Everything else BR-01/BR-03 guard stays exactly as it was: one rating per
--    evaluator/evaluated/assessment, and both inside the same group.
--
-- 2. The hidden values and the factor limits. They were fixed in a migration
--    (0004) and in code (felder.ts). An administrator now sets the system-wide
--    defaults, and a lecturer may adjust them for one assessment. Every run
--    already freezes the config and the scale it used (results.ts), so a mark
--    calculated before a change stays explainable after it.

ALTER TABLE peer_ratings DROP CONSTRAINT no_self_evaluation;

-- Values are kept to a sensible range, and never negative: a rating is an
-- amount of contribution, and a negative one would let a single peer push a
-- group mean below zero.
ALTER TABLE rating_options
  ADD CONSTRAINT hidden_value_in_range CHECK (hidden_value >= 0 AND hidden_value <= 1000);

/* ------------------------------------------------------------------ *
 * System-wide calculation defaults - administrator only
 * ------------------------------------------------------------------ */
-- One row, never more: the boolean key can only ever be true. Absent, the
-- defaults in felder.ts apply, so a fresh database needs nothing seeded here.
CREATE TABLE calculation_settings (
  id          boolean       PRIMARY KEY DEFAULT true CHECK (id),
  min_factor  numeric(5, 3) NOT NULL,
  max_factor  numeric(5, 3) NOT NULL,
  updated_by  uuid          REFERENCES users (id) ON DELETE SET NULL,
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  -- A floor above 1 would lower every mark, a ceiling below 1 would too, and
  -- 1 itself must always be reachable: it is what an evenly rated member gets.
  CONSTRAINT factor_limits_bracket_one CHECK (
    min_factor > 0 AND min_factor <= 1 AND max_factor >= 1 AND max_factor <= 2
  )
);

/* ------------------------------------------------------------------ *
 * One assessment's own values - the lecturer's adjustment
 * ------------------------------------------------------------------ */
-- Both null, or both set: an assessment either uses the system limits or its
-- own pair, never half of each. The NOT NULLs are needed: a comparison with a
-- null is unknown, and a CHECK lets unknown through.
ALTER TABLE assessments
  ADD COLUMN min_factor numeric(5, 3),
  ADD COLUMN max_factor numeric(5, 3),
  ADD CONSTRAINT own_factor_limits CHECK (
    (min_factor IS NULL AND max_factor IS NULL) OR (
      min_factor IS NOT NULL AND max_factor IS NOT NULL AND
      min_factor > 0 AND min_factor <= 1 AND max_factor >= 1 AND max_factor <= 2
    )
  );

-- A row per option the lecturer changed; an option with no row here takes the
-- system value. Removed with the assessment.
CREATE TABLE assessment_rating_values (
  assessment_id    uuid          NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  rating_option_id uuid          NOT NULL REFERENCES rating_options (id),
  hidden_value     numeric(6, 3) NOT NULL CHECK (hidden_value >= 0 AND hidden_value <= 1000),
  PRIMARY KEY (assessment_id, rating_option_id)
);
