// Optimistic state. A change shows up the moment it is asked for and wins
// over what Spotify reports until Spotify has caught up, which can take a
// second or two.

import type { Playback } from "./spoti.ts"

export const OVERRIDE_MS = 3500

export interface Override {
  playing?: boolean
  volume?: number
  shuffle?: boolean
  until: number
}

export interface LiveState {
  playing: boolean
  /** 0-100, or -1 when unknown. */
  volume: number
  shuffle: boolean
}

export function liveState(playback: Playback, override: Override | null, now: number): LiveState {
  const fresh = override !== null && override.until > now ? override : null
  return {
    playing: fresh?.playing ?? playback.playing,
    volume: fresh?.volume ?? playback.device?.volume ?? -1,
    shuffle: fresh?.shuffle ?? playback.shuffle,
  }
}

export function withOverride(override: Override | null, patch: Omit<Override, "until">, now: number): Override {
  const base = override !== null && override.until > now ? override : { until: 0 }
  return { ...base, ...patch, until: now + OVERRIDE_MS }
}

/** Volume after a step of delta percent, starting from 50 when unknown. */
export function nudgedVolume(volume: number, delta: number): number {
  const base = volume < 0 ? 50 : volume
  return Math.max(0, Math.min(100, base + delta))
}

/** Where a track is now, moving the last reported position forward while it plays. */
export function progressAt(playback: Playback, playing: boolean, reportedAt: number, now: number): number {
  const elapsed = playing ? Math.max(0, now - reportedAt) : 0
  return Math.min(playback.durationMs, playback.progressMs + elapsed)
}

/** "3:07", or "1:02:03" past an hour. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`
}

/**
 * When to look again: shortly after the track ends while it plays, else the
 * regular interval. Never sooner than a second.
 */
export function nextPollMs(playback: Playback, playing: boolean, progress: number, interval: number): number {
  if (!playing || playback.durationMs === 0) {
    return interval
  }
  const remaining = playback.durationMs - progress + 800
  return Math.max(1000, Math.min(interval, remaining))
}
