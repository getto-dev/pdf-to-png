import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return pdfjsLib.getDocument({ data: bytes }).promise;
}

export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Your browser could not create a canvas for this image.');

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport, background: '#fff' }).promise;
  page.cleanup();
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create the PNG. Try a lower image quality setting.'));
    }, 'image/png');
  });
}

export function parsePageRange(input: string, pageCount: number): number[] {
  const value = input.trim().toLowerCase();
  if (!value || value === 'all') return Array.from({ length: pageCount }, (_, index) => index + 1);
  const selected = new Set<number>();
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Enter pages like 1-3,5.');
  for (const part of parts) {
    const match = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error('Could not parse "' + part + '". Use a format such as 1-3,5.');
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end < start || end > pageCount) {
      throw new Error('Page range "' + part + '" is outside this document (1-' + pageCount + ').');
    }
    for (let page = start; page <= end; page += 1) selected.add(page);
  }
  return [...selected].sort((a, b) => a - b);
}
