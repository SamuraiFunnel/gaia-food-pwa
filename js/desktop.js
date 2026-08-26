// ===========================================================
// GAIA FOOD — Layer DESKTOP (split-view) · solo >=1024px
// Additivo: NON tocca il rendering mobile. main.js chiama enhance*()
// dopo il mount di ogni schermata; sotto i 1024px questi no-op.
//
// Stato locale (selectedId del pannello-scheda di Scopri) vive QUI,
// non in store.js, per restare dentro lo scope-file assegnato.
// ===========================================================
import { Icon } from './icons.js';
import { Photo, VerifyBadge, VideoBlock, catGlyph } from './components.js';
import { results, producerById, toggleSaved } from './store.js';
import { openContact } from './screens.js';

// ---- guard di larghezza: lo split-view è attivo solo da >=1024px ----
const mq = window.matchMedia('(min-width: 1024px)');
export const isDesktop = () => mq.matches;

// selectedId del pannello scheda (Scopri). Persistito in memoria di modulo.
let selectedId = null;

const km = (n) => String(n).replace('.', ',');

/* ============================================================
   1) DESKTOP_SCOPRI — pannello scheda produttore a destra
   Cliccando una ProducerCard si AGGIORNA il pannello (no navigazione).
   ============================================================ */

// Empty-state quando non c'è (ancora) un produttore selezionato.
function panelEmpty() {
  return `<div class="dk-empty">
    <div class="dk-empty-ic">${Icon('compass', { size: 30, color: 'var(--terra)', stroke: 1.8 })}</div>
    <div class="dk-empty-t">Seleziona un produttore</div>
    <p class="dk-empty-p">Scegli un produttore dalla lista o dalla mappa: la sua scheda — foto, video della visita e racconto — si aprirà qui.</p>
  </div>`;
}

// Scheda completa del produttore selezionato, dentro il pannello destro.
function panelProducer(p) {
  if (!p) return panelEmpty();
  const cats = (p.categories || []).map(c =>
    `<span class="dk-chip">${Icon(catGlyph[c] || 'leaf', { size: 13 })}${c}</span>`).join('');
  const quoteMatch = (p.story || '').match(/«([^»]+)»/);
  const quote = quoteMatch ? quoteMatch[1].trim() : 'Il cibo vero non si certifica con un timbro: si guarda negli occhi, sul posto.';
  const quoteWho = `${(p.name || '').replace(/^Az\.\s*Agricola\s+di\s+/i, '')}${p.place ? ', ' + p.place : ''}`;
  const videos = (p.videos || []).slice(0, 3);
  const seasonal = (p.seasonal || []).slice(0, 4);

  return `<div class="dk-card" data-card="${p.id}">
    <div class="dk-hero">
      ${Photo(p.tone, '', '', p.photo)}
      <div class="dk-hero-top">
        <a class="dk-fab" href="#/produttore/${p.id}" data-link aria-label="Apri a schermo intero">${Icon('home', { size: 18, color: '#fff', stroke: 2 })}</a>
        <button class="dk-fab" data-save aria-label="Salva" aria-pressed="${p.saved ? 'true' : 'false'}">${Icon(p.saved ? 'heart' : 'bookmark', { size: 18, color: '#fff', fill: p.saved ? '#fff' : 'none' })} ${p.saved ? 'Salvato' : 'Salva'}</button>
      </div>
      <div class="dk-hero-cap">
        <div class="dk-eyebrow">${p.place || ''} · Alta Val di Sangro</div>
        <h1 class="dk-htitle">${p.name}</h1>
      </div>
    </div>

    <div class="dk-metarow">
      ${VerifyBadge(p.verify || { state: 'valid' })}
      ${cats}
      <span class="dk-km tnum">${Icon('map-pin', { size: 14, color: 'var(--terra-deep)', stroke: 2.1 })} ${km(p.km)} km</span>
      <button class="dk-contact" data-contact>${Icon('message-circle', { size: 17, color: '#fff', stroke: 2 })} Contatta / Vai a ritirare</button>
    </div>

    ${videos.length ? `<div class="dk-sec">
      <div class="dk-sec-h"><h2 class="dk-h2">Guarda la visita</h2><span class="dk-eyebrow2">${videos.length} ${videos.length === 1 ? 'capitolo' : 'capitoli'}</span></div>
      <div class="dk-vgrid">${videos.map(VideoBlock).join('')}</div>
    </div>` : ''}

    ${p.story ? `<div class="dk-sec dk-story-wrap">
      <p class="dk-story">${p.story}</p>
      <figure class="dk-quote">
        <blockquote>"${quote}"</blockquote>
        <figcaption>— ${quoteWho}</figcaption>
      </figure>
    </div>` : ''}

    ${seasonal.length ? `<div class="dk-sec">
      <div class="dk-sec-h"><h2 class="dk-h2">Di stagione, adesso</h2><span class="dk-eyebrow2">${seasonal.length} prodotti</span></div>
      <div class="dk-seasonal">${seasonal.map(si => `<div class="dk-si">${Photo(si.tone, '')}<div class="dk-sl">${si.label}</div></div>`).join('')}</div>
    </div>` : ''}

    <div class="dk-sec dk-kv">
      ${p.hours ? `<div class="dk-kvrow">${Icon('clock', { size: 17, color: 'var(--verde-deep)', stroke: 2 })} ${p.hours}</div>` : ''}
      ${p.address ? `<div class="dk-kvrow">${Icon('map-pin', { size: 17, color: 'var(--terra-deep)', stroke: 2 })} ${p.address}</div>` : ''}
      ${(p.verify && p.verify.date) ? `<div class="dk-kvnote">Nessuna recensione ancora — ma <b>verificato di persona dal tecnologo alimentare il ${p.verify.date}</b>.</div>` : ''}
    </div>
  </div>`;
}

