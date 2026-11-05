"""Local running-app smoke check: no login attempts and no database writes."""
import httpx
with httpx.Client(base_url='http://127.0.0.1:5177',timeout=20) as client:
    assert client.get('/').status_code==200
    response=client.get('/api/v1/auth/me')
    assert response.status_code==401
    assert response.json()['error']['code']=='UNAUTHENTICATED'
with httpx.Client(base_url='http://127.0.0.1:8001',timeout=20) as api:
    spec=api.get('/openapi.json').json()
    assert '/api/v1/patients/{patientId}/login' in spec['paths']
print('Local frontend, API proxy, authentication boundary and integrated schema verified. No login attempts or writes.')
