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

const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|webp)|video\/(?:mp4|webm|quicktime));base64,([A-Za-z0-9+/]+={0,2})$/;
const extOf = (mime) => ({ 'image/png': 'png', 'image/jpg': 'jpg', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mp4' }[mime] || 'bin');
const isVideo = (mime) => mime.startsWith('video/');

// Il MIME dichiarato dal browser non basta: prima di salvare controlliamo anche la firma reale
// del file. La verifica e i limiti sono condivisi da Cloudinary e fallback disco, così i due
// ambienti accettano esattamente gli stessi payload.
function hasMagicBytes(buf, mime) {
  if (!Buffer.isBuffer(buf)) return false;
  if (mime === 'image/png') return buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mime === 'image/jpeg' || mime === 'image/jpg') return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/webp') return buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'video/mp4' || mime === 'video/quicktime') return buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp';
  if (mime === 'video/webm') return buf.length >= 4 && buf.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'));
  return false;
}

function mediaError(message, code = 400) { return Object.assign(new Error(message), { code }); }

// Rimuove metadata potenzialmente sensibili senza ricodificare l'immagine. I parser lavorano sui
// container standard e falliscono chiusi se la struttura è troncata, evitando file corrotti.
function stripJpegMetadata(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw mediaError('JPEG malformato');
  const parts = [buf.subarray(0, 2)]; let pos = 2;
  while (pos < buf.length) {
    const markerStart = pos;
    if (buf[pos] !== 0xff) throw mediaError('JPEG malformato');
    while (pos < buf.length && buf[pos] === 0xff) pos++;
    if (pos >= buf.length) throw mediaError('JPEG malformato');
    const marker = buf[pos++];
    if (marker === 0xd9) { parts.push(buf.subarray(markerStart, pos)); return Buffer.concat(parts); }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(buf.subarray(markerStart, pos)); continue;
    }
    if (pos + 2 > buf.length) throw mediaError('JPEG malformato');
    const length = buf.readUInt16BE(pos);
    if (length < 2 || pos + length > buf.length) throw mediaError('JPEG malformato');
    const end = pos + length;
    if (![0xe1, 0xed, 0xfe].includes(marker)) parts.push(buf.subarray(markerStart, end)); // APP1, APP13, COM
    pos = end;
    if (marker === 0xda) { parts.push(buf.subarray(pos)); return Buffer.concat(parts); } // entropy stream: non parsarlo
  }
  return Buffer.concat(parts);
}

function stripPngMetadata(buf) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  if (buf.length < 20 || !buf.subarray(0, 8).equals(signature)) throw mediaError('PNG malformato');
  const parts = [buf.subarray(0, 8)], blocked = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt']);
  let pos = 8, ended = false;
  while (pos < buf.length) {
    if (pos + 12 > buf.length) throw mediaError('PNG malformato');
    const length = buf.readUInt32BE(pos), end = pos + 12 + length;
    if (end > buf.length) throw mediaError('PNG malformato');
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (!blocked.has(type)) parts.push(buf.subarray(pos, end));
    pos = end;
    if (type === 'IEND') { ended = true; break; }
  }
  if (!ended) throw mediaError('PNG malformato');
  return Buffer.concat(parts);
}

function stripWebpMetadata(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw mediaError('WebP malformato');
  const declaredEnd = 8 + buf.readUInt32LE(4);
  if (declaredEnd > buf.length || declaredEnd < 12) throw mediaError('WebP malformato');
  const chunks = []; let pos = 12;
  while (pos < declaredEnd) {
    if (pos + 8 > declaredEnd) throw mediaError('WebP malformato');
    const type = buf.toString('ascii', pos, pos + 4), size = buf.readUInt32LE(pos + 4);
    const end = pos + 8 + size, paddedEnd = end + (size % 2);
    if (paddedEnd > declaredEnd) throw mediaError('WebP malformato');
    if (type !== 'EXIF' && type !== 'XMP ') {
      if (type === 'VP8X' && size >= 1) {
        const chunk = Buffer.from(buf.subarray(pos, paddedEnd));
        chunk[8] &= ~0x0c; // azzera i flag EXIF/XMP nel canvas esteso
        chunks.push(chunk);
      } else chunks.push(buf.subarray(pos, paddedEnd));
    }
    pos = paddedEnd;
  }
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const out = Buffer.allocUnsafe(8 + body.length);
  out.write('RIFF', 0, 'ascii'); out.writeUInt32LE(body.length, 4); body.copy(out, 8);
  return out;
}

function stripImageMetadata(buf, mime) {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return stripJpegMetadata(buf);
  if (mime === 'image/png') return stripPngMetadata(buf);
  if (mime === 'image/webp') return stripWebpMetadata(buf);
  return buf;
}

