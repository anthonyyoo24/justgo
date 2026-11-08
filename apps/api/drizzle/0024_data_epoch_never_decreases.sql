CREATE FUNCTION justgo.reject_data_epoch_decrease() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'data_epoch never decreases, because a lower epoch lets stale devices re-upload deleted data. Advance it with data_epoch+1 or merge with greatest().' USING ERRCODE = 'check_violation'; END;
$$;
REVOKE ALL ON FUNCTION justgo.reject_data_epoch_decrease() FROM PUBLIC;
CREATE TRIGGER data_epoch_never_decreases AFTER UPDATE ON justgo.users FOR EACH ROW WHEN (NEW.data_epoch < OLD.data_epoch) EXECUTE FUNCTION justgo.reject_data_epoch_decrease();
