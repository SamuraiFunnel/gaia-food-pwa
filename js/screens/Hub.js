import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';
import { markHubSeen } from '../store.js';
import { t } from '../i18n.js';

/* ---------------- HUB D'INGRESSO — "Cosa vuoi fare?" ----------------
   Look = design-lab/hub/V1-velo-scuro.html ("velo scuro").
   La prima esperienza presenta i due pilastri attivi della nuova Gaia Food:
     1) "Rete Gaia"          — piazza locale di persone e produttori → #/comunita
     2) "Trova un produttore" — esplorazione separata di mappa e schede → #/home
   Consegna e percorso restano teaser secondari, chiaramente non disponibili.

   LOGICA PRESERVATA — la scelta di una voce (o "Salta") segna l'Hub come
   "visto" via markHubSeen: agli avvii successivi si salta direttamente.
   `data-fn` con valore = funzione reale ricordata come ultima usata;
   `data-fn` vuoto (teaser "in arrivo") segna comunque l'Hub come visto.
   Le card HERO sono `<a data-link>` perché il router gestisca la rotta. */

// SVG bespoke replicati da V1 (per fedeltà visiva; il resto usa Icon()).
const svgGo = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>`;
const svgLock = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>`;
const svgPinTag = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21c4-3.5 7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 3 7.5 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>`;
const svgSpark = `<svg class="spark" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.6 4.8L18.5 8l-4.9 1.2L12 14l-1.6-4.8L5.5 8l4.9-1.2L12 2Z"/></svg>`;
const svgNetwork = `<svg viewBox="0 0 420 280" aria-hidden="true" focusable="false">
  <path d="M48 196C112 92 188 218 270 112S386 86 410 42"/>
  <path d="M18 88C96 144 150 42 226 96s112 118 184 72"/>
  <circle cx="49" cy="196" r="8"/><circle cx="126" cy="135" r="7"/><circle cx="224" cy="96" r="9"/>
  <circle cx="270" cy="112" r="7"/><circle cx="356" cy="76" r="10"/><circle cx="405" cy="168" r="7"/>
</svg>`;

