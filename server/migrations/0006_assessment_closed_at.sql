-- When an assessment was actually closed (FR-13).
--
-- Closing is the lecturer's explicit act and is separate from the scheduled
-- closing time. Until now only the status changed, so every screen that said
-- "closed on ..." fell back to closes_at - and an assessment closed early read
-- as having closed on a date that had not happened yet.
--
-- Set when the assessment is closed, cleared when it is re-opened. Null on an
-- assessment that is not closed.

ALTER TABLE assessments ADD COLUMN closed_at timestamptz;

-- Assessments already closed: the audit trail recorded the moment (it is
-- append-only, so this reads it and changes nothing there). One closed without
-- an entry - seeded, or inserted by hand - gets the earlier of its scheduled
-- closing time and now, which is never a date in the future.
UPDATE assessments a
   SET closed_at = coalesce(
         (SELECT max(e.occurred_at)
            FROM audit_entries e
           WHERE e.assessment_id = a.id AND e.event_type = 'assessment.closed'),
         least(a.closes_at, now())
       )
 WHERE a.status = 'closed';
