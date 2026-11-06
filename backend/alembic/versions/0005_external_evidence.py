"""EI-1.0 staged evidence, uniqueness and database-level source protection."""
import os
import re
from alembic import op
from app.db import ExternalImport

revision='0005'
down_revision='0004'

def upgrade():
    bind=op.get_bind()
    ExternalImport.__table__.create(bind,checkfirst=True)
    if bind.dialect.name!='postgresql':
        return
    role=os.getenv('APPLICATION_DB_ROLE','clyra_app')
    if not re.fullmatch('[a-zA-Z_][a-zA-Z0-9_]*',role):
        raise RuntimeError('Invalid APPLICATION_DB_ROLE.')
    op.execute(f'REVOKE ALL ON external_imports FROM PUBLIC, "{role}"')
    op.execute(f'GRANT SELECT, INSERT, UPDATE ON external_imports TO "{role}"')
    op.execute(f'GRANT SELECT ON alembic_version TO "{role}"')
    op.execute("""CREATE FUNCTION protect_external_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'External evidence cannot be removed'; END IF;
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
        OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.request_id IS DISTINCT FROM OLD.request_id
        OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
        OR (NEW.data::jsonb - 'status' - 'confirmedAt' - 'visitId' - 'documentId' - 'jobId')
          IS DISTINCT FROM (OLD.data::jsonb - 'status' - 'confirmedAt' - 'visitId' - 'documentId' - 'jobId')
        OR OLD.data->>'status' <> 'PENDING_ASSOCIATION' OR NEW.data->>'status' <> 'CONFIRMED'
        OR NEW.data->>'confirmedAt' IS NULL OR NEW.data->>'visitId' IS NULL
        OR NEW.data->>'documentId' IS NULL OR NEW.data->>'jobId' IS NULL
      THEN RAISE EXCEPTION 'External evidence is immutable except association confirmation'; END IF;
      IF NOT EXISTS (SELECT 1 FROM documents d JOIN visits v ON v.id=NEW.data->>'visitId'
          JOIN extraction_jobs j ON j.id=NEW.data->>'jobId'
          WHERE d.id=NEW.data->>'documentId' AND d.patient_id=NEW.patient_id
          AND d.org_id=NEW.org_id AND d.data->>'rawText'=NEW.data->>'rawText'
          AND d.data->>'visitId'=v.id AND v.patient_id=NEW.patient_id
          AND j.patient_id=NEW.patient_id AND j.data->>'documentId'=d.id
          AND j.data->>'status'='COMPLETED')
      THEN RAISE EXCEPTION 'Invalid external evidence association'; END IF;
      RETURN NEW;
    END; $$""")
    op.execute('CREATE TRIGGER external_evidence_immutable BEFORE UPDATE OR DELETE ON external_imports FOR EACH ROW EXECUTE FUNCTION protect_external_evidence()')
    op.execute('CREATE TRIGGER external_evidence_no_truncate BEFORE TRUNCATE ON external_imports FOR EACH STATEMENT EXECUTE FUNCTION reject_event_mutation()')
    op.execute(f'REVOKE DELETE ON documents, medication_entries FROM "{role}"')
    op.execute(f'REVOKE UPDATE, DELETE ON discrepancy_decisions FROM "{role}"')
    op.execute('CREATE TRIGGER discrepancy_decisions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON discrepancy_decisions FOR EACH STATEMENT EXECUTE FUNCTION reject_event_mutation()')
    op.execute('CREATE TRIGGER medication_no_truncate BEFORE TRUNCATE ON medication_entries FOR EACH STATEMENT EXECUTE FUNCTION reject_event_mutation()')
    op.execute("""CREATE FUNCTION protect_document_source() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Source documents cannot be removed'; END IF;
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
        OR NEW.org_id IS DISTINCT FROM OLD.org_id
        OR (NEW.data::jsonb - 'extractedFields') IS DISTINCT FROM (OLD.data::jsonb - 'extractedFields')
        OR OLD.data::jsonb ? 'extractedFields'
      THEN RAISE EXCEPTION 'Source documents are immutable except initial extraction'; END IF;
      RETURN NEW;
    END; $$""")
    op.execute('CREATE TRIGGER document_source_immutable BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION protect_document_source()')
    op.execute('CREATE TRIGGER document_no_truncate BEFORE TRUNCATE ON documents FOR EACH STATEMENT EXECUTE FUNCTION reject_event_mutation()')

def downgrade():
    raise RuntimeError('EI-1.0 downgrade would destroy immutable evidence. Restore an isolated backup instead.')
