"""Restrict the separately provisioned runtime role; block log mutations."""
import os
import re
from alembic import op
from sqlalchemy import text
revision='0002'
down_revision='0001'

def upgrade():
    bind=op.get_bind()
    if bind.dialect.name!='postgresql':
        return  # SQLite exists only for isolated test execution.
    role=os.getenv('APPLICATION_DB_ROLE','clyra_app')
    if not re.fullmatch('[a-zA-Z_][a-zA-Z0-9_]*',role):
        raise RuntimeError('Invalid APPLICATION_DB_ROLE.')
    record=bind.execute(text('SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname=:role'),{'role':role}).first()
    if not record or record.rolsuper or record.rolcreaterole:
        raise RuntimeError('Provision a non-superuser, non-CREATEROLE application role first.')
    owner=bind.execute(text("SELECT tableowner FROM pg_tables WHERE schemaname=current_schema() AND tablename='audit_events'")).scalar()
    if owner==role:
        raise RuntimeError('The runtime role must not own the event tables. Run migrations as the owner role.')
    inherited=bind.execute(text("SELECT 1 FROM pg_roles r WHERE r.rolname <> :role AND pg_has_role(:role, r.oid, 'MEMBER') LIMIT 1"),{'role':role}).first()
    if inherited:
        raise RuntimeError('The application role must have no memberships in other roles.')
    op.execute(f'GRANT USAGE ON SCHEMA public TO "{role}"')
    op.execute('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
    op.execute(f'REVOKE CREATE ON SCHEMA public FROM "{role}"')
    tables='organisations, users, sessions, patients, visits, organisation_patient_access, link_requests, record_migrations, documents, extraction_jobs, medication_entries, discrepancies, discrepancy_decisions, login_attempts'
    op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {tables} TO "{role}"')
    for table in ('audit_events','access_events'):
        op.execute(f'REVOKE ALL ON TABLE {table} FROM PUBLIC, "{role}"')
        op.execute(f'GRANT SELECT, INSERT ON TABLE {table} TO "{role}"')
    op.execute("""CREATE FUNCTION reject_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Event tables are append-only'; END; $$""")
    for table in ('audit_events','access_events'):
        op.execute(f'CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON {table} FOR EACH STATEMENT EXECUTE FUNCTION reject_event_mutation()')

def downgrade():
    if op.get_bind().dialect.name!='postgresql':
        return
    for table in ('audit_events','access_events'):
        op.execute(f'DROP TRIGGER {table}_immutable ON {table}')
    op.execute('DROP FUNCTION reject_event_mutation()')
