.pragma library

// Generated from src/*.ts by `npm run build`. Edit the sources, not this file.

// ---- src/commands.ts ----

// Building spoti command lines and queueing them.
// Runs spoti through sh so a missing binary exits 127 instead of failing to
// spawn, which Process reports without an exit code. Arguments travel as
// positional parameters and are never parsed by the shell.
//
// A bare name is also looked up in ~/.local/bin (where install.sh puts it) and
// the Go bin directory, because the shell may start with a shorter PATH than
// your terminal.
var LAUNCH = [
    'case "$0" in */*) ;; *)',
    '  command -v "$0" >/dev/null 2>&1 ||',
    '  for dir in "$HOME/.local/bin" "${GOBIN:-${GOPATH:-$HOME/go}/bin}"; do',
    '    if [ -x "$dir/$0" ]; then exec "$dir/$0" "$@"; fi',
    '  done ;;',
    'esac',
    'command -v "$0" >/dev/null 2>&1 || exit 127',
    'exec "$0" "$@"',
].join("\n");
/** Pause between two commands, so a burst of keys never trips Spotify's rate limit. */
var COMMAND_GAP_MS = 120;
/** How many liked songs "Liked Songs" plays: one page, newest first. */
var LIKED_LIMIT = 50;
/** `--device <name>` when one is given. */
function deviceFlag(device) {
    return device ? ["--device", device] : [];
}
function statusArgs() {
    return ["status", "--json"];
}
function devicesArgs() {
    return ["device", "list", "--json"];
}
function playlistPageArgs(offset, limit) {
    return ["playlist", "list", "--limit", String(limit), "--offset", String(offset), "--json"];
}
function likedArgs() {
    return ["library", "list", "tracks", "--limit", String(LIKED_LIMIT), "--json"];
}
/** Starts a target; `device` is only needed when nothing is active yet. */
function playArgs(target, device, shuffle) {
    const extra = [...deviceFlag(device), ...(shuffle ? ["--shuffle"] : []), "--json"];
    switch (target.kind) {
        case "uri":
            return ["play", ...extra, "--", target.uri];
        case "uris":
            return ["play", ...extra, "--", ...target.uris];
        case "name":
            // spoti plays your own playlist with this exact name first, else the
            // top playlist in the catalog.
            return ["play", "--type", "playlist", ...extra, "--", target.name];
    }
}
function resumeArgs(device) {
    return ["play", ...deviceFlag(device), "--json"];
}
function pauseArgs() {
    return ["pause", "--json"];
}
function skipArgs(forward) {
    return [forward ? "next" : "prev", "--json"];
}
function volumeArgs(percent) {
    return ["volume", String(Math.max(0, Math.min(100, Math.round(percent)))), "--json"];
}
function shuffleArgs(on) {
    return ["shuffle", on ? "on" : "off", "--json"];
}
/** `device` is an id, a name, or a unique part of a name. */
function transferArgs(device, play) {
    return ["device", "transfer", ...(play ? [] : ["--no-play"]), "--json", "--", device];
}
/** Adds a command; a waiting command with the same key is replaced in place. */
function enqueue(queue, command) {
    const index = command.key ? queue.findIndex((queued) => queued.key === command.key) : -1;
    if (index < 0) {
        return [...queue, command];
    }
    const next = queue.slice();
    next[index] = command;
    return next;
}

// ---- src/cursor.ts ----

