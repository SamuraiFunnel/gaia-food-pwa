import { Icon } from '../icons.js';
import { StatusBar, VerifyBadge } from '../components.js';
import { getState, fetchCandidature } from '../store.js';

/* ---------------- SASHA · CODA VERIFICHE (#/sasha) ----------------
   Back-office del verificatore (Sasha). Più sobrio, stesso brand.
   Tre tab: Da fare / In scadenza / Verificati.
   - righe candidature/produttori tappabili -> #/sasha/verifica
   - card "in scadenza · ri-ispezione" -> "Pianifica ispezione" #/sasha/pianifica
   Stati vuoti = causa + rimedio + uscita (mai vuoto nudo).
   Niente prezzi / niente "gratis": è back-office, non UI utente.
   "Da fare" = candidature REALI dal backend (/api/candidature, solo staff). */

// data ISO -> "18 giu" (giorno + mese abbreviato in italiano)
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
function shortDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getDate()} ${MESI[d.getMonth()]}`;
}
function catNames(ids) {
  const cats = getState().categories || [];
  return (ids || []).map(id => (cats.find(c => c.id === id) || {}).label || id).join(', ');
}
// Escape: nome/luogo/categorie arrivano dal form candidatura PUBBLICO → mai iniettare HTML grezzo.
const esc = s => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const EXPIRING = [
  { id: 'caseificio-borgo', name: 'Caseificio del Borgo', place: 'Opi', last: '28 mar' },
  { id: 'frantoio-sangro', name: 'Frantoio del Sangro', place: 'Villetta Barrea', last: '02 apr' },
];

const DONE = [
  { id: 'malga-camosciara', name: 'Malga Camosciara', place: 'Civitella Alfedena', date: '14 mag' },
  { id: 'orto-valle', name: "L'Orto della Valle", place: 'Opi', date: '06 mag' },
  { id: 'cantina-alta', name: 'Cantina dell\'Alta Valle', place: 'Villetta Barrea', date: '21 apr' },
];

// Markup del contenuto del tab "Da fare" a partire dalla lista candidature.
function todoPaneInner(list) {
  if (!list.length) return emptyState({
    icon: 'check-circle',
    t: 'Nessuna verifica in coda',
    p: 'Quando un produttore si candida lo trovi qui. Nel frattempo controlla chi è in scadenza per non perdere i bollini.',
    tab: 'expiring', cta: 'Vai a In scadenza',
  });
  return `
    <div class="sk-group">
      <div class="sk-group-t">Da verificare</div>
      <div class="sk-list">
        ${list.map(p => `
          <button class="sk-row" data-go-verifica="${esc(p.id)}">
            <span class="sk-dot todo"></span>
            <span class="sk-row-b">
              <span class="sk-row-name">${esc(p.name) || 'Senza nome'}</span>
              <span class="sk-row-meta">${[esc(p.place), esc(catNames(p.categories))].filter(Boolean).join(' · ')}${p.ts ? ` · cand. <span class="tnum">${shortDate(p.ts)}</span>` : ''}</span>
            </span>
            ${Icon('chevron-right', { size: 20, color: 'var(--faint2)', stroke: 2 })}
          </button>`).join('')}
      </div>
    </div>`;
}

export function SashaCoda() {
  const html = `
  <style>
    .sk-head{ display:flex; align-items:center; justify-content:space-between; padding:10px 22px 0; }
    .sk-eyebrow{ font-size:10.5px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:var(--terra-deep); }
    .sk-h1{ margin:5px 0 0; font-family:var(--serif); font-weight:600; font-size:27px; letter-spacing:-.02em; color:var(--ink); }
    .sk-user{ display:flex; align-items:center; gap:8px; background:#fff; border:1px solid var(--bd3);
      border-radius:var(--r-pill); padding:5px 12px 5px 5px; }
    .sk-ava{ width:28px; height:28px; border-radius:50%; background:var(--grad-terra); flex:none;
      display:flex; align-items:center; justify-content:center; color:#fff; font-family:var(--serif); font-size:14px; font-weight:600; }
    .sk-user span{ font-size:13px; font-weight:600; color:var(--ink); }

    .sk-tabs{ display:flex; gap:8px; padding:18px 22px 0; overflow-x:auto; }
    .sk-tab{ flex:none; border:1px solid var(--bd3); background:#fff; color:var(--ink-soft);
      padding:9px 15px; border-radius:var(--r-pill); font-size:13px; font-weight:600; cursor:pointer; line-height:1; min-height:34px; }
    .sk-tab.active{ background:var(--ink); border-color:var(--ink); color:#fff; }
    .sk-tab .sk-n{ font-variant-numeric:tabular-nums; }

    .sk-group{ padding:22px 18px 0; }
    .sk-group-t{ font-size:10.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
      color:var(--muted2); padding:0 4px 11px; }
    .sk-list{ display:flex; flex-direction:column; gap:10px; }

    .sk-row{ display:flex; align-items:center; gap:13px; width:100%; text-align:left;
      background:#fff; border:1px solid var(--bd); border-radius:16px; padding:14px 15px; cursor:pointer; }
    .sk-dot{ width:10px; height:10px; border-radius:50%; flex:none; }
    .sk-dot.todo{ background:var(--verde); }
    .sk-dot.done{ background:var(--faint2); }
    .sk-row-b{ flex:1; min-width:0; }
    .sk-row-name{ font-family:var(--serif); font-size:16px; font-weight:600; color:var(--ink); }
    .sk-row-meta{ font-size:12.5px; color:var(--muted2); margin-top:2px; }
    .sk-row-meta .tnum{ font-variant-numeric:tabular-nums; }

    .sk-card{ background:#fff; border:1px solid var(--bd); border-radius:16px; padding:15px 16px; }
    .sk-card-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .sk-card-name{ font-family:var(--serif); font-size:16px; font-weight:600; color:var(--ink); }
    .sk-card-meta{ font-size:12.5px; color:var(--muted2); margin-top:2px; }
    .sk-plan{ width:100%; min-height:46px; margin-top:13px; border:none; border-radius:13px;
      background:var(--ink); color:#fff; font-family:var(--sans); font-size:14px; font-weight:600; cursor:pointer;
      display:flex; align-items:center; justify-content:center; gap:8px; }

    .sk-empty{ text-align:center; padding:34px 18px; margin:8px 6px 0; }
    .sk-empty-ic{ width:58px; height:58px; border-radius:50%; margin:0 auto; background:var(--carta-scura);
      display:flex; align-items:center; justify-content:center; }
    .sk-empty-t{ font-family:var(--serif); font-size:18px; font-weight:600; color:var(--ink); margin:14px 0 6px; }
    .sk-empty p{ font-size:13.5px; line-height:1.6; color:var(--muted); margin:0 auto; max-width:280px; }
    .sk-pane{ display:none; }
    .sk-pane.show{ display:block; }
  </style>
  <div class="screen no-nav">
    ${StatusBar()}

    <div class="sk-head">
      <div>
        <div class="sk-eyebrow">Back-office · verificatore</div>
        <h1 class="sk-h1">Coda verifiche</h1>
      </div>
      <button class="sk-user" data-back aria-label="Esci dal back-office">
        <span class="sk-ava">S</span>
        <span>Tecnologo alimentare</span>
      </button>
    </div>

    <div class="sk-tabs" role="tablist">
      <button class="sk-tab active" data-tab="todo" role="tab" aria-selected="true">Da fare · <span class="sk-n" id="sk-todo-n">·</span></button>
      <button class="sk-tab" data-tab="expiring" role="tab" aria-selected="false">In scadenza · <span class="sk-n">${EXPIRING.length}</span></button>
      <button class="sk-tab" data-tab="done" role="tab" aria-selected="false">Verificati</button>
    </div>

    <div class="scroll">

      <!-- DA FARE (candidature reali, caricate al mount) -->
      <div class="sk-pane show" data-pane="todo">
        <div id="sk-todo"><div class="sk-group"><div class="sk-group-t">Caricamento…</div></div></div>
        <div style="height:24px"></div>
      </div>

      <!-- IN SCADENZA -->
      <div class="sk-pane" data-pane="expiring">
        ${EXPIRING.length ? `
        <div class="sk-group">
          <div class="sk-group-t">In scadenza · ri-ispezione</div>
          <div class="sk-list">
            ${EXPIRING.map(p => `
              <div class="sk-card">
                <div class="sk-card-top">
                  <div>
                    <div class="sk-card-name">${esc(p.name)}</div>
                    <div class="sk-card-meta">${esc(p.place)} · verificato <span class="tnum">${p.last}</span></div>
                  </div>
                  ${VerifyBadge({ state: 'expiring' }, { compact: true })}
                </div>
                <button class="sk-plan" data-go-pianifica="${p.id}">
                  ${Icon('calendar', { size: 17, color: '#fff', stroke: 2 })} Pianifica ispezione
                </button>
              </div>`).join('')}
          </div>
        </div>` : emptyState({
          icon: 'check-circle',
          t: 'Tutto in regola',
          p: 'Nessun bollino in scadenza adesso. I produttori restano verificati: ti avvisiamo quando si avvicina una ri-ispezione.',
          tab: 'todo', cta: 'Vai a Da fare',
        })}
        <div style="height:24px"></div>
      </div>

      <!-- VERIFICATI -->
      <div class="sk-pane" data-pane="done">
        ${DONE.length ? `
        <div class="sk-group">
          <div class="sk-group-t">Verificati sul campo</div>
          <div class="sk-list">
            ${DONE.map(p => `
              <button class="sk-row" data-go-verifica="${p.id}">
                <span class="sk-dot done"></span>
                <span class="sk-row-b">
                  <span class="sk-row-name">${esc(p.name)}</span>
                  <span class="sk-row-meta">${esc(p.place)} · verificato <span class="tnum">${p.date}</span></span>
                </span>
                ${Icon('chevron-right', { size: 20, color: 'var(--faint2)', stroke: 2 })}
              </button>`).join('')}
          </div>
        </div>` : emptyState({
          icon: 'check-circle',
          t: 'Ancora nessun verificato',
          p: 'Appena chiudi una verifica sul campo il produttore compare qui col suo bollino e la data.',
          tab: 'todo', cta: 'Vai a Da fare',
        })}
        <div style="height:24px"></div>
      </div>

    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]');
    if (back) back.onclick = () => history.back();

    const tabs = [...el.querySelectorAll('[data-tab]')];
    const panes = [...el.querySelectorAll('[data-pane]')];
    const select = (name) => {
      tabs.forEach(t => {
        const on = t.dataset.tab === name;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panes.forEach(p => p.classList.toggle('show', p.dataset.pane === name));
      const sc = el.querySelector('.scroll');
      if (sc) sc.scrollTop = 0;
    };
    tabs.forEach(t => { t.onclick = () => select(t.dataset.tab); });

    // (ri)lega le righe/CTA tappabili — richiamata dopo l'injection delle candidature
    const bindActions = () => {
      el.querySelectorAll('[data-go-verifica]').forEach(r => {
        r.onclick = () => { location.hash = '#/sasha/verifica'; };
      });
      el.querySelectorAll('[data-go-pianifica]').forEach(b => {
        b.onclick = () => { location.hash = '#/sasha/pianifica'; };
      });
      el.querySelectorAll('[data-empty-tab]').forEach(b => {
        b.onclick = () => select(b.dataset.emptyTab);
      });
    };
    bindActions();

    // carica le candidature reali nel tab "Da fare"
    const todoHost = el.querySelector('#sk-todo');
    const todoN = el.querySelector('#sk-todo-n');
    fetchCandidature()
      .then(list => {
        const open = (list || []).filter(c => c.state !== 'done');
        if (todoN) todoN.textContent = String(open.length);
        if (todoHost) todoHost.innerHTML = todoPaneInner(open);
        bindActions();
      })
      .catch(() => {
        if (todoN) todoN.textContent = '–';
        if (todoHost) todoHost.innerHTML = emptyState({
          icon: 'lock',
          t: 'Coda non disponibile',
          p: 'Accedi come verificatore per vedere le candidature in arrivo. Se il problema resta, controlla la connessione.',
          tab: 'expiring', cta: 'Vai a In scadenza',
        });
        bindActions();
      });
  }

  return { html, onMount };
}

// Stato vuoto riusabile: causa + rimedio + uscita.
function emptyState({ icon, t, p, tab, cta }) {
  return `
    <div class="sk-empty">
      <div class="sk-empty-ic">${Icon(icon, { size: 26, color: 'var(--faint)', stroke: 1.8 })}</div>
      <div class="sk-empty-t">${t}</div>
      <p>${p}</p>
      <button class="btn btn-outline btn-block mt16" data-empty-tab="${tab}">${cta}</button>
    </div>`;
}
