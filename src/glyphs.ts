// Material Design icons from the Nerd Font, spelled as code points so no
// editor or patch tool can strip them.

export const Glyph = {
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
}

export function volumeGlyph(volume: number): string {
  if (volume === 0) {
    return Glyph.volumeOff
  }
  if (volume < 0 || volume > 66) {
    return Glyph.volumeHigh
  }
  return volume > 33 ? Glyph.volumeMedium : Glyph.volumeLow
}

/** An icon for Spotify's device types. */
export function deviceGlyph(type: string): string {
  switch (type.toLowerCase()) {
    case "smartphone":
    case "tablet":
      return Glyph.phone
    case "computer":
      return Glyph.computer
    case "tv":
    case "castvideo":
    case "stb":
      return Glyph.tv
    default:
      return Glyph.speaker
  }
}
