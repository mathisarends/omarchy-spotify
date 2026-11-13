# Spotify for Omarchy

A distraction-free Spotify remote in the Omarchy bar. Click the icon (or press
a shortcut), hit a key, and music plays, without opening Spotify.

- Play/pause, next, previous, shuffle and volume
- What is playing, as text: title and artist, nothing else
- The device it plays on, and switching to another one
- Your playlists and liked songs, filtered as you type
- Favorites on the number keys
- Keyboard first, with global shortcuts over IPC

No cover art, recommendations, social features or browsing.

It is a native omarchy-shell plugin (QML). It talks to Spotify through
[spoti](https://github.com/mathisarends/spoti), a small CLI for the Spotify Web
API that signs you in once and refreshes its tokens on its own.

> Spotify only allows remote control with **Spotify Premium**.

## Install

### One command

```sh
curl -fsSL https://raw.githubusercontent.com/mathisarends/omarchy-spotify/main/install.sh | bash
```

This does three things:
1. Installs spoti (a pinned release, checked against its checksums) to `~/.local/bin`.
2. Adds the widget to the bar.
3. Walks you through connecting your Spotify account.

### Step by step

1. Install spoti: `bash install.sh --spoti-only`, or `go install github.com/mathisarends/spoti@v0.2.0`.
2. Add the widget: `omarchy plugin add https://github.com/mathisarends/omarchy-spotify --enable`.
3. Connect Spotify with `bash install.sh --connect`, or use the panel's **Connect Spotify** button.

### Connecting Spotify

spoti signs in with a Spotify app of your own, using OAuth with PKCE (so
there is no client secret). The installer opens the dashboard and asks for the
Client ID:

1. Open <https://developer.spotify.com/dashboard> and choose **Create app**.
2. Set the redirect URI to `http://127.0.0.1:8888/callback`.
3. Tick **Web API** and save.
4. Paste the app's **Client ID** into the installer.
5. Sign in in the browser.

You can do the same by hand:

```sh
spoti auth setup --client-id <id> --redirect-uri http://127.0.0.1:8888/callback
spoti auth login
```

## Where the music plays

The widget is a remote. It plays on any Spotify Connect device: your phone, a
speaker, the Spotify app on another computer, or this one.

To play on this computer **without the Spotify app**, run
[spotifyd](https://github.com/Spotifyd/spotifyd), a small open-source Spotify
Connect speaker built on librespot. The panel sets it up for you: open the
device row (`d`) when no device is online and press Enter. You can also run:

```sh
bash install.sh --speaker
```

That command:
1. Installs `spotifyd` with pacman.
2. Writes `~/.config/spotifyd/spotifyd.conf` (PulseAudio/PipeWire backend, 320 kbps).
3. Signs spotifyd in.
4. Enables it as a systemd user service.

Then set the widget's `device` setting to this computer's name. Playback then
starts there whenever nothing else is active.

## Keys

Open the panel, then:

| Key | Action |
| --- | --- |
| `Space` | play / pause |
| `n` / `p` | next / previous track |
| `+` / `-` | volume up / down (`Left`/`Right` on the volume slider too) |
| `s` | shuffle on / off |
| `/` | search your playlists; type, then `Enter` plays the best match |
| `j` / `k`, arrows | move |
| `Enter` | play the playlist, run the button, or pick the device under the cursor |
| `f` | add or remove the playlist under the cursor as a favorite |
| `1`–`9` | play a favorite |
| `d` | open the device list |
| `e` | edit the favorites file |
| `r` | reload playlists and devices |
| `q`, `Esc` | close |

While searching:

| Key | Action |
| --- | --- |
| arrows | move through the results |
| `Enter` | play |
| `Esc` | leave the search and clear it |
| `Tab` | leave the search but keep the filter |
| `Backspace` | on an empty line, leave the search |

With the mouse:

- **Bar icon:** left click opens the panel, right click plays/pauses, middle click skips, and the scroll wheel changes the volume.
- **Playlist row:** right click toggles it as a favorite.

### Changing keys

Add a `keys` object to the widget's settings. You only need to list the actions
you want to change; the others keep their default. Each value is a list of
keys separated by spaces.

```jsonc
// ~/.config/omarchy/shell.json, in bar.layout
{
  "id": "mathisarends.spotify",
  "keys": {
    "playPause": "Space ctrl+p",
    "search": "/ ctrl+f",
    "favorites": "1 2 3 4"
  }
}
```

| Action | Default |
| --- | --- |
| `down` | `j Down` |
| `up` | `k Up` |
| `left` | `h Left` |
| `right` | `l Right` |
| `first` | `g Home` |
| `last` | `G End` |
| `activate` | `Return Enter` |
| `playPause` | `Space` |
| `next` | `n` |
| `previous` | `p` |
| `volumeUp` | `+ =` |
| `volumeDown` | `-` |
| `shuffle` | `s` |
| `search` | `/` |
| `toggleFavorite` | `f` |
| `devices` | `d` |
| `refresh` | `r` |
| `editFavorites` | `e` |
| `close` | `q` |
| `favorites` | `1 2 3 4 5 6 7 8 9` (one key per favorite, in order) |

Key names:
- Any single character.
- `Return`, `Enter`, `Space`, `Backspace`, `Delete`, `Insert`, `Home`, `End`, `PageUp`, `PageDown`, the arrows `Up` `Down` `Left` `Right`, and `F1` to `F12`.
- Modifiers: `ctrl+`, `alt+`, `super+` and `shift+`.

Uppercase letters mean Shift. Set an action to `""` to turn it off. Escape and
Tab always keep their meaning. The hint line at the bottom of the panel shows
your current keys; hide it with `"showHints": false`.

## Global shortcuts

The widget answers IPC as `mathisarends.spotify`, so Hyprland can control it
without opening anything. Add binds to `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + ALT + S", "Spotify", "omarchy-shell mathisarends.spotify toggle")
o.bind("SUPER + ALT + SLASH", "Spotify search", "omarchy-shell mathisarends.spotify search")
o.bind("SUPER + ALT + SPACE", "Play/pause", "omarchy-shell mathisarends.spotify playPause")
o.bind("SUPER + ALT + RIGHT", "Next track", "omarchy-shell mathisarends.spotify next")
o.bind("SUPER + ALT + LEFT", "Previous track", "omarchy-shell mathisarends.spotify previous")
o.bind("SUPER + ALT + UP", "Louder", "omarchy-shell mathisarends.spotify volumeUp 10")
o.bind("SUPER + ALT + DOWN", "Quieter", "omarchy-shell mathisarends.spotify volumeDown 10")
o.bind("SUPER + ALT + F", "Focus music", "omarchy-shell mathisarends.spotify favorite Focus")
```

| Method | What it does |
| --- | --- |
| `toggle`, `open`, `close` | the panel (`show` and `hide` work too) |
| `search` | open the panel straight into playlist search |
| `playPause`, `play`, `pause` | playback |
| `next`, `previous`, `shuffle` | skip, toggle shuffle |
| `volumeUp <n>`, `volumeDown <n>` | change the volume by n % (default: `step`) |
| `volume <n>` | set the volume |
| `playlist <name\|uri\|link>` | play one of your playlists by name, or any Spotify URI or link |
| `liked` | play your liked songs |
| `favorite <label>` | play a favorite by its label |
| `device <name>` | move playback to a device (id, name, or a unique part of it) |
| `refresh` | read everything from Spotify again |
| `nowPlaying` | `Title — Artist`, for scripts |
| `state` | the playback state as JSON, for scripts |

Use the plain command form shown above. The `{ ipc = "…" }` shorthand splits at
the first dot, which doesn't fit this plugin's id.

## Favorites

Favorites live in `~/.config/omarchy/spotify/favorites.conf`.
- Press `f` on a playlist in the panel to add or remove it.
- Press `e` to open the file. It is created with examples the first time.
- Saving the file updates the panel immediately.

```ini
# Label = what to play   (add --shuffle to start shuffled)
Focus     = spotify:playlist:37i9dQZF1DWZeKCadgRdKQ
Running   = https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP --shuffle
Road trip = Road Trip
Liked     = liked --shuffle
```

What to play can be:
- a Spotify URI or `open.spotify.com` link (a playlist, album, artist, show or track);
- the name of one of your playlists;
- `liked`.

The first nine favorites get the keys `1` to `9`.

## Settings

Set these in the widget's entry in `~/.config/omarchy/shell.json`, or in the
bar settings UI.

| Setting | Default | |
| --- | --- | --- |
| `device` | `""` | Device to start playback on when none is active (name or id), for example your spotifyd speaker |
| `step` | `5` | Volume step for the scroll wheel, `+`/`-` and IPC, in % |
| `showLiked` | `true` | Liked songs as the first row of the list |
| `showTrack` | `false` | Title and artist next to the bar icon |
| `trackLength` | `32` | Longest bar text before it is cut |
| `showHints` | `true` | The key hint line in the panel |
| `favoritesFile` | `""` | Defaults to `~/.config/omarchy/spotify/favorites.conf` |
| `spoti` | `"spoti"` | Name or full path of the spoti binary |
| `keys` | `{}` | See [Changing keys](#changing-keys) |

## How it works

omarchy-shell plugins are QML, so that is what the panel is made of. The
logic is written in TypeScript (`src/`) and bundled into one QML JavaScript
library, `lib/spotify.js`.

All Spotify traffic goes through spoti and the Spotify Web API (Spotify Connect):

- **Commands** such as `spoti play --json -- <uri>` go through a short queue.
  - Repeated presses of the same kind (volume, skip) merge into one.
  - Commands are spaced 120 ms apart, which keeps a burst of keys under Spotify's rate limit.
- **Changes show at once.** Play state, volume and shuffle update immediately and are confirmed by a read half a second later.
- **Reads are cheap.**
  - Every 2 s while the panel is open.
  - Otherwise every 15 s while playing and 30 s while paused, plus right after the current track ends.
  - Playlists load once and again after 10 minutes, 50 per page, up to 1000.
- **Errors**
  - spoti's exit codes tell "not installed", "not connected" and "offline" apart, and the panel offers the fix.
  - spoti's error reasons (no active device, Premium required, rate limited) show as one short line.
  - "No active device" opens the device list.
- **Several monitors:** one instance talks to Spotify and shares its state with the others.

```
Panel.qml              settings, bar icon, panel, actions
ui/SpotifyClient.qml   runs spoti, holds playback, devices and playlists
ui/PanelContent.qml    the panel and its keys
ui/*.qml               one file per part of the panel
src/*.ts               parsing, commands, filter, keymap, cursor; tested with node --test
i18n/*.json            translations (English, German)
install.sh             spoti, plugin, Spotify sign-in, spotifyd
```

### Why spoti and not MPRIS or the desktop app

- **MPRIS** only reaches a player running on this machine. It cannot list playlists or switch devices.
- **The desktop app** is heavy and not what the widget is for.
- **The Web API through Spotify Connect** works with any device, including a phone or a headless spotifyd.
- **spoti** wraps the Web API with stable JSON output, exit codes and token refresh.

## Limitations

- **Premium** is required for remote control. This is Spotify's rule.
- **Liked songs** plays your 50 most recently liked tracks, because the Web API cannot start "Liked Songs" as a context.
- **Spotify Connect** has to see a device before anything can play. Open Spotify somewhere, or set up spotifyd.

## Development

You need Node 24.

```sh
npm install
npm run build   # src/*.ts  ->  lib/spotify.js
npm run check   # types, lint, tests, and that lib/spotify.js is up to date
```

Edit `src/`, never `lib/spotify.js` directly. `lib/spotify.js` is committed
because `omarchy plugin add` installs straight from git. The lint enforces
braces on every block, in TypeScript and in QML.

To try local changes, add the repo folder as a plugin:

```sh
omarchy plugin add ~/code/omarchy-spotify
```

## License

[MIT](LICENSE)
