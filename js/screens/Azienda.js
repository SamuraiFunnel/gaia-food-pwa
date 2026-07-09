// «La mia area» — Vetrina viva (piano 13, direzione D13 + redesign UX/UI vetrina-v2).
// Il produttore cura la sua scheda VEDENDOLA come la vede il cliente, con modifica in-place.
// Onboarding = "la vetrina si accende a pezzi": slot vuoti che si riempiono, guida "cosa manca",
// invio bloccato finché non è completo. Composizione editoriale centrata, icone a linea coerenti,
// prezzo PRECISO. Testi in italiano hard-coded (niente chiavi t() nuove).
import { Icon } from '../icons.js';
import { StatusBar, toast, confirmSheet, initMap } from '../components.js';
import {
  currentUser, getState, getMyProducer, requestProducer, patchMyProducer,
  addMyProduct, updateMyProduct, deleteMyProduct, uploadProducerMedia,
  submitMyProducer, markProducerSeen,
} from '../store.js';

const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// prezzo: numero → "4,50" (2 decimali) o "12" (intero). parse: "4,50"/"4.50" → 4.5, altro → null.
const euro = (n) => { const v = Number(n); return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ','); };
const parsePrice = (s) => { const n = parseFloat(String(s == null ? '' : s).replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n >= 0 ? n : null; };
const availMeta = {
  available: { bg: 'var(--verde-pale)', c: 'var(--verde-deep)', t: 'Disponibile' },
  out: { bg: '#F7E7E4', c: '#B23A2B', t: 'Esaurito' },
  returns: { bg: '#F6EEDD', c: '#C8862F', t: 'Torna in stagione' },
};

// --- icone a linea (Lucide) inline: un set unico, monocromo, coerente ---
const _svg = (path, col = 'currentColor', sz = 18, sw = 1.9) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const IC = {
  back: (c, s = 18) => _svg('<path d="M15 18l-6-6 6-6"/>', c, s, 2.1),
  check: (c, s = 18) => _svg('<path d="M20 6L9 17l-5-5"/>', c, s, 2.4),
  clock: (c, s = 18) => _svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', c, s),
  wa: (c, s = 18) => _svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', c, s),
  phone: (c, s = 18) => _svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>', c, s),
  mail: (c, s = 18) => _svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>', c, s),
  pin: (c, s = 18) => _svg('<path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', c, s),
  camera: (c, s = 18) => _svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>', c, s),
  eye: (c, s = 18) => _svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', c, s),
  plus: (c, s = 18) => _svg('<path d="M12 5v14M5 12h14"/>', c, s, 2.3),
  pencil: (c, s = 13) => _svg('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', c, s, 2.1),
  leaf: (c, s = 18) => _svg('<path d="M11 20A7 7 0 0 1 4 13C4 7 11 4 20 4c0 9-3 16-9 16z"/><path d="M4 13c6 0 9-3 12-6"/>', c, s),
};
const pencil = (c = 'var(--verde-deep)', s = 13) => IC.pencil(c, s);

// Sceglie un'immagine dal device → dataURL. Limite 8MB.
function pickImage(onData) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast('Foto troppo grande (max 8MB).', 'error'); return; }
    const fr = new FileReader(); fr.onload = () => onData(fr.result); fr.readAsDataURL(f);
  };
  inp.click();
}

// Selezione MULTIPLA di immagini → array di dataURL (per la galleria prodotto). Limite 8MB l'una.
function pickImages(onAll, { max = 20 } = {}) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.onchange = async () => {
    let files = Array.from(inp.files || []);
    const big = files.filter((f) => f.size > 8 * 1024 * 1024).length;
    if (big) toast(`${big} foto oltre 8MB: saltate.`, 'error');
    files = files.filter((f) => f.size <= 8 * 1024 * 1024).slice(0, max);
    if (!files.length) return;
    const urls = await Promise.all(files.map((f) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(f); })));
    onAll(urls.filter(Boolean));
  };
  inp.click();
}

