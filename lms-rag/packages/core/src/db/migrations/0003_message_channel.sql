-- 0003_message_channel.sql
-- Distinguish voice from text turns in a unified chat history.
-- Existing rows default to 'text' — the pre-voice legacy channel.

ALTER TABLE rag_messages
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'text';

-- Index for filtering / analytics (e.g. "show me all voice turns for this user")
CREATE INDEX IF NOT EXISTS rag_messages_channel_idx
  ON rag_messages (channel);
