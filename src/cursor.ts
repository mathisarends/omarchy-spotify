// The panel's cursor, shared by keyboard and mouse. Each place it can stop
// has an id:
//
//   status:<i>     a setup button while spoti is not connected
//   transport:<i>  previous, play/pause, next, shuffle
//   volume         the volume slider
//   device         the "playing on" row; opens the device list
//   dev:<i>        a device in the open list
//   speaker        "set up this computer" when the open list is empty
//   pl:<i>         a row of the (filtered) playlist list

export type StopType = "status" | "transport" | "volume" | "device" | "dev" | "speaker" | "pl" | ""

export interface Stop {
  type: StopType
  index: number
}

export const TRANSPORT = ["previous", "playPause", "next", "shuffle"] as const

export interface PanelLayout {
  connected: boolean
  statusActions: number
  devicesOpen: boolean
  devices: number
  playlists: number
}

function range(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}:${i}`)
}

function deviceStops(layout: PanelLayout): string[] {
  if (!layout.devicesOpen) {
    return []
  }
  return layout.devices > 0 ? range("dev", layout.devices) : ["speaker"]
}

/** Every stop, top to bottom. */
export function cursorStops(layout: PanelLayout): string[] {
  if (!layout.connected) {
    return range("status", layout.statusActions)
  }
  return [
    ...range("transport", TRANSPORT.length),
    "volume",
    "device",
    ...deviceStops(layout),
    ...range("pl", layout.playlists),
  ]
}

export function parseStop(stop: string): Stop {
  const [type, index] = stop.split(":")
  switch (type) {
    case "status":
    case "transport":
    case "dev":
    case "pl":
      return { type, index: Number(index) }
    case "volume":
    case "device":
    case "speaker":
      return { type, index: -1 }
    default:
      return { type: "", index: -1 }
  }
}

/** Keeps the cursor where it was; else the nearest stop of the same kind, then the top. */
export function clampStop(stops: string[], current: string): string {
  if (stops.includes(current)) {
    return current
  }
  const { type, index } = parseStop(current)
  const sameKind = stops.filter((stop) => parseStop(stop).type === type)
  if (sameKind.length > 0 && index >= 0) {
    return sameKind[Math.min(index, sameKind.length - 1)]
  }
  if (type === "dev" || type === "speaker") {
    return "device"
  }
  return stops[0] ?? ""
}

/** j/k: one stop down or up, stopping at the ends. `within` keeps it to one kind. */
export function stepStop(stops: string[], current: string, delta: number, within: StopType | "" = ""): string {
  const list = within ? stops.filter((stop) => parseStop(stop).type === within) : stops
  const index = list.indexOf(current)
  if (index < 0) {
    return list[0] ?? current
  }
  return list[Math.max(0, Math.min(list.length - 1, index + delta))]
}

/** h/l along a row of buttons (transport, setup); stays put at the ends. */
export function sideStop(stops: string[], current: string, delta: number): string {
  const { type, index } = parseStop(current)
  if (type !== "transport" && type !== "status") {
    return current
  }
  const next = `${type}:${index + delta}`
  return stops.includes(next) ? next : current
}
