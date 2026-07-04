import { Icon } from '../icons.js';
import { StatusBar, Photo, VerifyBadge } from '../components.js';
import { results } from '../store.js';
import { t } from '../i18n.js';

const km = n => String(n).replace('.', ',');

// data verifica compatta: "12 giugno 2026" -> "12 giu"
const MESI = { gennaio: 'gen', febbraio: 'feb', marzo: 'mar', aprile: 'apr', maggio: 'mag', giugno: 'giu', luglio: 'lug', agosto: 'ago', settembre: 'set', ottobre: 'ott', novembre: 'nov', dicembre: 'dic' };
const shortDate = (d = '') => {
  const [g, m] = d.split(' ');
  return m ? `${g} ${MESI[m] || m.slice(0, 3)}` : d;
};

// nome breve del produttore per la riga meta della card (evita "Az. Agricola di …")
const shortName = (name = '') => name.replace(/^Az\.\s*Agricola\s*di\s*/i, '').trim() || name;

/**
 * Consegna · Scegli (layer DLV) — passo 1 di 2.
 * Funzione "in arrivo": banner in alto + nessun prezzo, nessun pagamento.
 * L'utente sceglie 1 dei 4 alimenti (latte/uova/olio/grano); per ognuno
 * mostriamo il produttore VERIFICATO più vicino, ricavato dai dati reali.
 * CTA "Continua" -> #/consegna/carrello.
 */
