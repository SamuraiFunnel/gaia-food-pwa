import { Icon } from '../icons.js';
import { StatusBar, initMap } from '../components.js';
import { getState, results } from '../store.js';
import { t } from '../i18n.js';

/* =====================================================================
   DlvZona — #/consegna/zona
   Controllo della zona di consegna. La consegna è "in arrivo": qui
   verifichiamo solo se l'indirizzo dell'utente cade dentro l'area
   coperta. Tutto resta INTRA-ZONA (Alta Val di Sangro): i tre esiti
   possibili sono in-zona / al confine / fuori-zona — mai Roma→Napoli.
   ===================================================================== */
export function DlvZona() {
  const zone = getState().zone || { label: 'Alta Val di Sangro', comuni: [] };
  const comuni = zone.comuni || [];
  const prods = results();
  // riferimento "vicini" per il messaggio in-zona (primi 2 per km)
  const near = prods.slice(0, 2);

  // Indirizzo salvato di default (Casa tua) — primo comune coperto
  const home = {
    label: t('dlvZona.homeLabel'),
    address: `Via del Lago 7, ${comuni[0] || 'Villetta Barrea'} (AQ)`,
  };

  // Catalogo indirizzi DEMO, tutti intra-zona: l'esito dipende dal comune.
  //  in   = dentro l'area coperta
  //  edge = al confine (servito, ma sui bordi della zona)
  //  out  = fuori area per ora (resta dentro la Val di Sangro / Abruzzo)
  const PLACES = [
    { q: comuni[0] || 'Villetta Barrea', addr: `Via del Lago 7, ${comuni[0] || 'Villetta Barrea'} (AQ)`, state: 'in' },
    { q: comuni[1] || 'Opi', addr: `Corso Sangro 2, ${comuni[1] || 'Opi'} (AQ)`, state: 'in' },
    { q: comuni[2] || 'Civitella Alfedena', addr: `Via Borgo 11, ${comuni[2] || 'Civitella Alfedena'} (AQ)`, state: 'in' },
    { q: 'Barrea', addr: 'Via Lago 4, Barrea (AQ)', state: 'edge' },
    { q: 'Pescasseroli', addr: 'Viale Colli 9, Pescasseroli (AQ)', state: 'edge' },
    { q: 'Alfedena', addr: 'Via Roma 18, Alfedena (AQ)', state: 'out' },
    { q: 'Scanno', addr: 'Via del Lago 30, Scanno (AQ)', state: 'out' },
  ];

  // stato selezionato (parte da Casa tua = in-zona)
  const sel = { state: 'in', address: home.address, label: home.label };

  const kmTxt = (k) => String(k).replace('.', ',') + ' km';

  /* --- markup dell'esito (riusa .block / vbadge-like, mai solo colore) --- */
  const outcomeHtml = (st) => {
    if (st === 'in') {
      const list = near.length
        ? near.map(p => `${p.name.replace(/^Az\.\s*Agricola\s*di\s*/i, '').split(' ')[0]} <b class="tnum">${kmTxt(p.km)}</b>`).join(' · ')
        : '';
      return `
      <div class="dz-out dz-in">
        <div class="dz-ic">${Icon('check', { size: 19, color: '#fff', stroke: 2.6 })}</div>
        <div class="dz-tx">
          <div class="dz-t">${t('dlvZona.inTitle')}</div>
          <div class="dz-p">${t('dlvZona.inBody', { zone: zone.label })}</div>
          ${list ? `<div class="dz-near tnum">${t('dlvZona.inNear', { list })}</div>` : ''}
        </div>
      </div>`;
    }
    if (st === 'edge') {
      return `
      <div class="dz-out dz-edge">
        <div class="dz-ic">${Icon('map-pin', { size: 18, color: '#fff', stroke: 2.2 })}</div>
        <div class="dz-tx">
          <div class="dz-t">${t('dlvZona.edgeTitle')}</div>
          <div class="dz-p">${t('dlvZona.edgeBody', { zone: zone.label })}</div>
        </div>
      </div>`;
    }
    // out — fuori zona, ma con rimedio + uscita (avvisami)
    return `
    <div class="dz-out dz-off">
      <div class="dz-ic">${Icon('info', { size: 18, color: '#fff', stroke: 2.2 })}</div>
      <div class="dz-tx">
        <div class="dz-t">${t('dlvZona.outTitle')}</div>
        <div class="dz-p">${t('dlvZona.outBody', { zone: zone.label })}</div>
        <button class="btn btn-block dz-bell" data-bell style="background:var(--terra-deep);color:#fff;margin-top:12px">
          ${Icon('bell', { size: 17, color: '#fff', stroke: 2 })} ${t('dlvZona.notifyMe')}
        </button>
      </div>
    </div>`;
  };

  const html = `
  <style>
    .dz-addr{ display:flex; align-items:center; gap:12px; background:#fff; border:1px solid var(--bd);
      border-radius:16px; padding:13px 14px; }
    .dz-addr .dz-home{ width:40px; height:40px; flex:none; border-radius:11px; background:var(--ink);
      display:flex; align-items:center; justify-content:center; }
    .dz-addr .dz-info{ flex:1; min-width:0; }
    .dz-addr .dz-lab{ font-size:14.5px; font-weight:600; color:var(--ink); }
    .dz-addr .dz-line{ font-size:12.5px; color:var(--muted2); margin-top:1px; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .dz-change{ border:1px solid var(--bd3); background:#fff; border-radius:var(--r-pill);
      padding:9px 14px; font-size:12.5px; font-weight:600; color:var(--verde-deep); min-height:40px;
      font-family:inherit; flex:none; }
    .dz-change:active{ background:var(--carta-scura); }

    /* campo "Cambia indirizzo" con suggerimenti intra-zona */
    .dz-edit{ display:none; }
    .dz-edit.show{ display:block; }
    .dz-sugg{ background:#fff; border:1px solid var(--bd); border-radius:var(--r-card); overflow:hidden;
      margin-top:10px; }
    .dz-srow{ display:flex; align-items:center; gap:11px; width:100%; text-align:left; background:none;
      border:none; border-bottom:1px solid var(--bd); padding:13px 15px; min-height:52px; cursor:pointer;
      color:var(--ink); font-family:inherit; }
    .dz-srow:last-child{ border-bottom:none; }
    .dz-srow:active{ background:var(--carta-scura); }
    .dz-srow .dz-sn{ flex:1; font-size:14.5px; font-weight:500; color:var(--ink-soft); }
    .dz-srow .dz-stag{ font-size:11px; font-weight:700; letter-spacing:.04em; padding:3px 9px;
      border-radius:var(--r-pill); }
    .dz-stag.in{ color:var(--verde-deep); background:var(--verde-pale); }
    .dz-stag.edge{ color:var(--terra-deep); background:var(--terra-pale); }
    .dz-stag.out{ color:var(--muted); background:var(--carta-scura); }
    .dz-empty{ font-size:13px; line-height:1.5; color:var(--muted); padding:14px 4px 4px; }

    /* mini-mappa zona */
    .dz-map{ height:172px; }
    .dz-mapcanvas{ position:absolute; inset:0; }

    /* esito */
    .dz-out{ display:flex; gap:12px; align-items:flex-start; border-radius:16px; padding:15px 16px;
      border:1px solid transparent; }
    .dz-out .dz-ic{ width:34px; height:34px; flex:none; border-radius:50%; display:flex; align-items:center;
      justify-content:center; margin-top:1px; }
    .dz-out .dz-t{ font-size:15px; font-weight:600; line-height:1.2; }
    .dz-out .dz-p{ font-size:12.8px; line-height:1.5; margin-top:3px; }
    .dz-out .dz-near{ font-size:12.5px; margin-top:8px; color:var(--terra-deep); font-weight:600; }
    .dz-in{ background:var(--verde-pale); border-color:#c7e7d2; }
    .dz-in .dz-ic{ background:var(--verde); }
    .dz-in .dz-t{ color:var(--verde-deep); } .dz-in .dz-p{ color:#3d6e4e; }
    .dz-edge{ background:var(--terra-pale); border-color:#e3d4ba; }
    .dz-edge .dz-ic{ background:var(--terra-deep); }
    .dz-edge .dz-t{ color:var(--terra-deep); } .dz-edge .dz-p{ color:#6e5836; }
    .dz-off{ background:var(--carta-scura); border-color:var(--bd2); }
    .dz-off .dz-ic{ background:var(--muted2); }
    .dz-off .dz-t{ color:var(--ink); } .dz-off .dz-p{ color:var(--muted); }
    .dz-bell{ height:50px; }

    /* banner consegna "in arrivo" */
    .dz-soon{ display:flex; align-items:center; gap:10px; background:var(--celeste-pale);
      border:1px solid #c3e6f5; border-radius:14px; padding:12px 14px; }
    .dz-soon .dz-si{ width:30px; height:30px; flex:none; border-radius:9px; background:var(--celeste);
      display:flex; align-items:center; justify-content:center; }
    .dz-soon .dz-st{ font-size:12.8px; line-height:1.45; color:var(--celeste-deep); font-weight:500; }
    .dz-soon .dz-st b{ font-weight:700; }
  </style>

  <div class="screen no-nav">
    ${StatusBar()}
    <div class="toprow">
      <button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 22, stroke: 2.1 })}</button>
      <span></span>
    </div>

    <div class="scroll">
      <div class="pad">
        <h1 class="h1">${t('dlvZona.title')}</h1>
        <p class="muted mt8" style="font-size:14px;line-height:1.5">
          ${t('dlvZona.subtitle', { zone: zone.label })}
        </p>
      </div>

      <!-- banner consegna in arrivo (regola: mai "gratis", solo stato) -->
      <div class="pad mt16">
        <div class="dz-soon">
          <div class="dz-si">${Icon('truck', { size: 17, color: '#fff', stroke: 2 })}</div>
          <div class="dz-st">${t('dlvZona.soonBanner')}</div>
        </div>
      </div>

      <!-- indirizzo Casa tua -->
      <div class="pad mt16">
        <div class="eyebrow" style="margin-bottom:10px">${t('dlvZona.addressEyebrow')}</div>
        <div class="dz-addr">
          <div class="dz-home">${Icon('home', { size: 20, color: '#fff', stroke: 2.1 })}</div>
          <div class="dz-info">
            <div class="dz-lab" data-lab>${home.label}</div>
            <div class="dz-line" data-line>${home.address}</div>
          </div>
          <button class="dz-change" data-toggle>${t('dlvZona.change')}</button>
        </div>

        <!-- editor indirizzo (suggerimenti tutti intra-zona) -->
        <div class="dz-edit" data-edit>
          <label class="search mt12">
            ${Icon('search', { size: 19, color: 'var(--terra-deep)', stroke: 2 })}
            <input type="text" inputmode="search" placeholder="${t('dlvZona.searchPlaceholder', { zone: zone.label })}" data-q aria-label="${t('dlvZona.searchAria')}" />
          </label>
          <div class="dz-sugg" data-sugg></div>
          <p class="dz-empty" data-empty style="display:none"></p>
        </div>
      </div>

      <!-- mini mappa zona -->
      <div class="pad mt16">
        <div class="mapwrap dz-map">
          <div id="dz-mapf" class="dz-mapcanvas"></div>
        </div>
      </div>

      <!-- esito (in / edge / out) -->
      <div class="pad mt16" data-outcome>${outcomeHtml(sel.state)}</div>

      <div style="height:8px"></div>
    </div>

    <!-- CTA: conferma indirizzo -> slot -->
    <div class="cta-sticky">
      <button class="btn btn-grad btn-block" data-confirm>
        ${t('dlvZona.confirm')} ${Icon('chevron-right', { size: 18, color: '#fff', stroke: 2.2 })}
      </button>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();

    // mini-mappa con i produttori della zona + me al centro
    const mapEl = el.querySelector('#dz-mapf');
    if (mapEl) initMap(mapEl, prods, { center: zone.center, me: true });

    const editBox = el.querySelector('[data-edit]');
    const toggle = el.querySelector('[data-toggle]');
    const input = el.querySelector('[data-q]');
    const sugg = el.querySelector('[data-sugg]');
    const empty = el.querySelector('[data-empty]');
    const labEl = el.querySelector('[data-lab]');
    const lineEl = el.querySelector('[data-line]');
    const outcome = el.querySelector('[data-outcome]');
    const confirm = el.querySelector('[data-confirm]');

    const STAG = { in: t('dlvZona.tagIn'), edge: t('dlvZona.tagEdge'), out: t('dlvZona.tagOut') };

    const renderSugg = (q = '') => {
      const ql = q.trim().toLowerCase();
      const rows = PLACES.filter(p => !ql || (p.q + ' ' + p.addr).toLowerCase().includes(ql));
      if (!rows.length) {
        sugg.innerHTML = '';
        empty.style.display = 'block';
        empty.textContent = t('dlvZona.noResults', { zone: zone.label, q });
        // mostra comunque la lista completa come uscita
        sugg.innerHTML = PLACES.map(rowHtml).join('');
        return;
      }
      empty.style.display = 'none';
      sugg.innerHTML = rows.map(rowHtml).join('');
    };

    const rowHtml = (p) => `
      <button class="dz-srow" data-pick data-state="${p.state}" data-addr="${p.addr}" data-name="${p.q}">
        ${Icon('map-pin', { size: 18, color: 'var(--faint2)', stroke: 2 })}
        <span class="dz-sn">${p.addr}</span>
        <span class="dz-stag ${p.state}">${STAG[p.state]}</span>
      </button>`;

    // apri/chiudi editor
    toggle.onclick = () => {
      const open = editBox.classList.toggle('show');
      toggle.textContent = open ? t('dlvZona.close') : t('dlvZona.change');
      if (open) { renderSugg(''); input.focus(); }
    };

    // filtro live
    input.oninput = () => renderSugg(input.value);

    // selezione indirizzo
    sugg.onclick = (e) => {
      const b = e.target.closest('[data-pick]'); if (!b) return;
      sel.state = b.dataset.state;
      sel.address = b.dataset.addr;
      sel.label = b.dataset.name;
      labEl.textContent = b.dataset.name;
      lineEl.textContent = b.dataset.addr;
      outcome.innerHTML = outcomeHtml(sel.state);
      bindBell();
      updateConfirm();
      // richiudi l'editor dopo la scelta
      editBox.classList.remove('show');
      toggle.textContent = t('dlvZona.change');
    };

    // "Avvisami" nello stato fuori-zona (causa + rimedio + conferma)
    function bindBell() {
      const bell = outcome.querySelector('[data-bell]');
      if (!bell) return;
      bell.onclick = () => {
        bell.disabled = true;
        bell.style.opacity = '.85';
        bell.innerHTML = `${Icon('check-circle', { size: 17, color: '#fff', stroke: 2.2 })} ${t('dlvZona.willNotify')}`;
      };
    }
    bindBell();

    // CTA: fuori-zona NON può confermare lo slot (non c'è consegna lì)
    function updateConfirm() {
      const off = sel.state === 'out';
      confirm.disabled = off;
      confirm.style.opacity = off ? '.5' : '';
      confirm.style.pointerEvents = off ? 'none' : '';
      confirm.innerHTML = off
        ? t('dlvZona.outOfZone')
        : `${t('dlvZona.confirm')} ${Icon('chevron-right', { size: 18, color: '#fff', stroke: 2.2 })}`;
    }
    updateConfirm();

    confirm.onclick = () => {
      if (sel.state === 'out') return;
      location.hash = '#/consegna/slot';
    };
  }

  return { html, onMount };
}