// The panel's cursor, shared by keyboard and mouse. Each place it can stop
// has an id:
//
//   status:<i>     a setup button while spoti is not connected
//   transport:<i>  previous, play/pause, next, shuffle
//   volume         the volume slider
//   device         the "playing on" row; opens the device list
//   dev:<i>        a device in the open list
//   speaker        "set up this computer" when the open list is empty
//   fav:<i>        a favorite, or favedit when there are none
//   pl:<i>         a row of the (filtered) playlist list
var TRANSPORT = ["previous", "playPause", "next", "shuffle"];
function range(prefix, count) {
    return Array.from({ length: count }, (_, i) => `${prefix}:${i}`);
}
function deviceStops(layout) {
    if (!layout.devicesOpen) {
        return [];
    }
    return layout.devices > 0 ? range("dev", layout.devices) : ["speaker"];
}
/** Every stop, top to bottom. */
function cursorStops(layout) {
    if (!layout.connected) {
        return range("status", layout.statusActions);
    }
    return [
        ...range("transport", TRANSPORT.length),
        "volume",
        "device",
        ...deviceStops(layout),
        ...(layout.favorites > 0 ? range("fav", layout.favorites) : ["favedit"]),
        ...range("pl", layout.playlists),
    ];
}
function parseStop(stop) {
    const [type, index] = stop.split(":");
    switch (type) {
        case "status":
        case "transport":
        case "dev":
        case "fav":
        case "pl":
            return { type, index: Number(index) };
        case "volume":
        case "device":
        case "speaker":
        case "favedit":
            return { type, index: -1 };
        default:
            return { type: "", index: -1 };
    }
}
/** Keeps the cursor where it was; else the nearest stop of the same kind, then the top. */
function clampStop(stops, current) {
    var _a;
    if (stops.includes(current)) {
        return current;
    }
    const { type, index } = parseStop(current);
    const sameKind = stops.filter((stop) => parseStop(stop).type === type);
    if (sameKind.length > 0 && index >= 0) {
        return sameKind[Math.min(index, sameKind.length - 1)];
    }
    if (type === "dev" || type === "speaker") {
        return "device";
    }
    return (_a = stops[0]) !== null && _a !== void 0 ? _a : "";
}
/** j/k: one stop down or up, stopping at the ends. `within` keeps it to one kind. */
function stepStop(stops, current, delta, within = "") {
    var _a;
    const list = within ? stops.filter((stop) => parseStop(stop).type === within) : stops;
    const index = list.indexOf(current);
    if (index < 0) {
        return (_a = list[0]) !== null && _a !== void 0 ? _a : current;
    }
    return list[Math.max(0, Math.min(list.length - 1, index + delta))];
}
/** h/l along a row of buttons (transport, favorites, setup); stays put at the ends. */
function sideStop(stops, current, delta) {
    const { type, index } = parseStop(current);
    if (type !== "transport" && type !== "fav" && type !== "status") {
        return current;
    }
    const next = `${type}:${index + delta}`;
    return stops.includes(next) ? next : current;
}

// ---- src/input.ts ----

// Cleaning untrusted input. Track, artist, playlist and device names come
// from Spotify and from the user's file; ids and URIs end up in spoti's argv.
var MAX_NAME = 96;
// Newlines, tabs and the other C0 control characters, plus DEL.
// eslint-disable-next-line no-control-regex -- matching them is the point
var CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** One line of plain text, at most MAX_NAME characters. */
function cleanName(value) {
    const text = String(value !== null && value !== void 0 ? value : "").replace(CONTROL_CHARS, " ").trim();
    return text.length > MAX_NAME ? text.slice(0, MAX_NAME - 1) + "…" : text;
}
/** A Spotify or device id, or "" when it holds anything but letters, digits, "_" and "-". */
function cleanId(value) {
    const id = String(value !== null && value !== void 0 ? value : "");
    return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : "";
}
var URI_KINDS = ["track", "episode", "album", "artist", "playlist", "show"];
/** "spotify:<kind>:<id>" for a kind spoti can play, or "". */
function cleanUri(value) {
    const match = /^spotify:([a-z]+):([A-Za-z0-9]{1,64})$/.exec(String(value !== null && value !== void 0 ? value : ""));
    return match && URI_KINDS.includes(match[1]) ? match[0] : "";
}
/**
 * A Spotify URI from what a person might paste: a URI, an open.spotify.com
 * link (with or without "intl-xx" and "?si=") or "" when it is neither.
 */
