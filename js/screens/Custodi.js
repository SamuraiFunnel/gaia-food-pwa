import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';
import { custodiMe } from '../store.js';

/* ---------------- Referral "a semi" · due schermate distinte ----------------
   - 'cliente'    → "Invita un amico": pagina SEMPLICE (nessun credito/cruscotto).
                    Solo: porta un amico dentro Gaia Food + link da condividere + come funziona.
   - 'produttore' → "I Custodi di Gaia": cruscotto "Giardino" con COMMISSIONE reale
                    (persone portate + stati seme→germoglio→radicato, livelli).
   Dati reali da /api/custodi/me. Numeri dalla spec "Custodi" — da validare sul Business Plan.
   (Nota: un domani "Invita un amico" potrà avere una gamification a crediti in base a dove
    compra l'amico — da elaborare; per ora la pagina resta semplice.) */

const SLAB = { radicato: 'Radicato', germoglio: 'Germoglio', seme: 'Seme' };
const stCls = { radicato: 'st-rad', germoglio: 'st-germ', seme: 'st-seme' };
const eur = n => '€' + (Number(n) || 0).toFixed(2).replace(/\.00$/, '').replace('.', ',');

const CFG = {
  cliente: {
    navTitle: 'Invita un amico',
    shareCta: 'Invita un amico',
    shareMsg: 'Ti invito in Gaia Food — il cibo vero dai produttori veri, vicino a te. Entra col mio seme:',
  },
  produttore: {
    navTitle: 'I Custodi di Gaia',
    shareCta: 'Invita nel cerchio',
    shareMsg: 'Entra in Gaia Food come Custode — cibo vero, filiera corta. Usa il mio seme:',
  },
};

const LINK_ROW = `<div class="cu-link" data-cu-copy role="button" tabindex="0" aria-label="Copia il tuo link">
  ${Icon('sprout', { size: 17, color: 'var(--verde-deep)' })}<span class="lk" data-cu-linktext>il tuo link</span><span class="cp" data-cu-cplabel>COPIA</span></div>`;

/* ===== Vista SEMPLICE — "Invita un amico" (consumatore) ===== */
function viewInvita(d, cfg) {
  const total = (d.counts && d.counts.total) || 0;
  return `
    <div class="iv-hero">
      <div class="iv-emoji">🌿</div>
      <h1>Invita un <em>amico</em></h1>
      <p>Conosci qualcuno che merita cibo vero, dai produttori veri vicino a lui? Portalo dentro Gaia Food — è il regalo più semplice che puoi fargli.</p>
    </div>
    <button class="cu-share" type="button" data-cu-share>${Icon('share', { size: 18, color: '#fff' })} ${cfg.shareCta}</button>
    ${LINK_ROW}
    <div class="iv-steps">
      <div class="iv-step"><span class="iv-no">1</span><div><b>Condividi il tuo link</b><p>Su WhatsApp, nei messaggi, come preferisci.</p></div></div>
      <div class="iv-step"><span class="iv-no">2</span><div><b>Il tuo amico entra</b><p>Scopre i produttori veri più vicini a lui.</p></div></div>
      <div class="iv-step"><span class="iv-no">3</span><div><b>Mangiate meglio, insieme</b><p>Più siamo, più cresce il cibo vero sul territorio.</p></div></div>
    </div>
    ${total ? `<div class="iv-count">${Icon('sprout', { size: 15, color: 'var(--verde-deep)' })} <b>${total}</b> ${total === 1 ? 'amico è entrato' : 'amici sono entrati'} col tuo invito. Grazie di cuore.</div>` : ''}
    <div style="height:16px"></div>
  `;
}