function hasSensitiveVideoMetadata(buf, mime) {
  if (mime !== 'video/mp4' && mime !== 'video/quicktime') return false;
  const patterns = [
    Buffer.from([0xa9, 0x78, 0x79, 0x7a]), // ©xyz
    Buffer.from('location.ISO6709', 'ascii'),
    Buffer.from('com.apple.quicktime.location', 'ascii'),
    Buffer.from('GPSCoordinates', 'ascii'),
  ];
  return patterns.some((pattern) => buf.indexOf(pattern) >= 0);
}

function diskDirectoryBytes(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
      if (!entry.isFile()) return sum;
      try { return sum + fs.statSync(path.join(dir, entry.name)).size; } catch { return sum; }
    }, 0);
  } catch (error) {
    if (error && error.code === 'ENOENT') return 0;
    throw error;
  }
}

function ensureDiskCapacity(dir, incomingBytes, capBytes) {
  if (!Number.isFinite(capBytes) || capBytes <= 0) return;
  if (diskDirectoryBytes(dir) + incomingBytes > capBytes) throw mediaError('spazio_media_esaurito', 507);
}

function inspectDataUrl(dataUrl, opts = {}) {
  const m = DATA_URL_RE.exec(dataUrl || '');
  if (!m || m[2].length % 4 === 1) throw Object.assign(new Error('media non valido (immagine png/jpg/webp o video mp4/webm)'), { code: 400 });
  const mime = m[1].toLowerCase();
  const allowed = Array.isArray(opts.allowedMimes) ? new Set(opts.allowedMimes) : null;
  if (allowed && !allowed.has(mime)) throw Object.assign(new Error('formato media non consentito'), { code: 400 });
  const rawBuf = Buffer.from(m[2], 'base64');
  if (!rawBuf.length || !hasMagicBytes(rawBuf, mime)) throw Object.assign(new Error('contenuto media non coerente con il formato dichiarato'), { code: 400 });
  // I limiti stretti sono opt-in: gli upload produttore esistenti mantengono il loro contratto
  // storico, mentre il social passa esplicitamente 8/18 MiB.
  const imageMax = opts.maxImageBytes == null ? Infinity : Number(opts.maxImageBytes);
  const videoMax = opts.maxVideoBytes == null ? Infinity : Number(opts.maxVideoBytes);
  const max = isVideo(mime) ? videoMax : imageMax;
  if (rawBuf.length > max) throw Object.assign(new Error(`${isVideo(mime) ? 'video' : 'immagine'} troppo grande`), { code: 413 });
  if (hasSensitiveVideoMetadata(rawBuf, mime)) throw mediaError('video contiene metadata di localizzazione non consentiti');
  const buf = isVideo(mime) ? rawBuf : stripImageMetadata(rawBuf, mime);
  return { mime, buf, type: isVideo(mime) ? 'video' : 'image', ext: extOf(mime) };
}

// Firma Cloudinary: sha1 dei parametri ordinati (`k=v&...`) + api_secret (hex).
function sign(params, secret) {
  const base = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(base + secret).digest('hex');
}

