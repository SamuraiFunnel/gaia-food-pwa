// admin-extras.js — helper per l'editor produttore (Admin.js).
// Tre blocchi che vivono fuori dal form base: VIDEO (3 capitoli + sorgente/poster),
// PICKER MAPPA (click su MapLibre → lat/lng), INVENTARIO stagionale (lista ripetibile).
// Nessuna dipendenza nuova: MapLibre è già caricato globale (window.maplibregl, index.html).
// Pattern: build*() ritorna l'HTML, bind*() aggancia gli eventi sul nodo montato,
// read*() rilegge i valori correnti dal DOM per costruire il patch da salvare.

import { Icon } from './icons.js';

const esc = s => (s == null ? '' : String(s)).replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escTxt = s => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const TONES = ['pascolo', 'latte', 'olio', 'formaggio', 'uova', 'grano', 'lavoro', 'paesaggio'];

// I 3 capitoli sono fissi per tipo (presentazione/storia/metodo): è il modello della scheda pubblica.
const VIDEO_TYPES = [
  { type: 'presentazione', label: 'Presentazione' },
  { type: 'storia', label: 'Storia' },
  { type: 'metodo', label: 'Metodo' },
];

const toneOptions = (sel) => TONES.map(t => `<option value="${t}"${t === sel ? ' selected' : ''}>${t}</option>`).join('');

// ---------------------------------------------------------------------------
// CSS condiviso di questi blocchi (iniettato una volta, scope locale .adm).
// ---------------------------------------------------------------------------
export const extrasCss = `
  .adm .sec{margin:22px 0 4px;padding-top:16px;border-top:1px solid var(--bd)}
  .adm .sec h2{font-family:var(--serif);font-size:18px;font-weight:600;margin:0 0 2px}
  .adm .sec .hint{font-size:12.5px;color:var(--muted);margin:0 0 12px}
  .adm .vcard{border:1px solid var(--bd);border-radius:16px;padding:13px;margin-bottom:12px;background:#fff}
  .adm .vcard .vhd{display:flex;align-items:center;gap:8px;margin-bottom:10px}
  .adm .vcard .vhd .vt{font-family:var(--serif);font-weight:600;font-size:15px;flex:1}
  .adm .vcard .vsrc-prev{display:none;margin-top:8px;border-radius:10px;overflow:hidden;border:1px solid var(--bd);background:#000}
  .adm .vcard .vsrc-prev.on{display:block}
  .adm .vcard .vsrc-prev video{display:block;width:100%;max-height:200px;background:#000}
  .adm .vcard .vsrc-prev iframe{display:block;width:100%;aspect-ratio:16/9;border:0}
  .adm .mapwrap-edit{position:relative;height:230px;border-radius:16px;overflow:hidden;border:1px solid var(--bd);background:#F4F1EB;margin-bottom:8px}
  .adm .mapwrap-edit.map-fallback{display:flex;align-items:center;justify-content:center}
  .adm .mapwrap-edit.map-fallback::after{content:'Mappa non disponibile offline — inserisci lat/lng a mano';font-size:12.5px;color:var(--muted);padding:0 24px;text-align:center}
  .adm .map-hint{font-size:12.5px;color:var(--muted);margin:0 0 10px}
  .adm .epin{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--verde,#16A34A);box-shadow:0 3px 10px rgba(0,0,0,.3);border:2px solid #fff}
  .adm .epin svg{transform:rotate(45deg)}
  .adm .srow{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--bd);border-radius:14px;padding:11px;margin-bottom:8px;background:#fff}
  .adm .srow .sgrow{flex:1;display:grid;grid-template-columns:1fr 110px;gap:8px}
  .adm .srow .sgrow .full{grid-column:1 / -1}
  .adm .srow .xbtn{flex:none;width:34px;height:34px;border:1px solid var(--bd);border-radius:10px;display:flex;align-items:center;justify-content:center;background:#fff;color:var(--red-alert,#ef4444)}
  .adm .addbtn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:9px 14px;border-radius:11px;border:1px dashed var(--bd);background:#fff;color:var(--verde-deep,#15803d);cursor:pointer}
`;

