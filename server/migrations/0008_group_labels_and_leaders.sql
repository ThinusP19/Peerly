-- Labels do not change a group's numeric identity or its assessment allocation.
ALTER TABLE groups
  ADD COLUMN group_name text,
  ADD COLUMN leader_enrolment_id uuid,
  ADD CONSTRAINT group_name_length CHECK (
    group_name IS NULL OR
    (char_length(group_name) BETWEEN 1 AND 120 AND group_name = btrim(group_name))
  );

-- A leader can be designated before their account is registered or matched.
-- The composite key enforces that the enrolment is assigned to this group,
-- including its class. One nullable reference permits at most one leader.
ALTER TABLE enrolments
  ADD CONSTRAINT enrolment_imported_group_key UNIQUE (id, imported_group_id);

-- Deferred, because deleting a group first clears its members' assignments
-- (0007) while the group row still names its leader; by commit the group is gone.
-- PostgreSQL 14 has no "ON DELETE SET NULL (column)", so a trigger clears the
-- leader when the enrolment itself is deleted.
ALTER TABLE groups
  ADD CONSTRAINT group_leader_assignment
    FOREIGN KEY (leader_enrolment_id, id)
    REFERENCES enrolments (id, imported_group_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION clear_group_leader() RETURNS trigger AS $$
BEGIN
  UPDATE groups SET leader_enrolment_id = NULL WHERE leader_enrolment_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enrolments_clear_group_leader
  BEFORE DELETE ON enrolments
  FOR EACH ROW EXECUTE FUNCTION clear_group_leader();
