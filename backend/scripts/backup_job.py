"""External scheduled backup runner. Never started from FastAPI."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request
from datetime import datetime, timezone
from .operations import backup

def main():
    try:
        remote=os.environ['BACKUP_REMOTE'].rstrip('/')
        directory=Path(os.environ['BACKUP_OUTPUT_DIR'])
        archive=directory/(datetime.now(timezone.utc).strftime('clyra-%Y%m%dT%H%M%S%fZ')+'.dump.age')
        backup(archive)
        for file in (archive, archive.with_suffix('.age.json')):
            # Remote credentials live in the worker's protected rclone configuration.
            result=subprocess.run(['rclone','copyto',str(file),remote+'/'+file.name],
                                  stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if result.returncode:
                raise RuntimeError('Encrypted archive upload failed.')
        # Remote monitor must alert if this success signal is absent beyond 26 hours.
        with urllib.request.urlopen(urllib.request.Request(os.environ['BACKUP_MONITOR_URL'],
                data=b'{"status":"success"}',headers={'Content-Type':'application/json'}),timeout=15) as response:
            if response.status>=300:
                raise RuntimeError('Backup monitor did not accept success.')
        print(json.dumps({'backup':'uploaded','monitor':'acknowledged'}))
    except Exception:
        raise SystemExit('Backup job failed; inspect the protected runner and remote monitor. No success signal sent.')

if __name__=='__main__':
    main()