// ===========================================================================
// 1) VIDEO — 3 capitoli (presentazione / storia / metodo)
//    Campi per ognuno: titolo, durata, stato (ready/coming), sorgente (mp4/YouTube),
//    poster (URL immagine, opzionale) + tono placeholder di fallback.
// ===========================================================================
export function buildVideos(p) {
  const existing = Array.isArray(p.videos) ? p.videos : [];
  const byType = t => existing.find(v => v.type === t) || {};
  const stateOpt = (cur) => ['ready', 'coming'].map(s =>
    `<option value="${s}"${(cur || 'coming') === s ? ' selected' : ''}>${s === 'ready' ? 'Pronto' : 'In arrivo'}</option>`).join('');

  const cards = VIDEO_TYPES.map(({ type, label }) => {
    const v = byType(type);
    return `<div class="vcard" data-vtype="${type}">
      <div class="vhd"><span class="vt">${label}</span>
        <select class="vstate" style="width:130px">${stateOpt(v.state)}</select></div>
      <div class="two">
        <div class="field"><label>Titolo</label><input type="text" class="vtitle" value="${esc(v.title && v.title !== '—' ? v.title : '')}" placeholder="Es. Conosci ${esc(p.name) || 'il produttore'}"></div>
        <div class="field"><label>Durata</label><input type="text" class="vdur" value="${esc(v.duration && v.duration !== '—' ? v.duration : '')}" placeholder="1:12"></div>
      </div>
      <div class="field"><label>Sorgente video (URL mp4 o YouTube)</label>
        <input type="text" class="vsrc" value="${esc(v.src)}" placeholder="https://… .mp4 oppure https://youtu.be/…"></div>
      <div class="two">
        <div class="field"><label>Poster (URL immagine, opzionale)</label><input type="text" class="vposter" value="${esc(v.poster)}" placeholder="https://… .jpg"></div>
        <div class="field"><label>Tono placeholder</label><select class="vtone">${toneOptions(v.tone || p.tone)}</select></div>
      </div>
      <div class="vsrc-prev"></div>
    </div>`;
  }).join('');

  return `<div class="sec" id="sec-videos">
    <h2>I 3 video</h2>
    <p class="hint">Presentazione, Storia, Metodo. Imposta titolo, durata, stato e la sorgente (mp4 o YouTube). Il poster è opzionale: senza, si usa il tono placeholder.</p>
    ${cards}
  </div>`;
}

