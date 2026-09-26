import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { ragVideoCues as videoCuesTable, ragSources as sourcesTable } from '../db/schema.js'
import { DEV_TENANT_ID } from '../db/index.js'
import { embed } from '../embeddings/gemini.js'
import { correctTranscript } from '../glossary/correction.js'
import type { Glossary } from '../glossary/loader.js'
import type { FixtureVideo } from '../gumlet/fixtures.js'
import { parseVtt, toVtt } from '../gumlet/vtt.js'
import { parseSrt, detectSubtitleFormat } from '../gumlet/srt.js'
import { parseMasterManifest } from '../gumlet/manifest.js'
import type { Cue } from '../glossary/correction.js'
import { hashText } from './pipeline.js'

export interface VideoIngestOptions {
  /** if true, skip glossary correction (raw VTT indexed) */
  skipCorrection?: boolean
  /** course scope for this video. Required — integer id from lms-service. */
  courseId?: number
  /** module scope for this video. Nullable. */
  moduleId?: number
  /** content scope for this video. Nullable. */
  contentId?: number
  /** Tenant scope. Defaults to DEV_TENANT_ID for dev/POC. */
  tenantId?: string
  /** direct playable URL — persisted in sources.metadata for the frontend player */
  playbackUrl?: string
}

export interface VideoIngestResult {
  videoId: number
  cuesIngested: number
  correctedVttPath?: string
  correctedVtt: string
}

/**
 * Video ingest = fetch VTT (from fixture) → correct via Gemini + glossary →
 * embed each cue → upsert to `rag_video_cues`. The corrected VTT is returned
 * so the caller can push it back to Gumlet as the display track.
 *
 * The correction step is what makes Route A (Gumlet subtitles) viable —
 * the model fixes only the words, the timestamps stay anchored to Gumlet's
 * cue timing so video deep-links remain accurate.
 */
export async function ingestVideo(
  video: FixtureVideo,
  glossary: Glossary,
  opts: VideoIngestOptions = {},
): Promise<VideoIngestResult> {
  if (opts.courseId == null) {
    throw new Error('ingestVideo: courseId is required (integer, from lms-service courses.id)')
  }
  const courseId = opts.courseId
  const moduleId = opts.moduleId ?? null
  const contentId = opts.contentId ?? null
  const tenantId = opts.tenantId ?? DEV_TENANT_ID
  const correctedCues = opts.skipCorrection
    ? video.cues
    : await correctTranscript(video.cues, glossary)

  const cueTexts = correctedCues.map((c) => c.text)
  const embeddings = await embed(cueTexts, { taskType: 'RETRIEVAL_DOCUMENT' })

  const metadata = opts.playbackUrl ? { playbackUrl: opts.playbackUrl } : {}
  await db().transaction(async (tx) => {
    await tx
      .insert(sourcesTable)
      .values({
        id: `video:${video.videoId}`,
        tenantId,
        courseId,
        moduleId,
        contentId,
        videoId: video.videoId,
        title: video.title,
        kind: 'video',
        uri: String(video.videoId),
        metadata,
        contentHash: hashText(correctedCues.map((c) => c.text).join('\n')),
      })
      .onConflictDoUpdate({
        target: sourcesTable.id,
        set: {
          title: video.title,
          contentHash: hashText(correctedCues.map((c) => c.text).join('\n')),
          tenantId,
          courseId,
          moduleId,
          contentId,
          videoId: video.videoId,
          metadata,
        },
      })
    await tx.delete(videoCuesTable).where(sql`${videoCuesTable.videoId} = ${video.videoId}`)
    for (let i = 0; i < correctedCues.length; i++) {
      const c = correctedCues[i]!
      await tx.insert(videoCuesTable).values({
        id: `${video.videoId}#${c.id}`,
        tenantId,
        videoId: video.videoId,
        contentId,
        moduleId,
        courseId,
        cueId: c.id,
        startSec: Math.floor(c.startSec),
        endSec: Math.floor(c.endSec),
        text: c.text,
        embedding: embeddings[i],
      })
    }
  })

  // Keyword lane (Postgres FTS) is auto-maintained: `rag_video_cues.text_search`
  // is a GENERATED ALWAYS tsvector column.

  return {
    videoId: video.videoId,
    cuesIngested: correctedCues.length,
    correctedVtt: toVtt(correctedCues),
  }
}

