import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';
import { getState, results } from '../store.js';

/* ---------------- FILTRI (bottom-sheet) ---------------- */
export function Filtri() {
  const s = getState();
  const cats = s.categories || [];

  // stato locale del foglio (non tocca lo store finché non si applica)
  const draft = {
    category: s.category || null,   // null = "Tutte"
    radius: s.radius || 15,
    openNow: false,
    seasonal: true,
  };
  const MIN = 5, MAX = 30;

  const chipsHtml = () => {
    const all = `<button class="fl-chip ${draft.category === null ? 'on' : ''}" data-cat="">Tutte</button>`;
    const rest = cats.map(c =>
      `<button class="fl-chip ${draft.category === c.id ? 'on' : ''}" data-cat="${c.id}">${Icon(c.glyph, { size: 15 })}${c.label}</button>`
    ).join('');
    return all + rest;
  };

  // conteggio anteprima: applica categoria + raggio sui risultati ordinati per km
  const countMatch = () => {
    let r = results();
    if (draft.category) r = r.filter(p => p.categories.includes(draft.category));
    r = r.filter(p => p.km <= draft.radius);
    return r.length;
  };

  const html = `
  <style>
    .fl-sheet{ background:var(--bianco); border-radius:30px 30px 0 0; box-shadow:0 -10px 40px rgba(31,24,18,.18);
      margin-top:auto; padding:12px 22px calc(24px + env(safe-area-inset-bottom)); }
    .fl-grip{ width:40px; height:5px; border-radius:100px; background:var(--bd3); margin:0 auto 16px; }
    .fl-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
    .fl-head .h2{ margin:0; }
    .fl-x{ width:36px; height:36px; min-width:36px; border-radius:50%; background:var(--carta-scura);
      display:flex; align-items:center; justify-content:center; }
    .fl-lbl{ display:flex; align-items:baseline; justify-content:space-between; margin-bottom:11px; }
    .fl-val{ font-family:var(--serif); font-size:18px; font-weight:600; color:var(--ink); }
    .fl-chips{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:24px; }
    .fl-chip{ display:inline-flex; align-items:center; gap:6px; min-height:38px; padding:8px 15px; border-radius:100px;
      background:#fff; border:1px solid var(--bd); color:var(--ink-soft); font-size:13px; font-weight:600;
      font-family:inherit; }
    .fl-chip svg{ flex:none; }
    .fl-chip.on{ background:var(--ink); border-color:var(--ink); color:#fff; }
    .fl-chip.on svg{ color:#fff; }
    /* slider raggio: range nativo accessibile + traccia visiva */
    .fl-range{ position:relative; height:26px; margin:0 4px 6px; }
    .fl-track{ position:absolute; left:0; right:0; top:50%; transform:translateY(-50%); height:6px;
      background:var(--carta-scura); border-radius:100px; overflow:hidden; }
    .fl-fill{ position:absolute; left:0; top:0; bottom:0; background:var(--grad-azione); border-radius:100px; }
    .fl-range input[type=range]{ position:absolute; inset:0; width:100%; height:100%; margin:0; background:none;
      -webkit-appearance:none; appearance:none; cursor:pointer; }
    .fl-range input[type=range]:focus-visible{ outline:2px solid var(--celeste); outline-offset:6px; border-radius:100px; }
    .fl-range input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none;
      width:26px; height:26px; border-radius:50%; background:#fff; border:3px solid var(--verde);
      box-shadow:0 3px 8px rgba(31,24,18,.25); cursor:pointer; }
    .fl-range input[type=range]::-moz-range-thumb{ width:26px; height:26px; border-radius:50%; background:#fff;
      border:3px solid var(--verde); box-shadow:0 3px 8px rgba(31,24,18,.25); cursor:pointer; }
    .fl-scale{ display:flex; justify-content:space-between; font-size:11px; color:var(--faint);
      font-variant-numeric:tabular-nums; margin-bottom:22px; }
    .fl-toggle{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 0;
      border-top:1px solid var(--bd2); min-height:55px; }
    .fl-toggle .fl-tl{ display:flex; align-items:center; gap:10px; font-size:15px; color:var(--ink); }
    .fl-sw{ width:46px; height:27px; min-width:46px; border-radius:100px; background:var(--bd3); position:relative;
      flex:none; transition:background .15s ease; }
    .fl-sw[aria-checked=true]{ background:var(--verde); }
    .fl-sw .knob{ position:absolute; top:2.5px; left:2.5px; width:22px; height:22px; border-radius:50%;
      background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.2); transition:left .15s ease; }
    .fl-sw[aria-checked=true] .knob{ left:21.5px; }
    .fl-acts{ display:flex; gap:12px; align-items:center; margin-top:16px; }
    .fl-acts .btn{ height:54px; }
  </style>
  <div class="screen no-nav" style="background:rgba(31,24,18,.5)">
    ${StatusBar(true)}
    <div class="fl-sheet">
      <div class="fl-grip"></div>
      <div class="fl-head">
        <h2 class="h2">Filtra</h2>
        <button class="fl-x" data-back aria-label="Chiudi i filtri">${Icon('x', { size: 18, color: 'var(--ink-soft)', stroke: 2.2 })}</button>
      </div>

      <div class="eyebrow" style="margin-bottom:11px">Categoria</div>
      <div class="fl-chips" id="fl-chips">${chipsHtml()}</div>

      <div class="fl-lbl">
        <span class="eyebrow">Raggio</span>
        <span class="fl-val tnum" id="fl-radius-val">${draft.radius} km</span>
      </div>
      <div class="fl-range">
        <div class="fl-track"><div class="fl-fill" id="fl-fill" style="width:${((draft.radius - MIN) / (MAX - MIN)) * 100}%"></div></div>
        <input type="range" id="fl-radius" min="${MIN}" max="${MAX}" step="1" value="${draft.radius}"
          aria-label="Raggio di ricerca in chilometri">
      </div>
      <div class="fl-scale"><span>${MIN} km</span><span>${MAX} km</span></div>

      <div class="fl-toggle">
        <span class="fl-tl">${Icon('clock', { size: 19, color: 'var(--muted2)', stroke: 1.9 })} Aperto ora</span>
        <button class="fl-sw" id="fl-open" role="switch" aria-checked="${draft.openNow}" aria-label="Solo aperti ora"><span class="knob"></span></button>
      </div>
      <div class="fl-toggle" style="margin-bottom:4px">
        <span class="fl-tl">${Icon('leaf', { size: 19, color: 'var(--verde-deep)', stroke: 1.9 })} Di stagione adesso</span>
        <button class="fl-sw" id="fl-seasonal" role="switch" aria-checked="${draft.seasonal}" aria-label="Solo prodotti di stagione adesso"><span class="knob"></span></button>
      </div>

      <div class="fl-acts">
        <button class="btn btn-outline" id="fl-reset" style="flex:none">Azzera</button>
        <button class="btn btn-grad" id="fl-apply" style="flex:1">Mostra <span id="fl-count" class="tnum">${countMatch()}</span> luoghi</button>
      </div>
    </div>
  </div>`;

  function onMount(el) {
    const fill = el.querySelector('#fl-fill');
    const radius = el.querySelector('#fl-radius');
    const radiusVal = el.querySelector('#fl-radius-val');
    const countEl = el.querySelector('#fl-count');

    const refreshCount = () => { countEl.textContent = countMatch(); };

    // back/chiudi
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();

    // chip categoria (singola selezione, "Tutte" = nessuna)
    el.querySelector('#fl-chips').onclick = (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      draft.category = b.dataset.cat || null;
      el.querySelectorAll('#fl-chips .fl-chip').forEach(c =>
        c.classList.toggle('on', (c.dataset.cat || '') === (draft.category || '')));
      refreshCount();
    };

    // slider raggio
    const syncRadius = () => {
      const pct = ((draft.radius - MIN) / (MAX - MIN)) * 100;
      fill.style.width = pct + '%';
      radiusVal.textContent = draft.radius + ' km';
    };
    radius.oninput = () => { draft.radius = +radius.value; syncRadius(); refreshCount(); };

    // toggle switch
    const bindSwitch = (id, key) => {
      const sw = el.querySelector('#' + id);
      sw.onclick = () => { draft[key] = !draft[key]; sw.setAttribute('aria-checked', String(draft[key])); refreshCount(); };
    };
    bindSwitch('fl-open', 'openNow');
    bindSwitch('fl-seasonal', 'seasonal');

    // azzera -> default
    el.querySelector('#fl-reset').onclick = () => {
      draft.category = null; draft.radius = 15; draft.openNow = false; draft.seasonal = true;
      radius.value = 15; syncRadius();
      el.querySelectorAll('#fl-chips .fl-chip').forEach(c => c.classList.toggle('on', !c.dataset.cat));
      el.querySelector('#fl-open').setAttribute('aria-checked', 'false');
      el.querySelector('#fl-seasonal').setAttribute('aria-checked', 'true');
      refreshCount();
    };

    // applica -> scrive nello store e torna alla home
    el.querySelector('#fl-apply').onclick = () => {
      s.category = draft.category;
      s.radius = draft.radius;
      location.hash = '#/home';
    };
  }

  return { html, onMount };
}
