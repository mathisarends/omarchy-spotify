import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  errorText, mergePlaylists, nextOffset, parseDevices, parseError, parsePlayback, parsePlaylistPage, parseTrackUris,
  statusForExit,
} from "../src/spoti.ts"
import type { Playlist } from "../src/spoti.ts"
import { uriFromReference } from "../src/input.ts"

const DEVICE = { id: "abc123", name: "Kitchen", type: "Speaker", is_active: true, is_restricted: false, volume_percent: 40 }

const STATUS = JSON.stringify({
  is_playing: true,
  progress_ms: 61000,
  shuffle_state: true,
  repeat_state: "context",
  device: DEVICE,
  context: { uri: "spotify:playlist:37i9dQZF1DWZeKCadgRdKQ" },
  item: {
    name: "Song\nTitle",
    uri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
    duration_ms: 200000,
    artists: [{ name: "One" }, { name: "Two" }],
  },
})

describe("parsePlayback", () => {
  it("reads what is playing", () => {
    const playback = parsePlayback(STATUS)
    assert.equal(playback.playing, true)
    assert.equal(playback.title, "Song Title")
    assert.equal(playback.artist, "One, Two")
    assert.equal(playback.uri, "spotify:track:4uLU6hMCjMI75M1A2tKUQC")
    assert.equal(playback.contextUri, "spotify:playlist:37i9dQZF1DWZeKCadgRdKQ")
    assert.equal(playback.progressMs, 61000)
    assert.equal(playback.durationMs, 200000)
    assert.equal(playback.shuffle, true)
    assert.equal(playback.repeat, "context")
    assert.equal(playback.device?.name, "Kitchen")
    assert.equal(playback.device?.volume, 40)
  })

  it("treats an empty object as nothing playing", () => {
    const playback = parsePlayback("{}")
    assert.equal(playback.playing, false)
    assert.equal(playback.title, "")
    assert.equal(playback.device, null)
  })

  it("survives garbage", () => {
    assert.equal(parsePlayback("not json").title, "")
    assert.equal(parsePlayback("[]").playing, false)
  })

  it("names the show of an episode", () => {
    const text = JSON.stringify({ is_playing: false, item: { name: "Ep", uri: "spotify:episode:abc", show: { name: "Pod" } } })
    assert.equal(parsePlayback(text).artist, "Pod")
  })

  it("never puts progress past the end", () => {
    const text = JSON.stringify({ progress_ms: 9000, item: { name: "x", duration_ms: 5000 } })
    assert.equal(parsePlayback(text).progressMs, 5000)
  })

  it("drops context URIs spoti cannot play", () => {
    const text = JSON.stringify({ context: { uri: "spotify:user:me:collection" }, item: { name: "x" } })
    assert.equal(parsePlayback(text).contextUri, "")
  })
})

describe("parseDevices", () => {
  it("puts the active device first, then sorts by name", () => {
    const devices = parseDevices(JSON.stringify([
      { id: "b", name: "Zed", type: "Computer", is_active: false },
      { id: "c", name: "Alpha", type: "Smartphone", is_active: false },
      DEVICE,
    ]))
    assert.deepEqual(devices.map((device) => device.name), ["Kitchen", "Alpha", "Zed"])
    assert.equal(devices[1].volume, -1)
  })

  it("skips devices without a usable id or name", () => {
    const devices = parseDevices(JSON.stringify([{ id: "a b", name: "x" }, { id: "ok", name: "" }, null, DEVICE]))
    assert.equal(devices.length, 1)
  })

  it("returns nothing for garbage", () => {
    assert.deepEqual(parseDevices("{}"), [])
  })
})

describe("parsePlaylistPage", () => {
  it("reads playlists and the total", () => {
    const page = parsePlaylistPage(JSON.stringify({
      total: 120,
      items: [
        { id: "p1", name: "Focus", uri: "spotify:playlist:p1", owner: { display_name: "Me" }, tracks: { total: 12 } },
        null,
        { id: "p2", name: "No uri" },
        { id: "bad id", name: "x" },
      ],
    }))
    assert.equal(page.total, 120)
    assert.deepEqual(page.items.map((item) => item.uri), ["spotify:playlist:p1", "spotify:playlist:p2"])
    assert.equal(page.items[0].owner, "Me")
    assert.equal(page.items[0].tracks, 12)
  })

  it("is empty for garbage", () => {
    assert.deepEqual(parsePlaylistPage("oops"), { items: [], total: 0 })
  })
})

describe("parseTrackUris", () => {
  it("keeps valid URIs in order", () => {
    const text = JSON.stringify({ items: [{ uri: "spotify:track:a" }, { uri: "nope" }, { uri: "spotify:track:b" }] })
    assert.deepEqual(parseTrackUris(text), ["spotify:track:a", "spotify:track:b"])
  })
})

describe("paging", () => {
  it("moves on until the total or the cap", () => {
    assert.equal(nextOffset(0, 50, 120, 1000), 50)
    assert.equal(nextOffset(100, 50, 120, 1000), -1)
    assert.equal(nextOffset(950, 50, 5000, 1000), -1)
  })

  it("merges pages without duplicates", () => {
    const a: Playlist = { id: "a", name: "A", uri: "spotify:playlist:a", owner: "", tracks: 0 }
    const b: Playlist = { ...a, id: "b", uri: "spotify:playlist:b" }
    assert.deepEqual(mergePlaylists([a], [a, b]).map((p) => p.id), ["a", "b"])
  })
})

describe("errors", () => {
  it("maps exit codes to a status", () => {
    assert.equal(statusForExit(0), "ok")
    assert.equal(statusForExit(3), "notConfigured")
    assert.equal(statusForExit(4), "unreachable")
    assert.equal(statusForExit(127), "missing")
    assert.equal(statusForExit(1), "error")
  })

  it("reads spoti's JSON error line", () => {
    const err = 'warning\n{"ok":false,"error":{"message":"no device","exit_code":1,"reason":"no_active_device"}}\n'
    assert.deepEqual(parseError(err), { reason: "no_active_device", message: "no device" })
  })

  it("falls back to the last line", () => {
    assert.deepEqual(parseError("error: boom\n"), { reason: "", message: "boom" })
    assert.deepEqual(parseError(""), { reason: "", message: "" })
  })

  it("prefers a friendly message for known reasons", () => {
    const messages = { generic: "Oops", premium_required: "Premium" }
    assert.equal(errorText({ reason: "premium_required", message: "403" }, messages), "Premium")
    assert.equal(errorText({ reason: "other", message: "raw" }, messages), "raw")
    assert.equal(errorText({ reason: "", message: "" }, messages), "Oops")
  })
})

describe("uriFromReference", () => {
  it("accepts URIs and links", () => {
    assert.equal(uriFromReference("spotify:track:abc"), "spotify:track:abc")
    assert.equal(uriFromReference("https://open.spotify.com/intl-de/album/xyz?si=1"), "spotify:album:xyz")
  })

  it("rejects everything else", () => {
    assert.equal(uriFromReference("spotify:user:x:collection"), "")
    assert.equal(uriFromReference("https://open.spotify.com.evil.com/album/x"), "")
    assert.equal(uriFromReference("http://open.spotify.com/album/x"), "")
  })
})
