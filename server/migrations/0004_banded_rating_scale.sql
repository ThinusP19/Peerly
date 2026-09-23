-- The rating scale the lecturer's current Felder spreadsheet works in, agreed
-- on 2026-09-22 in place of the FSD's working baseline (100 down to 0 in steps
-- of 12.5).
--
-- Each option stands for a band of marks, and counts as the TOP of its band:
--
--   Excellent        95 - 100  -> 100      Deficient        70 - 74  -> 74
--   Very good        90 -  94  ->  94      Unsatisfactory   65 - 69  -> 69
--   Satisfactory     85 -  89  ->  89      Superficial      60 - 64  -> 64
--   Ordinary         80 -  84  ->  84      No contribution  50 - 59  -> 59
--   Marginal         75 -  79  ->  79
--
-- Why it matters: the floor is 59, not 0. The spreadsheet's scale is a
-- compressed one - the least a peer can say still counts for well over half -
-- so one harsh rating moves a factor far less than it did on 0-100.
--
-- Labels, descriptions and order are unchanged; only the hidden values move.
-- Ratings reference options by id, so existing ratings take the new values.
-- Every calculation run already stored its own config, and now also stores
-- the scale it used (results.ts), so an earlier run stays explainable.

UPDATE rating_options SET hidden_value = CASE label
  WHEN 'Excellent'       THEN 100
  WHEN 'Very good'       THEN 94
  WHEN 'Satisfactory'    THEN 89
  WHEN 'Ordinary'        THEN 84
  WHEN 'Marginal'        THEN 79
  WHEN 'Deficient'       THEN 74
  WHEN 'Unsatisfactory'  THEN 69
  WHEN 'Superficial'     THEN 64
  WHEN 'No contribution' THEN 59
END;

-- Refuse to leave any option without a value, rather than silently nulling one
-- whose label was edited by hand since 0002.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rating_options WHERE hidden_value IS NULL) THEN
    RAISE EXCEPTION 'A rating option has an unexpected label; the scale was not updated.';
  END IF;
END $$;
