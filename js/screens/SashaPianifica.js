import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';
import { producerById } from '../store.js';

/* Backoffice Sasha — Pianifica ispezione (rotta #/sasha/pianifica)
   Cadenza ~3 mesi, prossima data, stato freschezza, avviso, note logistica.
   CTA "Pianifica" -> #/sasha. [data-back]. no-nav. */
export function SashaPianifica() {
  // produttore di esempio (demo UI): primo disponibile, fallback statico
  const p = producerById('caseificio-borgo') || null;
  const nome = p?.name || 'Caseificio del Borgo';
  const place = p?.place || 'Villetta Barrea';
  const ultima = p?.verify?.date || '28 mar';
  const prossima = p?.verify?.next || '28 giu 2026';

  // stato freschezza derivato dal bollino verifica (perno della fiducia)
  const vstate = p?.verify?.state || 'expiring';
  const fresh = {
    valid: { ic: 'check-circle', lb: 'Recente', sub: 'Verifica valida' },
    expiring: { ic: 'clock', lb: 'In scadenza', sub: 'Conviene ripianificare' },
    suspended: { ic: 'info', lb: 'Sospesa', sub: 'Da rivedere sul campo' },
  }[vstate] || { ic: 'clock', lb: 'In scadenza', sub: 'Conviene ripianificare' };

  const html = `
  <style>
    /* ---- Sasha · Pianifica: stile locale, riusa token globali ---- */
    .sp-top{display:flex;align-items:center;gap:12px;padding:8px 22px 0}
    .sp-back{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-left:-10px;flex:none}
    .sp-back:active{background:var(--carta-scura)}
    .sp-title{margin:0;font-family:var(--serif);font-weight:600;font-size:22px;color:var(--ink)}

    .sp-card{background:var(--bianco);border:1px solid var(--bd);border-radius:14px;padding:14px 15px}
    .sp-name{font-family:var(--serif);font-size:16px;font-weight:600;color:var(--ink)}
    .sp-sub{display:flex;justify-content:space-between;gap:10px;margin-top:7px;font-size:13px;color:var(--muted)}
    .sp-sub b{font-variant-numeric:tabular-nums;color:var(--ink);font-weight:600}

    .sp-label{font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:8px}

    .sp-date{background:var(--bianco);border:1px solid var(--bd);border-radius:14px;
      display:flex;align-items:center;gap:11px;padding:0 15px;min-height:52px;cursor:pointer}
    .sp-date:focus-within{border-color:var(--verde);box-shadow:0 0 0 3px var(--verde-pale)}
    .sp-date input{flex:1;border:none;background:transparent;font-family:var(--sans);font-size:16px;font-weight:600;
      color:var(--ink);padding:14px 0;font-variant-numeric:tabular-nums}
    .sp-date input:focus{outline:none}
    .sp-date input::-webkit-calendar-picker-indicator{opacity:0;width:0;margin:0}

    .sp-fresh{background:var(--terra-pale);border-radius:14px;padding:13px 16px;display:flex;align-items:center;gap:11px}
    .sp-fresh.valid{background:var(--verde-pale)}
    .sp-fresh .sp-fk{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--terra-deep)}
    .sp-fresh.valid .sp-fk{color:var(--verde-deep)}
    .sp-fresh .sp-fv{font-size:14.5px;font-weight:600;color:var(--ink);margin-top:1px}
    .sp-fresh .sp-fs{font-size:12px;color:var(--muted);margin-top:1px}
    .sp-fico{color:var(--terra-deep);flex:none}
    .sp-fresh.valid .sp-fico{color:var(--verde-deep)}

    .sp-alert{background:var(--bianco);border:1px solid var(--bd);border-radius:14px;
      display:flex;align-items:center;justify-content:space-between;gap:11px;padding:13px 16px}
    .sp-alert .sp-al{display:flex;align-items:center;gap:11px}
    .sp-alert .sp-al span{font-size:14.5px;color:var(--ink)}
    .sp-sw{width:46px;height:27px;border-radius:var(--r-pill);background:var(--bd3);position:relative;flex:none;
      border:none;cursor:pointer;transition:background .16s}
    .sp-sw.on{background:var(--verde)}
    .sp-knob{position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:50%;background:#fff;
      box-shadow:0 1px 3px rgba(31,24,18,.25);transition:transform .16s}
    .sp-sw.on .sp-knob{transform:translateX(19px)}

    .sp-note{width:100%;background:var(--bianco);border:1px solid var(--bd);border-radius:14px;
      padding:14px 15px;font-family:var(--sans);font-size:14px;color:var(--ink);line-height:1.45;
      min-height:74px;resize:none}
    .sp-note::placeholder{color:var(--faint)}
    .sp-note:focus{outline:none;border-color:var(--verde);box-shadow:0 0 0 3px var(--verde-pale)}

    .sp-cta{padding:18px 22px 24px;border-top:1px solid var(--bd2);background:var(--bianco)}
  </style>

  <div class="screen no-nav">
    ${StatusBar()}

    <div class="sp-top">
      <button type="button" class="sp-back" data-back aria-label="Indietro">${Icon('arrow-left', { size: 21, stroke: 2.1 })}</button>
      <h1 class="sp-title">Pianifica ispezione</h1>
    </div>

    <div class="scroll">
      <div class="pad mt16">
        <div class="sp-card">
          <div class="sp-name">${nome}</div>
          <div class="sp-sub">
            <span>Ultima verifica: <b>${ultima}</b></span>
            <span>Cadenza ~3 mesi</span>
          </div>
        </div>
      </div>

      <div class="pad mt22">
        <label class="sp-label" for="sp-date">Prossima ispezione</label>
        <label class="sp-date" for="sp-date">
          ${Icon('calendar', { size: 20, color: 'var(--terra-deep)', stroke: 2 })}
          <input id="sp-date" type="date" value="2026-06-28" aria-label="Data prossima ispezione">
          ${Icon('chevron-down', { size: 18, color: 'var(--muted2)', stroke: 2 })}
        </label>
      </div>

      <div class="pad mt22">
        <div class="sp-fresh ${vstate === 'valid' ? 'valid' : ''}" role="status">
          <span class="sp-fico">${Icon(fresh.ic, { size: 20, stroke: 2 })}</span>
          <div>
            <div class="sp-fk">Stato freschezza</div>
            <div class="sp-fv">${fresh.lb}</div>
            <div class="sp-fs">${fresh.sub}</div>
          </div>
        </div>
      </div>

      <div class="pad mt22">
        <div class="sp-alert">
          <div class="sp-al">
            ${Icon('bell', { size: 19, color: 'var(--muted2)', stroke: 1.9 })}
            <span>Avvisami 7 giorni prima</span>
          </div>
          <button type="button" class="sp-sw on" data-toggle role="switch" aria-checked="true" aria-label="Avviso 7 giorni prima">
            <span class="sp-knob"></span>
          </button>
        </div>
      </div>

      <div class="pad mt22">
        <label class="sp-label" for="sp-note">Note logistica</label>
        <textarea id="sp-note" class="sp-note" placeholder="Es. combinare con la visita a ${place}.">Combinare con la visita a Opi.</textarea>
      </div>

      <div style="height:8px"></div>
    </div>

    <div class="sp-cta">
      <button type="button" class="btn btn-grad btn-block" id="sp-save">
        Pianifica ${Icon('check', { size: 18, color: '#fff', stroke: 2.6 })}
      </button>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]');
    if (back) back.onclick = () => history.back();

    // toggle avviso
    const sw = el.querySelector('[data-toggle]');
    if (sw) sw.onclick = () => {
      const on = sw.classList.toggle('on');
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    };

    // apri il date picker toccando l'intera riga (oltre all'indicatore nativo)
    const date = el.querySelector('#sp-date');
    if (date) {
      const open = (e) => {
        if (e.target === date) return;
        if (typeof date.showPicker === 'function') { try { date.showPicker(); } catch (_) { date.focus(); } }
        else date.focus();
      };
      const row = el.querySelector('.sp-date');
      if (row) row.addEventListener('click', open);
    }

    // CTA -> torna al backoffice Sasha
    const save = el.querySelector('#sp-save');
    if (save) save.onclick = () => { location.hash = '#/sasha'; };
  }

  return { html, onMount };
}
