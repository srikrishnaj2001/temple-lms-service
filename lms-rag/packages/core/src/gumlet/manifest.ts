/**
 * Minimal HLS master manifest parser — just enough to extract subtitle
 * renditions and their URIs. Fixtures live in `fixtures/gumlet/manifests/`.
 * The real Gumlet manifest may sign the subtitle rendition URL — that's the
 * open question flagged in §10 of the plan; the parser here treats the URI
 * as opaque and lets the fixture layer decide how to resolve it.
 */

export interface SubtitleRendition {
  groupId: string
  language: string
  name: string
  uri: string
  forced: boolean
  isDefault: boolean
  autoselect: boolean
}

export interface ParsedMasterManifest {
  version?: number
  subtitles: SubtitleRendition[]
  variants: Array<{
    bandwidth: number
    resolution?: string
    codecs?: string
    subtitlesGroupId?: string
    uri: string
  }>
}

export function parseMasterManifest(text: string): ParsedMasterManifest {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const result: ParsedMasterManifest = { subtitles: [], variants: [] }
  let pendingVariantAttrs: Record<string, string> | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (line.startsWith('#EXT-X-VERSION:')) {
      result.version = Number(line.split(':')[1])
    } else if (line.startsWith('#EXT-X-MEDIA:')) {
      const attrs = parseAttrs(line.slice('#EXT-X-MEDIA:'.length))
      if (attrs['TYPE'] === 'SUBTITLES') {
        result.subtitles.push({
          groupId: attrs['GROUP-ID'] ?? '',
          language: attrs['LANGUAGE'] ?? '',
          name: attrs['NAME'] ?? '',
          uri: attrs['URI'] ?? '',
          forced: attrs['FORCED'] === 'YES',
          isDefault: attrs['DEFAULT'] === 'YES',
          autoselect: attrs['AUTOSELECT'] === 'YES',
        })
      }
    } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
      pendingVariantAttrs = parseAttrs(line.slice('#EXT-X-STREAM-INF:'.length))
    } else if (line.length > 0 && !line.startsWith('#') && pendingVariantAttrs) {
      result.variants.push({
        bandwidth: Number(pendingVariantAttrs['BANDWIDTH'] ?? '0'),
        resolution: pendingVariantAttrs['RESOLUTION'],
        codecs: pendingVariantAttrs['CODECS'],
        subtitlesGroupId: pendingVariantAttrs['SUBTITLES'],
        uri: line,
      })
      pendingVariantAttrs = null
    }
  }
  return result
}

// #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",...
function parseAttrs(input: string): Record<string, string> {
  const out: Record<string, string> = {}
  // simple state machine — attrs can contain quoted strings with commas
  let i = 0
  while (i < input.length) {
    const eq = input.indexOf('=', i)
    if (eq < 0) break
    const key = input.slice(i, eq).trim()
    let j = eq + 1
    let value: string
    if (input[j] === '"') {
      const close = input.indexOf('"', j + 1)
      value = input.slice(j + 1, close)
      j = close + 1
    } else {
      const comma = input.indexOf(',', j)
      const end = comma === -1 ? input.length : comma
      value = input.slice(j, end)
      j = end
    }
    out[key] = value
    if (input[j] === ',') j++
    i = j
  }
  return out
}
