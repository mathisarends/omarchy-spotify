import QtQuick
import QtQuick.Controls
import qs.Commons
import "../lib/spotify.js" as Spotify

// Everything inside the panel. Keys move the shared cursor; each section
// draws one part of what Spotify reported.
SpotifyKeys {
  id: content

  required property var widget
  readonly property var client: widget.client
  readonly property var cursor: widget.cursor

  keymap: widget.keymap
  searching: widget.searching
  query: widget.query
  implicitHeight: column.implicitHeight
  anchors.fill: parent

  onActionRequested: function(action) {
    content.perform(action)
  }
  onFavoriteRequested: function(index) {
    content.widget.runFavorite(index)
  }
  onCloseRequested: content.widget.close()
  onTabRequested: function(direction) {
    content.widget.switchPanel(direction)
  }
  onSearchEndRequested: function(clear) {
    content.endSearch(clear)
  }

  // ---- Actions ----

  function perform(action) {
    switch (action) {
    case "down":
      move(() => cursor.step(1, widget.searching ? "pl" : ""))
      break
    case "up":
      move(() => cursor.step(-1, widget.searching ? "pl" : ""))
      break
    case "first":
      move(() => cursor.moveTo(cursor.stops[0] || ""))
      break
    case "last":
      move(() => cursor.moveTo(cursor.stops[cursor.stops.length - 1] || ""))
      break
    case "left":
      sideways(-1)
      break
    case "right":
      sideways(1)
      break
    case "activate":
      activateAtCursor()
      break
    case "playPause":
      client.playPause()
      break
    case "next":
      client.skip(true)
      break
    case "previous":
      client.skip(false)
      break
    case "volumeUp":
      client.nudgeVolume(widget.step)
      break
    case "volumeDown":
      client.nudgeVolume(-widget.step)
      break
    case "shuffle":
      client.toggleShuffle()
      break
    case "search":
      startSearch()
      break
    case "toggleFavorite":
      toggleFavoriteAtCursor()
      break
    case "devices":
      widget.toggleDevices()
      cursor.active = true
      cursor.moveTo("device")
      break
    case "refresh":
      client.refreshAll(true)
      break
    case "editFavorites":
      widget.editFavorites()
      break
    case "close":
      widget.close()
      break
    }
  }

  // The panel opens without a highlighted row: the first key press only
  // shows the cursor, the next ones move it.
  function move(change) {
    if (!cursor.active) {
      cursor.active = true
      return
    }
    change()
  }

  // On the volume slider sideways is louder and quieter; on a row of
  // buttons it walks along them.
  function sideways(direction) {
    if (cursor.active && cursor.current === "volume") {
      client.nudgeVolume(direction * widget.step)
      return
    }
    move(() => cursor.side(direction))
  }

  function activateAtCursor() {
    // While searching, Enter plays the best match even before the cursor moved.
    if (widget.searching && Spotify.parseStop(cursor.current).type !== "pl") {
      widget.playRow(widget.visibleRows[0])
      return
    }
    move(() => activate(cursor.current))
  }

  function activate(id) {
    const stop = Spotify.parseStop(id)
    switch (stop.type) {
    case "status":
      widget.runSetupAction(stop.index)
      break
    case "transport":
      widget.runTransport(stop.index)
      break
    case "volume":
      client.toggleMute()
      break
    case "device":
      widget.toggleDevices()
      break
    case "dev":
      client.transfer(client.devices[stop.index])
      widget.devicesOpen = false
      cursor.moveTo("device")
      break
    case "speaker":
      widget.setUpSpeaker()
      break
    case "fav":
      widget.runFavorite(stop.index)
      break
    case "favedit":
      widget.editFavorites()
      break
    case "pl":
      widget.playRow(widget.visibleRows[stop.index])
      break
    }
  }

  function toggleFavoriteAtCursor() {
    const stop = Spotify.parseStop(cursor.current)
    if (stop.type === "pl") {
      widget.toggleFavoriteRow(widget.visibleRows[stop.index])
    } else if (stop.type === "fav") {
      const favorite = widget.favorites.entries[stop.index]
      if (favorite) {
        widget.favorites.toggle(favorite.label, favorite.target)
      }
    }
  }

  // ---- Search ----

  function startSearch() {
    if (!client.connected) {
      return
    }
    widget.searching = true
    cursor.active = true
    cursor.moveTo("pl:0")
    playlists.focusSearch()
  }

  function endSearch(clear) {
    if (clear) {
      widget.query = ""
    }
    widget.searching = false
    content.forceActiveFocus()
  }

  Connections {
    target: content.widget
    function onQueryChanged() {
      // The best match moves to the top; keep the cursor there while typing.
      if (content.widget.searching) {
        Qt.callLater(() => content.cursor.moveTo("pl:0"))
      }
    }
  }

  /** Scrolls just far enough to show the item under the cursor. */
  function reveal(item) {
    const flick = scrollArea.contentItem
    if (!item || !flick || flick.contentY === undefined) {
      return
    }
    const margin = Style.space(6)
    const top = item.mapToItem(flick.contentItem || flick, 0, 0).y
    const bottom = top + item.height
    if (top < flick.contentY + margin) {
      flick.contentY = Math.max(0, top - margin)
    } else if (bottom > flick.contentY + flick.height - margin) {
      flick.contentY = bottom + margin - flick.height
    }
  }

  readonly property string hint: Spotify.keyHints(widget.keymap)
    .map((hint) => hint.keys + " " + widget.t(hint.label))
    .join("   ·   ")

  // ---- Layout ----

  ScrollView {
    id: scrollArea
    anchors.fill: parent
    clip: true
    ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
    ScrollBar.vertical.policy: column.implicitHeight > height ? ScrollBar.AsNeeded : ScrollBar.AlwaysOff

    Column {
      id: column
      width: scrollArea.availableWidth
      spacing: Style.space(14)

      NowPlaying {
        widget: content.widget
      }

      SpotifyText {
        widget: content.widget
        visible: text !== ""
        text: content.client.lastError
        color: content.widget.urgent
        font.pixelSize: Style.font.caption
        wrapMode: Text.Wrap
        width: parent.width
      }

      SetupCard {
        widget: content.widget
        visible: !content.client.connected && content.client.status !== "loading"
      }

      Transport {
        widget: content.widget
        visible: content.client.connected
      }

      DeviceSection {
        widget: content.widget
        visible: content.client.connected
      }

      FavoritesSection {
        widget: content.widget
        visible: content.client.connected
      }

      PlaylistSection {
        id: playlists
        widget: content.widget
        keyHandler: content
        visible: content.client.connected
      }

      SpotifyText {
        widget: content.widget
        visible: content.client.connected && content.widget.showHints && text !== ""
        text: content.hint
        dim: true
        opacity: 0.8
        font.pixelSize: Style.font.caption
        wrapMode: Text.Wrap
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
      }

      Item {
        width: parent.width
        height: Style.space(2)
      }
    }
  }

  // Only scroll by dragging when there is something to scroll to.
  Binding {
    target: scrollArea.contentItem
    property: "interactive"
    value: column.implicitHeight > scrollArea.height
  }
}
