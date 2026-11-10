-- Un UPDATE tampoco puede mover un vínculo fuera de una versión congelada.
CREATE OR REPLACE FUNCTION protect_version_files() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF EXISTS (SELECT 1 FROM versions WHERE document_id=OLD.document_id AND number=OLD.version AND frozen) THEN
      RAISE EXCEPTION 'Los archivos de una versión enviada son inmutables';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF EXISTS (SELECT 1 FROM versions WHERE document_id=NEW.document_id AND number=NEW.version AND frozen) THEN
      RAISE EXCEPTION 'Los archivos de una versión enviada son inmutables';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
