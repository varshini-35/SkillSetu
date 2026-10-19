export const ALLOWED_EVIDENCE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm',
]);
export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

export function evidenceFileError(file: Pick<File, 'type' | 'size'>): string | null {
  if (!ALLOWED_EVIDENCE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) {
    return 'Choose a supported file no larger than 8 MB.';
  }
  return null;
}

export async function evidenceBytesBase64(file: Pick<File, 'arrayBuffer'>): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