// Aggancia il pannello e i suoi handler. Re-render del solo pannello (no full rerender).
function paintPanel(panel) {
  const p = producerById(selectedId);
  panel.innerHTML = panelProducer(p);
  panel.scrollTop = 0;
  const save = panel.querySelector('[data-save]');
  if (save) save.onclick = () => {
    toggleSaved(p.id);
    paintPanel(panel);          // ridisegna il pannello (stato salvato)
    syncCardSaved(p.id);        // riallinea anche la card nella lista
    markSelectedCard(panel);
  };
  const contact = panel.querySelector('[data-contact]');
  if (contact && p) contact.onclick = () => openContact(p);
  markSelectedCard(panel);
}

// Evidenzia nella lista la card del produttore selezionato.
function markSelectedCard(panel) {
  const home = panel.closest('.screen.home');
  if (!home) return;
  home.querySelectorAll('#list .pcard').forEach(a => {
    const href = a.getAttribute('href') || '';
    a.classList.toggle('dk-selected', href === `#/produttore/${selectedId}`);
  });
}

// Riallinea l'icona "salvato" della card in lista dopo un toggle dal pannello.
function syncCardSaved(id) {
  const p = producerById(id);
  document.querySelectorAll(`#list a.pcard[href="#/produttore/${id}"] .pc-end span`).forEach(span => {
    span.classList.toggle('sav', !!(p && p.saved));
    span.innerHTML = Icon(p && p.saved ? 'heart' : 'bookmark', { size: 18, fill: p && p.saved ? 'currentColor' : 'none' });
  });
}