function uriFromReference(value) {
    const text = value.trim();
    if (text.startsWith("spotify:")) {
        return cleanUri(text);
    }
    const link = /^https:\/\/(?:www\.)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?([a-z]+)\/([A-Za-z0-9]+)(?:[?#].*)?$/.exec(text);
    return link ? cleanUri(`spotify:${link[1]}:${link[2]}`) : "";
}
function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch (_a) {
        return undefined;
    }
}
function clampPercent(value) {
    const n = Math.round(value);
    if (!isFinite(n)) {
        return 0;
    }
    return Math.max(0, Math.min(100, n));
}

// ---- src/favorites.ts ----

// The favorites file: one "Label = what to play" per line, # for comments.
//
//   Focus     = spotify:playlist:37i9dQZF1DWZeKCadgRdKQ
//   Running   = https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP?si=x
//   Liked     = liked
//   Road trip = Road Trip            (one of your playlists, by name)
//
// Add "--shuffle" at the end to start shuffled.
var MAX_FAVORITES = 48;
var LIKED = "liked";
var SHUFFLE_FLAG = /\s+--shuffle\s*$/;
function parseTarget(value) {
    const text = cleanName(value);
    if (text.toLowerCase() === LIKED) {
        return LIKED;
    }
    if (/^(spotify:|https?:)/i.test(text)) {
        // A link that is not a Spotify link is skipped rather than searched for.
        return uriFromReference(text);
    }
    return text;
}
/** Lines that do not parse are skipped. */
function parseFavorites(text) {
    const favorites = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length && favorites.length < MAX_FAVORITES; i++) {
        const line = lines[i].trim();
        const eq = line.indexOf("=");
        if (line.startsWith("#") || eq <= 0) {
            continue;
        }
        const label = cleanName(line.slice(0, eq));
        let rest = line.slice(eq + 1);
        const shuffle = SHUFFLE_FLAG.test(rest);
        rest = rest.replace(SHUFFLE_FLAG, "");
        const target = parseTarget(rest);
        if (label && target) {
            favorites.push({ label, target, shuffle, line: i + 1 });
        }
    }
    return favorites;
}
function findFavorite(favorites, label) {
    var _a;
    const key = label.trim().toLowerCase();
    return (_a = favorites.find((favorite) => favorite.label.toLowerCase() === key)) !== null && _a !== void 0 ? _a : null;
}
/** The favorite that plays this URI, if any. */
function favoriteFor(favorites, uri) {
    var _a;
    return (_a = favorites.find((favorite) => favorite.target === uri)) !== null && _a !== void 0 ? _a : null;
}
// "=" ends the label and "#" starts a comment, so neither may appear in one.
function labelFor(name) {
    return cleanName(name.replace(/[=#]/g, " ").replace(/\s+/g, " ")) || "Playlist";
}
/**
 * The file with this target added at the end, or every line playing it
 * removed when it is there already. Everything else is kept as written.
 */
function toggleFavorite(text, name, target) {
    const lines = text === "" ? [] : text.replace(/\n+$/, "").split("\n");
    const existing = new Set(parseFavorites(text).filter((favorite) => favorite.target === target).map((favorite) => favorite.line));
    if (existing.size > 0) {
        return lines.filter((_, i) => !existing.has(i + 1)).join("\n") + "\n";
    }
    return [...lines, `${labelFor(name)} = ${target}`].join("\n") + "\n";
}
var FAVORITES_TEMPLATE = [
    "# Spotify favorites for the Omarchy bar. Saving this file updates the panel.",
    "# Press f on a playlist in the panel to add or remove it here.",
    "#",
    "# One favorite per line:   Label = what to play",
    "# What to play is a Spotify URI or open.spotify.com link (playlist, album,",
    "# artist, show or track), the name of one of your playlists, or \"liked\"",
    "# for your liked songs. Add --shuffle at the end to start shuffled.",
    "#",
    "# Focus     = spotify:playlist:37i9dQZF1DWZeKCadgRdKQ",
    "# Running   = https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP --shuffle",
    "# Road trip = Road Trip",
    "",
    "Liked songs = liked --shuffle",
    "",
].join("\n");

// ---- src/filter.ts ----

// Searching your playlists as you type. Every word of the query has to
// appear in the name; names that start with the query come first.
var MAX_QUERY = 64;
/** Lowercase, without accents, so "cafe" finds "Café". */
function foldText(text) {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function rank(name, query, words) {
    if (name.startsWith(query)) {
        return 0;
    }
    const starts = words.every((word) => name.startsWith(word) || name.includes(" " + word));
    return starts ? 1 : 2;
}
/** The items whose name matches, best first; the order of equals is kept. */
function filterByName(items, query) {
    const folded = foldText(query.trim()).slice(0, MAX_QUERY);
    if (folded === "") {
        return items;
    }
    const words = folded.split(/\s+/);
    return items
        .map((item, index) => ({ item, index, name: foldText(item.name) }))
        .filter((entry) => words.every((word) => entry.name.includes(word)))
        .map((entry) => (Object.assign(Object.assign({}, entry), { rank: rank(entry.name, folded, words) })))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map((entry) => entry.item);
}

// ---- src/glyphs.ts ----

// Material Design icons from the Nerd Font, spelled as code points so no
// editor or patch tool can strip them.
var Glyph = {
    spotify: String.fromCodePoint(0xF04C7),
    play: String.fromCodePoint(0xF040A),
    pause: String.fromCodePoint(0xF03E4),
    next: String.fromCodePoint(0xF04AD),
    previous: String.fromCodePoint(0xF04AE),
    shuffle: String.fromCodePoint(0xF049D),
    shuffleOff: String.fromCodePoint(0xF049E),
    volumeHigh: String.fromCodePoint(0xF057E),
    volumeLow: String.fromCodePoint(0xF057F),
    volumeMedium: String.fromCodePoint(0xF0580),
    volumeOff: String.fromCodePoint(0xF0581),
    speaker: String.fromCodePoint(0xF04C3),
    phone: String.fromCodePoint(0xF011C),
    computer: String.fromCodePoint(0xF0322),
    tv: String.fromCodePoint(0xF0502),
    heart: String.fromCodePoint(0xF02D1),
    playlist: String.fromCodePoint(0xF0CB8),
    star: String.fromCodePoint(0xF04CE),
    starOutline: String.fromCodePoint(0xF04D2),
    search: String.fromCodePoint(0xF0349),
    pencil: String.fromCodePoint(0xF03EB),
    alert: String.fromCodePoint(0xF05D6),
    chevronDown: String.fromCodePoint(0xF0140),
    chevronRight: String.fromCodePoint(0xF0142),
};
function volumeGlyph(volume) {
    if (volume === 0) {
        return Glyph.volumeOff;
    }
    if (volume < 0 || volume > 66) {
        return Glyph.volumeHigh;
    }
    return volume > 33 ? Glyph.volumeMedium : Glyph.volumeLow;
}
/** An icon for Spotify's device types. */
function deviceGlyph(type) {
    switch (type.toLowerCase()) {
        case "smartphone":
        case "tablet":
            return Glyph.phone;
        case "computer":
            return Glyph.computer;
        case "tv":
        case "castvideo":
        case "stb":
            return Glyph.tv;
        default:
            return Glyph.speaker;
    }
}

// ---- src/keymap.ts ----

// Panel shortcuts. Every action can be rebound in the widget's settings:
//
//   "keys": { "down": "j Down", "playPause": "Space ctrl+p", "favorites": "1 2 3" }
//
// A binding is a list of keys separated by spaces. A key is a single
// character ("j", "A", "?") or a named key ("Down", "Space", "F5"), with
// optional "ctrl+", "alt+", "super+" or "shift+" in front. Characters match
// what they type, so "A" already means Shift+a.
//
// Escape and Tab are not rebindable: every Omarchy panel closes on Escape and
// moves to the next panel on Tab.
var DEFAULT_KEYS = {
    down: "j Down",
    up: "k Up",
    left: "h Left",
    right: "l Right",
    first: "g Home",
    last: "G End",
    activate: "Return Enter",
    playPause: "Space",
    next: "n",
    previous: "p",
    volumeUp: "+ =",
    volumeDown: "-",
    shuffle: "s",
    search: "/",
    toggleFavorite: "f",
    devices: "d",
    refresh: "r",
    editFavorites: "e",
    close: "q",
    favorites: "1 2 3 4 5 6 7 8 9",
};
var MAX_KEYS_PER_BINDING = 12;
// Qt key codes (Qt::Key) for the keys that have names.
var NAMED_KEYS = {
    Backspace: 0x01000003,
    Return: 0x01000004,
    Enter: 0x01000005,
    Insert: 0x01000006,
    Delete: 0x01000007,
    Home: 0x01000010,
    End: 0x01000011,
    Left: 0x01000012,
    Up: 0x01000013,
    Right: 0x01000014,
    Down: 0x01000015,
    PageUp: 0x01000016,
    PageDown: 0x01000017,
    Space: 0x20,
    F1: 0x01000030,
    F2: 0x01000031,
    F3: 0x01000032,
    F4: 0x01000033,
    F5: 0x01000034,
    F6: 0x01000035,
    F7: 0x01000036,
    F8: 0x01000037,
    F9: 0x01000038,
    F10: 0x01000039,
    F11: 0x0100003a,
    F12: 0x0100003b,
};
var ALIASES = {
    del: "Delete",
    pgup: "PageUp",
    pgdown: "PageDown",
};
// Qt modifier bits (Qt::KeyboardModifier), in the order they are written.
var MODIFIERS = [
    ["ctrl", 0x04000000],
    ["alt", 0x08000000],
    ["super", 0x10000000],
    ["shift", 0x02000000],
];
var MODIFIER_ALIASES = { control: "ctrl", meta: "super", win: "super", cmd: "super" };
var NAME_BY_LOWERCASE = new Map(Object.keys(NAMED_KEYS).map((name) => [name.toLowerCase(), name]));
var NAME_BY_CODE = new Map(Object.entries(NAMED_KEYS).map(([name, code]) => [code, name]));
function hasKey(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}
function namedKey(word) {
    var _a, _b;
    const lower = word.toLowerCase();
    return (_b = (_a = ALIASES[lower]) !== null && _a !== void 0 ? _a : NAME_BY_LOWERCASE.get(lower)) !== null && _b !== void 0 ? _b : "";
}
function withModifiers(modifiers, key) {
    const prefix = MODIFIERS.filter(([name]) => modifiers.has(name)).map(([name]) => `${name}+`);
    return prefix.join("") + key;
}
/** "ctrl+shift+Down" -> ["ctrl", "shift"] and "Down"; the key itself may be "+". */
function splitKey(spec) {
    const split = spec.length > 1 ? spec.lastIndexOf("+", spec.length - 2) : -1;
    return {
        modifiers: split < 0 ? [] : spec.slice(0, split).split("+"),
        key: spec.slice(split + 1),
    };
}
/** Canonical form of one key from a binding, or "" when it is not a key. */
function normalizeKey(spec) {
    const { modifiers: parts, key } = splitKey(spec);
    const modifiers = new Set(parts.map((part) => {
        var _a;
        const lower = part.toLowerCase();
        return (_a = MODIFIER_ALIASES[lower]) !== null && _a !== void 0 ? _a : lower;
    }));
    if (key === "" || [...modifiers].some((name) => !MODIFIERS.some(([known]) => known === name))) {
        return "";
    }
    if (key.length > 1) {
        const name = namedKey(key);
        return name === "" ? "" : withModifiers(modifiers, name);
    }
    // Shift on a character is part of the character: "shift+a" is "A".
    const character = modifiers.delete("shift") ? key.toUpperCase() : key;
    return withModifiers(modifiers, character);
}
function isPrintable(text) {
    return text.length === 1 && text > " " && text !== "\u007f";
}
/** The canonical key of a key press, in the same form normalizeKey() gives. */
function keyOfEvent(code, text, modifiers) {
    const held = new Set(MODIFIERS.filter(([, bit]) => (modifiers & bit) !== 0).map(([name]) => name));
    const named = NAME_BY_CODE.get(code);
    if (named !== undefined) {
        return withModifiers(held, named);
    }
    // Ctrl+letter types a control character, so fall back to the key code,
    // which Qt gives as the uppercase letter.
    let character = text;
    if (!isPrintable(character)) {
        if (code <= 0x20 || code >= 0x7f) {
            return "";
        }
        const fromCode = String.fromCharCode(code);
        character = held.has("shift") ? fromCode.toUpperCase() : fromCode.toLowerCase();
    }
    held.delete("shift");
    return withModifiers(held, character);
}
/** The keys of one binding, in canonical form and without repeats. */
function parseBinding(value) {
    if (typeof value !== "string") {
        return [];
    }
    const keys = value.split(/\s+/).map(normalizeKey).filter((key) => key !== "");
    return [...new Set(keys)].slice(0, MAX_KEYS_PER_BINDING);
}
/** Builds the keymap from the "keys" setting; actions left out keep their defaults. */
function parseKeymap(setting) {
    var _a;
    var _b;
    const custom = setting !== null && typeof setting === "object" ? setting : {};
    const keysOf = (binding) => parseBinding(hasKey(custom, binding) ? custom[binding] : DEFAULT_KEYS[binding]);
    const keymap = { actions: {}, favorites: {} };
    for (const binding of Object.keys(DEFAULT_KEYS)) {
        if (binding === "favorites") {
            continue;
        }
        for (const key of keysOf(binding)) {
            // When two actions claim a key, the first one keeps it.
            (_a = (_b = keymap.actions)[key]) !== null && _a !== void 0 ? _a : (_b[key] = binding);
        }
    }
    keysOf("favorites").forEach((key, index) => {
        // An action wins over a favorite slot on the same key.
        if (!hasKey(keymap.actions, key)) {
            keymap.favorites[key] = index;
        }
    });
    return keymap;
}
function lookupKey(keymap, key) {
    if (hasKey(keymap.actions, key)) {
        return { type: "action", action: keymap.actions[key] };
    }
    if (hasKey(keymap.favorites, key)) {
        return { type: "favorite", index: keymap.favorites[key] };
    }
    return { type: "none" };
}
// How keys read in the panel. "Return" is the key everyone calls Enter.
var DISPLAY_NAMES = { Return: "Enter" };
/** The first key bound to an action, written for people: "Ctrl+o", "j", "". */
function keyLabel(keymap, action) {
    var _a, _b;
    const key = (_a = Object.keys(keymap.actions).find((candidate) => keymap.actions[candidate] === action)) !== null && _a !== void 0 ? _a : "";
    const { modifiers, key: name } = splitKey(key);
    const prefix = modifiers.map((modifier) => `${modifier[0].toUpperCase()}${modifier.slice(1)}+`);
    return prefix.join("") + ((_b = DISPLAY_NAMES[name]) !== null && _b !== void 0 ? _b : name);
}
var HINTS = [
    [["down", "up"], "hint.move"],
    [["activate"], "hint.play"],
    [["playPause"], "hint.pause"],
    [["search"], "hint.search"],
    [["toggleFavorite"], "hint.favorite"],
];
/** The hint line at the bottom of the panel; actions without a key are left out. */
function keyHints(keymap) {
    return HINTS
        .map(([actions, label]) => ({
        keys: actions.map((action) => keyLabel(keymap, action)).filter((key) => key !== "").join("/"),
        label,
    }))
        .filter((hint) => hint.keys !== "");
}
/** The key that runs a favorite, written for people, or "". */
function favoriteKeyLabel(keymap, index) {
    var _a;
    const key = (_a = Object.keys(keymap.favorites).find((candidate) => keymap.favorites[candidate] === index)) !== null && _a !== void 0 ? _a : "";
    return key.length === 1 ? key : "";
}

// ---- src/library.ts ----

// The playlist list in the panel: your liked songs on top, then every
// playlist you own or follow, in Spotify's order.
function libraryRows(playlists, showLiked, likedName) {
    const rows = playlists.map((playlist) => ({
        target: playlist.uri,
        name: playlist.name,
        owner: playlist.owner,
        tracks: playlist.tracks,
        liked: false,
    }));
    if (showLiked) {
        rows.unshift({ target: LIKED, name: likedName, owner: "", tracks: -1, liked: true });
    }
    return rows;
}
function findPlaylist(playlists, name) {
    var _a;
    const key = name.trim().toLowerCase();
    if (!key) {
        return null;
    }
    return (_a = playlists.find((playlist) => playlist.uri === name || playlist.name.toLowerCase() === key)) !== null && _a !== void 0 ? _a : null;
}
/**
 * What a favorite, a row or an IPC argument plays. A name becomes the URI of
 * your playlist with that name when it is loaded; spoti looks it up
 * otherwise. LIKED is handled by the caller, since it needs a lookup first.
 */
function playTarget(target, playlists) {
    if (target.startsWith("spotify:")) {
        return { kind: "uri", uri: target };
    }
    const playlist = findPlaylist(playlists, target);
    return playlist ? { kind: "uri", uri: playlist.uri } : { kind: "name", name: target };
}
/** Favorite targets as a set, to mark rows with a star. */
function favoriteTargets(favorites) {
    const targets = {};
    for (const favorite of favorites) {
        targets[favorite.target] = true;
    }
    return targets;
}

// ---- src/overrides.ts ----

// Optimistic state. A change shows up the moment it is asked for and wins
// over what Spotify reports until Spotify has caught up, which can take a
// second or two.
var OVERRIDE_MS = 3500;
function liveState(playback, override, now) {
    var _a, _b, _c, _d, _e;
    const fresh = override !== null && override.until > now ? override : null;
    return {
        playing: (_a = fresh === null || fresh === void 0 ? void 0 : fresh.playing) !== null && _a !== void 0 ? _a : playback.playing,
        volume: (_d = (_b = fresh === null || fresh === void 0 ? void 0 : fresh.volume) !== null && _b !== void 0 ? _b : (_c = playback.device) === null || _c === void 0 ? void 0 : _c.volume) !== null && _d !== void 0 ? _d : -1,
        shuffle: (_e = fresh === null || fresh === void 0 ? void 0 : fresh.shuffle) !== null && _e !== void 0 ? _e : playback.shuffle,
    };
}
function withOverride(override, patch, now) {
    const base = override !== null && override.until > now ? override : { until: 0 };
    return Object.assign(Object.assign(Object.assign({}, base), patch), { until: now + OVERRIDE_MS });
}
/** Volume after a step of delta percent, starting from 50 when unknown. */
function nudgedVolume(volume, delta) {
    const base = volume < 0 ? 50 : volume;
    return Math.max(0, Math.min(100, base + delta));
}
/** Where a track is now, moving the last reported position forward while it plays. */
function progressAt(playback, playing, reportedAt, now) {
    const elapsed = playing ? Math.max(0, now - reportedAt) : 0;
    return Math.min(playback.durationMs, playback.progressMs + elapsed);
}
/** "3:07", or "1:02:03" past an hour. */
function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
/**
 * When to look again: shortly after the track ends while it plays, else the
 * regular interval. Never sooner than a second.
 */
function nextPollMs(playback, playing, progress, interval) {
    if (!playing || playback.durationMs === 0) {
        return interval;
    }
    const remaining = playback.durationMs - progress + 800;
    return Math.max(1000, Math.min(interval, remaining));
}

// ---- src/spoti.ts ----

// Reading what spoti prints: `--json` output, errors on stderr and exit
// codes. See https://github.com/mathisarends/spoti#scripting-and-agents.
var MAX_PLAYLISTS = 1000;
var PAGE_SIZE = 50;
var MAX_DEVICES = 32;
function emptyPlayback() {
    return {
        playing: false,
        title: "",
        artist: "",
        uri: "",
        contextUri: "",
        progressMs: 0,
        durationMs: 0,
        shuffle: false,
        repeat: "off",
        device: null,
    };
}
function count(value) {
    return typeof value === "number" && isFinite(value) && value > 0 ? Math.round(value) : 0;
}
function names(list) {
    if (!Array.isArray(list)) {
        return "";
    }
    return cleanName(list.filter(isRecord).map((artist) => cleanName(artist.name)).filter((name) => name !== "").join(", "));
}
function parseDevice(raw) {
    if (!isRecord(raw)) {
        return null;
    }
    const id = cleanId(raw.id);
    const name = cleanName(raw.name);
    if (!id || !name) {
        return null;
    }
    return {
        id,
        name,
        type: cleanName(raw.type),
        active: raw.is_active === true,
        restricted: raw.is_restricted === true,
        volume: typeof raw.volume_percent === "number" ? clampPercent(raw.volume_percent) : -1,
    };
}
/** `spoti status --json`. Nothing playing comes back as an empty object. */
function parsePlayback(text) {
    const state = parseJson(text);
    const playback = emptyPlayback();
    if (!isRecord(state)) {
        return playback;
    }
    playback.device = parseDevice(state.device);
    playback.shuffle = state.shuffle_state === true;
    playback.repeat = typeof state.repeat_state === "string" && state.repeat_state !== "" ? cleanName(state.repeat_state) : "off";
    if (isRecord(state.context)) {
        playback.contextUri = cleanUri(state.context.uri);
    }
    const item = state.item;
    if (!isRecord(item)) {
        return playback;
    }
    playback.playing = state.is_playing === true;
    playback.title = cleanName(item.name);
    playback.artist = names(item.artists) || (isRecord(item.show) ? cleanName(item.show.name) : "");
    playback.uri = cleanUri(item.uri);
    playback.durationMs = count(item.duration_ms);
    playback.progressMs = Math.min(count(state.progress_ms), playback.durationMs);
    return playback;
}
/** `spoti device list --json`: active first, then by name. */
function parseDevices(text) {
    const list = parseJson(text);
    if (!Array.isArray(list)) {
        return [];
    }
    return list
        .map(parseDevice)
        .filter((device) => device !== null)
        .slice(0, MAX_DEVICES)
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}
function parsePage(text, parse) {
    const page = parseJson(text);
    if (!isRecord(page) || !Array.isArray(page.items)) {
        return { items: [], total: 0 };
    }
    return {
        // Spotify sometimes hands out null entries; they are skipped.
        items: page.items.map(parse).filter((item) => item !== null),
        total: count(page.total),
    };
}
function parsePlaylist(raw) {
    if (!isRecord(raw)) {
        return null;
    }
    const id = cleanId(raw.id);
    const name = cleanName(raw.name);
    const uri = cleanUri(raw.uri) || (id ? cleanUri(`spotify:playlist:${id}`) : "");
    if (!id || !name || !uri) {
        return null;
    }
    return {
        id,
        name,
        uri,
        owner: isRecord(raw.owner) ? cleanName(raw.owner.display_name) : "",
        tracks: isRecord(raw.tracks) ? count(raw.tracks.total) : 0,
    };
}
/** One page of `spoti playlist list --json`. */
function parsePlaylistPage(text) {
    return parsePage(text, parsePlaylist);
}
/** One page of `spoti library list tracks --json`, as track URIs. */
function parseTrackUris(text) {
    return parsePage(text, (raw) => (isRecord(raw) ? cleanUri(raw.uri) || null : null)).items;
}
/** The offset of the page after the one at `offset`, or -1 when that was the last one wanted. */
function nextOffset(offset, pageSize, total, cap) {
    const next = offset + pageSize;
    return next < total && next < cap ? next : -1;
}
/** A sentence for a failed command: spoti's own words, or a friendlier one for the usual reasons. */
function errorText(error, messages) {
    return messages[error.reason] || error.message || messages.generic || "";
}
/** Adds a page, skipping playlists already there (Spotify may shift items between pages). */
function mergePlaylists(loaded, page) {
    const seen = new Set(loaded.map((playlist) => playlist.id));
    return loaded.concat(page.filter((playlist) => !seen.has(playlist.id))).slice(0, MAX_PLAYLISTS);
}
// spoti's exit codes. 127 comes from the launcher when the binary is missing.
var EXIT_STATUS = {
    0: "ok",
    3: "notConfigured",
    4: "unreachable",
    127: "missing",
};
function statusForExit(code) {
    var _a;
    return (_a = EXIT_STATUS[code]) !== null && _a !== void 0 ? _a : "error";
}
/**
 * spoti prints `{"ok": false, "error": {...}}` on stderr with --json, and
 * `error: <message>` without; anything else falls back to the last line.
 */
function parseError(stderr) {
    var _a;
    const lines = stderr.split("\n").map((line) => line.trim()).filter((line) => line !== "");
    for (const line of lines.slice().reverse()) {
        const value = parseJson(line);
        if (isRecord(value) && isRecord(value.error)) {
            return { reason: cleanName(value.error.reason), message: cleanName(value.error.message) };
        }
    }
    const last = (_a = lines[lines.length - 1]) !== null && _a !== void 0 ? _a : "";
    return { reason: "", message: cleanName(last.replace(/^error:\s*/, "")) };
}

// ---- src/text.ts ----

// Short text for the bar and the tooltip.
/** "Title — Artist", or just the title. */
function trackLine(title, artist) {
    return artist ? `${title} — ${artist}` : title;
}
/** At most `max` characters, with an ellipsis when cut. */
function shorten(text, max) {
    const chars = Array.from(text);
    return chars.length > max ? chars.slice(0, Math.max(1, max - 1)).join("").replace(/\s+$/, "") + "…" : text;
}
