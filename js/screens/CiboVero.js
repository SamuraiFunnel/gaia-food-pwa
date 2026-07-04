import { Icon } from '../icons.js';
import { StatusBar, Photo, VerifyBadge, BottomNav } from '../components.js';
import { results } from '../store.js';

const km = n => String(n).replace('.', ',');
// data verifica compatta: "12 giugno 2026" -> "12 giu"
const MESI = { gennaio: 'gen', febbraio: 'feb', marzo: 'mar', aprile: 'apr', maggio: 'mag', giugno: 'giu', luglio: 'lug', agosto: 'ago', settembre: 'set', ottobre: 'ott', novembre: 'nov', dicembre: 'dic' };
const shortDate = (d = '') => {
  const [g, m] = d.split(' ');
  return m ? `${g} ${MESI[m] || m.slice(0, 3)}` : d;
};

/**
 * Cibo Vero — feed editoriale dei video pronti dei produttori.
 * Una card per ogni video state:"ready" di tipo presentazione/storia,
 * dal produttore più vicino. Tap card -> #/video/<id>.
 */
export function CiboVero() {
  // produttori ordinati per km, con almeno un video pronto (presentazione/storia)
  const feed = results()
    .map(p => {
      const v = (p.videos || []).find(
        x => x.state === 'ready' && (x.type === 'presentazione' || x.type === 'storia')
      );
      return v ? { p, v } : null;
    })
    .filter(Boolean)
    .slice(0, 5);

  // VerifyBadge espone {state,date}: ricompongo con la data abbreviata ("12 giu")
  const card = ({ p, v }) => {
    const vShort = { ...p.verify, date: shortDate(p.verify.date) };
    return `
    <a class="cv-card" href="#/video/${p.id}" data-link aria-label="Guarda: ${v.title}">
      <div class="cv-poster">
        ${Photo(v.tone, `${v.type} · ${v.title}`, 'cv-photo')}
        <div class="cv-play">${Icon('play', { size: 23, color: '#fff' })}</div>
        <span class="cv-dur tnum">${v.duration}</span>
        <span class="cv-tag">${v.type}</span>
      </div>
      <div class="cv-body">
        <h2 class="cv-title serif">${v.title}</h2>
        <div class="cv-meta">
          ${VerifyBadge(vShort, { compact: true })}
          <span class="cv-place">${p.place} · <b class="tnum">${km(p.km)} km</b></span>
        </div>
        <button class="cv-mappa" data-mappa="${p.id}">
          ${Icon('map-pin', { size: 15, color: 'var(--verde-deep)', stroke: 2.1 })} Trova il produttore sulla mappa
        </button>
      </div>
    </a>`;
  };

  const empty = `
    <div class="cv-empty">
      ${Icon('play', { size: 38, color: 'var(--faint)' })}
      <div class="cv-empty-t serif">Ancora nessuna storia da guardare</div>
      <p class="muted">Stiamo girando le prime visite ai produttori verificati della zona.
        Intanto puoi conoscerli dalla mappa.</p>
      <a class="btn btn-grad btn-block mt12" href="#/home" data-link>${Icon('map-pin', { size: 17, color: '#fff' })} Vai ai produttori vicini</a>
    </div>`;

  const list = feed.length
    ? feed.map(card).join('')
    : empty;

  return {
    html: `
    <style>
      .cv-card{ display:block; background:#fff; border:1px solid var(--bd); border-radius:var(--r-card);
        overflow:hidden; box-shadow:var(--sh-card); }
      .cv-poster{ position:relative; aspect-ratio:16/10; }
      .cv-poster .cv-photo{ position:absolute; inset:0; height:100%; }
      .cv-play{ position:absolute; inset:0; margin:auto; width:58px; height:58px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; padding-left:3px;
        background:rgba(255,255,255,.18); border:1.5px solid rgba(255,255,255,.75); backdrop-filter:blur(6px);
        box-shadow:0 8px 22px rgba(0,0,0,.3); }
      .cv-dur{ position:absolute; bottom:12px; right:13px; font-size:12px; font-weight:600; color:#fff;
        text-shadow:0 1px 3px rgba(0,0,0,.55); }
      .cv-tag{ position:absolute; top:12px; left:12px; font-size:10px; font-weight:700; letter-spacing:.12em;
        text-transform:uppercase; color:#fff; background:rgba(31,24,18,.55); backdrop-filter:blur(4px);
        padding:4px 9px; border-radius:var(--r-pill); }
      .cv-body{ padding:15px 17px 16px; }
      .cv-title{ font-size:21px; font-weight:600; color:var(--ink); line-height:1.15; }
      .cv-meta{ display:flex; align-items:center; flex-wrap:wrap; gap:9px; margin-top:11px; }
      .cv-place{ font-size:12.5px; color:var(--muted2); }
      .cv-place b{ color:var(--terra-deep); font-weight:700; }
      .cv-mappa{ margin-top:13px; display:inline-flex; align-items:center; gap:6px; min-height:30px;
        color:var(--verde-deep); font-size:13.5px; font-weight:600; font-family:var(--sans); }
      .cv-mappa svg{ flex:none; }
      .cv-foot{ text-align:center; font-size:13px; color:var(--faint); padding:4px 0 2px; }
      .cv-empty{ text-align:center; padding:48px 8px 20px; display:flex; flex-direction:column; align-items:center; gap:8px; }
      .cv-empty-t{ font-size:19px; font-weight:600; color:var(--ink); margin-top:8px; }
      .cv-empty p{ font-size:13.5px; line-height:1.6; max-width:300px; }
    </style>
    <div class="screen">
      ${StatusBar()}
      <div class="toprow">
        <span class="loc">${Icon('play', { size: 16, color: 'var(--verde)' })}<b>Cibo Vero</b></span>
        <a class="iconbtn" href="#/profilo" data-link aria-label="Profilo">${Icon('user', { size: 18 })}</a>
      </div>
      <div class="scroll">
        <div class="pad mt8">
          <div class="eyebrow">Cibo Vero</div>
          <h1 class="h1 mt8">Guarda chi c'è <em>dietro</em> il cibo.</h1>
        </div>
        <div class="pad mt22">
          <div class="gap8" style="gap:18px" id="cv-list">${list}</div>
          ${feed.length ? `<div class="cv-foot mt16">Altre storie in arrivo — stiamo girando le prime visite.</div>` : ''}
        </div>
        <div style="height:24px"></div>
      </div>
      ${BottomNav('scopri')}
    </div>`,
    onMount(el) {
      // "Trova sulla mappa" -> scheda produttore, senza far scattare il tap sulla card
      el.querySelectorAll('[data-mappa]').forEach(b => {
        b.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          location.hash = `#/produttore/${b.dataset.mappa}`;
        };
      });
    },
  };
}
