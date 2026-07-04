import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';
import { getState } from '../store.js';

/* ---------------- DlvRiepilogo — Riepilogo consegna (#/consegna/riepilogo) ----------------
   Passo 2 di 2 della consegna. Sintesi carrello raggruppato per produttore + indirizzo + slot,
   e una RouteMap illustrata (tappe numerate -> mezzo -> casa) col banner "in arrivo".
   Regole prodotto: niente prezzi, niente "gratis"; consegna "in arrivo / non disponibile";
   CTA = "si conferma, non si paga" -> #/consegna/tracking. */
export function DlvRiepilogo() {
  const z = getState().zone;
  // "Casa tua" mostrata in zona o fuori-zona in base alla disponibilità consegna della zona.
  const inZona = !!(z && z.deliveryAvailable);

  // Sintesi (read-only) coerente col carrello demo di DlvCarrello.
  const groups = [
    { id: 'claudio', name: 'Az. di Claudio', km: 3.1, items: 'Latte ×2 · Uova ×1' },
    { id: 'frantoio', name: 'Frantoio di Civitella', km: 2.4, items: 'Olio ×2' },
  ];

  // Tappe del percorso del mezzo: 1,2 produttori -> casa.
  const km = (n) => String(n).replace('.', ',');
  const stops = groups.map((g, i) => ({ n: i + 1, name: g.name.replace('Az. di ', '').replace('Frantoio di ', ''), km: g.km }));
  const tappeLine = `${stops.map(s => `${s.n} ${s.name} (${km(s.km)})`).join(' → ')} → Casa tua`;

  const slot = { day: 'Gio 2 lug', time: '17–19' };

  const summaryRow = (g) => `
    <div class="rs-srow">
      <div class="rs-sname">${g.name}</div>
      <div class="rs-sitems tnum">${g.items}</div>
    </div>`;

  // ---- RouteMap illustrata (HTML/SVG): 2 tappe numerate -> Icon truck -> Icon home,
  //      linea tratteggiata terra che le collega, badge ETA in alto. ----
  const routeMap = `
    <div class="rs-route" role="img" aria-label="Percorso del mezzo: ${tappeLine}">
      <span class="rs-eta">${Icon('truck', { size: 14, color: '#fff', stroke: 2.1 })} In viaggio · ritira e consegna</span>
      <svg class="rs-routeline" viewBox="0 0 356 130" preserveAspectRatio="none" aria-hidden="true">
        <path d="M30 96 C70 96 78 44 118 44 C158 44 168 96 208 96 C252 96 262 50 310 50"
          fill="none" stroke="var(--terra)" stroke-width="2.5" stroke-linecap="round"
          stroke-dasharray="2 8" opacity=".85"></path>
      </svg>
      <div class="rs-nodes">
        <div class="rs-node">
          <span class="rs-pin rs-pin-stop">1</span>
          <span class="rs-nlabel">${stops[0].name}</span>
        </div>
        <div class="rs-node rs-node-up">
          <span class="rs-pin rs-pin-stop">2</span>
          <span class="rs-nlabel">${stops[1].name}</span>
        </div>
        <div class="rs-node">
          <span class="rs-pin rs-pin-truck">${Icon('truck', { size: 18, color: '#fff', stroke: 2 })}</span>
          <span class="rs-nlabel">Mezzo</span>
        </div>
        <div class="rs-node">
          <span class="rs-pin rs-pin-home">${Icon('home', { size: 18, color: '#fff', stroke: 2 })}</span>
          <span class="rs-nlabel">Casa</span>
        </div>
      </div>
    </div>`;

  const html = `
  <style>
    .rs-top{ display:flex; align-items:center; gap:12px; padding:6px 22px 0; }
    .rs-step{ display:inline-flex; align-items:center; gap:7px; font-size:11px; font-weight:700;
      letter-spacing:.14em; text-transform:uppercase; color:var(--celeste-deep); background:var(--celeste-pale);
      padding:6px 12px; border-radius:var(--r-pill); }

    /* RouteMap illustrata */
    .rs-route{ position:relative; height:184px; border-radius:var(--r-card); overflow:hidden;
      background:linear-gradient(155deg,#F3E9D9,#E7F5EC); border:1px solid var(--bd2);
      box-shadow:var(--sh-card); }
    .rs-eta{ position:absolute; top:13px; left:13px; z-index:3; display:inline-flex; align-items:center; gap:7px;
      font-size:11.5px; font-weight:700; color:#fff; background:var(--ink); padding:6px 12px;
      border-radius:var(--r-pill); box-shadow:0 4px 12px -4px rgba(31,24,18,.5); }
    .rs-routeline{ position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
    .rs-nodes{ position:absolute; inset:0; padding:0 22px; display:flex; align-items:center;
      justify-content:space-between; }
    .rs-node{ display:flex; flex-direction:column; align-items:center; gap:8px; z-index:2; }
    .rs-node-up{ transform:translateY(-48px); }
    .rs-pin{ width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      border:3px solid #fff; box-shadow:0 4px 12px -3px rgba(31,24,18,.4); }
    .rs-pin-stop{ background:#fff; color:var(--terra-deep); font-family:var(--serif); font-size:18px; font-weight:600;
      border:3px solid var(--terra); }
    .rs-pin-truck{ background:var(--grad-azione); }
    .rs-pin-home{ background:var(--ink); }
    .rs-nlabel{ font-size:11px; font-weight:600; color:var(--ink-soft); white-space:nowrap;
      background:rgba(251,249,245,.82); padding:2px 8px; border-radius:var(--r-pill); }
    .rs-node-up .rs-nlabel{ order:-1; }

    .rs-tappe{ display:flex; align-items:center; gap:7px; margin-top:11px; font-size:12.5px; color:var(--ink-soft); }
    .rs-tappe .rs-tlab{ font-weight:700; color:var(--muted2); }
    .rs-tappe .rs-tval{ font-variant-numeric:tabular-nums; }

    /* Riepilogo carrello (sintesi read-only) */
    .rs-card{ background:#fff; border:1px solid var(--bd); border-radius:16px; overflow:hidden; box-shadow:var(--sh-card); }
    .rs-srow{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 15px; }
    .rs-srow + .rs-srow{ border-top:1px solid #f0e9dd; }
    .rs-sname{ font-family:var(--serif); font-size:15px; font-weight:600; color:var(--ink); }
    .rs-sitems{ font-size:13px; color:var(--ink-soft); text-align:right; }

    /* righe slot + indirizzo */
    .rs-line{ display:flex; align-items:center; gap:12px; background:#fff; border:1px solid var(--bd);
      border-radius:14px; padding:13px 15px; }
    .rs-line .rs-licon{ flex:none; display:flex; }
    .rs-line .rs-ltext{ flex:1; min-width:0; font-size:14px; color:var(--ink); }
    .rs-line .rs-ltext .tnum{ font-variant-numeric:tabular-nums; }
    .rs-line .rs-zona{ color:var(--verde-deep); font-weight:600; }
    .rs-line .rs-soon{ color:var(--celeste-deep); font-weight:600; }
    .rs-line .rs-change{ flex:none; border:none; background:transparent; color:var(--verde-deep);
      font-size:13px; font-weight:600; font-family:inherit; cursor:pointer; min-height:44px; padding:0 4px; }

    /* banner "in arrivo" — un mezzo per tutto */
    .rs-note{ display:flex; align-items:flex-start; gap:11px; background:var(--verde-pale);
      border:1px solid #d7ecdd; border-radius:14px; padding:13px 15px; }
    .rs-note svg{ flex:none; margin-top:1px; }
    .rs-note span{ font-size:13px; line-height:1.45; color:var(--verde-deep); font-weight:500; }
    .rs-note strong{ font-weight:700; }

    .rs-cta-note{ text-align:center; margin-top:11px; font-size:12.5px; color:var(--muted2); }
  </style>
  <div class="screen no-nav">
    ${StatusBar()}
    <div class="rs-top">
      <button class="iconbtn" data-back aria-label="Indietro">${Icon('arrow-left', { size: 22, stroke: 2.1 })}</button>
      <span class="rs-step">Passo 2 di 2 · Conferma</span>
    </div>

    <div class="scroll">
      <div class="pad mt16">
        ${routeMap}
        <div class="rs-tappe">
          <span class="rs-tlab">Tappe:</span>
          <span class="rs-tval">${tappeLine}</span>
        </div>
      </div>

      <div class="pad mt22">
        <div class="eyebrow" style="margin-bottom:10px">Riepilogo</div>
        <div class="rs-card">
          ${groups.map(summaryRow).join('')}
        </div>
      </div>

      <div class="pad mt12 gap8" style="display:flex;flex-direction:column">
        <div class="rs-line">
          <span class="rs-licon">${Icon('calendar', { size: 19, color: 'var(--terra-deep)', stroke: 2 })}</span>
          <span class="rs-ltext">${slot.day} · <span class="tnum">${slot.time}</span></span>
          <button class="rs-change" data-change-slot>Cambia</button>
        </div>
        <div class="rs-line">
          <span class="rs-licon">${Icon('home', { size: 19, color: 'var(--terra-deep)', stroke: 2 })}</span>
          <span class="rs-ltext">Casa tua · ${inZona
            ? '<span class="rs-zona">in zona</span>'
            : '<span class="rs-soon">consegna in arrivo</span>'}</span>
          <button class="rs-change" data-change-addr>Cambia</button>
        </div>
      </div>

      <div class="pad mt16">
        <div class="rs-note">
          ${Icon('truck', { size: 20, color: 'var(--verde-deep)', stroke: 2 })}
          <span>Un solo mezzo ritira da <strong>tutti i produttori</strong> e porta tutto a casa tua.</span>
        </div>
      </div>

      <div style="height:8px"></div>
    </div>

    <div class="cta-sticky" style="flex-direction:column;align-items:stretch">
      <button class="btn btn-grad btn-block" data-confirm>
        Conferma · si conferma, non si paga
        ${Icon('check-circle', { size: 19, color: '#fff', stroke: 2.2 })}
      </button>
      <div class="rs-cta-note">Nessun pagamento, nessun intermediario.</div>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
    // "Cambia" riportano allo step precedente (slot/indirizzo) finché il flusso non è esteso.
    const chgSlot = el.querySelector('[data-change-slot]'); if (chgSlot) chgSlot.onclick = () => { location.hash = '#/consegna/zona'; };
    const chgAddr = el.querySelector('[data-change-addr]'); if (chgAddr) chgAddr.onclick = () => { location.hash = '#/consegna/zona'; };
    const confirm = el.querySelector('[data-confirm]'); if (confirm) confirm.onclick = () => { location.hash = '#/consegna/tracking'; };
  }

  return { html, onMount };
}
