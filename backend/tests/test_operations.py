import json
import pytest
from app.db import make_engine
from scripts.operations import direct_url, verify_archive, file_hash, restore, pg_env
from scripts.operations import backup
from types import SimpleNamespace
from io import BytesIO

def test_tls_parameter_cannot_be_spoofed():
    with pytest.raises(RuntimeError):
        make_engine('postgresql://u:p@host/db?sslmode=disable&application_name=sslmode=require')

def test_production_requires_pooled_runtime_identity(monkeypatch):
    monkeypatch.setenv('ENVIRONMENT','production')
    for url in ('postgresql://clyra_app:p@host/db?sslmode=require',
                'postgresql://owner:p@host-pooler.example/db?sslmode=require'):
        with pytest.raises(RuntimeError):
            make_engine(url)

def test_recovery_requires_direct_tls(monkeypatch):
    for url in ('postgresql://u:p@host-pooler.example/db?sslmode=require', 'postgresql://u:p@host/db?sslmode=disable'):
        monkeypatch.setenv('BACKUP_DATABASE_URL',url)
        with pytest.raises(RuntimeError):
            direct_url('BACKUP_DATABASE_URL')

def test_backup_integrity_before_decryption(tmp_path, monkeypatch):
    archive = tmp_path/'db.age'
    archive.write_bytes(b'corrupt')
    archive.with_suffix('.age.json').write_text(json.dumps({'sha256':'not-the-hash'}))
    with pytest.raises(RuntimeError, match='checksum'):
        verify_archive(archive)

def test_restore_refuses_source_host_before_connection(monkeypatch):
    monkeypatch.setenv('BACKUP_DATABASE_URL','postgresql://backup:p@host/db?sslmode=require')
    monkeypatch.setenv('RESTORE_DATABASE_URL','postgresql://owner:p@host/other?sslmode=require')
    with pytest.raises(RuntimeError, match='isolated'):
        restore('unused.age','other')

def test_pg_credentials_are_in_environment(monkeypatch):
    monkeypatch.setenv('BACKUP_DATABASE_URL','postgresql://backup:secret@host/db?sslmode=require')
    env = pg_env(direct_url('BACKUP_DATABASE_URL'))
    assert env['PGPASSWORD']=='secret' and env['PGSSLMODE']=='require'

@pytest.mark.parametrize('dump_status,encryption_status',[(1,0),(0,1)])
def test_failed_backup_is_never_published(tmp_path,monkeypatch,dump_status,encryption_status):
    monkeypatch.setenv('BACKUP_DATABASE_URL','postgresql://backup:secret@host/db?sslmode=require')
    monkeypatch.setenv('BACKUP_AGE_RECIPIENT','age1synthetic')
    process=SimpleNamespace(stdout=BytesIO(b'PGDMP'),wait=lambda:dump_status,poll=lambda:dump_status)
    monkeypatch.setattr('scripts.operations.subprocess.Popen',lambda *a,**k:process)
    monkeypatch.setattr('scripts.operations.subprocess.run',lambda *a,**k:SimpleNamespace(returncode=encryption_status))
    destination=tmp_path/'backup.dump.age'
    with pytest.raises(RuntimeError,match='failed'):
        backup(destination)
    assert not destination.exists()
    assert not destination.with_suffix('.age.json').exists()
