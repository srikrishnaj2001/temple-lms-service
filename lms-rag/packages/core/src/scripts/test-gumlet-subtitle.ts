/**
 * One-off probe: fetch a single Gumlet asset's subtitle and print a summary.
 * Used to sanity-check credentials + subtitle availability before running the
 * full 199-video ingest.
 *
 * Usage:
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/test-gumlet-subtitle.ts 6aa7c4f3ae2b40af2afe87c8
 */
import { fetchAssetSubtitle, getSubtitleTracks } from '../gumlet/api-client.js'

async function main() {
  const assetId = process.argv[2]
  if (!assetId) {
    console.error('usage: tsx src/scripts/test-gumlet-subtitle.ts <gumletAssetId>')
    process.exit(1)
  }
  console.log(`Probing Gumlet asset: ${assetId}`)

  const tracks = await getSubtitleTracks(assetId)
  console.log(`Tracks found: ${tracks.length}`)
  for (const t of tracks) {
    console.log(
      `  - id=${t.id ?? '?'} lang=${t.language_code ?? t.language ?? '?'} format=${t.format ?? '?'} status=${t.status ?? '?'} url=${t.url ? 'yes' : 'NO'}`,
    )
  }
  if (tracks.length === 0) {
    console.log('No tracks. Ingest would skip this video.')
    return
  }

  const picked = await fetchAssetSubtitle(assetId, { languagePref: 'en' })
  const preview = picked.text.slice(0, 400).replace(/\n/g, ' | ')
  console.log(`\nPicked track: lang=${picked.track.language_code ?? picked.track.language} format=${picked.format ?? '?'}`)
  console.log(`Body bytes: ${picked.text.length}`)
  console.log(`Preview: ${preview}...`)
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
