import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  enqueue, likedArgs, playArgs, playlistPageArgs, resumeArgs, shuffleArgs, skipArgs, transferArgs, volumeArgs,
} from "../src/commands.ts"

describe("playArgs", () => {
  it("plays a URI, keeping it out of flag parsing", () => {
    assert.deepEqual(playArgs({ kind: "uri", uri: "spotify:playlist:x" }, "", false), ["play", "--json", "--", "spotify:playlist:x"])
  })

  it("adds the device and shuffle", () => {
    assert.deepEqual(
      playArgs({ kind: "uris", uris: ["spotify:track:a", "spotify:track:b"] }, "Kitchen", true),
      ["play", "--device", "Kitchen", "--shuffle", "--json", "--", "spotify:track:a", "spotify:track:b"],
    )
  })

  it("looks up a playlist by name", () => {
    assert.deepEqual(playArgs({ kind: "name", name: "--evil" }, "", false), ["play", "--type", "playlist", "--json", "--", "--evil"])
  })
})

describe("simple commands", () => {
  it("builds them", () => {
    assert.deepEqual(resumeArgs(""), ["play", "--json"])
    assert.deepEqual(resumeArgs("Desk"), ["play", "--device", "Desk", "--json"])
    assert.deepEqual(skipArgs(true), ["next", "--json"])
    assert.deepEqual(skipArgs(false), ["prev", "--json"])
    assert.deepEqual(shuffleArgs(true), ["shuffle", "on", "--json"])
    assert.deepEqual(likedArgs(), ["library", "list", "tracks", "--limit", "50", "--json"])
    assert.deepEqual(playlistPageArgs(50, 50), ["playlist", "list", "--limit", "50", "--offset", "50", "--json"])
  })

  it("clamps the volume", () => {
    assert.deepEqual(volumeArgs(130), ["volume", "100", "--json"])
    assert.deepEqual(volumeArgs(-4), ["volume", "0", "--json"])
    assert.deepEqual(volumeArgs(33.6), ["volume", "34", "--json"])
  })

  it("transfers with or without playing", () => {
    assert.deepEqual(transferArgs("abc", true), ["device", "transfer", "--json", "--", "abc"])
    assert.deepEqual(transferArgs("abc", false), ["device", "transfer", "--no-play", "--json", "--", "abc"])
  })
})

describe("enqueue", () => {
  it("replaces a waiting command with the same key", () => {
    let queue = enqueue([], { key: "volume", args: ["volume", "10"] })
    queue = enqueue(queue, { key: "skip", args: ["next"] })
    queue = enqueue(queue, { key: "volume", args: ["volume", "20"] })
    assert.deepEqual(queue.map((command) => command.args[1] ?? command.args[0]), ["20", "next"])
  })

  it("keeps commands without a key", () => {
    const queue = enqueue(enqueue([], { key: "", args: ["next"] }), { key: "", args: ["next"] })
    assert.equal(queue.length, 2)
  })
})
