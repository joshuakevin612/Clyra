"""TR-1.0 sessions, immutable observations and restricted runtime grants."""
import os
import re
from alembic import op
from app.db import TelemetrySession, TelemetryObservation

revision = '0004'
down_revision = '0003'

def upgrade():
    bind = op.get_bind()
    # 0001 imports current metadata on fresh installs, so tables may exist.
    for table in (TelemetrySession.__table__, TelemetryObservation.__table__):
        table.create(bind, checkfirst=True)
    if bind.dialect.name != 'postgresql':
        return
    role = os.getenv('APPLICATION_DB_ROLE', 'clyra_app')
    if not re.fullmatch('[a-zA-Z_][a-zA-Z0-9_]*', role):
        raise RuntimeError('Invalid APPLICATION_DB_ROLE.')
    op.execute(f'REVOKE ALL ON telemetry_sessions, telemetry_observations FROM PUBLIC, "{role}"')
    op.execute(f'GRANT SELECT, INSERT, UPDATE ON telemetry_sessions TO "{role}"')
    op.execute(f'GRANT SELECT, INSERT ON telemetry_observations TO "{role}"')
    op.execute('CREATE TRIGGER telemetry_observations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON telemetry_observations FOR EACH STATEMENT EXECUTE FUNCTION reject_event_mutation()')

def downgrade():
    TelemetryObservation.__table__.drop(op.get_bind())
    TelemetrySession.__table__.drop(op.get_bind())
