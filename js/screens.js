import { Icon } from './icons.js';
import { StatusBar, Photo, VerifyBadge, ProducerCard, VideoBlock, BottomNav, initMap, catGlyph } from './components.js';
import { getState, results, producerById, toggleSaved, hubSeen, lastFunction, resetHub, currentUser, userZoneIsActive, userZone } from './store.js';

const km = n => String(n).replace('.', ',');

/* ---------------- SPLASH ----------------
   App "alla Glovo": nessun ospite. Se l'utente è loggato → entra nell'app
   (#/hub la prima volta, poi l'ultima funzione usata). Altrimenti → accesso.
   Il gating del router (main.js) è la rete di sicurezza: qui scegliamo solo la destinazione. */
export function Splash() {
  const logged = !!currentUser();
  const hasZone = !!userZone();
  const dest = (logged && hasZone) ? (hubSeen() ? lastFunction() : '#/hub') : null;
  const ctaLabel = logged
    ? `${Icon('arrow-right', { size: 18, color: '#fff' })} Entra`
    : `${Icon('user', { size: 18, color: '#fff' })} Accedi o registrati`;
  // Non loggato → apri il POP-UP di accesso; loggato senza zona → pop-up allo step zona;
  // loggato con zona → entra direttamente. Niente più pagina intera #/registrati.
  const cta = (logged && hasZone)
    ? `<a class="s02-cta" href="${dest}">${ctaLabel}</a>`
    : `<button class="s02-cta" type="button" data-open-auth="${logged ? 'zone' : 'auth'}">${ctaLabel}</button>`;
  return {
    html: `<div class="splash s02">
      <style>
      /* SPLASH v02 "Editoriale" — foto in alto, blocco carta in basso con headline serif + un solo CTA.
         Ancorato a 100dvh + safe-area, colonna flessibile: niente scroll. Scope: .s02. */
      .s02{ position:relative; min-height:100vh; min-height:100dvh; display:flex; flex-direction:column;
        overflow:hidden; background:var(--carta); }
      /* La foto prende lo spazio che avanza; il blocco testo è alto quanto serve (vedi .s02-body flex:none).
         Così su OGNI telefono: niente gap morto, niente scroll. min-height evita che la foto sparisca. */
      .s02 .s02-ph{ position:relative; flex:1 1 auto; min-height:34dvh; overflow:hidden; }
      .s02 .s02-ph .photo{ position:absolute; inset:0; width:100%; height:100%; border-radius:0; }
      .s02 .s02-fade{ position:absolute; inset:0; z-index:1;
        background:linear-gradient(180deg, rgba(10,16,10,.34) 0%, rgba(244,241,235,0) 52%, var(--carta) 100%); }
      .s02 .s02-logo{ position:absolute; z-index:2; left:24px; height:auto; width:132px;
        top:calc(env(safe-area-inset-top, 0px) + 38px); filter:drop-shadow(0 3px 12px rgba(0,0,0,.45)); }
      .s02 .s02-body{ position:relative; z-index:2; flex:none; display:flex; flex-direction:column;
        padding:18px 26px calc(env(safe-area-inset-bottom, 0px) + 26px); }
      .s02 .s02-eyebrow{ font-size:11px; font-weight:700; letter-spacing:.2em; text-transform:uppercase;
        color:var(--verde-deep); display:inline-flex; align-items:center; gap:8px; }
      .s02 .s02-eyebrow::before{ content:''; width:15px; height:1.5px; background:var(--verde); border-radius:2px; }
      .s02 .s02-title{ font-family:var(--serif); font-size:34px; font-weight:600; letter-spacing:-.02em;
        line-height:1.08; margin:12px 0 12px; color:var(--ink); }
      .s02 .s02-title em{ font-style:italic; color:var(--verde); }
      .s02 .s02-sub{ font-size:14px; line-height:1.6; color:var(--muted); max-width:34ch; }
      .s02 .s02-cta{ margin-top:20px; width:100%; display:flex; align-items:center; justify-content:center;
        gap:10px; padding:16px; border-radius:16px; background:var(--grad-azione); color:#fff;
        font-family:var(--sans); font-size:15.5px; font-weight:600; text-decoration:none;
        border:none; cursor:pointer; box-shadow:0 14px 30px -14px rgba(22,163,74,.7); }
      .s02 .s02-cta:active{ transform:translateY(1px); }
      @media(prefers-reduced-motion:reduce){ .s02 *{ transition:none !important; } }
      </style>
      <div class="s02-ph">
        ${Photo('paesaggio', '', '')}
        <div class="s02-fade"></div>
        <img class="s02-logo" src="./assets/brand/gaia-food-lockup-orizzontale-bianco.svg"
          alt="Gaia Food" decoding="async" onerror="this.style.display='none'">
      </div>
      <div class="s02-body">
        <span class="s02-eyebrow">${logged ? 'Bentornato' : 'Benvenuto in Gaia Food'}</span>
        <h1 class="s02-title">Il cibo vero,<br><em>vicino a te.</em></h1>
        <p class="s02-sub">${logged ? 'Ti portiamo ai produttori veri della tua zona.' : 'Registrati o accedi per scoprire i produttori veri vicino a te.'}</p>
        ${cta}
      </div>
    </div>`,
  };
}

