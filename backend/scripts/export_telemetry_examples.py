"""Export deterministic shared request/response examples; no database needed."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID
from itertools import groupby
from app.telemetry_engine import evaluate, iso
from app.telemetry_schemas import TelemetrySnapshot, TelemetryReadings

START = datetime(2026, 11, 5, tzinfo=timezone.utc)

def example(name):
    session = dict(id='tel_example', patientId='pat_001', version=1, status='ACTIVE',
        startedAt=iso(START), expiresAt=iso(START+timedelta(minutes=15)), stoppedAt=None,
        metric='HEART_RATE', unit='BPM', expectedIntervalSeconds=2,
        sources=[{'id':'SENSOR_A','label':'Synthetic sensor A'}, {'id':'SENSOR_B','label':'Synthetic sensor B'}])
    if name == 'empty':
        return {'snapshot':evaluate(None, [], iso(START)), 'batches':[]}
    rows, batches = [], []
    for tick in range(11):
        batch = []
        for index, source in enumerate(('SENSOR_A','SENSOR_B')):
            if name == 'missing' and source == 'SENSOR_A' and tick > 5:
                continue
            value = (78,80,79,81,80)[tick%5]+index
            if source == 'SENSOR_A':
                if name == 'spike' and tick == 10: value = 180
                if name == 'repeated': value = 80
                if name == 'fluctuation': value = (60,110)[tick%2]
                if name == 'conflict': value += 30
            measured = START+timedelta(seconds=2*tick)
            received = measured+timedelta(seconds=8 if name == 'delayed' and source == 'SENSOR_A' else 0)
            event = str(UUID(int=tick*2+index+1))
            reading = dict(eventId=event, sourceId=source, measuredAt=iso(measured), value=value)
            batch.append(reading)
            rows.append(dict(reading, id=f'obs_{tick:02d}_{index}', sessionId=session['id'], receivedAt=iso(received)))
        if batch:
            TelemetryReadings.model_validate({'readings':batch})
            batches.append({'readings':batch})
    snapshot = evaluate(session, rows, iso(START+timedelta(seconds=28 if name == 'delayed' else 20)))
    TelemetrySnapshot.model_validate(snapshot)
    exchanges = []
    for received, group in groupby(sorted(rows, key=lambda r:r['receivedAt']), key=lambda r:r['receivedAt']):
        readings = [{k:r[k] for k in ('eventId','sourceId','measuredAt','value')} for r in group]
        exchanges.append({'request':{'readings':readings},
            'response':{'acceptedCount':len(readings), 'duplicateCount':0, 'serverTime':received}})
    return {'createRequest':{'requestId':str(UUID(int=100))}, 'sessionResponse':session,
            'batches':[e['request'] for e in exchanges], 'ingestionExchanges':exchanges, 'snapshot':snapshot}

def main():
    directory = Path(__file__).resolve().parents[2]/'fixtures/telemetry'
    directory.mkdir(exist_ok=True)
    for name in ('empty','healthy','missing','spike','repeated','fluctuation','delayed','conflict'):
        (directory/f'{name}.json').write_text(json.dumps(example(name), indent=2)+'\n', encoding='utf-8')
    print('Exported eight validated telemetry examples.')

if __name__ == '__main__':
    main()
