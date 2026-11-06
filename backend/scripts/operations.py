"""Fail-closed database checks and encrypted recovery commands. No secret output."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
from datetime import datetime, timezone
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from app.db import Base, Document, Medication, ExternalImport, factory

SCHEMA_REVISION = '0005'

def direct_url(key):
    value = os.environ.get(key)
    if not value:
        raise RuntimeError(f'{key} is required.')
    url = make_url(value)
    if url.drivername not in ('postgres', 'postgresql', 'postgresql+psycopg'):
        raise RuntimeError('Recovery requires PostgreSQL.')
    if '-pooler.' in (url.host or '') or url.query.get('sslmode') not in ('require', 'verify-full'):
        raise RuntimeError('Recovery requires a direct TLS connection.')
    return url.set(drivername='postgresql+psycopg')

def pg_env(url):
    env = dict(os.environ)
    env.update(PGHOST=url.host or '', PGPORT=str(url.port or 5432),
               PGDATABASE=url.database or '', PGUSER=url.username or '',
               PGPASSWORD=url.password or '', PGSSLMODE=url.query['sslmode'],
               PGCONNECT_TIMEOUT='15')
    return env

def file_hash(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()

def integrity(engine):
    with engine.connect() as connection:
        revision = connection.execute(text('SELECT version_num FROM alembic_version')).scalar_one()
        if revision != SCHEMA_REVISION:
            raise RuntimeError('Unexpected schema revision.')
    missing = set(Base.metadata.tables) - set(inspect(engine).get_table_names())
    if missing:
        raise RuntimeError('Required tables are missing.')
    counts = {}
    with factory(engine)() as db:
        for name, table in Base.metadata.tables.items():
            counts[name] = db.scalar(select(text('count(*)')).select_from(table))
            # Check every declared FK, including schemas restored without validation.
            for fk in table.foreign_keys:
                target = fk.column
                orphan = select(table.c.id).where(fk.parent.is_not(None),
                    ~select(target).where(target == fk.parent).exists()).limit(1)
                if db.execute(orphan).first():
                    raise RuntimeError('Orphaned foreign key detected.')
        for medication in db.scalars(select(Medication)):
            doc = db.get(Document, medication.data['sourceDocumentId'])
            span = medication.data['source']
            if (not doc or doc.patient_id != medication.patient_id or
                span['documentId'] != doc.id or span['charStart'] < 0 or
                span['charEnd'] < span['charStart'] or
                doc.data['rawText'][span['charStart']:span['charEnd']] != span['quote']):
                raise RuntimeError('Medication evidence integrity failed.')
        for evidence in db.scalars(select(ExternalImport)):
            if hashlib.sha256(evidence.data['rawText'].encode('utf-8')).hexdigest()!=evidence.content_hash:
                raise RuntimeError('External evidence hash mismatch.')
            if evidence.data['status']=='CONFIRMED':
                doc=db.get(Document,evidence.data['documentId'])
                if not doc or doc.patient_id!=evidence.patient_id or doc.data['rawText']!=evidence.data['rawText']:
                    raise RuntimeError('External evidence association integrity failed.')
    return {'schemaRevision': revision, 'rowCounts': counts}

def runtime_check(engine):
    """Read-only privilege checks; no mutations against the canonical demo."""
    with engine.connect() as db:
        role = db.execute(text('SELECT current_user')).scalar_one()
        flags = db.execute(text('SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).one()
        if role != os.getenv('APPLICATION_DB_ROLE', 'clyra_app') or any(flags):
            raise RuntimeError('Runtime role has unexpected identity or elevated flags.')
        if db.execute(text("SELECT EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=current_user)")).scalar():
            raise RuntimeError('Runtime role must not have role memberships.')
        if db.execute(text("SELECT has_schema_privilege(current_user,'public','CREATE')")).scalar():
            raise RuntimeError('Runtime role can create schema objects.')
        for table in Base.metadata.tables:
            owner = db.execute(text("SELECT tableowner=current_user FROM pg_tables WHERE schemaname='public' AND tablename=:table"), {'table': table}).scalar()
            if owner is not False:
                raise RuntimeError('Runtime role owns a table or a required table is missing.')
            for privilege in ('SELECT', 'INSERT'):
                if not db.execute(text('SELECT has_table_privilege(current_user,:table,:privilege)'), {'table':table,'privilege':privilege}).scalar():
                    raise RuntimeError('Runtime role is missing required privileges.')
            if db.execute(text("SELECT has_table_privilege(current_user,:table,'TRUNCATE')"), {'table':table}).scalar():
                raise RuntimeError('Runtime role can truncate application data.')
            if table in ('audit_events','access_events','telemetry_observations','discrepancy_decisions'):
                for privilege in ('UPDATE','DELETE'):
                    if db.execute(text('SELECT has_table_privilege(current_user,:table,:privilege)'), {'table':table,'privilege':privilege}).scalar():
                        raise RuntimeError('Runtime role can mutate immutable evidence.')
            if table in ('external_imports','documents','medication_entries'):
                if db.execute(text("SELECT has_table_privilege(current_user,:table,'DELETE')"), {'table':table}).scalar():
                    raise RuntimeError('Runtime role can delete retained evidence.')
        for table in ('audit_events','access_events','telemetry_observations','medication_entries','external_imports','documents','discrepancy_decisions'):
            if not db.execute(text("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(:table) AND NOT tgisinternal AND tgenabled='O')"), {'table':table}).scalar():
                raise RuntimeError('Required evidence protection trigger is missing.')
    return {'runtimeRole': 'restricted', **integrity(engine)}

def apply_runtime_grants(engine):
    # ACL restoration is idempotent and transactional, so a lost connection can
    # safely retry the entire transaction without altering clinical records.
    for attempt in range(3):
        try:
            return _apply_runtime_grants(engine)
        except DBAPIError as exc:
            if not exc.connection_invalidated or attempt==2:
                raise

def _apply_runtime_grants(engine):
    """Reapply reviewed application ACLs after --no-acl restoration."""
    role=os.getenv('APPLICATION_DB_ROLE','clyra_app')
    if not re.fullmatch('[a-zA-Z_][a-zA-Z0-9_]*',role):
        raise RuntimeError('Invalid application role.')
    immutable={'audit_events','access_events','telemetry_observations','discrepancy_decisions'}
    retained={'documents','medication_entries','external_imports','telemetry_sessions'}
    with engine.begin() as db:
        if db.execute(text('SELECT current_user')).scalar()==role:
            raise RuntimeError('Restore grants require separate owner credentials.')
        flags=db.execute(text('SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=:role'),{'role':role}).first()
        if not flags or any(flags):
            raise RuntimeError('Provision a restricted runtime role before restoration.')
        db.execute(text('REVOKE CREATE ON SCHEMA public FROM PUBLIC'))
        db.execute(text(f'REVOKE ALL ON SCHEMA public FROM "{role}"'))
        db.execute(text(f'GRANT USAGE ON SCHEMA public TO "{role}"'))
        for table in Base.metadata.tables:
            db.execute(text(f'REVOKE ALL ON TABLE "{table}" FROM PUBLIC, "{role}"'))
            privileges='SELECT, INSERT' if table in immutable else 'SELECT, INSERT, UPDATE' if table in retained else 'SELECT, INSERT, UPDATE, DELETE'
            db.execute(text(f'GRANT {privileges} ON TABLE "{table}" TO "{role}"'))
        db.execute(text(f'GRANT SELECT ON alembic_version TO "{role}"'))

def backup(destination):
    url = direct_url('BACKUP_DATABASE_URL')
    recipient = os.environ.get('BACKUP_AGE_RECIPIENT')
    if not recipient:
        raise RuntimeError('BACKUP_AGE_RECIPIENT is required.')
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents accidentally overwriting a retained backup.
    if destination.exists():
        raise RuntimeError('Backup destination already exists.')
    partial = destination.with_suffix(destination.suffix+'.partial')
    with partial.open('xb') as encrypted:
        dump = subprocess.Popen(['pg_dump','--format=custom','--no-owner','--no-acl'], env=pg_env(url), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            encryption = subprocess.run(['age','--recipient',recipient], stdin=dump.stdout, stdout=encrypted, stderr=subprocess.DEVNULL)
            dump.stdout.close()
            if encryption.returncode or dump.wait():
                raise RuntimeError('Backup or encryption failed; partial file is not usable.')
        finally:
            if dump.poll() is None:
                dump.kill()
                dump.wait()
    partial.rename(destination)
    manifest = {'format': 1, 'sha256':file_hash(destination), 'createdAt':datetime.now(timezone.utc).isoformat()}
    destination.with_suffix(destination.suffix+'.json').write_text(json.dumps(manifest, indent=2)+'\n')
    return {'backup':'encrypted', 'sha256':manifest['sha256']}

def verify_archive(archive):
    archive = Path(archive)
    manifest = json.loads(archive.with_suffix(archive.suffix+'.json').read_text())
    if file_hash(archive) != manifest['sha256']:
        raise RuntimeError('Backup checksum mismatch.')
    identity = os.environ.get('BACKUP_AGE_IDENTITY_FILE')
    if not identity or not Path(identity).is_file():
        raise RuntimeError('BACKUP_AGE_IDENTITY_FILE is required for authenticated decryption.')
    return ['age','--decrypt','--identity',identity,str(archive)]

def consume_archive(archive, restore_url=None):
    decrypt_command = verify_archive(archive)
    decrypt = subprocess.Popen(decrypt_command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        if restore_url is None:
            # Drain the entire ciphertext to verify every age authentication tag.
            # No decrypted temporary files, and constant memory for large archives.
            magic = decrypt.stdout.read(5)
            for chunk in iter(lambda: decrypt.stdout.read(1024 * 1024), b''):
                pass
            decrypt.stdout.close()
            if decrypt.wait() or magic != b'PGDMP':
                raise RuntimeError('Authenticated archive verification failed.')
            return
        command = ['pg_restore','--exit-on-error','--single-transaction','--no-owner','--no-acl']
        command += ['--dbname', restore_url.database]
        restore = subprocess.run(command, env=pg_env(restore_url) if restore_url else None,
                                 stdin=decrypt.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        decrypt.stdout.close()
        if restore.returncode or decrypt.wait():
            raise RuntimeError('Archive verification or restore failed.')
    finally:
        if decrypt.poll() is None:
            decrypt.kill()
            decrypt.wait()

def restore(archive, confirmation):
    source = direct_url('BACKUP_DATABASE_URL')
    target = direct_url('RESTORE_DATABASE_URL')
    # Host must differ, even if a second database name was supplied on the same host.
    if target.host == source.host or confirmation != target.database:
        raise RuntimeError('Restore requires an isolated host and exact target database confirmation.')
    engine = create_engine(target,pool_pre_ping=True,connect_args={'connect_timeout':15,'prepare_threshold':None})
    with engine.connect() as db:
        if db.execute(text("SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','S','f','p'))")).scalar():
            raise RuntimeError('Restore target public schema must be empty.')
    consume_archive(archive, target)
    apply_runtime_grants(engine)
    return {'restore':'passed', **integrity(engine)}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['runtime-check','integrity','backup','verify','restore'])
    parser.add_argument('--file')
    parser.add_argument('--confirm-database')
    args = parser.parse_args()
    try:
        if args.command == 'runtime-check':
            from app.db import make_engine
            result = runtime_check(make_engine())
        elif args.command == 'integrity':
            result = integrity(create_engine(direct_url('BACKUP_DATABASE_URL')))
        elif not args.file:
            raise RuntimeError('--file is required.')
        elif args.command == 'backup':
            result = backup(args.file)
        elif args.command == 'verify':
            consume_archive(args.file)
            result = {'archive':'verified'}
        else:
            result = restore(args.file, args.confirm_database)
        print(json.dumps(result, sort_keys=True))
    except Exception:
        # Driver/tool errors may contain credentials or evidence. Keep logs non-sensitive.
        parser.exit(1, 'Operation failed. Check credentials, isolation, tool availability and prerequisites securely.\n')

if __name__ == '__main__':
    main()
