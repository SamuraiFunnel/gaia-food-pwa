import { Icon } from '../icons.js';
import { StatusBar, ProducerCard, BottomNav } from '../components.js';
import { getState, results, userZoneIsActive } from '../store.js';
import { t } from '../i18n.js';

/* ---------------- RICERCA (#/ricerca) ----------------
   Ricerca con correzione typo: l'utente ha scritto "lacte".
   Suggeriamo "Latte" + sinonimi, e mostriamo i risultati filtrati su latte
   (results() ordinato per km). Stato vuoto = causa + rimedio + uscita. */

const TYPO = 'lacte';
const CORRECTION = 'latte';
const SYNONYMS = ['latte crudo', 'formaggio', 'yogurt'];

// filtra i risultati su "latte" senza mutare in modo permanente lo stato globale.
// Fuori dalla zona attiva non ci sono produttori: lista vuota → empty-state.
function latteResults() {
  if (!userZoneIsActive()) return [];
  const s = getState();
  const prev = s.query;
  s.query = CORRECTION;
  const list = results();
  s.query = prev;
  return list;
}

export function Ricerca() {
  const list = latteResults();
  const n = list.length;

  const synChips = SYNONYMS
    .map(t => `<span class="rs-syn">${t}</span>`)
    .join('');

  const resultsBlock = n > 0
    ? `<div class="pad mt22">
         <div class="block-h">
           <div class="eyebrow">${t('ricerca.resultsCount', { n, label: n === 1 ? t('ricerca.producer') : t('ricerca.producers'), q: CORRECTION })}</div>
           <span class="muted" style="font-size:12px">${t('ricerca.byDistance')}</span>
         </div>
         <div class="gap8 mt12">${list.map(ProducerCard).join('')}</div>
       </div>`
    : `<div class="pad mt22">
         <div class="rs-empty">
           ${Icon('search', { size: 38, color: 'var(--faint)' })}
           <div class="rs-empty-t serif">${t('ricerca.emptyTitle', { q: CORRECTION })}</div>
           <p class="muted">${t('ricerca.emptyBody', { zone: getState().zone?.comuni?.[0] || t('ricerca.yourZone') })}</p>
           <a class="btn btn-outline btn-block mt12" href="#/home">${t('ricerca.browseAll')}</a>
         </div>
       </div>`;

  return {
    html: `<div class="screen no-nav">
      <style>
        .rs-searchrow{ display:flex; align-items:center; gap:10px; padding:6px 18px 0; }
        .rs-searchrow .iconbtn{ flex:none; }
        .rs-field{ flex:1; display:flex; align-items:center; gap:11px; background:#fff;
          border:1px solid var(--bd); border-radius:var(--r-pill); padding:12px 14px; box-shadow:var(--sh-card); }
        .rs-field .rs-q{ flex:1; font-size:15.5px; color:var(--ink); min-width:0; }
        .rs-clear{ width:44px; height:44px; margin:-9px -6px -9px 0; flex:none; border:none; cursor:pointer;
          background:transparent; display:flex; align-items:center; justify-content:center; }
        .rs-clear span{ width:26px; height:26px; border-radius:50%; background:var(--carta-scura);
          display:flex; align-items:center; justify-content:center; }
        .rs-didyou{ display:flex; align-items:center; gap:7px; flex-wrap:wrap;
          font-size:14px; color:var(--ink-soft); padding-top:4px; }
        .rs-fix{ border:none; background:transparent; cursor:pointer; padding:0;
          font-family:var(--serif); font-style:italic; font-size:17px; font-weight:600; color:var(--verde-deep);
          display:inline-flex; align-items:center; gap:3px; }
        .rs-syns{ display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-top:13px; }
        .rs-syns .rs-lbl{ font-size:11px; font-weight:700; letter-spacing:.04em; color:var(--muted2); margin-right:2px; }
        .rs-syn{ font-size:12.5px; font-weight:500; color:var(--ink-soft); background:#fff;
          border:1px solid var(--bd); padding:7px 13px; border-radius:var(--r-pill); cursor:pointer; line-height:1; }
        .rs-cv{ display:flex; align-items:center; gap:13px; background:#fff; border:1px solid var(--bd);
          border-radius:16px; padding:14px 16px; text-decoration:none; color:inherit; box-shadow:var(--sh-card); }
        .rs-cv-ic{ width:42px; height:42px; flex:none; border-radius:12px; background:var(--ink);
          display:flex; align-items:center; justify-content:center; }
        .rs-cv-b{ flex:1; min-width:0; }
        .rs-cv-t{ font-family:var(--serif); font-size:15.5px; font-weight:600; color:var(--ink); }
        .rs-cv-s{ font-size:12.5px; color:var(--muted2); margin-top:1px; }
        .rs-empty{ text-align:center; padding:34px 14px; }
        .rs-empty-t{ font-size:19px; font-weight:600; color:var(--ink); margin:14px 0 6px; }
        .rs-empty p{ font-size:14px; line-height:1.6; color:var(--muted); margin:0; }
      </style>
      ${StatusBar()}

      <div class="rs-searchrow">
        <button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 20 })}</button>
        <div class="rs-field">
          ${Icon('search', { size: 19, color: 'var(--terra-deep)' })}
          <span class="rs-q">${TYPO}</span>
          <button class="rs-clear" data-clear aria-label="${t('ricerca.clearSearch')}"><span>${Icon('x', { size: 14, color: 'var(--muted)' })}</span></button>
        </div>
      </div>

      <div class="scroll">
        <div class="pad mt16">
          <div class="rs-didyou">
            ${t('ricerca.didYouMean')}
            <button class="rs-fix" data-fix>${CORRECTION.charAt(0).toUpperCase() + CORRECTION.slice(1)} ${Icon('chevron-right', { size: 15, color: 'var(--verde-deep)' })}</button>
          </div>
          <div class="rs-syns">
            <span class="rs-lbl">${t('ricerca.also')}</span>
            ${synChips}
          </div>
        </div>

        ${resultsBlock}

        <div class="pad mt22">
          <a class="rs-cv" href="#/comunita">
            <span class="rs-cv-ic">${Icon('message-circle', { size: 17, color: '#fff' })}</span>
            <span class="rs-cv-b">
              <span class="rs-cv-t">${t('ricerca.searchOnCiboVero')}</span>
              <span class="rs-cv-s">${t('ricerca.ciboVeroSub')}</span>
            </span>
            ${Icon('chevron-right', { size: 19, color: 'var(--faint2)' })}
          </a>
        </div>
        <div style="height:24px"></div>
      </div>

      ${BottomNav('scopri')}
    </div>`,

    onMount(el) {
      const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
      // "Cancella" e correzione typo riportano alla home/ricerca attiva
      const clear = el.querySelector('[data-clear]');
      if (clear) clear.onclick = () => history.back();
      const fix = el.querySelector('[data-fix]');
      if (fix) fix.onclick = () => { location.hash = '#/home'; };
      el.querySelectorAll('.rs-syn').forEach(s => {
        s.onclick = () => { location.hash = '#/home'; };
      });
    },
  };
}
