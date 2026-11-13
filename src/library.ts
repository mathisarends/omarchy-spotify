// The playlist list in the panel: your liked songs on top, then every
// playlist you own or follow, in Spotify's order.

import type { PlayTarget } from "./commands.ts"
import type { Playlist } from "./spoti.ts"

/** The target of the liked songs row. */
export const LIKED = "liked"

export interface LibraryRow {
  /** A playlist URI, or LIKED. */
  target: string
  name: string
  /** "42 tracks · by Someone" is built in QML; these are its parts. */
  owner: string
  tracks: number
  liked: boolean
}

export function libraryRows(playlists: Playlist[], showLiked: boolean, likedName: string): LibraryRow[] {
  const rows: LibraryRow[] = playlists.map((playlist) => ({
    target: playlist.uri,
    name: playlist.name,
    owner: playlist.owner,
    tracks: playlist.tracks,
    liked: false,
  }))
  if (showLiked) {
    rows.unshift({ target: LIKED, name: likedName, owner: "", tracks: -1, liked: true })
  }
  return rows
}

export function findPlaylist(playlists: Playlist[], name: string): Playlist | null {
  const key = name.trim().toLowerCase()
  if (!key) {
    return null
  }
  return playlists.find((playlist) => playlist.uri === name || playlist.name.toLowerCase() === key) ?? null
}

/**
 * What a row or an IPC argument plays. A name becomes the URI of
 * your playlist with that name when it is loaded; spoti looks it up
 * otherwise. LIKED is handled by the caller, since it needs a lookup first.
 */
export function playTarget(target: string, playlists: Playlist[]): PlayTarget {
  if (target.startsWith("spotify:")) {
    return { kind: "uri", uri: target }
  }
  const playlist = findPlaylist(playlists, target)
  return playlist ? { kind: "uri", uri: playlist.uri } : { kind: "name", name: target }
}

