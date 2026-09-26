import { parseSrt, detectSubtitleFormat } from '../gumlet/srt.js'
import { parseVtt } from '../gumlet/vtt.js'

const srt = `1
00:00:00,000 --> 00:00:05,000
Welcome to Treasury.

2
00:00:05,500 --> 00:00:12,000
Three sub-departments: Banking, Fund Utilization, and Investments.`

const vtt = `WEBVTT

c1
00:00:00.000 --> 00:00:05.000
Welcome to Treasury.

c2
00:00:05.500 --> 00:00:12.000
Three sub-departments: Banking, Fund Utilization, and Investments.`

console.log('SRT detect:', detectSubtitleFormat(srt))
console.log('VTT detect:', detectSubtitleFormat(vtt))
console.log('---')
console.log('SRT parsed:')
console.log(JSON.stringify(parseSrt(srt), null, 2))
console.log('---')
console.log('VTT parsed:')
console.log(JSON.stringify(parseVtt(vtt), null, 2))