/* ===== Vista CRUSCOTTO — "I Custodi di Gaia" (produttore) ===== */
function personRow(p) {
  const sub = p.state === 'radicato' ? 'Radicato · +€7,80/anno'
    : p.state === 'germoglio' ? 'Germoglio · in maturazione' : 'Seme · appena iscritto';
  return `<div class="cu-person"><span class="cu-av">${(p.name || '?')[0].toUpperCase()}</span>
    <div class="cu-pn"><b>${p.name}</b><span>${sub}</span></div>
    <span class="cu-state ${stCls[p.state]}">${SLAB[p.state]}</span></div>`;
}
function viewGarden(d, cfg) {
  const c = d.counts || { seme: 0, germoglio: 0, radicato: 0, total: 0 };
  const cur = d.level ? d.level.min : 0, nx = d.next ? d.next.min : c.radicato;
  const pct = d.next ? Math.max(4, Math.min(100, Math.round(((c.radicato - cur) / Math.max(1, nx - cur)) * 100))) : 100;
  const goalLine = d.next
    ? `Ancora <b style="color:var(--verde-deep)">${d.next.min - c.radicato} radicati</b> per <b>${d.next.label}</b> · commissione ricorrente finché restano attivi.`
    : `Livello massimo. La commissione è ricorrente finché restano attivi.`;
  return `
    <div class="cu-hero">
      <div class="cu-emoji">🌱</div>
      <h1>Il tuo giardino di Custode</h1>
      <p>Porta clienti e produttori in Gaia Food: per ogni abbonato attivo ricevi una commissione reale, ricorrente.</p>
      <span class="cu-lvl">${Icon('sprout', { size: 13, color: 'var(--verde-deep)' })} ${d.level ? d.level.label : 'Seme'}</span>
    </div>
    <div class="cu-garden">
      <div class="cu-plant"><div class="e">🌳</div><b>${c.radicato}</b><span>Radicati</span></div>
      <div class="cu-plant"><div class="e">🌿</div><b>${c.germoglio}</b><span>Germogli</span></div>
      <div class="cu-plant"><div class="e">🌱</div><b>${c.seme}</b><span>Semi</span></div>
    </div>
    <div class="cu-card">
      <div class="cu-creditrow">
        <div><div class="cu-eyebrow">Commissione maturata</div><div class="cu-credit">${eur(d.commission || 0)}</div></div>
        <div style="text-align:right"><div style="font-size:11px;color:var(--muted)">livello</div><b style="font-family:var(--serif);color:var(--ink)">${d.level ? d.level.label : 'Seme'}</b></div>
      </div>
      <div class="cu-bar"><i style="width:${pct}%"></i></div>
      <div class="cu-goal">${goalLine}</div>
    </div>
    <button class="cu-share" type="button" data-cu-share>${Icon('share', { size: 18, color: '#fff' })} ${cfg.shareCta}</button>
    ${LINK_ROW}
    <div class="cu-sec-t">Le tue persone</div>
    ${c.total ? `<div class="cu-people">${(d.people || []).map(personRow).join('')}</div>`
      : `<div class="cu-empty">Il tuo giardino è ancora pieno di terra buona. <b>Pianta il primo seme</b>: invita qualcuno e guardalo crescere.</div>`}
    <div style="height:16px"></div>
  `;
}

