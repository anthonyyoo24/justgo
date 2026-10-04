-- Match ECMAScript String.trim, independent of PostgreSQL locale. Nonblank
-- text is never trimmed. Revisions, timestamps and immutable action/patch
-- receipts remain unchanged, preserving accepted legacy replay responses.
DO $$
DECLARE
  trim_characters CONSTANT text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  -- Preflight both representations before changing either. A submitted row
  -- with no real content requires an explicit repair, never silent deletion.
  IF EXISTS (
    SELECT 1 FROM justgo.reflections
    WHERE status = 'submitted' AND feeling IS NULL
      AND btrim(reflection_text, trim_characters) = ''
  ) OR EXISTS (
    SELECT 1 FROM justgo.attempts
    WHERE reflection_revision > 0 AND reflection_feeling IS NULL
      AND btrim(reflection_text, trim_characters) = ''
  ) THEN RAISE EXCEPTION 'Blank-only submitted reflection requires review'; END IF;

  UPDATE justgo.reflections SET reflection_text = NULL, input_method = NULL
  WHERE status = 'submitted' AND btrim(reflection_text, trim_characters) = '';
  UPDATE justgo.attempts SET reflection_text = NULL
  WHERE btrim(reflection_text, trim_characters) = '';
END $$;
