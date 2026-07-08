import { Icon } from '../icons.js';
import { StatusBar, VideoBlock } from '../components.js';
import { t } from '../i18n.js';

/* ===== ONBOARDING — "Conosci Gaia Food" (rotta #/onboarding) =====
   Card video 16:9 + intro editoriale + 3 valori. CTA -> #/home, "Salta" -> #/home.
   no-nav: niente BottomNav, full-bleed verticale con CTA in fondo. */
export function OnbVideo() {
  const values = [
    {
      icon: 'check-circle', tint: 'tv-verde',
      title: t('onbVideo.val1Title'),
      desc: t('onbVideo.val1Desc'),
    },
    {
      icon: 'leaf', tint: 'tv-terra',
      title: t('onbVideo.val2Title'),
      desc: t('onbVideo.val2Desc'),
    },
    {
      icon: 'map-pin', tint: 'tv-celeste',
      title: t('onbVideo.val3Title'),
      desc: t('onbVideo.val3Desc'),
    },
  ];

  const valueRows = values.map(v => `
    <div class="onb-val">
      <div class="onb-val-ic ${v.tint}">${Icon(v.icon, { size: 19, stroke: 2.1 })}</div>
      <div class="onb-val-tx">
        <div class="onb-val-t">${v.title}</div>
        <div class="onb-val-d">${v.desc}</div>
      </div>
    </div>`).join('');

  return {
    html: `
    <style>
      .onb{ display:flex; flex-direction:column; min-height:100vh; min-height:100dvh; }
      .onb-top{ display:flex; align-items:flex-start; justify-content:space-between; padding:14px 24px 0; }
      .onb-skip{ border:none; background:transparent; color:var(--verde-deep); font-size:13px; font-weight:600;
        cursor:pointer; padding:10px 6px; margin-top:14px; min-height:44px; }
      .onb-skip:active{ opacity:.6; }
      .onb-video{ padding:18px 20px 0; }
      .onb-read{ display:flex; align-items:center; gap:9px; margin:24px 24px 0; }
      .onb-read .eyebrow{ color:var(--muted2); }
      .onb-read i{ flex:1; height:1px; background:var(--bd2); display:block; }
      .onb-intro{ margin:12px 24px 0; font-size:15px; line-height:1.62; color:var(--ink-soft); }
      .onb-intro strong{ font-weight:600; color:var(--ink); }
      .onb-intro em{ font-style:normal; color:var(--verde-deep); font-weight:600; }
      .onb-vals{ display:flex; flex-direction:column; gap:13px; margin:18px 24px 0; }
      .onb-val{ display:flex; gap:12px; align-items:flex-start; }
      .onb-val-ic{ width:38px; height:38px; flex:none; border-radius:11px; display:flex;
        align-items:center; justify-content:center; }
      .onb-val-ic.tv-verde{ background:var(--verde-pale); color:var(--verde); }
      .onb-val-ic.tv-terra{ background:var(--terra-pale); color:var(--terra-deep); }
      .onb-val-ic.tv-celeste{ background:var(--celeste-pale); color:var(--celeste-deep); }
      .onb-val-t{ font-size:14.5px; font-weight:600; color:var(--ink); }
      .onb-val-d{ font-size:13px; color:var(--muted); line-height:1.45; margin-top:2px; }
      .onb-cta{ margin-top:auto; padding:22px 24px calc(24px + env(safe-area-inset-bottom)); }
      .onb-cta .btn{ height:56px; font-size:16.5px; }
    </style>
    <div class="screen no-nav onb">
      ${StatusBar()}
      <div class="onb-top">
        <div>
          <div class="eyebrow" style="color:var(--terra-deep)">${t('onbVideo.eyebrow')}</div>
          <h1 class="h1 mt8">${t('onbVideo.title')} <em>Gaia&nbsp;Food</em></h1>
        </div>
        <button class="onb-skip" data-skip type="button">${t('onbVideo.skip')}</button>
      </div>

      <div class="onb-video">
        ${VideoBlock({
          type: t('onbVideo.videoType'),
          title: t('onbVideo.videoTitle'),
          duration: '1:20',
          tone: 'paesaggio',
          state: 'ready',
        })}
      </div>

      <div class="onb-read">
        <span class="eyebrow">${t('onbVideo.readInstead')}</span>
        <i></i>
      </div>
      <p class="onb-intro">${t('onbVideo.intro')}</p>

      <div class="onb-vals">${valueRows}</div>

      <div class="onb-cta">
        <button class="btn btn-grad btn-block" data-go type="button">
          ${t('onbVideo.cta')} ${Icon('chevron-right', { size: 19, color: '#fff', stroke: 2.3 })}
        </button>
      </div>
    </div>`,

    onMount(el) {
      const go = () => { location.hash = '#/home'; };
      el.querySelector('[data-go]')?.addEventListener('click', go);
      el.querySelector('[data-skip]')?.addEventListener('click', go);
    },
  };
}
