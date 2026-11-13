// Short text for the bar and the tooltip.

/** "Title — Artist", or just the title. */
export function trackLine(title: string, artist: string): string {
  return artist ? `${title} — ${artist}` : title
}

/** At most `max` characters, with an ellipsis when cut. */
export function shorten(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length > max ? chars.slice(0, Math.max(1, max - 1)).join("").replace(/\s+$/, "") + "…" : text
}
