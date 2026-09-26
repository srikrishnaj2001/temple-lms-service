import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Cue } from '../glossary/correction.js'
import { parseMasterManifest, type ParsedMasterManifest } from './manifest.js'
import { parseVtt } from './vtt.js'

/**
 * Gumlet is fully mocked at the delivery layer during the POC. This module
 * resolves manifest / VTT / webhook fixtures from disk so ingest and eval can
 * run end-to-end without a real Gumlet subscription. When we swap to real
 * Gumlet later, only this file changes — every consumer takes FixtureVideo,
 * not a URL.
 */

function fixturesRoot(): string {
  return process.env.GUMLET_FIXTURES_DIR ?? resolve(process.cwd(), 'fixtures/gumlet')
}

export interface FixtureVideo {
  /** Integer id matching lms-service videos.id. */
  videoId: number
  title: string
  manifest: ParsedMasterManifest
  vttPath: string
  cues: Cue[]
  /** Course scope for this video (integer id from lms-service). Overrides CLI --course when set. */
  courseId?: number
  /** Direct playable URL (mp4/hls). Displayed in the frontend player. */
  playbackUrl?: string
}

interface VideoManifestIndexEntry {
  videoId: number
  title: string
  manifest: string
  vtt: string
  courseId?: number
  playbackUrl?: string
}

/**
 * Loads the fixture index file at `fixtures/gumlet/index.json` which lists
 * available fixture videos. Each entry points to a manifest.m3u8 and a .vtt.
 *
 * NOTE: fixtures/gumlet/index.json currently has string videoIds/courseIds
 * (legacy). Callers must update the fixture file to integers before ingesting
 * against the new schema — this loader coerces via Number() to keep the
 * TypeScript type honest.
 */
export async function listFixtureVideos(): Promise<VideoManifestIndexEntry[]> {
  const indexPath = join(fixturesRoot(), 'index.json')
  const raw = await readFile(indexPath, 'utf-8')
  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>
  return parsed.map((e) => ({
    videoId: Number(e.videoId),
    title: String(e.title),
    manifest: String(e.manifest),
    vtt: String(e.vtt),
    courseId: e.courseId != null ? Number(e.courseId) : undefined,
    playbackUrl: typeof e.playbackUrl === 'string' ? e.playbackUrl : undefined,
  }))
}

export async function loadFixtureVideo(videoId: number): Promise<FixtureVideo> {
  const entries = await listFixtureVideos()
  const entry = entries.find((e) => e.videoId === videoId)
  if (!entry) throw new Error(`Fixture video not found: ${videoId}`)
  return loadFromEntry(entry)
}

export async function loadAllFixtureVideos(): Promise<FixtureVideo[]> {
  const entries = await listFixtureVideos()
  return Promise.all(entries.map(loadFromEntry))
}

async function loadFromEntry(entry: VideoManifestIndexEntry): Promise<FixtureVideo> {
  const manifestText = await readFile(join(fixturesRoot(), entry.manifest), 'utf-8')
  const vttPath = join(fixturesRoot(), entry.vtt)
  const vttText = await readFile(vttPath, 'utf-8')
  return {
    videoId: entry.videoId,
    title: entry.title,
    manifest: parseMasterManifest(manifestText),
    vttPath,
    cues: parseVtt(vttText),
    courseId: entry.courseId,
    playbackUrl: entry.playbackUrl,
  }
}

/**
 * Simulate the Gumlet subtitle rendition GET. In the real integration this
 * would follow the manifest's `#EXT-X-MEDIA:TYPE=SUBTITLES,URI=...`. The
 * open question is whether that URL is signed or DRM-protected — this
 * fixture treats it as a local file for POC purposes.
 */
export async function fetchSubtitleRendition(video: FixtureVideo): Promise<string> {
  return readFile(video.vttPath, 'utf-8')
}

/**
 * List webhook payload fixtures (asset.ready, transcript.completed, ...).
 * Used to smoke-test the ingest queue trigger.
 */
export async function listWebhookFixtures(): Promise<string[]> {
  const dir = join(fixturesRoot(), 'webhooks')
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
}
