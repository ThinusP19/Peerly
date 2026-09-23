-- FR-22: "Retain full precision internally and round only at the final step."
--
-- 0001 stored the intermediate figures as numeric(8, 4), which rounded them to
-- four places on the way into the table. The calculation no longer rounds the
-- factor before multiplying, so storing it rounded would record a factor that
-- did not produce the mark beside it - and a rerun could not be checked against
-- the stored run "to full stored precision", which FR-22 also requires.
--
-- Unconstrained numeric keeps every digit the calculation produced. Only the
-- final mark stays at a fixed scale: it is the one figure that is rounded, by
-- the approved rule, before anyone sees it.

ALTER TABLE calculated_results
  ALTER COLUMN mean_received     TYPE numeric,
  ALTER COLUMN group_mean        TYPE numeric,
  ALTER COLUMN raw_factor        TYPE numeric,
  ALTER COLUMN adjustment_factor TYPE numeric;
