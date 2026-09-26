import type { Cue } from '../glossary/correction.js'

/**
 * Minimal WEBVTT parser sufficient for Gumlet / YouTube ASR output.
 * NOTE Style/Region blocks and voice tags are stripped — we only care about
 * `id`, timestamps, and text for retrieval + display.
 */
export function parseVtt(vtt: string): Cue[] {
  const text = vtt.replace(/\r\n/g, '\n').replace(/^﻿/, '')
  if (!/^WEBVTT/.test(text.trim())) {
    throw new Error('Not a WEBVTT file (missing WEBVTT header)')
  }
  const lines = text.split('\n')
  const cues: Cue[] = []
  let i = 0
  let auto = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (/-->/.test(line)) {
      const idAbove = i > 0 ? lines[i - 1]!.trim() : ''
      const hasExplicitId = idAbove !== '' && !/-->/.test(idAbove) && !/^WEBVTT/.test(idAbove)
      const id = hasExplicitId ? idAbove : `c${++auto}`
      const [startStr, endStr] = line.split('-->').map((s) => s.trim().split(' ')[0]!)
      const startSec = parseTs(startStr!)
      const endSec = parseTs(endStr!)
      const textLines: string[] = []
      i++
      while (i < lines.length && lines[i]!.trim() !== '') {
        textLines.push(lines[i]!)
        i++
      }
      cues.push({
        id,
        startSec,
        endSec,
        text: cleanCueText(textLines.join('\n')),
      })
    }
    i++
  }
  return cues
}

function parseTs(ts: string): number {
  // hh:mm:ss.mmm or mm:ss.mmm
  const parts = ts.split(':')
  let h = 0, m = 0, s = 0
  if (parts.length === 3) {
    h = Number(parts[0])
    m = Number(parts[1])
    s = Number(parts[2])
  } else if (parts.length === 2) {
    m = Number(parts[0])
    s = Number(parts[1])
  } else {
    s = Number(parts[0])
  }
  return h * 3600 + m * 60 + s
}

function cleanCueText(t: string): string {
  return t
    .replace(/<[^>]+>/g, '') // strip voice/style tags
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Serialise Cues back to WEBVTT for pushing the corrected track to Gumlet.
 * Preserves ids and timestamps; only text changes.
 */
export function toVtt(cues: Cue[]): string {
  const lines = ['WEBVTT', '']
  for (const c of cues) {
    lines.push(c.id)
    lines.push(`${fmtTs(c.startSec)} --> ${fmtTs(c.endSec)}`)
    lines.push(c.text)
    lines.push('')
  }
  return lines.join('\n')
}

function fmtTs(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const ms = Math.round((s - Math.floor(s)) * 1000)
  return `${pad(h)}:${pad(m)}:${pad(Math.floor(s))}.${pad(ms, 3)}`
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}
