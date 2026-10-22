import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  ArrowDownToLine, CheckCircle2, FileImage, FileText, HardDrive, Image as ImageIcon,
  LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, Upload, X, Zap,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { canvasToPng, openPdf, parsePageRange, renderPageToCanvas } from './services/pdfService';
import { downloadBlob, makeZip, safeFilename } from './services/zipExportService';
import type { PngResult } from './services/zipExportService';

type Thumbnail = { pageNumber: number; dataUrl: string };
type Stage = 'empty' | 'loading' | 'ready' | 'converting' | 'done';
type Language = 'ru' | 'en';

function translate(language: Language, russian: string, english: string): string {
  return language === 'ru' ? russian : english;
}

function formatPageCount(count: number, language: Language): string {
  if (language === 'en') return count + ' ' + (count === 1 ? 'page' : 'pages');
  const lastTwo = count % 100;
  const last = count % 10;
  const word = last === 1 && lastTwo !== 11 ? 'страница'
    : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'страницы' : 'страниц';
  return count + ' ' + word;
}

function formatImageCount(count: number, language: Language): string {
  if (language === 'en') return count + ' ' + (count === 1 ? 'image' : 'images');
  const lastTwo = count % 100;
  const last = count % 10;
  const word = last === 1 && lastTwo !== 11 ? 'изображение'
    : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'изображения' : 'изображений';
  return count + ' ' + word;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const sequenceRef = useRef(0);
  const cancelRef = useRef(false);
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return window.localStorage.getItem('pdf-to-png-language') === 'en' ? 'en' : 'ru';
    } catch {
      return 'ru';
    }
  });
  const t = (russian: string, english: string) => translate(language, russian, english);
  const [stage, setStage] = useState<Stage>('empty');
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [thumbs, setThumbs] = useState<Thumbnail[]>([]);
  const [quality, setQuality] = useState(2);
  const [range, setRange] = useState('all');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<PngResult[]>([]);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t('PDF в PNG — конвертер PDF в изображения', 'PDF to PNG — Private PDF converter');
    try {
      window.localStorage.setItem('pdf-to-png-language', language);
    } catch {
      // The language preference is optional; the app still works without storage.
    }
  }, [language]);

  useEffect(() => () => {
    sequenceRef.current += 1;
    cancelRef.current = true;
    if (pdfRef.current) void pdfRef.current.destroy().catch(() => undefined);
  }, []);

  const resetResults = () => {
    setResults([]);
    setProgress(0);
    setStatus('');
  };

  const loadFile = async (nextFile?: File) => {
    if (!nextFile) return;
    const requestId = ++sequenceRef.current;
    if (nextFile.type !== 'application/pdf' && !nextFile.name.toLowerCase().endsWith('.pdf')) {
      setError(t('Выберите файл PDF.', 'Please choose a PDF file.'));
      return;
    }
    if (!nextFile.size) {
      setError(t('Этот файл пустой. Выберите другой PDF.', 'This file is empty. Please choose another PDF.'));
      return;
    }
    cancelRef.current = true;
    if (pdfRef.current) void pdfRef.current.destroy().catch(() => undefined);
    pdfRef.current = null;
    setError('');
    setFile(nextFile);
    setPageCount(0);
    setThumbs([]);
    setRange('all');
    resetResults();
    setStage('loading');

    try {
      const pdf = await openPdf(nextFile);
      if (requestId !== sequenceRef.current) {
        await pdf.destroy();
        return;
      }
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
      const canvas = canvasRef.current || document.createElement('canvas');
      const thumbnails: Thumbnail[] = [];
      for (let n = 1; n <= Math.min(pdf.numPages, 6); n += 1) {
        if (requestId !== sequenceRef.current) return;
        await renderPageToCanvas(pdf, n, 0.28, canvas);
        thumbnails.push({ pageNumber: n, dataUrl: canvas.toDataURL('image/jpeg', 0.76) });
        setThumbs([...thumbnails]);
      }
      canvas.width = 1;
      canvas.height = 1;
      if (requestId === sequenceRef.current) setStage('ready');
    } catch (caught) {
      if (requestId !== sequenceRef.current) return;
      const message = caught instanceof Error ? caught.message : t('Не удалось прочитать PDF.', 'Unable to read this PDF.');
      setError(message.toLowerCase().includes('password')
        ? t('PDF защищён паролем. Снимите защиту и повторите попытку.', 'This PDF is password-protected. Remove the password protection and try again.')
        : language === 'ru'
          ? 'Не удалось открыть PDF. Возможно, файл повреждён или защищён паролем.'
          : 'Could not open this PDF. It may be damaged or password-protected. ' + message);
      setStage('empty');
      setFile(null);
      setPageCount(0);
      if (pdfRef.current) void pdfRef.current.destroy().catch(() => undefined);
      pdfRef.current = null;
    }
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    void loadFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    void loadFile(event.dataTransfer.files?.[0]);
  };

  const convert = async () => {
    const pdf = pdfRef.current;
    if (!pdf || !file || stage === 'converting') return;
    let pages: number[];
    try {
      pages = parsePageRange(range, pageCount);
    } catch (caught) {
      setError(language === 'ru' ? 'Не удалось разобрать диапазон страниц. Используйте формат 1-3, 5, 8-10.' : (caught instanceof Error ? caught.message : 'Check the selected page range.'));
      return;
    }
    setError('');
    cancelRef.current = false;
    setResults([]);
    setProgress(0);
    setStatus(t('Подготовка страниц…', 'Preparing pages…'));
    setStage('converting');
    const output: PngResult[] = [];
    const canvas = canvasRef.current || document.createElement('canvas');

    try {
      for (let i = 0; i < pages.length; i += 1) {
        if (cancelRef.current) break;
        const number = pages[i];
        setStatus(t('Страница ', 'Rendering page ') + number + t(' из ', ' of ') + pageCount);
        await renderPageToCanvas(pdf, number, quality, canvas);
        const blob = await canvasToPng(canvas);
        output.push({ pageNumber: number, blob, width: canvas.width, height: canvas.height });
        setResults([...output]);
        setProgress(Math.round(((i + 1) / pages.length) * 100));
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      if (cancelRef.current) setStatus(t('Конвертация отменена. Готово страниц: ', 'Cancelled · ') + output.length + t('', ' page(s) exported'));
      else setStatus(t('Готово: ', 'All done · ') + formatImageCount(output.length, language) + t(' готово', ' ready'));
      setStage(output.length ? 'done' : 'ready');
    } catch (caught) {
      setError(language === 'en' && caught instanceof Error
        ? caught.message
        : t('Не удалось преобразовать PDF. Проверьте файл и повторите попытку.', 'Unable to convert this PDF. Check the file and try again.'));
      setResults(output);
      setStage(output.length ? 'done' : 'ready');
    } finally {
      canvas.width = 1;
      canvas.height = 1;
      cancelRef.current = false;
    }
  };

  const startOver = () => {
    sequenceRef.current += 1;
    cancelRef.current = true;
    if (pdfRef.current) void pdfRef.current.destroy().catch(() => undefined);
    pdfRef.current = null;
    setFile(null);
    setPageCount(0);
    setThumbs([]);
    setRange('all');
    setStage('empty');
    setError('');
    resetResults();
  };

  const downloadOne = (result: PngResult) => {
    const name = safeFilename(file?.name || 'pdf-export');
    const page = String(result.pageNumber).padStart(3, '0');
    downloadBlob(result.blob, name + '-page-' + page + '.png');
  };

  const downloadZip = async () => {
    if (!results.length || zipBusy) return;
    setZipBusy(true);
    setError('');
    try {
      const zip = await makeZip(results, safeFilename(file?.name || 'pdf-export'));
      downloadBlob(zip, safeFilename(file?.name || 'pdf-export') + '-png.zip');
    } catch (caught) {
      setError(language === 'en' && caught instanceof Error
        ? caught.message
        : t('Не удалось создать ZIP-архив.', 'Could not create ZIP archive.'));
    } finally {
      setZipBusy(false);
    }
  };

  const ready = stage === 'ready' || stage === 'done';
  const busy = stage === 'loading' || stage === 'converting';

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label={t('На главную PDF в PNG', 'PDF to PNG home')}>
          <span className="brand-mark"><FileImage size={22} /></span>
          <span className="brand-name">pdf<span>to</span>png</span>
        </a>
        <div className="topbar-actions">
          <div className="language-switch" role="group" aria-label={t('Язык интерфейса', 'Interface language')}>
            <button type="button" className={language === 'ru' ? 'active' : ''} aria-pressed={language === 'ru'} onClick={() => setLanguage('ru')}>RU</button>
            <button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          </div>
          <span className="privacy-pill"><ShieldCheck size={15} /> {t('Файлы остаются на устройстве', 'Files stay on your device')}</span>
        </div>
      </header>

      <main id="top" className="main-content">
        <section className="hero">
          <div className="eyebrow"><Sparkles size={14} /> {t('КОНВЕРТЕР PDF В PNG', 'FREE PDF CONVERTER')}</div>
          <h1>{t('Каждая страница.', 'Every page.')}<br /><span>{t('Сохранена идеально.', 'Perfectly captured.')}</span></h1>
          <p className="hero-copy">{t('Преобразуйте страницы PDF в чёткие PNG за секунды. Конфиденциально: без загрузки файлов на сервер и ожидания.', 'Turn PDF pages into crisp PNG images in seconds. Private by design, with no uploads and no waiting.')}</p>
          <div className="hero-benefits">
            <span><LockKeyhole size={15} /> {t('100% конфиденциально', '100% private')}</span>
            <span><Zap size={15} /> {t('Быстрая конвертация', 'Fast conversion')}</span>
            <span><HardDrive size={15} /> {t('Работает офлайн', 'Works offline')}</span>
          </div>
        </section>

        <section className={'workspace ' + (file ? 'has-file' : '')} aria-label={t('Рабочая область конвертации PDF', 'PDF conversion workspace')}>
          {!file && (
            <div
              className={'dropzone ' + (dragOver ? 'is-dragover' : '')}
              onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}
            >
              <div className="upload-art"><span className="upload-circle"><Upload size={27} /></span><span className="upload-spark one">✦</span><span className="upload-spark two">✧</span></div>
              <h2>{t('Перетащите PDF сюда', 'Drop your PDF here')}</h2>
              <p>{t('или выберите файл на устройстве', 'or click to browse files on your device')}</p>
              <button className="primary-button choose-button" type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}><Upload size={16} /> {t('Выбрать PDF', 'Choose PDF file')} <span>→</span></button>
              <div className="dropzone-foot"><span><ShieldCheck size={13} /> {t('Конфиденциально', 'Private & secure')}</span><i /> <span>{t('Только PDF', 'PDF files only')}</span><i /> <span>{t('Без ограничений сервера', 'No file-size upload limit')}</span></div>
            </div>
          )}

          {file && (
            <>
              <div className="file-header">
                <div className="file-icon"><FileText size={21} /></div>
                <div className="file-copy"><strong title={file.name}>{file.name}</strong><span>{formatBytes(file.size)} <i /> {pageCount ? formatPageCount(pageCount, language) : t('Читаем документ…', 'Reading document…')}</span></div>
                <div className="file-badge"><CheckCircle2 size={14} /> {t('Локальный файл', 'Local file')}</div>
                <button className="icon-button" aria-label={t('Выбрать другой PDF', 'Choose another PDF')} title={t('Выбрать другой PDF', 'Choose another PDF')} onClick={startOver}><X size={17} /></button>
              </div>

              {stage === 'loading' && <div className="loading-state"><LoaderCircle size={28} className="spin" /><strong>{t('Читаем PDF…', 'Reading your PDF…')}</strong><span>{t('Готовим предпросмотр страниц на устройстве', 'Preparing page previews locally')}</span></div>}

              {ready && (
                <div className="workspace-grid">
                  <section className="preview-section">
                    <div className="section-heading"><div><h2>{t('Предпросмотр документа', 'Document preview')}</h2><p>{t('Страниц в документе: ', 'Pages detected: ')}{pageCount}</p></div><span className="soft-badge"><CheckCircle2 size={13} /> {t('Готово', 'Ready')}</span></div>
                    <div className="thumbnail-grid">
                      {thumbs.map((thumb) => (
                        <div className="thumbnail-card" key={thumb.pageNumber}>
                          <div className="thumbnail-image"><img src={thumb.dataUrl} alt={t('Предпросмотр страницы ', 'Preview of page ') + thumb.pageNumber} /></div>
                          <span>{t('Страница ', 'Page ')}{thumb.pageNumber}</span>
                        </div>
                      ))}
                      {pageCount > thumbs.length && <div className="more-pages"><strong>+{pageCount - thumbs.length}</strong><span>{t('ещё страниц', 'more pages')}</span></div>}
                    </div>
                    <button className="text-button" type="button" onClick={() => inputRef.current?.click()}><RefreshCw size={13} /> {t('Заменить PDF', 'Replace PDF')}</button>
                  </section>
                  <aside className="settings-panel">
                    <div className="section-heading"><div><h2>{t('Настройки экспорта', 'Export settings')}</h2><p>{t('Настройте результат', 'Customize your output')}</p></div><span className="settings-glyph"><ImageIcon size={16} /></span></div>
                    <div className="setting-group">
                      <div className="setting-title"><label>{t('Качество изображения', 'Image quality')}</label><span>{t('Выше качество — больше файл', 'Higher = larger file')}</span></div>
                      <div className="quality-options">
                        {[{ value: 1, title: t('Стандарт', 'Standard'), desc: '1×' }, { value: 2, title: t('Высокое', 'High'), desc: '2×' }, { value: 3, title: t('Максимум', 'Ultra'), desc: '3×' }].map((option) => (
                          <button type="button" key={option.value} className={'quality-option ' + (quality === option.value ? 'selected' : '')} onClick={() => setQuality(option.value)}>
                            <span className="quality-check">{quality === option.value ? '✓' : ''}</span><strong>{option.title}</strong><small>{option.desc}</small>
                          </button>
                        ))}
                      </div>
                      <p className="setting-hint">{t('Для большинства документов рекомендуем «Высокое». Максимальное качество создаёт файлы большего размера и использует больше памяти.', 'High is recommended for most documents. Ultra creates larger images and uses more memory.')}</p>
                    </div>
                    <div className="setting-group">
                      <div className="setting-title"><label htmlFor="page-range">{t('Страницы для конвертации', 'Pages to convert')}</label><span>{range.toLowerCase() === 'all' ? t('Все страницы', 'All pages') : t('Выбранный диапазон', 'Custom range')}</span></div>
                      <div className="range-input-wrap"><input id="page-range" value={range === 'all' ? t('все', 'all') : range} onChange={(event) => { const value = event.target.value; setRange(language === 'ru' && /^(все|все страницы)$/i.test(value.trim()) ? 'all' : value); }} placeholder={t('все или 1-3, 5, 8-10', 'all or 1-3, 5, 8-10')} /><span>#</span></div>
                      <div className="range-chips"><button className={range.toLowerCase() === 'all' ? 'active' : ''} type="button" onClick={() => setRange('all')}>{t('Все страницы', 'All pages')}</button><button type="button" onClick={() => setRange('1')}>{t('Первая', 'First page')}</button><button type="button" onClick={() => setRange(pageCount > 1 ? '1-' + Math.min(3, pageCount) : '1')}>{t('Первые 3', 'First 3')}</button></div>
                    </div>
                    <button className="primary-button convert-button" type="button" disabled={!ready} onClick={() => void convert()}><ImageIcon size={17} />{t('Конвертировать в PNG', 'Convert to PNG')} <span>→</span></button>
                    <div className="local-note"><ShieldCheck size={16} /><span><strong>{t('Полная конфиденциальность.', '100% private.')}</strong> {t('PDF обрабатывается на вашем устройстве и никуда не загружается.', 'Your PDF is processed on this device and is never uploaded.')}</span></div>
                  </aside>
                </div>
              )}
            </>
          )}

          {stage === 'converting' && (
            <div className="conversion-progress">
              <div className="progress-top"><span className="progress-icon"><ImageIcon size={18} /></span><div><strong>{t('Конвертируем PDF', 'Converting your PDF')}</strong><span>{status}</span></div><b>{progress}%</b></div>
              <div className="progress-track"><div className="progress-fill" style={{ width: progress + '%' }} /></div>
              <button className="text-button cancel-button" type="button" onClick={() => { cancelRef.current = true; setStatus(t('Отмена после текущей страницы…', 'Cancelling after the current page…')); }}>{t('Отменить конвертацию', 'Cancel conversion')}</button>
            </div>
          )}

          {stage === 'done' && results.length > 0 && (
            <section className="results-panel">
              <div className="results-heading"><span className="success-icon"><CheckCircle2 size={22} /></span><div><h2>{t('PNG-файлы готовы', 'Your PNGs are ready')}</h2><p>{formatImageCount(results.length, language)} · {t('файлы остаются на устройстве', 'all files stay on your device')}</p></div></div>
              <div className="result-toolbar"><button className="primary-button zip-button" type="button" disabled={zipBusy} onClick={() => void downloadZip()}>{zipBusy ? <LoaderCircle size={15} className="spin" /> : <ArrowDownToLine size={15} />} {zipBusy ? t('Создаём ZIP…', 'Preparing ZIP…') : t('Скачать всё архивом ZIP', 'Download all as ZIP')}</button><span>{t('или скачайте отдельные страницы ниже', 'or download individual pages below')}</span></div>
              <div className="result-list">{results.map((result) => (
                <div className="result-row" key={result.pageNumber}><span className="result-thumb"><ImageIcon size={17} /></span><div className="result-info"><strong>{safeFilename(file?.name || 'pdf-export')}-page-{String(result.pageNumber).padStart(3, '0')}.png</strong><span>{result.width.toLocaleString()} × {result.height.toLocaleString()} px · {t('изображение PNG', 'PNG image')}</span></div><button className="icon-button download-one" type="button" title={t('Скачать PNG', 'Download PNG')} aria-label={t('Скачать страницу ', 'Download page ') + result.pageNumber} onClick={() => downloadOne(result)}><ArrowDownToLine size={16} /></button></div>
              ))}</div>
              <button className="text-button start-over-button" type="button" onClick={startOver}><RefreshCw size={13} /> {t('Конвертировать другой PDF', 'Convert another PDF')}</button>
            </section>
          )}

          {error && <div className="error-banner" role="alert"><span>ⓘ</span><span>{error}</span><button type="button" aria-label={t('Закрыть сообщение об ошибке', 'Dismiss error')} onClick={() => setError('')}><X size={15} /></button></div>}
          {busy && stage === 'loading' && <p className="loading-footnote">{t('Большой PDF может обрабатываться дольше. Всё выполняется локально в браузере.', 'Large PDF files may take a moment. Everything runs locally in your browser.')}</p>}
        </section>

        {!file && (
          <section className="how-it-works">
            <div className="section-kicker">{t('КАК ЭТО РАБОТАЕТ', 'HOW IT WORKS')}</div><h2>{t('Из PDF в PNG за 3 простых шага', 'From PDF to PNG in 3 simple steps')}</h2>
            <div className="steps-grid">
              <article className="step-card"><span className="step-number">01</span><span className="step-icon purple"><Upload size={19} /></span><h3>{t('Загрузите PDF', 'Upload your PDF')}</h3><p>{t('Выберите файл или перетащите его в рабочую область. Он останется на вашем устройстве.', 'Choose a file or drag it into the workspace. It stays on your device.')}</p></article>
              <article className="step-card"><span className="step-number">02</span><span className="step-icon orange"><ImageIcon size={19} /></span><h3>{t('Настройте экспорт', 'Choose your settings')}</h3><p>{t('Выберите страницы и качество изображения под свои задачи.', 'Select page ranges and the image quality that suits your needs.')}</p></article>
              <article className="step-card"><span className="step-number">03</span><span className="step-icon green"><ArrowDownToLine size={19} /></span><h3>{t('Скачайте PNG', 'Download your PNGs')}</h3><p>{t('Сохраняйте страницы по отдельности или соберите все изображения в один ZIP-архив.', 'Save pages individually or bundle every converted image into one ZIP.')}</p></article>
            </div>
          </section>
        )}
        <section className="trust-strip"><div className="trust-item"><ShieldCheck size={17} /><div><strong>{t('Конфиденциальность', 'Private by design')}</strong><small>{t('Без загрузки на сервер', 'No server uploads')}</small></div></div><div className="trust-item"><Zap size={17} /><div><strong>{t('Быстро и просто', 'Fast & lightweight')}</strong><small>{t('Работает в браузере', 'Runs in your browser')}</small></div></div><div className="trust-item"><HardDrive size={17} /><div><strong>{t('Работает офлайн', 'Works offline')}</strong><small>{t('После первого посещения', 'After the first visit')}</small></div></div></section>
      </main>

      <footer className="footer"><a className="footer-brand" href="#top"><FileImage size={17} /> pdftopng</a><span>{t('Простые инструменты. Ваша приватность важна.', 'Simple tools. Private by design.')}</span><span>{t('PDF не покидают устройство', 'PDFs never leave your device')} <LockKeyhole size={13} /></span></footer>
      <input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={onFileInput} />
      <canvas ref={canvasRef} className="render-canvas" aria-hidden="true" />
    </div>
  );
}

export default App;
