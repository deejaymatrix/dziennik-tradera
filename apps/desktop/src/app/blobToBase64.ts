/** Koduje Blob/File jako base64 (bez prefiksu "data:...;base64,") - używane do przesłania
 * bajtów obrazu (wklejenie ze schowka, upuszczenie pliku) przez IPC do komendy Tauri, która
 * przyjmuje `bytes_base64: String`. `readAsDataURL` robi kodowanie/chunkowanie za nas. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(",");
      resolve(result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Nie można odczytać pliku."));
    reader.readAsDataURL(blob);
  });
}
