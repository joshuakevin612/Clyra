def test_patient_login_metadata(setup, login):
    client, _ = setup
    north=login('dr.north')
    result=client.get('/api/v1/patients/pat_001/login',headers=north)
    assert result.status_code==200
    assert result.json()['username']=='alex.example'
    assert 'passwordHash' not in result.json()
    version=result.json()['version']
    assert client.patch('/api/v1/patients/pat_001/login',headers=north,json={'status':'DISABLED','ifVersion':version}).status_code==200
    assert client.patch('/api/v1/patients/pat_001/login',headers=north,json={'status':'ACTIVE','ifVersion':version}).status_code==409
    assert client.get('/api/v1/patients/pat_002/login',headers=north).status_code==404
    assert client.get('/api/v1/patients/pat_001/login',headers=login('dr.riverside')).status_code==403
    assert client.get('/api/v1/patients/pat_001/login',headers=login('admin.north')).status_code==403
def test_access_log_action_filter_uses_resource(setup, login):
    client, _ = setup
    client.get('/api/v1/patients/pat_001',headers=login('dr.north'))
    response=client.get('/api/v1/admin/access-log?action=PATIENT',headers=login('admin.north'))
    assert response.status_code==200
    assert response.json()['items']
    assert all(row['resource']=='PATIENT' for row in response.json()['items'])
