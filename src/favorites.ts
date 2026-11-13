// The favorites file: one "Label = what to play" per line, # for comments.
//
//   Focus     = spotify:playlist:37i9dQZF1DWZeKCadgRdKQ
//   Running   = https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP?si=x
//   Liked     = liked
//   Road trip = Road Trip            (one of your playlists, by name)
//
// Add "--shuffle" at the end to start shuffled.

import { cleanName, uriFromReference } from "./input.ts"

export const MAX_FAVORITES = 48
export const LIKED = "liked"

export interface Favorite {
  label: string
  /** A Spotify URI, "liked", or the name of one of your playlists. */
  target: string
  shuffle: boolean
  line: number
}

const SHUFFLE_FLAG = /\s+--shuffle\s*$/

function parseTarget(value: string): string {
  const text = cleanName(value)
  if (text.toLowerCase() === LIKED) {
    return LIKED
  }
  if (/^(spotify:|https?:)/i.test(text)) {
    // A link that is not a Spotify link is skipped rather than searched for.
    return uriFromReference(text)
  }
  return text
}

/** Lines that do not parse are skipped. */
export function parseFavorites(text: string): Favorite[] {
  const favorites: Favorite[] = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length && favorites.length < MAX_FAVORITES; i++) {
    const line = lines[i].trim()
    const eq = line.indexOf("=")
    if (line.startsWith("#") || eq <= 0) {
      continue
    }
    const label = cleanName(line.slice(0, eq))
    let rest = line.slice(eq + 1)
    const shuffle = SHUFFLE_FLAG.test(rest)
    rest = rest.replace(SHUFFLE_FLAG, "")
    const target = parseTarget(rest)
    if (label && target) {
      favorites.push({ label, target, shuffle, line: i + 1 })
    }
  }
  return favorites
}

export function findFavorite(favorites: Favorite[], label: string): Favorite | null {
  const key = label.trim().toLowerCase()
  return favorites.find((favorite) => favorite.label.toLowerCase() === key) ?? null
}

/** The favorite that plays this URI, if any. */
export function favoriteFor(favorites: Favorite[], uri: string): Favorite | null {
  return favorites.find((favorite) => favorite.target === uri) ?? null
}

// "=" ends the label and "#" starts a comment, so neither may appear in one.
function labelFor(name: string): string {
  return cleanName(name.replace(/[=#]/g, " ").replace(/\s+/g, " ")) || "Playlist"
}

/**
 * The file with this target added at the end, or every line playing it
 * removed when it is there already. Everything else is kept as written.
 */
export function toggleFavorite(text: string, name: string, target: string): string {
  const lines = text === "" ? [] : text.replace(/\n+$/, "").split("\n")
  const existing = new Set(parseFavorites(text).filter((favorite) => favorite.target === target).map((favorite) => favorite.line))
  if (existing.size > 0) {
    return lines.filter((_, i) => !existing.has(i + 1)).join("\n") + "\n"
  }
  return [...lines, `${labelFor(name)} = ${target}`].join("\n") + "\n"
}

export const FAVORITES_TEMPLATE = [
  "# Spotify favorites for the Omarchy bar. Saving this file updates the panel.",
  "# Press f on a playlist in the panel to add or remove it here.",
  "#",
  "# One favorite per line:   Label = what to play",
  "# What to play is a Spotify URI or open.spotify.com link (playlist, album,",
  "# artist, show or track), the name of one of your playlists, or \"liked\"",
  "# for your liked songs. Add --shuffle at the end to start shuffled.",
  "#",
  "# Focus     = spotify:playlist:37i9dQZF1DWZeKCadgRdKQ",
  "# Running   = https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP --shuffle",
  "# Road trip = Road Trip",
  "",
  "Liked songs = liked --shuffle",
  "",
].join("\n")
