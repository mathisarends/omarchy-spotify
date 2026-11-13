import QtQuick
import qs.Commons
import qs.Ui
import "../lib/spotify.js" as Spotify

// The user's playlists (and liked songs), filtered by a search line that
// opens with /. Enter plays the row under the cursor.
Column {
  id: section

  required property var widget
  property Item keyHandler: null
  readonly property var client: widget.client
  readonly property var rows: widget.visibleRows

  width: parent ? parent.width : 0
  spacing: Style.space(8)

  function focusSearch() {
    filterInput.forceActiveFocus()
  }

  function detail(row) {
    if (row.liked) {
      return section.widget.t("library.likedDetail")
    }
    const parts = []
    if (row.tracks >= 0) {
      parts.push(section.widget.tn("library.tracks", row.tracks))
    }
    if (row.owner) {
      parts.push(row.owner)
    }
    return parts.join(" · ")
  }

  PanelSeparator {
    foreground: section.widget.fg
  }

  Item {
    width: parent.width
    implicitHeight: header.implicitHeight

    PanelSectionHeader {
      id: header
      text: section.widget.t("section.playlists")
      foreground: section.widget.fg
      fontFamily: section.widget.fontFamily
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
    }

    SpotifyText {
      widget: section.widget
      visible: section.client.playlistsLoaded
      text: section.widget.query !== ""
        ? section.widget.number(section.rows.length) + " / " + section.widget.number(section.widget.libraryRows.length)
        : section.widget.number(section.widget.libraryRows.length)
      dim: true
      font.pixelSize: Style.font.caption
      anchors.right: parent.right
      anchors.rightMargin: Style.space(6)
      anchors.verticalCenter: parent.verticalCenter
    }
  }

  // The search line. Clicking it starts searching, like /.
  CursorSurface {
    id: searchRow

    width: parent.width
    implicitHeight: Math.max(searchIcon.implicitHeight, filterInput.implicitHeight) + Style.spacing.sm * 2
    outline: true
    current: section.widget.searching
    foreground: section.widget.fg

    SpotifyText {
      id: searchIcon
      widget: section.widget
      text: Spotify.Glyph.search
      dim: !section.widget.searching
      width: Style.space(24)
      horizontalAlignment: Text.AlignHCenter
      anchors.left: parent.left
      anchors.leftMargin: Style.space(6)
      anchors.verticalCenter: parent.verticalCenter
    }

    FilterInput {
      id: filterInput

      keyHandler: section.keyHandler
      focus: false
      color: section.widget.fg
      font.family: section.widget.fontFamily
      font.pixelSize: Style.font.body
      maximumLength: 64
      anchors.left: searchIcon.right
      anchors.leftMargin: Style.space(10)
      anchors.right: parent.right
      anchors.rightMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter

      onTextChanged: {
        if (section.widget.query !== text) {
          section.widget.query = text
        }
      }

      // Cleared or reset from outside (Esc, closing the panel).
      Connections {
        target: section.widget
        function onQueryChanged() {
          if (filterInput.text !== section.widget.query) {
            filterInput.text = section.widget.query
          }
        }
      }
    }

    SpotifyText {
      widget: section.widget
      visible: filterInput.text === ""
      text: section.widget.searching ? section.widget.t("search.typing") : section.widget.t("search.placeholder")
      dim: true
      elide: Text.ElideRight
      anchors.left: filterInput.left
      anchors.right: filterInput.right
      anchors.verticalCenter: parent.verticalCenter
    }

    MouseArea {
      anchors.fill: parent
      cursorShape: Qt.IBeamCursor
      onClicked: section.keyHandler.startSearch()
    }
  }

  SpotifyText {
    widget: section.widget
    visible: text !== ""
    text: !section.client.playlistsLoaded && section.widget.libraryRows.length <= (section.widget.showLiked ? 1 : 0)
      ? section.widget.t("library.loading")
      : (section.rows.length === 0
        ? (section.widget.query !== "" ? section.widget.t("library.noMatch") : section.widget.t("library.empty"))
        : "")
    dim: true
    wrapMode: Text.Wrap
    width: parent.width
    leftPadding: Style.space(8)
  }

  Column {
    width: parent.width
    spacing: Style.space(2)

    Repeater {
      model: section.rows

      CursorSurface {
        id: row

        required property var modelData
        required property int index
        readonly property string stopId: "pl:" + index
        readonly property bool playingHere: section.client.hasTrack && section.client.playback.contextUri !== "" && section.client.playback.contextUri === modelData.target

        width: parent ? parent.width : 0
        implicitHeight: labels.implicitHeight + Style.spacing.sm * 2
        hasCursor: section.widget.cursor.at(stopId)
        current: playingHere
        foreground: section.widget.fg

        onHasCursorChanged: {
          if (hasCursor) {
            section.widget.reveal(row)
          }
        }

        MouseArea {
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onContainsMouseChanged: {
            if (containsMouse) {
              section.widget.cursor.hover(row.stopId)
            }
          }
          onClicked: section.widget.playRow(row.modelData)
        }

        SpotifyText {
          id: rowIcon
          widget: section.widget
          text: row.playingHere && section.client.live.playing
            ? Spotify.Glyph.play
            : (row.modelData.liked ? Spotify.Glyph.heart : Spotify.Glyph.playlist)
          dim: !row.playingHere
          width: Style.space(24)
          horizontalAlignment: Text.AlignHCenter
          anchors.left: parent.left
          anchors.leftMargin: Style.space(6)
          anchors.verticalCenter: parent.verticalCenter
        }

        Column {
          id: labels
          spacing: Style.space(1)
          anchors.left: rowIcon.right
          anchors.leftMargin: Style.space(10)
          anchors.right: parent.right
          anchors.rightMargin: Style.space(8)
          anchors.verticalCenter: parent.verticalCenter

          SpotifyText {
            widget: section.widget
            text: row.modelData.name
            font.bold: row.playingHere
            elide: Text.ElideRight
            width: parent.width
          }

          SpotifyText {
            widget: section.widget
            visible: text !== ""
            text: section.detail(row.modelData)
            dim: true
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
            width: parent.width
          }
        }
      }
    }
  }
}
