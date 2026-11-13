import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { FAVORITES_TEMPLATE, LIKED, favoriteFor, findFavorite, parseFavorites, toggleFavorite } from "../src/favorites.ts"
import { uriFromReference } from "../src/input.ts"

describe("parseFavorites", () => {
  it("reads URIs, links, names and liked", () => {
    const favorites = parseFavorites([
      "# comment",
      "Focus = spotify:playlist:37i9dQZF1DWZeKCadgRdKQ",
      "Run = https://open.spotify.com/intl-de/playlist/37i9dQZF1DX76Wlfdnj7AP?si=abc --shuffle",
      "Liked = Liked",
      "Trip = Road Trip",
      "Broken = https://example.com/x",
      "= nothing",
      "no equals sign",
    ].join("\n"))
    assert.deepEqual(favorites.map((f) => [f.label, f.target, f.shuffle, f.line]), [
      ["Focus", "spotify:playlist:37i9dQZF1DWZeKCadgRdKQ", false, 2],
      ["Run", "spotify:playlist:37i9dQZF1DX76Wlfdnj7AP", true, 3],
      ["Liked", LIKED, false, 4],
      ["Trip", "Road Trip", false, 5],
    ])
  })

  it("parses the template", () => {
    assert.deepEqual(parseFavorites(FAVORITES_TEMPLATE).map((f) => f.target), [LIKED])
  })

  it("finds by label and by target", () => {
    const favorites = parseFavorites("Focus = spotify:album:abc\n")
    assert.equal(findFavorite(favorites, " focus ")?.target, "spotify:album:abc")
    assert.equal(favoriteFor(favorites, "spotify:album:abc")?.label, "Focus")
    assert.equal(findFavorite(favorites, "nope"), null)
  })
})

describe("toggleFavorite", () => {
  it("adds a line, cleaning the label", () => {
    assert.equal(toggleFavorite("# mine\n", "A = B # C", "spotify:playlist:x"), "# mine\nA B C = spotify:playlist:x\n")
  })

  it("removes every line playing the target and keeps the rest", () => {
    const text = "# keep\nOne = spotify:playlist:x\nTwo = spotify:album:y\nThree = spotify:playlist:x --shuffle\n"
    assert.equal(toggleFavorite(text, "whatever", "spotify:playlist:x"), "# keep\nTwo = spotify:album:y\n")
  })

  it("starts an empty file", () => {
    assert.equal(toggleFavorite("", "", LIKED), "Playlist = liked\n")
  })
})

describe("uriFromReference", () => {
  it("accepts URIs and links", () => {
    assert.equal(uriFromReference("spotify:track:abc"), "spotify:track:abc")
    assert.equal(uriFromReference("https://open.spotify.com/album/xyz?si=1"), "spotify:album:xyz")
  })

  it("rejects everything else", () => {
    assert.equal(uriFromReference("spotify:user:x:collection"), "")
    assert.equal(uriFromReference("https://open.spotify.com.evil.com/album/x"), "")
    assert.equal(uriFromReference("http://open.spotify.com/album/x"), "")
  })
})
