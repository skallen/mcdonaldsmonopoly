export const MAX_SCAN_BYTES = 5 * 1024 * 1024;
export function detectScanType(data) {
  if (!Buffer.isBuffer(data) || data.length === 0 || data.length > MAX_SCAN_BYTES) return null;
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
