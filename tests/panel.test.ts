// The small pure helpers behind the panel: filtering, the cursor, the
// library rows, optimistic state and bar text.

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { clampStop, cursorStops, parseStop, sideStop, stepStop } from "../src/cursor.ts"
import { filterByName, foldText } from "../src/filter.ts"
import { LIKED, findPlaylist, libraryRows, playTarget } from "../src/library.ts"
import { formatTime, liveState, nextPollMs, nudgedVolume, progressAt, withOverride } from "../src/overrides.ts"
import { emptyPlayback } from "../src/spoti.ts"
import type { Playlist } from "../src/spoti.ts"
import { shorten, trackLine } from "../src/text.ts"

const list = (...names: string[]) => names.map((name) => ({ name }))

describe("filterByName", () => {
  it("returns everything for an empty query", () => {
    const items = list("a", "b")
    assert.equal(filterByName(items, "  "), items)
  })

  it("needs every word and ranks prefix, then word starts, then the rest", () => {
    const items = list("Deep Focus", "Focus Flow", "Unfocused Jazz", "Chill")
    assert.deepEqual(filterByName(items, "focus").map((i) => i.name), ["Focus Flow", "Deep Focus", "Unfocused Jazz"])
    assert.deepEqual(filterByName(items, "jazz unf").map((i) => i.name), ["Unfocused Jazz"])
  })

  it("ignores case and accents", () => {
    assert.equal(foldText("Café Ü"), "cafe u")
    assert.deepEqual(filterByName(list("Café del Mar"), "CAFE").length, 1)
  })
})

describe("cursor", () => {
  const layout = { connected: true, statusActions: 0, devicesOpen: false, devices: 2, playlists: 2 }

  it("lists the stops top to bottom", () => {
    assert.deepEqual(cursorStops(layout), [
      "transport:0", "transport:1", "transport:2", "transport:3", "volume", "device", "pl:0", "pl:1",
    ])
    assert.deepEqual(cursorStops({ ...layout, devicesOpen: true }).slice(5, 8), ["device", "dev:0", "dev:1"])
    assert.deepEqual(cursorStops({ ...layout, devicesOpen: true, devices: 0 }).slice(5, 7), ["device", "speaker"])
    assert.deepEqual(cursorStops({ ...layout, connected: false, statusActions: 2 }), ["status:0", "status:1"])
  })

  it("parses stops", () => {
    assert.deepEqual(parseStop("pl:3"), { type: "pl", index: 3 })
    assert.deepEqual(parseStop("volume"), { type: "volume", index: -1 })
    assert.deepEqual(parseStop("bogus"), { type: "", index: -1 })
  })

  it("keeps the cursor near where it was", () => {
    const stops = cursorStops(layout)
    assert.equal(clampStop(stops, "pl:9"), "pl:1")
    assert.equal(clampStop(stops, "dev:1"), "device")
    assert.equal(clampStop(stops, "status:0"), "transport:0")
  })

  it("steps within a kind and sideways along rows", () => {
    const stops = cursorStops(layout)
    assert.equal(stepStop(stops, "device", 1), "pl:0")
    assert.equal(stepStop(stops, "pl:1", 1), "pl:1")
    assert.equal(stepStop(stops, "pl:0", -1, "pl"), "pl:0")
    assert.equal(stepStop(stops, "volume", 1, "pl"), "pl:0")
    assert.equal(sideStop(stops, "transport:1", 1), "transport:2")
    assert.equal(sideStop(stops, "transport:3", 1), "transport:3")
    assert.equal(sideStop(stops, "pl:0", 1), "pl:0")
  })
})

describe("library", () => {
  const playlists: Playlist[] = [
    { id: "a", name: "Focus", uri: "spotify:playlist:a", owner: "Me", tracks: 3 },
    { id: "b", name: "Run", uri: "spotify:playlist:b", owner: "", tracks: 0 },
  ]

  it("puts liked songs first when shown", () => {
    assert.deepEqual(libraryRows(playlists, true, "Liked").map((row) => row.target), [LIKED, "spotify:playlist:a", "spotify:playlist:b"])
    assert.equal(libraryRows(playlists, false, "Liked").length, 2)
  })

  it("resolves what to play", () => {
    assert.equal(findPlaylist(playlists, "focus")?.id, "a")
    assert.deepEqual(playTarget("spotify:album:z", playlists), { kind: "uri", uri: "spotify:album:z" })
    assert.deepEqual(playTarget("RUN", playlists), { kind: "uri", uri: "spotify:playlist:b" })
    assert.deepEqual(playTarget("Unknown", playlists), { kind: "name", name: "Unknown" })
  })

})

describe("optimistic state", () => {
  const playback = { ...emptyPlayback(), playing: false, shuffle: false, durationMs: 100000, progressMs: 10000 }

  it("wins until it expires", () => {
    const override = withOverride(null, { playing: true }, 1000)
    assert.equal(liveState(playback, override, 2000).playing, true)
    assert.equal(liveState(playback, override, 1000 + 3500).playing, false)
    assert.equal(liveState(playback, null, 0).volume, -1)
  })

  it("merges fresh overrides and drops stale ones", () => {
    const first = withOverride(null, { volume: 30 }, 0)
    assert.deepEqual(withOverride(first, { shuffle: true }, 100), { until: 3600, volume: 30, shuffle: true })
    assert.deepEqual(withOverride(first, { shuffle: true }, 9999), { until: 13499, shuffle: true })
  })

  it("nudges the volume within bounds", () => {
    assert.equal(nudgedVolume(-1, 5), 55)
    assert.equal(nudgedVolume(98, 5), 100)
    assert.equal(nudgedVolume(2, -5), 0)
  })

  it("moves time forward only while playing", () => {
    assert.equal(progressAt(playback, true, 0, 5000), 15000)
    assert.equal(progressAt(playback, false, 0, 5000), 10000)
    assert.equal(progressAt(playback, true, 0, 1e9), 100000)
    assert.equal(formatTime(187000), "3:07")
    assert.equal(formatTime(3723000), "1:02:03")
  })

  it("polls right after the track ends", () => {
    assert.equal(nextPollMs(playback, false, 0, 15000), 15000)
    assert.equal(nextPollMs(playback, true, 95000, 15000), 5800)
    assert.equal(nextPollMs(playback, true, 100000, 15000), 1000)
  })
})

describe("bar text", () => {
  it("joins and shortens", () => {
    assert.equal(trackLine("Song", "Band"), "Song — Band")
    assert.equal(trackLine("Song", ""), "Song")
    assert.equal(shorten("Hello world", 20), "Hello world")
    assert.equal(shorten("Hello world", 7), "Hello…")
  })
})
