"""Run API regressions with restricted credentials on an isolated test database."""
import argparse
import os
from dotenv import dotenv_values
from sqlalchemy.engine import make_url

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--environment-file',default='.env.stage1-tests')
    args=parser.parse_args()
    values=dotenv_values(args.environment_file)
    url=values.get('CLYRA_POSTGRES_TEST_URL')
    if not url or not (make_url(url).database or '').startswith('clyra_stage1_'):
        parser.error('Use a prepared isolated clyra_stage1_* database.')
    for key in list(os.environ):
        if key.startswith(('MIGRATION_','BACKUP_','RESTORE_')):
            os.environ.pop(key,None)
    os.environ.update(CLYRA_POSTGRES_TEST_URL=url,DATABASE_URL=url,ENVIRONMENT='test',APPLICATION_DB_ROLE='clyra_app')
    import pytest
    raise SystemExit(pytest.main(['tests','-q']))

if __name__=='__main__':
    main()
