import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';

/* ---------------- SASHA · NUOVA VERIFICA (backoffice) ----------------
   Sasha (tecnologo alimentare) certifica un produttore sul campo:
   sceglie la data della visita, spunta i criteri, dà un esito e genera
   il bollino "Verificato sul campo" che è il perno della fiducia in app.
   Rotta: #/sasha/verifica  ·  no-nav  ·  back nativo. */
export function SashaVerifica() {
  // Azienda in verifica (mock di handoff: arriverebbe dalla lista candidati del tecnologo alimentare)
  const azienda = { name: 'Azienda Agricola di Claudio', place: 'Villetta Barrea (AQ)' };

  // Data di default = oggi, in formato input date (yyyy-mm-dd)
  const oggiISO = new Date().toISOString().slice(0, 10);

  // Criteri di campo che Sasha accerta di persona
  const criteri = [
    { id: 'qualita',   label: 'Qualità reale del prodotto', hint: 'Assaggiata e valutata sul posto', on: true },
    { id: 'benessere', label: 'Benessere animale',          hint: 'Spazio, pascolo, cura quotidiana',  on: true },
    { id: 'incrocio',  label: 'Accertamento incrociato',    hint: 'Registri, fornitori e dichiarazioni', on: true },
    { id: 'stagione',  label: 'Stagionalità rispettata',    hint: 'Raccolto e disponibilità nel periodo giusto', on: false },
  ];

  // Esito della verifica → determina lo stato del badge
  const esiti = [
    { id: 'valid',     label: 'Idoneo',      icon: 'check-circle' },
    { id: 'expiring',  label: 'In sospeso',  icon: 'clock' },
    { id: 'suspended', label: 'Non idoneo',  icon: 'info' },
  ];

  // stato locale del foglio (non tocca lo store)
  const draft = {
    data: oggiISO,
    criteri: Object.fromEntries(criteri.map(c => [c.id, c.on])),
    esito: 'valid',
  };

  const fmtData = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const mesi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    return `${d} ${mesi[m - 1]} ${y}`;
  };

  const critRow = (c) => `
    <button class="sv-crit ${draft.criteri[c.id] ? 'on' : ''}" data-crit="${c.id}"
            role="checkbox" aria-checked="${draft.criteri[c.id]}">
      <span class="sv-box">${Icon('check', { size: 15, color: '#fff', stroke: 2.6 })}</span>
      <span class="sv-ct">
        <span class="sv-cl">${c.label}</span>
        <span class="sv-ch">${c.hint}</span>
      </span>
    </button>`;

  const esitoBtn = (e) => `
    <button class="sv-eso ${draft.esito === e.id ? 'on ' + e.id : ''}" data-eso="${e.id}"
            role="radio" aria-checked="${draft.esito === e.id}">
      <span class="sv-eso-ic">${Icon(e.icon, { size: 17, stroke: 2.2 })}</span>
      <span>${e.label}</span>
    </button>`;

  const html = `
  <style>
    .sv-head{ display:flex; align-items:center; gap:10px; padding:8px 22px 4px; }
    .sv-head .h2{ margin:0; font-size:22px; }
    .sv-back{ width:40px; height:40px; min-width:40px; border-radius:50%; margin-left:-8px;
      display:flex; align-items:center; justify-content:center; background:transparent; }
    .sv-back:active{ background:var(--carta-scura); }

    /* card azienda */
    .sv-az{ background:#fff; border:1px solid var(--bd); border-radius:14px; padding:13px 15px; }
    .sv-az .n{ font-family:var(--serif); font-size:16px; font-weight:600; color:var(--ink); }
    .sv-az .p{ font-size:12.5px; color:var(--muted2); margin-top:2px; }

    /* data visita */
    .sv-date{ position:relative; background:#fff; border:2px solid var(--verde); border-radius:14px;
      padding:14px 15px; display:flex; align-items:center; gap:11px; box-shadow:0 0 0 4px rgba(22,163,74,.1); }
    .sv-date .val{ flex:1; font-size:16px; font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums; }
    .sv-date .help{ font-size:11px; color:var(--muted2); }
    /* input date reale, invisibile sopra la card ma cliccabile (touch target pieno) */
    .sv-date input[type=date]{ position:absolute; inset:0; width:100%; height:100%; opacity:0;
      border:none; margin:0; padding:0; cursor:pointer; -webkit-appearance:none; appearance:none;
      font-family:inherit; }
    .sv-date:focus-within{ outline:none; box-shadow:0 0 0 4px rgba(14,165,233,.22); border-color:var(--celeste); }

    /* criteri checklist */
    .sv-crits{ display:flex; flex-direction:column; gap:8px; }
    .sv-crit{ display:flex; align-items:center; gap:12px; width:100%; min-height:54px;
      padding:11px 13px; background:#fff; border:1px solid var(--bd); border-radius:13px;
      text-align:left; font-family:inherit; }
    .sv-crit:active{ background:var(--carta-scura); }
    .sv-box{ width:24px; height:24px; min-width:24px; border-radius:7px; background:#fff;
      border:1.5px solid var(--bd3); display:flex; align-items:center; justify-content:center;
      transition:background .12s ease,border-color .12s ease; }
    .sv-box svg{ opacity:0; transition:opacity .12s ease; }
    .sv-crit.on{ border-color:var(--verde); }
    .sv-crit.on .sv-box{ background:var(--verde); border-color:var(--verde); }
    .sv-crit.on .sv-box svg{ opacity:1; }
    .sv-ct{ display:flex; flex-direction:column; gap:2px; }
    .sv-cl{ font-size:14.5px; font-weight:600; color:var(--ink); line-height:1.2; }
    .sv-crit:not(.on) .sv-cl{ color:var(--muted); }
    .sv-ch{ font-size:12px; color:var(--muted2); line-height:1.25; }

    /* esito segment */
    .sv-esos{ display:flex; gap:8px; }
    .sv-eso{ flex:1; min-height:50px; padding:11px 4px; border-radius:13px; background:#fff;
      border:1px solid var(--bd3); color:var(--muted2); font-size:13px; font-weight:600;
      font-family:inherit; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; }
    .sv-eso .sv-eso-ic{ display:flex; }
    .sv-eso.on{ color:#fff; border-color:transparent; }
    .sv-eso.on.valid{ background:var(--verde); }
    .sv-eso.on.expiring{ background:var(--terra-deep); }
    .sv-eso.on.suspended{ background:#B91C1C; }

    /* nota esito (causa+rimedio quando non idoneo) */
    .sv-note{ font-size:12.5px; line-height:1.5; color:var(--ink-soft);
      background:var(--carta-scura); border-radius:12px; padding:11px 13px; }

    /* anteprima badge generato */
    .sv-prev{ display:flex; align-items:center; gap:10px; padding:13px 15px; border-radius:14px;
      border:1px dashed var(--bd3); background:var(--bianco); }
    .sv-prev .vbadge{ font-size:13px; }

    .sv-foot{ margin-top:auto; }
  </style>

  <div class="screen no-nav">
    ${StatusBar()}

    <div class="sv-head">
      <button class="sv-back" data-back aria-label="Torna al backoffice">${Icon('arrow-left', { size: 21, color: 'var(--ink)', stroke: 2.1 })}</button>
      <h2 class="h2">Nuova verifica</h2>
    </div>

    <div class="scroll">
      <div class="pad" style="padding-top:14px">
        <div class="sv-az">
          <div class="n">${azienda.name}</div>
          <div class="p">${azienda.place}</div>
        </div>

        <div class="eyebrow" style="color:var(--verde-deep); margin:18px 0 8px">Data della visita</div>
        <div class="sv-date">
          ${Icon('calendar', { size: 20, color: 'var(--verde)', stroke: 2 })}
          <span class="val" id="sv-dval">${fmtData(draft.data)}</span>
          <span class="help">genera il badge</span>
          <input type="date" id="sv-date" value="${draft.data}" max="${oggiISO}" aria-label="Data della visita sul campo">
        </div>

        <div class="section-t" style="margin:22px 0 10px">Criteri verificati</div>
        <div class="sv-crits" id="sv-crits">
          ${criteri.map(critRow).join('')}
        </div>

        <div class="section-t" style="margin:22px 0 10px">Esito</div>
        <div class="sv-esos" id="sv-esos">
          ${esiti.map(esitoBtn).join('')}
        </div>
        <div id="sv-note" style="margin-top:10px"></div>

        <div class="eyebrow" style="margin:22px 0 8px">Anteprima badge</div>
        <div class="sv-prev" id="sv-prev"></div>

        <div style="height:18px"></div>
      </div>
    </div>

    <div class="cta-sticky sv-foot">
      <button class="btn btn-grad btn-block" id="sv-gen">
        ${Icon('check-circle', { size: 19, color: '#fff', stroke: 2.2 })} Genera badge verificato
      </button>
    </div>
  </div>`;

  function onMount(el) {
    const map = { valid: 'Verificato sul campo', expiring: 'Verifica in scadenza', suspended: 'Verifica sospesa' };
    const icMap = { valid: 'check-circle', expiring: 'clock', suspended: 'info' };

    // back nativo
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();

    // --- data visita ---
    const dInput = el.querySelector('#sv-date');
    const dVal = el.querySelector('#sv-dval');
    dInput.onchange = () => {
      draft.data = dInput.value || draft.data;
      dVal.textContent = fmtData(draft.data);
      refreshPreview();
    };
    // apri il date picker nativo cliccando sulla card (dove supportato)
    el.querySelector('.sv-date').onclick = (e) => {
      if (e.target === dInput) return;
      if (typeof dInput.showPicker === 'function') { try { dInput.showPicker(); } catch (_) { dInput.focus(); } }
      else dInput.focus();
    };

    // --- criteri (toggle) ---
    el.querySelector('#sv-crits').onclick = (e) => {
      const b = e.target.closest('[data-crit]'); if (!b) return;
      const id = b.dataset.crit;
      draft.criteri[id] = !draft.criteri[id];
      b.classList.toggle('on', draft.criteri[id]);
      b.setAttribute('aria-checked', String(draft.criteri[id]));
      refreshPreview();
    };

    // --- esito (radio) ---
    const noteEl = el.querySelector('#sv-note');
    const renderNote = () => {
      if (draft.esito === 'suspended') {
        noteEl.innerHTML = `<div class="sv-note">Esito <b>Non idoneo</b>: il produttore non comparirà in app finché i criteri mancanti non saranno risolti. Lascia una nota al tecnologo alimentare con cosa correggere e fissa una nuova visita.</div>`;
      } else if (draft.esito === 'expiring') {
        noteEl.innerHTML = `<div class="sv-note">Esito <b>In sospeso</b>: il badge resta valido ma segnala una verifica da rinnovare. Programma il prossimo controllo entro la stagione.</div>`;
      } else {
        noteEl.innerHTML = '';
      }
    };
    el.querySelector('#sv-esos').onclick = (e) => {
      const b = e.target.closest('[data-eso]'); if (!b) return;
      draft.esito = b.dataset.eso;
      el.querySelectorAll('#sv-esos .sv-eso').forEach(x => {
        const on = x.dataset.eso === draft.esito;
        x.className = 'sv-eso' + (on ? ' on ' + draft.esito : '');
        x.setAttribute('aria-checked', String(on));
      });
      renderNote();
      refreshPreview();
    };

    // --- anteprima badge (rispecchia esito + data scelta) ---
    const prev = el.querySelector('#sv-prev');
    function refreshPreview() {
      const st = draft.esito;
      prev.innerHTML = `<span class="vbadge ${st}">${Icon(icMap[st], { size: 15 })}<span>${map[st]} · ${fmtData(draft.data)}</span></span>`;
    }
    refreshPreview();
    renderNote();

    // --- genera badge → torna al backoffice del tecnologo alimentare ---
    el.querySelector('#sv-gen').onclick = () => {
      // (qui in produzione si salverebbe la verifica sullo store/produttore)
      location.hash = '#/sasha';
    };
  }

  return { html, onMount };
}