// Converte un URL YouTube in embed; altrimenti null (→ lo trattiamo come file <video>).
function youtubeEmbed(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

export function bindVideos(host) {
  host.querySelectorAll('.vcard').forEach(card => {
    const srcInput = card.querySelector('.vsrc');
    const prev = card.querySelector('.vsrc-prev');
    const render = () => {
      const url = srcInput.value.trim();
      if (!url) { prev.classList.remove('on'); prev.innerHTML = ''; return; }
      const yt = youtubeEmbed(url);
      prev.classList.add('on');
      prev.innerHTML = yt
        ? `<iframe src="${esc(yt)}" allow="encrypted-media" allowfullscreen></iframe>`
        : `<video src="${esc(url)}" controls preload="metadata" playsinline></video>`;
    };
    srcInput.addEventListener('change', render);
    srcInput.addEventListener('blur', render);
    render();
  });
}

export function readVideos(host) {
  return [...host.querySelectorAll('.vcard')].map(card => {
    const type = card.dataset.vtype;
    const val = sel => { const e = card.querySelector(sel); return e ? e.value.trim() : ''; };
    return {
      type,
      title: val('.vtitle') || '—',
      duration: val('.vdur') || '—',
      state: card.querySelector('.vstate').value,
      src: val('.vsrc'),
      poster: val('.vposter'),
      tone: card.querySelector('.vtone').value,
    };
  });
}

// ===========================================================================
// 2) PICKER MAPPA — click sulla mappa imposta lat/lng e sposta il pin.
//    Scrive nei due input #lat / #lng già presenti nel form (Admin.js).
// ===========================================================================
export function buildMapPicker() {
  return `<div class="sec" id="sec-map">
    <h2>Zona e punto preciso</h2>
    <p class="hint">Clicca sulla mappa per posizionare il pin: lat/lng si aggiornano da soli. Trascina il pin per affinare.</p>
    <div class="mapwrap-edit" id="adm-map"></div>
    <p class="map-hint" id="adm-map-coords">Nessun punto impostato.</p>
  </div>`;
}

// center: [lng, lat] di default (zona). latInput/lngInput: gli <input> del form.
export function bindMapPicker(host, { center = [13.934, 41.776] } = {}) {
  const el = host.querySelector('#adm-map');
  const latInput = host.querySelector('#lat');
  const lngInput = host.querySelector('#lng');
  const coordsLbl = host.querySelector('#adm-map-coords');
  if (!el) return;

  const showCoords = (lat, lng) => {
    coordsLbl.textContent = (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng))
      ? 'Nessun punto impostato.'
      : `Punto: ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  };

  if (!window.maplibregl) { el.classList.add('map-fallback'); return; }

  const curLat = parseFloat(latInput.value);
  const curLng = parseFloat(lngInput.value);
  const hasPoint = !Number.isNaN(curLat) && !Number.isNaN(curLng);
  const start = hasPoint ? [curLng, curLat] : center;

  let map, marker;
  try {
    map = new maplibregl.Map({
      container: el,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: start, zoom: hasPoint ? 13 : 11, attributionControl: false,
    });
  } catch (e) { el.classList.add('map-fallback'); return; }

  const pinEl = () => {
    const d = document.createElement('div');
    d.className = 'epin';
    d.innerHTML = Icon('map-pin', { size: 15, color: '#fff' });
    return d;
  };

  const place = (lng, lat) => {
    if (!marker) {
      marker = new maplibregl.Marker({ element: pinEl(), anchor: 'bottom', draggable: true }).setLngLat([lng, lat]).addTo(map);
      marker.on('dragend', () => { const ll = marker.getLngLat(); setPoint(ll.lng, ll.lat); });
    } else {
      marker.setLngLat([lng, lat]);
    }
  };
  const setPoint = (lng, lat) => {
    latInput.value = Number(lat).toFixed(5);
    lngInput.value = Number(lng).toFixed(5);
    place(lng, lat);
    showCoords(lat, lng);
  };

  if (hasPoint) { place(curLng, curLat); showCoords(curLat, curLng); }
  else showCoords(null, null);

  map.on('click', (e) => setPoint(e.lngLat.lng, e.lngLat.lat));

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    map.once('remove', () => ro.disconnect());
  }
}

// ===========================================================================
// 3) INVENTARIO "Di stagione" (seasonal[]): aggiungi / modifica / rimuovi.
//    Riga = { label, tone, note }.
// ===========================================================================
function seasonalRow(item = {}) {
  return `<div class="srow">
    <div class="sgrow">
      <input type="text" class="s-label" value="${esc(item.label)}" placeholder="Prodotto (es. Caciotta)">
      <select class="s-tone">${toneOptions(item.tone || 'paesaggio')}</select>
      <input type="text" class="s-note full" value="${esc(item.note)}" placeholder="Nota (es. a latte crudo)">
    </div>
    <button type="button" class="xbtn" data-srm aria-label="Rimuovi">${Icon('x', { size: 16, color: 'currentColor' })}</button>
  </div>`;
}

export function buildSeasonal(p) {
  const items = Array.isArray(p.seasonal) ? p.seasonal : [];
  const rows = items.length ? items.map(seasonalRow).join('') : '';
  return `<div class="sec" id="sec-seasonal">
    <h2>Inventario · Di stagione adesso</h2>
    <p class="hint">I prodotti disponibili ora. Aggiungi, modifica o rimuovi le righe.</p>
    <div id="seasonal-rows">${rows}</div>
    <button type="button" class="addbtn" id="seasonal-add">${Icon('plus', { size: 16, color: 'currentColor' })} Aggiungi prodotto</button>
  </div>`;
}

export function bindSeasonal(host) {
  const rowsHost = host.querySelector('#seasonal-rows');
  const addBtn = host.querySelector('#seasonal-add');
  if (!rowsHost || !addBtn) return;
  const bindRemovers = () => rowsHost.querySelectorAll('[data-srm]').forEach(b => {
    b.onclick = () => b.closest('.srow').remove();
  });
  addBtn.onclick = () => {
    rowsHost.insertAdjacentHTML('beforeend', seasonalRow());
    bindRemovers();
  };
  bindRemovers();
}

export function readSeasonal(host) {
  return [...host.querySelectorAll('#seasonal-rows .srow')]
    .map(r => ({
      label: r.querySelector('.s-label').value.trim(),
      tone: r.querySelector('.s-tone').value,
      note: r.querySelector('.s-note').value.trim(),
    }))
    .filter(s => s.label); // riga senza nome = ignorata
}

// piccolo helper esportato se servisse altrove
export { esc as escAttr, escTxt };