export interface VideoPayload {
  videoId: number
  title: string
  playbackUrl?: string
  /**
   * Subtitle text. Accepts EITHER WebVTT OR SubRip (SRT) — Gumlet delivers
   * both. Format is auto-detected. Field named `vtt` for historical reasons;
   * we take the more common name rather than churn the API contract.
   */
  vtt: string
  /**
   * Optional format hint. Skips auto-detect if set. Useful when the caller
   * knows the format (e.g. `renditionType` from a Gumlet webhook).
   */
  format?: 'vtt' | 'srt'
}

/**
 * Parse subtitle text into cues, auto-detecting VTT vs SRT unless the caller
 * pinned a format explicitly.
 */
function parseSubtitles(text: string, format?: 'vtt' | 'srt'): Cue[] {
  const fmt = format ?? detectSubtitleFormat(text)
  if (fmt === 'srt') return parseSrt(text)
  if (fmt === 'vtt') return parseVtt(text)
  throw new Error(
    'Unrecognised subtitle format — expected WebVTT (starts with "WEBVTT") or SRT (numbered cues with "-->").',
  )
}

/**
 * Ingest a video from an in-memory payload (subtitles + playback URL). Entry
 * point the admin API calls when the LMS wires a video to a content. No
 * filesystem, no fixture index — pure data. Accepts VTT or SRT.
 */
export async function ingestVideoFromPayload(
  payload: VideoPayload,
  glossary: Glossary,
  opts: VideoIngestOptions = {},
): Promise<VideoIngestResult> {
  const video: FixtureVideo = {
    videoId: payload.videoId,
    title: payload.title,
    manifest: parseMasterManifest('#EXTM3U\n#EXT-X-VERSION:6\n'),
    vttPath: '', // not used for embedded payloads
    cues: parseSubtitles(payload.vtt, payload.format),
    playbackUrl: payload.playbackUrl,
  }
  return ingestVideo(video, glossary, {
    ...opts,
    playbackUrl: opts.playbackUrl ?? payload.playbackUrl,
  })
}

/**
 * Ingest a video whose subtitle track lives on Gumlet — fetches the VTT/SRT
 * via the Gumlet Video Management API, then runs the standard chunk/embed/
 * store pipeline. Called by the ingest queue worker when a job of kind
 * 'gumlet-transcript' fires.
 *
 * `videoId` is the integer id of the video in lms-service (used for cue rows
 * and dedupe). `gumletAssetId` is the Gumlet-side id — kept separate because
 * the LMS may store the same video under a different id than the Gumlet asset id.
 */
export async function ingestVideoFromGumlet(
  args: {
    videoId: number
    title: string
    gumletAssetId: string
    /** language code (e.g. 'en') if the asset has multiple subtitle tracks */
    languagePref?: string
    /** direct HLS playback URL — persisted on the source so the widget can play inline */
    playbackUrl?: string
  },
  glossary: Glossary,
  opts: VideoIngestOptions = {},
): Promise<VideoIngestResult> {
  const { fetchAssetSubtitle } = await import('../gumlet/api-client.js')
  const { text, format } = await fetchAssetSubtitle(args.gumletAssetId, {
    languagePref: args.languagePref,
  })
  return ingestVideoFromPayload(
    {
      videoId: args.videoId,
      title: args.title,
      vtt: text,
      format,
      playbackUrl: args.playbackUrl,
    },
    glossary,
    opts,
  )
}
