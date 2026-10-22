import JSZip from 'jszip';

export interface PngResult {
  pageNumber: number;
  blob: Blob;
  width: number;
  height: number;
}

export async function makeZip(results: PngResult[], baseName: string): Promise<Blob> {
  const zip = new JSZip();
  for (const result of results) {
    const page = String(result.pageNumber).padStart(3, '0');
    zip.file(baseName + '-page-' + page + '.png', result.blob);
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function safeFilename(input: string): string {
  const base = input.replace(/\.pdf$/i, '').normalize('NFKC')
    .replace(/[^a-zA-Zа-яА-ЯёЁ0-9._-]+/g, '_').replace(/^[_ .]+|[_ .]+$/g, '');
  return base.slice(0, 80) || 'pdf-export';
}
