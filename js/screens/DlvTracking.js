import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';
import { t } from '../i18n.js';

/* ---------------- DlvTracking — Tracking del mezzo (#/consegna/tracking) ----------------
   Banner "anteprima": la consegna non è ancora attiva, questa è una previsione.
   RouteMap: tracciato con tappe (raccolto ✓ / in corso / casa) + icona mezzo lungo il
   percorso + ETA grande sopra la mappa. Timeline tappe sotto. CTA Avvisami / Torna alla home.
   Regole: niente prezzi, niente "gratis". Consegna = "in arrivo / anteprima". no-nav. */
export function DlvTracking() {
  // Rispetta prefers-reduced-motion: azzera gli <animate> SVG (dash rotta, ping nodo).
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Tappe del giro: il mezzo ritira dai produttori e porta tutto a casa.
  // state: done = raccolto, active = in corso, home = destinazione finale (casa tua).
  const stops = [
    { id: 'claudio', n: 1, name: 'Az. di Claudio', place: 'Villetta Barrea', state: 'done', at: '17:32' },
    { id: 'civitella', n: 2, name: 'Frantoio di Civitella', place: 'Civitella Alfedena', state: 'active', at: '~17:50' },
    { id: 'casa', n: 3, name: 'Casa tua', place: 'la tua consegna', state: 'home', at: '18:10' },
  ];

  const eta = '18:10';
  const done = stops.filter(s => s.state === 'done').length;
  const total = stops.length;
  // Progresso del mezzo sul tracciato (0..1): centra il furgone sulla tappa "in corso".
  const activeIdx = Math.max(0, stops.findIndex(s => s.state === 'active'));
  const progress = total > 1 ? activeIdx / (total - 1) : 0;

  // ---- RouteMap SVG: tracciato curvo, nodi tappa, furgone lungo il percorso ----
  // viewBox 320x180. Punti tappa distribuiti su una polilinea morbida.
  const pts = [
    { x: 42, y: 132 },
    { x: 160, y: 70 },
    { x: 278, y: 120 },
  ];
  const linePath = `M${pts[0].x},${pts[0].y} Q${(pts[0].x + pts[1].x) / 2},${pts[0].y - 34} ${pts[1].x},${pts[1].y} T${pts[2].x},${pts[2].y}`;
  // Posizione furgone: interpolazione semplice tra i punti lungo l'indice di progresso.
  const seg = progress * (pts.length - 1);
  const i0 = Math.min(pts.length - 2, Math.floor(seg));
  const t = seg - i0;
  const van = { x: pts[i0].x + (pts[i0 + 1].x - pts[i0].x) * t, y: pts[i0].y + (pts[i0 + 1].y - pts[i0].y) * t - 14 };

  const nodeFill = (s) => s.state === 'done' ? '#16A34A' : s.state === 'active' ? '#fff' : '#EDE6DA';
  const nodeStroke = (s) => s.state === 'active' ? '#16A34A' : s.state === 'home' ? '#ddd4c6' : '#16A34A';

  const mapNodes = stops.map((s, i) => {
    const p = pts[i];
    const inner = s.state === 'done'
      ? `<path d="M${p.x - 5},${p.y} l3.4,3.4 l6.6,-7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
      : s.state === 'active'
        ? `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#16A34A"/>`
        : `<path d="M${p.x - 5},${p.y + 1} l5,-5 l5,5 v5 a1,1 0 0 1 -1,1 h-8 a1,1 0 0 1 -1,-1 z" fill="none" stroke="#8a7d6c" stroke-width="1.8" stroke-linejoin="round"/>`;
    return `
      ${s.state === 'active' ? `<circle cx="${p.x}" cy="${p.y}" r="${reduceMotion ? 16 : 17}" fill="rgba(22,163,74,.12)" opacity="${reduceMotion ? '.4' : '1'}">${reduceMotion ? '' : `<animate attributeName="r" values="13;19;13" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".5;0;.5" dur="2.2s" repeatCount="indefinite"/>`}</circle>` : ''}
      <circle cx="${p.x}" cy="${p.y}" r="12" fill="${nodeFill(s)}" stroke="${nodeStroke(s)}" stroke-width="${s.state === 'active' ? 3 : s.state === 'home' ? 2 : 0}"/>
      ${inner}`;
  }).join('');

  const routeMap = `
    <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="tk-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#16A34A"/><stop offset="1" stop-color="#0EA5E9"/>
        </linearGradient>
      </defs>
      <!-- terreno -->
      <rect width="320" height="180" fill="#E7EEE4"/>
      <path d="M0,150 Q80,120 170,150 T320,140 V180 H0 Z" fill="#DCE7D6"/>
      <path d="M0,40 Q120,70 220,38 T320,52 V0 H0 Z" fill="#EEF3E9"/>
      <!-- tracciato (ombra + linea brand tratteggiata animata) -->
      <path d="${linePath}" fill="none" stroke="rgba(31,24,18,.10)" stroke-width="7" stroke-linecap="round"/>
      <path d="${linePath}" fill="none" stroke="url(#tk-line)" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 9">
        ${reduceMotion ? '' : '<animate attributeName="stroke-dashoffset" values="0;-44" dur="1.6s" repeatCount="indefinite"/>'}
      </path>
      ${mapNodes}
      <!-- furgone -->
      <g transform="translate(${van.x},${van.y})">
        <ellipse cx="0" cy="15" rx="13" ry="3.5" fill="rgba(31,24,18,.18)"/>
        <circle cx="0" cy="0" r="14" fill="#fff" stroke="#16A34A" stroke-width="2.4"/>
        <g transform="translate(-7.5,-7.5)">${Icon('truck', { size: 15, color: '#15803D', stroke: 2.1 })}</g>
      </g>
    </svg>`;

  const tlIcon = (s) => s.state === 'done'
    ? `<span class="tk-dot done">${Icon('check', { size: 15, color: '#fff', stroke: 2.6 })}</span>`
    : s.state === 'active'
      ? `<span class="tk-dot active"><span class="tk-pulse"></span></span>`
      : `<span class="tk-dot home">${Icon('home', { size: 14, color: 'var(--ink-soft)', stroke: 2.1 })}</span>`;

  const tlLabel = (s) => s.state === 'done'
    ? `<span class="tk-st done">${t('dlvTracking.stateDone')}</span>`
    : s.state === 'active'
      ? `<span class="tk-st active">${t('dlvTracking.stateActive')}</span>`
      : `<span class="tk-st home">${t('dlvTracking.stateHome')}</span>`;

  const timeline = stops.map((s, i) => `
    <div class="tk-step ${s.state}${i === stops.length - 1 ? ' last' : ''}">
      ${tlIcon(s)}
      <div class="tk-line-v" aria-hidden="true"></div>
      <div class="tk-body">
        <div class="tk-top">
          <div class="tk-name">${s.state === 'home' ? '' : `<span class="tk-n">${s.n}</span> `}${s.name}</div>
          <div class="tk-time tnum">${s.at}</div>
        </div>
        <div class="tk-meta">${s.place} · ${tlLabel(s)}</div>
      </div>
    </div>`).join('');

  const html = `
  <style>
    .tk-top-row{ display:flex; align-items:center; gap:12px; padding:6px 22px 0; }

    /* banner anteprima — consegna non ancora attiva */
    .tk-banner{ display:flex; align-items:flex-start; gap:11px; margin:14px 22px 0;
      background:var(--terra-pale); border:1px solid #ead9c2; border-radius:14px; padding:12px 14px; }
    .tk-banner svg{ flex:none; margin-top:1px; }
    .tk-banner span{ font-size:12.5px; line-height:1.45; color:var(--terra-deep); font-weight:500; }
    .tk-banner strong{ font-weight:700; }

    /* RouteMap */
    .tk-mapwrap{ position:relative; margin:16px 18px 0; height:196px; border-radius:var(--r-card);
      overflow:hidden; border:1px solid var(--bd2); box-shadow:var(--sh-card); }
    .tk-eta{ position:absolute; left:14px; bottom:14px; z-index:2; background:rgba(251,249,245,.94);
      backdrop-filter:blur(8px); border:1px solid var(--bd); border-radius:16px; padding:9px 14px 10px;
      box-shadow:var(--sh-card); }
    .tk-eta .lbl{ font-size:9.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:var(--muted2); }
    .tk-eta .val{ font-family:var(--serif); font-weight:600; font-size:30px; line-height:1; letter-spacing:-.02em;
      color:var(--ink); margin-top:2px; }
    .tk-eta .val span{ font-size:13px; font-weight:600; color:var(--muted); margin-left:4px; }
    .tk-prog{ position:absolute; right:14px; top:14px; z-index:2; display:inline-flex; align-items:center; gap:6px;
      background:rgba(251,249,245,.94); backdrop-filter:blur(8px); border:1px solid var(--bd);
      border-radius:var(--r-pill); padding:6px 11px; font-size:11.5px; font-weight:700; color:var(--verde-deep); }

    /* timeline */
    .tk-tappe-t{ margin-bottom:6px; }
    .tk-steps{ position:relative; }
    .tk-step{ position:relative; display:flex; gap:14px; padding-bottom:18px; }
    .tk-step.last{ padding-bottom:0; }
    .tk-dot{ position:relative; z-index:2; width:30px; height:30px; flex:none; border-radius:50%;
      display:flex; align-items:center; justify-content:center; }
    .tk-dot.done{ background:var(--verde); }
    .tk-dot.active{ background:#fff; border:3px solid var(--verde); }
    .tk-dot.home{ background:var(--carta-scura); border:2px solid var(--bd3); }
    .tk-pulse{ width:9px; height:9px; border-radius:50%; background:var(--verde); position:relative; }
    .tk-pulse::after{ content:''; position:absolute; inset:-7px; border-radius:50%;
      border:2px solid var(--verde); opacity:.45; animation:tkpulse 1.8s ease-out infinite; }
    @keyframes tkpulse{ 0%{ transform:scale(.5); opacity:.5 } 100%{ transform:scale(1.5); opacity:0 } }
    @media (prefers-reduced-motion: reduce){ .tk-pulse::after{ animation:none; opacity:.45; } }
    /* connettore verticale tra i nodi */
    .tk-line-v{ position:absolute; left:14px; top:30px; bottom:0; width:2px; background:var(--bd2); z-index:1; }
    .tk-step.last .tk-line-v{ display:none; }
    .tk-step.done .tk-line-v{ background:var(--verde); }
    .tk-body{ flex:1; min-width:0; padding-top:3px; }
    .tk-top{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
    .tk-name{ font-family:var(--serif); font-size:16px; font-weight:600; color:var(--ink); }
    .tk-n{ display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px;
      border-radius:50%; background:var(--carta-scura); font-family:var(--sans); font-size:11px; font-weight:700;
      color:var(--muted); margin-right:2px; vertical-align:1px; }
    .tk-step.home .tk-name{ color:var(--ink); }
    .tk-time{ font-size:13px; font-weight:600; color:var(--muted); flex:none; }
    .tk-step.active .tk-time{ color:var(--verde-deep); }
    .tk-meta{ font-size:12.5px; color:var(--muted2); margin-top:2px; }
    .tk-st{ font-weight:700; }
    .tk-st.done{ color:var(--verde-deep); }
    .tk-st.active{ color:var(--verde-deep); }
    .tk-st.home{ color:var(--terra-deep); }

    .tk-card{ background:#fff; border:1px solid var(--bd); border-radius:var(--r-card);
      box-shadow:var(--sh-card); padding:18px 16px; }
  </style>
  <div class="screen no-nav">
    ${StatusBar()}
    <div class="tk-top-row">
      <button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 22, stroke: 2.1 })}</button>
      <div>
        <h1 class="h1" style="margin:0">${t('dlvTracking.title')}</h1>
        <div class="muted" style="font-size:12.5px;margin-top:2px">${t('dlvTracking.subtitle')}</div>
      </div>
    </div>

    <div class="tk-banner">
      ${Icon('info', { size: 18, color: 'var(--terra-deep)', stroke: 2 })}
      <span>${t('dlvTracking.previewBanner')}</span>
    </div>

    <div class="scroll">
      <div class="tk-mapwrap">
        ${routeMap}
        <div class="tk-prog">${Icon('check-circle', { size: 14, color: 'var(--verde)', stroke: 2.2 })} ${t('dlvTracking.stops', { done, total })}</div>
        <div class="tk-eta">
          <div class="lbl">${t('dlvTracking.eta')}</div>
          <div class="val tnum">${eta}<span>${t('dlvTracking.today')}</span></div>
        </div>
      </div>

      <div class="pad mt22">
        <div class="eyebrow tk-tappe-t">${t('dlvTracking.stopsTitle')}</div>
        <div class="tk-card">
          <div class="tk-steps">
            ${timeline}
          </div>
        </div>
      </div>

      <div class="pad gap8 mt22" style="padding-bottom:26px">
        <button class="btn btn-grad btn-block" data-notify>
          ${Icon('bell', { size: 18, color: '#fff', stroke: 2 })} ${t('dlvTracking.notify')}
        </button>
        <button class="btn btn-outline btn-block" data-home>
          ${Icon('home', { size: 18, color: 'var(--ink)', stroke: 2 })} ${t('dlvTracking.backHome')}
        </button>
      </div>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
    const home = el.querySelector('[data-home]'); if (home) home.onclick = () => { location.hash = '#/home'; };

    // Avvisami: conferma in-loco (causa risolta), mai stato muto.
    const notify = el.querySelector('[data-notify]');
    if (notify) notify.onclick = () => {
      notify.disabled = true;
      notify.style.opacity = '.85';
      notify.innerHTML = `${Icon('check-circle', { size: 18, color: '#fff', stroke: 2.2 })} ${t('dlvTracking.notifyDone')}`;
    };
  }

  return { html, onMount };
}
