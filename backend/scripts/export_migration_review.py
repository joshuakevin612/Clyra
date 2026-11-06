"""Generate reviewable PostgreSQL DDL from the actual 0005 migration.

Alembic remains the deployment migration command. This artifact permits an
isolated SQL-transport verification when TCP database access is unavailable.
"""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
from sqlalchemy import create_mock_engine

def statements():
    output=[]
    engine=None
    def emit(sql,*args,**kwargs):
        output.append(str(sql.compile(dialect=engine.dialect)))
    engine=create_mock_engine('postgresql+psycopg://',emit)
    module_path=Path(__file__).resolve().parents[1]/'alembic/versions/0005_external_evidence.py'
    spec=importlib.util.spec_from_file_location('migration_review',module_path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.op=SimpleNamespace(get_bind=lambda:engine,execute=lambda sql:output.append(sql))
    module.upgrade()
    return output

if __name__=='__main__':
    target=Path(__file__).resolve().parents[2]/'contract/migration-0005-review.json'
    target.write_text(json.dumps(statements(),indent=2)+'\n',encoding='utf-8')
