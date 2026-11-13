import QtQuick
import qs.Commons
import "../lib/spotify.js" as Spotify

// omarchy-shell mathisarends.spotify <method> [argument]
//
// Only the leading instance answers, so several bars never send the same
// command twice.
ShellIpc {
  id: ipc

  required property var widget
  readonly property var client: widget.client

  target: "mathisarends.spotify"

  // ---- Panel ----
  function open(): void {
    ipc.widget.open()
  }

  function close(): void {
    ipc.widget.close()
  }

  function show(): void {
    ipc.widget.open()
  }

  function hide(): void {
    ipc.widget.close()
  }

  function toggle(): void {
    ipc.widget.toggle()
  }

  function search(): void {
    ipc.widget.openSearch()
  }

  function refresh(): void {
    ipc.client.refreshAll(true)
  }

  // ---- Playback ----
  function playPause(): void {
    ipc.client.playPause()
  }

  function play(): void {
    ipc.client.play()
  }

  function pause(): void {
    ipc.client.pause()
  }

  function next(): void {
    ipc.client.skip(true)
  }

  function previous(): void {
    ipc.client.skip(false)
  }

  function shuffle(): void {
    ipc.client.toggleShuffle()
  }

  function volumeUp(amount: string): void {
    ipc.client.nudgeVolume(Number(amount) || ipc.widget.step)
  }

  function volumeDown(amount: string): void {
    ipc.client.nudgeVolume(-(Number(amount) || ipc.widget.step))
  }

  function volume(percent: string): void {
    const value = Number(percent)
    if (percent !== "" && isFinite(value)) {
      ipc.client.setVolume(value)
    }
  }

  // ---- What to play ----

  /** A playlist by name, a Spotify URI or link, or "liked". */
  function playlist(target: string): string {
    if (!ipc.client.connected) {
      return ipc.client.status
    }
    const uri = Spotify.uriFromReference(target)
    const text = target.trim()
    if (!uri && text === "") {
      return "unknown"
    }
    ipc.client.playTarget(uri || (text.toLowerCase() === Spotify.LIKED ? Spotify.LIKED : text), false)
    return "ok"
  }

  function liked(): string {
    return playlist(Spotify.LIKED)
  }

  function favorite(label: string): string {
    const favorite = ipc.widget.favorites.find(label)
    if (!favorite) {
      return "unknown"
    }
    ipc.client.playTarget(favorite.target, favorite.shuffle)
    return "ok"
  }

  /** A device by id, name, or a unique part of its name (spoti matches it). */
  function device(name: string): string {
    if (!ipc.client.connected) {
      return ipc.client.status
    }
    if (name.trim() === "") {
      return "unknown"
    }
    ipc.client.transferTo(name.trim())
    return "ok"
  }

  // ---- For scripts ----
  function nowPlaying(): string {
    const playback = ipc.client.playback
    return playback.title ? Spotify.trackLine(playback.title, playback.artist) : ""
  }

  function state(): string {
    const client = ipc.client
    return JSON.stringify({
      status: client.status,
      playing: client.live.playing,
      track: client.playback.title,
      artist: client.playback.artist,
      uri: client.playback.uri,
      context: client.playback.contextUri,
      volume: client.live.volume,
      shuffle: client.live.shuffle,
      device: client.playback.device ? client.playback.device.name : "",
    })
  }
}
