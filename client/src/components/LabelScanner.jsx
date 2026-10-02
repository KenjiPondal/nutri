import { useRef, useState } from 'react';
import { parseLabel } from '../utils/labelParser';

/** Downscale/greyscale/contrast-boost a photo so OCR reads small label text better. */
async function prepare(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.6)';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/**
 * "Photo of the label" button. Runs OCR in the browser (tesseract.js, lazy-loaded),
 * parses nutrition values and hands them to onParsed(fields, found).
 */
export default function LabelScanner({ onParsed }) {
  const input = useRef(null);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState('');

  const run = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStatus('Reading label… 0%');
    try {
      const { default: Tesseract } = await import('tesseract.js');
      const canvas = await prepare(file);
      const { data } = await Tesseract.recognize(canvas, 'eng+spa', {
        logger: (m) => m.status === 'recognizing text' && setStatus(`Reading label… ${Math.round(m.progress * 100)}%`)
      });
      window.__lastLabelText = data.text; // debug aid: inspect OCR output in devtools
      const { fields, found } = parseLabel(data.text);
      if (!found.length) { setStatus("Couldn't read values. Try a closer, straight-on photo in good light, or type them in."); return; }
      setStatus(`Found ${found.length} values — check them below before saving.`);
      onParsed(fields, found);
    } catch (e) {
      setStatus(`Label reading failed (${e.message}). You can type the values in.`);
    }
  };

  return (
    <div className="label-scan">
      <input ref={input} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { run(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" className="btn secondary wide" onClick={() => input.current?.click()}>
        Photo of nutrition label
      </button>
      {(status || preview) && (
        <div className="label-status">
          {preview && <img src={preview} alt="Label" />}
          <span className="small">{status}</span>
        </div>
      )}
    </div>
  );
}
