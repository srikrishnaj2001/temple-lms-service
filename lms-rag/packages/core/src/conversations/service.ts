/**
 * Chat history — signed-in-user threads with all their messages.
 *
 * Ephemeral chats (no user-email header) never hit these functions; the
 * widget keeps them in React state and drops on refresh.
 */
import { and, desc, eq, sql } from 'drizzle-orm'
import { db, rawSql } from '../db/client.js'
import { ragConversations, ragMessages } from '../db/schema.js'

export interface UserContext {
  userId: number
  tenantId: string
  email: string
}

/**
 * Look up a user in the lms-service `users` table by email and get their
 * tenant. Returns null if the email isn't registered — caller decides whether
 * that's a 401 or "fall back to ephemeral".
 *
 * We read `users.id` (INTEGER) and, since lms-service doesn't put tenantId on
 * users directly, we derive tenant from the first course the user is enrolled
 * in. For a real multi-tenant setup a `user_tenants` join would be cleaner;
 * this is fine for the current single-tenant-per-user assumption.
 */
export async function resolveUserByEmail(email: string): Promise<UserContext | null> {
  const sql_ = rawSql()
  try {
    const rows = (await sql_<
      { id: number; tenantId: string | null }[]
    >`
      SELECT u.id,
             (
               SELECT c."tenantId"
               FROM enrollments e
               JOIN courses c ON c.id = e."courseId"
               WHERE e."userId" = u.id AND e."deletedAt" IS NULL
               ORDER BY e."createdAt" DESC
               LIMIT 1
             ) AS "tenantId"
      FROM users u
      WHERE lower(u.email) = lower(${email})
      LIMIT 1
    `) as unknown as { id: number; tenantId: string | null }[]
    const row = rows[0]
    if (!row) return null
    // Fall back to the first tenant in the system when the user has no
    // enrollments yet — they can still chat before being enrolled.
    let tenantId = row.tenantId
    if (!tenantId) {
      const fallback = (await sql_<{ id: string }[]>`SELECT id FROM tenants ORDER BY "createdAt" LIMIT 1`) as unknown as { id: string }[]
      tenantId = fallback[0]?.id ?? null
    }
    if (!tenantId) return null
    return { userId: row.id, tenantId, email }
  } finally {
    // Do not end the pool — it's shared across the app.
  }
}

export interface ConversationSummary {
  id: string
  title: string | null
  updatedAt: string
  createdAt: string
}

export interface MessageRecord {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: unknown
  watchNext: unknown
  followUps: unknown
  retrieval: unknown
  createdAt: string
}

/** List a user's threads, most recently updated first. */
export async function listConversations(user: UserContext, limit = 50): Promise<ConversationSummary[]> {
  const rows = await db()
    .select({
      id: ragConversations.id,
      title: ragConversations.title,
      updatedAt: ragConversations.updatedAt,
      createdAt: ragConversations.createdAt,
    })
    .from(ragConversations)
    .where(and(eq(ragConversations.userId, user.userId), eq(ragConversations.tenantId, user.tenantId)))
    .orderBy(desc(ragConversations.updatedAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Load messages for a specific thread, oldest first. */
export async function getMessages(user: UserContext, conversationId: string): Promise<MessageRecord[] | null> {
  const owns = await db()
    .select({ id: ragConversations.id })
    .from(ragConversations)
    .where(and(eq(ragConversations.id, conversationId), eq(ragConversations.userId, user.userId)))
    .limit(1)
  if (owns.length === 0) return null

  const rows = await db()
    .select()
    .from(ragMessages)
    .where(eq(ragMessages.conversationId, conversationId))
    .orderBy(ragMessages.createdAt)
  return rows.map((r) => ({
    id: r.id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    citations: r.citations,
    watchNext: r.watchNext,
    followUps: r.followUps,
    retrieval: r.retrieval,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Create a new empty thread. Called on first message when no conversationId supplied. */
export async function createConversation(user: UserContext): Promise<string> {
  const [row] = await db()
    .insert(ragConversations)
    .values({ userId: user.userId, tenantId: user.tenantId })
    .returning({ id: ragConversations.id })
  return row!.id
}

/** Bump updatedAt (so the thread floats to the top of the list). */
export async function touchConversation(conversationId: string): Promise<void> {
  await db()
    .update(ragConversations)
    .set({ updatedAt: sql`NOW()` })
    .where(eq(ragConversations.id, conversationId))
}

/** Set the auto-generated title (called once, after first Q+A completes). */
export async function setTitle(conversationId: string, title: string): Promise<void> {
  await db()
    .update(ragConversations)
    .set({ title, updatedAt: sql`NOW()` })
    .where(eq(ragConversations.id, conversationId))
}

/** Delete a thread and all its messages (cascade). */
export async function deleteConversation(user: UserContext, conversationId: string): Promise<boolean> {
  const res = await db()
    .delete(ragConversations)
    .where(and(eq(ragConversations.id, conversationId), eq(ragConversations.userId, user.userId)))
    .returning({ id: ragConversations.id })
  return res.length > 0
}

export interface AppendMessageInput {
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  citations?: unknown
  watchNext?: unknown
  followUps?: unknown
  retrieval?: unknown
}

export async function appendMessage(input: AppendMessageInput): Promise<string> {
  const [row] = await db()
    .insert(ragMessages)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      citations: input.citations ?? null,
      watchNext: input.watchNext ?? null,
      followUps: input.followUps ?? null,
      retrieval: input.retrieval ?? null,
    })
    .returning({ id: ragMessages.id })
  await touchConversation(input.conversationId)
  return row!.id
}

/** Count messages in a thread — used to decide whether to run the auto-titler. */
export async function messageCount(conversationId: string): Promise<number> {
  const rows = (await db()
    .select({ count: sql<string>`count(*)` })
    .from(ragMessages)
    .where(eq(ragMessages.conversationId, conversationId))) as { count: string }[]
  return Number(rows[0]?.count ?? '0')
}
