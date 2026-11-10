CREATE FUNCTION justgo.reject_users_id_change() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'users.id never changes, because a re-keyed account lets its old id return at data_epoch 0 and stale devices re-upload deleted data. Delete-all advances data_epoch on the same id instead.' USING ERRCODE = 'check_violation'; END;
$$;
REVOKE ALL ON FUNCTION justgo.reject_users_id_change() FROM PUBLIC;
CREATE TRIGGER users_id_immutable AFTER UPDATE OF id ON justgo.users FOR EACH ROW WHEN (NEW.id IS DISTINCT FROM OLD.id) EXECUTE FUNCTION justgo.reject_users_id_change();
