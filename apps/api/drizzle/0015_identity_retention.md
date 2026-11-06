-- Identity retention (architecture/IDENTITY.md): one bounded batch per call of
-- rate buckets whose window started more than 30 days ago and unredeemed
-- transfers expired more than 24 hours ago. Deletion receipts, revoked
-- credential tombstones and redeemed transfers are never removed. Invoker
-- rights only: the migration role runs it from a separately approved scheduler.
CREATE FUNCTION justgo.purge_expired_identity_records(batch_limit integer DEFAULT 1000)
RETURNS TABLE (rate_buckets integer, transfers integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF batch_limit IS NULL OR batch_limit < 1 OR batch_limit > 10000 THEN
    RAISE EXCEPTION 'batch_limit must be between 1 and 10000';
  END IF;
  DELETE FROM justgo.identity_rate_buckets
  WHERE key IN (
    SELECT key FROM justgo.identity_rate_buckets
    WHERE window_start < now() - interval '30 days'
    ORDER BY window_start
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS rate_buckets = ROW_COUNT;
  DELETE FROM justgo.device_transfers
  WHERE id IN (
    SELECT id FROM justgo.device_transfers
    WHERE redeemed_at IS NULL AND expires_at < now() - interval '24 hours'
    ORDER BY expires_at
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS transfers = ROW_COUNT;
  RETURN NEXT;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION justgo.purge_expired_identity_records(integer) FROM PUBLIC;
