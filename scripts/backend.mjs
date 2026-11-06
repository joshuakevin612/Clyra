import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const local = path.join(root, 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.CLYRA_PYTHON || (existsSync(local) ? local : 'python');
const result = spawnSync(python, process.argv.slice(2), {cwd:path.join(root,'backend'), stdio:'inherit', shell:false});
if (result.error) console.error('Unable to launch Python. Set CLYRA_PYTHON to the Python executable.');
process.exit(result.status ?? 1);
