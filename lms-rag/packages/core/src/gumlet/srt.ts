import type { Cue } from '../glossary/correction.js'

/**
 * Minimal SubRip (SRT) parser. Gumlet returns subtitles in BOTH WebVTT and
 * SRT; this parser produces the same Cue[] shape as parseVtt so downstream
 * code (correction, embedding, storage) doesn't care which format arrived.
 *
 * SRT differs from WebVTT in three ways we handle:
 *   1. No `WEBVTT` header.
 *   2. Every cue starts with a numeric id line (which we keep as the cue id).
 *   3. Timestamps use a comma before ms:  00:00:12,345 --> 00:00:15,678
 *      (WebVTT uses a period)
 */
export function parseSrt(srt: string): Cue[] {
  const text = srt.replace(/\r\n/g, '\n').replace(/^﻿/, '').trim()
  if (!text) return []

  // Split on blank lines — each block is one cue.
  const blocks = text.split(/\n{2,}/)
  const cues: Cue[] = []

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0)
    if (lines.length < 2) continue

    // First line = numeric id (usually). If it isn't, generate one.
    let idLine = lines[0]!.trim()
    let arrowIdx = 0
    if (/-->/.test(idLine)) {
      // No id line — the arrow is on line 0
      idLine = String(cues.length + 1)
      arrowIdx = 0
    } else {
      arrowIdx = 1
    }
    const arrow = lines[arrowIdx]
    if (!arrow || !/-->/.test(arrow)) continue

    const [startStr, endStr] = arrow.split('-->').map((s) => s.trim())
    const startSec = parseSrtTs(startStr!)
    const endSec = parseSrtTs(endStr!)
    const textLines = lines.slice(arrowIdx + 1)

    cues.push({
      id: idLine,
      startSec,
      endSec,
      text: cleanCueText(textLines.join('\n')),
    })
  }
  return cues
}

function parseSrtTs(ts: string): number {
  // 00:00:12,345 or 00:00:12.345 or 00:12,345 or 12,345
  const normalised = ts.replace(',', '.').trim()
  const parts = normalised.split(':')
  let h = 0
  let m = 0
  let s = 0
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
    .replace(/<[^>]+>/g, '') // strip HTML tags some SRT tools include
    .replace(/\{[^}]+\}/g, '') // strip {}-style style tags some tools use
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Detect whether a string is WebVTT, SRT, or neither. Cheap heuristic —
 * good enough for Gumlet output which is always well-formed.
 */
export function detectSubtitleFormat(text: string): 'vtt' | 'srt' | 'unknown' {
  const trimmed = text.trim()
  if (/^WEBVTT/i.test(trimmed)) return 'vtt'
  // SRT: first non-empty line is a number, next contains "-->"
  const lines = trimmed.split(/\r?\n/).slice(0, 5)
  const firstNumeric = lines.find((l) => /^\d+$/.test(l.trim()))
  const hasArrow = lines.some((l) => /-->/.test(l))
  if (firstNumeric && hasArrow) return 'srt'
  // Bare timestamp on line 0 with no header — treat as SRT (some tools omit id)
  if (hasArrow) return 'srt'
  return 'unknown'
}
