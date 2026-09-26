import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'
import { DIMS } from '../embeddings/gemini.js'

/**
 * RAG tables live in the shared lms-service Postgres. Every FK column below
 * points at a table owned by lms-service (Sequelize migrations); we do not
 * create those tables here. This schema declares only the four RAG-specific
 * extensions: rag_sources, rag_chunks, rag_video_cues, rag_glossary.
 *
 * lms-service column style is camelCase (quoted identifiers in Postgres).
 * We mirror that on the RAG tables so joins read naturally and dumps stay
 * consistent across the DB.
 *
 * ID types match lms-service exactly:
 *   tenants.id   UUID    (gen_random_uuid)
 *   courses.id   INTEGER (autoincrement)  — content is authored under courses
 *   modules.id   INTEGER (autoincrement)  — modules.courseId → courses.id
 *   contents.id  INTEGER (autoincrement)  — contents.moduleId → modules.id
 *   videos.id    INTEGER (autoincrement)
 *
 * courseId + tenantId are denormalized on every row so retrieval can filter
 * without extra joins.
 */

/**
 * Source documents (raw ingested text — one row per PDF / article / video).
 * moduleId / contentId / videoId are all nullable so a source can be attached
 * at whichever level makes sense (e.g. course-level syllabus vs. per-video
 * transcript).
 */
export const ragSources = pgTable(
  'rag_sources',
  {
    id: text('id').primaryKey(),
    tenantId: uuid('tenantId').notNull(),
    courseId: integer('courseId').notNull(),
    moduleId: integer('moduleId'),
    contentId: integer('contentId'),
    videoId: integer('videoId'),
    title: text('title').notNull(),
    kind: text('kind').notNull(), // 'document' | 'video'
    uri: text('uri'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    contentHash: text('contentHash').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    courseIdx: index('rag_sources_course_idx').on(t.courseId),
    tenantCourseIdx: index('rag_sources_tenant_course_idx').on(t.tenantId, t.courseId),
    videoIdx: index('rag_sources_video_idx').on(t.videoId),
  }),
)

/**
 * Text chunks. `embedding` is 1536d (Matryoshka-truncated gemini-embedding-001,
 * L2-normalised at write time — cosine distance is meaningful only because of that).
 */
export const ragChunks = pgTable(
  'rag_chunks',
  {
    id: text('id').primaryKey(), // e.g. `${sourceId}#${ordinal}`
    tenantId: uuid('tenantId').notNull(),
    sourceId: text('sourceId')
      .notNull()
      .references(() => ragSources.id, { onDelete: 'cascade' }),
    courseId: integer('courseId').notNull(),
    moduleId: integer('moduleId'),
    ordinal: integer('ordinal').notNull(),
    headingTrail: jsonb('headingTrail').$type<string[]>().default(sql`'[]'::jsonb`),
    text: text('text').notNull(),
    tokens: integer('tokens').notNull(),
    embedding: vector('embedding', { dimensions: DIMS }),
    createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // HNSW cosine — pgvector 0.5+. Rebuild after bulk ingest via `REINDEX INDEX ...`.
    embeddingIdx: index('rag_chunks_embedding_hnsw_idx').using(
      'hnsw',
      sql`${t.embedding} vector_cosine_ops`,
    ),
    sourceIdx: index('rag_chunks_source_idx').on(t.sourceId),
    courseIdx: index('rag_chunks_course_idx').on(t.courseId),
    tenantCourseIdx: index('rag_chunks_tenant_course_idx').on(t.tenantId, t.courseId),
  }),
)

/**
 * Video cues — the corrected VTT lives here so retrieval hits the fixed text
 * (glossary correction) while timestamps stay from the source VTT.
 * videoId → videos.id (INTEGER). contentId / moduleId are denormalized so
 * the widget can render "from module X" context without extra joins.
 */
export const ragVideoCues = pgTable(
  'rag_video_cues',
  {
    id: text('id').primaryKey(), // e.g. `${videoId}#${cueId}`
    tenantId: uuid('tenantId').notNull(),
    videoId: integer('videoId').notNull(),
    contentId: integer('contentId'),
    moduleId: integer('moduleId'),
    courseId: integer('courseId').notNull(),
    cueId: text('cueId').notNull(),
    startSec: integer('startSec').notNull(),
    endSec: integer('endSec').notNull(),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: DIMS }),
    createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    embeddingIdx: index('rag_video_cues_embedding_hnsw_idx').using(
      'hnsw',
      sql`${t.embedding} vector_cosine_ops`,
    ),
    videoIdx: index('rag_video_cues_video_idx').on(t.videoId),
    courseIdx: index('rag_video_cues_course_idx').on(t.courseId),
    tenantCourseIdx: index('rag_video_cues_tenant_course_idx').on(t.tenantId, t.courseId),
  }),
)

/**
 * Glossary as data, not just a prompt fixture — used by the correction pass
 * and by the eval harness to check that glossary terms survive retrieval.
 */
export const ragGlossary = pgTable('rag_glossary', {
  term: text('term').primaryKey(),
  variants: jsonb('variants').$type<string[]>().default(sql`'[]'::jsonb`),
  definition: text('definition').notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * Chat threads for signed-in users. Ephemeral chats (no user-email) bypass
 * these tables and live only in widget state. userId → lms-service users.id.
 * Title is null until the auto-titler runs after the first exchange.
 */
export const ragConversations = pgTable(
  'rag_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('userId').notNull(),
    tenantId: uuid('tenantId').notNull(),
    title: text('title'),
    createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userUpdatedIdx: index('rag_conversations_user_updated_idx').on(t.userId, t.updatedAt),
    tenantUserIdx: index('rag_conversations_tenant_user_idx').on(t.tenantId, t.userId),
  }),
)

/**
 * One row per message (user or assistant). Structured extras (citations,
 * watchNext, followUps, retrieval) are stored verbatim so past chats
 * re-render identical to when they streamed live.
 */
export const ragMessages = pgTable(
  'rag_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversationId')
      .notNull()
      .references(() => ragConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    citations: jsonb('citations'),
    watchNext: jsonb('watchNext'),
    followUps: jsonb('followUps'),
    retrieval: jsonb('retrieval'),
    createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    conversationCreatedIdx: index('rag_messages_conversation_created_idx').on(
      t.conversationId,
      t.createdAt,
    ),
  }),
)
