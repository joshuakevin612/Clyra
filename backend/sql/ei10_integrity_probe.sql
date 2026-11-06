-- Run ONLY on the isolated synthetic Stage 1 branch after migration 0005.
-- A deliberate subtransaction rollback leaves all immutable evidence untouched.
DO $$
BEGIN
  BEGIN
    INSERT INTO external_imports (id,version,patient_id,org_id,request_id,content_hash,data)
      VALUES ('imp_sql_probe',1,'pat_001','org_north','00000000-0000-4000-8000-000000000001',repeat('0',64),
      '{"status":"PENDING_ASSOCIATION","rawText":"Synthetic probe","sourceLabel":"Synthetic probe","visitDate":"2026-11-06","createdAt":"2026-11-06T00:00:00Z","createdBy":"probe","confirmedAt":null,"visitId":null,"documentId":null,"jobId":null}');
    BEGIN
      UPDATE external_imports SET data=jsonb_set(data::jsonb,'{rawText}','"changed"')::json WHERE id='imp_sql_probe';
      RAISE EXCEPTION 'Source mutation unexpectedly succeeded' USING ERRCODE='ZX002';
    EXCEPTION WHEN raise_exception THEN NULL;
    END;
    BEGIN
      UPDATE external_imports SET data=jsonb_set(data::jsonb,'{status}','"CONFIRMED"')::json WHERE id='imp_sql_probe';
      RAISE EXCEPTION 'Incomplete association unexpectedly succeeded' USING ERRCODE='ZX002';
    EXCEPTION WHEN raise_exception THEN NULL;
    END;
    BEGIN
      INSERT INTO external_imports (id,version,data,patient_id,org_id,request_id,content_hash)
        SELECT 'imp_sql_probe_duplicate',version,data,patient_id,org_id,request_id,content_hash FROM external_imports WHERE id='imp_sql_probe';
      RAISE EXCEPTION 'Duplicate request unexpectedly succeeded' USING ERRCODE='ZX002';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    RAISE EXCEPTION 'Probe complete; roll back synthetic insert' USING ERRCODE='ZX001';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END;
$$;
