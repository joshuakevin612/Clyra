"""Configure an already selected Neon development branch without printing secrets."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import psycopg
from psycopg import sql
from dotenv import dotenv_values
from sqlalchemy.engine import make_url

ROOT=Path(__file__).resolve().parents[2]
BACKEND=ROOT/'backend'
CLI=ROOT/'.tools/neon/node_modules/.bin/neon.cmd'

def cli(*args):
    env=os.environ.copy()
    local=dotenv_values(ROOT/'.env.neon')
    if local.get('NEON_API_KEY'):
        env['NEON_API_KEY']=local['NEON_API_KEY']
    result=subprocess.run([str(CLI),*args],capture_output=True,text=True,timeout=90,env=env)
    if result.returncode:
        raise RuntimeError('Neon CLI command failed. Check sign-in/project access; output withheld to protect credentials.')
    return result.stdout.strip()

def configure(project_id, branch, database='clyra', owner='neondb_owner'):
    if not branch.startswith('br-'):
        raise RuntimeError('Use the exact selected development branch ID, not a default branch name.')
    runtime_file=BACKEND/'.env'
    migrations_file=BACKEND/'.env.migrations'
    existing=dotenv_values(runtime_file) if runtime_file.exists() else {}
    if existing.get('DATABASE_URL'):
        raise RuntimeError('backend/.env already has DATABASE_URL. Refusing to overwrite an existing connection.')
    if migrations_file.exists() and dotenv_values(migrations_file).get('MIGRATION_DATABASE_URL'):
        raise RuntimeError('Migration credentials already exist; reuse them instead of reprovisioning.')
    # Connection-string output is captured in memory and never forwarded to the terminal.
    raw=cli('connection-string',branch,'--project-id',project_id,'--role-name',owner,'--database-name','neondb')
    owner_url=make_url(raw)
    if not owner_url.host or '-pooler.' in owner_url.host:
        raise RuntimeError('Expected a direct owner connection.')
    role='clyra_app'
    runtime_password=secrets.token_urlsafe(36)
    conninfo=owner_url.set(drivername='postgresql').render_as_string(hide_password=False)
    with psycopg.connect(conninfo,autocommit=True,connect_timeout=15) as conn:
        if not conn.execute('SELECT 1 FROM pg_database WHERE datname=%s',(database,)).fetchone():
            conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
        if conn.execute('SELECT 1 FROM pg_roles WHERE rolname=%s',(role,)).fetchone():
            raise RuntimeError('clyra_app already exists on this branch. Refusing to rotate shared credentials.')
        conn.execute(sql.SQL('CREATE ROLE {} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD {}').format(sql.Identifier(role),sql.Literal(runtime_password)))
    direct=owner_url.set(database=database,drivername='postgresql+psycopg')
    runtime_host=owner_url.host.replace('.','-pooler.',1)
    runtime=direct.set(username=role,password=runtime_password,host=runtime_host)
    # Write the runtime credential first, allowing recovery after partial setup.
    runtime_text=runtime.render_as_string(hide_password=False)
    migration_text=direct.render_as_string(hide_password=False)
    runtime_file.write_text('DATABASE_URL='+runtime_text+'\nENVIRONMENT=development\nTOKEN_TTL_HOURS=8\nAPPLICATION_DB_ROLE='+role+'\n',encoding='utf-8')
    migrations_file.write_text('MIGRATION_DATABASE_URL='+migration_text+'\nAPPLICATION_DB_ROLE='+role+'\n',encoding='utf-8')
    print('Configured backend/.env (pooled runtime) and backend/.env.migrations (direct owner). No credentials printed.')
    result=subprocess.run([sys.executable,'-m','alembic','upgrade','head'],cwd=BACKEND,capture_output=True,text=True)
    if result.returncode:
        raise RuntimeError('Migration failed; local credentials were preserved. Run Alembic locally to inspect the failure.')
    print('Alembic migrations applied successfully.')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--project-id',required=True)
    parser.add_argument('--branch-id',required=True)
    parser.add_argument('--database',default='clyra')
    parser.add_argument('--owner',default='neondb_owner')
    args=parser.parse_args()
    try:
        configure(args.project_id,args.branch_id,args.database,args.owner)
    except Exception as exc:
        # Drivers can embed URLs or SQL with passwords in errors. Never print them.
        message=str(exc) if isinstance(exc,RuntimeError) else 'Database setup failed; credentials and SQL output withheld.'
        print(message,file=sys.stderr)
        return 1
    return 0

if __name__=='__main__':
    raise SystemExit(main())
