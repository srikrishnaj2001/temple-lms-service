/**
 * Dump the raw Gumlet asset JSON so we can see where subtitles actually live
 * in the current API response shape.
 */
import { config } from '../config.js'

async function main() {
  const assetId = process.argv[2]
  if (!assetId) {
    console.error('usage: tsx src/scripts/dump-gumlet-asset.ts <assetId>')
    process.exit(1)
  }
  const cfg = config()
  const base = cfg.GUMLET_API_BASE.replace(/\/+$/, '')

  const paths = [
    `/video/assets/${assetId}`,
    `/video/assets/${assetId}/subtitles`,
    `/video/assets/${assetId}/tracks`,
  ]
  for (const p of paths) {
    console.log(`\n=== GET ${p} ===`)
    const res = await fetch(`${base}${p}`, {
      headers: {
        authorization: `Bearer ${cfg.GUMLET_API_KEY}`,
        accept: 'application/json',
      },
    })
    console.log(`Status: ${res.status}`)
    const body = await res.text().catch(() => '')
    // Print any subtitle-related keys we can spot
    for (const kw of ['subtitle', 'caption', 'vtt', 'srt', 'transcript', 'track']) {
      const idx = body.toLowerCase().indexOf(kw)
      if (idx >= 0) console.log(`  [contains "${kw}" @ ${idx}]`)
    }
    console.log(body)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
