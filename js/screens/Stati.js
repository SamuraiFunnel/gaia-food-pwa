import { Icon } from '../icons.js';
import { StatusBar, ProducerCard, VerifyBadge } from '../components.js';
import { getState, results } from '../store.js';

/**
 * Stati & errori — catalogo (libreria) di tutti gli stati vuoti/errore dell'app.
 * Pagina di review: NON è uno stato reale, mostra a sezioni i pattern così come
 * appaiono all'utente. Regola d'oro: ogni stato = causa + rimedio + uscita.
 * Mai una mappa/lista vuota nuda. no-nav, [data-back].
 */
export function Stati() {
  const s = getState();
  const zona = s.zone?.label || 'la tua zona';

  // produttore reale (più vicino) per illustrare l'offline "ultime schede + Salvati"
  const near = results()[0] || null;

  // ---- card stato generica: icona + titolo + spiegazione + azione ----
  // tone: terra | sand | celeste | verde | ink ; dashed: bordo tratteggiato
  const state = ({ icon, tone = 'terra', title, body, actions = [], dashed = false }) => `
    <article class="st-card${dashed ? ' dashed' : ''}${tone === 'ink' ? ' dark' : ''}">
      <div class="st-row">
        <span class="st-ic ${tone}">${Icon(icon, { size: 21, color: 'currentColor', stroke: 2 })}</span>
        <div class="st-tx">
          <h3 class="st-t">${title}</h3>
          <p class="st-b">${body}</p>
        </div>
      </div>
      ${actions.length ? `<div class="st-acts">${actions.map(a =>
        `<button class="st-act${a.primary ? ' primary' : ''}${a.ghost ? ' ghost' : ''}" type="button">${a.icon ? Icon(a.icon, { size: 15, color: 'currentColor', stroke: 2 }) : ''}${a.label}</button>`
      ).join('')}</div>` : ''}
    </article>`;

  // intestazione di sezione del catalogo
  const sec = (label) => `<div class="st-sec eyebrow">${label}</div>`;

  // ---- loading skeleton (barre grigie animate) ----
  const skeleton = `
    <article class="st-card">
      <div class="sk-row">
        <div class="sk sk-thumb"></div>
        <div class="sk-lines">
          <div class="sk sk-bar" style="width:72%"></div>
          <div class="sk sk-bar" style="width:46%"></div>
          <div class="sk sk-bar" style="width:34%;height:18px;border-radius:100px"></div>
        </div>
      </div>
      <div class="sk-row mt12">
        <div class="sk sk-thumb"></div>
        <div class="sk-lines">
          <div class="sk sk-bar" style="width:64%"></div>
          <div class="sk sk-bar" style="width:52%"></div>
        </div>
      </div>
      <p class="st-cap">Mostriamo lo scheletro mentre arrivano i produttori — mai una schermata bianca.</p>
    </article>`;

  // ---- offline: ultime schede salvate, mai mappa nuda ----
  const offline = `
    <article class="st-card dark">
      <div class="st-row">
        <span class="st-ic ink"><span class="st-wifi">${Icon('globe', { size: 21, color: '#fff', stroke: 2 })}</span></span>
        <div class="st-tx">
          <h3 class="st-t">Sei offline</h3>
          <p class="st-b">Niente connessione. Ti mostriamo le ultime schede viste e i tuoi Salvati, così non resti a mani vuote.</p>
        </div>
      </div>
      ${near ? `<div class="st-cache">${ProducerCard(near)}</div>` : ''}
      <div class="st-acts">
        <button class="st-act primary" type="button">${Icon('navigation', { size: 15, color: 'currentColor', stroke: 2 })} Riprova</button>
        <button class="st-act ghost light" type="button">${Icon('bookmark', { size: 15, color: 'currentColor', stroke: 2 })} Vai ai Salvati</button>
      </div>
    </article>`;

  // ---- badge: stati di verifica + "nessuna recensione = verificato" ----
  const badges = `
    <article class="st-card">
      <div class="st-badge-row">
        ${VerifyBadge({ state: 'valid', date: '12 giu' }, { compact: true })}
        ${VerifyBadge({ state: 'expiring', date: '30 giu' }, { compact: true })}
        ${VerifyBadge({ state: 'suspended' }, { compact: true })}
      </div>
      <p class="st-cap">In scadenza o sospesa: la scheda resta viva ma esce dai “verificati” nelle liste, mai cancellata di nascosto.</p>
    </article>
    <article class="st-card">
      <div class="st-row">
        <span class="st-ic verde">${Icon('check-circle', { size: 21, color: 'currentColor', stroke: 2 })}</span>
        <div class="st-tx">
          <h3 class="st-t">Ancora nessuna recensione</h3>
          <p class="st-b">Qui non contano le stelle: la fiducia è la <b>visita di persona</b>. Verificato sul campo il 12 giugno — la prova è la verifica.</p>
        </div>
      </div>
      <div class="st-acts">
        <button class="st-act ghost" type="button">${Icon('info', { size: 15, color: 'currentColor', stroke: 2 })} Come verifichiamo</button>
      </div>
    </article>`;

  const html = `
  <style>
    .st-intro{ padding:14px 22px 4px; }
    .st-sec{ padding:22px 22px 0; }
    .st-list{ display:flex; flex-direction:column; gap:12px; padding:12px 18px 0; }

    /* card stato */
    .st-card{ background:#fff; border:1px solid var(--bd); border-radius:var(--r-card);
      padding:16px; box-shadow:var(--sh-card); }
    .st-card.dashed{ border-style:dashed; border-color:var(--bd3); background:var(--bianco); }
    .st-card.dark{ background:var(--ink); border-color:var(--ink); }

    .st-row{ display:flex; gap:14px; align-items:flex-start; }
    .st-ic{ width:46px; height:46px; min-width:46px; flex:none; border-radius:13px;
      display:flex; align-items:center; justify-content:center; }
    .st-ic.terra{ background:var(--terra-pale); color:var(--terra-deep); }
    .st-ic.sand{ background:var(--carta-scura); color:var(--muted2); }
    .st-ic.celeste{ background:var(--celeste-pale); color:var(--celeste-deep); }
    .st-ic.verde{ background:var(--verde-pale); color:var(--verde-deep); }
    .st-ic.ink{ background:rgba(255,255,255,.12); color:#fff; }

    .st-tx{ flex:1; min-width:0; padding-top:1px; }
    .st-t{ font-family:var(--serif); font-size:16.5px; font-weight:600; color:var(--ink); line-height:1.25; }
    .st-b{ font-size:13px; line-height:1.55; color:var(--muted); margin-top:4px; }
    .st-b b{ color:var(--ink-soft); font-weight:600; }
    .st-card.dark .st-t{ color:#fff; }
    .st-card.dark .st-b{ color:rgba(255,255,255,.72); }
    .st-card.dark .st-b b{ color:#fff; }

    /* azioni: rimedio + uscita, sempre touch >=44px */
    .st-acts{ display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
    .st-act{ display:inline-flex; align-items:center; gap:6px; min-height:44px; padding:10px 15px;
      border-radius:var(--r-btn); font-family:var(--sans); font-size:13.5px; font-weight:600;
      background:#fff; border:1px solid var(--bd3); color:var(--ink); }
    .st-act svg{ flex:none; }
    .st-act.primary{ background:var(--grad-azione); border-color:transparent; color:#fff;
      box-shadow:0 8px 20px -10px rgba(22,163,74,.6); }
    .st-act.ghost{ background:var(--carta-scura); border-color:transparent; color:var(--ink-soft); }
    .st-act.ghost.light{ background:rgba(255,255,255,.14); color:#fff; }

    /* skeleton */
    .sk-row{ display:flex; gap:12px; align-items:center; }
    .sk-lines{ flex:1; display:flex; flex-direction:column; gap:8px; }
    .sk{ background:var(--carta-scura); border-radius:6px; position:relative; overflow:hidden; }
    .sk-thumb{ width:56px; height:56px; min-width:56px; border-radius:13px; }
    .sk-bar{ height:12px; }
    .sk::after{ content:''; position:absolute; inset:0;
      background:linear-gradient(90deg, transparent, rgba(255,255,255,.65), transparent);
      transform:translateX(-100%); animation:st-shimmer 1.4s ease-in-out infinite; }
    @keyframes st-shimmer{ 100%{ transform:translateX(100%); } }
    @media(prefers-reduced-motion:reduce){ .sk::after{ animation:none; opacity:.5; } }

    /* offline cache + badge */
    .st-cache{ margin-top:14px; }
    .st-cap{ font-size:12px; line-height:1.5; color:var(--faint); margin-top:12px; }
    .st-badge-row{ display:flex; flex-wrap:wrap; gap:8px; }

    .st-foot{ text-align:center; font-size:12.5px; color:var(--faint); padding:24px 22px 8px; }
  </style>
  <div class="screen no-nav">
    ${StatusBar()}
    <div class="toprow">
      <button class="iconbtn" data-back type="button" aria-label="Indietro">${Icon('arrow-left', { size: 19, stroke: 2 })}</button>
      <span class="loc"><b>Libreria stati</b></span>
      <span class="iconbtn" aria-hidden="true" style="background:none;border:none">${Icon('list', { size: 19, color: 'var(--muted2)' })}</span>
    </div>

    <div class="scroll">
      <div class="st-intro">
        <div class="eyebrow">Libreria</div>
        <h1 class="h1 mt8">Stati &amp; errori</h1>
        <p class="muted mt8" style="font-size:13.5px;line-height:1.55">Catalogo di review. Ogni stato dà sempre <b style="color:var(--ink-soft)">causa + rimedio + uscita</b> — mai una mappa o una lista vuota e nuda.</p>
      </div>

      ${sec('Caricamento')}
      <div class="st-list">${skeleton}</div>

      ${sec('Vicinanze · niente trovato')}
      <div class="st-list">
        ${state({
          icon: 'map-pin', tone: 'terra',
          title: 'Nessun produttore entro 15 km',
          body: `Hai cercato troppo stretto attorno a ${zona}. Allarga il raggio o togli i filtri.`,
          actions: [
            { label: 'Allarga a 30 km', icon: 'crosshair', primary: true },
            { label: 'Tutte le categorie', ghost: true },
            { label: 'Segnala un produttore', icon: 'message-circle' },
          ],
        })}
        ${state({
          icon: 'search', tone: 'sand',
          title: 'Nessun risultato per “latte”',
          body: 'Forse la categoria si chiama in un altro modo, o qui ancora non c’è. Prova una ricerca vicina o guarda le storie.',
          actions: [
            { label: 'Prova “formaggio”', icon: 'search', primary: true },
            { label: 'Pulisci la ricerca', ghost: true },
            { label: 'Guarda Cibo Vero', icon: 'play' },
          ],
        })}
      </div>

      ${sec('Zona · lancio in corso')}
      <div class="st-list">
        ${state({
          icon: 'bell', tone: 'celeste',
          title: 'Stiamo arrivando nella tua zona',
          body: 'Qui non abbiamo ancora verificato produttori. Lasciaci la zona: ti avvisiamo appena apriamo, niente mappa vuota nel frattempo.',
          actions: [
            { label: 'Avvisami quando arrivate', icon: 'bell', primary: true },
            { label: 'Scegli un’altra zona', icon: 'map-pin', ghost: true },
          ],
        })}
      </div>

      ${sec('Connessione')}
      <div class="st-list">${offline}</div>

      ${sec('Posizione')}
      <div class="st-list">
        ${state({
          icon: 'crosshair', tone: 'terra',
          title: 'Non riusciamo a trovarti',
          body: 'Il permesso di posizione è disattivato, così non sappiamo cosa ti è vicino. Riattivalo, oppure scegli la zona a mano.',
          actions: [
            { label: 'Attiva la posizione', icon: 'navigation', primary: true },
            { label: 'Scegli la zona a mano', icon: 'map-pin', ghost: true },
          ],
        })}
      </div>

      ${sec('Stagionalità')}
      <div class="st-list">
        ${state({
          icon: 'leaf', tone: 'terra',
          title: 'Di stagione, niente ora',
          body: 'Questo prodotto adesso non c’è: rispettiamo i tempi della terra. La scheda del produttore resta viva — tornano a settembre.',
          actions: [
            { label: 'Avvisami quando tornano', icon: 'bell', primary: true },
            { label: 'Vedi cosa c’è ora', icon: 'leaf', ghost: true },
          ],
        })}
      </div>

      ${sec('Verifica &amp; fiducia')}
      <div class="st-list">${badges}</div>

      <div class="st-foot">Libreria interna · pattern di stato dell’app Gaia Food</div>
      <div style="height:18px"></div>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
    // pagina di review: le azioni sono dimostrative, non navigano davvero
    el.querySelectorAll('.st-act').forEach(b => {
      b.addEventListener('click', () => { b.animate?.([{ opacity: 1 }, { opacity: .55 }, { opacity: 1 }], { duration: 240 }); });
    });
  }

  return { html, onMount };
}
