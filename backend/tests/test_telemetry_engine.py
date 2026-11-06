from copy import deepcopy
from datetime import timedelta
import pytest
from app.telemetry_engine import evaluate, instant, iso
from scripts.export_telemetry_examples import example, START

@pytest.mark.parametrize('name,code', [('healthy',None), ('missing','MISSING'), ('spike','SPIKE'),
    ('repeated','REPEATED'), ('fluctuation','FLUCTUATION'), ('delayed','DELAYED'), ('conflict','CONFLICT')])
def test_shared_scenarios(name, code):
    snapshot = example(name)['snapshot']
    codes = {f['code'] for f in snapshot['findings']}
    assert code in codes if code else not codes
    assert snapshot == example(name)['snapshot']

def evaluated(rows, seconds=20, status='ACTIVE'):
    session = example('healthy')['sessionResponse']
    session['status'] = status
    return evaluate(session, rows, iso(START+timedelta(seconds=seconds)))

def row(index, value, source='SENSOR_A', measured=None, delay=0):
    time = START+timedelta(seconds=2*index if measured is None else measured)
    return dict(id=f'obs_{index:03d}_{source}', eventId=str(index), sessionId='tel_example',
        sourceId=source, measuredAt=iso(time), receivedAt=iso(time+timedelta(seconds=delay)), value=value)

def test_statistical_boundaries_and_breaks():
    base = [row(i,80) for i in range(5)]
    assert not any(f['code'] in ('SPIKE','REPEATED','FLUCTUATION') for f in evaluated(base)['findings'])
    assert 'SPIKE' not in evaluated(base+[row(5,100)])['observations'][-1]['flags']
    assert 'SPIKE' in evaluated(base+[row(5,100.01)])['observations'][-1]['flags']
    assert 'REPEATED' in evaluated(base+[row(5,80)])['observations'][-1]['flags']
    assert 'REPEATED' not in evaluated(base+[row(5,80,measured=9.99)])['observations'][-1]['flags']
    for bad in (row(4,None), row(4,80,delay=5.001)):
        assert 'REPEATED' not in evaluated(base[:4]+[bad,row(5,80)])['observations'][-1]['flags']

def test_null_is_not_zero_latest_and_freshness_boundaries():
    assert all(s['status']=='WAITING' for s in evaluated([],6)['sources'])
    assert all(s['status']=='STALE' for s in evaluated([],6.001)['sources'])
    snapshot = evaluated([row(0,80),row(1,None)],8)
    assert snapshot['sources'][0]['latestValue'] is None
    assert snapshot['sources'][0]['status']=='SUSPECT'
    assert snapshot['sources'][0]['ageSeconds']==6
    assert evaluated([row(1,None)],8.001)['sources'][0]['status']=='STALE'
    assert evaluated([row(0,80,delay=7)],7)['sources'][0]['status']=='STALE'

def test_delayed_and_conflict_boundaries():
    assert 'DELAYED' not in evaluated([row(0,80,delay=5)])['observations'][0]['flags']
    assert 'DELAYED' in evaluated([row(0,80,delay=5.001)])['observations'][0]['flags']
    for difference, offset, count in ((15,2,0),(15.01,2,1),(16,2.001,0)):
        s=evaluated([row(0,80),row(1,80+difference,'SENSOR_B',measured=offset)])
        assert sum(f['code']=='CONFLICT' for f in s['findings'])==count
    assert not any(f['code']=='CONFLICT' for f in evaluated([row(0,80),row(1,110,'SENSOR_B',delay=6)])['findings'])

def test_order_late_data_immutability_and_end():
    rows=[row(i,v) for i,v in enumerate([80,80,80,80,80,180])]
    original=deepcopy(rows)
    assert evaluated(rows)==evaluated(list(reversed(rows)))
    assert rows==original
    for status in ('STOPPED','EXPIRED'):
        ended=evaluated(rows,1000,status)
        assert all(s['status']=='ENDED' for s in ended['sources'])
        assert not any(f['code']=='MISSING' for f in ended['findings'])
        assert any(f['code']=='SPIKE' for f in ended['findings'])
        assert 'historical' in ended['summary']

def test_conflict_tie_break_and_no_correction():
    rows=[row(1,80,measured=2),row(0,110,'SENSOR_B',measured=0),row(2,80,'SENSOR_B',measured=4),row(3,110,measured=0)]
    s=evaluated(rows)
    assert any(set(f['observationIds'])=={rows[0]['id'],rows[1]['id']} for f in s['findings'] if f['code']=='CONFLICT')
    together=[row(i,80 if i<5 else 180,source) for i in range(6) for source in ('SENSOR_A','SENSOR_B')]
    result=evaluated(together)
    assert [r['value'] for r in result['observations']][-2:]==[180,180]
    assert sum(f['code']=='SPIKE' for f in result['findings'])==2
