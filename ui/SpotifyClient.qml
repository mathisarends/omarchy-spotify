import QtQuick
import "../lib/spotify.js" as Spotify

// Everything the widget knows about Spotify, and the only place that runs
// spoti. Playback is polled: often while the panel is open, rarely while it
// is closed, and right when the current track should end. Writes wait in a
// queue and show up in the panel before Spotify confirms them.
Item {
  id: client
  visible: false

  // ---- Set by the widget ----
  property string spoti: "spoti"
  property bool leader: false
  property bool panelOpen: false
  // Played on when nothing is active yet; "" lets Spotify (or spoti) choose.
  property string preferredDevice: ""
  property bool showLiked: true
  property string likedName: ""
  // Friendlier words for spoti's error reasons, plus "generic".
  property var messages: ({})

  // ---- What Spotify reported ----
  property string status: "loading"
  property string statusDetail: ""
  property var playback: Spotify.emptyPlayback()
  // When playback was read, to move the position forward between reads.
  property real reportedAt: 0
  property var devices: []
  property bool devicesLoaded: false
  property var playlists: []
  property bool playlistsLoaded: false
  property real playlistsAt: 0
  readonly property bool connected: status === "ok"
  readonly property bool hasTrack: playback.title !== ""

  // ---- What was asked for and not confirmed yet ----
  property var override: null
  property var queue: []
  property string lastError: ""

  readonly property var live: Spotify.liveState(playback, override, Date.now())

  // A read finished. The leader hands it to the other bars.
  signal snapshotTaken()
  // Spotify needs to be told where to play.
  signal deviceNeeded()

  // ---- Playback ----

  /** The device to name in `play`: only needed while nothing is active. */
  function playDevice() {
    return playback.device ? "" : preferredDevice
  }

  function showChange(patch) {
    override = Spotify.withOverride(override, patch, Date.now())
    overrideExpiry.restart()
  }

  function playPause() {
    if (!connected) {
      return
    }
    if (live.playing) {
      showChange({ playing: false })
      send("playback", Spotify.pauseArgs())
    } else {
      showChange({ playing: true })
      send("playback", Spotify.resumeArgs(playDevice()))
    }
  }

  function play() {
    if (connected && !live.playing) {
      playPause()
    }
  }

  function pause() {
    if (connected && live.playing) {
      playPause()
    }
  }

  function skip(forward) {
    if (!connected) {
      return
    }
    send("", Spotify.skipArgs(forward))
  }

  function setVolume(value) {
    if (!connected) {
      return
    }
    const percent = Spotify.clampPercent(value)
    showChange({ volume: percent })
    send("volume", Spotify.volumeArgs(percent))
  }

  function nudgeVolume(delta) {
    setVolume(Spotify.nudgedVolume(live.volume, delta))
  }

  // The level to come back to after muting.
  property int unmuteVolume: 50

  function toggleMute() {
    if (live.volume !== 0) {
      unmuteVolume = live.volume > 0 ? live.volume : 50
      setVolume(0)
    } else {
      setVolume(unmuteVolume)
    }
  }

  function setShuffle(on) {
    if (!connected) {
      return
    }
    showChange({ shuffle: on })
    send("shuffle", Spotify.shuffleArgs(on))
  }

  function toggleShuffle() {
    setShuffle(!live.shuffle)
  }

  function transfer(device) {
    if (device) {
      transferTo(device.id)
    }
  }

  /** Moves playback to a device id or name; keeps playing if music was playing. */
  function transferTo(device) {
    if (!connected || !device) {
      return
    }
    send("transfer", Spotify.transferArgs(device, live.playing))
    devicesLater.restart()
  }

  /** Plays a playlist URI, any other Spotify URI, a playlist name, or LIKED. */
  function playTarget(target, shuffle) {
    if (!connected || !target) {
      return
    }
    if (target === Spotify.LIKED) {
      playLiked(shuffle)
      return
    }
    showChange({ playing: true })
    send("play", Spotify.playArgs(Spotify.playTarget(target, playlists), playDevice(), shuffle === true))
  }

  property bool likedShuffle: false

  function playLiked(shuffle) {
    likedShuffle = shuffle === true
    showChange({ playing: true })
    likedCall.start(Spotify.likedArgs())
  }

  function send(key, args) {
    queue = Spotify.enqueue(queue, { key: key, args: args })
    pump()
  }

  function pump() {
    if (runner.busy || gapTimer.running || queue.length === 0) {
      return
    }
    const next = queue[0]
    queue = queue.slice(1)
    runner.start(next.args)
  }

  function flashError(message) {
    lastError = message
    errorClear.restart()
  }

  function failed(code, err) {
    const error = Spotify.parseError(err)
    flashError(Spotify.errorText(error, messages))
    // A dropped login or network shows in the panel; a missing device opens the list.
    if (Spotify.statusForExit(code) !== "error") {
      refresh()
    }
    if (error.reason === "no_active_device" || /no (active )?spotify device/i.test(error.message)) {
      refreshDevices()
      deviceNeeded()
    }
  }

  // ---- Reads ----

  property bool readAgain: false

  function refresh() {
    if (!statusCall.start(Spotify.statusArgs())) {
      readAgain = true
    }
  }

  function retry() {
    status = "loading"
    refresh()
  }

  /** Everything: playback, devices and, when stale or forced, the playlists. */
  function refreshAll(forcePlaylists) {
    refresh()
    refreshDevices()
    const stale = Date.now() - playlistsAt > 10 * 60 * 1000
    if (forcePlaylists || !playlistsLoaded || stale) {
      loadPlaylists()
    }
  }

  function refreshDevices() {
    if (connected) {
      devicesCall.start(Spotify.devicesArgs())
    }
  }

  property var playlistBuffer: []
  property int playlistOffset: 0

  function loadPlaylists() {
    if (!connected || playlistsCall.busy) {
      return
    }
    playlistBuffer = []
    playlistOffset = 0
    playlistsCall.start(Spotify.playlistPageArgs(0, Spotify.PAGE_SIZE))
  }

  function schedulePoll() {
    const interval = !connected
      ? (panelOpen ? 3000 : 30000)
      : panelOpen ? 2000 : (live.playing ? 15000 : 30000)
    const progress = Spotify.progressAt(playback, live.playing, reportedAt, Date.now())
    pollTimer.interval = connected ? Spotify.nextPollMs(playback, live.playing, progress, interval) : interval
    pollTimer.restart()
  }

  // ---- Sharing with the other bars ----

  function snapshot() {
    return {
      status: status,
      statusDetail: statusDetail,
      playback: playback,
      reportedAt: reportedAt,
      devices: devices,
      devicesLoaded: devicesLoaded,
      playlists: playlists,
      playlistsLoaded: playlistsLoaded,
      playlistsAt: playlistsAt,
    }
  }

  function adopt(snapshot) {
    if (!snapshot || leader) {
      return
    }
    status = snapshot.status
    statusDetail = snapshot.statusDetail
    playback = snapshot.playback
    reportedAt = snapshot.reportedAt
    devices = snapshot.devices
    devicesLoaded = snapshot.devicesLoaded
    playlists = snapshot.playlists
    playlistsLoaded = snapshot.playlistsLoaded
    playlistsAt = snapshot.playlistsAt
  }

  function share() {
    if (leader) {
      snapshotTaken()
    }
  }

  onLeaderChanged: {
    if (leader) {
      refresh()
    }
  }
  onPanelOpenChanged: schedulePoll()
  onSpotiChanged: {
    if (leader) {
      retry()
    }
  }
  onConnectedChanged: {
    if (connected && panelOpen) {
      refreshAll(false)
    }
  }

  // ---- Processes ----

  SpotiCall {
    id: statusCall
    spoti: client.spoti
    onDone: function(code, out, err) {
      const next = Spotify.statusForExit(code)
      client.statusDetail = next === "ok" ? "" : Spotify.parseError(err).message
      if (next === "ok") {
        client.playback = Spotify.parsePlayback(out)
        client.reportedAt = Date.now()
      }
      client.status = next
      client.share()
      client.schedulePoll()
      if (client.readAgain) {
        client.readAgain = false
        client.refresh()
      }
    }
  }

  SpotiCall {
    id: devicesCall
    spoti: client.spoti
    onDone: function(code, out) {
      if (code === 0) {
        client.devices = Spotify.parseDevices(out)
        client.devicesLoaded = true
        client.share()
      }
    }
  }

  SpotiCall {
    id: playlistsCall
    spoti: client.spoti
    onDone: function(code, out, err) {
      if (code !== 0) {
        client.flashError(Spotify.errorText(Spotify.parseError(err), client.messages))
        return
      }
      const page = Spotify.parsePlaylistPage(out)
      client.playlistBuffer = Spotify.mergePlaylists(client.playlistBuffer, page.items)
      const next = Spotify.nextOffset(client.playlistOffset, Spotify.PAGE_SIZE, page.total, Spotify.MAX_PLAYLISTS)
      if (next >= 0) {
        client.playlistOffset = next
        playlistsCall.start(Spotify.playlistPageArgs(next, Spotify.PAGE_SIZE))
        return
      }
      client.playlists = client.playlistBuffer
      client.playlistsLoaded = true
      client.playlistsAt = Date.now()
      client.share()
    }
  }

  SpotiCall {
    id: likedCall
    spoti: client.spoti
    onDone: function(code, out, err) {
      if (code !== 0) {
        client.failed(code, err)
        return
      }
      const uris = Spotify.parseTrackUris(out)
      if (uris.length === 0) {
        client.flashError(client.messages.noLiked || "")
        return
      }
      client.send("play", Spotify.playArgs({ kind: "uris", uris: uris }, client.playDevice(), client.likedShuffle))
    }
  }

  SpotiCall {
    id: runner
    spoti: client.spoti
    onDone: function(code, out, err) {
      if (code !== 0) {
        client.failed(code, err)
      }
      gapTimer.restart()
      // Spotify takes a moment to report a change; look shortly after.
      readSoon.restart()
    }
  }

  // ---- Timers ----

  Timer {
    id: gapTimer
    interval: Spotify.COMMAND_GAP_MS
    onTriggered: client.pump()
  }

  Timer {
    id: readSoon
    interval: 450
    onTriggered: client.refresh()
  }

  Timer {
    id: devicesLater
    interval: 1200
    onTriggered: client.refreshDevices()
  }

  Timer {
    id: overrideExpiry
    interval: Spotify.OVERRIDE_MS + 100
    onTriggered: client.override = null
  }

  Timer {
    id: errorClear
    interval: 6000
    onTriggered: client.lastError = ""
  }

  // Only the leader polls in the background; an open panel polls on any bar.
  Timer {
    id: pollTimer
    onTriggered: {
      if (client.leader || client.panelOpen) {
        client.refresh()
      } else {
        client.schedulePoll()
      }
    }
  }
}
