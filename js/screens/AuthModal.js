import { Icon } from '../icons.js';
import { signInWithGoogle, loginPassword, registerPassword, authConfig, setZone, getState, activeZoneId, currentUser } from '../store.js';
import { t } from '../i18n.js';

/* ============================================================
   AUTH MODAL — pop-up di accesso (bottom-sheet).
   Sostituisce la pagina intera #/registrati: il login si apre SOPRA
   la schermata corrente, senza navigare. Due passi nello stesso sheet:
     1) accesso  → Google (reale se configurato, "presto" se no) + email
     2) zona     → "Dove ti trovi?" (Abruzzo attiva, altre "presto")
   Alla fine chiude il modale ed entra in #/home.
   Logica portata 1:1 da screens/Registration.js (che ora non è più una rotta).
   ============================================================ */

const REGIONI = [
  'Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna',
  'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche',
  'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia',
  'Toscana', 'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto',
];

const GOOGLE_CLIENT_ID_FALLBACK = 'DA-DEFINIRE';
const isRealClientId = (id) => !!id && id !== 'DA-DEFINIRE';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
let gsiPromise = null;
function loadGsi() {
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) { existing.dataset.loaded ? resolve() : existing.addEventListener('load', () => resolve()); return; }
    const s = document.createElement('script');
    s.src = GSI_SRC; s.async = true; s.defer = true;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = () => { gsiPromise = null; reject(new Error('gsi load error')); };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

const googleLogoSvg = `<svg class="glogo" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.22-4.74 3.22-8.32Z"/>
  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.26 1.05-3.72 1.05-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
  <path fill="#FBBC05" d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.67-2.84Z"/>
  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.67 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/>
</svg>`;

let openEl = null; // un solo modale per volta

