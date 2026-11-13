// Cleaning untrusted input. Track, artist, playlist and device names come
// from Spotify and from the user's file; ids and URIs end up in spoti's argv.

export const MAX_NAME = 96

// Newlines, tabs and the other C0 control characters, plus DEL.
// eslint-disable-next-line no-control-regex -- matching them is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** One line of plain text, at most MAX_NAME characters. */
export function cleanName(value: unknown): string {
  const text = String(value ?? "").replace(CONTROL_CHARS, " ").trim()
  return text.length > MAX_NAME ? text.slice(0, MAX_NAME - 1) + "…" : text
}

/** A Spotify or device id, or "" when it holds anything but letters, digits, "_" and "-". */
export function cleanId(value: unknown): string {
  const id = String(value ?? "")
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : ""
}

const URI_KINDS = ["track", "episode", "album", "artist", "playlist", "show"]

/** "spotify:<kind>:<id>" for a kind spoti can play, or "". */
export function cleanUri(value: unknown): string {
  const match = /^spotify:([a-z]+):([A-Za-z0-9]{1,64})$/.exec(String(value ?? ""))
  return match && URI_KINDS.includes(match[1]) ? match[0] : ""
}

/**
 * A Spotify URI from what a person might paste: a URI, an open.spotify.com
 * link (with or without "intl-xx" and "?si=") or "" when it is neither.
 */
export function uriFromReference(value: string): string {
  const text = value.trim()
  if (text.startsWith("spotify:")) {
    return cleanUri(text)
  }
  const link = /^https:\/\/(?:www\.)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?([a-z]+)\/([A-Za-z0-9]+)(?:[?#].*)?$/.exec(text)
  return link ? cleanUri(`spotify:${link[1]}:${link[2]}`) : ""
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function clampPercent(value: number): number {
  const n = Math.round(value)
  if (!isFinite(n)) {
    return 0
  }
  return Math.max(0, Math.min(100, n))
}
