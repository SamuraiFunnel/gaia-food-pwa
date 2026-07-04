import { Icon } from '../icons.js';
import { StatusBar, Photo } from '../components.js';

export function Candidati() {
  const STEPS = [
    { n: '01', t: 'Ti candidi, in due minuti', d: 'Dati azienda, categorie, qualche foto.' },
    { n: '02', t: 'Il tecnologo alimentare viene a verificarti', d: 'Una visita di persona, sul campo.' },
    { n: '03', t: 'Vai online col bollino', d: 'Verificato sul campo, con la data.' },
  ];
  const CERCHIAMO = [
    'Produzione vera, niente intensivo',
    'Disponibilità alla visita del tecnologo alimentare',
    'Trasparenza sul metodo',
  ];

  const html = `
  <style>
    .cnd-hero{position:relative;height:300px;flex:none}
    .cnd-hero .photo{position:absolute;inset:0;width:100%;height:100%;border-radius:0}
    .cnd-hero::after{content:"";position:absolute;inset:0;z-index:10;
      background:linear-gradient(180deg,rgba(31,24,18,.05) 0%,rgba(31,24,18,.12) 42%,rgba(31,24,18,.62) 100%)}
    .cnd-hero-stack{position:relative;z-index:20;height:100%;display:flex;flex-direction:column}
    .cnd-back{position:absolute;top:60px;left:20px;width:44px;height:44px;border:none;border-radius:50%;
      background:rgba(31,24,18,.34);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;
      cursor:pointer;z-index:30}
    .cnd-hero-txt{margin-top:auto;padding:0 24px 22px}
    .cnd-eyebrow{font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.88)}
    .cnd-h1{margin:8px 0 0;font-family:'Fraunces',serif;font-weight:600;font-size:32px;line-height:1.04;
      letter-spacing:-.02em;color:#fff;text-shadow:0 2px 16px rgba(0,0,0,.35)}
    .cnd-h1 em{font-style:italic;color:#16A34A;text-shadow:none}
    .cnd-lead{margin:22px 24px 0;font-size:15.5px;line-height:1.6;color:#3d342b}
    .cnd-lead strong{font-weight:600;color:#1F1812}
    .cnd-sec{padding:26px 24px 0}
    .cnd-sec-t{margin:0 0 16px;font-family:'Fraunces',serif;font-size:20px;font-weight:600;color:#1F1812}
    .cnd-steps{display:flex;flex-direction:column;gap:16px}
    .cnd-step{display:flex;gap:14px}
    .cnd-step-n{font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:26px;color:#8C6838;
      line-height:1;flex:none;width:30px}
    .cnd-step-t{font-size:15px;font-weight:600;color:#1F1812}
    .cnd-step-d{font-size:13.5px;color:#6b5f53;line-height:1.45;margin-top:1px}
    .cnd-list{display:flex;flex-direction:column;gap:10px}
    .cnd-li{display:flex;align-items:center;gap:10px;min-height:24px;font-size:14.5px;color:#3d342b}
    .cnd-cta{margin-top:30px;padding:18px 24px 24px;border-top:1px solid #ECE4D7;background:#FBF9F5}
    .cnd-cta .btn-grad{width:100%;height:56px;border:none;border-radius:17px;
      background:linear-gradient(135deg,#16A34A,#0EA5E9);color:#fff;font-family:'Inter',sans-serif;font-size:16.5px;
      font-weight:600;cursor:pointer;box-shadow:0 10px 26px -8px rgba(22,163,74,.6)}
    .cnd-sub{text-align:center;margin-top:12px;font-size:12.5px;color:#8a7d6c}
  </style>
  <div class="screen no-nav">
    <div class="cnd-hero">
      ${Photo('pascolo', '', '')}
      <div class="cnd-hero-stack">
        ${StatusBar(true)}
        <button class="cnd-back" data-back aria-label="Indietro">
          ${Icon('arrow-left', { size: 20, color: '#fff', stroke: 2.1 })}
        </button>
        <div class="cnd-hero-txt">
          <div class="cnd-eyebrow">Per chi produce davvero</div>
          <h1 class="cnd-h1">Tu produci. <em>Noi</em> portiamo i clienti.</h1>
        </div>
      </div>
    </div>

    <div class="scroll">
      <p class="cnd-lead">Le persone vogliono cibo vero ma non sanno dove trovarti. <strong>Noi sì</strong> — e non devi fare marketing.</p>

      <div class="cnd-sec">
        <h2 class="cnd-sec-t">Come funziona</h2>
        <div class="cnd-steps">
          ${STEPS.map(s => `
            <div class="cnd-step">
              <div class="cnd-step-n">${s.n}</div>
              <div>
                <div class="cnd-step-t">${s.t}</div>
                <div class="cnd-step-d">${s.d}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div class="cnd-sec">
        <h2 class="cnd-sec-t">Cosa cerchiamo</h2>
        <div class="cnd-list">
          ${CERCHIAMO.map(c => `
            <div class="cnd-li">${Icon('check-circle', { size: 19, color: '#16A34A', stroke: 2.1 })}<span>${c}</span></div>`).join('')}
        </div>
      </div>

      <div class="cnd-cta">
        <button class="btn-grad" data-go-form>Candidati ora</button>
        <div class="cnd-sub">Nessun costo per candidarsi. Mai.</div>
      </div>
    </div>
  </div>`;

  function onMount(el) {
    const back = el.querySelector('[data-back]');
    if (back) back.onclick = () => history.back();
    const go = el.querySelector('[data-go-form]');
    if (go) go.onclick = () => { location.hash = '#/candidati/form'; };
  }

  return { html, onMount };
}