export function openAuthModal({ step = 'auth', redirect = '' } = {}) {
  if (openEl) return;
  const logged = !!currentUser();
  const startZone = step === 'zone' || logged; // se già loggato, il modale serve solo per la zona

  const wrap = document.createElement('div');
  wrap.className = 'auth-modal' + (startZone ? ' step-zone' : '');
  wrap.innerHTML = `
  <style>
    .auth-modal{ position:fixed; inset:0; z-index:1000; display:flex; align-items:flex-end; justify-content:center;
      opacity:0; transition:opacity .22s ease; }
    .auth-modal.open{ opacity:1; }
    .auth-modal .am-backdrop{ position:absolute; inset:0; background:rgba(20,14,8,.5);
      -webkit-backdrop-filter:blur(3px); backdrop-filter:blur(3px); }
    .auth-modal .am-sheet{ position:relative; width:100%; max-width:440px; background:var(--bianco);
      border-radius:26px 26px 0 0; padding:14px 22px calc(env(safe-area-inset-bottom,0px) + 20px);
      box-shadow:0 -10px 50px -12px rgba(20,14,8,.5); transform:translateY(18px);
      transition:transform .24s cubic-bezier(.2,.8,.2,1); max-height:92dvh; overflow:auto;
      -webkit-overflow-scrolling:touch; }
    .auth-modal.open .am-sheet{ transform:translateY(0); }
    .auth-modal .am-grab{ width:38px; height:5px; border-radius:100px; background:var(--bd3); margin:0 auto 14px; }
    .auth-modal .am-x{ position:absolute; top:14px; right:14px; width:34px; height:34px; border-radius:50%;
      border:none; background:var(--carta); color:var(--muted); display:flex; align-items:center; justify-content:center; cursor:pointer; }
    .auth-modal .am-x:active{ background:var(--carta-scura); }
    .auth-modal .am-title{ font-family:var(--serif); font-weight:600; font-size:24px; letter-spacing:-.012em;
      color:var(--ink); text-align:center; margin:0; }
    .auth-modal .am-sub{ margin:7px 6px 18px; font-size:13.5px; line-height:1.5; color:var(--muted); text-align:center; }

    .auth-modal .am-step{ display:none; }
    .auth-modal:not(.step-zone) .am-auth{ display:block; }
    .auth-modal.step-zone .am-zone{ display:block; }

    .auth-modal .am-btn{ width:100%; height:54px; border:1px solid var(--bd3); border-radius:var(--r-input);
      background:#fff; display:flex; align-items:center; justify-content:center; gap:11px; font-family:var(--sans);
      font-size:15.5px; font-weight:600; color:var(--ink); cursor:pointer; }
    .auth-modal .am-btn:active{ background:var(--carta); }
    .auth-modal .am-btn[disabled]{ opacity:.62; cursor:default; }
    .auth-modal .am-btn .glogo{ width:20px; height:20px; flex:none; }
    .auth-modal .am-btn .soon-pill{ margin-left:6px; font-size:10px; font-weight:700; letter-spacing:.06em;
      text-transform:uppercase; color:var(--terra-deep); background:var(--terra-pale); padding:2px 7px; border-radius:100px; }
    .auth-modal .am-gwrap{ position:relative; min-height:54px; }
    .auth-modal .am-gwrap > div{ display:flex; justify-content:center; }

    .auth-modal .am-or{ display:flex; align-items:center; gap:12px; margin:15px 0; }
    .auth-modal .am-or .ln{ flex:1; height:1px; background:var(--bd2); }
    .auth-modal .am-or span{ font-size:11px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--faint); }

    .auth-modal .am-email{ display:flex; align-items:center; gap:10px; height:54px; background:var(--bianco);
      border:1px solid var(--bd); border-radius:var(--r-input); padding:0 6px 0 15px; transition:border-color .14s, box-shadow .14s; }
    .auth-modal .am-email:focus-within{ border-color:var(--verde); box-shadow:0 0 0 3px var(--verde-pale); }
    .auth-modal .am-email.err{ border-color:var(--red-alert); box-shadow:0 0 0 3px rgba(214,69,69,.12); }
    .auth-modal .am-email .ic{ color:var(--terra-deep); flex:none; }
    .auth-modal .am-email input{ flex:1; min-width:0; border:none; background:transparent; font-family:var(--sans);
      font-size:15px; color:var(--ink); padding:14px 0; }
    .auth-modal .am-email input::placeholder{ color:var(--faint); }
    .auth-modal .am-email input:focus{ outline:none; }
    .auth-modal .am-go{ width:42px; height:42px; flex:none; border:none; border-radius:13px; background:var(--grad-azione);
      color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer;
      box-shadow:0 6px 16px -8px rgba(22,163,74,.7); }
    .auth-modal .am-go:active{ transform:translateY(1px); }
    .auth-modal .am-go[disabled]{ opacity:.6; }
    /* --- password + submit + switch (auth v2) --- */
    .auth-modal .am-field{ margin-top:10px; }
    .auth-modal .am-eye{ width:38px; height:38px; flex:none; border:none; background:none; color:var(--faint);
      display:flex; align-items:center; justify-content:center; cursor:pointer; border-radius:10px; }
    .auth-modal .am-eye:active{ background:var(--carta); }
    .auth-modal .am-hint{ font-size:11px; color:var(--faint); margin:8px 2px 0; }
    .auth-modal .am-submit{ width:100%; height:52px; margin-top:14px; border:none; border-radius:var(--r-input);
      background:var(--grad-azione); color:#fff; font-family:var(--sans); font-size:15.5px; font-weight:600;
      cursor:pointer; box-shadow:0 12px 26px -12px rgba(22,163,74,.7); }
    .auth-modal .am-submit:active{ transform:translateY(1px); }
    .auth-modal .am-submit[disabled]{ opacity:.6; cursor:default; }
    .auth-modal .am-switch{ text-align:center; font-size:13px; color:var(--muted); margin:14px 2px 0; }
    .auth-modal .am-switch a{ color:var(--verde-deep); font-weight:600; text-decoration:none; cursor:pointer; }
    .auth-modal .am-msg{ min-height:16px; margin:7px 2px 0; font-size:12px; line-height:1.4; color:var(--red-alert); text-align:left; }
    .auth-modal .am-legal{ margin:12px 6px 2px; font-size:11px; line-height:1.55; color:var(--faint); text-align:center; }
    .auth-modal .am-legal a{ color:var(--muted); text-decoration:underline; }

    /* --- zona --- */
    .auth-modal .am-geo{ width:100%; height:50px; margin:2px 0 4px; border:1px solid var(--bd); border-radius:var(--r-input);
      background:var(--bianco); color:var(--verde-deep); display:flex; align-items:center; justify-content:center; gap:9px;
      font-size:14.5px; font-weight:600; cursor:pointer; }
    .auth-modal .am-geo:active{ background:var(--carta); }
    .auth-modal .am-geo[disabled]{ opacity:.6; }
    .auth-modal .am-zsearch{ display:flex; align-items:center; gap:10px; height:50px; margin:12px 0 4px; background:var(--bianco);
      border:1px solid var(--bd); border-radius:var(--r-input); padding:0 14px; }
    .auth-modal .am-zsearch .ic{ color:var(--terra-deep); flex:none; }
    .auth-modal .am-zsearch input{ flex:1; min-width:0; border:none; background:transparent; font-family:var(--sans);
      font-size:15px; color:var(--ink); }
    .auth-modal .am-zsearch input:focus{ outline:none; }
    .auth-modal .am-zlist{ max-height:44vh; overflow:auto; margin:8px -4px 0; padding:0 4px; -webkit-overflow-scrolling:touch; }
    .auth-modal .am-zrow{ display:flex; align-items:center; gap:11px; width:100%; text-align:left; background:none; border:none;
      border-bottom:1px solid var(--bd2); padding:13px 4px; font-family:inherit; color:var(--ink); cursor:pointer; }
    .auth-modal .am-zrow:last-child{ border-bottom:none; }
    .auth-modal .am-zrow:active{ background:var(--carta); }
    .auth-modal .am-zrow .zr-name{ flex:1; font-size:15px; font-weight:500; }
    .auth-modal .am-zrow.is-active .zr-name{ font-weight:600; }
    .auth-modal .am-zrow.is-selected{ background:var(--verde-pale); border-radius:12px; } .auth-modal .am-zrow.is-selected .zr-name{ font-weight:600; }
    .auth-modal .am-zpill{ flex:none; display:inline-flex; align-items:center; gap:5px; font-size:10.5px; font-weight:700;
      letter-spacing:.04em; text-transform:uppercase; color:var(--verde-deep); background:var(--verde-pale); padding:3px 9px; border-radius:100px; }
    .auth-modal .am-zsoon{ flex:none; font-size:10.5px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--faint); }
    .auth-modal .am-zempty{ display:none; padding:22px 8px; text-align:center; font-size:13.5px; line-height:1.5; color:var(--muted); }

    @media(min-width:1024px){
      .auth-modal{ align-items:center; }
      .auth-modal .am-sheet{ border-radius:26px; max-width:420px; margin:0 20px; }
      .auth-modal .am-grab{ display:none; }
    }
    @media(prefers-reduced-motion:reduce){ .auth-modal, .auth-modal .am-sheet{ transition:none; } }
  </style>

  <div class="am-backdrop" data-close></div>
  <div class="am-sheet" role="dialog" aria-modal="true" aria-label="${t('auth.dialogAria')}">
    <button class="am-x" data-close aria-label="${t('auth.close')}">${Icon('x', { size: 18 })}</button>
    <div class="am-grab" aria-hidden="true"></div>

    <!-- STEP 1 · accesso (email+password + Google, login-first + link registrati) -->
    <div class="am-step am-auth">
      <h2 class="am-title" data-auth-title>${t('auth.loginTitle')}</h2>
      <p class="am-sub" data-auth-sub>${t('auth.loginSub')}</p>
      <div class="am-gwrap" data-google></div>
      <div class="am-or"><span class="ln"></span><span>${t('auth.or')}</span><span class="ln"></span></div>
      <form data-email-form novalidate>
        <label class="am-email" data-email-box>
          <span class="ic">${Icon('mail', { size: 19, stroke: 2 })}</span>
          <input type="email" name="email" inputmode="email" autocomplete="email" spellcheck="false"
            placeholder="${t('auth.emailPlaceholder')}" aria-label="${t('auth.emailPlaceholder')}">
        </label>
        <label class="am-email am-field" data-pass-box>
          <span class="ic">${Icon('lock', { size: 19, stroke: 2 })}</span>
          <input type="password" name="password" autocomplete="current-password"
            placeholder="${t('auth.password')}" aria-label="${t('auth.password')}" data-pass>
          <button class="am-eye" type="button" data-eye aria-label="${t('auth.showPassword')}">${Icon('eye', { size: 19 })}</button>
        </label>
        <p class="am-hint" data-hint hidden>${t('auth.passwordMin')}</p>
        <button class="am-submit" type="submit" data-auth-submit>${t('auth.login')}</button>
      </form>
      <p class="am-msg" data-msg role="status" aria-live="polite"></p>
      <p class="am-switch"><span data-switch-txt>${t('auth.noAccount')}</span> <a data-auth-toggle role="button" tabindex="0">${t('auth.register')}</a></p>
      <p class="am-legal">${t('auth.legal', { terms: `<a href="#/termini" data-close>${t('settings.terms')}</a>`, privacy: `<a href="#/privacy" data-close>${t('auth.privacyLabel')}</a>` })}</p>
    </div>

    <!-- STEP 2 · zona -->
    <div class="am-step am-zone">
      <h2 class="am-title">${t('auth.zoneTitle1')} <em style="font-style:italic;color:var(--verde)">${t('auth.zoneTitleEm')}</em></h2>
      <p class="am-sub">${t('auth.zoneSub')}</p>
      <button class="am-geo" type="button" data-geo>${Icon('crosshair', { size: 18, color: 'var(--verde-deep)', stroke: 2 })} ${t('auth.useLocation')}</button>
      <label class="am-zsearch">
        <span class="ic">${Icon('search', { size: 18, stroke: 2 })}</span>
        <input type="text" inputmode="search" placeholder="${t('auth.searchRegion')}" aria-label="${t('auth.searchRegion')}" data-zq>
      </label>
      <div class="am-zlist" data-zlist role="listbox" aria-label="Regioni"></div>
      <p class="am-zempty" data-zempty>${t('auth.noRegion')}</p>
      <p class="am-msg" data-zmsg role="status" aria-live="polite"></p>
    </div>
  </div>`;

  document.body.appendChild(wrap);
  openEl = wrap;
  requestAnimationFrame(() => wrap.classList.add('open'));

  const close = () => {
    wrap.classList.remove('open');
    document.removeEventListener('keydown', onEsc);
    setTimeout(() => { wrap.remove(); if (openEl === wrap) openEl = null; }, 240);
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));

  const goZoneStep = () => {
    wrap.classList.add('step-zone');
    const q = wrap.querySelector('[data-zq]'); if (q) setTimeout(() => q.focus(), 60);
  };
  const enterApp = () => {
    close();
    const targetHash = redirect || '#/home';
    // Assegnare un hash diverso genera gia l'evento nativo. Il dispatch manuale serve
    // soltanto quando restiamo sulla stessa rotta, altrimenti il router partirebbe due volte.
    if (location.hash === targetHash) {
      setTimeout(() => window.dispatchEvent(new Event('hashchange')), 30);
    } else {
      location.hash = targetHash;
    }
  };

  const msgEl = wrap.querySelector('[data-msg]');
  const setMsg = (t, ok = false) => { if (msgEl) { msgEl.textContent = t || ''; msgEl.style.color = ok ? 'var(--verde-deep)' : 'var(--red-alert)'; } };

  // ---- email + password (login / registrazione, login-first) ----
  let mode = 'login'; // 'login' | 'register'
  const form = wrap.querySelector('[data-email-form]');
  const emailBox = wrap.querySelector('[data-email-box]');
  const passBox = wrap.querySelector('[data-pass-box]');
  const input = form && form.querySelector('input[name="email"]');
  const passInput = form && form.querySelector('input[name="password"]');
  const submitBtn = wrap.querySelector('[data-auth-submit]');
  const titleEl = wrap.querySelector('[data-auth-title]');
  const subEl = wrap.querySelector('[data-auth-sub]');
  const hintEl = wrap.querySelector('[data-hint]');
  const switchTxt = wrap.querySelector('[data-switch-txt]');
  const toggleLink = wrap.querySelector('[data-auth-toggle]');
  const eyeBtn = wrap.querySelector('[data-eye]');

  function paintMode() {
    const reg = mode === 'register';
    if (titleEl) titleEl.textContent = t(reg ? 'auth.registerTitle' : 'auth.loginTitle');
    if (subEl) subEl.textContent = t(reg ? 'auth.registerSub' : 'auth.loginSub');
    if (submitBtn) submitBtn.textContent = t(reg ? 'auth.createAccount' : 'auth.login');
    if (passInput) { passInput.placeholder = t(reg ? 'auth.passwordCreate' : 'auth.password'); passInput.setAttribute('autocomplete', reg ? 'new-password' : 'current-password'); }
    if (hintEl) hintEl.hidden = !reg;
    if (switchTxt) switchTxt.textContent = t(reg ? 'auth.haveAccount' : 'auth.noAccount');
    if (toggleLink) toggleLink.textContent = t(reg ? 'auth.login' : 'auth.register');
    setMsg('');
  }
  paintMode();

  if (toggleLink) {
    const doToggle = () => { mode = (mode === 'login') ? 'register' : 'login'; paintMode(); (input && !input.value ? input : passInput).focus(); };
    toggleLink.addEventListener('click', (e) => { e.preventDefault(); doToggle(); });
    toggleLink.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doToggle(); } });
  }
  if (eyeBtn && passInput) eyeBtn.addEventListener('click', () => { passInput.type = passInput.type === 'password' ? 'text' : 'password'; });

  // Errore localizzato in base allo status del server (401 credenziali · 409 email esistente · 400 password).
  const authErr = (e) => (e && e.status === 401) ? t('auth.wrongCredentials')
    : (e && e.status === 409) ? t('auth.emailExists')
    : (e && e.status === 400) ? t('auth.passwordTooShort')
    : ((e && e.message) || t('common.retry'));

  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = (input.value || '').trim();
      const pw = passInput ? passInput.value : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { emailBox.classList.add('err'); setMsg(t('auth.invalidEmail')); input.focus(); return; }
      if (!pw) { passBox.classList.add('err'); setMsg(t('auth.passwordRequired')); passInput.focus(); return; }
      if (mode === 'register' && pw.length < 8) { passBox.classList.add('err'); setMsg(t('auth.passwordTooShort')); passInput.focus(); return; }
      emailBox.classList.remove('err'); passBox.classList.remove('err'); setMsg('');
      submitBtn.disabled = true; input.disabled = true; passInput.disabled = true;
      try {
        if (mode === 'register') await registerPassword(email, pw); else await loginPassword(email, pw);
        goZoneStep();
      } catch (e) {
        submitBtn.disabled = false; input.disabled = false; passInput.disabled = false;
        setMsg(authErr(e));
      }
    });
    [input, passInput].forEach((el) => el && el.addEventListener('input', () => { emailBox.classList.remove('err'); passBox.classList.remove('err'); if (msgEl && msgEl.textContent) setMsg(''); }));
  }

  // ---- Google reale ----
  const gwrap = wrap.querySelector('[data-google]');
  const fallbackBtn = (label, { disabled = false, soon = false } = {}) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'am-btn'; if (disabled) b.disabled = true;
    b.innerHTML = `${googleLogoSvg}<span>${label}</span>${soon ? `<span class="soon-pill">${t('auth.soon')}</span>` : ''}`;
    return b;
  };
  if (gwrap) {
    gwrap.appendChild(fallbackBtn(t('auth.google')));
    const handleCredential = async (response) => {
      if (!response || !response.credential) return;
      setMsg(t('auth.signingIn'), true);
      try { await signInWithGoogle(response.credential); goZoneStep(); }
      catch (e) { setMsg(t('auth.googleFailed', { err: e.message || t('common.retry') })); }
    };
    authConfig().then(({ googleClientId } = {}) => {
      if (!gwrap.isConnected) return;
      const clientId = isRealClientId(googleClientId) ? googleClientId : GOOGLE_CLIENT_ID_FALLBACK;
      if (!isRealClientId(clientId)) {
        gwrap.innerHTML = '';
        const b = fallbackBtn(t('auth.google'), { disabled: true, soon: true });
        b.title = t('auth.googleSoonTitle');
        gwrap.appendChild(b);
        return;
      }
      loadGsi().then(() => {
        if (!gwrap.isConnected) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential, ux_mode: 'popup', auto_select: false });
        gwrap.innerHTML = '';
        window.google.accounts.id.renderButton(gwrap, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width: Math.min(gwrap.clientWidth || 320, 400) });
      }).catch(() => {
        if (!gwrap.isConnected) return;
        gwrap.innerHTML = '';
        const b = fallbackBtn(t('auth.google'), { disabled: true });
        b.title = t('auth.googleUnavailable');
        gwrap.appendChild(b);
      });
    });
  }

  // ===== STEP 2 · zona =====
  const activeId = activeZoneId();
  const activeZoneObj = getState().zone || { id: 'alta-val-di-sangro', label: 'Alta Val di Sangro', comuni: [] };
  const activeLabel = activeZoneObj.label || 'Alta Val di Sangro';
  const zoneObjFor = (regionName) => regionName === 'Abruzzo'
    ? { id: activeId || activeZoneObj.id || 'alta-val-di-sangro', label: activeLabel, region: 'Abruzzo', comuni: activeZoneObj.comuni || [] }
    : { id: regionName, label: regionName, region: regionName, comuni: [] };
  const zlist = wrap.querySelector('[data-zlist]');
  const zempty = wrap.querySelector('[data-zempty]');
  const zmsg = wrap.querySelector('[data-zmsg]');
  const zq = wrap.querySelector('[data-zq]');
  const setZMsg = (t, ok = false) => { if (zmsg) { zmsg.textContent = t || ''; zmsg.style.color = ok ? 'var(--verde-deep)' : 'var(--red-alert)'; } };

  const chooseZone = async (regionName, btn) => {
    setZMsg('');
    if (btn) btn.disabled = true;
    try { await setZone(zoneObjFor(regionName)); enterApp(); }
    catch (e) { if (btn) btn.disabled = false; setZMsg(t('auth.saveZoneError', { err: e.message || t('common.retry') })); }
  };

  if (zlist) {
    const _uz = (currentUser() && currentUser().zone) || null;
    const currentRegion = _uz ? (_uz.region || _uz.label || '') : '';
    zlist.innerHTML = REGIONI.map(name => {
      const active = name === 'Abruzzo';
      const selected = currentRegion && name.toLowerCase() === String(currentRegion).toLowerCase();
      const sub = active ? ` · ${activeLabel}` : '';
      const tail = active
        ? `<span class="am-zpill">${Icon('check-circle', { size: 12, color: 'var(--verde)', stroke: 2.3 })} ${t('auth.zoneActive')}</span>`
        : (selected ? `<span class="am-zsoon">${t('auth.zoneSelectedSoon')}</span>` : `<span class="am-zsoon">${t('auth.zoneSoon')}</span>`);
      return `<button class="am-zrow ${active ? 'is-active' : ''} ${selected ? 'is-selected' : ''}" role="option" aria-selected="${selected ? 'true' : 'false'}" data-zrow data-zname="${name}">
        <span class="zr-pin">${Icon('map-pin', { size: 18, color: (active || selected) ? 'var(--verde-deep)' : 'var(--faint2)', stroke: 2 })}</span>
        <span class="zr-name">${name}${sub}</span>${tail}</button>`;
    }).join('');
    zlist.querySelectorAll('[data-zrow]').forEach(b => b.addEventListener('click', () => chooseZone(b.dataset.zname, b)));
    if (zq) zq.addEventListener('input', () => {
      const q = zq.value.trim().toLowerCase();
      let shown = 0;
      zlist.querySelectorAll('[data-zrow]').forEach(r => { const m = !q || r.dataset.zname.toLowerCase().includes(q); r.style.display = m ? '' : 'none'; if (m) shown++; });
      if (zempty) zempty.style.display = (q && shown === 0) ? 'block' : 'none';
    });
  }

  const geoBtn = wrap.querySelector('[data-geo]');
  if (geoBtn) geoBtn.addEventListener('click', () => {
    if (!navigator.geolocation) { setZMsg(t('auth.geoUnavailable')); return; }
    const old = geoBtn.innerHTML; geoBtn.disabled = true;
    geoBtn.innerHTML = `${Icon('navigation', { size: 18, color: 'var(--verde-deep)', stroke: 2 })} ${t('auth.locating')}`;
    const restore = () => { geoBtn.disabled = false; geoBtn.innerHTML = old; };
    // Zona coperta oggi (Alta Val di Sangro, centro ~[13.934,41.776]): bounding box.
    const inCovered = (lat, lng) => lat >= 41.55 && lat <= 42.05 && lng >= 13.65 && lng <= 14.25;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;   // ← ora usa le coordinate REALI
        if (inCovered(lat, lng)) { chooseZone('Abruzzo'); return; }
        // Fuori dalla zona coperta: prova a riconoscere la regione reale (reverse-geocoding leggero, senza chiave).
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=it&zoom=8`, { headers: { Accept: 'application/json' } });
          if (!r.ok) throw new Error('geo');
          const d = await r.json();
          const region = (d.address && (d.address.state || d.address.region)) || '';
          const match = REGIONI.find(x => x.toLowerCase() === String(region).toLowerCase());
          if (match) { chooseZone(match); return; }              // regione riconosciuta → "presto nella tua zona"
          restore(); setZMsg(t('auth.geoOutside'));
        } catch (e) {
          restore(); setZMsg(t('auth.geoNoRegion'));
        }
      },
      () => { restore(); setZMsg(t('auth.geoNoPosition')); },
      { timeout: 9000, enableHighAccuracy: false, maximumAge: 60000 }
    );
  });
}
