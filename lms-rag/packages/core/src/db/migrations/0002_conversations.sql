-- 0002_conversations.sql
-- Chat history for signed-in users. Ephemeral (no user-email) chats bypass
-- these tables entirely — they exist only in the widget's React state.
--
-- userId → lms-service users.id (INTEGER). We reference it as a soft FK
-- (no ON DELETE CASCADE) so we can safely delete a user without wiping their
-- chat history if that's ever wanted; today the widget filters by userId
-- anyway. Add an explicit constraint later if strict cascade is preferred.

CREATE TABLE IF NOT EXISTS rag_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    INTEGER NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "tenantId"  UUID    NOT NULL REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  title       TEXT,                               -- auto-generated after first exchange; nullable until then
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_conversations_user_updated_idx
  ON rag_conversations ("userId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS rag_conversations_tenant_user_idx
  ON rag_conversations ("tenantId", "userId");


CREATE TABLE IF NOT EXISTS rag_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL REFERENCES rag_conversations(id) ON UPDATE CASCADE ON DELETE CASCADE,
  role             TEXT NOT NULL,                 -- 'user' | 'assistant'
  content          TEXT NOT NULL,
  -- structured extras stored verbatim so the UI can re-render past chats
  -- with the same sources / videos / follow-ups as when they were first shown.
  citations        JSONB,
  "watchNext"      JSONB,
  "followUps"      JSONB,
  retrieval        JSONB,                          -- the retrieval event blob
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_messages_conversation_created_idx
  ON rag_messages ("conversationId", "createdAt");
