/** Deterministic pastel assignment: same subject always wears the same color. */
const palettes = ['green', 'yellow', 'purple', 'pink', 'sky'] as const;

export type Palette = (typeof palettes)[number];

export function paletteFor(key: string): Palette {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return palettes[hash % palettes.length];
}
