"""Ensure the published artifacts match runtime models and deterministic examples."""
import json
from pathlib import Path
import yaml
from app.main import app
from app.telemetry_schemas import TelemetrySnapshot, TelemetryReadings, TelemetryIngested, TelemetryCreate, TelemetrySessionOutput
from scripts.export_telemetry_examples import example

def test_published_openapi_and_examples():
    root=Path(__file__).resolve().parents[2]
    assert yaml.safe_load((root/'contract/openapi.yaml').read_text(encoding='utf-8'))==app.openapi()
    for name in ('empty','healthy','missing','spike','repeated','fluctuation','delayed','conflict'):
        published=json.loads((root/f'fixtures/telemetry/{name}.json').read_text(encoding='utf-8'))
        assert published==example(name)
        TelemetrySnapshot.model_validate(published['snapshot'])
        if name=='empty':
            continue
        TelemetryCreate.model_validate(published['createRequest'])
        TelemetrySessionOutput.model_validate(published['sessionResponse'])
        for exchange in published['ingestionExchanges']:
            TelemetryReadings.model_validate(exchange['request'])
            TelemetryIngested.model_validate(exchange['response'])
