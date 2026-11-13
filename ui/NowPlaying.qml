import QtQuick
import qs.Commons
import qs.Ui
import "../lib/spotify.js" as Spotify

// Top of the panel: what is playing and by whom. Text only, on purpose: no
// cover art, nothing to look at for longer than a glance.
PanelHero {
  id: hero

  required property var widget
  readonly property var client: widget.client
  readonly property var playback: client.playback

  function heading() {
    if (client.connected && client.hasTrack) {
      return playback.title
    }
    return widget.t("title")
  }

  function describe() {
    if (client.status === "loading") {
      return widget.t("meta.loading")
    }
    if (!client.connected) {
      return widget.statusTitle
    }
    if (!client.hasTrack) {
      return widget.t("meta.nothing")
    }
    return playback.artist
  }

  title: heading()
  meta: describe()
  detail: client.connected && client.hasTrack && !client.live.playing ? widget.t("meta.paused") : ""
  foreground: widget.fg
  fontFamily: widget.fontFamily
  iconOpacity: client.connected && client.live.playing ? 1 : 0.5

  iconComponent: Component {
    SpotifyText {
      widget: hero.widget
      text: Spotify.Glyph.spotify
      font.pixelSize: Style.font.display
    }
  }
}
