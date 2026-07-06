// media.js — salvataggio media (foto/video) con due modalità, decise dalle env:
//
//  • Cloudinary  (CLOUDINARY_URL o CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET) → upload firmato,
//       ottimizzazione/resize automatici, CDN. È la modalità di PRODUZIONE (i produttori caricano
//       foto pesanti da telefono e il disco degli host free è effimero → spariscono a ogni deploy).
//  • Disco  (nessuna env Cloudinary) → scrive il file su GF_DATA_DIR/assets/... e ritorna il path
//       locale. Identico allo storico: sviluppo locale e test girano senza rete né credenziali.
//
// Zero dipendenze: usa fetch/FormData/Blob globali (Node 18+) e crypto per la firma.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

// Parsing configurazione: preferisce le variabili separate, poi CLOUDINARY_URL (cloudinary://key:secret@cloud).
function cloudinaryConfig() {
  let cloud = process.env.CLOUDINARY_CLOUD_NAME || '';
  let key = process.env.CLOUDINARY_API_KEY || '';
  let secret = process.env.CLOUDINARY_API_SECRET || '';
  const url = process.env.CLOUDINARY_URL || '';
  if ((!cloud || !key || !secret) && url) {
    const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url.trim());
    if (m) { key = key || m[1]; secret = secret || m[2]; cloud = cloud || m[3]; }
  }
  return cloud && key && secret ? { cloud, key, secret } : null;
}

const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|webp)|video\/(?:mp4|webm|quicktime));base64,(.+)$/;
const extOf = (mime) => ({ 'image/png': 'png', 'image/jpg': 'jpg', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mp4' }[mime] || 'bin');
const isVideo = (mime) => mime.startsWith('video/');

// Firma Cloudinary: sha1 dei parametri ordinati (`k=v&...`) + api_secret (hex).
function sign(params, secret) {
  const base = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(base + secret).digest('hex');
}

// Carica un data-URL. Ritorna { url, provider } dove url è pronto per essere salvato nella scheda.
// opts: { folder (es. 'producers/<id>/products'), diskDir, diskUrlBase, filenameBase, now }
async function saveMedia(dataUrl, opts = {}) {
  const m = DATA_URL_RE.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error('media non valido (immagine png/jpg/webp o video mp4/webm)'), { code: 400 });
  const mime = m[1], b64 = m[2], buf = Buffer.from(b64, 'base64');

  const cfg = cloudinaryConfig();
  if (cfg) {
    const ts = Math.floor((opts.now || Date.now()) / 1000);
    const folder = 'gaia-food/' + (opts.folder || 'misc');
    const resourceType = isVideo(mime) ? 'video' : 'image';
    const toSign = { folder, timestamp: ts };
    const signature = sign(toSign, cfg.secret);
    const form = new FormData();
    form.append('file', dataUrl);                 // Cloudinary accetta il data-URI come 'file'
    form.append('api_key', cfg.key);
    form.append('timestamp', String(ts));
    form.append('folder', folder);
    form.append('signature', signature);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud}/${resourceType}/upload`, { method: 'POST', body: form });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.secure_url) throw Object.assign(new Error('upload cloudinary fallito: ' + (j.error && j.error.message || r.status)), { code: 502 });
    return { url: j.secure_url, provider: 'cloudinary' };
  }

  // Fallback disco (dev/test): scrive sotto diskDir e ritorna il path relativo servito da server.js.
  const dir = opts.diskDir;
  if (!dir) throw new Error('diskDir mancante per il fallback su disco');
  fs.mkdirSync(dir, { recursive: true });
  const base = (opts.filenameBase || crypto.randomBytes(8).toString('hex')).replace(/[^a-z0-9._-]/gi, '');
  const file = `${base}.${extOf(mime)}`;
  fs.writeFileSync(path.join(dir, file), buf);
  return { url: `${(opts.diskUrlBase || 'assets/media').replace(/\/$/, '')}/${file}`, provider: 'disk' };
}

module.exports = { saveMedia, cloudinaryConfig, sign, DATA_URL_RE, isVideo, extOf };