export function Custodi(mode = 'cliente') {
  const cfg = CFG[mode] || CFG.cliente;
  const render = mode === 'produttore' ? viewGarden : viewInvita;
  return {
    html: `<div class="screen no-nav custodi">
      <style>
      .custodi .scroll{ padding:0 16px 8px; }
      /* --- pagina semplice "Invita un amico" --- */
      .custodi .iv-hero{ text-align:center; padding:24px 10px 8px; }
      .custodi .iv-emoji{ font-size:54px; line-height:1; }
      .custodi .iv-hero h1{ font-family:var(--serif); font-size:30px; font-weight:600; color:var(--ink); margin-top:8px; letter-spacing:-.02em; }
      .custodi .iv-hero h1 em{ font-style:italic; color:var(--verde); }
      .custodi .iv-hero p{ font-size:14px; line-height:1.6; color:var(--muted); margin:10px auto 0; max-width:31ch; }
      .custodi .iv-steps{ margin-top:20px; display:flex; flex-direction:column; gap:13px; }
      .custodi .iv-step{ display:flex; gap:13px; align-items:flex-start; }
      .custodi .iv-no{ width:28px; height:28px; border-radius:50%; background:var(--verde-pale); color:var(--verde-deep); font-weight:700; font-size:13px; display:flex; align-items:center; justify-content:center; flex:none; }
      .custodi .iv-step b{ font-size:14.5px; color:var(--ink); }
      .custodi .iv-step p{ font-size:12.5px; color:var(--muted); margin-top:2px; line-height:1.45; }
      .custodi .iv-count{ margin-top:20px; text-align:center; font-size:13px; color:var(--muted); background:var(--verde-pale); border-radius:14px; padding:13px; }
      .custodi .iv-count b{ color:var(--verde-deep); }
      .custodi .iv-count svg{ display:inline-block; vertical-align:-2px; }
      /* --- cruscotto "Giardino" (produttore) --- */
      .custodi .cu-hero{ text-align:center; background:linear-gradient(160deg,#eaf6ee,#e3f0f6); border-radius:20px; padding:18px 18px 16px; margin-top:6px; }
      .custodi .cu-emoji{ font-size:40px; line-height:1; }
      .custodi .cu-hero h1{ font-family:var(--serif); font-size:24px; font-weight:600; color:var(--ink); margin-top:5px; }
      .custodi .cu-hero p{ font-size:12.5px; line-height:1.5; color:var(--muted); margin-top:5px; max-width:32ch; margin-left:auto; margin-right:auto; }
      .custodi .cu-lvl{ display:inline-flex; align-items:center; gap:6px; margin-top:11px; font-size:11.5px; font-weight:700; letter-spacing:.02em; color:var(--verde-deep); background:rgba(255,255,255,.7); border:1px solid var(--verde-pale); padding:5px 11px; border-radius:100px; }
      .custodi .cu-garden{ display:flex; justify-content:space-around; margin:16px 0 4px; }
      .custodi .cu-plant{ text-align:center; }
      .custodi .cu-plant .e{ font-size:30px; }
      .custodi .cu-plant b{ display:block; font-family:var(--serif); font-size:20px; font-weight:600; color:var(--ink); margin-top:1px; }
      .custodi .cu-plant span{ font-size:10.5px; color:var(--muted2); }
      .custodi .cu-card{ background:var(--bianco); border:1px solid var(--bd); border-radius:18px; padding:15px; box-shadow:var(--sh-card); margin-top:12px; }
      .custodi .cu-creditrow{ display:flex; align-items:flex-end; justify-content:space-between; }
      .custodi .cu-eyebrow{ font-size:10.5px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--verde-deep); }
      .custodi .cu-credit{ font-family:var(--serif); font-size:27px; font-weight:600; color:var(--verde-deep); line-height:1.1; }
      .custodi .cu-bar{ height:9px; border-radius:100px; background:var(--carta-scura); overflow:hidden; margin-top:9px; }
      .custodi .cu-bar i{ display:block; height:100%; border-radius:100px; background:var(--grad-azione); }
      .custodi .cu-goal{ font-size:12px; color:var(--muted); margin-top:8px; }
      .custodi .cu-sec-t{ font-family:var(--serif); font-size:16px; font-weight:600; color:var(--ink); margin:18px 2px 8px; }
      .custodi .cu-people{ background:var(--bianco); border:1px solid var(--bd); border-radius:16px; padding:4px 14px; box-shadow:var(--sh-card); }
      .custodi .cu-person{ display:flex; align-items:center; gap:11px; padding:11px 0; border-bottom:1px solid var(--bd2); }
      .custodi .cu-person:last-child{ border-bottom:none; }
      .custodi .cu-av{ width:36px; height:36px; border-radius:50%; background:var(--verde-pale); color:var(--verde-deep); display:flex; align-items:center; justify-content:center; font-weight:700; font-family:var(--serif); flex:none; }
      .custodi .cu-pn{ flex:1; } .custodi .cu-pn b{ font-size:14px; font-weight:600; color:var(--ink); display:block; } .custodi .cu-pn span{ font-size:11.5px; color:var(--muted); }
      .custodi .cu-state{ font-size:10px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; padding:3px 8px; border-radius:100px; flex:none; }
      .custodi .st-rad{ color:var(--verde-deep); background:var(--verde-pale); }
      .custodi .st-germ{ color:var(--terra-deep); background:var(--terra-pale); }
      .custodi .st-seme{ color:var(--muted2); background:var(--carta-scura); }
      .custodi .cu-empty{ background:var(--bianco); border:1px dashed var(--bd3); border-radius:16px; padding:16px; font-size:13.5px; line-height:1.55; color:var(--muted); }
      .custodi .cu-empty b{ color:var(--verde-deep); }
      /* --- comuni (share + link) --- */
      .custodi .cu-share{ width:100%; display:flex; align-items:center; justify-content:center; gap:9px; margin-top:16px;
        padding:15px; border-radius:15px; border:none; cursor:pointer; background:var(--grad-azione); color:#fff;
        font-family:var(--sans); font-size:15px; font-weight:600; box-shadow:0 12px 26px -12px rgba(22,163,74,.6); }
      .custodi .cu-share:active{ transform:translateY(1px); }
      .custodi .cu-link{ display:flex; align-items:center; gap:9px; margin-top:10px; background:var(--carta); border:1px dashed var(--bd3);
        border-radius:12px; padding:11px 13px; font-size:13px; color:var(--ink-soft); cursor:pointer; }
      .custodi .cu-link .lk{ flex:1; font-weight:600; color:var(--verde-deep); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .custodi .cu-link .cp{ font-size:11px; font-weight:700; color:var(--muted); letter-spacing:.04em; }
      .custodi .cu-load{ text-align:center; color:var(--muted); font-size:13.5px; padding:60px 20px; }
      </style>
      ${StatusBar()}
      <div class="toprow">
        <button class="iconbtn" data-back aria-label="Torna al profilo">${Icon('arrow-left', { size: 18 })}</button>
        <span class="loc" style="flex:1;justify-content:center">${Icon('sprout', { size: 17, color: 'var(--verde)' })}<b>${cfg.navTitle}</b></span>
        <span style="width:40px;flex:none"></span>
      </div>
      <div class="scroll" data-cu-root>
        <div class="cu-load">Un attimo…</div>
      </div>
    </div>`,
    onMount(el) {
      const back = el.querySelector('[data-back]'); if (back) back.onclick = () => { location.hash = '#/profilo'; };
      const root = el.querySelector('[data-cu-root]');
      const flash = (node, txt) => { const o = node.textContent; node.textContent = txt; setTimeout(() => { node.textContent = o; }, 1400); };
      const copy = (text, label) => {
        const done = () => label && flash(label, 'COPIATO ✓');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
        else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (_) {} ta.remove(); }
      };
      custodiMe().then(d => {
        root.innerHTML = render(d, cfg);
        const shareUrl = location.origin + location.pathname + '#/?seme=' + encodeURIComponent(d.seed || '');
        const linkText = root.querySelector('[data-cu-linktext]');
        if (linkText) linkText.textContent = (location.host || 'gaia.food') + '/…/' + (d.seed || '');
        const cplabel = root.querySelector('[data-cu-cplabel]');
        const shareBtn = root.querySelector('[data-cu-share]');
        if (shareBtn) shareBtn.onclick = async () => {
          if (navigator.share) { try { await navigator.share({ title: 'Gaia Food', text: cfg.shareMsg, url: shareUrl }); return; } catch (_) {} }
          copy(shareUrl, cplabel);
        };
        const linkEl = root.querySelector('[data-cu-copy]');
        if (linkEl) { const go = () => copy(shareUrl, cplabel); linkEl.onclick = go; linkEl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; }
      }).catch(err => {
        root.innerHTML = `<div class="cu-empty" style="margin-top:20px">Non riesco a caricare la pagina ora (${err.message || 'riprova'}). Controlla la connessione e riprova.</div>`;
      });
    },
  };
}
