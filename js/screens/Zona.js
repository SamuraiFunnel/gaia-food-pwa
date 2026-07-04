import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';
import { getState } from '../store.js';

export function Zona() {
  const zone = getState().zone || { label: 'Alta Val di Sangro', comuni: [] };
  const comuni = zone.comuni || [];

  const html = `
  <style>
    .zona-hd{ padding:0 22px; }
    .zona-sub{ margin:9px 0 0; font-size:14.5px; line-height:1.5; color:var(--muted); }
    .zona-or{ display:flex; align-items:center; gap:12px; margin:18px 22px; }
    .zona-or > span{ flex:1; height:1px; background:var(--bd2); }
    .zona-or > b{ font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); }
    .zona-list{ background:#fff; border:1px solid var(--bd); border-radius:var(--r-card); overflow:hidden; }
    .zona-row{ display:flex; align-items:center; gap:12px; width:100%; text-align:left;
      background:none; border:none; padding:15px 16px; min-height:54px; cursor:pointer; color:var(--ink);
      border-bottom:1px solid var(--bd); font-family:inherit; }
    .zona-row:last-child{ border-bottom:none; }
    .zona-row:active{ background:var(--carta-scura); }
    .zona-row .zona-name{ flex:1; font-size:15px; font-weight:500; color:var(--ink-soft); }
    .zona-head{ background:var(--verde-pale); border-bottom:1px solid #d7ecdd; }
    .zona-head .zona-name{ font-weight:600; color:var(--ink); }
    .zona-tag{ display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700;
      color:var(--verde-deep); background:#fff; padding:4px 10px; border-radius:var(--r-pill); }
    .zona-wait{ margin:20px 22px 0; background:var(--terra-pale); border-radius:18px; padding:18px; }
    .zona-wait .zw-t{ font-family:var(--serif); font-size:18px; font-weight:600; color:var(--ink); line-height:1.15; }
    .zona-wait .zw-p{ margin:6px 0 14px; font-size:13.5px; line-height:1.5; color:var(--muted); }
    .zona-note{ display:none; align-items:center; gap:8px; margin:14px 22px 0; padding:13px 15px;
      background:var(--verde-pale); border:1px solid #d7ecdd; border-radius:14px;
      font-size:13.5px; line-height:1.45; color:var(--verde-deep); font-weight:500; }
    .zona-note.show{ display:flex; }
  </style>
  <div class="screen no-nav">
    ${StatusBar()}
    <div class="toprow">
      <button class="iconbtn" data-back aria-label="Indietro">${Icon('arrow-left', { size: 22, stroke: 2.1 })}</button>
      <span></span>
    </div>
    <div class="scroll">
      <div class="zona-hd">
        <h1 class="h1">Dove sei <em>di casa?</em></h1>
        <p class="zona-sub">Ci serve solo per mostrarti i produttori più vicini.</p>
      </div>

      <div class="pad mt22">
        <button class="btn btn-grad btn-block" data-geo>
          ${Icon('crosshair', { size: 19, color: '#fff', stroke: 2 })} Usa la mia posizione
        </button>
      </div>

      <div class="zona-note" data-geonote>
        ${Icon('info', { size: 17, color: 'var(--verde-deep)', stroke: 2 })}
        <span>Non riusciamo a leggere la posizione. Attivala nelle impostazioni del telefono, oppure scegli il tuo comune qui sotto.</span>
      </div>

      <div class="zona-or"><span></span><b>oppure scegli a mano</b><span></span></div>

      <div class="pad">
        <label class="search">
          ${Icon('search', { size: 19, color: 'var(--terra-deep)', stroke: 2 })}
          <input type="text" inputmode="search" placeholder="Cerca comune o CAP" data-q aria-label="Cerca comune o CAP" />
        </label>
      </div>

      <div class="pad mt22">
        <div class="eyebrow" style="margin-bottom:11px">Zone attive ora</div>
        <div class="zona-list" data-list>
          <div class="zona-row zona-head" data-go>
            ${Icon('map-pin', { size: 19, color: 'var(--verde-deep)', stroke: 2 })}
            <span class="zona-name">${zone.label}</span>
            <span class="zona-tag">${Icon('check-circle', { size: 13, color: 'var(--verde)', stroke: 2.3 })} Attiva</span>
          </div>
          ${comuni.map(c => `
          <button class="zona-row" data-go data-comune="${c}">
            ${Icon('map-pin', { size: 19, color: 'var(--faint2)', stroke: 2 })}
            <span class="zona-name">${c}</span>
            ${Icon('chevron-right', { size: 18, color: 'var(--faint)', stroke: 2 })}
          </button>`).join('')}
        </div>
        <p class="muted center mt16" data-empty style="display:none;font-size:13.5px;line-height:1.5">
          Nessun comune trovato per la ricerca.<br>Controlla l'ortografia o usa la tua posizione qui sopra.
        </p>
      </div>

      <div class="zona-wait">
        <div class="zw-t">Non sei in Abruzzo?</div>
        <p class="zw-p">Per ora siamo attivi qui. Lasciaci la tua zona: ti avvisiamo appena arriviamo.</p>
        <button class="btn btn-ink btn-block" style="background:var(--terra-deep)" data-wait>
          ${Icon('bell', { size: 17, color: '#fff', stroke: 2 })} Avvisami quando arrivate
        </button>
      </div>

      <div style="height:24px"></div>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();

    const go = () => { location.hash = '#/home'; };
    el.querySelectorAll('[data-go]').forEach(r => { r.onclick = go; });

    const geoBtn = el.querySelector('[data-geo]');
    const note = el.querySelector('[data-geonote]');
    geoBtn.onclick = () => {
      if (!navigator.geolocation) { note.classList.add('show'); return; }
      const old = geoBtn.innerHTML;
      geoBtn.disabled = true;
      geoBtn.innerHTML = `${Icon('navigation', { size: 19, color: '#fff', stroke: 2 })} Ti sto trovando…`;
      navigator.geolocation.getCurrentPosition(
        () => { location.hash = '#/home'; },
        () => { geoBtn.disabled = false; geoBtn.innerHTML = old; note.classList.add('show'); },
        { timeout: 8000 }
      );
    };

    // Filtro live della lista comuni
    const input = el.querySelector('[data-q]');
    const rows = [...el.querySelectorAll('.zona-row[data-comune]')];
    const empty = el.querySelector('[data-empty]');
    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      let shown = 0;
      rows.forEach(r => {
        const match = !q || r.dataset.comune.toLowerCase().includes(q);
        r.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      empty.style.display = (q && shown === 0) ? 'block' : 'none';
    };

    // Lista d'attesa (stato: causa risolta + conferma, mai vuoto)
    const waitBtn = el.querySelector('[data-wait]');
    waitBtn.onclick = () => {
      waitBtn.disabled = true;
      waitBtn.innerHTML = `${Icon('check-circle', { size: 17, color: '#fff', stroke: 2.2 })} Ti avviseremo`;
      waitBtn.style.opacity = '.85';
    };
  }

  return { html, onMount };
}
