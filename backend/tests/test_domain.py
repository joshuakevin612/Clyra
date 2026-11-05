import json
from pathlib import Path
import pytest
from app.domain import medicine_key, detect_discrepancies, extract

ROOT = Path(__file__).resolve().parents[2]

@pytest.mark.parametrize('name,expected', [('Metformin HCl 500 mg','metformin hcl'), ('  AMLODIPINE 5mg tabs  ', 'amlodipine'), ('Drug-salt, 0.5 MCG capsule', 'drug-salt'), ('Drug_salt 5 mg', 'drugsalt')])
def test_keys(name, expected):
    assert medicine_key(name) == expected

def test_fixture_discrepancies():
    data = json.loads((ROOT / 'fixtures/data.json').read_text())
    meds = []
    for doc in data['documents']:
        raw = (ROOT / f"fixtures/documents/{doc['id']}.txt").read_text()
        for i, m in enumerate(extract(raw, doc['id'])):
            meds.append(dict(**m, id=f"med_{doc['id'][4:]}_{i}", visitId=doc['visitId']))
    actual = detect_discrepancies([v for v in data['visits'] if v['patientId'] == 'pat_001'], meds)
    assert actual == json.loads((ROOT / 'fixtures/expected/discrepancies.json').read_text())
    assert len(actual) == 4
    assert detect_discrepancies([v for v in data['visits'] if v['patientId'] == 'pat_003'], meds) == []

def test_extraction_verbatim():
    raw = (ROOT / 'fixtures/documents/doc_001a.txt').read_text()
    for med in extract(raw, 'doc_001a'):
        for source in med['fieldSources'].values():
            assert source['quote'] == raw[source['charStart']:source['charEnd']]
    with pytest.raises(ValueError):
        extract('An arbitrary prescription', 'doc_bad')
