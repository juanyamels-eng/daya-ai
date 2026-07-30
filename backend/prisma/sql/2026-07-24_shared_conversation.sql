-- Phase 10 — Conversations shared via public link.
--
-- This project syncs the schema with `npx prisma db push` (there is no
-- prisma/migrations folder), so the normal way is to run:
--
--     cd backend && npx prisma db push
--
-- This file is the equivalent DDL, in case you prefer to apply it manually in
-- Supabase or keep a record of the change.

CREATE TABLE IF NOT EXISTS "SharedConversation" (
  "id"             TEXT         NOT NULL,
  "slug"           TEXT         NOT NULL,
  "conversationId" TEXT         NOT NULL,
  "userId"         TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SharedConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SharedConversation_slug_key"
  ON "SharedConversation"("slug");

-- A conversation has at most one live link.
CREATE UNIQUE INDEX IF NOT EXISTS "SharedConversation_conversationId_key"
  ON "SharedConversation"("conversationId");

CREATE INDEX IF NOT EXISTS "SharedConversation_userId_idx"
  ON "SharedConversation"("userId");

-- When the conversation is deleted, the link disappears: no slugs pointing to nothing.
ALTER TABLE "SharedConversation"
  ADD CONSTRAINT "SharedConversation_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
