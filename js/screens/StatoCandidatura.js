import { Icon } from '../icons.js';
import { StatusBar, VerifyBadge } from '../components.js';
import { openContact } from '../screens.js';
import { getState, lastCandidatura } from '../store.js';

export function StatoCandidatura() {
  // Dati della candidatura realmente inviata (salvata da submitCandidatura).
  // Se l'utente arriva qui senza aver inviato nulla, mostriamo etichette neutre.
  const sub = lastCandidatura();
  const cats = getState().categories || [];
  const catLabel = id => (cats.find(c => c.id === id) || {}).label || id;
  const cand = {
    azienda: (sub && sub.name) || 'La tua azienda',
    luogo: (sub && sub.place) || 'Da definire',
    categorie: (sub && Array.isArray(sub.categories) && sub.categories.length)
      ? sub.categories.map(catLabel).join(', ')
      : 'Da definire',
  };

  // Timeline: lo stato corrente e' "visita in programma" (step 2 attivo).
  const STEPS = [
    {
      state: 'done',
      t: 'Candidatura ricevuta',
      meta: 'Abbiamo i tuoi dati e le foto',
    },
    {
      state: 'active',
      t: 'Visita del tecnologo alimentare in programma',
      meta: 'Il tecnologo alimentare verifica di persona, sul campo',
      when: '~ settimana del 30 giu',
    },
    {
      state: 'todo',
      t: 'Pubblicazione col bollino',
      meta: 'Online con "Verificato sul campo" e la data',
    },
  ];

  const html = `
  <style>
    .stc-card{ background:var(--terra-pale); border:1px solid var(--bd); border-radius:var(--r-card);
      padding:18px 20px; }
    .stc-azienda{ font-family:var(--serif); font-size:20px; font-weight:600; color:var(--ink); margin-top:13px;
      line-height:1.15; }
    .stc-sub{ font-size:13px; color:var(--muted); margin-top:4px; line-height:1.4; }

    .stc-tl{ position:relative; padding-left:34px; }
    .stc-tl::before{ content:""; position:absolute; left:11px; top:8px; bottom:14px; width:2px;
      background:var(--bd2); }
    .stc-step{ position:relative; padding-bottom:24px; }
    .stc-step:last-child{ padding-bottom:0; }
    .stc-dot{ position:absolute; left:-34px; top:0; width:24px; height:24px; border-radius:50%;
      display:flex; align-items:center; justify-content:center; }
    .stc-dot.done{ background:var(--verde); }
    .stc-dot.active{ background:#fff; border:3px solid var(--verde); }
    .stc-dot.active span{ width:8px; height:8px; border-radius:50%; background:var(--verde); }
    .stc-dot.todo{ background:var(--carta-scura); border:2px solid var(--bd3); }
    .stc-step-t{ font-size:15px; font-weight:600; color:var(--ink); line-height:1.25; }
    .stc-step.todo .stc-step-t{ color:var(--faint); }
    .stc-step-meta{ font-size:13px; color:var(--muted); margin-top:2px; line-height:1.4; }
    .stc-step.active .stc-step-meta{ color:var(--terra-deep); font-weight:500; }
    .stc-step-when{ display:inline-flex; align-items:center; gap:6px; margin-top:8px; padding:5px 11px;
      background:var(--terra-pale); border:1px solid var(--bd); border-radius:var(--r-pill);
      font-size:12.5px; color:var(--terra-deep); line-height:1; }
    .stc-step-when svg{ flex:none; }
    .stc-step-when b{ font-weight:700; color:var(--ink-soft); font-variant-numeric:tabular-nums; }

    .stc-note{ background:#fff; border:1px solid var(--bd); border-radius:var(--r-btn);
      padding:16px 18px; }
    .stc-note p{ margin:7px 0 0; font-size:14px; line-height:1.55; color:var(--ink-soft); }

    .stc-cta{ display:flex; flex-direction:column; gap:10px; padding:18px 22px 26px; }
    .stc-withdraw{ width:100%; min-height:44px; border:none; background:transparent; color:var(--faint);
      font-family:var(--sans); font-size:13.5px; font-weight:600; cursor:pointer; }
  </style>
  <div class="screen no-nav">
    ${StatusBar()}

    <div class="toprow">
      <button class="iconbtn" data-back aria-label="Indietro">
        ${Icon('arrow-left', { size: 21, color: 'var(--ink)', stroke: 2.1 })}
      </button>
      <h1 class="h2" style="flex:1;text-align:left;">La tua candidatura</h1>
    </div>

    <div class="scroll">
      <div class="pad mt8">
        <div class="stc-card">
          ${VerifyBadge({ state: 'expiring', date: '' }, { compact: true })}
          <div class="stc-azienda">${cand.azienda}</div>
          <div class="stc-sub">${cand.luogo} · ${cand.categorie}</div>
        </div>
      </div>

      <div class="pad mt22">
        <div class="eyebrow" style="margin-bottom:16px;">Timeline</div>
        <div class="stc-tl">
          ${STEPS.map(s => `
            <div class="stc-step ${s.state}">
              <div class="stc-dot ${s.state}">
                ${s.state === 'done' ? Icon('check', { size: 15, color: '#fff', stroke: 2.6 })
                  : s.state === 'active' ? '<span></span>' : ''}
              </div>
              <div class="stc-step-t">${s.t}</div>
              <div class="stc-step-meta">${s.meta}</div>
              ${s.when ? `<div class="stc-step-when">${Icon('calendar', { size: 13, color: 'var(--terra-deep)', stroke: 2 })} Previsione: <b>${s.when}</b></div>` : ''}
            </div>`).join('')}
        </div>
      </div>

      <div class="pad mt22">
        <div class="stc-note">
          <div class="eyebrow">Cosa succede ora</div>
          <p>Il tecnologo alimentare ti contatta per fissare la visita sul campo. Di solito entro 2–3 settimane. Se non ti arriva nulla, scrivici: ti rispondiamo noi.</p>
        </div>
      </div>

      <div class="stc-cta">
        <button class="btn btn-outline btn-block" data-contact>
          ${Icon('message-circle', { size: 18, color: 'var(--ink)' })}
          Contatta chi verifica
        </button>
        <button class="stc-withdraw" data-withdraw>Ritira la candidatura</button>
      </div>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]');
    if (back) back.onclick = () => history.back();

    const contact = el.querySelector('[data-contact]');
    if (contact) contact.onclick = () => {
      // Apre lo sheet contatto verso il team che verifica (il tecnologo alimentare).
      // Contatti del team: da definire (nessun recapito inventato).
      openContact({
        name: 'Il tecnologo alimentare — chi verifica sul campo',
        hours: 'Ti rispondiamo entro 1–2 giorni',
        contact: { whatsapp: '', phone: '', email: '' },
      });
    };

    const withdraw = el.querySelector('[data-withdraw]');
    if (withdraw) withdraw.onclick = () => { location.hash = '#/candidati'; };
  }

  return { html, onMount };
}
