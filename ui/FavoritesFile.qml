import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/spotify.js" as Spotify

// The user's favorites file. Watched, so saving it updates the panel.
Item {
  id: favorites
  visible: false

  required property string path
  property var entries: []
  property bool exists: false
  readonly property var targets: Spotify.favoriteTargets(entries)

  signal editorOpened()

  // Creates the file from the starter template unless it exists. The path
  // and the template travel as $1 and $2 and are never parsed by the shell.
  readonly property string createScript: 'mkdir -p "$(dirname "$1")" && { [ -e "$1" ] || printf "%s" "$2" > "$1"; }'
  // Replaces the file in one step, so the watcher never sees half of it.
  readonly property string writeScript: 'mkdir -p "$(dirname "$1")" && printf "%s" "$2" > "$1.tmp" && mv -f "$1.tmp" "$1"'

  function reload() {
    file.reload()
  }

  function find(label) {
    return Spotify.findFavorite(entries, label)
  }

  function has(target) {
    return targets[target] === true
  }

  /** Opens the file in the user's editor, creating it first if needed. */
  function edit() {
    opener.command = ["sh", "-c", createScript, "sh", path, Spotify.FAVORITES_TEMPLATE]
    opener.running = true
  }

  /** Adds a playlist to the file, or removes it when it is there. */
  function toggle(name, target) {
    if (!target || writer.running) {
      return
    }
    const current = exists ? file.text() : Spotify.FAVORITES_TEMPLATE
    writer.command = ["sh", "-c", writeScript, "sh", path, Spotify.toggleFavorite(current, name, target)]
    writer.running = true
  }

  FileView {
    id: file
    path: favorites.path
    watchChanges: true
    printErrors: false
    onFileChanged: file.reload()
    onLoaded: {
      favorites.exists = true
      favorites.entries = Spotify.parseFavorites(file.text())
    }
    onLoadFailed: {
      favorites.exists = false
      favorites.entries = []
    }
  }

  Process {
    id: opener
    onExited: function(code) {
      file.reload()
      if (code === 0) {
        Quickshell.execDetached(["omarchy-launch-editor", favorites.path])
        favorites.editorOpened()
      }
    }
  }

  Process {
    id: writer
    onExited: file.reload()
  }
}
