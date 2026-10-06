-- Keep CSV group assignments even before a student has a registered account.
-- The composite foreign key prevents an assignment to another class's group.
-- Regenerating/deleting groups clears these assignments without deleting enrolments.
ALTER TABLE enrolments
  ADD COLUMN imported_group_id uuid,
  ADD CONSTRAINT enrolments_imported_group_class
    FOREIGN KEY (imported_group_id, class_id) REFERENCES groups (id, class_id)
    ON DELETE SET NULL (imported_group_id);

CREATE INDEX enrolments_imported_group_idx ON enrolments (imported_group_id)
  WHERE imported_group_id IS NOT NULL;
