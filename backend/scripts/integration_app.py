"""Isolated, ephemeral synthetic API for local browser integration; never connects to Neon."""
import os
os.environ['ENVIRONMENT']='test'
from app.db import Base, make_engine, factory
from app.main import create_app
from scripts.seed import seed
from app.core import create_user
from app.schemas import Account
engine=make_engine('sqlite://')
Base.metadata.create_all(engine)
with factory(engine).begin() as db:
    seed(db,'Clyra-demo-2026')
    create_user(db,Account(username='platform.demo',displayName='Platform owner (synthetic)',password='Clyra-demo-2026'),'SUPER_ADMIN',force=True)
app=create_app(engine)

@app.middleware('http')
async def fixture_mode_header(request, call_next):
    response=await call_next(request)
    response.headers['X-Clyra-Database-Mode']='ephemeral'
    return response
