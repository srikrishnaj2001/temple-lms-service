import { config } from '../config.js'

/**
 * Gumlet Video Management API client — the subset we use.
 *
 * Auth: Bearer API key in Authorization header. Base URL configurable via
 * `GUMLET_API_BASE` (defaults to their production `https://api.gumlet.com/v1`).
 *
 * Endpoints exposed:
 *   getAsset(id)               → basic metadata (title, status, playback URL,
 *                                available subtitles)
 *   getSubtitleTracks(id)      → list of subtitle tracks for the asset
 *   fetchSubtitleContent(url)  → downloads the VTT/SRT text body
 *
 * Kept intentionally small — we only need the transcript flow. If we later
 * need webhook signature verification or asset creation, add here.
 */

export interface GumletSubtitleTrack {
  id?: string
  language?: string
  language_code?: string
  /** direct URL to the VTT/SRT body — sometimes signed, sometimes not */
  url?: string
  format?: 'vtt' | 'srt' | string
  status?: string
  /** Some tenants get `origin: 'auto'` for machine-generated tracks */
  origin?: string
}

export interface GumletAsset {
  asset_id: string
  collection_id?: string
  workspace_id?: string
  title?: string
  status?: string
  playback_url?: string
  input?: {
    transformations?: {
      generate_subtitles?: {
        audio_language?: string
        subtitle_languages?: string[]
      }
    }
  }
  output?: {
    playback_url?: string
    format?: string
    storage_details?: {
      subtitle?: Array<{ fileName?: string; size?: number }>
    }
  }
  subtitles?: GumletSubtitleTrack[]
}

function requireKey(): string {
  const k = config().GUMLET_API_KEY
  if (!k) throw new Error('GUMLET_API_KEY not configured')
  return k
}

async function gumletFetch<T>(path: string): Promise<T> {
  const base = config().GUMLET_API_BASE.replace(/\/+$/, '')
  const res = await fetch(`${base}${path}`, {
    headers: {
      authorization: `Bearer ${requireKey()}`,
      accept: 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gumlet ${path} → ${res.status}: ${body.slice(0, 240)}`)
  }
  return (await res.json()) as T
}

/**
 * Fetch metadata for a single Gumlet asset. Response shape varies slightly
 * across their API versions — callers should treat every field as optional
 * except `asset_id`.
 */
export async function getAsset(assetId: string): Promise<GumletAsset> {
  return gumletFetch<GumletAsset>(`/video/assets/${assetId}`)
}

/**
 * List subtitle tracks on an asset. Gumlet doesn't have a dedicated tracks
 * endpoint on this API version — the subtitle files are listed under
 * `output.storage_details.subtitle[]` with a fileName like
 * `{assetId}_0_en.vtt`. We reconstruct the public delivery URL:
 *   https://video.gumlet.io/{collection_id}/{asset_id}/{fileName}
 * The language code is parsed out of the filename convention `_<lang>.vtt`.
 * Falls back to the legacy `subtitles` inline field if present.
 */
export async function getSubtitleTracks(assetId: string): Promise<GumletSubtitleTrack[]> {
  const asset = await getAsset(assetId)
  const legacy = asset.subtitles ?? []
  if (legacy.length > 0) return legacy

  const files = asset.output?.storage_details?.subtitle ?? []
  const collectionId = asset.collection_id ?? asset.workspace_id
  if (!collectionId) return []

  const tracks: GumletSubtitleTrack[] = []
  for (const f of files) {
    if (!f.fileName) continue
    const fmt: 'vtt' | 'srt' | undefined = f.fileName.endsWith('.vtt')
      ? 'vtt'
      : f.fileName.endsWith('.srt')
        ? 'srt'
        : undefined
    // Filename pattern: `{assetId}_{index}_{lang}.vtt`
    const langMatch = /_([a-zA-Z-]+)\.(vtt|srt)$/.exec(f.fileName)
    const language = langMatch?.[1]
    tracks.push({
      language,
      language_code: language,
      format: fmt,
      status: 'ready',
      url: `https://video.gumlet.io/${collectionId}/${assetId}/${f.fileName}`,
    })
  }
  return tracks
}

/**
 * Pick the best subtitle track for RAG indexing. Preference order:
 *  1) Exact language match if `languagePref` supplied (e.g. 'en')
 *  2) English variants ('en', 'en-US', 'en-GB')
 *  3) First 'ready'/'completed'/undefined-status track
 *
 * Returns `undefined` if nothing usable exists.
 */
export function pickSubtitleTrack(
  tracks: GumletSubtitleTrack[],
  languagePref?: string,
): GumletSubtitleTrack | undefined {
  const ready = tracks.filter(
    (t) => !t.status || ['ready', 'completed', 'available'].includes(t.status.toLowerCase()),
  )
  const pool = ready.length > 0 ? ready : tracks

  if (languagePref) {
    const exact = pool.find(
      (t) => (t.language_code ?? t.language ?? '').toLowerCase() === languagePref.toLowerCase(),
    )
    if (exact) return exact
  }
  const english = pool.find((t) => {
    const l = (t.language_code ?? t.language ?? '').toLowerCase()
    return l === 'en' || l.startsWith('en-')
  })
  return english ?? pool[0]
}

/**
 * Download the raw subtitle body (VTT or SRT text) from the given track URL.
 * Follows redirects (fetch does by default) and returns the body verbatim so
 * the caller can auto-detect format via `parseSubtitles`.
 */
export async function fetchSubtitleContent(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`subtitle fetch → ${res.status}`)
  return res.text()
}

/**
 * High-level convenience: given a Gumlet asset id, return the subtitle text
 * ready to hand to `ingestVideoFromPayload`. Throws if no subtitle track exists.
 */
export async function fetchAssetSubtitle(
  assetId: string,
  opts: { languagePref?: string } = {},
): Promise<{ text: string; format?: 'vtt' | 'srt'; track: GumletSubtitleTrack }> {
  const tracks = await getSubtitleTracks(assetId)
  if (tracks.length === 0) {
    throw new Error(`No subtitle tracks available for Gumlet asset ${assetId}`)
  }
  const track = pickSubtitleTrack(tracks, opts.languagePref)
  if (!track?.url) {
    throw new Error(`No usable subtitle URL for Gumlet asset ${assetId}`)
  }
  const text = await fetchSubtitleContent(track.url)
  const format =
    track.format === 'vtt' || track.format === 'srt' ? track.format : undefined
  return { text, format, track }
}
