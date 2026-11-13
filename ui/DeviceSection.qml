import QtQuick
import qs.Commons
import qs.Ui
import "../lib/spotify.js" as Spotify

// Where the music plays. One row names the device; open it to move
// playback to another one.
Column {
  id: section

  required property var widget
  readonly property var client: widget.client
  readonly property var current: client.playback.device
  readonly property bool open: widget.devicesOpen

  width: parent ? parent.width : 0
  spacing: Style.space(4)

  function deviceDetail(device) {
    const parts = [device.type]
    if (device.active) {
      parts.push(widget.t("devices.active"))
    }
    if (device.restricted) {
      parts.push(widget.t("devices.restricted"))
    }
    return parts.filter((part) => part !== "").join(" · ")
  }

  PanelSeparator {
    foreground: section.widget.fg
  }

  CursorSurface {
    id: header

    width: parent.width
    implicitHeight: headerLabels.implicitHeight + Style.spacing.sm * 2
    hasCursor: section.widget.cursor.at("device")
    current: section.open
    foreground: section.widget.fg

    onHasCursorChanged: {
      if (hasCursor) {
        section.widget.reveal(header)
      }
    }

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onContainsMouseChanged: {
        if (containsMouse) {
          section.widget.cursor.hover("device")
        }
      }
      onClicked: section.widget.toggleDevices()
    }

    SpotifyText {
      id: headerIcon
      widget: section.widget
      text: section.current ? Spotify.deviceGlyph(section.current.type) : Spotify.Glyph.speaker
      opacity: section.current ? 1 : 0.45
      font.pixelSize: Style.font.title
      width: Style.space(24)
      horizontalAlignment: Text.AlignHCenter
      anchors.left: parent.left
      anchors.leftMargin: Style.space(6)
      anchors.verticalCenter: parent.verticalCenter
    }

    Column {
      id: headerLabels
      spacing: Style.space(1)
      anchors.left: headerIcon.right
      anchors.leftMargin: Style.space(10)
      anchors.right: chevron.left
      anchors.rightMargin: Style.space(6)
      anchors.verticalCenter: parent.verticalCenter

      SpotifyText {
        widget: section.widget
        text: section.current ? section.current.name : section.widget.t("devices.none")
        elide: Text.ElideRight
        width: parent.width
      }

      SpotifyText {
        widget: section.widget
        text: section.current ? section.widget.t("devices.playingOn") : section.widget.t("devices.pick")
        dim: true
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
        width: parent.width
      }
    }

    SpotifyText {
      id: chevron
      widget: section.widget
      text: section.open ? Spotify.Glyph.chevronDown : Spotify.Glyph.chevronRight
      dim: true
      anchors.right: parent.right
      anchors.rightMargin: Style.space(10)
      anchors.verticalCenter: parent.verticalCenter
    }
  }

  Column {
    id: list

    visible: section.open
    width: parent.width
    leftPadding: Style.space(12)
    spacing: Style.space(2)

    readonly property real innerWidth: width - leftPadding

    Repeater {
      model: section.open ? section.client.devices : []

      CursorSurface {
        id: deviceRow

        required property var modelData
        required property int index
        readonly property string stopId: "dev:" + index

        width: list.innerWidth
        implicitHeight: deviceLabels.implicitHeight + Style.spacing.sm * 2
        hasCursor: section.widget.cursor.at(stopId)
        current: modelData.active
        foreground: section.widget.fg

        onHasCursorChanged: {
          if (hasCursor) {
            section.widget.reveal(deviceRow)
          }
        }

        MouseArea {
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onContainsMouseChanged: {
            if (containsMouse) {
              section.widget.cursor.hover(deviceRow.stopId)
            }
          }
          onClicked: {
            section.client.transfer(deviceRow.modelData)
            section.widget.devicesOpen = false
          }
        }

        SpotifyText {
          id: deviceIcon
          widget: section.widget
          text: Spotify.deviceGlyph(deviceRow.modelData.type)
          width: Style.space(24)
          horizontalAlignment: Text.AlignHCenter
          anchors.left: parent.left
          anchors.leftMargin: Style.space(6)
          anchors.verticalCenter: parent.verticalCenter
        }

        Column {
          id: deviceLabels
          spacing: Style.space(1)
          anchors.left: deviceIcon.right
          anchors.leftMargin: Style.space(10)
          anchors.right: parent.right
          anchors.rightMargin: Style.space(8)
          anchors.verticalCenter: parent.verticalCenter

          SpotifyText {
            widget: section.widget
            text: deviceRow.modelData.name
            font.bold: deviceRow.modelData.active
            elide: Text.ElideRight
            width: parent.width
          }

          SpotifyText {
            widget: section.widget
            visible: text !== ""
            text: section.deviceDetail(deviceRow.modelData)
            dim: true
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
            width: parent.width
          }
        }
      }
    }

    // Nothing online: Spotify Connect needs something to play on.
    CursorSurface {
      id: speakerHint

      visible: section.client.devices.length === 0
      width: list.innerWidth
      implicitHeight: speakerText.implicitHeight + Style.spacing.xl
      hasCursor: section.widget.cursor.at("speaker")
      foreground: section.widget.fg

      onHasCursorChanged: {
        if (hasCursor) {
          section.widget.reveal(speakerHint)
        }
      }

      SpotifyText {
        id: speakerText
        widget: section.widget
        text: section.client.devicesLoaded ? section.widget.t("devices.empty") : section.widget.t("devices.loading")
        dim: true
        wrapMode: Text.Wrap
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: Style.space(8)
        anchors.rightMargin: Style.space(8)
        anchors.verticalCenter: parent.verticalCenter
      }

      MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onContainsMouseChanged: {
          if (containsMouse) {
            section.widget.cursor.hover("speaker")
          }
        }
        onClicked: section.widget.setUpSpeaker()
      }
    }
  }
}
