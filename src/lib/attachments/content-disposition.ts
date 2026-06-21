/**
 * Content-Disposition RFC 6266 / 5987 para nombres con espacios, tildes o varios puntos.
 */
export function buildContentDisposition(
  disposition: 'inline' | 'attachment',
  filename: string
): string {
  const normalized = filename.normalize('NFC').trim() || 'archivo';
  const asciiFallback =
    normalized
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_')
      .slice(0, 200) || 'archivo';
  const utf8Encoded = encodeURIComponent(normalized);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}
