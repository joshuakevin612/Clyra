"""Generate frontend-consumable schemas without a database connection."""
from pathlib import Path
import yaml
from app.main import app

def main():
    target=Path(__file__).resolve().parents[2]/'contract/openapi.yaml'
    target.write_text(yaml.safe_dump(app.openapi(),sort_keys=False,allow_unicode=True),encoding='utf-8')
    print('Exported contract/openapi.yaml')

if __name__=='__main__':
    main()
