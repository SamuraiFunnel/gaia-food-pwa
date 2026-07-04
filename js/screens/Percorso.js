import { Icon } from '../icons.js';
import { StatusBar, Photo, BottomNav } from '../components.js';
import { getState } from '../store.js';
import { t } from '../i18n.js';

/* ---------------- LUNGO IL PERCORSO (Gaia Road) — in arrivo ---------------- */
export function Percorso() {
  const z = getState().zone;
  const comune = (z && z.comuni && z.comuni[0]) || t('percorso.yourZone');

  const roadmap = [
    {
      glyph: 'navigation',
      title: t('percorso.step1Title'),
      text: t('percorso.step1Text'),
    },
    {
      glyph: 'map-pin',
      title: t('percorso.step2Title'),
      text: t('percorso.step2Text'),
    },
    {
      glyph: 'check-circle',
      title: t('percorso.step3Title'),
      text: t('percorso.step3Text'),
    },
  ];

  return {
    html: `
    <style>
      .pc-roadmap-photo{ height:220px; border-radius:20px; box-shadow:var(--sh-card); }
      .pc-road-line{ position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
      .pc-road-from{ position:absolute; left:24px; bottom:34px; width:16px; height:16px; border-radius:50%;
        background:var(--ink); border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,.3); }
      .pc-road-to{ position:absolute; right:30px; top:26px; width:30px; height:30px; border-radius:50%;
        background:linear-gradient(135deg,var(--verde),var(--celeste)); border:2.5px solid #fff;
        box-shadow:0 4px 10px -2px rgba(14,90,80,.5); display:flex; align-items:center; justify-content:center; }
      .pc-eyebrow{ display:inline-flex; align-items:center; gap:7px; font-size:11px; font-weight:700;
        letter-spacing:.12em; text-transform:uppercase; color:var(--terra-deep); background:var(--terra-pale);
        padding:6px 12px; border-radius:var(--r-pill); }
      .pc-step{ display:flex; gap:14px; align-items:flex-start; padding:14px 0; }
      .pc-step + .pc-step{ border-top:1px solid var(--bd); }
      .pc-step-ic{ flex:none; width:42px; height:42px; border-radius:12px; display:flex; align-items:center;
        justify-content:center; background:var(--verde-pale); color:var(--verde-deep); }
      .pc-step-t{ font-family:var(--serif); font-size:16px; font-weight:600; color:var(--ink); margin:1px 0 3px; }
      .pc-step-x{ font-size:13.5px; line-height:1.55; color:var(--ink-soft); }
      .pc-notice{ display:flex; gap:10px; align-items:flex-start; background:var(--celeste-pale);
        border-radius:14px; padding:13px 14px; }
      .pc-notice .pc-notice-t{ font-size:13px; line-height:1.55; color:var(--ink-soft); }
      .pc-notice .pc-notice-t b{ color:var(--celeste-deep); font-weight:700; }
    </style>
    <div class="screen">
      ${StatusBar()}
      <div class="toprow">
        <span class="loc">${Icon('map-pin', { size: 16, color: 'var(--terra-deep)' })}<b>${comune}</b> · ${z ? z.label : ''}</span>
        <a class="iconbtn" href="#/profilo" data-link>${Icon('user', { size: 18 })}</a>
      </div>
      <div class="scroll">
        <div class="pad mt8">
          <div class="segment">
            <button data-go="#/home">${t('percorso.segFindNearby')}</button>
            <button class="active">${t('percorso.segAlongRoute')}</button>
          </div>
        </div>

        <div class="pad mt16">
          <div style="position:relative">
            ${Photo('paesaggio', t('percorso.photoLabel'), 'pc-roadmap-photo')}
            <svg class="pc-road-line" viewBox="0 0 356 220" preserveAspectRatio="none" aria-hidden="true">
              <path d="M30 188 C90 144 70 106 140 92 C210 78 200 56 300 38" fill="none"
                stroke="#FBF9F5" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 9" opacity=".9"></path>
            </svg>
            <span class="pc-road-from"></span>
            <span class="pc-road-to">${Icon('navigation', { size: 15, color: '#fff' })}</span>
          </div>
        </div>

        <div class="pad mt22">
          <span class="pc-eyebrow">${Icon('clock', { size: 13, color: 'var(--terra-deep)' })} ${t('common.comingSoon')} · Gaia Road</span>
          <h1 class="h1 mt12">${t('percorso.heroTitle')}</h1>
          <p class="story mt8" style="font-size:15px">${t('percorso.heroBody')}</p>
        </div>

        <div class="pad mt22">
          <div class="section-t" style="margin-bottom:6px">${t('percorso.howItWorks')}</div>
          <div>
            ${roadmap.map(s => `
              <div class="pc-step">
                <span class="pc-step-ic">${Icon(s.glyph, { size: 20, color: 'var(--verde-deep)' })}</span>
                <div>
                  <div class="pc-step-t">${s.title}</div>
                  <div class="pc-step-x">${s.text}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <div class="pad mt16">
          <div class="pc-notice">
            <span style="flex:none;color:var(--celeste-deep);margin-top:1px">${Icon('info', { size: 18, color: 'var(--celeste-deep)' })}</span>
            <div class="pc-notice-t">${t('percorso.notice')}</div>
          </div>
        </div>

        <div class="pad mt16">
          <button class="btn btn-outline btn-block" data-notify aria-pressed="false">
            ${Icon('bell', { size: 19, color: 'var(--verde-deep)' })} ${t('percorso.notifyMe')}
          </button>
          <a class="btn btn-block mt8" href="#/home" data-link style="color:var(--muted);font-weight:600">
            ${t('percorso.meanwhileFindNearby')} ${Icon('chevron-right', { size: 16, color: 'var(--muted)' })}
          </a>
        </div>
        <div style="height:24px"></div>
      </div>
      ${BottomNav('scopri')}
    </div>`,

    onMount(el) {
      el.querySelectorAll('[data-go]').forEach(b => (b.onclick = () => (location.hash = b.dataset.go)));
      const notify = el.querySelector('[data-notify]');
      if (notify) {
        notify.onclick = () => {
          const done = notify.getAttribute('aria-pressed') === 'true';
          if (done) return;
          notify.setAttribute('aria-pressed', 'true');
          notify.disabled = true;
          notify.style.borderColor = 'var(--verde)';
          notify.style.background = 'var(--verde-pale)';
          notify.style.color = 'var(--verde-deep)';
          notify.innerHTML = `${Icon('check-circle', { size: 19, color: 'var(--verde-deep)' })} ${t('percorso.notifyDone')}`;
        };
      }
    },
  };
}
