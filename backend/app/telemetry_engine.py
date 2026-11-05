"""Pure, deterministic TR-1.0 evaluation; raw observations are never changed."""
from collections import Counter
from datetime import datetime
from statistics import median

CODES = ('MISSING', 'SPIKE', 'REPEATED', 'FLUCTUATION', 'DELAYED', 'CONFLICT')
SOURCES = ('SENSOR_A', 'SENSOR_B')

def instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))

def iso(value):
    return value.isoformat(timespec='microseconds').replace('+00:00', 'Z')

def evaluate(session, raw, server_time):
    snapshot = dict(contractVersion='TR-1.0', serverTime=server_time, session=session,
                    observations=[], sources=[], findings=[], summary='No telemetry session has been started.')
    if session is None:
        return snapshot
    time = instant(server_time)
    rows = sorted((dict(r, flags=[]) for r in raw),
                  key=lambda r: (instant(r['measuredAt']), instant(r['receivedAt']), r['id']))
    findings = snapshot['findings']

    def finding(code, affected, source_ids, explanation):
        for r in affected:
            if code not in r['flags']:
                r['flags'].append(code)
        findings.append(dict(code=code, sourceIds=sorted(source_ids),
                             observationIds=sorted(r['id'] for r in affected), explanation=explanation))

    for r in rows:
        if r['value'] is None:
            finding('MISSING', [r], [r['sourceId']], f"MISSING: {r['sourceId']} explicitly supplied no value at {r['measuredAt']}; this does not establish a source failure.")
        delay = (instant(r['receivedAt']) - instant(r['measuredAt'])).total_seconds()
        if delay > 5:
            finding('DELAYED', [r], [r['sourceId']], f"DELAYED: receipt at {r['receivedAt']} followed measurement at {r['measuredAt']} by {delay:g} seconds (>5); timing alone does not establish a failure.")

    for source in SOURCES:
        eligible, consecutive = [], []
        for r in (r for r in rows if r['sourceId'] == source):
            if r['value'] is None or 'DELAYED' in r['flags']:
                consecutive = []
                continue
            previous = [p['value'] for p in eligible[-10:]]
            if len(previous) >= 5:
                center = median(previous)
                mad = median(abs(v-center) for v in previous)
                threshold = max(20, 6 * 1.4826 * mad)
                if abs(r['value']-center) > threshold:
                    finding('SPIKE', [r], [source], f"SPIKE: {r['value']:g} BPM at {r['measuredAt']} differs from predecessor median {center:g} BPM by more than {threshold:g} BPM (MAD {mad:g}); possible data-quality concern.")
            eligible.append(r)
            consecutive = (consecutive + [r])[-6:]
            if len(consecutive) < 6:
                continue
            values = [p['value'] for p in consecutive]
            span = (instant(r['measuredAt'])-instant(consecutive[0]['measuredAt'])).total_seconds()
            if span >= 10 and max(values)-min(values) <= 0.1:
                finding('REPEATED', [r], [source], f"REPEATED: six values from {min(values):g} to {max(values):g} BPM span {span:g} seconds ending at {r['measuredAt']}; possible repetition, not proven failure.")
            differences = [b-a for a,b in zip(values, values[1:])]
            if sum(abs(d)>15 for d in differences) >= 4 and sum(a*b<0 for a,b in zip(differences,differences[1:])) >= 3:
                finding('FLUCTUATION', [r], [source], f"FLUCTUATION: six values {values} BPM ending at {r['measuredAt']} contain at least four changes >15 BPM and three sign reversals; cause is uncertain.")

    eligible = [r for r in rows if r['value'] is not None and 'DELAYED' not in r['flags']]
    pairs = set()
    for r in eligible:
        candidates = [p for p in eligible if p['sourceId'] != r['sourceId'] and abs((instant(p['measuredAt'])-instant(r['measuredAt'])).total_seconds()) <= 2]
        if not candidates:
            continue
        other = min(candidates, key=lambda p: (abs((instant(p['measuredAt'])-instant(r['measuredAt'])).total_seconds()), instant(p['measuredAt']), p['id']))
        key = tuple(sorted((r['id'], other['id'])))
        if abs(r['value']-other['value']) > 15 and key not in pairs:
            pairs.add(key)
            ordered = sorted((r, other), key=lambda p: p['id'])
            evidence = '; '.join(f"{p['sourceId']} {p['value']:g} BPM at {p['measuredAt']}" for p in ordered)
            finding('CONFLICT', ordered, SOURCES, f"CONFLICT: {evidence}; difference >15 BPM within two seconds. Neither source is selected as correct.")

    for r in rows:
        r['flags'].sort(key=CODES.index)
    for source in SOURCES:
        history = [r for r in rows if r['sourceId'] == source]
        latest = history[-1] if history else None
        active = session['status'] == 'ACTIVE'
        grace = (time-instant(session['startedAt'])).total_seconds() <= 6
        fresh = any('DELAYED' not in r['flags'] and (time-instant(r['measuredAt'])).total_seconds() <= 6 for r in history)
        stale = active and not fresh and not (not history and grace)
        flags = list(latest['flags']) if latest else []
        if stale:
            if 'MISSING' not in flags:
                flags.append('MISSING')
            finding('MISSING', [], [source], f"MISSING: {source} has no non-delayed measurement within six seconds of {server_time}; source freshness is uncertain.")
        status = ('ENDED' if not active else 'WAITING' if not history and grace else
                  'STALE' if stale else 'SUSPECT' if flags else 'CURRENT')
        snapshot['sources'].append(dict(sourceId=source, status=status,
            latestObservationId=latest['id'] if latest else None, latestValue=latest['value'] if latest else None,
            latestMeasuredAt=latest['measuredAt'] if latest else None,
            lastReceivedAt=max((r['receivedAt'] for r in history), key=instant) if history else None,
            ageSeconds=max(0, (time-instant(latest['measuredAt'])).total_seconds()) if latest else None,
            flags=sorted(flags, key=CODES.index)))
    findings.sort(key=lambda f: (CODES.index(f['code']), f['sourceIds'], f['observationIds']))
    snapshot['observations'] = rows
    counts = Counter(f['code'] for f in findings)
    parts = [f"Synthetic data. Session {session['status']}; snapshot {server_time}."]
    if not active:
        parts.append(f"Session ended at {session['stoppedAt'] or session['expiresAt']}; values are historical.")
    for s in snapshot['sources']:
        value = 'no value' if s['latestValue'] is None else f"{s['latestValue']:g} BPM"
        parts.append(f"{s['sourceId']}: {s['status']}, {value}, measured {s['latestMeasuredAt'] or 'not available'}, flags {', '.join(s['flags']) or 'none'}.")
    parts.append('Finding counts: '+', '.join(f'{code}={counts[code]}' for code in CODES)+'.')
    parts.append('Flags indicate data-quality concerns, not diagnosis. Absence of flags does not prove reliability.')
    snapshot['summary'] = ' '.join(parts)
    return snapshot
