from dotenv import dotenv_values
from pathlib import Path
import httpx
import sys
credentials=dotenv_values(Path(__file__).resolve().parents[1]/'.env.development-logins')
try:
    with httpx.Client(base_url=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8001',timeout=25) as client:
        r=client.post('/api/v1/auth/login',json={'username':'dr.north','password':credentials['FIXTURE_PASSWORD']})
        print('Running API login status:',r.status_code)
        if r.status_code==200:
            headers={'Authorization':'Bearer '+r.json()['accessToken']}
            result=client.get('/api/v1/patients',headers=headers)
            print('Running API patient-list status:',result.status_code)
            print('Running API logout status:',client.post('/api/v1/auth/logout',headers=headers).status_code)
except Exception as exc:
    print('Running API authentication check failed:',type(exc).__name__,'(details withheld)')
    raise SystemExit(1)
