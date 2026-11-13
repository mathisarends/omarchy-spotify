// lib/spotify.js is what QML actually loads. Run it the way QML does, as one
// script, and check it exposes every export of src/ under the same name.

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { createContext, runInContext } from "node:vm"

import * as commands from "../src/commands.ts"
import * as cursor from "../src/cursor.ts"
import * as filter from "../src/filter.ts"
import * as glyphs from "../src/glyphs.ts"
import * as input from "../src/input.ts"
import * as keymap from "../src/keymap.ts"
import * as library from "../src/library.ts"
import * as overrides from "../src/overrides.ts"
import * as spoti from "../src/spoti.ts"
import * as text from "../src/text.ts"

const modules = { commands, cursor, filter, glyphs, input, keymap, library, overrides, spoti, text }

function loadLibrary(): Record<string, unknown> {
  const source = readFileSync(new URL("../lib/spotify.js", import.meta.url), "utf8")
  assert.match(source, /^\.pragma library\n/)
  const context = createContext({})
  runInContext(source.replace(/^\.pragma library\n/, ""), context)
  return context
}

describe("lib/spotify.js", () => {
  const lib = loadLibrary()

  for (const [name, module] of Object.entries(modules)) {
    it(`exposes everything ${name}.ts exports`, () => {
      for (const [key, value] of Object.entries(module)) {
        assert.equal(typeof lib[key], typeof value, `${name}.ts: ${key}`)
      }
    })
  }

  it("runs", () => {
    const filterByName = lib.filterByName as typeof filter.filterByName
    assert.equal(filterByName([{ name: "Café" }], "cafe").length, 1)
  })

  it("spells every glyph as one code point", () => {
    for (const [name, glyph] of Object.entries(lib.Glyph as Record<string, string>)) {
      assert.equal([...glyph].length, 1, name)
    }
  })
})
