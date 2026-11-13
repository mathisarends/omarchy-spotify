import QtQuick
import "../lib/spotify.js" as Spotify

// Turns key presses into panel actions through the configurable keymap
// (src/keymap.ts). Escape closes and Tab moves to the next panel, as in every
// Omarchy panel.
//
// While searching, the search line has the keyboard. It forwards every key
// here first: arrows, Enter, Escape and Tab are taken, the rest is typed.
Item {
  id: keys

  property var keymap: Spotify.parseKeymap(null)
  property bool searching: false
  property string query: ""

  signal actionRequested(string action)
  signal favoriteRequested(int index)
  signal closeRequested()
  signal tabRequested(int direction)
  // Leave the search line; `clear` also forgets what was typed.
  signal searchEndRequested(bool clear)

  // In a right-to-left layout, the key for "right" walks backwards.
  function mirrored(action) {
    if (!LayoutMirroring.enabled) {
      return action
    }
    if (action === "left") {
      return "right"
    }
    if (action === "right") {
      return "left"
    }
    return action
  }

  function searchKey(event) {
    switch (event.key) {
    case Qt.Key_Escape:
      keys.searchEndRequested(true)
      return true
    case Qt.Key_Tab:
    case Qt.Key_Backtab:
      keys.searchEndRequested(false)
      return true
    case Qt.Key_Down:
    case Qt.Key_PageDown:
      keys.actionRequested("down")
      return true
    case Qt.Key_Up:
    case Qt.Key_PageUp:
      keys.actionRequested("up")
      return true
    case Qt.Key_Return:
    case Qt.Key_Enter:
      keys.actionRequested("activate")
      return true
    case Qt.Key_Backspace:
      if (keys.query === "") {
        keys.searchEndRequested(true)
        return true
      }
      return false
    default:
      return false
    }
  }

  focus: true
  Keys.priority: Keys.BeforeItem
  Keys.onPressed: function(event) {
    if (keys.searching) {
      // Keys the search line passes on come back here a second time; only
      // the first pass, from the search line, may act on them.
      if (keys.searchKey(event)) {
        event.accepted = true
      }
      return
    }
    if (event.key === Qt.Key_Escape) {
      keys.closeRequested()
      event.accepted = true
      return
    }
    if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
      const back = event.key === Qt.Key_Backtab || (event.modifiers & Qt.ShiftModifier) !== 0
      keys.tabRequested(back ? -1 : 1)
      event.accepted = true
      return
    }

    const result = Spotify.lookupKey(keys.keymap, Spotify.keyOfEvent(event.key, event.text, event.modifiers))
    if (result.type === "action") {
      keys.actionRequested(keys.mirrored(result.action))
      event.accepted = true
    } else if (result.type === "favorite") {
      keys.favoriteRequested(result.index)
      event.accepted = true
    }
  }
}
