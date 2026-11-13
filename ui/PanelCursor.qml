import QtQuick
import "../lib/spotify.js" as Spotify

// The panel's cursor, shared by keyboard and mouse. `current` is one of the
// stop ids described in src/cursor.ts.
QtObject {
  id: cursor

  property var stops: []
  property string current: ""
  // Off until the keyboard is used or the mouse hovers something, so the
  // panel opens without a highlighted row.
  property bool active: false

  /** True when the cursor sits on this stop and should be drawn. */
  function at(id) {
    return active && current === id
  }

  function hover(id) {
    active = true
    current = id
  }

  function moveTo(id) {
    current = id
  }

  /** One stop down or up; `within` keeps it to one kind of stop, such as "pl". */
  function step(delta, within) {
    current = Spotify.stepStop(stops, current, delta, within || "")
  }

  function side(delta) {
    current = Spotify.sideStop(stops, current, delta)
  }

  function reset(id) {
    active = false
    current = stops.includes(id) ? id : (stops[0] || "")
  }

  onStopsChanged: current = Spotify.clampStop(stops, current)
}