// Punto d'ingresso chiamato da main.js dopo il mount di Home.
export function enhanceHome(el) {
  if (!isDesktop()) return;            // mobile: nessun cambiamento
  const home = el.querySelector('.screen.home');
  if (!home) return;
  // La Home "Elenco essenziale" usa righe-link vere: il dettaglio deve aprirsi sempre
  // nella sua pagina, anche su desktop. Il vecchio split resta disponibile solo al markup storico.
  if (home.classList.contains('home-directory')) return;
  if (home.querySelector('.dk-panel')) return; // già montato

  home.classList.add('dk-split');

  // default: primo produttore (per km) o empty-state se la lista è vuota.
  const list = results();
  if (!selectedId || !producerById(selectedId)) {
    selectedId = list.length ? list[0].id : null;
  }

  const panel = document.createElement('aside');
  panel.className = 'dk-panel';
  home.appendChild(panel);
  paintPanel(panel);

  // Intercetta i click sulle ProducerCard della lista: aggiorna il pannello (no nav).
  const listEl = home.querySelector('#list');
  if (listEl) {
    listEl.addEventListener('click', (e) => {
      if (!isDesktop()) return;        // se rimpicciolisce sotto 1024, lascia navigare
      const card = e.target.closest('a.pcard');
      if (!card) return;
      // click sul bookmark interno: lascialo gestire dove serve, ma qui non navighiamo
      const href = card.getAttribute('href') || '';
      const m = href.match(/#\/produttore\/(.+)$/);
      if (!m) return;
      e.preventDefault();
      selectedId = m[1];
      paintPanel(panel);
    });
  }
}

// API per la mappa: selezionare un produttore aggiorna il pannello se siamo su Scopri.
export function selectProducer(id) {
  selectedId = id;
  const panel = document.querySelector('.screen.home .dk-panel');
  if (panel && isDesktop()) paintPanel(panel);
}

/* ============================================================
   2) DESKTOP_CONSEGNA — carrello (a sx) + riepilogo (a dx) affiancati
   Additivo: su >=1024px inietta una colonna "Riepilogo" accanto allo
   stack del carrello, senza toccare DlvCarrello.js. La CTA mobile sticky
   viene nascosta da CSS; qui c'è la CTA "Conferma" del riepilogo.
   ============================================================ */
export function enhanceCarrello(el) {
  if (!isDesktop()) return;
  const screen = el.querySelector('.screen.no-nav');
  const scroll = el.querySelector('.scroll');
  // identifichiamo la schermata carrello dalla presenza dello stack prodotti
  const stack = el.querySelector('[data-stack]');
  if (!screen || !scroll || !stack) return;
  if (el.querySelector('.dk-cons')) return; // già montato

  screen.classList.add('dk-cons');

  // RouteMap statica (coerente con DlvRiepilogo): tappe -> mezzo -> casa.
  const routeMap = `
    <div class="dk-route" role="img" aria-label="Percorso del mezzo: ritira dai produttori e consegna a casa">
      <span class="dk-eta">${Icon('truck', { size: 14, color: '#fff', stroke: 2.1 })} In viaggio · ritira e consegna</span>
      <svg class="dk-routeline" viewBox="0 0 356 130" preserveAspectRatio="none" aria-hidden="true">
        <path d="M30 96 C70 96 78 44 118 44 C158 44 168 96 208 96 C252 96 262 50 310 50"
          fill="none" stroke="var(--terra)" stroke-width="2.5" stroke-linecap="round"
          stroke-dasharray="2 8" opacity=".85"></path>
      </svg>
      <div class="dk-rnodes">
        <div class="dk-rnode"><span class="dk-rpin dk-rstop">1</span><span class="dk-rlabel">Claudio</span></div>
        <div class="dk-rnode dk-rnode-up"><span class="dk-rpin dk-rstop">2</span><span class="dk-rlabel">Civitella</span></div>
        <div class="dk-rnode"><span class="dk-rpin dk-rtruck">${Icon('truck', { size: 18, color: '#fff', stroke: 2 })}</span><span class="dk-rlabel">Mezzo</span></div>
        <div class="dk-rnode"><span class="dk-rpin dk-rhome">${Icon('home', { size: 18, color: '#fff', stroke: 2 })}</span><span class="dk-rlabel">Casa</span></div>
      </div>
    </div>`;

  const aside = document.createElement('aside');
  aside.className = 'dk-cons-side';
  aside.innerHTML = `
    <div class="dk-cons-h">Riepilogo</div>
    ${routeMap}
    <div class="dk-cons-tappe"><span class="dk-cons-tlab">Tappe:</span> <span class="tnum">1 Claudio (3,1) → 2 Civitella (2,4) → Casa tua</span></div>
    <div class="dk-cons-sep"></div>
    <div class="dk-cons-line">
      ${Icon('calendar', { size: 20, color: 'var(--terra-deep)', stroke: 2 })}
      <div class="dk-cons-lbody"><div class="dk-cons-lt">Giovedì 2 luglio</div><div class="dk-cons-ls tnum">17:00 – 19:00</div></div>
      <button class="dk-cons-change" data-change-slot>Cambia</button>
    </div>
    <div class="dk-cons-line">
      ${Icon('home', { size: 20, color: 'var(--terra-deep)', stroke: 2 })}
      <div class="dk-cons-lbody"><div class="dk-cons-lt">Casa tua</div><div class="dk-cons-ls dk-cons-zona">consegna in arrivo nella tua zona</div></div>
      <button class="dk-cons-change" data-change-addr>Cambia</button>
    </div>
    <button class="dk-cons-cta" data-confirm>Conferma la consegna <span class="dk-cons-arrow">${Icon('arrow-right', { size: 16, color: '#fff', stroke: 2.4 })}</span></button>
    <div class="dk-cons-note">Si conferma, non si paga · nessun intermediario.</div>`;

  // affianca: scroll (carrello) + aside (riepilogo) dentro un wrapper flex
  const row = document.createElement('div');
  row.className = 'dk-cons-row';
  scroll.parentNode.insertBefore(row, scroll);
  row.appendChild(scroll);
  row.appendChild(aside);

  aside.querySelector('[data-change-slot]').onclick = () => { location.hash = '#/consegna/zona'; };
  aside.querySelector('[data-change-addr]').onclick = () => { location.hash = '#/consegna/zona'; };
  aside.querySelector('[data-confirm]').onclick = () => { location.hash = '#/consegna/riepilogo'; };
}

/* ============================================================
   3) S_MapFull — bottom-sheet con conteggio + ProducerCard + toggle Lista
   Chiamato da main.js dopo il mount di MapFull (mobile e desktop).
   ============================================================ */
export function enhanceMapFull(el, list, ProducerCardFn, { goListHref = '#/home' } = {}) {
  const wrap = el.querySelector('.mapwrap.full');
  if (!wrap) return;
  if (wrap.querySelector('.mf-sheet')) return; // già montato

  const verified = list.filter(p => !p.verify || p.verify.state === 'valid').length;
  const sheet = document.createElement('div');
  sheet.className = 'mf-sheet';
  sheet.setAttribute('aria-label', 'Produttori intorno a te');
  sheet.innerHTML = `
    <div class="mf-handle" aria-hidden="true"></div>
    <div class="mf-head">
      <div class="mf-titles">
        <div class="mf-count">${verified} ${verified === 1 ? 'produttore verificato' : 'produttori verificati'}</div>
        <div class="mf-sub">intorno a te · Alta Val di Sangro</div>
      </div>
      <a class="mf-listbtn" href="${goListHref}" data-link>${Icon('list', { size: 16, color: 'var(--verde-deep)', stroke: 2.1 })} Lista</a>
    </div>
    <div class="mf-hint" data-mf-hint>Trascina giù per vedere la mappa</div>
    <div class="mf-cards">
      ${list.map(ProducerCardFn).join('') || `<div class="mf-empty">Nessun produttore verificato entro il raggio. Allarga la zona o riprova più tardi.</div>`}
    </div>`;
  wrap.appendChild(sheet);

  // "ricentra" (crosshair) in alto a destra: ricentra la mappa sull'utente.
  const recenter = document.createElement('button');
  recenter.className = 'map-fab mf-recenter';
  recenter.setAttribute('aria-label', 'Ricentra sulla mia posizione');
  recenter.innerHTML = Icon('crosshair', { size: 20, color: 'var(--verde-deep)', stroke: 2 });
  wrap.appendChild(recenter);
  recenter.onclick = () => {
    const map = el._gfMap;
    if (map && typeof map.flyTo === 'function') map.flyTo({ center: map.__gfCenter || [13.934, 41.776], zoom: 12 });
  };

  // --- Bottom-sheet abbassabile (solo mobile): trascina o tocca handle/intestazione per aprire/chiudere. ---
  const PEEK = 98;
  const hint = sheet.querySelector('[data-mf-hint]');
  const isMobile = () => window.matchMedia('(max-width: 1023px)').matches;
  let peeked = false, dragging = false, moved = false, startY = 0, sheetH = 0, curT = 0;
  const applyState = () => {
    wrap.classList.toggle('mf-peek', peeked);
    if (hint) hint.textContent = peeked ? 'Trascina su o tocca per la lista' : 'Trascina giù per vedere la mappa';
  };
  const grips = [sheet.querySelector('.mf-handle'), sheet.querySelector('.mf-head')].filter(Boolean);
  const onDown = (e) => {
    if (!isMobile() || e.target.closest('.mf-listbtn')) return;
    dragging = true; moved = false;
    startY = e.clientY != null ? e.clientY : (e.touches && e.touches[0].clientY) || 0;
    sheetH = sheet.getBoundingClientRect().height;
    sheet.style.transition = 'none';
    try { e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const onMove = (e) => {
    if (!dragging) return;
    const y = e.clientY != null ? e.clientY : (e.touches && e.touches[0].clientY) || 0;
    const dy = y - startY;
    if (Math.abs(dy) > 6) moved = true;
    const base = peeked ? (sheetH - PEEK) : 0;
    curT = Math.max(0, Math.min(sheetH - PEEK, base + dy));
    sheet.style.transform = `translateY(${curT}px)`;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    if (!moved) peeked = !peeked;                          // tap → toggle
    else peeked = curT > (sheetH - PEEK) / 2;              // drag → snap allo stato più vicino
    applyState();
    requestAnimationFrame(() => { sheet.style.transform = ''; });  // lascia gestire alla classe (animato)
  };
  grips.forEach(g => g.addEventListener('pointerdown', onDown));
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
