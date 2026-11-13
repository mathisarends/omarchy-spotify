// Building spoti command lines and queueing them.

// Runs spoti through sh so a missing binary exits 127 instead of failing to
// spawn, which Process reports without an exit code. Arguments travel as
// positional parameters and are never parsed by the shell.
//
// A bare name is also looked up in ~/.local/bin (where install.sh puts it) and
// the Go bin directory, because the shell may start with a shorter PATH than
// your terminal.
export const LAUNCH = [
  'case "$0" in */*) ;; *)',
  '  command -v "$0" >/dev/null 2>&1 ||',
  '  for dir in "$HOME/.local/bin" "${GOBIN:-${GOPATH:-$HOME/go}/bin}"; do',
  '    if [ -x "$dir/$0" ]; then exec "$dir/$0" "$@"; fi',
  '  done ;;',
  'esac',
  'command -v "$0" >/dev/null 2>&1 || exit 127',
  'exec "$0" "$@"',
].join("\n")

/** Pause between two commands, so a burst of keys never trips Spotify's rate limit. */
export const COMMAND_GAP_MS = 120
/** How many liked songs "Liked Songs" plays: one page, newest first. */
export const LIKED_LIMIT = 50

export interface Command {
  /** Commands with the same key replace each other while they wait. */
  key: string
  args: string[]
}

/** What a playlist row or an IPC call plays. */
export type PlayTarget =
  | { kind: "uri"; uri: string }
  | { kind: "uris"; uris: string[] }
  | { kind: "name"; name: string }

/** `--device <name>` when one is given. */
export function deviceFlag(device: string): string[] {
  return device ? ["--device", device] : []
}

export function statusArgs(): string[] {
  return ["status", "--json"]
}

export function devicesArgs(): string[] {
  return ["device", "list", "--json"]
}

export function playlistPageArgs(offset: number, limit: number): string[] {
  return ["playlist", "list", "--limit", String(limit), "--offset", String(offset), "--json"]
}

export function likedArgs(): string[] {
  return ["library", "list", "tracks", "--limit", String(LIKED_LIMIT), "--json"]
}

/** Starts a target; `device` is only needed when nothing is active yet. */
export function playArgs(target: PlayTarget, device: string, shuffle: boolean): string[] {
  const extra = [...deviceFlag(device), ...(shuffle ? ["--shuffle"] : []), "--json"]
  switch (target.kind) {
    case "uri":
      return ["play", ...extra, "--", target.uri]
    case "uris":
      return ["play", ...extra, "--", ...target.uris]
    case "name":
      // spoti plays your own playlist with this exact name first, else the
      // top playlist in the catalog.
      return ["play", "--type", "playlist", ...extra, "--", target.name]
  }
}

export function resumeArgs(device: string): string[] {
  return ["play", ...deviceFlag(device), "--json"]
}

export function pauseArgs(): string[] {
  return ["pause", "--json"]
}

export function skipArgs(forward: boolean): string[] {
  return [forward ? "next" : "prev", "--json"]
}

export function volumeArgs(percent: number): string[] {
  return ["volume", String(Math.max(0, Math.min(100, Math.round(percent)))), "--json"]
}

export function shuffleArgs(on: boolean): string[] {
  return ["shuffle", on ? "on" : "off", "--json"]
}

/** `device` is an id, a name, or a unique part of a name. */
export function transferArgs(device: string, play: boolean): string[] {
  return ["device", "transfer", ...(play ? [] : ["--no-play"]), "--json", "--", device]
}

/** Adds a command; a waiting command with the same key is replaced in place. */
export function enqueue(queue: Command[], command: Command): Command[] {
  const index = command.key ? queue.findIndex((queued) => queued.key === command.key) : -1
  if (index < 0) {
    return [...queue, command]
  }
  const next = queue.slice()
  next[index] = command
  return next
}
