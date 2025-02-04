-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "ms_message_id" SET DATA TYPE TEXT;
SET search_path TO "embeddings";

-- Create the function
CREATE OR REPLACE FUNCTION "embeddings".queue_message_for_categorization()
RETURNS trigger AS $$
DECLARE
  api_endpoint text;
BEGIN
  api_endpoint := 'https://ca39-103-211-38-46.ngrok-free.app/embedding';
  
  -- Now we can use net.http_post directly since the schema is in our search path
  PERFORM net.http_post(
    url := api_endpoint,
    body := jsonb_build_object(
      'id', NEW.id,
      'ms_message_id', NEW.ms_message_id,
      'subject', NEW.subject,
      'sender_name', NEW.sender_name,
      'sender_email', NEW.sender_email,
      'body', NEW.body,
      'recipients', NEW.recipients,
      'cc_recipients', NEW.cc_recipients,
      'bcc_recipients', NEW.bcc_recipients,
      'meta_data', NEW.meta_data
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE OR REPLACE TRIGGER trigger_message_categorization
  AFTER INSERT
  ON "embeddings".messages
  FOR EACH ROW
  EXECUTE FUNCTION "embeddings".queue_message_for_categorization();