"""Exercise the additive migration against an isolated pre-telemetry database."""
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from app.db import Base

def test_upgrade_from_0003_preserves_existing_records(tmp_path, monkeypatch):
    url = 'sqlite:///'+(tmp_path/'telemetry-migration.db').as_posix()
    engine = create_engine(url)
    previous = [table for table in Base.metadata.sorted_tables if not table.name.startswith('telemetry_')]
    Base.metadata.create_all(engine, tables=previous)
    with engine.begin() as db:
        db.execute(text("INSERT INTO organisations (id, version, data) VALUES ('org_keep', 7, '{}')"))
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root/'alembic.ini'))
    config.set_main_option('script_location', str(root/'alembic'))
    monkeypatch.setenv('ENVIRONMENT','test')
    monkeypatch.setenv('MIGRATION_DATABASE_URL',url)
    command.stamp(config,'0003')
    command.upgrade(config,'head')
    inspector = inspect(engine)
    assert {'telemetry_sessions','telemetry_observations'} <= set(inspector.get_table_names())
    indexes = {i['name'] for table in ('telemetry_sessions','telemetry_observations') for i in inspector.get_indexes(table)}
    assert {'uq_telemetry_creation','uq_telemetry_event','ix_telemetry_measurement','ix_telemetry_patient_started'} <= indexes
    with engine.connect() as db:
        assert db.execute(text("SELECT version FROM organisations WHERE id='org_keep'")).scalar()==7
        assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()=='0004'
    engine.dispose()
