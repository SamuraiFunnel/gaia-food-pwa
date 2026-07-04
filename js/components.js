import { Icon } from './icons.js';
import { t, locDate } from './i18n.js';

// Etichetta categoria localizzata: t('cat.<id>') con fallback all'etichetta dei dati.
// c può essere l'oggetto categoria {id,label} o direttamente l'id (string).
export const catLabel = (c) => {
  const id = (c && typeof c === 'object') ? c.id : c;
  const k = 'cat.' + id;
  const v = t(k);
  return v === k ? ((c && typeof c === 'object' && c.label) || String(id)) : v;
};

// Spaziatore per la safe-area (notch) in standalone. In Safari safe-area-inset-top=0 → nessuno spazio.
// Prima mostrava un'ora "9:41" e una batteria "100%" finte: rimosse, erano un residuo da wireframe.
export const StatusBar = () => `<div class="statusbar" aria-hidden="true"></div>`;

// Lockup Gaia Food (leggero): pin acquerello in webp (18KB) + wordmark Marcellus via @font-face.
// variant 'dark' = testo bianco su fondo scuro (splash). La dimensione si controlla col font-size del contenitore.
export const Lockup = (variant = '') => `<span class="gf-lockup${variant === 'dark' ? ' on-dark' : ''}" role="img" aria-label="Gaia Food">
  <img class="gf-pin" src="./assets/brand/gaia-food-pin.webp" alt="" decoding="async" onerror="this.remove()">
  <span class="gf-word">GAIA<span class="food">FOOD</span></span></span>`;

export const Photo = (tone = 'paesaggio', label = '', cls = '', src = '') => `
  <div class="photo ${cls}" data-tone="${tone}"${src ? ` style="background:#1f1812 url('${src}') center/cover"` : ''}><div class="pgrain"></div>${label ? `<span class="plabel">${label}</span>` : ''}</div>`;

export const VerifyBadge = (v, { compact = false, onphoto = false } = {}) => {
  // Copy/icone allineate all'handoff (VerifyBadge.dc.html), con le sole icone presenti in icons.js:
  // hourglass→clock (scadenza/aggiornamento), pause→info (sospeso). Significato invariato.
  // Regola non negoziabile: SEMPRE icona + testo + data (mai solo colore).
  const map = {
    valid: { icon: 'check-circle', label: compact ? t('verify.validCompact') : t('verify.valid') },
    expiring: { icon: 'clock', label: compact ? t('verify.expiringCompact') : t('verify.expiring') },
    suspended: { icon: 'info', label: compact ? t('verify.suspendedCompact') : t('verify.suspended') },
  };
  const m = map[v.state] || map.valid;
  return `<span class="vbadge ${v.state}${compact ? ' compact' : ''}${onphoto ? ' onphoto' : ''}">
    ${Icon(m.icon, { size: compact ? 13 : 15 })}<span>${m.label}${v.date ? ` · ${locDate(v.date)}` : ''}</span></span>`;
};

export const ProducerCard = (p) => `
  <a class="pcard" href="#/produttore/${p.id}" data-link>
    ${Photo(p.tone, '', 'pc-photo', p.photo)}
    <div class="pc-body">
      <div class="pc-name">${p.name}</div>
      <div class="pc-meta">${p.place} · <b class="tnum">${String(p.km).replace('.', ',')} km</b></div>
      ${VerifyBadge(p.verify, { compact: true })}
    </div>
    <div class="pc-end">
      <span class="${p.saved ? 'sav' : ''}">${Icon(p.saved ? 'heart' : 'bookmark', { size: 18, fill: p.saved ? 'currentColor' : 'none' })}</span>
      ${Icon('chevron-right', { size: 18, color: 'var(--faint)' })}
    </div>
  </a>`;

export const VideoBlock = (v) => {
  const coming = v.state === 'coming';
  return `<div class="vblock ${coming ? 'coming' : ''}">
    ${Photo(v.tone, '', '')}
    ${coming ? '<span class="vsoon">' + t('common.comingSoon') + '</span>' : ''}
    <div class="vplay">${Icon('play', { size: 20, color: coming ? '#fff' : 'var(--ink)' })}</div>
    <div class="vmeta">
      <div><div class="vtype">${v.type}</div><div class="vtitle">${v.title}</div></div>
      <div class="vdur tnum">${v.duration}</div>
    </div>
  </div>`;
};

