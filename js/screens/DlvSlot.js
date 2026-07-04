import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';
import { getState } from '../store.js';
import { t } from '../i18n.js';

/* ---------------- CONSEGNA · Slot (rotta #/consegna/slot) ----------------
   Slot/giorno di consegna. La consegna è "in arrivo": niente prezzi, niente
   "gratis". I giri del mezzo (Mar/Gio/Sab) sono chip selezionabili; per ogni
   giorno tre fasce orarie, una marcata "slot pieno" (disabilitata). La CTA
   porta al riepilogo. Stato sempre leggibile: ogni fascia ha icona+testo,
   mai solo-colore. */
export function DlvSlot() {
  const zone = getState().zone || { label: 'Alta Val di Sangro' };

  // Giri del mezzo nella zona — sola lettura del calendario di consegna.
  const days = [
    { id: 'mar', label: 'Mar', date: '30 giu' },
    { id: 'gio', label: 'Gio', date: '2 lug' },
    { id: 'sab', label: 'Sab', date: '4 lug' },
  ];
  // Fasce orarie per giorno. state: free | full (pieno, disabilitato).
  const bands = [
    { id: 'mattina', label: 'Mattina', time: '8:00 – 12:00' },
    { id: 'pomeriggio', label: 'Pomeriggio', time: '14:00 – 17:00' },
    { id: 'sera', label: 'Sera', time: '17:00 – 19:00' },
  ];
  // mappa stati: chiave `${day}-${band}` -> 'full'
  const full = new Set(['mar-pomeriggio', 'sab-mattina']);

  // selezione iniziale: nessun giorno scelto, l'utente sceglie.
  const sel = { day: null, band: null };

  const dayLabel = (d) => t(`dlvSlot.day.${d.id}`);
  const bandLabel = (b) => t(`dlvSlot.band.${b.id}`);

  const dayChips = () => days.map(d => `
    <button class="ds-day" role="radio" aria-checked="false" data-day="${d.id}"
      aria-label="${t('dlvSlot.dayAria', { day: dayLabel(d), date: d.date })}">
      <span class="ds-day-l">${dayLabel(d)}</span>
      <span class="ds-day-d tnum">${d.date}</span>
    </button>`).join('');

  const bandsFor = () => bands.map(b => {
    const id = `${sel.day}-${b.id}`;
    const isFull = sel.day ? full.has(id) : false;
    return `
    <button class="ds-band${isFull ? ' full' : ''}" role="radio"
      aria-checked="false" ${isFull ? 'aria-disabled="true" disabled' : ''}
      data-band="${b.id}" aria-label="${t('dlvSlot.bandAria', { label: bandLabel(b), time: b.time })}${isFull ? t('dlvSlot.bandAriaFullSuffix') : ''}">
      <span class="ds-band-main">
        <span class="ds-band-l">${bandLabel(b)}</span>
        <span class="ds-band-t tnum">${b.time}</span>
      </span>
      <span class="ds-band-end">
        ${isFull
          ? `<span class="ds-tag full">${Icon('x', { size: 13, color: 'currentColor', stroke: 2.4 })} ${t('dlvSlot.slotFull')}</span>`
          : `<span class="ds-radio"></span>`}
      </span>
    </button>`;
  }).join('');

  const html = `
  <style>
    .ds-sub{ margin:8px 0 0; font-size:14px; line-height:1.5; color:var(--muted); }
    /* banner "consegna in arrivo" — caldo, editoriale, mai prezzi */
    .ds-banner{ display:flex; align-items:center; gap:12px; background:var(--celeste-pale);
      border:1px solid #c7e6f3; border-radius:16px; padding:14px 15px; }
    .ds-banner .ds-b-ic{ width:42px; height:42px; flex:none; border-radius:12px; background:#fff;
      display:flex; align-items:center; justify-content:center; }
    .ds-banner .ds-b-t{ font-family:var(--serif); font-size:15.5px; font-weight:600; color:var(--ink);
      line-height:1.2; }
    .ds-banner .ds-b-p{ font-size:12.5px; color:var(--celeste-deep); font-weight:600; margin-top:2px; }
    /* riga giri del mezzo */
    .ds-route{ display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--muted2);
      margin-top:14px; }
    .ds-route strong{ color:var(--ink-soft); font-weight:600; }
    /* chip giorno (radiogroup) */
    .ds-days{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
    .ds-day{ display:flex; flex-direction:column; align-items:center; gap:2px; min-height:64px;
      justify-content:center; border:1px solid var(--bd); border-radius:15px; background:#fff;
      font-family:inherit; cursor:pointer; transition:border-color .12s ease, background .12s ease; }
    .ds-day:focus-visible{ outline:2px solid var(--celeste); outline-offset:2px; }
    .ds-day-l{ font-family:var(--serif); font-size:16px; font-weight:600; color:var(--ink); }
    .ds-day-d{ font-size:11.5px; color:var(--muted); font-weight:500; }
    .ds-day[aria-checked=true]{ background:var(--verde-pale); border-color:var(--verde); }
    .ds-day[aria-checked=true] .ds-day-l{ color:var(--verde-deep); }
    .ds-day[aria-checked=true] .ds-day-d{ color:var(--verde-deep); }
    /* fasce orarie */
    .ds-bands{ display:flex; flex-direction:column; gap:10px; }
    .ds-band{ display:flex; align-items:center; gap:12px; width:100%; text-align:left; min-height:60px;
      padding:12px 15px; border:1px solid var(--bd); border-radius:15px; background:#fff;
      font-family:inherit; cursor:pointer; transition:border-color .12s ease, background .12s ease; }
    .ds-band:focus-visible{ outline:2px solid var(--celeste); outline-offset:2px; }
    .ds-band-main{ flex:1; display:flex; flex-direction:column; gap:2px; }
    .ds-band-l{ font-size:15px; font-weight:600; color:var(--ink); }
    .ds-band-t{ font-size:12.5px; color:var(--muted); }
    .ds-band-end{ flex:none; display:flex; align-items:center; }
    .ds-radio{ width:22px; height:22px; border-radius:50%; border:2px solid var(--bd3); flex:none;
      display:block; transition:border-color .12s ease; }
    .ds-band[aria-checked=true]{ background:var(--verde-pale); border-color:var(--verde); }
    .ds-band[aria-checked=true] .ds-radio{ border:6px solid var(--verde); }
    .ds-band[aria-checked=true] .ds-band-l{ color:var(--verde-deep); }
    /* slot pieno: disabilitato, segnalato con icona+testo (non solo colore) */
    .ds-band.full{ background:var(--carta-scura); border-color:var(--bd2); cursor:not-allowed; }
    .ds-band.full .ds-band-l,
    .ds-band.full .ds-band-t{ color:var(--faint); }
    .ds-tag.full{ display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700;
      color:var(--faint2); background:#fff; border:1px solid var(--bd); padding:5px 9px;
      border-radius:var(--r-pill); white-space:nowrap; }
    /* stato: prima del giorno scelto, le fasce sono nascoste con un invito */
    .ds-empty{ display:flex; align-items:center; gap:8px; padding:16px; border:1px dashed var(--bd3);
      border-radius:15px; background:var(--bianco); font-size:13px; color:var(--muted); line-height:1.45; }
    .ds-cta-hint{ font-size:12px; color:var(--muted); text-align:center; margin:0 0 10px; }
  </style>
  <div class="screen no-nav">
    ${StatusBar()}
    <div class="toprow">
      <button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 22, stroke: 2.1 })}</button>
      <span></span>
    </div>
    <div class="scroll">
      <div class="pad">
        <h1 class="h1">${t('dlvSlot.title')}</h1>
        <p class="ds-sub">${t('dlvSlot.subtitle')}</p>
      </div>

      <div class="pad mt16">
        <div class="ds-banner">
          <div class="ds-b-ic">${Icon('truck', { size: 22, color: 'var(--celeste-deep)', stroke: 2 })}</div>
          <div>
            <div class="ds-b-t">${t('dlvSlot.bannerTitle')}</div>
            <div class="ds-b-p">${zone.label}</div>
          </div>
        </div>
        <div class="ds-route">
          ${Icon('navigation', { size: 15, color: 'var(--muted2)', stroke: 2 })}
          <span>${t('dlvSlot.route')}</span>
        </div>
      </div>

      <div class="pad mt22">
        <div class="eyebrow" style="margin-bottom:11px">${t('dlvSlot.eyebrowDays')}</div>
        <div class="ds-days" role="radiogroup" aria-label="${t('dlvSlot.daysAria')}" data-days>
          ${dayChips()}
        </div>
      </div>

      <div class="pad mt22">
        <div class="eyebrow" style="margin-bottom:11px">${t('dlvSlot.eyebrowBands')}</div>
        <div role="radiogroup" aria-label="${t('dlvSlot.eyebrowBands')}" data-bands>
          <div class="ds-empty" data-bands-empty>
            ${Icon('clock', { size: 18, color: 'var(--muted2)', stroke: 2 })}
            <span>${t('dlvSlot.pickDayFirst')}</span>
          </div>
        </div>
      </div>

      <div style="height:20px"></div>
    </div>

    <div class="cta-sticky" style="flex-direction:column;gap:6px;align-items:stretch">
      <p class="ds-cta-hint" data-hint>${t('dlvSlot.hintPickBoth')}</p>
      <button class="btn btn-grad btn-block" data-next disabled style="opacity:.5">
        ${t('dlvSlot.next')} ${Icon('chevron-right', { size: 18, color: '#fff', stroke: 2.2 })}
      </button>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();

    const daysWrap = el.querySelector('[data-days]');
    const bandsWrap = el.querySelector('[data-bands]');
    const nextBtn = el.querySelector('[data-next]');
    const hint = el.querySelector('[data-hint]');

    const refreshCta = () => {
      const ready = !!(sel.day && sel.band);
      nextBtn.disabled = !ready;
      nextBtn.style.opacity = ready ? '1' : '.5';
      if (ready) {
        const d = days.find(x => x.id === sel.day);
        const b = bands.find(x => x.id === sel.band);
        hint.textContent = `${dayLabel(d)} ${d.date} · ${b.time}`;
      } else if (sel.day) {
        hint.textContent = t('dlvSlot.hintPickBand');
      } else {
        hint.textContent = t('dlvSlot.hintPickBoth');
      }
    };

    // Render delle fasce per il giorno scelto (reset della selezione fascia).
    const renderBands = () => {
      sel.band = null;
      if (!sel.day) {
        bandsWrap.innerHTML = `
          <div class="ds-empty">
            ${Icon('clock', { size: 18, color: 'var(--muted2)', stroke: 2 })}
            <span>${t('dlvSlot.pickDayFirst')}</span>
          </div>`;
        return;
      }
      bandsWrap.innerHTML = `<div class="ds-bands">${bandsFor()}</div>`;
      bandsWrap.querySelectorAll('[data-band]').forEach(btn => {
        if (btn.disabled) return;
        btn.onclick = () => {
          sel.band = btn.dataset.band;
          bandsWrap.querySelectorAll('[data-band]').forEach(x =>
            x.setAttribute('aria-checked', String(x === btn)));
          refreshCta();
        };
      });
    };

    // Selezione giorno (radio singola).
    daysWrap.querySelectorAll('[data-day]').forEach(btn => {
      btn.onclick = () => {
        sel.day = btn.dataset.day;
        daysWrap.querySelectorAll('[data-day]').forEach(x =>
          x.setAttribute('aria-checked', String(x === btn)));
        renderBands();
        refreshCta();
      };
    });

    nextBtn.onclick = () => {
      if (nextBtn.disabled) return;
      location.hash = '#/consegna/riepilogo';
    };

    refreshCta();
  }

  return { html, onMount };
}
