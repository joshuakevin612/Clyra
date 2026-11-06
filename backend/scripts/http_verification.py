"""Exercise the actual HTTP server on an explicitly isolated synthetic database."""
import argparse
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from uuid import uuid4
from dotenv import dotenv_values
import httpx
from sqlalchemy.engine import make_url

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--environment-file',required=True)
    args=parser.parse_args()
    values=dotenv_values(args.environment_file)
    url=make_url(values['DATABASE_URL'])
    if not (url.database or '').startswith(('clyra_stage1_','clyra_restore_')):
        raise RuntimeError('HTTP verification requires an isolated verification database.')
    canonical=dotenv_values(Path(__file__).resolve().parents[1]/'.env')['DATABASE_URL']
    if (url.host or '').replace('-pooler.','.')==(make_url(canonical).host or '').replace('-pooler.','.'):
        raise RuntimeError('HTTP verification cannot use the canonical host.')
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0))
        port=listener.getsockname()[1]
    # The API subprocess receives runtime credentials only, never owner/backup keys.
    child_env={k:v for k,v in os.environ.items() if not k.startswith(('MIGRATION_','BACKUP_','RESTORE_','CLYRA_POSTGRES_'))}
    child_env.update(DATABASE_URL=values['DATABASE_URL'],ENVIRONMENT='test',APPLICATION_DB_ROLE='clyra_app')
    process=subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--host','127.0.0.1',
        '--port',str(port),'--no-access-log'],env=child_env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        base=f'http://127.0.0.1:{port}'
        with httpx.Client(base_url=base,timeout=30) as client:
            deadline=time.monotonic()+30
            while True:
                try:
                    assert client.get('/health').json()=={'status':'ok'}
                    break
                except httpx.ConnectError:
                    if process.poll() is not None or time.monotonic()>deadline:
                        raise RuntimeError('Verification server failed to start.')
                    time.sleep(0.2)
            login=client.post('/api/v1/auth/login',json={'username':'dr.north','password':'Clyra-test-2026'})
            assert login.status_code==200,'Login failed'
            headers={'Authorization':'Bearer '+login.json()['accessToken']}
            visits=client.get('/api/v1/patients/pat_001/visits',headers=headers).json()['items']
            raw=(Path(__file__).resolve().parents[2]/'fixtures/documents/doc_001a.txt').read_text(encoding='utf-8')
            raw=raw.replace('Synthetic source instruction.', 'Synthetic HTTP verification '+str(uuid4())+'.')
            staged=client.post('/api/v1/external-imports',headers=headers,
                data={'patientId':'pat_001','sourceLabel':'Synthetic HTTP verification','visitDate':'2026-11-06','requestId':str(uuid4())},
                files={'file':('synthetic-http.txt',raw,'text/plain')})
            assert staged.status_code==201,'Staging failed'
            imported=staged.json()
            assert imported['status']=='PENDING_ASSOCIATION' and imported['documentId'] is None
            patient=client.get('/api/v1/patients/pat_001',headers=headers).json()
            confirmed=client.post('/api/v1/external-imports/'+imported['id']+'/confirm',headers=headers,
                json={'ifVersion':imported['version'],'patientId':'pat_001','patientIfVersion':patient['version'],'confirmAssociation':True})
            assert confirmed.status_code==200,'Confirmation failed'
            document_id=confirmed.json()['documentId']
            source=client.get('/api/v1/documents/'+document_id,headers=headers)
            assert source.status_code==200 and source.json()['rawText']==raw
            assert source.headers['cache-control']=='no-store, private'
            comparison=client.get('/api/v1/patients/pat_001/comparison',headers=headers,
                params={'leftVisitId':visits[0]['id'],'rightVisitId':confirmed.json()['visitId']})
            assert comparison.status_code==200
            assert any(entry['sourceDocumentId']==document_id for entry in comparison.json()['right'])
            assert client.post('/api/v1/auth/logout',headers=headers).status_code==200
            assert client.get('/api/v1/auth/me',headers=headers).status_code==401
        print('HTTP verification passed: health, login, stage, confirmation, exact source, comparison, no-store and logout.')
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()

if __name__=='__main__':
    main()
