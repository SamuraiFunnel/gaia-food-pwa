import { Icon } from '../icons.js';
import { StatusBar, Photo } from '../components.js';
import { getState, results } from '../store.js';
import { openContact } from '../screens.js';
import { t } from '../i18n.js';

/**
 * Consegna · non disponibile (rotta #/consegna/non-disponibile).
 *
 * Fallback dignitoso, non un errore: la consegna a casa NON è ancora attiva
 * nella zona dell'utente. Regola stato = causa + rimedio + uscita:
 *   - causa     -> "stiamo costruendo i giri nella tua zona"
 *   - rimedio   -> "Vai a ritirare / Contatta" (apre lo sheet contatto del
 *                  produttore verificato più vicino)
 *   - uscita    -> "Avvisami quando parte la consegna" (outline)
 * Nessun prezzo, nessun "gratis/sei tra i primi". no-nav, [data-back].
 */
export function DlvNonDisp() {
  const s = getState();
  // produttore verificato più vicino: è il "ritiro / contatto" naturale del rimedio.
  // results() è già ordinato per km; teniamo il primo (se manca, fallback gestito sotto).
  const near = results()[0] || null;
  const zona = s.zone?.label || t('dlvNonDisp.yourZone');

  const html = `
  <style>
    /* illustrazione mezzo/strada con badge mezzo galleggiante */
    .nd-art{ position:relative; margin:14px 18px 0; height:220px;
      border-radius:24px; overflow:hidden; }
    .nd-art .photo{ position:absolute; inset:0; height:100%; }
    /* scrim per leggibilità del badge sopra l'illustrazione */
    .nd-art::after{ content:''; position:absolute; inset:0;
      background:linear-gradient(180deg, rgba(31,24,18,.04), rgba(31,24,18,.34)); }
    .nd-badge{ position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:64px; height:64px; border-radius:18px; background:rgba(255,255,255,.94);
      backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center;
      box-shadow:0 8px 22px rgba(31,24,18,.28); z-index:2; }

    .nd-head{ padding:30px 26px 0; text-align:center; }
    .nd-head h1{ margin:0; font-family:var(--serif); font-weight:600; font-size:29px;
      line-height:1.1; letter-spacing:-.02em; color:var(--ink); }
    .nd-head h1 em{ font-style:italic; color:var(--verde); }
    .nd-sub{ margin:14px auto 0; font-size:15px; line-height:1.6; color:var(--ink-soft);
      max-width:31ch; }

    /* nota onesta: "perché" della consegna assente, non un costo */
    .nd-note{ display:flex; align-items:flex-start; gap:10px; margin:22px 22px 0;
      background:var(--terra-pale); border:1px solid var(--bd2); border-radius:14px;
      padding:12px 14px; text-align:left; }
    .nd-note .nd-note-ic{ flex:none; width:30px; height:30px; border-radius:9px; background:#fff;
      display:flex; align-items:center; justify-content:center; }
    .nd-note-tx{ font-size:12.5px; line-height:1.5; color:var(--ink-soft); }
    .nd-note-tx b{ color:var(--ink); font-weight:700; }

    /* footer CTA: rimedio (scura) + uscita (outline verde) — touch >=44px */
    .nd-foot{ margin-top:auto; padding:24px 22px calc(22px + env(safe-area-inset-bottom));
      display:flex; flex-direction:column; gap:10px; }
    .nd-cta{ width:100%; min-height:54px; border-radius:16px; font-family:var(--sans);
      font-size:15.5px; font-weight:600; display:flex; align-items:center; justify-content:center;
      gap:9px; cursor:pointer; }
    .nd-cta svg{ flex:none; }
    .nd-cta.primary{ background:var(--ink); color:#fff; border:none; }
    .nd-cta.notify{ background:var(--verde-pale); color:var(--verde-deep);
      border:1.5px solid var(--verde); }
    .nd-cta.notify.done{ background:var(--verde-pale); color:var(--verde-deep);
      border-color:var(--verde-deep); }
    .nd-cta.solo{ background:var(--grad-azione); color:#fff; border:none; }
  </style>
  <div class="screen no-nav">
    ${StatusBar()}
    <div class="toprow">
      <button class="iconbtn" data-back type="button" aria-label="${t('common.back')}">${Icon('arrow-left', { size: 19, stroke: 2 })}</button>
      <span style="width:42px"></span>
    </div>

    <div class="nd-art" role="img" aria-label="${t('dlvNonDisp.artAria')}">
      ${Photo('lavoro', '', '')}
      <span class="nd-badge">${Icon('truck', { size: 32, color: 'var(--verde-deep)', stroke: 2 })}</span>
    </div>

    <div class="nd-head">
      <h1>${t('dlvNonDisp.title')}</h1>
      <p class="nd-sub">${t('dlvNonDisp.sub', { zona })}</p>
    </div>

    <div class="nd-note" role="note">
      <span class="nd-note-ic">${Icon('info', { size: 17, color: 'var(--terra-deep)', stroke: 1.9 })}</span>
      <span class="nd-note-tx">${t('dlvNonDisp.note')}</span>
    </div>

    <div class="nd-foot">
      ${near ? `
      <button class="nd-cta primary" data-contact type="button">
        ${Icon('navigation', { size: 18, color: '#fff', stroke: 2.1 })} ${t('dlvNonDisp.pickupOrContact')}
      </button>
      <button class="nd-cta notify" data-notify type="button">
        ${Icon('bell', { size: 18, color: 'var(--verde-deep)', stroke: 2 })} <span data-notify-label>${t('dlvNonDisp.notify')}</span>
      </button>
      ` : `
      <button class="nd-cta solo" data-home type="button">
        ${Icon('map-pin', { size: 18, color: '#fff', stroke: 2.1 })} ${t('dlvNonDisp.goToProducers')}
      </button>
      <button class="nd-cta notify" data-notify type="button">
        ${Icon('bell', { size: 18, color: 'var(--verde-deep)', stroke: 2 })} <span data-notify-label>${t('dlvNonDisp.notify')}</span>
      </button>
      `}
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();

    const contact = el.querySelector('[data-contact]');
    if (contact) contact.onclick = () => openContact(near);

    const home = el.querySelector('[data-home]');
    if (home) home.onclick = () => { location.hash = '#/home'; };

    // "Avvisami": conferma in-place (nessun backend) — l'utente ha un esito chiaro.
    const notify = el.querySelector('[data-notify]');
    if (notify) notify.onclick = () => {
      const lbl = notify.querySelector('[data-notify-label]');
      if (notify.classList.contains('done')) return;
      notify.classList.add('done');
      notify.querySelector('svg')?.remove();
      notify.insertAdjacentHTML('afterbegin', Icon('check-circle', { size: 18, color: 'var(--verde-deep)', stroke: 2 }));
      if (lbl) lbl.textContent = t('dlvNonDisp.notifyDone');
    };
  }

  return { html, onMount };
}
