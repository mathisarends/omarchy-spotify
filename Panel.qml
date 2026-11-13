import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "lib/spotify.js" as Spotify
import "ui"

// A distraction-free Spotify controller in the Omarchy bar, powered by the
// spoti CLI.
//
// This file wires the parts together: settings, the bar icon and the panel.
//   ui/SpotifyClient.qml  runs spoti and holds what Spotify reported
//   ui/PanelContent.qml   draws the panel and handles its keys
//   src/*.ts              the logic behind both, bundled into lib/spotify.js
Panel {
  id: root

  ipcTarget: "mathisarends.spotify"
  // SpotifyIpc registers the IPC target, and only on the leading instance.
  manageIpc: false

  // ---- Settings (manifest.json describes them) ----

  readonly property string spoti: String(setting("spoti", "spoti") || "").trim() || "spoti"
  readonly property string preferredDevice: String(setting("device", "") || "").trim()
  readonly property int step: Util.clamp(Math.round(Number(setting("step", 5)) || 5), 1, 25)
  readonly property bool showLiked: setting("showLiked", true) !== false
  readonly property bool showTrack: setting("showTrack", false) === true
  readonly property int trackLength: Util.clamp(Math.round(Number(setting("trackLength", 32)) || 32), 8, 80)
  readonly property bool showHints: setting("showHints", true) !== false
  readonly property var keymap: Spotify.parseKeymap(setting("keys", null))
  readonly property string favoritesPath: expandHome(String(setting("favoritesFile", "") || "").trim())
    || configHome + "/omarchy/spotify/favorites.conf"

  readonly property string homeDir: Quickshell.env("HOME") || ""
  readonly property string configHome: Quickshell.env("XDG_CONFIG_HOME") || homeDir + "/.config"

  function expandHome(path) {
    if (path === "~" || path.startsWith("~/")) {
      return homeDir + path.slice(1)
    }
    return path
  }

  // ---- Theme ----

  readonly property color fg: bar ? bar.foreground : Commons.Color.foreground
  readonly property color muted: Qt.darker(fg, 1.4)
  readonly property color urgent: bar ? bar.urgent : Commons.Color.urgent
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  // ---- Text ----

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  function t(key) {
    return strings.t(key)
  }

  function tn(key, count) {
    return strings.tn(key, count)
  }

  function number(value) {
    return Commons.I18n.formatNumber(value)
  }

  // ---- Parts ----

  readonly property var client: spotifyClient
  readonly property var favorites: favoritesFile
  readonly property var cursor: panelCursor

  Leadership {
    id: leadership
    widget: root
  }

  SpotifyClient {
    id: spotifyClient
    spoti: root.spoti
    leader: leadership.leader
    panelOpen: root.opened
    preferredDevice: root.preferredDevice
    messages: ({
      generic: root.t("error.generic"),
      no_active_device: root.t("error.noDevice"),
      premium_required: root.t("error.premium"),
      rate_limited: root.t("error.rateLimited"),
      network: root.t("error.network"),
      noLiked: root.t("error.noLiked"),
    })
    onSnapshotTaken: leadership.share(spotifyClient.snapshot())
    onDeviceNeeded: root.devicesOpen = true
  }

  FavoritesFile {
    id: favoritesFile
    path: root.favoritesPath
    onEditorOpened: root.close()
  }

  // ---- The playlist list and its search ----

  property string query: ""
  property bool searching: false

  readonly property var libraryRows: Spotify.libraryRows(spotifyClient.playlists, root.showLiked, root.t("library.liked"))
  readonly property var visibleRows: Spotify.filterByName(libraryRows, query)

  property bool devicesOpen: false

  PanelCursor {
    id: panelCursor
    stops: Spotify.cursorStops({
      connected: spotifyClient.connected,
      statusActions: root.setupActions.length,
      devicesOpen: root.devicesOpen,
      devices: spotifyClient.devices.length,
      favorites: favoritesFile.entries.length,
      playlists: root.visibleRows.length,
    })
  }

  SpotifyIpc {
    widget: root
    enabled: leadership.leader
  }

  // ---- Actions shared by keys, mouse and IPC ----

  function runFavorite(index) {
    const favorite = favoritesFile.entries[index]
    if (favorite) {
      spotifyClient.playTarget(favorite.target, favorite.shuffle)
    }
  }

  function playRow(row) {
    if (row) {
      spotifyClient.playTarget(row.target, false)
    }
  }

  function toggleFavoriteRow(row) {
    if (row) {
      favoritesFile.toggle(row.name, row.target)
    }
  }

  /** One of the transport buttons, by index into Spotify.TRANSPORT. */
  function runTransport(index) {
    switch (Spotify.TRANSPORT[index]) {
    case "previous":
      spotifyClient.skip(false)
      break
    case "playPause":
      spotifyClient.playPause()
      break
    case "next":
      spotifyClient.skip(true)
      break
    case "shuffle":
      spotifyClient.toggleShuffle()
      break
    }
  }

  function editFavorites() {
    favoritesFile.edit()
  }

  function toggleDevices() {
    devicesOpen = !devicesOpen
    if (devicesOpen) {
      spotifyClient.refreshDevices()
    }
  }

  /** Opens the panel with the cursor in the search line. */
  function openSearch() {
    open()
    Qt.callLater(function() {
      if (panel.loadedContent) {
        panel.loadedContent.startSearch()
      }
    })
  }

  // ---- Setup: what to offer while spoti is not connected ----

  readonly property var setupActions: ({
    missing: ["install", "retry"],
    notConfigured: ["connect", "retry"],
    unreachable: ["retry"],
    error: ["retry"],
  })[spotifyClient.status] || []

  readonly property bool needsSetup: setupActions.length > 0
  readonly property string statusTitle: needsSetup ? t("status." + spotifyClient.status + ".title") : ""
  readonly property string statusText: needsSetup ? t("status." + spotifyClient.status + ".detail") : ""

  function runSetupAction(index) {
    switch (setupActions[index]) {
    case "install":
      presentInTerminal("bash " + Util.shellQuote(pluginFile("install.sh")) + " --spoti-only")
      break
    case "connect":
      presentInTerminal("bash " + Util.shellQuote(pluginFile("install.sh")) + " --connect")
      break
    case "retry":
      spotifyClient.retry()
      break
    }
  }

  function setUpSpeaker() {
    presentInTerminal("bash " + Util.shellQuote(pluginFile("install.sh")) + " --speaker")
  }

  function pluginFile(name) {
    return decodeURIComponent(String(Qt.resolvedUrl(name)).replace(/^file:\/\//, ""))
  }

  function presentInTerminal(command) {
    Quickshell.execDetached(["omarchy-launch-floating-terminal-with-presentation", command])
    root.close()
  }

  // ---- Bar icon and tooltip ----

  readonly property var playback: spotifyClient.playback
  readonly property bool playing: spotifyClient.connected && spotifyClient.live.playing

  readonly property string tooltip: {
    if (spotifyClient.status === "loading") {
      return t("meta.loading")
    }
    if (!spotifyClient.connected) {
      return statusTitle
    }
    if (!spotifyClient.hasTrack) {
      return t("meta.nothing")
    }
    const line = Spotify.trackLine(playback.title, playback.artist)
    return playing ? line : t("tooltip.paused").arg(line)
  }

  // ---- Shared with the instances on other monitors (see ui/Leadership.qml) ----

  function snapshot() {
    return spotifyClient.snapshot()
  }

  function adoptSnapshot(snapshot) {
    spotifyClient.adopt(snapshot)
  }

  function scheduleElection() {
    leadership.scheduleElection()
  }

  property real wheelAccumulator: 0

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button

    anchors.fill: parent
    bar: root.bar
    text: Spotify.Glyph.spotify
    dimmed: !root.playing
    labelText: root.showTrack && spotifyClient.connected && spotifyClient.hasTrack
      ? Spotify.shorten(Spotify.trackLine(root.playback.title, root.playback.artist), root.trackLength)
      : ""
    tooltipText: root.tooltip

    // Left opens the panel, right plays or pauses, middle skips.
    onPressed: function(mouseButton) {
      if (mouseButton === Qt.RightButton) {
        spotifyClient.playPause()
      } else if (mouseButton === Qt.MiddleButton) {
        spotifyClient.skip(true)
      } else {
        root.toggle()
      }
    }

    onWheelMoved: function(delta) {
      const wheel = Util.wheelSteps(root.wheelAccumulator, delta)
      root.wheelAccumulator = wheel.remainder
      if (wheel.steps !== 0) {
        spotifyClient.nudgeVolume(wheel.steps * root.step)
      }
    }
  }

  // ---- Panel ----

  function reveal(item) {
    if (panel.loadedContent) {
      panel.loadedContent.reveal(item)
    }
  }

  onOpenedChanged: {
    if (!opened) {
      searching = false
      query = ""
      return
    }
    spotifyClient.refreshAll(false)
    favoritesFile.reload()
    panelCursor.reset("transport:1")
  }

  KeyboardPanel {
    id: panel

    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: panel.loadedContent
    contentWidth: panel.fittedContentWidth(Style.space(420))
    contentHeight: panel.fittedContentHeight(panel.loadedContentHeight, Style.space(680))

    content: PanelContent {
      widget: root
    }
  }
}
