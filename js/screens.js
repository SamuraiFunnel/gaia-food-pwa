import { Icon } from './icons.js';
import { StatusBar, Photo, VerifyBadge, ProducerCard, VideoBlock, BottomNav, initMap, catGlyph, catLabel, Lockup } from './components.js';
import { getState, results, producerById, toggleSaved, hubSeen, lastFunction, resetHub, currentUser, userZoneIsActive, userZone, updateProfile, uploadAvatar, signOut, producerStatusNotice } from './store.js';
import { t, getLang, setLang, LANGS, locDate } from './i18n.js';

// Escape HTML a livello modulo (per valori dinamici inseriti nell'HTML, es. nome del verificatore).
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Avatar utente: mostra la foto (URL Google o path caricato) se c'è, altrimenti l'iniziale.
function avatarSrc(u) {
  const p = u && u.picture;
  if (!p) return '';
  return /^https?:\/\//.test(p) ? p : './' + String(p).replace(/^\.?\//, '');
}
function avatarInner(u, name) {
  const src = avatarSrc(u);
  return src ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()">` : (String(name || 'U').trim()[0] || 'U').toUpperCase();
}
// Bottom-sheet di scelta lingua (riusa gli stili .sheet globali).
function openLangSheet() {
  const back = document.createElement('div'); back.className = 'sheet-backdrop';
  back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true');
  back.innerHTML = `<div class="sheet"><div class="handle"></div>
    <div class="sh-title">${t('settings.chooseLanguage')}</div>
    <div style="margin-top:6px">${LANGS.map(l => `<button type="button" class="lang-row" data-lang="${l.code}"
      style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:${l.code === getLang() ? 'var(--verde-pale)' : 'none'};border:none;border-radius:12px;padding:14px 12px;cursor:pointer;font-family:inherit">
      <span style="font-size:20px">${l.flag}</span><span style="flex:1;font-size:15px;font-weight:600;color:var(--ink)">${l.label}</span>
      ${l.code === getLang() ? Icon('check-circle', { size: 18, color: 'var(--verde)' }) : ''}</button>`).join('')}</div></div>`;
  const close = () => back.remove();
  back.onclick = (e) => { if (e.target === back) close(); };
  back.querySelectorAll('[data-lang]').forEach(b => b.onclick = async () => {
    const code = b.dataset.lang; close();
    await setLang(code);                                   // ridisegna nella nuova lingua
    try { if (currentUser()) updateProfile({ lang: code }); } catch (_) {}  // best-effort (multi-dispositivo)
  });
  document.getElementById('app').appendChild(back);
}

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
    ? `${Icon('arrow-right', { size: 18, color: '#fff' })} ${t('splash.ctaEnter')}`
    : `${Icon('user', { size: 18, color: '#fff' })} ${t('splash.ctaLogin')}`;
  // Non loggato → apri il POP-UP di accesso; loggato senza zona → pop-up allo step zona;
  // loggato con zona → entra direttamente. Niente più pagina intera #/registrati.
  const cta = (logged && hasZone)
    ? `<a class="s02-cta" href="${dest}">${ctaLabel}</a>`
    : `<button class="s02-cta" type="button" data-open-auth="${logged ? 'zone' : 'auth'}">${ctaLabel}</button>`;
  return {
    html: `<div class="splash s02">
      <style>
      /* SPLASH · "Split netto". MOBILE: foto sopra + blocco carta sotto (logo, headline serif, 1 CTA).
         DESKTOP(≥1024): testo su carta a sinistra, foto piena a destra. Niente scroll (100dvh). Scope: .s02. */
      .s02{ min-height:100vh; min-height:100dvh; display:flex; flex-direction:column; overflow:hidden; background:var(--carta); }
      .s02 .s02-ph{ position:relative; flex:1 1 auto; min-height:40dvh; overflow:hidden; }
      .s02 .s02-ph .photo{ position:absolute; inset:0; width:100%; height:100%; border-radius:0; }
      .s02 .s02-fade{ position:absolute; inset:0; z-index:1;
        background:linear-gradient(180deg, rgba(10,16,10,.12) 0%, rgba(244,241,235,0) 42%, var(--carta) 100%); }
      .s02 .s02-body{ position:relative; z-index:2; flex:none; display:flex; flex-direction:column;
        padding:6px 26px calc(env(safe-area-inset-bottom, 0px) + 26px); }
      .s02 .s02-logo{ font-size:22px; margin:0 0 16px; }
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
      /* DESKTOP: split netto — testo sinistra su carta, foto piena destra */
      @media(min-width:1024px){
        .s02{ flex-direction:row; }
        .s02 .s02-body{ order:0; width:46%; min-width:440px; max-width:680px; justify-content:center; padding:64px 68px; }
        .s02 .s02-ph{ order:1; width:54%; flex:1 1 auto; min-height:100dvh; }
        .s02 .s02-fade{ background:none; }
        .s02 .s02-logo{ position:absolute; top:46px; left:68px; margin:0; }
        .s02 .s02-title{ font-size:54px; margin:16px 0 16px; }
        .s02 .s02-sub{ font-size:16.5px; max-width:40ch; }
        .s02 .s02-cta{ width:auto; align-self:flex-start; padding:18px 36px; font-size:16.5px; }
      }
      @media(prefers-reduced-motion:reduce){ .s02 *{ transition:none !important; } }
      </style>
      <div class="s02-ph">
        ${Photo('paesaggio', '', '')}
        <div class="s02-fade"></div>
      </div>
      <div class="s02-body">
        <div class="s02-logo">${Lockup('')}</div>
        <span class="s02-eyebrow">${logged ? t('splash.eyebrowBack') : t('splash.eyebrowNew')}</span>
        <h1 class="s02-title">${t('splash.title1')}<br><em>${t('splash.title2')}</em></h1>
        <p class="s02-sub">${logged ? t('splash.subLogged') : t('splash.subNew')}</p>
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
  const locLabel = inZone ? (s.zone?.comuni?.[0] || s.zone?.label || t('home.zoneFallback')) : (regionName || t('home.regionFallback'));
  const chips = s.categories.map(c =>
    `<button class="chip ${s.category === c.id ? 'active' : ''}" data-cat="${c.id}">${Icon(c.glyph, { size: 16 })}${catLabel(c)}</button>`).join('');

  // Empty-state per chi è fuori dalla zona attiva: causa + cosa fare.
  const emptyRegion = regionName ? `in <b>${regionName}</b>` : t('home.regionYours');
  const emptyZone = `
    <div class="center" style="padding:48px 26px">
      ${Icon('map-pin', { size: 44, color: 'var(--faint)' })}
      <h2 class="h2 mt16">${t('home.emptyTitle')}</h2>
      <p class="muted mt8" style="max-width:32ch;margin-left:auto;margin-right:auto">
        ${t('home.emptyBody', { region: emptyRegion, active: '<b>Abruzzo · Alta Val di Sangro</b>' })}
      </p>
      <button class="btn btn-outline mt16" type="button" data-open-auth="zone" style="display:inline-flex">
        ${Icon('settings', { size: 17, color: 'var(--verde-deep)' })} ${t('home.changeZone')}
      </button>
    </div>`;

  return {
    html: `<div class="screen home">
      ${StatusBar()}
      <div class="toprow">
        <button class="loc" type="button" data-open-auth="zone" aria-label="${t('home.changeZone')}">${Icon('map-pin', { size: 16, color: 'var(--verde)' })}<b>${locLabel}</b>${inZone ? ` · ${s.radius} km` : ''} ${Icon('chevron-down', { size: 14, color: 'var(--faint)' })}</button>
        <a class="iconbtn" href="#/profilo" data-link aria-label="${t('nav.tu')}">${Icon('user', { size: 18 })}</a>
      </div>
      <div class="scroll">
        <div class="pad">
          <h1 class="h1">${t('home.title1')} <em>${t('home.titleEm')}</em></h1>
          <div class="search mt12">${Icon('search', { size: 20, color: 'var(--terra-deep)' })}
            <input id="q" aria-label="${t('home.searchAria')}" placeholder="${t('home.searchPlaceholder')}" value="${s.query}"></div>
          ${inZone ? `<div class="chips mt12">${chips}</div>` : ''}
        </div>
        ${inZone ? `
        <div class="pad mt16">
          <div class="mapwrap"><div id="map" class="map-canvas"></div>
            <a class="map-fab open" href="#/mappa" data-link>${Icon('map-pin', { size: 16, color: 'var(--verde)' })} ${t('home.openMap')}</a></div>
        </div>
        <div class="pad mt22">
          <div class="block-h"><div class="section-t">${t('home.nearYou')}</div><span class="eyebrow tnum">${t('home.verifiedCount', { n: list.length })}</span></div>
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
  if (!p) return { html: `<div class="screen no-nav"><div class="pad mt22">${t('producer.notFound')} <a href="#/home" data-link>${t('producer.backHome')}</a></div></div>` };
  const cats = p.categories.map(c => `<span class="chip" style="padding:5px 11px">${Icon(catGlyph[c], { size: 14 })}${catLabel(c)}</span>`).join('');
  // Pull-quote: cita le parole vere del produttore (estratte da story tra « »), con attribuzione.
  const quoteMatch = (p.story || '').match(/«([^»]+)»/);
  const quote = quoteMatch ? quoteMatch[1].trim() : t('producer.defaultQuote');
  const quoteWho = `${(p.name || '').replace(/^Az\.\s*Agricola\s+di\s+/i, '')}, ${p.place || ''}`.replace(/,\s*$/, '');

  // ---- Sezione video "full-swipe" (stile storie) — un grande stage; si scorre in orizzontale tra i video ----
  const vids = Array.isArray(p.videos) ? p.videos : [];
  const VCHIP = { presentazione: t('producer.videoPresentazione'), storia: t('producer.videoStoria'), metodo: t('producer.videoMetodo') };
  const VCLS = { presentazione: 'pre', storia: 'sto', metodo: 'met' };
  let mainIdx = vids.findIndex(v => v.type === 'presentazione');
  if (mainIdx < 0) mainIdx = 0;
  // Ordine: presentazione per prima, poi gli altri. Ogni slide ricorda l'indice REALE (per la rotta del player).
  const vOrdered = vids.length
    ? [{ v: vids[mainIdx], i: mainIdx }, ...vids.map((v, i) => ({ v, i })).filter(x => x.i !== mainIdx)]
    : [];
  const chev = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M${d === 'l' ? '15 6l-6 6 6 6' : '9 6l6 6-6 6'}"/></svg>`;
  const slide = ({ v, i }) => `
        <a class="pv3-slide" href="#/video/${p.id}/${i}" data-link aria-label="${t('producer.watchAria', { title: v.title || 'video' })}">
          ${Photo(v.tone, '', '', i === mainIdx ? p.photo : '', p.photoPos || 'center')}
          <span class="pv3-scr"></span>
          <span class="pv-cat ${VCLS[v.type] || 'pre'}">${VCHIP[v.type] || t('producer.videoGeneric')}</span>
          ${v.state === 'coming'
            ? `<span class="pv3-soon">${Icon('clock', { size: 15, color: '#fff' })} ${t('common.comingSoon')}</span>`
            : `<span class="pv3-play">${Icon('play', { size: 26, color: 'var(--ink)' })}</span>`}
          <div class="pv3-cap"><h3>${v.title || t('producer.chapter')}</h3>
            <div class="pv3-d">${v.duration ? v.duration + ' · ' : ''}${v.state === 'coming' ? t('producer.notAvailableYet') : t('producer.tapToPlay')}</div></div>
        </a>`;
  // Capitolo (lista laterale su desktop — variante 02): miniatura + tipo + titolo + durata.
  const chapterRow = ({ v, i }, k) => `
        <button class="pv3-ch ${k === 0 ? 'on' : ''}" type="button" data-pv3-goto="${k}">
          <span class="pv3-ch-th">${Photo(v.tone, '', '', i === mainIdx ? p.photo : '', p.photoPos || 'center')}<span class="pv3-ch-pl">${Icon(v.state === 'coming' ? 'clock' : 'play', { size: 13, color: '#fff' })}</span></span>
          <span class="pv3-ch-meta"><span class="pv3-ch-k">${VCHIP[v.type] || t('producer.videoGeneric')}</span><span class="pv3-ch-t">${v.title || t('producer.chapter')}</span>
            <span class="pv3-ch-d">${v.state === 'coming' ? t('producer.notAvailableYet') : (v.duration || '')}</span></span>
        </button>`;
  const multi = vOrdered.length > 1;
  const videoSection = vOrdered.length ? `
        <div class="block">
          <div class="block-h"><div class="section-t">${t('producer.watchVisit')}</div><span class="eyebrow tnum">${t('producer.videoCount', { n: vids.length })}</span></div>
          <div class="pv3-wrap ${multi ? '' : 'solo'}">
            <div class="pv3">
              <div class="pv3-track" data-pv3-track>${vOrdered.map(slide).join('')}</div>
              ${multi ? `
              <div class="pv3-count" data-pv3-count>1 / ${vOrdered.length}</div>
              <button class="pv3-arrow pv3-l" type="button" data-pv3-prev aria-label="${t('producer.prevVideo')}">${chev('l')}</button>
              <button class="pv3-arrow pv3-r" type="button" data-pv3-next aria-label="${t('producer.nextVideo')}">${chev('r')}</button>
              <div class="pv3-dots" data-pv3-dots>${vOrdered.map((_, k) => `<i class="${k === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
            </div>
            ${multi ? `<div class="pv3-chapters">${vOrdered.map(chapterRow).join('')}</div>` : ''}
          </div>
          ${multi ? `<div class="pv3-hint">${t('producer.swipeHint')}</div>` : ''}
        </div>` : '';
  return {
    html: `<div class="screen no-nav prod">
      <div class="scroll">
        <div class="hero">
          ${Photo(p.tone, '', '', p.photo, p.photoPos || 'center')}
          <div class="hero-top">
            <button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 18 })}</button>
            <button class="iconbtn" data-save aria-label="${t('producer.saveAria')}" aria-pressed="${p.saved ? 'true' : 'false'}">${Icon(p.saved ? 'heart' : 'bookmark', { size: 18, color: p.saved ? 'var(--verde)' : 'var(--ink)', fill: p.saved ? 'var(--verde)' : 'none' })}</button>
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
          <div class="block-h"><div class="section-t">${t('producer.seasonNow')}</div><span class="eyebrow tnum">${p.seasonal.length} ${p.seasonal.length === 1 ? t('producer.productOne') : t('producer.productMany')}</span></div>
          <div class="seasonal">${p.seasonal.map(si => `<div class="si">${Photo(si.tone, '')}<div class="sl">${si.label}${si.note ? `<span class="sn">${si.note}</span>` : ''}</div></div>`).join('')}</div>
        </div>

        <div class="block">
          <div class="kv"><span class="open">${Icon('clock', { size: 17, color: 'var(--verde-deep)' })}</span> ${p.hours}</div>
          <div class="kv">${Icon('map-pin', { size: 17, color: 'var(--muted)' })} ${p.address}</div>
          <div class="dlv-sel"><div class="dlv-soon">${Icon('truck', { size: 17, color: 'var(--muted)' })} <b style="color:var(--ink)">${t('producer.homeDelivery')}</b> · ${t('producer.deliveryUnavailable')}</div>
            <div class="muted" style="font-size:12.5px;margin-top:6px">${t('producer.deliveryNote')}</div></div>
        </div>

        <div class="block">
          <div class="block-h"><div class="section-t">${t('producer.reviews')}</div></div>
          <div class="muted" style="font-size:14px">${t('producer.noReviews1')} <b style="color:var(--verde-deep)">${t('producer.verifiedByTech', { date: locDate(p.verify.date) })}${p.verify.by ? ' — ' + esc(p.verify.by) : ''}</b>.</div>
        </div>
        <div style="height:12px"></div>
      </div>
      <div class="cta-sticky">
        <button class="btn btn-grad" style="flex:1" data-contact aria-label="${t('producer.contactPickup')}">${Icon('message-circle', { size: 18, color: '#fff' })} ${t('producer.contactPickup')}</button>
        <button class="iconbtn" style="width:52px;height:52px" data-nav aria-label="${t('producer.directionsAria')}">${Icon('navigation', { size: 20, color: 'var(--verde)' })}</button>
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
        const chaps = [...el.querySelectorAll('[data-pv3-goto]')]; // capitoli laterali (desktop, variante 02)
        const prevB = el.querySelector('[data-pv3-prev]');
        const nextB = el.querySelector('[data-pv3-next]');
        let cur = 0;
        const paint = (i) => {
          if (countEl) countEl.textContent = `${i + 1} / ${n}`;
          dots.forEach((d, k) => d.classList.toggle('on', k === i));
          chaps.forEach((c, k) => c.classList.toggle('on', k === i));
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
        chaps.forEach((c, k) => c.onclick = () => go(k)); // clic sul capitolo → porta il player su quel video
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
  const msg = encodeURIComponent(t('contact.waMsg', { name: name ? ' ' + name : '' }));
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
  if (c.whatsapp) rows.push(`<a href="${waHref(c.whatsapp, p.name)}" target="_blank" rel="noopener" class="contact-row wa" aria-label="${t('contact.waAria')}"><span class="cr-ic">${Icon('message-circle', { size: 20 })}</span> WhatsApp</a>`);
  if (c.phone) rows.push(`<a href="${telHref(c.phone)}" class="contact-row ph" aria-label="${t('contact.callAria')}"><span class="cr-ic">${Icon('phone', { size: 20 })}</span> ${t('contact.call')}</a>`);
  if (c.email) rows.push(`<a href="mailto:${c.email}" class="contact-row em" aria-label="${t('contact.emailAria')}"><span class="cr-ic">${Icon('mail', { size: 20 })}</span> Email</a>`);
  rows.push(`<a href="${mapsHref(p)}" target="_blank" rel="noopener" class="contact-row dir" aria-label="${t('contact.directionsAria')}"><span class="cr-ic">${Icon('navigation', { size: 20 })}</span> ${t('contact.directions')}</a>`);
  const back = document.createElement('div'); back.className = 'sheet-backdrop';
  back.setAttribute('role', 'dialog');
  back.setAttribute('aria-modal', 'true');
  back.setAttribute('aria-label', `Contatti · ${p.name}`);
  back.innerHTML = `<div class="sheet"><div class="handle"></div>
    <div class="sh-title">${p.name}</div>
    <div class="sh-sub">${p.hours || ''}</div>
    ${rows.join('')}
    <div class="sh-note">${t('contact.note')}</div></div>`;
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
    `<button class="chip ${salvatiFilter === null ? 'active' : ''}" data-filter="">${t('saved.all', { n: saved.length })}</button>`,
    ...present.map(c => `<button class="chip ${salvatiFilter === c.id ? 'active' : ''}" data-filter="${c.id}">${Icon(c.glyph, { size: 14 })}${catLabel(c)}</button>`),
  ].join('');
  const renderList = () => shown.length
    ? shown.map(ProducerCard).join('')
    : `<div class="center muted" style="padding:40px 20px">${t('saved.emptyCategory')}</div>`;
  return {
    html: `<div class="screen">${StatusBar()}
      <div class="pad mt8"><h1 class="h1">${t('saved.title')}</h1></div>
      ${saved.length ? `<div class="pad mt12"><div class="chips">${chips}</div></div>` : ''}
      <div class="scroll"><div class="pad mt16 gap8" id="saved-list">
        ${saved.length ? renderList()
        : `<div class="center muted" style="padding:60px 20px">${Icon('bookmark', { size: 40, color: 'var(--faint)' })}<div class="mt12">${t('saved.empty')}</div></div>`}
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
  const uName = u.name || (u.email ? u.email.split('@')[0] : t('profile.yourProfile'));
  const uMeta = u.email || t('settings.member');
  const langCur = LANGS.find(l => l.code === getLang()) || LANGS[0];
  const uz = userZone();
  const zoneLabel = uz ? ((uz.comuni && uz.comuni[0]) || uz.label || uz.region || t('profile.zone')) : t('profile.zone');
  const chevr = Icon('chevron-right', { size: 18, color: 'var(--faint)' });
  const rowIc = (bg, col, ic) => `<span class="p5-ic" style="background:${bg};color:${col}">${ic}</span>`;
  // Etichetta dinamica dell'ingresso produttore: form di richiesta → area sbloccata dopo l'approvazione.
  const pst = u.producerStatus;
  const prodLabel = pst === 'requested' ? 'Richiesta in corso' : (pst ? 'La mia area' : t('settings.producer'));
  return {
    html: `<div class="screen prof05">
      <style>
      .prof05 .scroll{ padding:0 16px 16px; }
      .prof05 .p5-hero{ background:linear-gradient(160deg,#eaf6ee,#e3f0f6); border-radius:0 0 22px 22px; margin:0 -16px; padding:26px 18px 18px; text-align:center; }
      .prof05 .p5-ava{ width:74px; height:74px; border-radius:50%; margin:0 auto; background:var(--verde-pale); color:var(--verde-deep); display:flex; align-items:center; justify-content:center; font-family:var(--serif); font-weight:700; font-size:30px; overflow:hidden; }
      .prof05 .p5-ava img{ width:100%; height:100%; object-fit:cover; }
      .prof05 .p5-name{ font-family:var(--serif); font-size:21px; font-weight:600; color:var(--ink); margin-top:9px; }
      .prof05 .p5-mail{ font-size:12.5px; color:var(--muted); margin-top:1px; }
      .prof05 .p5-chips{ display:flex; gap:8px; justify-content:center; margin-top:12px; flex-wrap:wrap; }
      .prof05 .p5-chip{ display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:var(--verde-deep); background:#fff; border:1px solid var(--verde-pale); padding:8px 13px; border-radius:100px; cursor:pointer; font-family:inherit; }
      .prof05 .p5-chip.cel{ color:var(--celeste-deep); border-color:var(--celeste-pale); }
      .prof05 .p5-card{ background:var(--bianco); border:1px solid var(--bd); border-radius:16px; box-shadow:var(--sh-card); overflow:hidden; margin-top:16px; }
      .prof05 .p5-row{ display:flex; align-items:center; gap:13px; width:100%; text-align:left; padding:14px 15px; border-bottom:1px solid var(--bd2); background:none; border-left:none; border-right:none; border-top:none; cursor:pointer; font-family:inherit; }
      .prof05 .p5-row:last-child{ border-bottom:none; }
      .prof05 .p5-ic{ width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex:none; }
      .prof05 .p5-lb{ flex:1; font-size:14.5px; color:var(--ink); font-weight:500; }
      .prof05 .p5-sect{ font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--muted2); margin:20px 4px 8px; }
      .prof05 .p5-logout .p5-lb{ color:#C0392B; }
      .prof05 .p5-toggle{ width:44px; height:26px; border-radius:100px; border:none; padding:0; position:relative; flex:none; cursor:pointer; transition:background .18s; }
      .prof05 .p5-toggle i{ position:absolute; top:3px; width:20px; height:20px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.25); transition:left .18s; }
      </style>
      ${StatusBar()}
      <div class="scroll">
        <div class="p5-hero">
          <div class="p5-ava">${avatarInner(u, uName)}</div>
          <div class="p5-name">${uName}</div>
          <div class="p5-mail">${uMeta}</div>
          <div class="p5-chips">
            <button class="p5-chip" type="button" data-lang-open>${langCur.flag} ${langCur.label} ${Icon('chevron-down', { size: 14, color: 'var(--faint)' })}</button>
            <button class="p5-chip cel" type="button" data-open-auth="zone">${Icon('map-pin', { size: 14, color: 'var(--celeste-deep)' })} ${zoneLabel}</button>
          </div>
        </div>

        <div class="p5-card">
          <a class="p5-row" href="#/profilo/modifica" data-link>${rowIc('var(--verde-pale)', 'var(--verde-deep)', Icon('user', { size: 18 }))}<span class="p5-lb">${t('settings.editProfile')}</span>${chevr}</a>
          <div class="p5-row" style="cursor:default">${rowIc('var(--carta-scura)', 'var(--ink-soft)', Icon('bell', { size: 18 }))}<span class="p5-lb">${t('settings.notifications')}</span>
            <button type="button" role="switch" aria-checked="${notifOn}" aria-label="${t('settings.notifications')}" data-notif class="p5-toggle" style="background:${notifOn ? 'var(--verde)' : 'var(--bd3,#d8cdb8)'}"><i style="left:${notifOn ? '21px' : '3px'}"></i></button></div>
        </div>

        <div class="p5-card">
          <a class="p5-row" href="#/azienda" data-link>${rowIc('var(--verde-pale)', 'var(--verde-deep)', Icon('leaf', { size: 18 }))}<span class="p5-lb">${prodLabel}</span>${producerStatusNotice() ? '<span style="width:9px;height:9px;border-radius:50%;background:var(--verde);flex:none;margin-right:6px"></span>' : ''}${chevr}</a>
        </div>

        ${(() => {
          // Ingresso staff (audit A4): mostrato SOLO se sei già staff loggato (ruolo risolto) → i clienti non lo vedono.
          // Dà allo staff un accesso anche su mobile (il rail è solo desktop). Coerente con la RBAC (B1).
          const role = getState().role;
          if (role !== 'admin' && role !== 'verificatore') return '';
          const srow = (href, ic, label) => `<a class="p5-row" href="${href}" data-link>${rowIc('var(--carta-scura)', 'var(--ink-soft)', Icon(ic, { size: 18 }))}<span class="p5-lb">${label}</span>${chevr}</a>`;
          return `<div class="p5-sect">Staff</div><div class="p5-card">${role === 'admin' ? srow('#/admin', 'sliders', 'Gestione') : ''}${srow('#/sasha', 'check-circle', 'Area verificatore')}</div>`;
        })()}

        <div class="p5-card" style="margin-top:16px">
          <a class="p5-row" href="#/termini" data-link>${rowIc('var(--carta-scura)', 'var(--ink-soft)', Icon('info', { size: 18 }))}<span class="p5-lb">${t('settings.terms')}</span>${chevr}</a>
          <a class="p5-row" href="#/privacy" data-link>${rowIc('var(--carta-scura)', 'var(--ink-soft)', Icon('lock', { size: 18 }))}<span class="p5-lb">${t('settings.privacy')}</span>${chevr}</a>
          <button class="p5-row p5-logout" type="button" data-logout>${rowIc('#f6e4e1', '#C0392B', Icon('arrow-left', { size: 18 }))}<span class="p5-lb">${t('settings.logout')}</span></button>
        </div>
        <div style="height:14px"></div>
      </div>
      ${BottomNav('tu')}</div>`,
    onMount(el) {
      const lang = el.querySelector('[data-lang-open]'); if (lang) lang.onclick = () => openLangSheet();
      const notif = el.querySelector('[data-notif]');
      if (notif) notif.onclick = () => {
        const on = notif.getAttribute('aria-checked') !== 'true';
        localStorage.setItem('gf_notif', on ? '1' : '0');
        notif.setAttribute('aria-checked', String(on));
        notif.style.background = on ? 'var(--verde)' : 'var(--bd3,#d8cdb8)';
        notif.firstElementChild.style.left = on ? '21px' : '3px';
        try { if (currentUser()) updateProfile({ notif: on }); } catch (_) {}
      };
      const out = el.querySelector('[data-logout]');
      if (out) out.onclick = async () => { try { await signOut(); } catch (_) {} location.hash = '#/'; setTimeout(() => location.reload(), 40); };
    },
  };
}

/* ---------------- MODIFICA PROFILO (variante "riga-per-riga") ---------------- */
export function ProfiloEdit() {
  const u = currentUser() || {};
  const uName = u.name || (u.email ? u.email.split('@')[0] : '');
  const uz = userZone();
  const cityPh = (uz && ((uz.comuni && uz.comuni[0]) || uz.label)) || t('profile.cityPlaceholder');
  const esc = s => String(s || '').replace(/"/g, '&quot;');
  return {
    html: `<div class="screen no-nav pedit">
      <style>
      .pedit .scroll{ padding:0 16px 24px; }
      .pedit .pe-top{ display:flex; align-items:center; gap:10px; padding:12px 4px; }
      .pedit .pe-top .tt{ flex:1; text-align:center; font-weight:600; color:var(--ink); }
      .pedit .pe-ava{ position:relative; width:96px; height:96px; margin:8px auto 6px; }
      .pedit .pe-ava .av{ width:96px; height:96px; border-radius:50%; background:var(--verde-pale); color:var(--verde-deep); display:flex; align-items:center; justify-content:center; font-family:var(--serif); font-weight:700; font-size:38px; overflow:hidden; }
      .pedit .pe-ava .av img{ width:100%; height:100%; object-fit:cover; }
      .pedit .pe-ava .cam{ position:absolute; right:-2px; bottom:-2px; width:32px; height:32px; border-radius:50%; background:var(--verde); color:#fff; display:flex; align-items:center; justify-content:center; border:3px solid var(--carta); cursor:pointer; }
      .pedit .pe-chg{ text-align:center; font-size:13px; font-weight:600; color:var(--verde-deep); margin-bottom:18px; cursor:pointer; }
      .pedit .pe-card{ background:var(--bianco); border:1px solid var(--bd); border-radius:16px; box-shadow:var(--sh-card); overflow:hidden; }
      .pedit .pe-row{ display:flex; align-items:center; gap:12px; padding:13px 15px; border-bottom:1px solid var(--bd2); }
      .pedit .pe-row:last-child{ border-bottom:none; }
      .pedit .pe-row label{ font-size:14.5px; color:var(--ink); font-weight:500; flex:none; width:92px; }
      .pedit .pe-row input{ flex:1; border:none; background:none; text-align:right; font-family:inherit; font-size:14.5px; color:var(--ink); min-width:0; }
      .pedit .pe-row input::placeholder{ color:var(--faint); }
      .pedit .pe-row input:focus{ outline:none; }
      .pedit .pe-row.ro span{ flex:1; text-align:right; font-size:13px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .pedit .pe-note{ font-size:11.5px; color:var(--faint); margin:10px 6px; line-height:1.5; }
      .pedit .pe-msg{ min-height:18px; text-align:center; font-size:12.5px; font-weight:600; margin-top:8px; }
      </style>
      ${StatusBar()}
      <div class="scroll">
        <div class="pe-top"><button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 18 })}</button><span class="tt">${t('profile.title')}</span><span style="width:44px;flex:none"></span></div>
        <div class="pe-ava"><span class="av" data-ava>${avatarInner(u, uName)}</span><button class="cam" type="button" data-cam aria-label="${t('profile.changePhoto')}">${Icon('camera', { size: 17, color: '#fff' })}</button></div>
        <div class="pe-chg" data-cam-txt>${t('profile.changePhoto')}</div>
        <input type="file" accept="image/*" data-avatar-input style="display:none">
        <div class="pe-card">
          <div class="pe-row"><label>${t('profile.name')}</label><input data-field="name" value="${esc(u.name)}" placeholder="${t('profile.namePlaceholder')}"></div>
          <div class="pe-row"><label>${t('profile.city')}</label><input data-field="city" value="${esc(u.city)}" placeholder="${esc(cityPh)}"></div>
          <div class="pe-row"><label>${t('profile.phone')}</label><input data-field="phone" inputmode="tel" value="${esc(u.phone)}" placeholder="${t('profile.add')}"></div>
          <div class="pe-row ro"><label>${t('profile.email')}</label><span>${u.email || ''}</span></div>
        </div>
        <div class="pe-msg" data-msg></div>
        <div class="pe-note">${t('profile.emailNote')}</div>
      </div>
    </div>`,
    onMount(el) {
      const back = el.querySelector('[data-back]'); if (back) back.onclick = () => { location.hash = '#/profilo'; };
      const msg = el.querySelector('[data-msg]');
      const flash = (txt, ok = true) => { if (msg) { msg.textContent = txt; msg.style.color = ok ? 'var(--verde-deep)' : 'var(--red-alert)'; setTimeout(() => { if (msg.textContent === txt) msg.textContent = ''; }, 1600); } };
      el.querySelectorAll('[data-field]').forEach(inp => {
        const save = async () => {
          const field = inp.dataset.field, val = inp.value.trim();
          if (val === ((currentUser() || {})[field] || '')) return;
          try { await updateProfile({ [field]: val }); flash(t('profile.saved') + ' ✓'); }
          catch (e) { flash(t('profile.saveError'), false); }
        };
        inp.addEventListener('blur', save);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
      });
      const fileInp = el.querySelector('[data-avatar-input]');
      const pick = () => fileInp && fileInp.click();
      const cam = el.querySelector('[data-cam]'); if (cam) cam.onclick = pick;
      const camTxt = el.querySelector('[data-cam-txt]'); if (camTxt) camTxt.onclick = pick;
      if (fileInp) fileInp.onchange = () => {
        const f = fileInp.files && fileInp.files[0]; if (!f) return;
        if (f.size > 5 * 1024 * 1024) { flash(t('profile.photoTooBig'), false); return; }
        const fr = new FileReader();
        fr.onload = async () => {
          try {
            await uploadAvatar(fr.result);
            const av = el.querySelector('[data-ava]'); if (av) av.innerHTML = avatarInner(currentUser(), uName);
            flash(t('profile.saved') + ' ✓');
          } catch (e) { flash(t('profile.photoError'), false); }
        };
        fr.readAsDataURL(f);
      };
    },
  };
}

/* ---------------- stub "in arrivo" ---------------- */
export function Soon(title) {
  return {
    html: `<div class="screen no-nav">${StatusBar()}
      <div class="toprow"><button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 18 })}</button></div>
      <div class="center" style="padding:80px 30px">${Icon('truck', { size: 44, color: 'var(--terra)' })}
      <h2 class="h2 mt16">${title}</h2><p class="muted mt8">${t('soon.body')}</p></div></div>`,
    onMount(el) { const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back(); },
  };
}

// rerender hook (impostato da main.js)
export let rerender = () => {};
export function setRerender(fn) { rerender = fn; }
