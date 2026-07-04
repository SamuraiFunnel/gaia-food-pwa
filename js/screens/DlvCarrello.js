import { Icon } from '../icons.js';
import { StatusBar, Photo, VerifyBadge } from '../components.js';

/* ---------------- DlvCarrello — Carrello multi-produttore (#/consegna/carrello) ----------------
   Prodotti raggruppati per produttore. Niente prezzi (regola prodotto).
   VerifyBadge = perno della fiducia. Consegna "in arrivo". CTA -> scelta del quando. */
export function DlvCarrello() {
  // Carrello demo: 2 produttori, raggruppato per produttore.
  // qty editabile via stepper; nessun prezzo, nessun "gratis".
  const cart = [
    {
      id: 'claudio', name: 'Az. di Claudio', tone: 'pascolo', km: 3.1,
      verify: { state: 'valid', date: '12 giu' },
      items: [
        { id: 'latte-crudo', name: 'Latte crudo', unit: '1 litro', tone: 'latte', qty: 2 },
        { id: 'uova', name: 'Uova di giornata', unit: 'confezione da 6', tone: 'uova', qty: 1 },
      ],
    },
    {
      id: 'frantoio', name: 'Frantoio di Civitella', tone: 'olio', km: 2.4,
      verify: { state: 'valid', date: '3 giu' },
      items: [
        { id: 'evo', name: 'Extravergine', unit: '0,5 litri', tone: 'olio', qty: 2 },
      ],
    },
  ];

  const km = (n) => String(n).replace('.', ',');
  const countProducers = () => cart.filter(g => g.items.length).length;
  const countItems = () => cart.reduce((s, g) => s + g.items.reduce((a, it) => a + it.qty, 0), 0);
  const subtitle = () => {
    const np = countProducers(), ni = countItems();
    return `${np} ${np === 1 ? 'produttore' : 'produttori'} · ${ni} ${ni === 1 ? 'prodotto' : 'prodotti'}`;
  };

  const itemRow = (g, it) => `
    <div class="dc-row" data-prod="${g.id}" data-item="${it.id}">
      <div class="dc-thumb">${Photo(it.tone, '')}</div>
      <div class="dc-info">
        <div class="dc-iname">${it.name}</div>
        <div class="dc-iunit">${it.unit}</div>
      </div>
      <div class="dc-step" role="group" aria-label="Quantità ${it.name}">
        <button class="dc-mn" data-act="dec" aria-label="Togli uno">${Icon('x', { size: 15, color: 'var(--ink-soft)', stroke: 2.4 })}</button>
        <span class="dc-qty tnum" data-qty aria-live="polite">${it.qty}</span>
        <button class="dc-pl" data-act="inc" aria-label="Aggiungi uno">${Icon('check', { size: 15, color: '#fff', stroke: 2.6 })}</button>
      </div>
    </div>`;

  const group = (g) => `
    <div class="dc-group" data-group="${g.id}">
      <div class="dc-ghead">
        <div class="dc-gphoto">${Photo(g.tone, '')}</div>
        <div class="dc-gbody">
          <div class="dc-gname">${g.name}</div>
          <div class="dc-gmeta">
            ${VerifyBadge(g.verify, { compact: true })}
            <span class="dc-km tnum">${km(g.km)} km</span>
          </div>
        </div>
      </div>
      <div class="dc-items">
        ${g.items.map(it => itemRow(g, it)).join('')}
      </div>
    </div>`;

  const html = `
  <style>
    .dc-top{ display:flex; align-items:center; gap:12px; padding:6px 22px 0; }
    .dc-ttl{ line-height:1.05; }
    .dc-ttl .h1{ margin:0; }
    .dc-sub{ font-size:12.5px; color:var(--muted2); margin-top:3px; }

    .dc-stack{ display:flex; flex-direction:column; gap:14px; }

    .dc-group{ background:#fff; border:1px solid var(--bd); border-radius:var(--r-card); overflow:hidden;
      box-shadow:var(--sh-card); }
    .dc-ghead{ display:flex; align-items:center; gap:11px; padding:13px 15px; border-bottom:1px solid #f0e9dd; }
    .dc-gphoto{ width:42px; height:42px; flex:none; border-radius:12px; overflow:hidden; }
    .dc-gphoto .photo{ width:42px; height:42px; }
    .dc-gbody{ flex:1; min-width:0; }
    .dc-gname{ font-family:var(--serif); font-size:16px; font-weight:600; color:var(--ink);
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .dc-gmeta{ display:flex; align-items:center; gap:8px; margin-top:4px; }
    .dc-km{ font-size:11.5px; color:var(--terra-deep); font-weight:700; }

    .dc-row{ display:flex; align-items:center; gap:12px; padding:12px 15px; }
    .dc-row + .dc-row{ border-top:1px solid #f0e9dd; }
    .dc-thumb{ width:48px; height:48px; flex:none; border-radius:12px; overflow:hidden; }
    .dc-thumb .photo{ width:48px; height:48px; }
    .dc-info{ flex:1; min-width:0; }
    .dc-iname{ font-size:14.5px; font-weight:600; color:var(--ink); }
    .dc-iunit{ font-size:12.5px; color:var(--muted2); margin-top:1px; }

    .dc-step{ display:flex; align-items:center; gap:10px; flex:none; }
    .dc-step button{ width:34px; height:34px; min-width:34px; border-radius:50%; display:flex;
      align-items:center; justify-content:center; cursor:pointer; font-family:inherit; padding:0; }
    .dc-mn{ background:#fff; border:1px solid var(--bd3); }
    .dc-mn:active{ background:var(--carta-scura); }
    .dc-pl{ background:var(--grad-azione); border:none; box-shadow:0 4px 10px -4px rgba(22,163,74,.6); }
    .dc-qty{ font-size:15px; font-weight:700; color:var(--ink); min-width:18px; text-align:center; }

    /* banner "in arrivo" — un mezzo ritira da entrambi */
    .dc-note{ display:flex; align-items:flex-start; gap:11px; background:var(--verde-pale);
      border:1px solid #d7ecdd; border-radius:14px; padding:13px 15px; }
    .dc-note svg{ flex:none; margin-top:1px; }
    .dc-note span{ font-size:13px; line-height:1.45; color:var(--verde-deep); font-weight:500; }
    .dc-note strong{ font-weight:700; }

    /* stato vuoto: causa + rimedio + uscita */
    .dc-empty{ text-align:center; padding:48px 28px 0; }
    .dc-empty .e-ic{ width:60px; height:60px; border-radius:50%; background:var(--carta-scura);
      display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }
    .dc-empty .e-t{ font-family:var(--serif); font-size:20px; font-weight:600; color:var(--ink); }
    .dc-empty .e-p{ font-size:14px; line-height:1.55; color:var(--muted); margin:8px 0 20px; }
  </style>
  <div class="screen no-nav">
    ${StatusBar()}
    <div class="dc-top">
      <button class="iconbtn" data-back aria-label="Indietro">${Icon('arrow-left', { size: 22, stroke: 2.1 })}</button>
      <div class="dc-ttl">
        <h1 class="h1">Il tuo carrello</h1>
        <div class="dc-sub" data-sub>${subtitle()}</div>
      </div>
    </div>

    <div class="scroll">
      <div class="pad mt16">
        <div class="dc-stack" data-stack>
          ${cart.map(group).join('')}
          <div class="dc-note">
            ${Icon('truck', { size: 20, color: 'var(--verde-deep)', stroke: 2 })}
            <span>Un mezzo ritira da <strong>entrambi</strong> e porta tutto a casa tua.</span>
          </div>
        </div>

        <div class="dc-empty" data-empty style="display:none">
          <div class="e-ic">${Icon('bookmark', { size: 24, color: 'var(--faint)', stroke: 2 })}</div>
          <div class="e-t">Il carrello è vuoto</div>
          <p class="e-p">Hai tolto tutti i prodotti. Torna ai produttori vicini per scegliere cosa farti portare a casa.</p>
          <button class="btn btn-grad btn-block" data-go-home>
            ${Icon('map-pin', { size: 18, color: '#fff', stroke: 2 })} Scopri i produttori vicini
          </button>
        </div>
      </div>
      <div style="height:8px"></div>
    </div>

    <div class="cta-sticky" data-cta>
      <button class="btn btn-ink btn-block" data-next>
        Scegli quando riceverlo ${Icon('chevron-right', { size: 18, color: '#fff', stroke: 2.3 })}
      </button>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
    const goHome = () => { location.hash = '#/home'; };
    const goHomeEl = el.querySelector('[data-go-home]'); if (goHomeEl) goHomeEl.onclick = goHome;
    const nextEl = el.querySelector('[data-next]'); if (nextEl) nextEl.onclick = () => { location.hash = '#/consegna/zona'; };

    const subEl = el.querySelector('[data-sub]');
    const stackEl = el.querySelector('[data-stack]');
    const emptyEl = el.querySelector('[data-empty]');
    const ctaEl = el.querySelector('[data-cta]');

    const refreshHeader = () => {
      const empty = cart.every(g => g.items.length === 0);
      subEl.textContent = subtitle();
      stackEl.style.display = empty ? 'none' : '';
      emptyEl.style.display = empty ? 'block' : 'none';
      ctaEl.style.display = empty ? 'none' : '';
    };

    // Stepper: + aggiunge, - toglie; a 0 rimuove la riga; gruppo senza righe sparisce.
    stackEl.onclick = (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const rowEl = btn.closest('.dc-row');
      const g = cart.find(x => x.id === rowEl.dataset.prod); if (!g) return;
      const it = g.items.find(x => x.id === rowEl.dataset.item); if (!it) return;

      if (btn.dataset.act === 'inc') { it.qty++; }
      else { it.qty--; }

      if (it.qty <= 0) {
        g.items = g.items.filter(x => x.id !== it.id);
        rowEl.remove();
        const groupEl = el.querySelector(`[data-group="${g.id}"]`);
        if (g.items.length === 0 && groupEl) groupEl.remove();
      } else {
        rowEl.querySelector('[data-qty]').textContent = it.qty;
      }
      refreshHeader();
    };

    refreshHeader();
  }

  return { html, onMount };
}
