import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';
import { getState, submitCandidatura } from '../store.js';
import { t } from '../i18n.js';

/* Form candidatura produttore — passo 1/2 (rotta #/candidati/form) */
export function Form() {
  const s = getState();
  const cats = s.categories || [];
  // selezione iniziale: primi due (l'utente può cambiarla; viene inviata davvero)
  const preselected = cats.slice(0, 2).map(c => c.id);

  const catChips = cats.map(c =>
    `<button type="button" class="fchip${preselected.includes(c.id) ? ' on' : ''}" data-cat="${c.id}" role="checkbox" aria-checked="${preselected.includes(c.id)}">
       ${Icon(c.glyph, { size: 15 })}<span>${c.label}</span>
     </button>`).join('');

  // riga contatto: campo valore (numero/email) + toggle per pubblicarlo
  const contactRow = (icon, color, label, field, type, placeholder, on, last = false) => `
    <div class="frow${last ? ' last' : ''}">
      <span class="frow-ic" style="color:${color}">${Icon(icon, { size: 18, stroke: 2 })}</span>
      <span class="frow-cell">
        <span class="frow-lb">${label}</span>
        <input class="frow-in" type="${type}" data-contact="${field}" placeholder="${placeholder}" autocomplete="off">
      </span>
      <button type="button" class="fswitch${on ? ' on' : ''}" data-toggle role="switch" aria-checked="${on}" aria-label="${t('form.publishAria', { label })}">
        <span class="fknob"></span>
      </button>
    </div>`;

  const html = `
  <style>
    /* ---- Form: stile locale, riusa token globali ---- */
    .frm-progress{display:flex;align-items:center;gap:14px;padding:8px 22px 0}
    .frm-back{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-left:-10px;flex:none}
    .frm-back:active{background:var(--carta-scura)}
    .frm-bar{flex:1;height:5px;background:var(--carta-scura);border-radius:var(--r-pill);position:relative;overflow:hidden}
    .frm-bar i{position:absolute;left:0;top:0;bottom:0;width:50%;background:var(--verde);border-radius:var(--r-pill)}
    .frm-step{font-size:12px;font-weight:600;color:var(--muted2);font-variant-numeric:tabular-nums;flex:none}

    .ffield{display:block}
    .flabel{font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:7px}
    .finput{width:100%;background:var(--bianco);border:1px solid var(--bd);border-radius:14px;
      padding:14px 15px;font-family:var(--sans);font-size:15px;color:var(--ink);line-height:1.3}
    .finput::placeholder{color:var(--faint)}
    .finput:focus{outline:none;border-color:var(--verde);box-shadow:0 0 0 3px var(--verde-pale)}
    .finput-ic{display:flex;align-items:center;gap:10px;background:var(--bianco);border:1px solid var(--bd);border-radius:14px;padding:0 15px}
    .finput-ic input{flex:1;border:none;background:transparent;font-family:var(--sans);font-size:15px;color:var(--ink);padding:14px 0}
    .finput-ic input:focus{outline:none}
    .finput-ic:focus-within{border-color:var(--verde);box-shadow:0 0 0 3px var(--verde-pale)}

    .fchips{display:flex;gap:8px;flex-wrap:wrap}
    .fchip{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:8px 14px;border-radius:var(--r-pill);
      font-size:13px;font-weight:600;border:1px solid var(--bd);background:var(--bianco);color:var(--ink-soft)}
    .fchip svg{color:var(--terra-deep)}
    .fchip.on{background:var(--ink);border-color:var(--ink);color:#fff}
    .fchip.on svg{color:#fff}

    .fphotos{display:flex;gap:10px}
    .fthumb{width:74px;height:74px;border-radius:14px;overflow:hidden;position:relative}
    .fthumb .photo{width:100%;height:100%}
    .fthumb-rm{position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;
      background:rgba(31,24,18,.62);color:#fff;display:flex;align-items:center;justify-content:center}
    .fadd{width:74px;height:74px;border-radius:14px;border:1.5px dashed var(--terra);background:var(--bianco);
      display:flex;align-items:center;justify-content:center;color:var(--terra-deep)}
    .fadd:active{background:var(--terra-pale)}

    .fcontacts{background:var(--bianco);border:1px solid var(--bd);border-radius:14px;overflow:hidden}
    .frow{display:flex;align-items:center;gap:11px;padding:11px 15px;border-bottom:1px solid var(--carta-scura)}
    .frow.last{border-bottom:none}
    .frow-ic{flex:none}
    .frow-cell{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
    .frow-lb{font-size:12px;font-weight:600;color:var(--muted2)}
    .frow-in{border:none;background:transparent;font-family:var(--sans);font-size:14.5px;color:var(--ink);padding:1px 0;width:100%}
    .frow-in::placeholder{color:var(--faint)}
    .frow-in:focus{outline:none}
    .fswitch{width:46px;height:27px;border-radius:var(--r-pill);background:var(--bd3);position:relative;flex:none;transition:background .16s}
    .fswitch.on{background:var(--verde)}
    .fknob{position:absolute;top:3px;left:3px;width:21px;height:21px;border-radius:50%;background:#fff;
      box-shadow:0 1px 3px rgba(31,24,18,.25);transition:transform .16s}
    .fswitch.on .fknob{transform:translateX(19px)}

    .fconsent{display:flex;gap:11px;align-items:flex-start;text-align:left}
    .fcheck{width:24px;height:24px;flex:none;border-radius:7px;border:1.5px solid var(--bd3);background:var(--bianco);
      display:flex;align-items:center;justify-content:center;margin-top:1px;color:transparent}
    .fcheck.on{background:var(--verde);border-color:var(--verde);color:#fff}
    .fconsent p{font-size:13px;line-height:1.5;color:var(--ink-soft)}
    .fconsent .req{color:var(--muted2);font-size:11.5px;display:block;margin-top:3px}

    .frm-cta{padding:18px 22px 24px;border-top:1px solid var(--bd2);background:var(--bianco)}
  </style>

  <div class="screen no-nav">
    ${StatusBar()}

    <div class="frm-progress">
      <button type="button" class="frm-back" data-back aria-label="${t('common.back')}">${Icon('arrow-left', { size: 21, stroke: 2.1 })}</button>
      <div class="frm-bar" role="progressbar" aria-valuenow="1" aria-valuemin="1" aria-valuemax="2"><i></i></div>
      <span class="frm-step">${t('form.step')}</span>
    </div>

    <div class="scroll">
      <div class="pad mt12">
        <h1 class="h1">${t('form.title')}</h1>
        <p class="muted mt8" style="font-size:13.5px">${t('form.subtitle')}</p>
      </div>

      <div class="pad mt22" style="display:flex;flex-direction:column;gap:18px">

        <label class="ffield">
          <span class="flabel">${t('form.nameLabel')}</span>
          <input class="finput" id="fname" type="text" placeholder="${t('form.namePlaceholder')}" autocomplete="organization">
        </label>

        <label class="ffield">
          <span class="flabel">${t('form.placeLabel')}</span>
          <span class="finput-ic">
            ${Icon('map-pin', { size: 18, color: 'var(--terra-deep)', stroke: 2 })}
            <input id="fplace" type="text" placeholder="${t('form.placePlaceholder')}" autocomplete="address-level2">
          </span>
        </label>

        <div class="ffield">
          <span class="flabel">${t('form.catsLabel')}</span>
          <div class="fchips" id="fcats">${catChips}</div>
        </div>

        <div class="ffield">
          <span class="flabel">${t('form.photosLabel')}</span>
          <div class="fphotos" id="fphotos">
            <div class="fthumb"><div class="photo" data-tone="pascolo"><div class="pgrain"></div></div><span class="fthumb-rm">${Icon('x', { size: 13, stroke: 2.4 })}</span></div>
            <div class="fthumb"><div class="photo" data-tone="uova"><div class="pgrain"></div></div><span class="fthumb-rm">${Icon('x', { size: 13, stroke: 2.4 })}</span></div>
            <button type="button" class="fadd" id="fadd" aria-label="${t('form.addPhotoAria')}">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
          </div>
        </div>

        <div class="ffield">
          <span class="flabel">${t('form.contactsLabel')}</span>
          <div class="fcontacts" id="fcontacts">
            ${contactRow('message-circle', 'var(--verde)', 'WhatsApp', 'whatsapp', 'tel', t('form.phWhatsapp'), true)}
            ${contactRow('phone', 'var(--terra-deep)', t('form.contactPhone'), 'phone', 'tel', t('form.phPhone'), true)}
            ${contactRow('mail', 'var(--muted2)', t('form.contactEmail'), 'email', 'email', t('form.phEmail'), false, true)}
          </div>
        </div>

        <button type="button" class="fconsent" id="fconsent" role="checkbox" aria-checked="true">
          <span class="fcheck on" aria-hidden="true">${Icon('check', { size: 16, stroke: 2.6 })}</span>
          <p>${t('form.consentText')}
            <span class="req">${t('form.consentReq')}</span>
          </p>
        </button>

      </div>
      <div style="height:8px"></div>
    </div>

    <div class="frm-cta">
      <button type="button" class="btn btn-grad btn-block" id="fsubmit">
        ${t('form.submit')} ${Icon('chevron-right', { size: 18, color: '#fff', stroke: 2.3 })}
      </button>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]');
    if (back) back.onclick = () => history.back();

    // categorie multi-select
    el.querySelectorAll('#fcats .fchip').forEach(b => {
      b.onclick = () => {
        const on = b.classList.toggle('on');
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      };
    });

    // toggle switch per-canale
    el.querySelectorAll('#fcontacts [data-toggle]').forEach(sw => {
      sw.onclick = () => {
        const on = sw.classList.toggle('on');
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
      };
    });

    // rimozione foto (demo)
    el.querySelectorAll('#fphotos .fthumb-rm').forEach(rm => {
      rm.onclick = () => rm.closest('.fthumb').remove();
    });

    // consenso checkbox
    const consent = el.querySelector('#fconsent');
    const box = consent.querySelector('.fcheck');
    consent.onclick = () => {
      const on = box.classList.toggle('on');
      consent.setAttribute('aria-checked', on ? 'true' : 'false');
    };

    // invio: legge i campi, POSTa la candidatura, poi va allo stato
    const submit = el.querySelector('#fsubmit');
    submit.onclick = async () => {
      const name = (el.querySelector('#fname').value || '').trim();
      const place = (el.querySelector('#fplace').value || '').trim();
      const categories = [...el.querySelectorAll('#fcats .fchip.on')].map(c => c.dataset.cat);
      // un contatto è incluso solo se il toggle è acceso E c'è un valore
      const contact = {};
      el.querySelectorAll('#fcontacts .frow').forEach(row => {
        const inp = row.querySelector('[data-contact]');
        const sw = row.querySelector('[data-toggle]');
        if (inp && sw && sw.classList.contains('on')) {
          const v = (inp.value || '').trim();
          if (v) contact[inp.dataset.contact] = v;
        }
      });
      if (!name) {
        const f = el.querySelector('#fname'); f.focus();
        f.style.borderColor = 'var(--red-alert)';
        return;
      }
      submit.disabled = true;
      const orig = submit.innerHTML;
      submit.textContent = t('form.submitting');
      try {
        await submitCandidatura({ name, place, categories, contact });
        location.hash = '#/candidati/stato';
      } catch (e) {
        submit.disabled = false;
        submit.innerHTML = orig;
        alert(t('form.submitError', { reason: e.message || t('common.retry') }));
      }
    };
  }

  return { html, onMount };
}
