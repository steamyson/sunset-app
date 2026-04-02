export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  // Process in chunks of 1024 for better JIT optimization
  const chunkSize = 1024;
  for (let offset = 0; offset < len; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, len);
    for (let i = offset; i < end; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  }
  return bytes.buffer;
}
