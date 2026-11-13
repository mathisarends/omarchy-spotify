// Searching your playlists as you type. Every word of the query has to
// appear in the name; names that start with the query come first.

export const MAX_QUERY = 64

/** Lowercase, without accents, so "cafe" finds "Café". */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

function rank(name: string, query: string, words: string[]): number {
  if (name.startsWith(query)) {
    return 0
  }
  const starts = words.every((word) => name.startsWith(word) || name.includes(" " + word))
  return starts ? 1 : 2
}

/** The items whose name matches, best first; the order of equals is kept. */
export function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
  const folded = foldText(query.trim()).slice(0, MAX_QUERY)
  if (folded === "") {
    return items
  }
  const words = folded.split(/\s+/)
  return items
    .map((item, index) => ({ item, index, name: foldText(item.name) }))
    .filter((entry) => words.every((word) => entry.name.includes(word)))
    .map((entry) => ({ ...entry, rank: rank(entry.name, folded, words) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item)
}
