"""Export the implemented contract without opening a database connection."""
import argparse
import json
import yaml
from pathlib import Path
from app.main import create_app

TARGET = Path(__file__).resolve().parents[2] / 'contract' / 'openapi.json'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    schema=create_app().openapi()
    outputs={TARGET:json.dumps(schema, indent=2, sort_keys=True)+'\n',
             TARGET.with_suffix('.yaml'):yaml.safe_dump(schema,sort_keys=True,allow_unicode=True)}
    for target,serialized in outputs.items():
        if args.check:
            if not target.exists() or target.read_text(encoding='utf-8') != serialized:
                raise SystemExit('OpenAPI snapshot is stale; run npm run contract:export.')
        else:
            target.parent.mkdir(exist_ok=True)
            target.write_text(serialized, encoding='utf-8')

if __name__ == '__main__':
    main()
