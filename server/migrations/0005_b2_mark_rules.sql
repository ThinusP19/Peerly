-- Marks are recorded to one decimal place, and never above the maximum.
--
-- IS-06 (2026-09-23) set one decimal place as the precision a mark is recorded
-- at, and BR-07 says an individual mark never exceeds the assessment's
-- maximum. Both were enforced only by the marks screen: the API accepted 70.25
-- and 60.255, the numeric(6, 2) columns rounded them silently, and the maximum
-- could be lowered underneath marks already entered. The API now refuses all
-- of that with a plain message; these triggers are the same rules in the
-- database, so a direct write cannot get round them either (AGENTS.md).
--
-- Triggers rather than CHECK constraints, for two reasons. The maximum lives on
-- another table, which a CHECK cannot read. And rows written before this rule
-- existed must stay readable and recalculable: a trigger fires only when the
-- mark itself is written (UPDATE OF), so keeping an old two-decimal override
-- through a recalculation - which updates only its calculated_mark - still
-- works, while any new or changed mark has to follow the rule.
--
-- ERRCODE check_violation, so the API reports a broken rule (409) rather than
-- a server fault.

CREATE FUNCTION group_mark_follows_the_rules() RETURNS trigger AS $$
DECLARE
  maximum numeric;
BEGIN
  IF NEW.base_mark IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.base_mark <> round(NEW.base_mark, 1) THEN
    RAISE EXCEPTION 'A group mark has at most one decimal place.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT max_mark INTO maximum FROM assessments WHERE id = NEW.assessment_id;
  IF NEW.base_mark > maximum THEN
    RAISE EXCEPTION 'A group mark cannot be above the assessment''s maximum.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER group_marks_follow_the_rules
  BEFORE INSERT OR UPDATE OF base_mark ON group_marks
  FOR EACH ROW EXECUTE FUNCTION group_mark_follows_the_rules();

CREATE FUNCTION override_follows_the_rules() RETURNS trigger AS $$
DECLARE
  maximum numeric;
BEGIN
  IF NEW.override_mark <> round(NEW.override_mark, 1) THEN
    RAISE EXCEPTION 'An override has at most one decimal place.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT max_mark INTO maximum FROM assessments WHERE id = NEW.assessment_id;
  IF NEW.override_mark > maximum THEN
    RAISE EXCEPTION 'An override cannot be above the assessment''s maximum.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mark_overrides_follow_the_rules
  BEFORE INSERT OR UPDATE OF override_mark ON mark_overrides
  FOR EACH ROW EXECUTE FUNCTION override_follows_the_rules();

-- The calculation caps a mark at the maximum (felder.ts); this is the backstop.
CREATE FUNCTION calculated_mark_within_the_maximum() RETURNS trigger AS $$
DECLARE
  maximum numeric;
BEGIN
  SELECT max_mark INTO maximum FROM assessments WHERE id = NEW.assessment_id;
  IF NEW.final_mark > maximum THEN
    RAISE EXCEPTION 'A calculated mark cannot be above the assessment''s maximum.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculated_results_within_the_maximum
  BEFORE INSERT OR UPDATE OF final_mark ON calculated_results
  FOR EACH ROW EXECUTE FUNCTION calculated_mark_within_the_maximum();

-- Lowering the maximum underneath a mark already entered, calculated or
-- overridden would leave that mark above it.
CREATE FUNCTION maximum_stays_above_the_marks() RETURNS trigger AS $$
BEGIN
  IF NEW.max_mark < OLD.max_mark AND (
       EXISTS (SELECT 1 FROM group_marks
                WHERE assessment_id = NEW.id AND base_mark > NEW.max_mark)
    OR EXISTS (SELECT 1 FROM calculated_results
                WHERE assessment_id = NEW.id AND final_mark > NEW.max_mark)
    OR EXISTS (SELECT 1 FROM mark_overrides
                WHERE assessment_id = NEW.id AND override_mark > NEW.max_mark)
  ) THEN
    RAISE EXCEPTION 'The maximum mark cannot be lowered below a mark already recorded.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessments_maximum_stays_above_the_marks
  BEFORE UPDATE OF max_mark ON assessments
  FOR EACH ROW EXECUTE FUNCTION maximum_stays_above_the_marks();
