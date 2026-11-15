import { useEffect, useRef, useState } from 'react'
import { seatIndexOf } from '../../lib/holdem/engine'
import type { TableSnapshot } from './backend'

/**
 * Table sounds, synthesised with Web Audio (no audio files). Phones only allow sound after the user touched
 * the page, so the audio context is created / resumed on the first tap. Muting is remembered per device.
 */
export type SoundName = 'turn' | 'chips' | 'check' | 'fold' | 'deal' | 'win' | 'bonus'

const KEY = 'poker.holdem.sound'
let ctx: AudioContext | null = null
let enabled = readEnabled()
const listeners = new Set<(on: boolean) => void>()

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function soundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(on: boolean): void {
  enabled = on
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // private mode: keep it for this visit only
  }
  for (const l of listeners) l(on)
  if (on) unlock()
}

/** Call from a user gesture (first tap). Safe to call many times. */
export function unlock(): void {
  try {
    if (ctx === null) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, endFreq?: number): void {
  if (!ctx) return
  const t = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function noise(start: number, dur: number, gain: number, freq: number): void {
  if (!ctx) return
  const t = ctx.currentTime + start
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  const g = ctx.createGain()
  g.gain.value = gain
  src.connect(filter).connect(g).connect(ctx.destination)
  src.start(t)
}

export function play(name: SoundName): void {
  if (!enabled || !ctx || ctx.state !== 'running') return
  switch (name) {
    case 'turn':
      tone(880, 0, 0.16, 'sine', 0.28)
      tone(1320, 0.17, 0.24, 'sine', 0.24)
      break
    case 'chips':
      for (let i = 0; i < 3; i++) tone(2400 + i * 300, i * 0.045, 0.05, 'triangle', 0.12)
      noise(0, 0.12, 0.15, 3200)
      break
    case 'check':
      tone(180, 0, 0.07, 'square', 0.12)
      tone(160, 0.11, 0.07, 'square', 0.12)
      break
    case 'fold':
      noise(0, 0.22, 0.12, 900)
      break
    case 'deal':
      noise(0, 0.09, 0.18, 2200)
      break
    case 'win':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.22, 'triangle', 0.18))
      break
    case 'bonus':
      ;[392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.2, 'square', 0.1))
      noise(0.45, 0.35, 0.2, 3000)
      break
  }
}

/** Mute switch state for the UI. */
export function useSoundSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(enabled)
  useEffect(() => {
    listeners.add(setOn)
    return () => {
      listeners.delete(setOn)
    }
  }, [])
  return [on, setSoundEnabled]
}

/** Plays a sound for what changed between two snapshots of the table. */
export function useTableSounds(snap: TableSnapshot | null, me: string): void {
  const prev = useRef<TableSnapshot | null>(null)

  useEffect(() => {
    const onTap = (): void => unlock()
    window.addEventListener('pointerdown', onTap)
    return () => window.removeEventListener('pointerdown', onTap)
  }, [])

  useEffect(() => {
    const before = prev.current
    prev.current = snap
    if (!snap || !before) return
    const a = before.pub
    const b = snap.pub
    if (b.v <= a.v) return
    const ha = a.hand
    const hb = b.hand
    const myIdx = seatIndexOf(b, me)

    // the end of a hand
    if (hb?.result && !ha?.result) {
      if (hb.result.bonus?.length) play('bonus')
      else if (myIdx >= 0 && (hb.result.won[String(myIdx)] ?? 0) > 0) play('win')
      else play('chips')
      return
    }
    // a new hand / new cards on the board
    if (hb && (!ha || hb.no !== ha.no || hb.board.length > ha.board.length)) {
      play('deal')
    }
    // what the others just did
    if (hb && ha && hb.no === ha.no) {
      for (let i = 0; i < b.seats.length; i++) {
        const sa = a.seats[i]
        const sb = b.seats[i]
        if (!sa || !sb || sb.last === sa.last || sb.last === null) continue
        if (sb.last === 'fold') play('fold')
        else if (sb.last === 'check') play('check')
        else if (sb.last === 'call' || sb.last === 'bet' || sb.last === 'raise' || sb.last === 'allin') play('chips')
        break
      }
    }
    // my turn just started
    const mineNow = hb !== null && hb.toAct !== null && hb.toAct === myIdx && b.phase === 'hand'
    const mineBefore = ha !== null && ha.toAct !== null && ha.toAct === seatIndexOf(a, me) && a.phase === 'hand'
    if (mineNow && !(mineBefore && ha?.no === hb?.no && ha?.street === hb?.street && ha?.currentBet === hb?.currentBet)) {
      setTimeout(() => play('turn'), 250)
    }
  }, [snap, me])
}
