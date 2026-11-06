"""Authenticated read-only smoke test. Prompts securely; never logs response bodies."""
import argparse
import getpass
import httpx

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--base-url',required=True)
    parser.add_argument('--username',required=True)
    args=parser.parse_args()
    base=args.base_url.rstrip('/')
    if not base.startswith('https://') and not base.startswith(('http://127.0.0.1:','http://localhost:')):
        parser.error('HTTPS is required outside localhost.')
    password=getpass.getpass('Synthetic verification account password: ')
    try:
        with httpx.Client(timeout=30,follow_redirects=False) as client:
            assert client.get(base+'/health').json()=={'status':'ok'}
            login=client.post(base+'/api/v1/auth/login',json={'username':args.username,'password':password})
            assert login.status_code==200
            headers={'Authorization':'Bearer '+login.json()['accessToken']}
            try:
                for route in ('/auth/me','/patients'):
                    response=client.get(base+'/api/v1'+route,headers=headers)
                    assert response.status_code==200
                    assert response.headers.get('cache-control')=='no-store, private'
            finally:
                logout=client.post(base+'/api/v1/auth/logout',headers=headers)
            assert logout.status_code==200
            assert client.get(base+'/api/v1/auth/me',headers=headers).status_code==401
        print('Health, authentication, patient read, private caching and logout passed.')
    except Exception:
        parser.exit(1,'Smoke test failed. Check service configuration securely; no response content logged.\n')

if __name__=='__main__':
    main()
