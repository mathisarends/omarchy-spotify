import QtQuick
import qs.Commons
import qs.Ui
import "../lib/spotify.js" as Spotify

// Previous, play/pause, next and shuffle, the time, and the volume.
Column {
  id: transport

  required property var widget
  readonly property var client: widget.client
  readonly property var live: client.live

  width: parent ? parent.width : 0
  spacing: Style.space(10)

  // Moves the time forward between reads while the panel is open.
  property real clock: Date.now()

  Timer {
    interval: 1000
    repeat: true
    running: transport.visible && transport.widget.opened && transport.live.playing
    onTriggered: transport.clock = Date.now()
  }

  function timeText() {
    const playback = client.playback
    if (!client.hasTrack || playback.durationMs === 0) {
      return ""
    }
    const progress = Spotify.progressAt(playback, live.playing, client.reportedAt, Math.max(clock, client.reportedAt))
    return Spotify.formatTime(progress) + " / " + Spotify.formatTime(playback.durationMs)
  }

  readonly property var buttons: [
    { glyph: Spotify.Glyph.previous, tip: "transport.previous", on: false },
    { glyph: live.playing ? Spotify.Glyph.pause : Spotify.Glyph.play, tip: live.playing ? "transport.pause" : "transport.play", on: false },
    { glyph: Spotify.Glyph.next, tip: "transport.next", on: false },
    { glyph: live.shuffle ? Spotify.Glyph.shuffle : Spotify.Glyph.shuffleOff, tip: "transport.shuffle", on: live.shuffle },
  ]

  PanelSeparator {
    foreground: transport.widget.fg
  }

  Item {
    width: parent.width
    implicitHeight: buttonRow.implicitHeight

    Row {
      id: buttonRow
      spacing: Style.spacing.xs
      anchors.left: parent.left

      Repeater {
        model: transport.buttons

        Button {
          id: control

          required property var modelData
          required property int index
          readonly property string stopId: "transport:" + index

          iconText: modelData.glyph
          iconSize: Style.font.title
          tooltipText: transport.widget.t(modelData.tip)
          bordered: true
          active: modelData.on
          foreground: transport.widget.fg
          fontFamily: transport.widget.fontFamily
          hasCursor: transport.widget.cursor.at(stopId)
          onClicked: transport.widget.runTransport(index)
          onHovered: function(isHovered) {
            if (isHovered) {
              transport.widget.cursor.hover(control.stopId)
            }
          }
        }
      }
    }

    SpotifyText {
      widget: transport.widget
      text: transport.timeText()
      dim: true
      font.pixelSize: Style.font.caption
      font.bold: true
      anchors.right: parent.right
      anchors.rightMargin: Style.space(6)
      anchors.verticalCenter: parent.verticalCenter
    }
  }

  Item {
    width: parent.width
    implicitHeight: volumeSurface.height

    SpotifyText {
      id: volumeIcon
      widget: transport.widget
      text: Spotify.volumeGlyph(transport.live.volume)
      font.pixelSize: Style.font.title
      width: Style.space(24)
      horizontalAlignment: Text.AlignHCenter
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter

      MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: transport.client.toggleMute()
      }
    }

    CursorSurface {
      id: volumeSurface

      height: slider.implicitHeight + Style.spacing.controlGap
      anchors.left: volumeIcon.right
      anchors.leftMargin: Style.space(6)
      anchors.right: percent.left
      anchors.rightMargin: Style.space(8)
      hasCursor: transport.widget.cursor.at("volume")
      foreground: transport.widget.fg
      outline: true
      opacity: transport.live.volume < 0 ? 0.45 : 1

      onHasCursorChanged: {
        if (hasCursor) {
          transport.widget.reveal(volumeSurface)
        }
      }

      PanelSlider {
        id: slider

        bar: transport.widget.bar
        anchors.fill: parent
        anchors.leftMargin: Style.space(6)
        anchors.rightMargin: Style.space(6)
        minimum: 0
        maximum: 100
        step: 1
        integer: true
        value: Math.max(0, transport.live.volume)

        onMoved: function(value) {
          transport.client.setVolume(value)
        }
        onReleased: function(value) {
          transport.client.setVolume(value)
        }
        onRightClicked: transport.client.toggleMute()
      }

      HoverHandler {
        onHoveredChanged: {
          if (hovered) {
            transport.widget.cursor.hover("volume")
          }
        }
      }
    }

    SpotifyText {
      id: percent
      widget: transport.widget
      text: slider.dragging
        ? transport.widget.number(Math.round(slider.liveValue)) + "%"
        : (transport.live.volume >= 0 ? transport.widget.number(transport.live.volume) + "%" : "")
      dim: true
      font.pixelSize: Style.font.caption
      font.bold: true
      width: Style.space(36)
      horizontalAlignment: Text.AlignRight
      anchors.right: parent.right
      anchors.rightMargin: Style.space(6)
      anchors.verticalCenter: parent.verticalCenter
    }
  }
}
