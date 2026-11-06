"""Run and retain an encrypted recovery drill across two isolated Neon branches.

Requires ignored .env.stage1-tests, .env.stage1-restore and local age/PG tools.
Does not schedule backups or access the canonical database for writes.
"""
from datetime import datetime,timezone
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
from dotenv import dotenv_values
from sqlalchemy import create_engine,select,text
from sqlalchemy.engine import make_url
from app.db import Base,make_engine
from .operations import backup,consume_archive,restore,runtime_check,apply_runtime_grants,integrity

def fingerprints(engine):
    result={}
    with engine.connect() as db:
        for name,table in Base.metadata.tables.items():
            rows=[dict(row._mapping) for row in db.execute(select(table).order_by(table.c.id))]
            encoded=json.dumps(rows,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode('utf-8')
            result[name]=hashlib.sha256(encoded).hexdigest()
    return result

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--resume-verification',help='Existing clyra_restore_* database from an interrupted drill; never restores over it.')
    args=parser.parse_args()
    backend=Path(__file__).resolve().parents[1]
    root=backend.parent
    source=dotenv_values(backend/'.env.stage1-tests')
    target=make_url(dotenv_values(backend/'.env.stage1-restore')['RESTORE_DATABASE_URL']).set(drivername='postgresql+psycopg')
    source_url=make_url(source['BACKUP_DATABASE_URL']).set(drivername='postgresql+psycopg')
    canonical=make_url(dotenv_values(backend/'.env')['DATABASE_URL'])
    normalized=lambda host:(host or '').replace('-pooler.','.')
    if (not (source_url.database or '').startswith('clyra_stage1_') or
        normalized(source_url.host)==normalized(canonical.host) or
        normalized(target.host) in (normalized(canonical.host),normalized(source_url.host))):
        raise RuntimeError('Drill requires two separate isolated branches.')
    tools=root/'.tools'
    pg_bin=Path(os.getenv('CLYRA_PG_BIN',str(tools/'postgresql18/pgsql/bin')))
    os.environ['PATH']=str(pg_bin)+os.pathsep+str(tools/'age')+os.pathsep+os.environ['PATH']
    key=tools/'stage1-recovery.agekey'
    if not key.exists():
        subprocess.run(['age-keygen','-o',str(key)],check=True,capture_output=True)
    recipient=subprocess.run(['age-keygen','-y',str(key)],check=True,capture_output=True,text=True).stdout.strip()
    name=args.resume_verification or 'clyra_restore_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')+'_'+secrets.token_hex(3)
    if not name.startswith('clyra_restore_') or not name.replace('_','').isalnum():
        raise RuntimeError('Invalid isolated restore verification database.')
    engine=create_engine(target,isolation_level='AUTOCOMMIT',connect_args={'connect_timeout':15})
    if not args.resume_verification:
        with engine.connect() as db:
            db.execute(text(f'CREATE DATABASE "{name}"'))
    engine.dispose()
    restored_url=target.set(database=name)
    os.environ.update(BACKUP_DATABASE_URL=source_url.render_as_string(hide_password=False),
        RESTORE_DATABASE_URL=restored_url.render_as_string(hide_password=False),
        BACKUP_AGE_RECIPIENT=recipient,BACKUP_AGE_IDENTITY_FILE=str(key),APPLICATION_DB_ROLE='clyra_app')
    source_engine=create_engine(source_url,pool_pre_ping=True,connect_args={'connect_timeout':15,'prepare_threshold':None})
    with source_engine.connect() as db:
        source_major=int(db.execute(text('SHOW server_version_num')).scalar())//10000
    client_version=subprocess.run(['pg_dump','--version'],check=True,capture_output=True,text=True).stdout
    import re
    client_major=int(re.search(r'PostgreSQL\) (\d+)',client_version).group(1))
    if client_major<source_major:
        raise RuntimeError(f'PostgreSQL client {client_major} is older than source server {source_major}.')
    original=fingerprints(source_engine)
    archive=tools/(name+'.dump.age')
    if not args.resume_verification:
        backup(archive)
    consume_archive(archive)
    restored_engine=create_engine(restored_url,pool_pre_ping=True,connect_args={'connect_timeout':15,'prepare_threshold':None})
    if args.resume_verification:
        # Verify committed data before retrying grants; never rerun pg_restore on
        # a nonempty target and never conceal a partial or incorrect restore.
        if fingerprints(restored_engine)!=original:
            raise RuntimeError('Interrupted restore does not match the frozen source.')
        apply_runtime_grants(restored_engine)
        result={'restore':'passed',**integrity(restored_engine)}
    else:
        result=restore(archive,name)
    if fingerprints(restored_engine)!=original:
        raise RuntimeError('Restored table fingerprints differ from frozen source.')
    runtime=make_url(source['DATABASE_URL']).set(host=target.host.replace('.', '-pooler.',1),database=name)
    result.update(runtime_check(make_engine(runtime.render_as_string(hide_password=False))))
    report={'completedAt':datetime.now(timezone.utc).isoformat(),'encryption':'age',
        'archiveVerification':'passed','tableFingerprintComparison':'passed','sourceDatabase':source_url.database,
        'restoredDatabase':name,**result}
    (tools/'stage1-restore-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    (backend/'.env.stage1-restored').write_text('DATABASE_URL='+runtime.render_as_string(hide_password=False)+'\nENVIRONMENT=test\nAPPLICATION_DB_ROLE=clyra_app\n',encoding='utf-8')
    print(json.dumps(report,sort_keys=True))

if __name__=='__main__':
    main()
