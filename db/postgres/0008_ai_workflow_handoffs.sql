ALTER TABLE ai_conversation_messages
  ADD COLUMN IF NOT EXISTS workflow_json TEXT;