export const BottomNav = (active) => `
  <nav class="bottomnav">
    <a href="#/home" data-link class="${active === 'scopri' ? 'active' : ''}">${Icon('compass', { size: 22 })}${t('nav.scopri')}</a>
    <a href="#/salvati" data-link class="${active === 'salvati' ? 'active' : ''}">${Icon('bookmark', { size: 22 })}${t('nav.salvati')}</a>
    <a href="#/profilo" data-link class="${active === 'tu' ? 'active' : ''}">${Icon('user', { size: 22 })}${t('nav.tu')}</a>
  </nav>`;

export const catGlyph = { latte: 'droplet', uova: 'egg', olio: 'leaf', grano: 'wheat', formaggio: 'cheese', miele: 'honey', carne: 'carne', 'frutta-verdura': 'frutta-verdura' };

// ---- MapLibre ----
// Style "carta" caldo/illustrato (guida turistica), risolto relativo a questo modulo.
const WARM_STYLE_URL = new URL('./map-style.json', import.meta.url).href;
const FALLBACK_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Tono caldo + label leggibili sul canvas mappa. Iniettato UNA volta, scope-locale a initMap.
// Nessuna animazione: il filtro è statico, quindi prefers-reduced-motion non lo tocca.
function ensureMapStyle() {
  if (document.getElementById('gaia-map-style')) return;
  const s = document.createElement('style');
  s.id = 'gaia-map-style';
  s.textContent = `
    .mapwrap .maplibregl-canvas{ filter:saturate(.94) sepia(.05) brightness(1.01); }
    .mapwrap .maplibregl-map{ font-family:inherit; background:#F4F1EB; }
    @media (prefers-reduced-motion: reduce){
      .mapwrap .maplibregl-canvas{ filter:saturate(.96); }
    }`;
  document.head.appendChild(s);
}

function decorateMap(map, producers, center, me) {
  producers.forEach(p => {
    const wrap = document.createElement('a'); wrap.href = `#/produttore/${p.id}`; wrap.setAttribute('data-link', '');
    // Accessibilità: il pin è un link; senza testo è muto per screen reader → etichetta = nome produttore.
    wrap.setAttribute('aria-label', p.name);
    wrap.setAttribute('title', p.name);
    wrap.innerHTML = `<div class="gpin">${Icon(catGlyph[p.primary] || 'map-pin', { size: 16, color: '#fff' })}</div>`;
    new maplibregl.Marker({ element: wrap, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map);
  });
  if (me) {
    const m = document.createElement('div'); m.className = 'gme';
    new maplibregl.Marker({ element: m }).setLngLat(center).addTo(map);
  }
}

export function initMap(el, producers, { center = [13.934, 41.776], me = true } = {}) {
  if (!window.maplibregl) { el.classList.add('map-fallback'); return null; }
  try {
    ensureMapStyle();
    const map = new maplibregl.Map({
      container: el, style: WARM_STYLE_URL,
      center, zoom: 11, attributionControl: false,
    });

    // Se lo style custom non carica (rete/JSON), ripiega sul liberty standard senza rompere la mappa.
    let fellBack = false;
    map.on('error', (ev) => {
      const msg = (ev && ev.error && ev.error.message) || '';
      if (!fellBack && /style|map-style|Failed to fetch/i.test(msg)) {
        fellBack = true;
        try { map.setStyle(FALLBACK_STYLE_URL); } catch (_) {}
      }
    });

    map.on('load', () => decorateMap(map, producers, center, me));

    // Il contenitore cambia altezza/larghezza col layout desktop: tieni il canvas allineato.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => map.resize());
      ro.observe(el);
      map.once('remove', () => ro.disconnect());
    }
    return map;
  } catch (e) { console.warn('map err', e); el.classList.add('map-fallback'); return null; }
}
