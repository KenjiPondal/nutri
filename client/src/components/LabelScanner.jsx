import { useEffect, useRef, useState } from 'react';
import { parseLabel } from '../utils/labelParser';

/** Prepare a photo for OCR: upscale small images, greyscale, boost contrast. */
async function prepare(file) {
  const img = await createImageBitmap(file);
  const long = Math.max(img.width, img.height);
  const scale = long < 1800 ? 1800 / long : Math.min(1, 2400 / long);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.8) brightness(1.05)';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * Read a nutrition label. Primary: text from the phone's own scanner (iPhone Live Text via
 * "Scan Text" on the keyboard, or pasted), parsed as you go. Fallback: photo + in-browser OCR.
 * Calls onParsed(fields, found).
 */
export default function LabelScanner({ onParsed }) {
  const fileInput = useRef(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState('');

  // Parse the scanned/pasted text as it arrives
  useEffect(() => {
    if (text.trim().length < 15) return;
    const t = setTimeout(() => {
      const { fields, found } = parseLabel(text);
      if (found.length) { setStatus(`Filled ${found.length} values. Check them below before saving.`); onParsed(fields, found); }
      else setStatus("No nutrition values recognized yet. Make sure the scan includes the table.");
    }, 350);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const runPhoto = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStatus('Reading photo… 0%');
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng+spa', 1, {
        logger: (m) => m.status === 'recognizing text' && setStatus(`Reading photo… ${Math.round(m.progress * 100)}%`)
      });
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }); // treat as one block of text (tables)
      const { data } = await worker.recognize(await prepare(file));
      await worker.terminate();
      const { fields, found } = parseLabel(data.text);
      if (!found.length) { setStatus("Couldn't read values from the photo. Try the text scan above instead."); return; }
      setStatus(`Found ${found.length} values in the photo. Check them below.`);
      onParsed(fields, found);
    } catch (e) {
      setStatus(`Photo reading failed (${e.message}). Try the text scan above instead.`);
    }
  };

  if (!open) {
    return (
      <div className="label-scan">
        <button type="button" className="btn secondary wide" onClick={() => setOpen(true)}>Scan nutrition label</button>
      </div>
    );
  }

  return (
    <div className="label-scan open">
      <label>Nutrition label text
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus
          placeholder={isIOS ? 'Tap here, then the Scan Text icon on the keyboard (or long-press → Scan Text) and point at the table' : 'Paste the label text here'} />
      </label>
      <p className="dim small">
        {isIOS
          ? <>Your iPhone reads the text itself. Tap <b>Insert</b> when the table is highlighted. Values fill in automatically.</>
          : 'Copy the text from a photo of the label (most phones can do this) and paste it here.'}
      </p>
      {status && <p className="label-status small">{preview && <img src={preview} alt="" />}<span>{status}</span></p>}
      <div className="row">
        <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { runPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" className="link" onClick={() => fileInput.current?.click()}>Use a photo instead</button>
        <button type="button" className="link" onClick={() => { setOpen(false); setText(''); setStatus(''); setPreview(''); }}>Close</button>
      </div>
    </div>
  );
}
