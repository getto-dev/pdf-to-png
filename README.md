# PDF to PNG

A privacy-first Progressive Web App for converting PDF pages into PNG images. Files are processed locally in the browser; there is no upload API or application backend.

## Features in this MVP

- Select or drag-and-drop a local PDF
- Page count, file size, and first six page previews
- Render quality options: 1×, 2×, or 3×
- Select every page or a page list/range (e.g. `1-3,5,8-10`)
- Sequential page conversion with progress and cancellation
- Download individual PNGs or all output as a ZIP archive
- PWA manifest, service worker, and offline precaching
- Responsive interface for desktop and mobile
- Russian interface by default, with an English/Russian language switch; preference is remembered on the device

## Requirements

- Node.js 20.19+
- npm 10+

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run typecheck
npm run build
npm run preview
```

The static production build is output to `dist/`. Deploy it on any static host that supports HTTPS. To install the PWA, open the deployed site in a supported browser and use its Install app / Add to Home Screen option.

## Privacy

PDF bytes are read from the selected local file and passed to PDF.js in the browser. Converted PNG blobs and ZIP archives are generated locally. This application does not send files to an API or store them in a remote service. The interface uses system fonts and the PDF.js worker is bundled with the app, so core conversion does not need a third-party service. After the PWA assets are cached, the app shell can also load offline.

## Notes

- Larger output scales create larger images and use more memory. Very large pages may exceed browser canvas limits.
- Password-protected and damaged PDFs may not open.
- ZIP compression is set to `STORE`, because PNG is already compressed and recompressing it would waste CPU time.

## Main dependencies

- [PDF.js](https://github.com/mozilla/pdf.js) — PDF page rendering
- [JSZip](https://stuk.github.io/jszip/) — local ZIP archives
- [Vite](https://vite.dev/) + React + TypeScript
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) — PWA manifest and service worker