/* ---------------- HOME / SCOPRI ----------------
   Vista PER ZONA: i produttori si vedono solo se la zona dell'utente è quella ATTIVA
   (oggi Abruzzo · Alta Val di Sangro). Le altre regioni → empty-state "Presto nella tua zona". */
export function Home() {
  const s = getState();
  const inZone = userZoneIsActive();           // utente nella zona con produttori?
  const list = inZone ? results() : [];        // fuori zona = nessun produttore
  const uz = userZone();
  const regionName = typeof uz === 'string' ? uz : (uz && (uz.region || uz.label || uz.name)) || '';
  const locLabel = inZone ? (s.zone?.comuni?.[0] || s.zone?.label || 'la tua zona') : (regionName || 'la tua regione');
  const chips = s.categories.map(c =>
    `<button class="chip ${s.category === c.id ? 'active' : ''}" data-cat="${c.id}">${Icon(c.glyph, { size: 16 })}${c.label}</button>`).join('');

  // Empty-state per chi è fuori dalla zona attiva: causa + cosa fare.
  const emptyZone = `
    <div class="center" style="padding:48px 26px">
      ${Icon('map-pin', { size: 44, color: 'var(--faint)' })}
      <h2 class="h2 mt16">Presto nella tua zona</h2>
      <p class="muted mt8" style="max-width:32ch;margin-left:auto;margin-right:auto">
        Non abbiamo ancora produttori verificati ${regionName ? `in <b>${regionName}</b>` : 'nella tua regione'}.
        Stiamo arrivando una zona alla volta: per ora siamo attivi in <b>Abruzzo · Alta Val di Sangro</b>.
      </p>
      <button class="btn btn-outline mt16" type="button" data-open-auth="zone" style="display:inline-flex">
        ${Icon('settings', { size: 17, color: 'var(--verde-deep)' })} Cambia zona
      </button>
    </div>`;

  return {
    html: `<div class="screen home">
      ${StatusBar()}
      <div class="toprow">
        <span class="loc">${Icon('map-pin', { size: 16, color: 'var(--verde)' })}<b>${locLabel}</b>${inZone ? ` · ${s.radius} km` : ''}</span>
        <a class="iconbtn" href="#/profilo" data-link>${Icon('user', { size: 18 })}</a>
      </div>
      <div class="scroll">
        <div class="pad">
          <h1 class="h1">Cosa cerchi <em>oggi?</em></h1>
          <div class="search mt12">${Icon('search', { size: 20, color: 'var(--terra-deep)' })}
            <input id="q" aria-label="Cerca un prodotto o un produttore" placeholder="dove prendo il latte?" value="${s.query}">
            ${Icon('mic', { size: 19, color: 'var(--faint)' })}</div>
          ${inZone ? `<div class="chips mt12">${chips}</div>` : ''}
        </div>
        ${inZone ? `
        <div class="pad mt16">
          <div class="mapwrap"><div id="map" class="map-canvas"></div>
            <a class="map-fab open" href="#/mappa" data-link>${Icon('map-pin', { size: 16, color: 'var(--verde)' })} Apri mappa</a></div>
        </div>
        <div class="pad mt22">
          <div class="block-h"><div class="section-t">Vicino a te</div><span class="eyebrow tnum">${list.length} verificati</span></div>
          <div class="gap8" id="list">${list.map(ProducerCard).join('')}</div>
        </div>
        <div style="height:24px"></div>
        ` : emptyZone}
      </div>
      ${BottomNav('scopri')}
    </div>`,
    onMount(el) {
      if (!inZone) return;     // fuori zona: solo empty-state, niente mappa/lista interattiva
      const mapEl = el.querySelector('#map'); if (mapEl) initMap(mapEl, list);
      const q = el.querySelector('#q');
      if (q) q.oninput = () => { s.query = q.value; const lst = el.querySelector('#list'); if (lst) lst.innerHTML = results().map(ProducerCard).join(''); };
      el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
        s.category = s.category === b.dataset.cat ? null : b.dataset.cat; rerender();
      });
      el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => location.hash = b.dataset.go);
    },
  };
}

