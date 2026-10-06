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

ALTER TABLE groups
  ADD CONSTRAINT group_leader_assignment
    FOREIGN KEY (leader_enrolment_id, id)
    REFERENCES enrolments (id, imported_group_id)
    ON DELETE SET NULL (leader_enrolment_id);