// Carica un data-URL. Ritorna { url, provider } dove url è pronto per essere salvato nella scheda.
// opts: { folder (es. 'producers/<id>/products'), diskDir, diskUrlBase, filenameBase, now }
async function saveMedia(dataUrl, opts = {}) {
  const inspected = inspectDataUrl(dataUrl, opts);
  const { mime, buf, type } = inspected;

  const cfg = cloudinaryConfig();
  if (cfg) {
    const ts = Math.floor((opts.now || Date.now()) / 1000);
    const folder = 'gaia-food/' + (opts.folder || 'misc');
    const resourceType = isVideo(mime) ? 'video' : 'image';
    const toSign = { folder, timestamp: ts };
    const signature = sign(toSign, cfg.secret);
    const form = new FormData();
    form.append('file', `data:${mime};base64,${buf.toString('base64')}`); // già sanitizzato
    form.append('api_key', cfg.key);
    form.append('timestamp', String(ts));
    form.append('folder', folder);
    form.append('signature', signature);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud}/${resourceType}/upload`, { method: 'POST', body: form });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.secure_url || !j.public_id) throw Object.assign(new Error('upload cloudinary fallito: ' + (j.error && j.error.message || r.status)), { code: 502 });
    return {
      url: j.secure_url, provider: 'cloudinary', mime, type, bytes: buf.length,
      publicId: String(j.public_id || ''), resourceType,
    };
  }

  // Fallback disco (dev/test): scrive sotto diskDir e ritorna il path relativo servito da server.js.
  const dir = opts.diskDir;
  if (!dir) throw new Error('diskDir mancante per il fallback su disco');
  fs.mkdirSync(dir, { recursive: true });
  ensureDiskCapacity(dir, buf.length, Number(opts.diskQuotaBytes));
  const base = (opts.filenameBase || crypto.randomBytes(8).toString('hex')).replace(/[^a-z0-9._-]/gi, '');
  const file = `${base}.${extOf(mime)}`;
  fs.writeFileSync(path.join(dir, file), buf);
  return { url: `${(opts.diskUrlBase || 'assets/media').replace(/\/$/, '')}/${file}`, provider: 'disk', mime, type, bytes: buf.length };
}

// Risolve un URL del fallback disco soltanto se indica un file DIRETTO della directory attesa.
// Niente sottocartelle, traversal, query-string o symlink: il registro social è persistente e va
// trattato come input non fidato anche quando viene scritto soltanto dal server.
function safeDiskMediaPath(url, opts = {}) {
  const dir = path.resolve(String(opts.diskDir || ''));
  const base = String(opts.diskUrlBase || 'assets/media').replace(/^\/+|\/$/g, '');
  const value = String(url || '').replace(/^\/+/, '');
  if (!dir || !base || !value.startsWith(base + '/')) return null;
  const file = value.slice(base.length + 1);
  if (!file || file !== path.basename(file) || !/^[A-Za-z0-9._-]+$/.test(file)) return null;
  const target = path.resolve(dir, file);
  return path.dirname(target) === dir ? target : null;
}

async function listDiskMediaAssets(opts = {}) {
  const dir = path.resolve(String(opts.diskDir || ''));
  const base = String(opts.diskUrlBase || 'assets/media').replace(/^\/+|\/$/g, '');
  if (!dir || !base) return [];
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error && error.code === 'ENOENT') return []; throw error; }
  const assets = [];
  for (const entry of entries) {
    // Dirent#isFile è false per i link simbolici: non li seguiamo neppure per leggerne mtime/size.
    if (!entry.isFile() || !/^[A-Za-z0-9._-]+$/.test(entry.name)) continue;
    const target = safeDiskMediaPath(`${base}/${entry.name}`, { diskDir: dir, diskUrlBase: base });
    if (!target) continue;
    try {
      const stat = await fs.promises.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      assets.push({
        url: `${base}/${entry.name}`, provider: 'disk', uploadedAt: stat.mtime.toISOString(),
        bytes: stat.size,
      });
    } catch (error) { if (!error || error.code !== 'ENOENT') throw error; }
  }
  return assets;
}

// Rimozione idempotente per lo sweep social. Cloudinary richiede una chiamata `destroy` firmata;
// sul disco locale si elimina solo un file regolare confinato nella directory social.
async function deleteMediaAsset(asset, opts = {}) {
  const item = asset && typeof asset === 'object' ? asset : {};
  if (item.provider === 'disk') {
    const target = safeDiskMediaPath(item.url, opts);
    if (!target) return { deleted: false, reason: 'unsafe_path' };
    try {
      const stat = await fs.promises.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) return { deleted: false, reason: 'unsafe_path' };
      await fs.promises.unlink(target);
      return { deleted: true, provider: 'disk' };
    } catch (error) {
      if (error && error.code === 'ENOENT') return { deleted: true, provider: 'disk', alreadyMissing: true };
      throw error;
    }
  }

  if (item.provider === 'cloudinary') {
    const cfg = cloudinaryConfig();
    if (!cfg) return { deleted: false, reason: 'cloudinary_not_configured' };
    const publicId = String(item.publicId || '');
    // Gaia genera esclusivamente public_id sotto questa cartella. Non accettiamo ID arbitrari dal DB.
    if (!/^gaia-food\/social\/[A-Za-z0-9_\/-]+$/.test(publicId) || publicId.includes('..')) {
      return { deleted: false, reason: 'unsafe_public_id' };
    }
    const resourceType = item.resourceType === 'video' || item.type === 'video' ? 'video' : 'image';
    const timestamp = Math.floor((opts.now || Date.now()) / 1000);
    const toSign = { invalidate: 'true', public_id: publicId, timestamp };
    const form = new FormData();
    form.append('public_id', publicId);
    form.append('timestamp', String(timestamp));
    form.append('invalidate', 'true');
    form.append('api_key', cfg.key);
    form.append('signature', sign(toSign, cfg.secret));
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud}/${resourceType}/destroy`, { method: 'POST', body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw mediaError('eliminazione cloudinary fallita: ' + (result.error && result.error.message || response.status), 502);
    if (result.result !== 'ok' && result.result !== 'not found') throw mediaError('eliminazione cloudinary non confermata', 502);
    return { deleted: true, provider: 'cloudinary', alreadyMissing: result.result === 'not found' };
  }

  return { deleted: false, reason: 'provider_unknown' };
}

module.exports = {
  saveMedia, cloudinaryConfig, sign, DATA_URL_RE, isVideo, extOf, hasMagicBytes, inspectDataUrl,
  stripImageMetadata, stripJpegMetadata, stripPngMetadata, stripWebpMetadata, hasSensitiveVideoMetadata,
  diskDirectoryBytes, ensureDiskCapacity, safeDiskMediaPath, listDiskMediaAssets, deleteMediaAsset,
};
