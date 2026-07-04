import { Icon } from '../icons.js';
import { StatusBar, Photo } from '../components.js';
import { producerById } from '../store.js';

/* ---------------- PLAYER · rotta #/video/<id> ----------------
   3 capitoli del produttore (Presentazione / Storia / Metodo).
   Player 16:9 + barra avanzamento finta; tabs dai p.videos
   ("In arrivo" se coming) con durate; testo da p.story.
   No-nav. [data-back]. Auto-contenuto: stile specifico inline,
   resto riusa il design-system di css/app.css. */

const TYPE_LABEL = { presentazione: 'Presentazione', storia: 'Storia', metodo: 'Metodo' };

export function Player(id, startIndex = null) {
  const p = producerById(id);

  /* Stato vuoto: causa + rimedio + uscita (mai vuoto nudo) */
  if (!p) {
    return {
      html: `<div class="screen no-nav">${StatusBar()}
        <div class="toprow"><button class="iconbtn" data-back>${Icon('arrow-left', { size: 18 })}</button></div>
        <div class="center" style="padding:70px 30px">
          ${Icon('play', { size: 44, color: 'var(--faint)' })}
          <h2 class="h2 mt16">Video non disponibile</h2>
          <p class="muted mt8">Non troviamo il produttore di questo video: forse il link è vecchio o la scheda è stata aggiornata.</p>
          <a class="btn btn-grad btn-block mt22" href="#/home" data-link>${Icon('home', { size: 18, color: '#fff' })} Torna alla scoperta</a>
        </div></div>`,
      onMount(el) {
        const b = el.querySelector('[data-back]'); if (b) b.onclick = () => history.back();
      },
    };
  }

  const videos = Array.isArray(p.videos) ? p.videos : [];
  /* video richiesto esplicitamente (tap su una miniatura); altrimenti primo pronto, altrimenti il primo */
  let active = videos.findIndex(v => v.state !== 'coming');
  if (active < 0) active = 0;
  if (Number.isInteger(startIndex) && startIndex >= 0 && startIndex < videos.length) active = startIndex;

  const verifyDate = p.verify && p.verify.date ? p.verify.date : null;

  /* ---- markup della zona che cambia al tap dei tab (player + intestazione) ---- */
  /* sorgente reale del video: mp4/webm -> <video>; youtube/vimeo -> <iframe>; poster da v.poster o foto produttore */
  const posterOf = (v) => (v.poster && /^(https?:|\.?\/)/.test(v.poster)) ? v.poster : (p.photo || '');
  const mediaHtml = (v) => {
    const src = v.src || '';
    const yt = src.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/);
    const vi = src.match(/vimeo\.com\/(\d+)/);
    if (yt) return `<iframe class="pl-embed" src="https://www.youtube.com/embed/${yt[1]}" title="Video del produttore" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    if (vi) return `<iframe class="pl-embed" src="https://player.vimeo.com/video/${vi[1]}" title="Video del produttore" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    const poster = posterOf(v);
    return `<video class="pl-video" controls playsinline preload="metadata"${poster ? ` poster="${poster}"` : ''}><source src="${src}">Il tuo browser non riproduce questo video.</video>`;
  };

  const stage = (i) => {
    const v = videos[i] || {};
    const coming = v.state === 'coming';
    const tone = v.tone || p.tone || 'paesaggio';
    const dur = v.duration && v.duration !== '—' ? v.duration : '';
    const hasVideo = !coming && !!v.src;
    const label = (TYPE_LABEL[v.type] || 'Video') + (coming ? ' · in arrivo' : (dur ? ' · ' + dur : ''));
    const player = hasVideo
      ? `<div class="pl-stage pl-stage--live">${mediaHtml(v)}</div>`
      : `
      <div class="pl-stage">
        ${Photo(tone, label, 'pl-photo')}
        ${coming
          ? `<div class="pl-soon">${Icon('clock', { size: 15, color: '#fff' })} In arrivo</div>`
          : `<div class="pl-play">${Icon('play', { size: 28, color: '#fff' })}</div>`}
        <div class="pl-track">
          <div class="pl-bar"><i style="width:${coming ? 0 : 22}%"></i></div>
          <div class="pl-time tnum"><span class="pl-preview">${coming ? 'in arrivo' : 'anteprima'}</span><span>${dur || '—'}</span></div>
        </div>
      </div>`;
    return `
      ${player}
      <div class="pl-head pad">
        <div class="eyebrow" style="color:var(--terra-deep)">${TYPE_LABEL[v.type] || 'Video'}${dur ? ` · <span class="tnum">${dur}</span>` : ''}</div>
        <h1 class="h1 mt8" style="font-size:25px">${v.title && v.title !== '—' ? v.title : (TYPE_LABEL[v.type] || 'Capitolo in arrivo')}</h1>
        <div class="muted mt8" style="font-size:13px">${p.name}${verifyDate ? ` · Verificato sul campo · ${verifyDate}` : ''}</div>
        ${coming ? `<div class="muted mt8" style="font-size:13px">Questo capitolo non è ancora stato girato. Intanto puoi guardare gli altri o andare a conoscere ${p.name} di persona.</div>` : ''}
      </div>`;
  };

  /* ---- tab bar (segment) ---- */
  const tabs = (cur) => videos.map((v, i) => {
    const coming = v.state === 'coming';
    const dur = coming ? 'In arrivo' : (v.duration && v.duration !== '—' ? v.duration : '—');
    return `<button class="pl-tab${i === cur ? ' active' : ''}" data-tab="${i}">
      <span class="pl-tab-t">${TYPE_LABEL[v.type] || ('Cap. ' + (i + 1))}</span>
      <span class="pl-tab-d tnum">${dur}</span>
    </button>`;
  }).join('');

  return {
    html: `<div class="screen no-nav">
      <style>
        .pl-stage{ position:relative; aspect-ratio:16/9; background:var(--ink); }
        .pl-stage .pl-photo{ position:absolute; inset:0; height:100%; }
        .pl-stage--live{ background:#000; }
        .pl-video, .pl-embed{ position:absolute; inset:0; width:100%; height:100%; border:0; background:#000; }
        .pl-video{ object-fit:cover; }
        .pl-close{ position:absolute; z-index:5; top:calc(12px + env(safe-area-inset-top)); left:16px;
          width:44px; height:44px; border-radius:50%; background:rgba(255,255,255,.16);
          backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; }
        .pl-play{ position:absolute; z-index:4; top:50%; left:50%; transform:translate(-50%,-50%);
          width:66px; height:66px; border-radius:50%; background:rgba(255,255,255,.2);
          border:1.5px solid rgba(255,255,255,.8); backdrop-filter:blur(6px);
          display:flex; align-items:center; justify-content:center; padding-left:4px;
          box-shadow:0 10px 26px rgba(0,0,0,.35); }
        .pl-soon{ position:absolute; z-index:4; top:50%; left:50%; transform:translate(-50%,-50%);
          display:inline-flex; align-items:center; gap:7px; padding:9px 16px; border-radius:var(--r-pill);
          background:rgba(31,24,18,.62); color:#fff; font-size:13px; font-weight:600; backdrop-filter:blur(6px); }
        .pl-track{ position:absolute; z-index:4; left:18px; right:18px; bottom:16px; }
        .pl-bar{ height:4px; border-radius:var(--r-pill); background:rgba(255,255,255,.3); position:relative; }
        .pl-bar i{ position:absolute; left:0; top:0; bottom:0; display:block; border-radius:var(--r-pill); background:var(--verde); }
        .pl-bar::after{ content:''; position:absolute; top:50%; transform:translate(-50%,-50%);
          left:var(--knob,22%); width:13px; height:13px; border-radius:50%; background:#fff;
          box-shadow:0 1px 4px rgba(0,0,0,.4); }
        .pl-time{ display:flex; justify-content:space-between; margin-top:7px; font-size:11px; color:rgba(255,255,255,.85); }
        .pl-preview{ font-variant-numeric:normal; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
          font-size:9.5px; padding:2px 7px; border-radius:var(--r-pill); background:rgba(255,255,255,.22);
          align-self:center; }
        .pl-head{ padding-top:20px; }
        .pl-tabs{ display:flex; gap:6px; background:var(--carta-scura); border-radius:14px; padding:5px; }
        .pl-tab{ flex:1; display:flex; flex-direction:column; align-items:center; gap:2px;
          padding:10px 4px; border-radius:10px; min-height:48px; justify-content:center; }
        .pl-tab .pl-tab-t{ font-size:13px; font-weight:600; color:var(--muted2); }
        .pl-tab .pl-tab-d{ font-size:10.5px; color:var(--faint); font-weight:600; }
        .pl-tab.active{ background:#fff; box-shadow:var(--sh-card); }
        .pl-tab.active .pl-tab-t{ color:var(--ink); }
        .pl-tab.active .pl-tab-d{ color:var(--verde-deep); }
        .pl-body{ padding:22px; }
        .pl-actions{ margin-top:auto; padding:22px 22px calc(22px + env(safe-area-inset-bottom));
          display:flex; flex-direction:column; gap:10px; }
      </style>

      <button class="pl-close" data-back>${Icon('x', { size: 20, color: '#fff' })}</button>

      <div class="scroll">
        <div id="pl-stage">${stage(active)}</div>

        <div class="pad mt16">
          <div class="pl-tabs" id="pl-tabs">${tabs(active)}</div>
        </div>

        <div class="pl-body">
          <p class="story">${p.story || 'La storia di questo produttore arriva presto, raccontata sul campo.'}</p>
        </div>
      </div>

      <div class="pl-actions">
        <button class="btn btn-ink btn-block" data-card>${Icon('arrow-left', { size: 18, color: '#fff' })} Torna alla scheda</button>
        <button class="btn btn-block" style="color:var(--verde-deep);background:transparent;box-shadow:none" data-map>${Icon('map-pin', { size: 16, color: 'var(--verde-deep)' })} Trova sulla mappa</button>
      </div>
    </div>`,

    onMount(el) {
      const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
      const card = el.querySelector('[data-card]'); if (card) card.onclick = () => { location.hash = `#/produttore/${p.id}`; };
      const mapBtn = el.querySelector('[data-map]'); if (mapBtn) mapBtn.onclick = () => { location.hash = '#/mappa'; };

      const stageEl = el.querySelector('#pl-stage');
      const tabsEl = el.querySelector('#pl-tabs');
      const select = (i) => {
        stageEl.innerHTML = stage(i);
        tabsEl.innerHTML = tabs(i);
        bindTabs();
        const knob = stageEl.querySelector('.pl-bar');
        if (knob) knob.style.setProperty('--knob', (videos[i] && videos[i].state === 'coming') ? '0%' : '22%');
      };
      const bindTabs = () => {
        tabsEl.querySelectorAll('[data-tab]').forEach(b => {
          b.onclick = () => select(Number(b.dataset.tab));
        });
      };
      bindTabs();
      const k0 = stageEl.querySelector('.pl-bar');
      if (k0) k0.style.setProperty('--knob', (videos[active] && videos[active].state === 'coming') ? '0%' : '22%');
    },
  };
}
