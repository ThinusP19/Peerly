-- Keep CSV group assignments even before a student has a registered account.
-- The composite foreign key prevents an assignment to another class's group.
-- Regenerating/deleting groups clears these assignments without deleting enrolments.
--
-- Written for PostgreSQL 14, which production runs: "ON DELETE SET NULL (column)"
-- needs 15, and a plain SET NULL would also clear class_id. The trigger below
-- clears only the assignment, before the group goes.
ALTER TABLE enrolments
  ADD COLUMN imported_group_id uuid,
  ADD CONSTRAINT enrolments_imported_group_class
    FOREIGN KEY (imported_group_id, class_id) REFERENCES groups (id, class_id);

CREATE INDEX enrolments_imported_group_idx ON enrolments (imported_group_id)
  WHERE imported_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION clear_imported_group_assignments() RETURNS trigger AS $$
BEGIN
  UPDATE enrolments SET imported_group_id = NULL WHERE imported_group_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER groups_clear_imported_assignments
  BEFORE DELETE ON groups
  FOR EACH ROW EXECUTE FUNCTION clear_imported_group_assignments();
