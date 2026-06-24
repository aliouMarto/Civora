export interface TextChunk {
  content: string;
  index: number;
}

/** Découpe un texte en chunks de ~chunkSize caractères avec chevauchement. */
export function chunkText(
  text: string,
  chunkSize = 512,
  overlap = 64,
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push({ content: text.slice(start, end).trim(), index: index++ });
    if (end === text.length) break;
    start = end - overlap;
  }

  return chunks.filter((c) => c.content.length > 0);
}
