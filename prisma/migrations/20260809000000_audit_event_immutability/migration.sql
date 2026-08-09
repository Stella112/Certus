-- Audit evidence is a compliance record. Enforce append-only behavior at the
-- database boundary so future code, scripts, and cascades cannot mutate it.
CREATE TRIGGER "AuditEvent_prevent_update"
BEFORE UPDATE ON "AuditEvent"
BEGIN
  SELECT RAISE(ABORT, 'AuditEvent is append-only');
END;

CREATE TRIGGER "AuditEvent_prevent_delete"
BEFORE DELETE ON "AuditEvent"
BEGIN
  SELECT RAISE(ABORT, 'AuditEvent is append-only');
END;
