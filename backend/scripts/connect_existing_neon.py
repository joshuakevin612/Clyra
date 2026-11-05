"""Recover existing development connections through read-only Neon management calls."""
import json
from pathlib import Path
import sys
import httpx
from dotenv import dotenv_values
from sqlalchemy.engine import make_url
ROOT=Path(__file__).resolve().parents[2]
def main():
    meta=json.loads((ROOT/'backend/neon-development.json').read_text())
    key=dotenv_values(ROOT/'.env.neon').get('NEON_API_KEY')
    if not key:raise RuntimeError('NEON_API_KEY is missing from the local ignored file.')
    project,branch=meta['projectId'],meta['branchId']
    with httpx.Client(base_url='https://console.neon.tech/api/v2',headers={'Authorization':'Bearer '+key},timeout=45) as client:
        def get(path,params=None):
            r=client.get(path,params=params)
            if not r.is_success:raise RuntimeError(f'Neon management request failed with HTTP {r.status_code}; response withheld.')
            return r.json()
        detail=get(f'/projects/{project}/branches/{branch}')['branch']
        if detail['id']!=branch or detail['name']!='clyra-backend-dev' or detail.get('default'):
            raise RuntimeError('The selected branch is not the recorded non-default Clyra development branch.')
        print('Confirmed existing development branch:',detail['name'])
        roles=get(f'/projects/{project}/branches/{branch}/roles')['roles']
        if not any(r['name']=='clyra_app' for r in roles):raise RuntimeError('Existing restricted runtime role is missing; no roles were changed.')
        for role,pooled,target,var in [('clyra_app',True,'backend/.env','DATABASE_URL'),('neondb_owner',False,'backend/.env.migrations','MIGRATION_DATABASE_URL')]:
            dest=ROOT/target
            if dest.exists() and dotenv_values(dest).get(var):
                print('Preserved existing',target);continue
            raw=get(f'/projects/{project}/connection_uri',{'branch_id':branch,'database_name':'clyra','role_name':role,'pooled':str(pooled).lower()})['uri']
            url=make_url(raw)
            if not url.password:raise RuntimeError('Neon did not return an existing role password. No credentials were rotated.')
            if url.username!=role or url.database!='clyra':raise RuntimeError('Returned connection does not match the requested role and database.')
            url=url.set(drivername='postgresql+psycopg',query={**url.query,'sslmode':'require'})
            extras='APPLICATION_DB_ROLE=clyra_app\n'
            if var=='DATABASE_URL':extras+='ENVIRONMENT=development\nTOKEN_TTL_HOURS=8\nCORS_ORIGINS=http://127.0.0.1:5177\n'
            dest.write_text(var+'='+url.render_as_string(hide_password=False)+'\n'+extras,encoding='utf-8')
            print('Saved',target,'without printing credentials.')
if __name__=='__main__':
    try:main()
    except Exception as exc:
        print(str(exc) if isinstance(exc,RuntimeError) else 'Connection recovery failed; '+type(exc).__name__+' details withheld to protect secrets.',file=sys.stderr)
        sys.exit(1)
