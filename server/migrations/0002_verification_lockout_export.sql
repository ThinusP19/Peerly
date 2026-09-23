-- Closes the gaps between 0001 and what the built interface already expects.
--
--   FR-02/FR-03  a student proves the e-mail is theirs with a 6-digit code
--                -> email_verification_codes
--   SR-04        lock-out after five consecutive failures, rate limit by source
--                -> login_attempts
--   FR-25/FR-28  "has this been exported yet" drives the delete confirmation
--                -> assessments.exported_at
--   OR-19        the rating scale is reference data, not literals in code
--                -> rating_options seeded here, not in seed.ts
--
-- Rating options live in the migration rather than the seed script on purpose:
-- seed.ts is demo data that production never runs, and an assessment cannot be
-- rated at all without this scale. It is configuration, but it is not optional.

/* ------------------------------------------------------------------ *
 * Registration verification codes - FR-02, FR-03, SR-01
 * ------------------------------------------------------------------ *
 * Deliberately NOT folded into auth_tokens. That table holds long random
 * link tokens where guessing is not a threat. This holds a six-digit code
 * with only a million possibilities, so it needs an attempt counter, and
 * mixing the two would mean one of them carries a column it must not use.
 */
CREATE TABLE email_verification_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- The address the code was sent to. A student may correct a typo and
  -- re-send before verifying, which must invalidate the code sent to the
  -- old address rather than leave it live.
  email       text        NOT NULL,
  -- Only the hash is stored, as with sessions and auth_tokens: a leaked
  -- database must not hand anyone a working verification code (SR-03).
  code_hash   text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  -- SR-04 applied to the code itself: six digits is small enough to guess
  -- if the attempts are unbounded.
  attempts    int         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- At most one live code per account, so "resend" must supersede rather than
-- accumulate. Enforced here so a double-submitted resend cannot leave two
-- codes valid at once (OR-07).
CREATE UNIQUE INDEX email_verification_codes_one_live_per_user
  ON email_verification_codes (user_id) WHERE consumed_at IS NULL;

/* ------------------------------------------------------------------ *
 * Sign-in attempts - SR-04
 * ------------------------------------------------------------------ *
 * A log rather than a counter on users, because SR-04 asks for two
 * different things: lock-out after five consecutive failures for one
 * identity, and rate limiting by source address. A counter column answers
 * only the first, and drifts out of step with reality the moment a write
 * is missed. Consecutive failures are derived as "failures since the most
 * recent success", which needs no state to keep in step.
 *
 * No foreign key to users: an attempt against an address that does not
 * exist is exactly the attempt worth recording, and SR-06 means the
 * response cannot reveal which case it was.
 */
CREATE TABLE login_attempts (
  id           bigserial   PRIMARY KEY,
  -- Lower-cased at the point of write, matching users_email_lower_key.
  email        text        NOT NULL,
  user_id      uuid,
  succeeded    boolean     NOT NULL,
  ip           inet,
  user_agent   text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Serves the per-identity lock-out check: newest first, so the scan stops
-- at the most recent success.
CREATE INDEX login_attempts_email_idx ON login_attempts (email, attempted_at DESC);
-- Serves the per-source rate limit.
CREATE INDEX login_attempts_ip_idx ON login_attempts (ip, attempted_at DESC)
  WHERE ip IS NOT NULL;

/* ------------------------------------------------------------------ *
 * Export timestamp - FR-25, FR-28
 * ------------------------------------------------------------------ *
 * FR-28 makes deleting an assessment whose results were never exported a
 * two-step confirmation, so "was this exported, and when" has to survive
 * on the row itself.
 */
ALTER TABLE assessments ADD COLUMN exported_at timestamptz;

/* ------------------------------------------------------------------ *
 * The rating scale - OR-19, FR-15, BR-15
 * ------------------------------------------------------------------ *
 * Nine descriptive options, evenly spaced from 100 down to 0. The label
 * and description are what a student sees; hidden_value is lecturer-only
 * and must never be serialised into a student-facing response (SR-08).
 */
INSERT INTO rating_options (label, description, hidden_value, display_order) VALUES
  ('Excellent',       'Consistently went above and beyond what was asked, took the lead, carried more than their share.', 100,   1),
  ('Very good',       'Consistently did everything they were asked to do, and did it well.',                              87.5,  2),
  ('Satisfactory',    'Usually did what they were asked to do, at an acceptable standard.',                               75,    3),
  ('Ordinary',        'Often did what they were asked to do, but needed reminding.',                                      62.5,  4),
  ('Marginal',        'Sometimes failed to attend meetings or to complete what was asked.',                               50,    5),
  ('Deficient',       'Often failed to attend meetings or to complete what was asked.',                                   37.5,  6),
  ('Unsatisfactory',  'Consistently failed to attend meetings or to complete what was asked.',                            25,    7),
  ('Superficial',     'Contributed practically nothing to the work of the group.',                                        12.5,  8),
  ('No contribution', 'Never attended and contributed nothing at all.',                                                   0,     9);