// Riposiziona la copertina (focal point) trascinando l'immagine, stile Facebook.
// Ritorna una Promise con "x% y%" (background-position) o null se annullato.
function repositionCover(dataUrl) {
  return new Promise((resolve) => {
    let px = 50, py = 50, sx = 0, sy = 0, bx = 50, by = 50, drag = false;
    const ov = document.createElement('div');
    ov.className = 'az-rp-ov';
    ov.innerHTML = `<style>
      .az-rp-ov{ position:fixed; inset:0; z-index:1300; display:flex; align-items:center; justify-content:center; background:rgba(20,14,8,.6); opacity:0; transition:opacity .2s; padding:18px }
      .az-rp-ov.in{ opacity:1 }
      .az-rp{ background:var(--bianco,#FBF9F5); width:100%; max-width:460px; border-radius:20px; padding:18px; box-shadow:0 30px 70px -20px rgba(0,0,0,.5) }
      .az-rp h3{ font-family:var(--serif,Georgia); font-size:19px; font-weight:600; margin-bottom:3px }
      .az-rp .sub{ font-size:13px; color:var(--muted,#796d5f); margin-bottom:12px }
      .az-rp-frame{ width:100%; aspect-ratio:39/22; border-radius:14px; background-size:cover; background-repeat:no-repeat; cursor:grab; touch-action:none; position:relative; overflow:hidden; box-shadow:inset 0 0 0 1px rgba(0,0,0,.1) }
      .az-rp-frame:active{ cursor:grabbing }
      .az-rp-frame .hint{ position:absolute; left:50%; bottom:10px; transform:translateX(-50%); background:rgba(0,0,0,.55); color:#fff; font-size:11px; font-weight:600; padding:5px 11px; border-radius:100px; pointer-events:none }
      .az-rp-act{ display:flex; gap:10px; margin-top:16px }
      .az-rp-act button{ flex:1; padding:13px; border-radius:12px; font-size:14.5px; font-weight:700; cursor:pointer; border:1px solid var(--bd,#E4DBCB) }
      .az-rp-cancel{ background:#fff; color:var(--ink-soft,#544a40) }
      .az-rp-ok{ background:var(--verde,#16A34A); color:#fff; border-color:var(--verde,#16A34A) }
    </style>
    <div class="az-rp">
      <h3>Posiziona la copertina</h3>
      <div class="sub">Trascina l'immagine per scegliere cosa mostrare.</div>
      <div class="az-rp-frame" style="background-image:url('${dataUrl}')"><span class="hint">✥ trascina</span></div>
      <div class="az-rp-act"><button class="az-rp-cancel">Annulla</button><button class="az-rp-ok">Conferma</button></div>
    </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('in'));
    const frame = ov.querySelector('.az-rp-frame');
    const paint = () => { frame.style.backgroundPosition = `${px}% ${py}%`; };
    paint();
    const pt = (e) => (e.touches && e.touches[0]) || e;
    const down = (e) => { drag = true; const p = pt(e); sx = p.clientX; sy = p.clientY; bx = px; by = py; e.preventDefault(); };
    const move = (e) => {
      if (!drag) return; const p = pt(e); const r = frame.getBoundingClientRect();
      px = Math.max(0, Math.min(100, bx - (p.clientX - sx) / r.width * 100));
      py = Math.max(0, Math.min(100, by - (p.clientY - sy) / r.height * 100));
      paint(); e.preventDefault();
    };
    const up = () => { drag = false; };
    frame.addEventListener('mousedown', down); frame.addEventListener('touchstart', down, { passive: false });
    window.addEventListener('mousemove', move); window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('mouseup', up); window.addEventListener('touchend', up);
    const done = (val) => {
      window.removeEventListener('mousemove', move); window.removeEventListener('touchmove', move);
      window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up);
      ov.classList.remove('in'); setTimeout(() => ov.remove(), 200); resolve(val);
    };
    ov.querySelector('.az-rp-cancel').onclick = () => done(null);
    ov.querySelector('.az-rp-ok').onclick = () => done(`${Math.round(px)}% ${Math.round(py)}%`);
    ov.addEventListener('click', (e) => { if (e.target === ov) done(null); });
  });
}

// Geocoding indirizzo → suggerimenti (Photon, OSM, gratuito e senza chiave, pensato per l'autocomplete).
// Bias sui risultati vicino all'Abruzzo (zona pilota); ritorna [{label, lat, lng}].
async function geocode(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=it&lat=41.78&lon=13.93`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('geo');
  const d = await r.json();
  return (d.features || []).map((f) => {
    const pr = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
    const street = pr.street ? (pr.street + (pr.housenumber ? ' ' + pr.housenumber : '')) : '';
    const parts = [pr.name, street, pr.postcode, pr.city || pr.village || pr.county, pr.state]
      .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    return { label: parts.join(', '), lat: c[1], lng: c[0] };
  }).filter((x) => x.lat != null && x.lng != null && x.label);
}

export function Azienda() {
  return {
    html: `<div class="screen no-nav az">
      <style>
      .az .az-mount{ flex:1; overflow-y:auto; display:flex; flex-direction:column; }
      .az .az-load{ flex:1; display:flex; align-items:center; justify-content:center; color:var(--muted); }
      .az .spin{ width:26px;height:26px;border-radius:50%;border:3px solid var(--bd);border-top-color:var(--verde);animation:azsp .8s linear infinite }
      @keyframes azsp{ to{ transform:rotate(360deg) } }
      .az .az-page{ width:100%; max-width:660px; margin:0 auto; }
      /* ---- hero ---- */
      .az .az-hero{ position:relative; height:224px; background:linear-gradient(155deg,#2f5f34,#0C7FB0); overflow:hidden; }
      .az .az-hero .cover{ position:absolute; inset:0; background-size:cover; background-position:center; }
      .az .az-hero .tex{ position:absolute; inset:0; opacity:.15; background-image:radial-gradient(rgba(255,255,255,.6) 1px, transparent 1.4px); background-size:16px 16px; }
      .az .az-hero::after{ content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(20,14,8,.06),rgba(20,14,8,.52)); }
      .az .az-htop{ position:absolute; top:0; left:0; right:0; z-index:3; display:flex; justify-content:space-between; padding:14px 16px; }
      .az .az-rbtn{ width:40px;height:40px;border-radius:50%;background:rgba(20,14,8,.34);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer; }
      .az .az-hcap{ position:absolute; z-index:3; left:0; right:0; bottom:20px; text-align:center; color:#fff; padding:0 20px; }
      .az .az-hcap .pn{ font-family:var(--serif); font-weight:600; font-size:29px; line-height:1.06; text-shadow:0 2px 18px rgba(0,0,0,.4); }
      .az .az-hcap .pl{ font-size:13.5px; opacity:.94; margin-top:4px; letter-spacing:.02em; }
      .az .az-covbtn{ position:absolute; z-index:4; right:14px; bottom:14px; height:34px; padding:0 13px; border-radius:100px; background:rgba(251,249,245,.94); backdrop-filter:blur(6px); border:none; font-family:inherit; font-size:12.5px; font-weight:600; color:var(--ink); display:inline-flex; align-items:center; gap:7px; box-shadow:0 4px 14px -4px rgba(20,14,8,.35); cursor:pointer; }
      .az .pill{ display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; padding:6px 12px; border-radius:100px; }
      .az .pill.draft{ background:rgba(251,249,245,.94); color:var(--terra-deep); }
      .az .pill.rev{ background:var(--celeste); color:#fff; }
      .az .pill.live{ background:var(--verde); color:#fff; }
      /* ---- corpo ---- */
      .az .az-body{ padding:26px 24px 12px; }
      /* eyebrow di sezione centrato con filetti */
      .az .sec{ display:flex; align-items:center; justify-content:center; gap:14px; margin:30px 0 16px; }
      .az .sec .ln{ height:1px; width:44px; background:linear-gradient(90deg,transparent,var(--bd3)); }
      .az .sec .ln.r{ background:linear-gradient(90deg,var(--bd3),transparent); }
      .az .sec .tt{ font-size:11px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:var(--muted2); white-space:nowrap; }
      .az .editlink{ display:inline-flex; align-items:center; gap:5px; font-size:12.5px; font-weight:600; color:var(--verde-deep); background:none; border:none; cursor:pointer; font-family:inherit; }
      .az .cen{ text-align:center; margin-top:12px; }
      .az .az-story{ font-size:15.5px; line-height:1.72; color:var(--ink-soft); text-align:center; max-width:52ch; margin:0 auto; }
      .az .az-story .fq{ font-family:var(--serif); font-style:italic; color:var(--ink); }
      /* slot vuoto che "si accende" */
      .az .slot{ max-width:460px; margin:0 auto; display:flex; align-items:center; gap:14px; width:100%; text-align:left; padding:18px; border:1.5px dashed var(--terra); border-radius:18px; background:rgba(194,160,122,.06); cursor:pointer; font-family:inherit; }
      .az .slot .si{ width:42px;height:42px;border-radius:12px;background:var(--terra-pale);color:var(--terra-deep);display:flex;align-items:center;justify-content:center;flex:none; }
      .az .slot .st{ flex:1; } .az .slot .st b{ display:block; font-size:14.5px; color:var(--ink); font-weight:600; }
      .az .slot .st span{ font-size:12.5px; color:var(--muted); }
      /* prodotti */
      .az .prods{ display:grid; grid-template-columns:repeat(auto-fit,minmax(164px,1fr)); gap:14px; }
      .az .prod{ background:var(--bianco); border:1px solid var(--bd); border-radius:18px; overflow:hidden; box-shadow:var(--sh-card); cursor:pointer; transition:transform .15s, box-shadow .15s; }
      .az .prod:hover{ transform:translateY(-2px); box-shadow:0 16px 34px -20px rgba(31,24,18,.4); }
      .az .prod .ph{ height:118px; background:center/cover; position:relative; }
      .az .prod .pencil{ position:absolute; right:8px; top:8px; width:28px;height:28px;border-radius:50%;background:rgba(251,249,245,.92);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(20,14,8,.2); }
      .az .prod .pb{ padding:11px 13px 13px; text-align:center; }
      .az .prod .pnm{ font-family:var(--serif); font-weight:600; font-size:15.5px; color:var(--ink); line-height:1.15; }
      .az .prod .pmt{ font-size:12.5px; color:var(--muted); margin-top:3px; }
      .az .prod .price{ font-weight:700; color:var(--ink); }
      .az .prod .tag{ display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; margin-top:9px; padding:4px 9px; border-radius:100px; }
      .az .prod .tag .d{ width:6px;height:6px;border-radius:50%;background:currentColor; }
      .az .prod.add{ display:flex; align-items:center; justify-content:center; flex-direction:column; gap:8px; border:1.5px dashed var(--terra); background:rgba(194,160,122,.06); color:var(--terra-deep); font-weight:600; font-size:13.5px; min-height:180px; box-shadow:none; }
      .az .prod.add .plus{ width:40px;height:40px;border-radius:50%;background:var(--bianco);display:flex;align-items:center;justify-content:center;box-shadow:var(--sh-card); }
      /* info card contatti / reach */
      .az .info{ max-width:420px; margin:0 auto; background:var(--bianco); border:1px solid var(--bd); border-radius:18px; box-shadow:var(--sh-card); overflow:hidden; }
      .az .info .r{ display:flex; align-items:center; gap:13px; padding:14px 18px; border-bottom:1px solid var(--bd2); font-size:14.5px; color:var(--ink-soft); }
      .az .info .r:last-child{ border-bottom:none; }
      .az .info .r .ic{ color:var(--terra-deep); flex:none; display:flex; }
      .az .info .r b{ color:var(--ink); font-weight:600; }
      /* guida in basso */
      .az .guide{ flex:none; border-top:1px solid var(--bd); background:var(--bianco); padding:12px 16px 16px; }
      .az .miss{ display:flex; gap:7px; overflow-x:auto; padding-bottom:9px; justify-content:center; }
      .az .miss span{ flex:none; font-size:11.5px; font-weight:600; color:var(--terra-deep); background:var(--terra-pale); border-radius:100px; padding:6px 11px; white-space:nowrap; }
      .az .cta{ width:100%; height:52px; border:none; border-radius:15px; background:var(--grad-azione); color:#fff; font-family:inherit; font-size:15.5px; font-weight:600; cursor:pointer; box-shadow:0 12px 26px -12px rgba(22,163,74,.6); display:flex; align-items:center; justify-content:center; gap:8px; }
      .az .cta[disabled]{ background:var(--bd3,#d8cdb8); color:#fff; box-shadow:none; cursor:not-allowed; }
      .az .cta.ghost{ background:var(--bianco); color:var(--ink); border:1px solid var(--bd3); box-shadow:none; max-width:340px; margin:0 auto; }
      /* stepper stato (B3) + barra progresso onboarding (B5) + spinner upload (B4) */
      .az .az-steps{ display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:13px; }
      .az .az-step{ font-size:11.5px; font-weight:700; color:var(--muted2); }
      .az .az-step.on{ color:var(--verde-deep); } .az .az-step.done{ color:var(--verde); }
      .az .az-steps i{ width:22px; height:2px; border-radius:2px; background:var(--bd2); }
      .az .az-steps i.done{ background:var(--verde); }
      .az .az-progress{ max-width:460px; margin:0 auto 2px; }
      .az .az-progress-h{ display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-bottom:6px; }
      .az .az-progress-h b{ color:var(--ink); }
      .az .az-bar{ height:8px; border-radius:100px; background:var(--carta2); overflow:hidden; }
      .az .az-bar > i{ display:block; height:100%; border-radius:100px; background:var(--grad-azione); transition:width .3s ease; }
      .az .az-spin{ display:inline-block; width:20px; height:20px; border-radius:50%; border:2.5px solid var(--bd); border-top-color:var(--verde); animation:azsp .8s linear infinite; }
      .az .banner{ max-width:460px; margin:0 auto; display:flex; gap:12px; align-items:center; text-align:left; border-radius:16px; padding:14px 18px; }
      .az .banner .bi{ width:40px;height:40px;border-radius:12px;flex:none;background:#fff;display:flex;align-items:center;justify-content:center; }
      .az .banner .bt b{ display:block; font-size:14.5px; color:var(--ink); } .az .banner .bt span{ font-size:12.5px; color:var(--muted); }
      /* intro / attesa */
      .az .intro{ flex:1; overflow-y:auto; padding:0 20px 24px; width:100%; max-width:660px; margin:0 auto; }
      .az .intro .hh{ font-family:var(--serif); font-weight:600; font-size:27px; line-height:1.12; margin:6px 0 8px; }
      .az .intro .hh em{ font-style:italic; color:var(--verde); }
      .az .intro .step{ display:flex; gap:13px; padding:12px 0; }
      .az .intro .step .sn{ font-family:var(--serif); font-style:italic; font-weight:500; font-size:22px; color:var(--terra-deep); flex:none; width:26px; }
      .az .intro .step b{ font-size:14.5px; color:var(--ink); } .az .intro .step p{ font-size:13px; color:var(--muted); margin-top:1px; }
      .az .az-in{ width:100%; font-family:inherit; font-size:15px; color:var(--ink); background:var(--bianco); border:1px solid var(--bd); border-radius:13px; padding:13px 14px; outline:none; }
      .az .az-in::placeholder{ color:var(--faint); }
      .az .az-cats{ display:flex; flex-wrap:wrap; gap:7px; }
      .az .az-chip{ font-size:13px; font-weight:600; padding:8px 13px; border-radius:100px; background:var(--bianco); border:1px solid var(--bd); cursor:pointer; user-select:none; }
      .az .az-chip.on{ background:var(--verde); color:#fff; border-color:var(--verde); }
      /* desktop: colonna-scheda, non stirata */
      @media(min-width:860px){
        .az .az-hero{ height:240px; border-radius:20px; margin-top:16px; }
        .az .az-body{ padding:22px 8px 26px; }
        .az .guide{ background:transparent; border-top:none; padding:16px 8px 24px; }
      }
      /* sheet di editing */
      .az-sheet-bd{ position:fixed; inset:0; z-index:120; background:rgba(20,14,8,.42); display:flex; align-items:flex-end; justify-content:center; }
      .az-sheet{ width:100%; max-width:440px; background:var(--carta); border-radius:22px 22px 0 0; padding:18px 20px 22px; max-height:88vh; overflow-y:auto; box-shadow:0 -14px 40px -12px rgba(20,14,8,.5); }
      .az-sheet .grab{ width:38px;height:5px;border-radius:100px;background:var(--bd3,#d8cdb8);margin:0 auto 12px; }
      .az-sheet h3{ font-family:var(--serif); font-weight:600; font-size:21px; margin-bottom:4px; text-align:center; }
      .az-sheet .subt{ text-align:center; font-size:12.5px; color:var(--muted); margin-bottom:14px; }
      .az-sheet .fl{ font-size:12px; font-weight:600; color:var(--ink-soft); margin:14px 2px 7px; }
      .az-sheet input, .az-sheet textarea, .az-sheet select{ width:100%; font-family:inherit; font-size:15px; color:var(--ink); background:var(--bianco); border:1px solid var(--bd); border-radius:13px; padding:13px 14px; outline:none; }
      .az-sheet textarea{ min-height:92px; resize:vertical; line-height:1.5; }
      .az-sheet .price-in{ display:flex; align-items:center; background:var(--bianco); border:1px solid var(--bd); border-radius:13px; padding:0 14px; }
      .az-sheet .price-in .cur{ font-weight:700; color:var(--terra-deep); font-size:15px; }
      .az-sheet .price-in input{ flex:1; border:none; background:none; padding:13px 8px; border-radius:0; }
      .az-sheet .price-in .per{ font-size:13px; color:var(--muted); white-space:nowrap; }
      .az-sheet .always{ display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:600; padding:9px 14px; border-radius:100px; background:var(--bianco); border:1px solid var(--bd); cursor:pointer; user-select:none; margin-bottom:9px; }
      .az-sheet .always.on{ background:var(--verde); color:#fff; border-color:var(--verde); }
      .az-sheet .mgrid{ display:grid; grid-template-columns:repeat(4,1fr); gap:7px; }
      .az-sheet .mcell{ text-align:center; padding:11px 0; border-radius:10px; font-size:13px; font-weight:600; background:var(--bianco); border:1px solid var(--bd2); cursor:pointer; color:var(--ink-soft); user-select:none; }
      .az-sheet .mcell.on{ background:var(--verde); color:#fff; border-color:var(--verde); box-shadow:0 4px 12px -4px rgba(22,163,74,.5); }
      .az-sheet .thumbs{ display:flex; gap:9px; flex-wrap:wrap; }
      .az-sheet .thumb{ width:66px;height:66px;border-radius:12px;background:var(--carta2) center/cover;position:relative; }
      .az-sheet .thumb .rm{ position:absolute; right:-6px; top:-6px; width:22px;height:22px;border-radius:50%;background:var(--ink);color:#fff;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px; }
      .az-sheet .thumb.add{ border:1.5px dashed var(--terra); background:var(--bianco); display:flex; align-items:center; justify-content:center; color:var(--terra-deep); cursor:pointer; }
      .az-sheet .save{ width:100%; height:52px; margin-top:20px; border:none; border-radius:14px; background:var(--grad-azione); color:#fff; font-family:inherit; font-size:15.5px; font-weight:600; cursor:pointer; }
      .az-sheet .del{ width:100%; height:44px; margin-top:9px; border:1px solid #eecfca; border-radius:12px; background:#fff; color:var(--red-alert,#C0392B); font-family:inherit; font-weight:600; cursor:pointer; }
      .az-sheet .chkrow{ display:flex; gap:10px; align-items:flex-start; margin-top:6px; font-size:13px; color:var(--ink-soft); line-height:1.5; }
      .az-sheet .chkrow input{ width:20px;height:20px;flex:none;margin-top:1px; }
      @media(min-width:860px){
        .az-sheet-bd{ align-items:center; }
        .az-sheet{ border-radius:20px; max-height:86vh; box-shadow:0 30px 80px -20px rgba(20,14,8,.55); }
        .az-sheet .grab{ display:none; }
      }
      </style>
      <div class="az-mount"><div class="az-load"><div class="spin"></div></div></div>
    </div>`,
    onMount(root) { mount(root); },
  };
}

// ============================ controller ============================
async function mount(root) {
  const host = root.querySelector('.az-mount');
  let data = null;
  async function refresh() {
    try { data = await getMyProducer(); } catch (e) { data = { status: (currentUser() || {}).producerStatus || null, producer: null, readiness: null }; }
    paint();
  }
  function paint() {
    const status = data.status;
    if (!status) return renderIntro(host, refresh);
    if (status === 'requested') return renderWaiting(host);
    return renderVetrina(host, data, refresh);
  }
  await refresh();
  markProducerSeen(); // aprendo l'area, la notifica di stato è "vista" → il pallino sparirà
}

// -------- stato: non ancora produttore → FORM di richiesta --------
function renderIntro(host, refresh) {
  const cats = getState().categories || [];
  const picked = new Set();
  const fl = (t) => `<div class="fl" style="font-size:12px;font-weight:600;color:var(--ink-soft);margin:16px 2px 6px">${t}</div>`;
  host.innerHTML = `
    ${StatusBar()}
    <div style="display:flex;align-items:center;gap:10px;padding:10px 16px 0">
      <button class="az-rbtn" style="background:var(--bianco);border:1px solid var(--bd)" data-back>${IC.back('var(--ink)')}</button>
      <div style="font-family:var(--serif);font-weight:600;font-size:18px">Diventa produttore</div>
    </div>
    <div class="intro">
      <div style="height:132px;border-radius:20px;margin-top:14px;background:linear-gradient(155deg,#2f5f34,#0C7FB0);position:relative;overflow:hidden">
        <div class="tex" style="position:absolute;inset:0;opacity:.15;background-image:radial-gradient(rgba(255,255,255,.6) 1px,transparent 1.4px);background-size:16px 16px"></div>
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(20,14,8,.42))"></div>
        <div style="position:absolute;left:18px;bottom:15px;color:#fff">
          <div style="font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.85)">Gaia Food · per chi produce</div>
          <div style="font-family:var(--serif);font-weight:600;font-size:21px;margin-top:3px">La tua azienda sulla mappa</div>
        </div>
      </div>
      <h2 class="hh">Raccontaci la tua <em>azienda</em></h2>
      <p style="font-size:14px;color:var(--ink-soft);line-height:1.55">Compila la richiesta: ci arriva, ti sblocchiamo l'area e da lì carichi con calma prodotti e foto. Poi <b>veniamo di persona</b> a confermare e pubblicare col badge.</p>
      ${fl('Nome dell\'azienda *')}<input class="az-in" data-f="name" placeholder="Es. Cascina di Claudio">
      ${fl('Comune / zona')}<input class="az-in" data-f="place" placeholder="Es. Villetta Barrea (AQ)">
      ${fl('Cosa produci')}<div class="az-cats" data-cats>${cats.map((c) => `<span class="az-chip" data-cat="${c.id}">${esc(c.label)}</span>`).join('') || '<span style="font-size:12.5px;color:var(--muted)">—</span>'}</div>
      ${fl('Telefono')}<input class="az-in" data-f="phone" inputmode="tel" placeholder="+39 3XX XXXXXXX">
      ${fl('WhatsApp (se diverso)')}<input class="az-in" data-f="whatsapp" inputmode="tel" placeholder="+39 3XX XXXXXXX">
      ${fl('Due righe su di te (facoltativo)')}<textarea class="az-in" data-f="note" style="min-height:80px;resize:vertical" placeholder="Come lavori, cosa ti rende diverso…"></textarea>
      <div style="height:8px"></div>
    </div>
    <div class="guide"><div class="az-page"><button class="cta" data-req disabled>Invia la richiesta</button></div></div>`;
  host.querySelector('[data-back]').onclick = () => history.back();
  const nameInp = host.querySelector('[data-f=name]');
  const btn = host.querySelector('[data-req]');
  const syncBtn = () => { const ok = nameInp.value.trim().length > 1; btn.disabled = !ok; btn.style.opacity = ok ? '1' : '.5'; };
  nameInp.addEventListener('input', syncBtn); syncBtn();
  host.querySelector('[data-cats]').onclick = (e) => {
    const el = e.target.closest('[data-cat]'); if (!el) return;
    const id = el.getAttribute('data-cat');
    if (picked.has(id)) { picked.delete(id); el.classList.remove('on'); } else { picked.add(id); el.classList.add('on'); }
  };
  btn.onclick = async () => {
    const g = (f) => (host.querySelector(`[data-f=${f}]`) || {}).value || '';
    btn.disabled = true; btn.textContent = 'Invio…';
    try {
      await requestProducer({
        name: g('name').trim(), place: g('place').trim(), categories: [...picked],
        contact: { phone: g('phone').trim(), whatsapp: g('whatsapp').trim() }, note: g('note').trim(),
      });
      await refresh();
    } catch (e) { btn.disabled = false; btn.textContent = 'Invia la richiesta'; toast('Non è stato possibile inviare la richiesta. Riprova.', 'error'); }
  };
}

// -------- stato: richiesta inviata, in attesa di sblocco --------
function renderWaiting(host) {
  host.innerHTML = `
    ${StatusBar()}
    <div style="display:flex;align-items:center;gap:10px;padding:10px 16px 0">
      <button class="az-rbtn" style="background:var(--bianco);border:1px solid var(--bd)" data-back>${IC.back('var(--ink)')}</button>
      <div style="font-family:var(--serif);font-weight:600;font-size:18px">La mia area</div>
    </div>
    <div class="intro" style="display:flex;flex-direction:column;justify-content:center;text-align:center;align-items:center">
      <div style="width:78px;height:78px;border-radius:50%;background:var(--celeste-pale);color:var(--celeste-deep);display:flex;align-items:center;justify-content:center;margin-bottom:16px">${IC.clock('var(--celeste-deep)', 34)}</div>
      <h2 class="hh" style="text-align:center">Richiesta inviata ✓</h2>
      <p style="font-size:14.5px;color:var(--ink-soft);line-height:1.6;max-width:320px">Ti sblocchiamo a breve l'area della tua azienda. Appena pronta, potrai <b>caricare i tuoi prodotti e le informazioni</b>: poi verremo di persona a confermare tutto e pubblicare la scheda.</p>
      <div style="margin-top:18px;font-size:12.5px;color:var(--muted)">Ti avvisiamo qui dentro quando è pronta.</div>
    </div>`;
  host.querySelector('[data-back]').onclick = () => history.back();
}

// -------- stato: approvato/onboarding/in-verifica/live → Vetrina viva --------
function renderVetrina(host, data, refresh) {
  const p = data.producer || {};
  const missing = data.readiness || [];
  const cats = getState().categories || [];
  const published = p.status === 'published';
  const inReview = p.status === 'in_review';

  // Stepper stato (B3): dà il "cosa succede ora / dove sei" — Bozza → In verifica → Live.
  const stage = published ? 'live' : (inReview ? 'review' : 'draft');
  const stepper = `<div class="az-steps">
    <span class="az-step ${stage === 'draft' ? 'on' : 'done'}">Bozza</span>
    <i class="${stage !== 'draft' ? 'done' : ''}"></i>
    <span class="az-step ${stage === 'review' ? 'on' : (stage === 'live' ? 'done' : '')}">In verifica</span>
    <i class="${stage === 'live' ? 'done' : ''}"></i>
    <span class="az-step ${stage === 'live' ? 'on' : ''}">Live</span></div>`;
  // Barra progresso onboarding (B5): quota dei 4 blocchi tassativi completati. Solo mentre si compila.
  const pct = Math.max(0, Math.min(100, Math.round((4 - missing.length) / 4 * 100)));
  const progress = (!published && !inReview)
    ? `<div class="az-progress"><div class="az-progress-h"><span>La tua vetrina</span><b>${pct}% completa</b></div><div class="az-bar"><i style="width:${pct}%"></i></div></div>`
    : '';

  const statusPill = published
    ? `<span class="pill live">${IC.check('#fff', 13)} Live</span>`
    : inReview ? `<span class="pill rev">${IC.clock('#fff', 13)} In verifica</span>`
      : `<span class="pill draft">● In bozza</span>`;
  const cover = p.photo ? `<div class="cover" style="background-image:url('${esc(p.photo)}');background-position:${esc(p.photoPos) || 'center'}"></div>` : '';
  const secH = (t) => `<div class="sec"><span class="ln"></span><span class="tt">${t}</span><span class="ln r"></span></div>`;
  const editLink = (action, label = 'Modifica') => `<div class="cen"><button class="editlink" data-edit-${action}>${pencil('var(--verde-deep)')} ${label}</button></div>`;

  // storia
  const storyBlock = p.story
    ? secH('La mia storia') + `<p class="az-story">${esc(p.story)}</p>` + editLink('story')
    : secH('La mia storia') + `<button class="slot" data-edit-story><span class="si">${IC.leaf('var(--terra-deep)')}</span><span class="st"><b>Racconta la tua storia</b><span>Chi sei, come lavori — è ciò che fa innamorare chi legge.</span></span></button>`;

  // prodotti
  const prodCard = (pr) => {
    const a = availMeta[pr.availability] || availMeta.available;
    const priceStr = (pr.price != null && pr.price !== '') ? `<span class="price">€ ${euro(pr.price)}</span>` : '';
    const pmt = [priceStr, esc(pr.unit)].filter(Boolean).join(' · ');
    const bg = (pr.photos && pr.photos[0]) ? `background-image:url('${esc(pr.photos[0])}')` : 'background:linear-gradient(135deg,var(--terra-pale),var(--carta2))';
    return `<button class="prod" data-edit-prod="${pr.id}">
      <div class="ph" style="${bg}"><span class="pencil">${pencil('var(--ink)')}</span></div>
      <div class="pb"><div class="pnm">${esc(pr.name) || 'Senza nome'}</div>
        ${pmt ? `<div class="pmt">${pmt}</div>` : ''}
        <span class="tag" style="background:${a.bg};color:${a.c}"><span class="d"></span> ${a.t}</span></div>
    </button>`;
  };
  const products = Array.isArray(p.products) ? p.products : [];
  const prodBlock = secH(`I miei prodotti · ${products.length}`) + (products.length
    ? `<div class="prods">${products.map(prodCard).join('')}<button class="prod add" data-add-prod><span class="plus">${IC.plus('var(--verde-deep)', 20)}</span> Aggiungi</button></div>`
    : `<button class="slot" data-add-prod><span class="si">${IC.plus('var(--terra-deep)')}</span><span class="st"><b>Aggiungi il tuo primo prodotto</b><span>Nome, qualche foto, l'unità, il prezzo e in che mesi c'è.</span></span></button>`);

  // contatti
  const c = p.contact || {};
  const hasPhone = (c.whatsapp || '').trim() || (c.phone || '').trim();
  const contactBlock = hasPhone
    ? secH('Contatti') + `<div class="info">
         ${c.whatsapp ? `<div class="r"><span class="ic">${IC.wa('var(--terra-deep)', 19)}</span> WhatsApp · <b>${esc(c.whatsapp)}</b></div>` : ''}
         ${c.phone ? `<div class="r"><span class="ic">${IC.phone('var(--terra-deep)', 19)}</span> Telefono · <b>${esc(c.phone)}</b></div>` : ''}
         ${c.email ? `<div class="r"><span class="ic">${IC.mail('var(--terra-deep)', 19)}</span> <b>${esc(c.email)}</b></div>` : ''}
       </div>` + editLink('contact')
    : secH('Contatti') + `<button class="slot" data-edit-contact><span class="si">${IC.phone('var(--terra-deep)')}</span><span class="st"><b>Aggiungi un numero</b><span>È il bottone «Chiama» che vede il cliente.</span></span></button>`;

  // come si raggiunge
  const hasReach = (p.address || '').trim() && (p.hours || '').trim();
  const reachBlock = hasReach
    ? secH('Come si raggiunge') + `<div class="info">
         <div class="r"><span class="ic">${IC.clock('var(--terra-deep)', 19)}</span> ${esc(p.hours)}</div>
         <div class="r"><span class="ic">${IC.pin('var(--terra-deep)', 19)}</span> ${esc(p.address)}</div>
       </div>` + editLink('reach')
    : secH('Come si raggiunge') + `<button class="slot" data-edit-reach><span class="si">${IC.pin('var(--terra-deep)')}</span><span class="st"><b>Indirizzo e orari</b><span>Dove sei e quando si può venire.</span></span></button>`;

  // guida in basso
  const missLabels = { product: 'Un prodotto completo', identity: 'Storia + foto', phone: 'Un telefono', reach: 'Indirizzo + orari' };
  let guide;
  if (published) {
    guide = `<div class="banner" style="background:var(--verde-pale)"><span class="bi">${IC.check('var(--verde-deep)', 20)}</span>
      <div class="bt"><b>La tua scheda è live</b><span>Le modifiche che fai qui vanno online subito.</span></div></div>
      <a class="cta ghost" style="margin-top:14px;text-decoration:none" href="#/produttore/${p.id}" data-link>${IC.eye('var(--ink)', 17)} Vedi come ti vedono</a>`;
  } else if (inReview) {
    guide = `<div class="banner" style="background:var(--celeste-pale)"><span class="bi">${IC.clock('var(--celeste-deep)', 20)}</span>
      <div class="bt"><b>Richiesta inviata</b><span>Veniamo di persona a confermare e pubblicare. Intanto puoi ancora ritoccare.</span></div></div>`;
  } else {
    const ready = missing.length === 0;
    guide = `${missing.length ? `<div class="miss">${missing.map((m) => `<span>${missLabels[m] || m}</span>`).join('')}</div>` : `<div style="font-size:12.5px;color:var(--verde-deep);font-weight:600;text-align:center;margin-bottom:9px">Tutto pronto ✓</div>`}
      <button class="cta" data-submit ${ready ? '' : 'disabled'}>${ready ? 'Invia per la verifica' : 'Completa i punti mancanti'}</button>`;
  }

  host.innerHTML = `
    <div class="az-mount-inner" style="display:flex;flex-direction:column;flex:1;overflow:hidden">
      <div style="flex:1;overflow-y:auto">
        <div class="az-page">
          <div class="az-hero">
            ${cover}<div class="tex"></div>
            <div class="az-htop"><button class="az-rbtn" data-back>${IC.back('#fff')}</button>${statusPill}</div>
            <div class="az-hcap"><div class="pn">${esc(p.name) || 'La tua azienda'}</div><div class="pl">${esc(p.place) || 'Aggiungi il comune'}</div></div>
            <button class="az-covbtn" data-cover>${IC.camera('var(--terra-deep)', 14)} ${p.photo ? 'Cambia foto' : 'Foto copertina'}</button>
          </div>
          <div class="az-body">
            ${progress}
            <div class="cen" style="margin-top:0"><button class="editlink" data-edit-head>${pencil('var(--verde-deep)')} Nome e comune</button></div>
            ${storyBlock}
            ${prodBlock}
            ${contactBlock}
            ${reachBlock}
          </div>
        </div>
      </div>
      <div class="guide"><div class="az-page">${stepper}${guide}</div></div>
    </div>`;

  // ---- wiring ----
  const q = (s) => host.querySelector(s);
  q('[data-back]').onclick = () => history.back();
  const coverBtn = q('[data-cover]');
  if (coverBtn) coverBtn.onclick = () => pickImage(async (dataUrl) => {
    const pos = await repositionCover(dataUrl); // trascinamento focal point → "x% y%" o null se annullato
    if (pos === null) return;
    coverBtn.textContent = 'Carico…';
    try { const url = await uploadProducerMedia(dataUrl); await patchMyProducer({ photo: url, photoPos: pos }); await refresh(); }
    catch (e) { toast('Upload non riuscito. Riprova.', 'error'); await refresh(); }
  });
  q('[data-edit-head]').onclick = () => editHead(p, refresh);
  const es = q('[data-edit-story]'); if (es) es.onclick = () => editStory(p, refresh);
  const ec = q('[data-edit-contact]'); if (ec) ec.onclick = () => editContact(p, refresh);
  const er = q('[data-edit-reach]'); if (er) er.onclick = () => editReach(p, refresh);
  const ap = q('[data-add-prod]'); if (ap) ap.onclick = () => editProduct(null, cats, refresh);
  host.querySelectorAll('[data-edit-prod]').forEach((b) => b.onclick = () => {
    const pr = products.find((x) => x.id === b.getAttribute('data-edit-prod'));
    if (pr) editProduct(pr, cats, refresh);
  });
  const sub = q('[data-submit]'); if (sub) sub.onclick = () => confirmSubmit(refresh);
}

// ============================ sheets ============================
function openSheet(innerHTML, wire) {
  const bd = document.createElement('div'); bd.className = 'az-sheet-bd';
  bd.innerHTML = `<div class="az-sheet"><div class="grab"></div>${innerHTML}</div>`;
  const close = () => { document.removeEventListener('keydown', onKey); bd.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bd.onclick = (e) => { if (e.target === bd) close(); };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bd); // su body: il backdrop copre l'intera finestra, il modale si centra davvero
  wire(bd.querySelector('.az-sheet'), close);
}

function editHead(p, refresh) {
  openSheet(`<h3>Nome e comune</h3>
    <div class="fl">Nome dell'azienda</div><input data-f="name" value="${esc(p.name)}" placeholder="Es. Cascina di Claudio">
    <div class="fl">Comune</div><input data-f="place" value="${esc(p.place)}" placeholder="Es. Villetta Barrea">
    <button class="save">Salva</button>`, (sh, close) => {
    sh.querySelector('.save').onclick = async () => {
      await patchMyProducer({ name: sh.querySelector('[data-f=name]').value.trim(), place: sh.querySelector('[data-f=place]').value.trim() });
      close(); await refresh();
    };
  });
}

function editStory(p, refresh) {
  openSheet(`<h3>La tua storia</h3>
    <div class="fl">Racconta chi sei e come lavori</div>
    <textarea data-f="story" placeholder="Ho lasciato la città per tornare al pascolo di famiglia…">${esc(p.story)}</textarea>
    <div style="font-size:11.5px;color:var(--faint);margin-top:6px">Suggerimento: una frase forte tra «virgolette» diventa la citazione in evidenza.</div>
    <button class="save">Salva</button>`, (sh, close) => {
    sh.querySelector('.save').onclick = async () => {
      await patchMyProducer({ story: sh.querySelector('[data-f=story]').value.trim() });
      close(); await refresh();
    };
  });
}

function editContact(p, refresh) {
  const c = p.contact || {};
  openSheet(`<h3>Contatti</h3>
    <div class="fl">WhatsApp</div><input data-f="whatsapp" inputmode="tel" value="${esc(c.whatsapp)}" placeholder="+39 3XX XXXXXXX">
    <div class="fl">Telefono</div><input data-f="phone" inputmode="tel" value="${esc(c.phone)}" placeholder="+39 0XXX XXXXXX">
    <div class="fl">Email (facoltativa)</div><input data-f="email" inputmode="email" value="${esc(c.email)}" placeholder="nome@azienda.it">
    <button class="save">Salva</button>`, (sh, close) => {
    sh.querySelector('.save').onclick = async () => {
      await patchMyProducer({ contact: {
        whatsapp: sh.querySelector('[data-f=whatsapp]').value.trim(),
        phone: sh.querySelector('[data-f=phone]').value.trim(),
        email: sh.querySelector('[data-f=email]').value.trim(),
      } });
      close(); await refresh();
    };
  });
}

function editReach(p, refresh) {
  openSheet(`<h3>Come si raggiunge</h3>
    <style>
      .geo-wrap{ position:relative; }
      .geo-sug{ position:absolute; left:0; right:0; top:calc(100% + 4px); z-index:5; background:#fff; border:1px solid var(--bd,#E4DBCB); border-radius:12px; box-shadow:0 16px 40px -18px rgba(31,24,18,.4); overflow:hidden; max-height:230px; overflow-y:auto; }
      .geo-item{ display:block; width:100%; text-align:left; padding:11px 13px; font-size:13.5px; color:var(--ink-soft,#544a40); background:#fff; border:none; border-top:1px solid #f0e9dc; cursor:pointer; }
      .geo-item:first-child{ border-top:none; } .geo-item:hover{ background:var(--verde-pale,#E7F5EC); }
      .geo-map{ height:180px; border-radius:14px; overflow:hidden; margin:10px 0 4px; border:1px solid var(--bd,#E4DBCB); background:#eee; }
      .geo-note{ font-size:12.5px; font-weight:600; color:var(--verde-deep,#15803D); margin-bottom:6px; min-height:16px; }
      .geo-tip{ font-weight:400; font-size:12px; color:var(--muted,#796d5f); }
    </style>
    <div class="fl">Indirizzo <span class="geo-tip">— scrivi e scegli dal menù, finisci sulla mappa</span></div>
    <div class="geo-wrap">
      <input data-f="address" value="${esc(p.address)}" placeholder="Scrivi l'indirizzo…" autocomplete="off">
      <div class="geo-sug" data-sug hidden></div>
    </div>
    <div class="geo-map" data-geomap hidden></div>
    <div class="geo-note" data-geonote></div>
    <div class="fl">Orari / quando si può venire</div><input data-f="hours" value="${esc(p.hours)}" placeholder="Tutti i giorni 8–19, la domenica su chiamata">
    <div class="fl">Indicazioni utili (facoltativo)</div><input data-f="howToReach" value="${esc(p.howToReach)}" placeholder="Dopo il ponte, prima cascina a destra">
    <button class="save">Salva</button>`, (sh, close) => {
    let lat = (p.lat != null ? p.lat : null), lng = (p.lng != null ? p.lng : null), picked = false;
    const addrIn = sh.querySelector('[data-f=address]');
    const sug = sh.querySelector('[data-sug]');
    const mapDiv = sh.querySelector('[data-geomap]');
    const note = sh.querySelector('[data-geonote]');
    let pmap = null, marker = null, tmr = null;

    const showMap = (la, ln) => {
      mapDiv.hidden = false;
      if (!pmap) {
        pmap = initMap(mapDiv, [], { center: [ln, la], me: false });
        if (pmap && window.maplibregl) pmap.on('load', () => { marker = new maplibregl.Marker({ color: '#16A34A' }).setLngLat([ln, la]).addTo(pmap); });
      } else {
        pmap.flyTo({ center: [ln, la], zoom: 14 });
        if (marker) marker.setLngLat([ln, la]);
        else if (window.maplibregl) marker = new maplibregl.Marker({ color: '#16A34A' }).setLngLat([ln, la]).addTo(pmap);
      }
      note.textContent = '📍 Posizione agganciata alla mappa';
    };
    if (lat != null && lng != null) showMap(lat, lng); // già geolocalizzato: mostra subito

    addrIn.oninput = () => {
      picked = false;
      const q = addrIn.value.trim();
      clearTimeout(tmr);
      if (q.length < 4) { sug.hidden = true; return; }
      tmr = setTimeout(async () => {
        let res = [];
        try { res = await geocode(q); } catch { sug.hidden = true; return; }
        if (!res.length) { sug.hidden = true; return; }
        sug.innerHTML = res.map((r, i) => `<button type="button" class="geo-item" data-i="${i}">${esc(r.label)}</button>`).join('');
        sug.hidden = false;
        sug.querySelectorAll('.geo-item').forEach((b) => b.onclick = () => {
          const r = res[+b.getAttribute('data-i')];
          addrIn.value = r.label; lat = r.lat; lng = r.lng; picked = true;
          sug.hidden = true; showMap(lat, lng);
        });
      }, 320);
    };
    document.addEventListener('click', (e) => { if (!sh.querySelector('.geo-wrap').contains(e.target)) sug.hidden = true; });

    sh.querySelector('.save').onclick = async () => {
      const patch = {
        address: addrIn.value.trim(),
        hours: sh.querySelector('[data-f=hours]').value.trim(),
        howToReach: sh.querySelector('[data-f=howToReach]').value.trim(),
      };
      if (picked && lat != null && lng != null) { patch.lat = lat; patch.lng = lng; } // aggancio mappa solo se scelto ora
      await patchMyProducer(patch);
      close(); await refresh();
    };
  });
}

function editProduct(existing, cats, refresh) {
  const pr = existing || { name: '', category: '', unit: '', photos: [], months: [], always: false, price: null, description: '' };
  let photos = [...(pr.photos || [])];
  let months = [...(pr.months || [])];
  let always = !!pr.always;

  const catOpts = ['<option value="">Categoria…</option>', ...cats.map((c) => `<option value="${c.id}" ${pr.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`)].join('');

  openSheet(`<h3>${existing ? 'Modifica prodotto' : 'Nuovo prodotto'}</h3>
    <div class="subt">Nome, foto, prezzo e in che mesi c'è.</div>
    <div class="fl">Nome</div><input data-f="name" value="${esc(pr.name)}" placeholder="Es. Uova fresche">
    <div class="fl">Categoria</div><select data-f="category">${catOpts}</select>
    <div class="fl">Unità di vendita</div><input data-f="unit" value="${esc(pr.unit)}" placeholder="dozzina · litro · kg · vasetto">
    <div class="fl">Prezzo (facoltativo)</div>
    <div class="price-in"><span class="cur">€</span><input data-f="price" inputmode="decimal" value="${pr.price != null ? euro(pr.price) : ''}" placeholder="0,00"><span class="per" data-per>${pr.unit ? '/ ' + esc(pr.unit) : ''}</span></div>
    <div class="fl">Foto (max 7)</div>
    <div class="thumbs" data-thumbs></div>
    <div class="fl">In che mesi c'è?</div>
    <div><span class="always ${always ? 'on' : ''}" data-always>Sempre disponibile</span></div>
    <div class="mgrid" data-months>${MONTHS.map((m, i) => `<span class="mcell ${months.includes(i + 1) ? 'on' : ''}" data-m="${i + 1}">${m}</span>`).join('')}</div>
    <div class="fl">Com'è fatto / da dove viene (facoltativo)</div><textarea data-f="description" placeholder="Galline all'aperto, mangime naturale">${esc(pr.description)}</textarea>
    <button class="save">${existing ? 'Salva modifiche' : 'Aggiungi prodotto'}</button>
    ${existing ? '<button class="del">Elimina prodotto</button>' : ''}`, (sh, close) => {
    // "/ unità" del prezzo si aggiorna quando cambio l'unità
    const unitInp = sh.querySelector('[data-f=unit]');
    unitInp.addEventListener('input', () => { const per = sh.querySelector('[data-per]'); if (per) per.textContent = unitInp.value.trim() ? '/ ' + unitInp.value.trim() : ''; });
    // sempre / mesi
    const alwaysEl = sh.querySelector('[data-always]');
    const mgrid = sh.querySelector('[data-months]');
    const paintAlways = () => { alwaysEl.classList.toggle('on', always); mgrid.style.opacity = always ? '.4' : '1'; mgrid.style.pointerEvents = always ? 'none' : 'auto'; };
    alwaysEl.onclick = () => { always = !always; if (always) months = []; sh.querySelectorAll('[data-months] .mcell').forEach((c) => c.classList.remove('on')); paintAlways(); };
    mgrid.onclick = (e) => { const el = e.target.closest('[data-m]'); if (!el) return; const m = +el.getAttribute('data-m'); const i = months.indexOf(m); if (i >= 0) { months.splice(i, 1); el.classList.remove('on'); } else { months.push(m); el.classList.add('on'); } };
    paintAlways();
    // foto
    const thumbsEl = sh.querySelector('[data-thumbs]');
    const paintThumbs = () => {
      thumbsEl.innerHTML = photos.map((u, i) => `<div class="thumb" style="background-image:url('${esc(u)}')"><button class="rm" data-rm="${i}">×</button></div>`).join('')
        + (photos.length < 7 ? `<div class="thumb add" data-addphoto>${IC.plus('var(--terra-deep)', 20)}</div>` : '');
      const add = thumbsEl.querySelector('[data-addphoto]');
      if (add) add.onclick = () => pickImages(async (dataUrls) => {
        add.innerHTML = '<span class="az-spin"></span>'; add.style.pointerEvents = 'none';
        for (const dataUrl of dataUrls) {
          if (photos.length >= 7) { toast('Massimo 7 foto per prodotto.', 'info'); break; }
          try { const url = await uploadProducerMedia(dataUrl); photos.push(url); paintThumbs(); }
          catch (e) { toast('Una foto non è stata caricata.', 'error'); }
        }
        paintThumbs();
      }, { max: 7 });
      thumbsEl.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { photos.splice(+b.getAttribute('data-rm'), 1); paintThumbs(); });
    };
    paintThumbs();
    // salva
    sh.querySelector('.save').onclick = async () => {
      const payload = {
        name: sh.querySelector('[data-f=name]').value.trim(),
        category: sh.querySelector('[data-f=category]').value,
        unit: unitInp.value.trim(),
        price: parsePrice(sh.querySelector('[data-f=price]').value),
        description: sh.querySelector('[data-f=description]').value.trim(),
        photos, months, always,
      };
      try {
        if (existing) await updateMyProduct(existing.id, payload); else await addMyProduct(payload);
        close(); await refresh();
      } catch (e) { toast('Salvataggio non riuscito. Riprova.', 'error'); }
    };
    const del = sh.querySelector('.del');
    if (del) del.onclick = async () => { if (!(await confirmSheet('Eliminare questo prodotto?', { okLabel: 'Elimina', danger: true }))) return; await deleteMyProduct(existing.id); close(); await refresh(); };
  });
}

function confirmSubmit(refresh) {
  openSheet(`<h3>Invia per la verifica</h3>
    <p style="font-size:14px;color:var(--ink-soft);line-height:1.6;text-align:center">Perfetto! La tua vetrina è completa. Inviala: verremo di persona a <b>confermare tutto e girare i video</b>, poi la scheda va live col badge «Verificato sul campo».</p>
    <label class="chkrow"><input type="checkbox" data-accept> <span>Dichiaro che le informazioni sono vere e autorizzo Gaia Food a usare foto/video e i contatti nella scheda pubblica. La liberatoria completa la firmiamo di persona.</span></label>
    <button class="save" data-go disabled>Invia per la verifica</button>`, (sh, close) => {
    const chk = sh.querySelector('[data-accept]'); const go = sh.querySelector('[data-go]');
    go.style.opacity = '.5';
    chk.onchange = () => { go.disabled = !chk.checked; go.style.opacity = chk.checked ? '1' : '.5'; };
    go.onclick = async () => {
      go.disabled = true; go.textContent = 'Invio…';
      try { await submitMyProducer({ acceptTerms: true }); close(); await refresh(); }
      catch (e) { toast('Manca ancora qualcosa per inviare. Controlla i punti evidenziati.', 'error'); go.disabled = false; go.textContent = 'Invia per la verifica'; close(); await refresh(); }
    };
  });
}