export function DlvScegli() {
  // alimenti del passo, con tono foto coerente
  const FOOD = [
    { cat: 'latte', label: 'Latte', tone: 'latte', title: 'Latte crudo' },
    { cat: 'uova', label: 'Uova', tone: 'uova', title: 'Uova di giornata' },
    { cat: 'olio', label: 'Olio', tone: 'olio', title: 'Extravergine' },
    { cat: 'grano', label: 'Grano', tone: 'grano', title: 'Farina di grano' },
  ];

  // per ogni alimento, il produttore più vicino (results() è già ordinato per km).
  const ordered = results();
  const options = FOOD.map(f => {
    const p = ordered.find(pr => pr.categories.includes(f.cat)) || null;
    return { ...f, p };
  }).filter(o => o.p); // teniamo solo gli alimenti che hanno davvero un produttore in zona

  // stato locale: indice selezionato (default = primo disponibile)
  let selected = 0;

  // --- helper render ---------------------------------------------------------
  const optCard = (o, i) => {
    const on = i === selected;
    return `
    <button class="dl-card${on ? ' on' : ''}" data-opt="${i}" role="radio"
      aria-checked="${on}" aria-label="${t('dlvScegli.optAria', { title: o.title, name: shortName(o.p.name), km: km(o.p.km) })}">
      <span class="dl-poster">
        ${Photo(o.tone, '', 'dl-photo')}
        <span class="dl-tag">${o.label}</span>
        <span class="dl-check" aria-hidden="true">${Icon('check', { size: 15, color: '#fff', stroke: 2.8 })}</span>
      </span>
      <span class="dl-body">
        <span class="dl-title serif">${o.title}</span>
        <span class="dl-meta">${shortName(o.p.name)} · <b class="tnum">${km(o.p.km)} km</b></span>
      </span>
    </button>`;
  };

  // riepilogo produttore della scelta corrente (perno fiducia = VerifyBadge)
  const summaryHtml = (o) => {
    const vShort = { ...o.p.verify, date: shortDate(o.p.verify.date) };
    return `
      <span class="dl-sm-ph">${Photo(o.p.tone, '', '')}</span>
      <span class="dl-sm-body">
        <span class="dl-sm-name">${o.p.name}</span>
        <span class="dl-sm-badge">${VerifyBadge(vShort, { compact: true })}</span>
      </span>`;
  };

  // stato vuoto (causa + rimedio + uscita) se nessun alimento ha un produttore
  const emptyHtml = `
    <div class="dl-empty">
      ${Icon('truck', { size: 40, color: 'var(--faint)' })}
      <div class="dl-empty-t serif">${t('dlvScegli.emptyTitle')}</div>
      <p class="muted">${t('dlvScegli.emptyBody')}</p>
      <a class="btn btn-grad btn-block mt12" href="#/home" data-link>
        ${Icon('map-pin', { size: 17, color: '#fff' })} ${t('dlvScegli.emptyCta')}</a>
    </div>`;

  const hasOptions = options.length > 0;

  const html = `
  <style>
    /* banner "funzione in arrivo" — non è un costo, è uno stato */
    .dl-soon{ display:flex; align-items:center; gap:9px; background:var(--terra-pale);
      border:1px solid var(--bd2); border-radius:14px; padding:11px 14px; }
    .dl-soon .dl-soon-ic{ flex:none; width:30px; height:30px; border-radius:9px; background:#fff;
      display:flex; align-items:center; justify-content:center; }
    .dl-soon b{ color:var(--ink); font-weight:700; }
    .dl-soon-tx{ font-size:12.5px; line-height:1.4; color:var(--ink-soft); }

    .dl-step{ display:inline-flex; align-items:center; font-size:11px; font-weight:700; letter-spacing:.12em;
      text-transform:uppercase; color:var(--celeste-deep); background:var(--celeste-pale);
      padding:6px 12px; border-radius:var(--r-pill); }

    /* griglia alimenti 2x2 */
    .dl-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .dl-card{ display:block; text-align:left; background:#fff; border:1px solid var(--bd);
      border-radius:18px; overflow:hidden; box-shadow:var(--sh-card); font-family:inherit;
      transition:border-color .12s ease, box-shadow .12s ease; }
    .dl-card.on{ border:2px solid var(--verde); box-shadow:0 0 0 4px rgba(22,163,74,.10), var(--sh-card); }
    .dl-poster{ position:relative; display:block; height:104px; }
    .dl-poster .dl-photo{ position:absolute; inset:0; height:100%; }
    .dl-tag{ position:absolute; top:8px; left:8px; font-size:10px; font-weight:700; letter-spacing:.06em;
      text-transform:uppercase; color:var(--ink); background:rgba(255,255,255,.92); backdrop-filter:blur(3px);
      padding:3px 9px; border-radius:var(--r-pill); }
    .dl-check{ position:absolute; top:8px; right:8px; width:24px; height:24px; border-radius:50%;
      background:var(--verde); display:none; align-items:center; justify-content:center;
      box-shadow:0 2px 6px rgba(22,163,74,.45); }
    .dl-card.on .dl-check{ display:flex; }
    .dl-card.on .dl-tag{ background:var(--verde); color:#fff; }
    .dl-body{ display:block; padding:11px 13px 13px; }
    .dl-title{ display:block; font-size:15px; font-weight:600; color:var(--ink); line-height:1.15; }
    .dl-meta{ display:block; font-size:12px; color:var(--muted2); margin-top:3px; }
    .dl-meta b{ color:var(--terra-deep); font-weight:700; }

    /* riepilogo produttore scelto */
    .dl-summary{ display:flex; align-items:center; gap:12px; background:#fff; border:1px solid var(--bd);
      border-radius:16px; padding:12px 14px; box-shadow:var(--sh-card); }
    .dl-sm-ph{ flex:none; width:44px; height:44px; border-radius:12px; overflow:hidden; }
    .dl-sm-ph .photo{ width:44px; height:44px; height:100%; }
    .dl-sm-body{ flex:1; min-width:0; display:block; }
    .dl-sm-name{ display:block; font-size:14px; font-weight:600; color:var(--ink); }
    .dl-sm-badge{ display:block; margin-top:4px; }

    /* stato vuoto */
    .dl-empty{ text-align:center; padding:40px 8px 16px; display:flex; flex-direction:column; align-items:center; gap:8px; }
    .dl-empty-t{ font-size:19px; font-weight:600; color:var(--ink); margin-top:8px; }
    .dl-empty p{ font-size:13.5px; line-height:1.6; max-width:300px; }

    /* CTA sticky scura, coerente col mock */
    .dl-foot{ margin-top:auto; border-top:1px solid var(--bd2); background:var(--bianco);
      padding:16px 22px calc(20px + env(safe-area-inset-bottom)); }
    .dl-continua{ width:100%; min-height:56px; border-radius:17px; background:var(--ink); color:#fff;
      font-family:var(--sans); font-size:16px; font-weight:600; display:flex; align-items:center;
      justify-content:center; gap:8px; }
    .dl-continua svg{ flex:none; }
    .dl-foot-note{ text-align:center; font-size:12px; color:var(--faint); margin-top:11px; }
  </style>
  <div class="screen no-nav">
    ${StatusBar()}
    <div class="toprow">
      <button class="iconbtn" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 18 })}</button>
      <span class="dl-step">${t('dlvScegli.step')}</span>
      <span style="width:42px"></span>
    </div>
    <div class="scroll">
      <div class="pad mt8">
        <div class="dl-soon" role="note">
          <span class="dl-soon-ic">${Icon('truck', { size: 17, color: 'var(--terra-deep)', stroke: 1.9 })}</span>
          <span class="dl-soon-tx">${t('dlvScegli.soonBanner')}</span>
        </div>
      </div>

      <div class="pad mt16">
        <h1 class="h1">${t('dlvScegli.title', { n: options.length || 4 })}</h1>
        <p class="muted mt8" style="font-size:14.5px;line-height:1.5;color:var(--ink-soft)">
          ${t('dlvScegli.subtitle')}</p>
      </div>

      ${hasOptions ? `
      <div class="pad mt16">
        <div class="dl-grid" id="dl-grid" role="radiogroup" aria-label="${t('dlvScegli.foodGroupAria')}">
          ${options.map(optCard).join('')}
        </div>
      </div>

      <div class="pad mt16">
        <div class="eyebrow" style="margin-bottom:10px">${t('dlvScegli.pickupFrom')}</div>
        <div class="dl-summary" id="dl-summary">${summaryHtml(options[selected])}</div>
      </div>
      ` : `<div class="pad mt16">${emptyHtml}</div>`}

      <div style="height:16px"></div>
    </div>
    ${hasOptions ? `
    <div class="dl-foot">
      <button class="dl-continua" id="dl-continua">
        ${t('dlvScegli.continue')} ${Icon('chevron-right', { size: 18, color: '#fff', stroke: 2.3 })}
      </button>
      <div class="dl-foot-note">${t('dlvScegli.footNote')}</div>
    </div>` : ''}
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
    if (!hasOptions) return;

    const grid = el.querySelector('#dl-grid');
    const summary = el.querySelector('#dl-summary');

    grid.onclick = (e) => {
      const b = e.target.closest('[data-opt]');
      if (!b) return;
      selected = +b.dataset.opt;
      grid.querySelectorAll('.dl-card').forEach((c, i) => {
        const on = i === selected;
        c.classList.toggle('on', on);
        c.setAttribute('aria-checked', String(on));
      });
      summary.innerHTML = summaryHtml(options[selected]);
    };

    el.querySelector('#dl-continua').onclick = () => { location.hash = '#/consegna/carrello'; };
  }

  return { html, onMount };
}
