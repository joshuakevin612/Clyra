"""Create synthetic development logins; never print passwords or seed production."""
import os
from pathlib import Path
import secrets
from dotenv import dotenv_values
from app.db import make_engine, factory
from scripts.seed import seed

def main():
    if os.getenv('ENVIRONMENT','development').lower()=='production':
        raise RuntimeError('Development bootstrap is forbidden in production.')
    target=Path(__file__).resolve().parents[1]/'.env.development-logins'
    credentials=dotenv_values(target) if target.exists() else {
        'FIXTURE_PASSWORD':secrets.token_urlsafe(24),
        'SUPER_ADMIN_USERNAME':'superadmin.clyra',
        'SUPER_ADMIN_PASSWORD':secrets.token_urlsafe(24),
    }
    if not target.exists():
        target.write_text(''.join(f'{k}={v}\n' for k,v in credentials.items()),encoding='utf-8')
    original={k:os.environ.get(k) for k in ('SUPER_ADMIN_USERNAME','SUPER_ADMIN_PASSWORD')}
    try:
        for key in original:
            os.environ[key]=credentials[key]
        with factory(make_engine()).begin() as db:
            seed(db,credentials['FIXTURE_PASSWORD'])
    finally:
        for key,value in original.items():
            if value is None:
                os.environ.pop(key,None)
            else:
                os.environ[key]=value
    print('Synthetic logins seeded. Credentials are in backend/.env.development-logins (gitignored).')

if __name__=='__main__':
    main()