/* ---------------- SCHEDA PRODUTTORE ---------------- */
export function Producer(id) {
  const p = producerById(id);
  if (!p) return { html: `<div class="screen no-nav"><div class="pad mt22">Produttore non trovato. <a href="#/home" data-link>Torna alla Home</a></div></div>` };
  const cats = p.categories.map(c => `<span class="chip" style="padding:5px 11px">${Icon(catGlyph[c], { size: 14 })}${c}</span>`).join('');
  // Pull-quote: cita le parole vere del produttore (estratte da story tra « »), con attribuzione.
  const quoteMatch = (p.story || '').match(/«([^»]+)»/);
  const quote = quoteMatch ? quoteMatch[1].trim() : 'Il cibo vero non si spiega: si assaggia.';
  const quoteWho = `${(p.name || '').replace(/^Az\.\s*Agricola\s+di\s+/i, '')}, ${p.place || ''}`.replace(/,\s*$/, '');

  // ---- Sezione video "full-swipe" (stile storie) — un grande stage; si scorre in orizzontale tra i video ----
  const vids = Array.isArray(p.videos) ? p.videos : [];
  const VCHIP = { presentazione: 'Presentazione', storia: 'Storia', metodo: 'Metodo' };
  const VCLS = { presentazione: 'pre', storia: 'sto', metodo: 'met' };
  let mainIdx = vids.findIndex(v => v.type === 'presentazione');
  if (mainIdx < 0) mainIdx = 0;
  // Ordine: presentazione per prima, poi gli altri. Ogni slide ricorda l'indice REALE (per la rotta del player).
  const vOrdered = vids.length
    ? [{ v: vids[mainIdx], i: mainIdx }, ...vids.map((v, i) => ({ v, i })).filter(x => x.i !== mainIdx)]
    : [];
  const chev = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M${d === 'l' ? '15 6l-6 6 6 6' : '9 6l6 6-6 6'}"/></svg>`;
  const slide = ({ v, i }) => `
        <a class="pv3-slide" href="#/video/${p.id}/${i}" data-link aria-label="Guarda: ${v.title || 'video'}">
          ${Photo(v.tone, '', '', i === mainIdx ? p.photo : '')}
          <span class="pv3-scr"></span>
          <span class="pv-cat ${VCLS[v.type] || 'pre'}">${VCHIP[v.type] || 'Video'}</span>
          ${v.state === 'coming'
            ? `<span class="pv3-soon">${Icon('clock', { size: 15, color: '#fff' })} In arrivo</span>`
            : `<span class="pv3-play">${Icon('play', { size: 26, color: 'var(--ink)' })}</span>`}
          <div class="pv3-cap"><h3>${v.title || 'Capitolo'}</h3>
            <div class="pv3-d">${v.duration ? v.duration + ' · ' : ''}${v.state === 'coming' ? 'non ancora disponibile' : 'tocca per riprodurre'}</div></div>
        </a>`;
  const videoSection = vOrdered.length ? `
        <div class="block">
          <div class="block-h"><div class="section-t">Guarda la visita</div><span class="eyebrow tnum">${vids.length} video</span></div>
          <div class="pv3">
            <div class="pv3-track" data-pv3-track>${vOrdered.map(slide).join('')}</div>
            ${vOrdered.length > 1 ? `
            <div class="pv3-count" data-pv3-count>1 / ${vOrdered.length}</div>
            <button class="pv3-arrow pv3-l" type="button" data-pv3-prev aria-label="Video precedente">${chev('l')}</button>
            <button class="pv3-arrow pv3-r" type="button" data-pv3-next aria-label="Video successivo">${chev('r')}</button>
            <div class="pv3-dots" data-pv3-dots>${vOrdered.map((_, k) => `<i class="${k === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
          </div>
          ${vOrdered.length > 1 ? `<div class="pv3-hint">scorri ← → per cambiare video</div>` : ''}
        </div>` : '';
  return {
    html: `<div class="screen no-nav prod">
      <div class="scroll">
        <div class="hero">
          ${Photo(p.tone, '', '', p.photo)}
          <div class="hero-top">
            <button class="iconbtn" data-back aria-label="Indietro">${Icon('arrow-left', { size: 18 })}</button>
            <button class="iconbtn" data-save aria-label="Salva" aria-pressed="${p.saved ? 'true' : 'false'}">${Icon(p.saved ? 'heart' : 'bookmark', { size: 18, color: p.saved ? 'var(--verde)' : 'var(--ink)', fill: p.saved ? 'var(--verde)' : 'none' })}</button>
          </div>
          <div class="hero-cap"><div class="pn">${p.name}</div><div class="pl">${p.place} · Alta Val di Sangro</div></div>
        </div>
        <div class="metarow">${VerifyBadge(p.verify)} ${cats} <span class="km tnum">${km(p.km)} km</span></div>

        ${videoSection}

        <div class="block">
          <p class="story">${p.story}</p>
          <figure class="pullquote" style="margin:0">
            <blockquote style="margin:0">“${quote}”</blockquote>
            <figcaption class="pq-by">— ${quoteWho}</figcaption>
          </figure>
        </div>

        <div class="block">
          <div class="block-h"><div class="section-t">Di stagione, adesso</div><span class="eyebrow tnum">${p.seasonal.length} ${p.seasonal.length === 1 ? 'prodotto' : 'prodotti'}</span></div>
          <div class="seasonal">${p.seasonal.map(si => `<div class="si">${Photo(si.tone, '')}<div class="sl">${si.label}${si.note ? `<span class="sn">${si.note}</span>` : ''}</div></div>`).join('')}</div>
        </div>

        <div class="block">
          <div class="kv"><span class="open">${Icon('clock', { size: 17, color: 'var(--verde-deep)' })}</span> ${p.hours}</div>
          <div class="kv">${Icon('map-pin', { size: 17, color: 'var(--muted)' })} ${p.address}</div>
          <div class="dlv-sel"><div class="dlv-soon">${Icon('truck', { size: 17, color: 'var(--muted)' })} <b style="color:var(--ink)">Consegna a casa</b> · non disponibile al momento</div>
            <div class="muted" style="font-size:12.5px;margin-top:6px">Per ora vai a ritirare o contatta il produttore. Ti avviseremo quando parte la consegna nella tua zona.</div></div>
        </div>

        <div class="block">
          <div class="block-h"><div class="section-t">Recensioni</div></div>
          <div class="muted" style="font-size:14px">Nessuna recensione ancora — ma <b style="color:var(--verde-deep)">verificato di persona dal tecnologo alimentare il ${p.verify.date}</b>.</div>
        </div>
        <div style="height:12px"></div>
      </div>
      <div class="cta-sticky">
        <button class="btn btn-grad" style="flex:1" data-contact aria-label="Contatta">${Icon('message-circle', { size: 18, color: '#fff' })} Contatta / Vai a ritirare</button>
        <button class="iconbtn" style="width:52px;height:52px" data-nav aria-label="Indicazioni">${Icon('navigation', { size: 20, color: 'var(--verde)' })}</button>
      </div>
    </div>`,
    onMount(el) {
      const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
      const save = el.querySelector('[data-save]'); if (save) save.onclick = (e) => { toggleSaved(p.id); rerender(); };
      const contact = el.querySelector('[data-contact]'); if (contact) contact.onclick = () => openContact(p);
      const nav = el.querySelector('[data-nav]'); if (nav) nav.onclick = () => openContact(p);

      // Carosello video "storie": scroll orizzontale (swipe) + frecce + pallini + contatore.
      const track = el.querySelector('[data-pv3-track]');
      if (track && track.children.length > 1) {
        const n = track.children.length;
        const countEl = el.querySelector('[data-pv3-count]');
        const dots = [...el.querySelectorAll('[data-pv3-dots] i')];
        const prevB = el.querySelector('[data-pv3-prev]');
        const nextB = el.querySelector('[data-pv3-next]');
        let cur = 0;
        const paint = (i) => {
          if (countEl) countEl.textContent = `${i + 1} / ${n}`;
          dots.forEach((d, k) => d.classList.toggle('on', k === i));
          if (prevB) prevB.style.opacity = i === 0 ? '.4' : '1';
          if (nextB) nextB.style.opacity = i === n - 1 ? '.4' : '1';
        };
        track.addEventListener('scroll', () => {
          const w = track.clientWidth || 1;
          const i = Math.max(0, Math.min(n - 1, Math.round(track.scrollLeft / w)));
          if (i !== cur) { cur = i; paint(i); }
        }, { passive: true });
        const go = (i) => { i = Math.max(0, Math.min(n - 1, i)); track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' }); };
        if (prevB) prevB.onclick = (e) => { e.preventDefault(); go(cur - 1); };
        if (nextB) nextB.onclick = (e) => { e.preventDefault(); go(cur + 1); };
        paint(0);
      }
    },
  };
}

/* ---------------- CONTATTO (sheet) ----------------
   I bottoni ora portano davvero da qualche parte:
   - WhatsApp  -> wa.me/<solo-cifre>  (con messaggio precompilato)
   - Chiama    -> tel:<numero>
   - Indicazioni -> Google Maps (lat/lng se presenti, altrimenti indirizzo) */
const onlyDigits = s => String(s || '').replace(/[^\d]/g, '');
const telHref = s => 'tel:' + String(s || '').replace(/[^\d+]/g, '');
function waHref(num, name) {
  let d = onlyDigits(num);
  // numero italiano scritto senza prefisso (parte con 3, 9-10 cifre) -> aggiungi 39
  if (d && !String(num).trim().startsWith('+') && d.length <= 10 && d[0] === '3') d = '39' + d;
  const msg = encodeURIComponent(`Ciao${name ? ' ' + name : ''}, vi ho trovati su Gaia Food. Vorrei venire a ritirare.`);
  return `https://wa.me/${d}?text=${msg}`;
}
function mapsHref(p) {
  if (p && p.lat != null && p.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  const q = [p && p.address, p && p.place, p && p.name].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : 'https://www.google.com/maps';
}
export function openContact(p) {
  const c = p.contact || {};
  const rows = [];
  if (c.whatsapp) rows.push(`<a href="${waHref(c.whatsapp, p.name)}" target="_blank" rel="noopener" class="contact-row wa" aria-label="Scrivi su WhatsApp"><span class="cr-ic">${Icon('message-circle', { size: 20 })}</span> WhatsApp</a>`);
  if (c.phone) rows.push(`<a href="${telHref(c.phone)}" class="contact-row ph" aria-label="Chiama il produttore"><span class="cr-ic">${Icon('phone', { size: 20 })}</span> Chiama</a>`);
  if (c.email) rows.push(`<a href="mailto:${c.email}" class="contact-row em" aria-label="Scrivi una email"><span class="cr-ic">${Icon('mail', { size: 20 })}</span> Email</a>`);
  rows.push(`<a href="${mapsHref(p)}" target="_blank" rel="noopener" class="contact-row dir" aria-label="Indicazioni per andare a ritirare"><span class="cr-ic">${Icon('navigation', { size: 20 })}</span> Indicazioni · vai a ritirare</a>`);
  const back = document.createElement('div'); back.className = 'sheet-backdrop';
  back.setAttribute('role', 'dialog');
  back.setAttribute('aria-modal', 'true');
  back.setAttribute('aria-label', `Contatti · ${p.name}`);
  back.innerHTML = `<div class="sheet"><div class="handle"></div>
    <div class="sh-title">${p.name}</div>
    <div class="sh-sub">${p.hours || ''}</div>
    ${rows.join('')}
    <div class="sh-note">Contatto diretto · nessun pagamento, nessun intermediario.</div></div>`;
  const close = () => { document.removeEventListener('keydown', onKey); back.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.onclick = (e) => { if (e.target === back) close(); };
  document.addEventListener('keydown', onKey);
  document.getElementById('app').appendChild(back);
  // focus iniziale sul primo elemento interattivo dello sheet
  const first = back.querySelector('.sheet button, .sheet [href], .sheet input');
  if (first) first.focus();
}

/* ---------------- SALVATI ---------------- */
let salvatiFilter = null; // null = "Tutti"
export function Salvati() {
  const s = getState();
  const saved = s.producers.filter(p => p.saved);
  // categorie presenti tra i salvati (chip "Tutti" + solo le categorie utili)
  const present = s.categories.filter(c => saved.some(p => p.categories.includes(c.id)));
  // se il filtro attivo non è più rappresentato tra i salvati, torna a "Tutti"
  if (salvatiFilter && !present.some(c => c.id === salvatiFilter)) salvatiFilter = null;
  const shown = salvatiFilter ? saved.filter(p => p.categories.includes(salvatiFilter)) : saved;
  const chips = [
    `<button class="chip ${salvatiFilter === null ? 'active' : ''}" data-filter="">Tutti · ${saved.length}</button>`,
    ...present.map(c => `<button class="chip ${salvatiFilter === c.id ? 'active' : ''}" data-filter="${c.id}">${Icon(c.glyph, { size: 14 })}${c.label}</button>`),
  ].join('');
  const renderList = () => shown.length
    ? shown.map(ProducerCard).join('')
    : `<div class="center muted" style="padding:40px 20px">Nessun salvato in questa categoria.</div>`;
  return {
    html: `<div class="screen">${StatusBar()}
      <div class="pad mt8"><h1 class="h1">Salvati</h1></div>
      ${saved.length ? `<div class="pad mt12"><div class="chips">${chips}</div></div>` : ''}
      <div class="scroll"><div class="pad mt16 gap8" id="saved-list">
        ${saved.length ? renderList()
        : `<div class="center muted" style="padding:60px 20px">${Icon('bookmark', { size: 40, color: 'var(--faint)' })}<div class="mt12">Ancora nessun produttore salvato.<br>Tocca il segnalibro su una scheda per ritrovarlo qui.</div></div>`}
      </div></div>
      ${BottomNav('salvati')}</div>`,
    onMount(el) {
      el.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => {
        salvatiFilter = b.dataset.filter || null;
        rerender();
      });
    },
  };
}

/* ---------------- PROFILO ---------------- */
export function Profilo() {
  const notifOn = localStorage.getItem('gf_notif') !== '0'; // default: attive
  const u = currentUser() || {};
  const uName = u.name || (u.email ? u.email.split('@')[0] : 'Il tuo profilo');
  const uMeta = u.email || 'Membro di Gaia Food';
  return {
    html: `<div class="screen">${StatusBar()}
      <div class="pad mt8"><h1 class="h1">Tu</h1></div>
      <div class="scroll"><div class="pad mt16 gap8">
        <div class="pcard"><div class="pc-photo photo" data-tone="pascolo" style="border-radius:50%"></div>
          <div class="pc-body"><div class="pc-name">${uName}</div><div class="pc-meta">${uMeta}</div></div></div>
        <a class="pcard" href="#/candidati" data-link style="margin-top:6px">
          <span class="cr-ic" style="background:var(--verde-pale);color:var(--verde-deep);width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center">${Icon('leaf', { size: 20 })}</span>
          <div class="pc-body"><div class="pc-name" style="font-size:15px">Sei un produttore vero?</div><div class="pc-meta">Candidati · nessun costo, mai</div></div>
          ${Icon('chevron-right', { size: 18, color: 'var(--faint)' })}</a>
        <a class="pcard" href="#/custodi" data-link>
          <span class="cr-ic" style="background:var(--celeste-pale);color:var(--celeste-deep);width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center">${Icon('share', { size: 20 })}</span>
          <div class="pc-body"><div class="pc-name" style="font-size:15px">Invita un amico</div><div class="pc-meta">Porta un amico · ricevi credito</div></div>
          ${Icon('chevron-right', { size: 18, color: 'var(--faint)' })}</a>
        <a class="pcard" href="#/custodi/produttore" data-link>
          <span class="cr-ic" style="background:var(--verde-pale);color:var(--verde-deep);width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center">${Icon('sprout', { size: 20 })}</span>
          <div class="pc-body"><div class="pc-name" style="font-size:15px">I Custodi di Gaia</div><div class="pc-meta">Per i produttori · ricevi una commissione</div></div>
          ${Icon('chevron-right', { size: 18, color: 'var(--faint)' })}</a>
        <button class="pcard" data-hub style="width:100%;text-align:left;background:var(--card,#fff);border:none;cursor:pointer">
          <span class="cr-ic" style="background:var(--terra-pale,#f3ece2);color:var(--terra-deep,#8a6a44);width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center">${Icon('compass', { size: 20 })}</span>
          <div class="pc-body"><div class="pc-name" style="font-size:15px">Cosa vuoi fare?</div><div class="pc-meta">Torna alla scelta delle funzioni</div></div>
          ${Icon('chevron-right', { size: 18, color: 'var(--faint)' })}</button>
        <div class="section-t mt16">Impostazioni</div>
        <div class="pcard" style="display:block">
          <div class="kv">${Icon('globe', { size: 18, color: 'var(--muted)' })} <span style="flex:1">Lingua</span> <span class="muted" style="font-size:13.5px">Italiano</span></div>
          <div class="kv">${Icon('map-pin', { size: 18, color: 'var(--muted)' })} <span style="flex:1">Posizione</span>
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;color:var(--verde-deep)"><span style="width:7px;height:7px;border-radius:50%;background:var(--verde)"></span> Attiva</span></div>
          <div class="kv">${Icon('bell', { size: 18, color: 'var(--muted)' })} <span style="flex:1">Notifiche</span>
            <button type="button" role="switch" aria-checked="${notifOn}" aria-label="Notifiche" data-notif
              style="width:42px;height:25px;border-radius:100px;border:none;padding:0;cursor:pointer;position:relative;flex:none;transition:background .18s;background:${notifOn ? 'var(--verde)' : 'var(--bd3,#d8cdb8)'}">
              <span style="position:absolute;top:2.5px;left:${notifOn ? '19.5px' : '2.5px'};width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .18s"></span>
            </button></div>
        </div>
      </div></div>
      ${BottomNav('tu')}</div>`,
    onMount(el) {
      const hub = el.querySelector('[data-hub]');
      if (hub) hub.onclick = () => { resetHub(); location.hash = '#/hub'; };
      const notif = el.querySelector('[data-notif]');
      if (notif) notif.onclick = () => {
        const on = notif.getAttribute('aria-checked') !== 'true';
        localStorage.setItem('gf_notif', on ? '1' : '0');
        notif.setAttribute('aria-checked', String(on));
        notif.style.background = on ? 'var(--verde)' : 'var(--bd3,#d8cdb8)';
        notif.firstElementChild.style.left = on ? '19.5px' : '2.5px';
      };
    },
  };
}

/* ---------------- stub "in arrivo" ---------------- */
export function Soon(title) {
  return {
    html: `<div class="screen no-nav">${StatusBar()}
      <div class="toprow"><button class="iconbtn" data-back>${Icon('arrow-left', { size: 18 })}</button></div>
      <div class="center" style="padding:80px 30px">${Icon('truck', { size: 44, color: 'var(--terra)' })}
      <h2 class="h2 mt16">${title}</h2><p class="muted mt8">Funzione in arrivo. Te lo faremo sapere appena è pronta.</p></div></div>`,
    onMount(el) { const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back(); },
  };
}

// rerender hook (impostato da main.js)
export let rerender = () => {};
export function setRerender(fn) { rerender = fn; }
