-- CreateFunction
-- This function sends a NOTIFY to the 'table_change' channel whenever a row is modified
CREATE OR REPLACE FUNCTION notify_table_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'userId', COALESCE(NEW."userId", OLD."userId"),
    'id', COALESCE(NEW.id, OLD.id),
    'timestamp', EXTRACT(EPOCH FROM NOW())
  );
  
  PERFORM pg_notify('table_change', payload::text);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger for Todo
DROP TRIGGER IF EXISTS todo_notify_trigger ON "Todo";
CREATE TRIGGER todo_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON "Todo"
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- CreateTrigger for Jar
DROP TRIGGER IF EXISTS jar_notify_trigger ON "Jar";
CREATE TRIGGER jar_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON "Jar"
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- CreateTrigger for Tag
DROP TRIGGER IF EXISTS tag_notify_trigger ON "Tag";
CREATE TRIGGER tag_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON "Tag"
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- CreateTrigger for Note
DROP TRIGGER IF EXISTS note_notify_trigger ON "Note";
CREATE TRIGGER note_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON "Note"
FOR EACH ROW EXECUTE FUNCTION notify_table_change();