export function Hub() {
  return {
    html: `<div class="screen no-nav hub-screen">
      ${StatusBar()}
      <style>
      /* === HUB "velo scuro" — scope: .hub-screen (non tocca le altre schermate) === */
      .hub-screen .scroll{ width:100%; }
      .hub-screen .hub-wrap{ width:100%; max-width:430px; margin:0 auto; padding:6px 22px 40px; }

      .hub-screen .intro{ padding:18px 2px 18px; }
      .hub-screen .eyebrow2{
        font-size:10.5px; font-weight:700; letter-spacing:.2em; text-transform:uppercase;
        color:var(--verde-deep); display:inline-flex; align-items:center; gap:7px;
      }
      .hub-screen .eyebrow2::before{ content:''; width:16px; height:1.5px; background:var(--verde); border-radius:2px; }
      .hub-screen .title{
        font-family:var(--serif); font-weight:600; letter-spacing:-.02em; line-height:1.04;
        font-size:33px; color:var(--ink); margin-top:12px;
      }
      .hub-screen .title em{ font-style:italic; color:var(--verde); }
      .hub-screen .subtitle{ font-size:14.5px; line-height:1.5; color:var(--muted); margin-top:10px; max-width:34ch; }

      /* ---------- CARDS HERO ---------- */
      .hub-screen .cards{ display:flex; flex-direction:column; gap:15px; }
      .hub-screen .hcard{
        position:relative; border-radius:22px; overflow:hidden; isolation:isolate;
        min-height:188px; display:flex; flex-direction:column; justify-content:flex-end;
        box-shadow:var(--sh-card); border:1px solid rgba(31,24,18,.06);
        -webkit-tap-highlight-color:transparent;
      }
      .hub-screen .hcard .bg{ position:absolute; inset:0; z-index:0; width:100%; height:100%; object-fit:cover; display:block; }
      .hub-screen .hcard .body{ position:relative; z-index:3; padding:18px; color:#fff; }
      .hub-screen .hcard .row{ display:flex; align-items:flex-end; justify-content:space-between; gap:12px; }
      .hub-screen .hcard h2{
        font-family:var(--serif); font-weight:600; letter-spacing:-.015em; line-height:1.12;
        font-size:23px; color:#fff; text-shadow:0 1px 18px rgba(0,0,0,.45);
      }
      .hub-screen .hcard p{
        font-size:13.5px; line-height:1.45; color:rgba(255,255,255,.94);
        margin-top:6px; max-width:30ch; text-shadow:0 1px 14px rgba(0,0,0,.4);
      }
      /* pill icona in alto a sinistra */
      .hub-screen .hcard .tag{
        position:absolute; z-index:3; top:14px; left:14px;
        display:inline-flex; align-items:center; gap:7px;
        padding:7px 12px 7px 9px; border-radius:100px;
        background:rgba(255,255,255,.18);
        -webkit-backdrop-filter:blur(7px); backdrop-filter:blur(7px);
        border:1px solid rgba(255,255,255,.28);
        font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#fff;
      }
      .hub-screen .hcard .tag svg{ flex:none; }

      /* ===== CARD ATTIVA (1ª) ===== */
      .hub-screen .hcard.active{ min-height:228px; }
      .hub-screen .hcard.active .scrim{
        position:absolute; inset:0; z-index:1;
        background:
          linear-gradient(180deg, rgba(20,30,18,0) 30%, rgba(18,26,16,.32) 60%, rgba(14,20,12,.82) 100%),
          linear-gradient(105deg, rgba(22,163,74,.16), rgba(14,165,233,.05) 60%, transparent);
      }
      .hub-screen .hcard.active .tag{ background:rgba(22,163,74,.34); border-color:rgba(255,255,255,.36); }
      .hub-screen .hcard.network-card{
        min-height:252px; background:
          radial-gradient(circle at 84% 12%, rgba(181,220,154,.2), transparent 34%),
          linear-gradient(145deg, #102d22 0%, #1d583a 54%, #b65f3a 150%);
      }
      .hub-screen .network-card .network-art{ position:absolute; z-index:0; inset:-5% -10% auto 20%; opacity:.58; }
      .hub-screen .network-card .network-art svg{ width:100%; height:auto; overflow:visible; }
      .hub-screen .network-card .network-art path{ fill:none; stroke:rgba(238,244,220,.3); stroke-width:1.7; stroke-dasharray:3 6; }
      .hub-screen .network-card .network-art circle{ fill:#e9f2d1; stroke:rgba(255,255,255,.5); stroke-width:5; }
      .hub-screen .network-card .scrim{
        background:linear-gradient(180deg, rgba(8,30,20,.02) 20%, rgba(8,28,18,.26) 54%, rgba(9,25,16,.9) 100%);
      }
      .hub-screen .hcard.find-card{ min-height:196px; }
      .hub-screen .go{
        flex:none; width:52px; height:52px; border-radius:50%;
        background:#fff; color:var(--verde-deep);
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 10px 24px -10px rgba(0,0,0,.6);
        transition:transform .25s ease, box-shadow .25s ease;
      }
      .hub-screen .hcard.active:hover .go{ transform:translateX(3px) scale(1.04); box-shadow:0 14px 30px -12px rgba(0,0,0,.7); }
      .hub-screen .go svg{ display:block; }
      .hub-screen .pickline{
        display:inline-flex; align-items:center; gap:7px; margin-top:11px;
        font-size:11.5px; font-weight:700; letter-spacing:.02em; color:#fff;
      }
      .hub-screen .pickline .dot{ width:6px; height:6px; border-radius:50%; background:var(--verde-light); box-shadow:0 0 0 4px rgba(34,197,94,.3); }

      /* ===== CARD BLOCCATE (2ª, 3ª) — VELO SCURO ===== */
      .hub-screen .hcard.locked .bg{ filter:saturate(.82) brightness(.96); }
      .hub-screen .hcard.locked .veil{
        position:absolute; inset:0; z-index:1;
        background:
          radial-gradient(120% 90% at 50% 30%, rgba(10,14,9,.42), rgba(8,12,7,.66) 100%),
          linear-gradient(180deg, rgba(10,14,9,.5), rgba(8,11,7,.66));
      }
      .hub-screen .hcard.locked h2{ color:rgba(255,255,255,.94); }
      .hub-screen .hcard.locked p{ color:rgba(255,255,255,.78); }
      .hub-screen .lockwrap{
        position:absolute; z-index:3; inset:0;
        display:flex; align-items:center; justify-content:center; pointer-events:none;
      }
      .hub-screen .lockwrap .lock{
        width:58px; height:58px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; color:#fff;
        background:rgba(255,255,255,.12);
        -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px);
        border:1px solid rgba(255,255,255,.28);
        box-shadow:0 14px 34px -16px rgba(0,0,0,.8);
      }
      .hub-screen .hcard.locked .tag{
        left:auto; right:14px; background:rgba(255,255,255,.16);
        border-color:rgba(255,255,255,.3); color:rgba(255,255,255,.96);
      }
      .hub-screen .hcard.locked .tag .spark{ color:var(--celeste); }
      .hub-screen .soonline{
        display:inline-flex; align-items:center; gap:7px; margin-top:11px;
        font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
        color:rgba(255,255,255,.8);
      }
      .hub-screen .soonline svg{ flex:none; opacity:.85; }

      /* ===== MINI-CARD affiancate (2ª+3ª "in arrivo") ===== */
      .hub-screen .mini-row{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .hub-screen .hcard.mini{ min-height:122px; border-radius:18px; }
      .hub-screen .hcard.mini h2{ font-size:16px; }
      .hub-screen .hcard.mini .body{ padding:13px; }
      .hub-screen .hcard.mini .lockwrap .lock{ width:40px; height:40px; }
      .hub-screen .hcard.mini .tag{ top:10px; right:10px; left:auto; font-size:9.5px; padding:5px 9px 5px 7px; }

      /* ---------- "salta" in fondo ---------- */
      .hub-screen .skip{ margin-top:22px; text-align:center; }
      .hub-screen .skip a{
        display:inline-flex; align-items:center; gap:9px;
        font-size:13.5px; font-weight:600; color:var(--ink-soft);
        padding:11px 18px; border-radius:100px;
        border:1px solid var(--bd2); background:var(--bianco);
        box-shadow:var(--sh-card); transition:border-color .2s ease, color .2s ease;
      }
      .hub-screen .skip a:hover{ color:var(--verde-deep); border-color:rgba(22,163,74,.35); }
      .hub-screen .skip a .sep{ color:var(--faint); font-weight:400; }
      .hub-screen .skip a svg{ flex:none; }

      /* ============================================================
         DESKTOP ≥1024 — layout largo (rompe il cap 440px solo per l'Hub)
         ============================================================ */
      @media(min-width:1024px){
        #app:has(.hub-screen){ max-width:none; background:var(--carta); }
        .hub-screen .hub-wrap{
          max-width:1180px; padding:18px 40px 64px;
          display:grid; grid-template-columns:minmax(0,1fr);
          grid-template-areas:"intro" "cards" "skip"; align-content:start;
        }
        .hub-screen .intro{ grid-area:intro; padding:24px 0 26px; max-width:560px; }
        .hub-screen .title{ font-size:46px; }
        .hub-screen .subtitle{ font-size:16px; max-width:42ch; }
        /* La Rete è il nuovo ingresso principale; ricerca e funzioni future restano distinte a destra. */
        .hub-screen .cards{
          grid-area:cards; display:grid; grid-template-columns:minmax(0,1.45fr) minmax(330px,1fr);
          grid-template-areas:"network find" "network minis"; gap:18px; align-items:stretch;
        }
        .hub-screen .hcard.network-card{ grid-area:network; min-height:458px; }
        .hub-screen .hcard.find-card{ grid-area:find; min-height:220px; }
        .hub-screen .hcard.active h2{ font-size:30px; }
        .hub-screen .hcard.active p{ font-size:15px; max-width:34ch; }
        .hub-screen .hcard.active .body{ padding:24px; }
        .hub-screen .mini-row{ grid-area:minis; display:grid; grid-template-columns:1fr 1fr; gap:18px; }
        .hub-screen .hcard.mini{ min-height:0; }
        .hub-screen .hcard.mini h2{ font-size:18px; }
        .hub-screen .skip{ grid-area:skip; text-align:left; margin-top:22px; }
      }
      @media(min-width:1360px){
        .hub-screen .hcard.network-card{ min-height:480px; }
      }
      @media(prefers-reduced-motion:reduce){
        .hub-screen *{ transition:none !important; animation:none !important; }
      }
      </style>

      <div class="scroll">
        <div class="hub-wrap">

          <section class="intro">
            <span class="eyebrow2">${t('hub.welcome')}</span>
            <h1 class="title">${t('hub.title')} <em>${t('hub.titleEm')}</em></h1>
            <p class="subtitle">${t('hub.subtitle')}</p>
          </section>

          <section class="cards">

            <!-- 1 · RETE GAIA — nuovo pilastro attivo -->
            <a class="hcard active network-card" href="#/comunita" data-link data-fn="#/comunita" aria-label="${t('hub.networkAria')}">
              <span class="network-art">${svgNetwork}</span>
              <div class="scrim" aria-hidden="true"></div>
              <span class="tag">${Icon('message-circle', { size: 14 })}${t('hub.tagActive')}</span>
              <div class="body">
                <div class="row">
                  <div>
                    <h2>${t('hub.networkTitle')}</h2>
                    <p>${t('hub.networkDesc')}</p>
                    <span class="pickline"><span class="dot" aria-hidden="true"></span>${t('hub.networkCta')}</span>
                  </div>
                  <span class="go" aria-hidden="true">${svgGo}</span>
                </div>
              </div>
            </a>

            <!-- 2 · TROVA — attiva e distinta dalla Rete -->
            <a class="hcard active find-card" href="#/home" data-link data-fn="#/home" aria-label="${t('hub.card1Aria')}">
              <img class="bg" src="./assets/hub/trova.jpg" loading="lazy" decoding="async"
                   alt="${t('hub.card1Alt')}">
              <div class="scrim" aria-hidden="true"></div>
              <span class="tag">${svgPinTag}${t('hub.tagActive')}</span>
              <div class="body">
                <div class="row">
                  <div>
                    <h2>${t('hub.card1Title')}</h2>
                    <p>${t('hub.card1Desc')}</p>
                    <span class="pickline"><span class="dot" aria-hidden="true"></span>${t('hub.card1Cta')}</span>
                  </div>
                  <span class="go" aria-hidden="true">${svgGo}</span>
                </div>
              </div>
            </a>

            <!-- 3+4 · IN ARRIVO — teaser secondari -->
            <div class="mini-row">
              <a class="hcard locked mini" href="#/consegna/non-disponibile" data-link data-fn
                 aria-label="${t('hub.card2Aria')}">
                <img class="bg" src="./assets/hub/ricevi.jpg" loading="lazy" decoding="async"
                     alt="${t('hub.card2Alt')}">
                <div class="veil" aria-hidden="true"></div>
                <div class="lockwrap" aria-hidden="true"><span class="lock">${svgLock}</span></div>
                <span class="tag">${svgSpark}${t('common.comingSoon')}</span>
                <div class="body"><h2>${t('hub.card2Title')}</h2></div>
              </a>

              <a class="hcard locked mini" href="#/percorso" data-link data-fn
                 aria-label="${t('hub.card3Aria')}">
                <img class="bg" src="./assets/hub/percorso.jpg" loading="lazy" decoding="async"
                     alt="${t('hub.card3Alt')}">
                <div class="veil" aria-hidden="true"></div>
                <div class="lockwrap" aria-hidden="true"><span class="lock">${svgLock}</span></div>
                <span class="tag">${svgSpark}${t('common.comingSoon')}</span>
                <div class="body"><h2>${t('hub.card3Title')}</h2></div>
              </a>
            </div>

          </section>

        </div>
        <div style="height:28px"></div>
      </div>
    </div>`,
    onMount(el) {
      // Scelta una funzione → l'Hub è "visto": agli avvii successivi si salta.
      // `data-fn` con valore = funzione reale ricordata come ultima usata;
      // `data-fn` vuoto (teaser "in arrivo") segna comunque l'Hub come visto.
      el.querySelectorAll('[data-fn]').forEach(a => a.addEventListener('click', () => {
        markHubSeen(a.getAttribute('data-fn') || null);
      }));
    },
  };
}
