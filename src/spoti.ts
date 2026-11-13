// Reading what spoti prints: `--json` output, errors on stderr and exit
// codes. See https://github.com/mathisarends/spoti#scripting-and-agents.

import { cleanId, cleanName, cleanUri, clampPercent, isRecord, parseJson } from "./input.ts"

export const MAX_PLAYLISTS = 1000
export const PAGE_SIZE = 50
export const MAX_DEVICES = 32

export type Status = "loading" | "ok" | "missing" | "notConfigured" | "unreachable" | "error"

export interface Device {
  id: string
  name: string
  /** Spotify's device type: "Computer", "Smartphone", "Speaker", ... */
  type: string
  active: boolean
  restricted: boolean
  /** 0-100, or -1 when the device does not say. */
  volume: number
}

export interface Playback {
  playing: boolean
  /** The track or episode, "" when nothing is loaded. */
  title: string
  /** Artists, or the show of an episode. */
  artist: string
  uri: string
  /** The playlist, album or artist playing, or "". */
  contextUri: string
  progressMs: number
  durationMs: number
  shuffle: boolean
  repeat: string
  device: Device | null
}

export interface Playlist {
  id: string
  name: string
  uri: string
  owner: string
  tracks: number
}

export interface SpotiError {
  reason: string
  message: string
}

export function emptyPlayback(): Playback {
  return {
    playing: false,
    title: "",
    artist: "",
    uri: "",
    contextUri: "",
    progressMs: 0,
    durationMs: 0,
    shuffle: false,
    repeat: "off",
    device: null,
  }
}

function count(value: unknown): number {
  return typeof value === "number" && isFinite(value) && value > 0 ? Math.round(value) : 0
}

function names(list: unknown): string {
  if (!Array.isArray(list)) {
    return ""
  }
  return cleanName(list.filter(isRecord).map((artist) => cleanName(artist.name)).filter((name) => name !== "").join(", "))
}

export function parseDevice(raw: unknown): Device | null {
  if (!isRecord(raw)) {
    return null
  }
  const id = cleanId(raw.id)
  const name = cleanName(raw.name)
  if (!id || !name) {
    return null
  }
  return {
    id,
    name,
    type: cleanName(raw.type),
    active: raw.is_active === true,
    restricted: raw.is_restricted === true,
    volume: typeof raw.volume_percent === "number" ? clampPercent(raw.volume_percent) : -1,
  }
}

/** `spoti status --json`. Nothing playing comes back as an empty object. */
export function parsePlayback(text: string): Playback {
  const state = parseJson(text)
  const playback = emptyPlayback()
  if (!isRecord(state)) {
    return playback
  }
  playback.device = parseDevice(state.device)
  playback.shuffle = state.shuffle_state === true
  playback.repeat = typeof state.repeat_state === "string" && state.repeat_state !== "" ? cleanName(state.repeat_state) : "off"
  if (isRecord(state.context)) {
    playback.contextUri = cleanUri(state.context.uri)
  }

  const item = state.item
  if (!isRecord(item)) {
    return playback
  }
  playback.playing = state.is_playing === true
  playback.title = cleanName(item.name)
  playback.artist = names(item.artists) || (isRecord(item.show) ? cleanName(item.show.name) : "")
  playback.uri = cleanUri(item.uri)
  playback.durationMs = count(item.duration_ms)
  playback.progressMs = Math.min(count(state.progress_ms), playback.durationMs)
  return playback
}

/** `spoti device list --json`: active first, then by name. */
export function parseDevices(text: string): Device[] {
  const list = parseJson(text)
  if (!Array.isArray(list)) {
    return []
  }
  return list
    .map(parseDevice)
    .filter((device): device is Device => device !== null)
    .slice(0, MAX_DEVICES)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
}

export interface Page<T> {
  items: T[]
  total: number
}

function parsePage<T>(text: string, parse: (raw: unknown) => T | null): Page<T> {
  const page = parseJson(text)
  if (!isRecord(page) || !Array.isArray(page.items)) {
    return { items: [], total: 0 }
  }
  return {
    // Spotify sometimes hands out null entries; they are skipped.
    items: page.items.map(parse).filter((item): item is T => item !== null),
    total: count(page.total),
  }
}

function parsePlaylist(raw: unknown): Playlist | null {
  if (!isRecord(raw)) {
    return null
  }
  const id = cleanId(raw.id)
  const name = cleanName(raw.name)
  const uri = cleanUri(raw.uri) || (id ? cleanUri(`spotify:playlist:${id}`) : "")
  if (!id || !name || !uri) {
    return null
  }
  return {
    id,
    name,
    uri,
    owner: isRecord(raw.owner) ? cleanName(raw.owner.display_name) : "",
    tracks: isRecord(raw.tracks) ? count(raw.tracks.total) : 0,
  }
}

/** One page of `spoti playlist list --json`. */
export function parsePlaylistPage(text: string): Page<Playlist> {
  return parsePage(text, parsePlaylist)
}

/** One page of `spoti library list tracks --json`, as track URIs. */
export function parseTrackUris(text: string): string[] {
  return parsePage(text, (raw) => (isRecord(raw) ? cleanUri(raw.uri) || null : null)).items
}

/** The offset of the page after the one at `offset`, or -1 when that was the last one wanted. */
export function nextOffset(offset: number, pageSize: number, total: number, cap: number): number {
  const next = offset + pageSize
  return next < total && next < cap ? next : -1
}

/** A sentence for a failed command: spoti's own words, or a friendlier one for the usual reasons. */
export function errorText(error: SpotiError, messages: Record<string, string>): string {
  return messages[error.reason] || error.message || messages.generic || ""
}

/** Adds a page, skipping playlists already there (Spotify may shift items between pages). */
export function mergePlaylists(loaded: Playlist[], page: Playlist[]): Playlist[] {
  const seen = new Set(loaded.map((playlist) => playlist.id))
  return loaded.concat(page.filter((playlist) => !seen.has(playlist.id))).slice(0, MAX_PLAYLISTS)
}

// spoti's exit codes. 127 comes from the launcher when the binary is missing.
const EXIT_STATUS: Record<number, Status> = {
  0: "ok",
  3: "notConfigured",
  4: "unreachable",
  127: "missing",
}

export function statusForExit(code: number): Status {
  return EXIT_STATUS[code] ?? "error"
}

/**
 * spoti prints `{"ok": false, "error": {...}}` on stderr with --json, and
 * `error: <message>` without; anything else falls back to the last line.
 */
export function parseError(stderr: string): SpotiError {
  const lines = stderr.split("\n").map((line) => line.trim()).filter((line) => line !== "")
  for (const line of lines.slice().reverse()) {
    const value = parseJson(line)
    if (isRecord(value) && isRecord(value.error)) {
      return { reason: cleanName(value.error.reason), message: cleanName(value.error.message) }
    }
  }
  const last = lines[lines.length - 1] ?? ""
  return { reason: "", message: cleanName(last.replace(/^error:\s*/, "")) }
}
