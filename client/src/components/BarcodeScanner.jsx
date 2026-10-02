import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128
]]]);

/** Camera barcode scanner. Calls onDetected(code) once, then stops. */
export default function BarcodeScanner({ onDetected, onClose, manualEntry = true }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    let controls;
    let stopped = false;
    const reader = new BrowserMultiFormatReader(hints);
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _err, ctrl) => {
      if (result && !stopped) {
        stopped = true;
        ctrl.stop();
        if (navigator.vibrate) navigator.vibrate(100);
        onDetected(result.getText());
      }
    }).then(c => { controls = c; if (stopped) c.stop(); })
      .catch(e => setError(
        e?.name === 'NotAllowedError' ? 'Camera permission denied.'
        : !window.isSecureContext ? 'Camera requires HTTPS (or localhost).'
        : 'No camera available.'));
    return () => { stopped = true; controls?.stop(); };
  }, [onDetected]);

  return (
    <div className="scanner">
      {error ? <div className="error">{error}{manualEntry ? ' Enter the barcode manually below.' : ' Type the barcode in the field instead.'}</div>
        : <div className="scanner-view"><video ref={videoRef} muted playsInline /><div className="scan-line" /></div>}
      {!manualEntry ? (onClose && <div className="row"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button></div>) : (
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) onDetected(manual.trim()); }}>
        <input inputMode="numeric" placeholder="Or type barcode (e.g. 3017620422003)" value={manual}
          onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))} />
        <button className="btn">Look up</button>
        {onClose && <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>}
      </form>)}
    </div>
  );
}
