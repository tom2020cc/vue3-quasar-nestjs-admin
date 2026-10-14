// Reserve original names first so a generated suffix never takes another file's title.
export function uniqueTitles(titles: string[]): string[] {
  const key = (s: string) => s.normalize('NFKC').trim().toLowerCase()
  const reserved = new Set(titles.map(key)), used = new Set<string>()
  return titles.map(original => {
    const base = original.trim()
    let title = base, number = 1
    if (used.has(key(title))) {
      do {
        const suffix = `_${number++}`
        title = base.slice(0, Math.max(1, 100 - suffix.length)) + suffix
      } while (used.has(key(title)) || reserved.has(key(title)))
    }
    used.add(key(title))
    return title
  })
}
