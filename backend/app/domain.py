"""Deterministic clinical record processing; never generates medical advice."""
import itertools
import re


def medicine_key(name: str) -> str:
    text = name.lower().strip()
    text = re.sub(r"\b\d+(?:\.\d+)?\s*(?:mcg|mg|ml|iu|g)\b", "", text)
    text = re.sub(r"[^\w\s-]|_", "", text)
    text = re.sub(r"\b(?:tablets?|tabs?|capsules?|caps?|liquids?|injections?|patch(?:es)?|inhalers?)\b", "", text)
    return " ".join(text.split())


def detect_discrepancies(visits: list[dict], entries: list[dict]) -> list[dict]:
    results = []
    def add(kind, field, left, right, visit):
        results.append(dict(type=kind, field=field, medicineKey=left['medicineKey'],
                            leftEntryId=left['id'], rightEntryId=right['id'] if right else None,
                            visitId=visit['id']))
    ordered = sorted(visits, key=lambda v: (v['visitDate'], v['id']))
    by_id = {m['id']:m for m in entries}
    superseded = {m['supersedesId'] for m in entries if m.get('supersedesId') in by_id
                  and by_id[m['supersedesId']]['visitId'] == m['visitId']}
    entries = [m for m in entries if m['id'] not in superseded]
    grouped = {v['id']: sorted([m for m in entries if m['visitId'] == v['id']], key=lambda m: m['id']) for v in ordered}
    for visit in ordered:
        for a, b in itertools.combinations(grouped[visit['id']], 2):
            if all(a[k] == b[k] for k in ('medicineKey', 'strength', 'form')):
                add('DUPLICATE', 'medicine', a, b, visit)
    # Consecutive lists avoid repeatedly reporting an already missing medicine.
    for previous, current in zip(ordered, ordered[1:]):
        left, right = grouped[previous['id']], grouped[current['id']]
        for key in sorted({m['medicineKey'] for m in left}):
            old = [m for m in left if m['medicineKey'] == key]
            new = [m for m in right if m['medicineKey'] == key]
            if not new:
                active = [m for m in old if m.get('endDate') is None or m['endDate'] >= current['visitDate']]
                if active:
                    add('MISSING', 'medicine', active[0], None, current)
            else:
                seen = set()
                for a, b in itertools.product(old, new):
                    if (a.get('endDate') or '9999-12-31') < b['startDate'] or (b.get('endDate') or '9999-12-31') < a['startDate']:
                        continue
                    for field in ('strength', 'form', 'instructionText'):
                        if a[field] != b[field] and field not in seen:
                            add('CONFLICT', field, a, b, current)
                            seen.add(field)
    return sorted(results, key=lambda d: (d['visitId'], d['type'], d['medicineKey'], d['field']))


def extract(raw: str, document_id: str) -> list[dict]:
    """Strict line template. Each field carries its own exact, half-open span."""
    lines = raw.splitlines(keepends=True)
    if not lines or lines[0].rstrip('\r\n') != 'SYN-RX-V1':
        raise ValueError('Only SYN-RX-V1 is supported.')
    required = ['medicineName', 'strength', 'form', 'instructionText', 'startDate', 'endDate', 'prescriberName']
    entries, current, spans = [], {}, {}
    offset = len(lines[0])
    for line in lines[1:]:
        content = line.rstrip('\r\n')
        if content == '---':
            if current:
                if list(current) != required:
                    raise ValueError('Incomplete or out-of-order medication fields.')
                entries.append((current, spans))
                current, spans = {}, {}
        elif content:
            key, sep, value = content.partition(': ')
            if not sep or key not in required or key in current:
                raise ValueError('Invalid SYN-RX-V1 field.')
            start = offset + len(key) + 2
            current[key] = value
            spans[key] = dict(documentId=document_id, page=raw[:start].count('\f') + 1,
                              quote=value, charStart=start, charEnd=start + len(value))
            if raw[start:start + len(value)] != value:
                raise ValueError('Source span does not match raw text.')
        offset += len(line)
    if current:
        if list(current) != required:
            raise ValueError('Incomplete or out-of-order medication fields.')
        entries.append((current, spans))
    if not entries:
        raise ValueError('No medication fields found.')
    output = []
    from datetime import date
    for fields, sources in entries:
        match = re.fullmatch(r'(\d+(?:\.\d+)?) (MG|MCG|G|ML|IU)', fields['strength'])
        if not match or fields['form'] not in {'TABLET','CAPSULE','LIQUID','INJECTION','PATCH','INHALER','OTHER'}:
            raise ValueError('Invalid strength or form.')
        date.fromisoformat(fields['startDate'])
        if fields['endDate'] != 'null':
            date.fromisoformat(fields['endDate'])
            if fields['endDate'] < fields['startDate']:
                raise ValueError('startDate must be on or before endDate.')
        output.append(dict(**{**fields, 'strength': {'value': float(match[1]), 'unit': match[2]},
                              'endDate': None if fields['endDate'] == 'null' else fields['endDate'],
                              'prescriberName': None if fields['prescriberName'] == 'null' else fields['prescriberName']},
                           medicineKey=medicine_key(fields['medicineName']), source=sources['instructionText'], fieldSources=sources))
    return output
