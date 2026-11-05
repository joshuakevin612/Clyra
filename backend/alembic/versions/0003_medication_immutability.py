"""Preserve medication history even when SQL bypasses the API."""
from alembic import op
revision='0003'
down_revision='0002'

def upgrade():
    if op.get_bind().dialect.name!='postgresql':
        return
    op.execute("""CREATE UNIQUE INDEX uq_medication_replacement
        ON medication_entries ((data->>'supersedesId'))
        WHERE data->>'supersedesId' IS NOT NULL""")
    op.execute("""CREATE FUNCTION protect_medication_history() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Medication entries cannot be deleted'; END IF;
        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
           OR NEW.org_id IS DISTINCT FROM OLD.org_id
           OR (NEW.data::jsonb - 'verificationStatus' - 'verifiedAt') IS DISTINCT FROM
              (OLD.data::jsonb - 'verificationStatus' - 'verifiedAt') THEN
            RAISE EXCEPTION 'Medication entries are immutable except verification';
        END IF;
        RETURN NEW;
    END; $$""")
    op.execute('CREATE TRIGGER medication_history_immutable BEFORE UPDATE OR DELETE ON medication_entries FOR EACH ROW EXECUTE FUNCTION protect_medication_history()')

def downgrade():
    if op.get_bind().dialect.name!='postgresql':
        return
    op.execute('DROP TRIGGER medication_history_immutable ON medication_entries')
    op.execute('DROP FUNCTION protect_medication_history()')
    op.execute('DROP INDEX uq_medication_replacement')
