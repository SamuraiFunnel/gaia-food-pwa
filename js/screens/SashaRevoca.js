import { Icon } from '../icons.js';
import { StatusBar, VerifyBadge } from '../components.js';

/* Sasha · Revoca / sospensione verifica (rotta #/sasha/revoca)
   Azione delicata: Sospendi (reversibile) o Revoca (esce dai verificati).
   Motivo obbligatorio, effetto lato utente esplicito, avviso al produttore.
   no-nav, [data-back]. Demo: nessun dato inviato. */
export function SashaRevoca() {
  const html = `
  <style>
    /* ---- Sasha Revoca: stile locale, riusa token globali ---- */
    .rv-head{display:flex;align-items:center;gap:12px;padding:8px 22px 0}
    .rv-back{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-left:-10px;flex:none}
    .rv-back:active{background:var(--carta-scura)}
    .rv-title{margin:0;font-family:var(--serif);font-weight:600;font-size:22px;color:var(--ink);line-height:1.1}

    /* scheda produttore bersaglio */
    .rv-target{background:var(--bianco);border:1px solid var(--bd);border-radius:14px;
      padding:14px 15px;display:flex;align-items:center;justify-content:space-between;gap:10px}
    .rv-target-name{font-family:var(--serif);font-size:16px;font-weight:600;color:var(--ink)}

    .rv-label{font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:9px}

    /* segment azione (riuso .segment ma con colore distruttivo per Revoca) */
    .rv-seg{display:flex;gap:8px}
    .rv-seg button{flex:1;min-height:48px;padding:13px 4px;border-radius:13px;font-family:var(--sans);
      font-size:14px;font-weight:600;border:1px solid var(--bd3);background:var(--bianco);color:var(--muted2);
      display:flex;align-items:center;justify-content:center;gap:7px;transition:background .15s,border-color .15s,color .15s}
    .rv-seg button svg{flex:none}
    .rv-seg button[data-act="sospendi"].on{background:var(--terra-deep);border-color:var(--terra-deep);color:#fff}
    .rv-seg button[data-act="revoca"].on{background:#C0392B;border-color:#C0392B;color:#fff}

    /* textarea motivo */
    .rv-area{width:100%;min-height:96px;resize:vertical;background:var(--bianco);border:1px solid var(--bd);
      border-radius:14px;padding:14px 15px;font-family:var(--sans);font-size:14.5px;color:var(--ink);line-height:1.45}
    .rv-area::placeholder{color:var(--faint)}
    .rv-area:focus{outline:none;border-color:var(--terra);box-shadow:0 0 0 3px var(--terra-pale)}
    .rv-area.invalid{border-color:#C0392B;box-shadow:0 0 0 3px rgba(192,57,43,.12)}
    .rv-err{display:none;font-size:12px;color:#C0392B;margin-top:7px}
    .rv-err.show{display:flex;align-items:center;gap:6px}

    /* box effetto lato utente */
    .rv-effect{background:var(--terra-pale);border:1px solid #E7D3B3;border-radius:14px;padding:15px 16px;display:flex;gap:11px}
    .rv-effect.danger{background:#FBEAE7;border-color:#EFC4BD}
    .rv-effect-ic{flex:none;margin-top:1px}
    .rv-effect-t{font-size:13px;font-weight:700;color:var(--terra-deep);margin-bottom:3px}
    .rv-effect.danger .rv-effect-t{color:#C0392B}
    .rv-effect p{margin:0;font-size:13px;line-height:1.5;color:var(--ink-soft)}

    /* toggle avvisa produttore */
    .rv-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;
      background:var(--bianco);border:1px solid var(--bd);border-radius:14px;padding:14px 15px}
    .rv-toggle-l{display:flex;align-items:center;gap:11px}
    .rv-toggle-l .ic{color:var(--muted2);flex:none}
    .rv-toggle-lb{font-size:14.5px;color:var(--ink)}
    .rv-sw{width:46px;height:27px;border-radius:var(--r-pill);background:var(--bd3);position:relative;flex:none;transition:background .16s}
    .rv-sw.on{background:var(--verde)}
    .rv-knob{position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:50%;background:#fff;
      box-shadow:0 1px 3px rgba(31,24,18,.25);transition:transform .16s}
    .rv-sw.on .rv-knob{transform:translateX(19px)}

    /* CTA distruttiva */
    .rv-cta{margin-top:auto;padding:18px 22px 24px;border-top:1px solid var(--bd2);background:var(--bianco)}
    .rv-confirm{width:100%;min-height:56px;border:none;border-radius:17px;font-family:var(--sans);
      font-size:16px;font-weight:600;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;
      background:var(--terra-deep);transition:background .15s}
    .rv-confirm.danger{background:#C0392B}
  </style>

  <div class="screen no-nav">
    ${StatusBar()}

    <div class="rv-head">
      <button type="button" class="rv-back" data-back aria-label="Indietro">${Icon('arrow-left', { size: 21, stroke: 2.1 })}</button>
      <h1 class="rv-title">Revoca / sospensione</h1>
    </div>

    <div class="scroll">
      <div class="pad mt16">
        <div class="rv-target">
          <span class="rv-target-name">Azienda di Claudio</span>
          ${VerifyBadge({ state: 'valid', date: '12 giu' }, { compact: true })}
        </div>
      </div>

      <div class="pad mt22">
        <span class="rv-label">Azione</span>
        <div class="rv-seg" id="rvSeg" role="radiogroup" aria-label="Tipo di azione">
          <button type="button" data-act="sospendi" class="on" role="radio" aria-checked="true">
            ${Icon('clock', { size: 16, stroke: 2 })}<span>Sospendi</span>
          </button>
          <button type="button" data-act="revoca" role="radio" aria-checked="false">
            ${Icon('x', { size: 16, stroke: 2.4 })}<span>Revoca</span>
          </button>
        </div>
      </div>

      <div class="pad mt22">
        <span class="rv-label" id="rvMotivoLbl">Motivo (richiesto)</span>
        <textarea class="rv-area" id="rvMotivo" aria-labelledby="rvMotivoLbl" aria-required="true"
          placeholder="Es. Segnalazione sulla lavorazione — da ricontrollare di persona alla prossima visita."></textarea>
        <span class="rv-err" id="rvErr" role="alert">${Icon('info', { size: 14, stroke: 2.2 })}Scrivi il motivo: resta agli atti e accompagna la decisione.</span>
      </div>

      <div class="pad mt22">
        <div class="rv-effect" id="rvEffect">
          <span class="rv-effect-ic">${Icon('info', { size: 20, color: 'var(--terra-deep)', stroke: 2 })}</span>
          <div>
            <div class="rv-effect-t" id="rvEffectT">Effetto lato utente</div>
            <p id="rvEffectP">La scheda passa a "verifica in aggiornamento" ed esce dai risultati verificati. Reversibile dopo una nuova visita sul campo.</p>
          </div>
        </div>
      </div>

      <div class="pad mt22">
        <button type="button" class="rv-toggle" id="rvToggle" role="switch" aria-checked="true" aria-label="Avvisa il produttore">
          <span class="rv-toggle-l">
            <span class="ic">${Icon('bell', { size: 19, stroke: 1.9 })}</span>
            <span class="rv-toggle-lb">Avvisa il produttore</span>
          </span>
          <span class="rv-sw on" id="rvSw"><span class="rv-knob"></span></span>
        </button>
      </div>

      <div style="height:8px"></div>
    </div>

    <div class="rv-cta">
      <button type="button" class="rv-confirm" id="rvConfirm">
        <span id="rvConfirmLbl">Conferma sospensione</span>
      </button>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]');
    if (back) back.onclick = () => history.back();

    let action = 'sospendi'; // sospendi | revoca

    const seg = el.querySelector('#rvSeg');
    const motivo = el.querySelector('#rvMotivo');
    const err = el.querySelector('#rvErr');
    const effect = el.querySelector('#rvEffect');
    const effectIc = effect.querySelector('.rv-effect-ic');
    const effectT = el.querySelector('#rvEffectT');
    const effectP = el.querySelector('#rvEffectP');
    const confirm = el.querySelector('#rvConfirm');
    const confirmLbl = el.querySelector('#rvConfirmLbl');

    const danger = () => action === 'revoca';

    function render() {
      const d = danger();
      // segment selezionato
      seg.querySelectorAll('button').forEach(b => {
        const on = b.dataset.act === action;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      // box effetto
      effect.classList.toggle('danger', d);
      effectIc.innerHTML = Icon('info', { size: 20, color: d ? '#C0392B' : 'var(--terra-deep)', stroke: 2 });
      effectT.textContent = d ? 'Effetto lato utente · revoca' : 'Effetto lato utente';
      effectP.textContent = d
        ? 'La scheda perde il bollino "Verificato sul campo" ed esce dai risultati verificati. Per tornare visibile servirà una nuova candidatura e verifica.'
        : 'La scheda passa a "verifica in aggiornamento" ed esce dai risultati verificati. Reversibile dopo una nuova visita sul campo.';
      // CTA
      confirm.classList.toggle('danger', d);
      confirmLbl.textContent = d ? 'Conferma revoca' : 'Conferma sospensione';
    }

    seg.querySelectorAll('button').forEach(b => {
      b.onclick = () => { action = b.dataset.act; render(); };
    });

    // motivo: pulisci errore mentre si scrive
    motivo.addEventListener('input', () => {
      if (motivo.value.trim()) {
        motivo.classList.remove('invalid');
        err.classList.remove('show');
      }
    });

    // toggle avvisa
    const toggle = el.querySelector('#rvToggle');
    const sw = el.querySelector('#rvSw');
    toggle.onclick = () => {
      const on = sw.classList.toggle('on');
      toggle.setAttribute('aria-checked', on ? 'true' : 'false');
    };

    // conferma: motivo obbligatorio -> causa+rimedio inline, mai azione cieca
    confirm.onclick = () => {
      if (!motivo.value.trim()) {
        motivo.classList.add('invalid');
        err.classList.add('show');
        motivo.focus();
        return;
      }
      // demo: nessun invio reale. Torna al backoffice.
      history.back();
    };

    render();
  }

  return { html, onMount };
}
