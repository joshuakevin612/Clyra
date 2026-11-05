import json, pathlib, yaml
root=pathlib.Path(__file__).resolve().parents[2]
d=yaml.safe_load((root/'contract/openapi.yaml').read_text(encoding='utf-8'))
def ts(s):
 if '$ref' in s:return s['$ref'].split('/')[-1]
 if 'const' in s:return json.dumps(s['const'])
 if 'enum' in s:return ' | '.join(json.dumps(x) for x in s['enum'])
 for k in ['anyOf','oneOf']:
  if k in s:return ' | '.join(ts(x) for x in s[k])
 t=s.get('type')
 if t=='object':
  if 'properties' not in s:return 'Record<string, unknown>'
  return '{ '+ '; '.join(json.dumps(k)+('' if k in s.get('required',[]) else '?')+': '+ts(v) for k,v in s['properties'].items())+' }'
 if t=='array':return 'Array<'+ts(s['items'])+'>'
 return {'string':'string','integer':'number','number':'number','boolean':'boolean','null':'null'}.get(t,'unknown')
out='// GENERATED from contract/openapi.yaml. Do not edit.\n'
for n,s in d['components']['schemas'].items():out+='export type '+n+' = '+ts(s)+';\n'
(root/'frontend/src/api/generated.ts').write_text(out,encoding='utf-8')
