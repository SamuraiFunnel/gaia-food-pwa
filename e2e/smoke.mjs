// E2E smoke — il flusso critico end-to-end, con Chrome headless via CDP.
// Boota il server reale (requestHandler) su porta effimera + dati usa-e-getta, poi guida un
// Chrome ISOLATO (proprio --user-data-dir: NON tocca il Chrome di Daniele) attraverso:
//   Splash → login → zona → Home (anche con 0 produttori) → Rete Gaia → pubblicazione locale
//   → reload autenticato sulla stessa route → cambio lingua.
// Fuori da test/ apposta: richiede un browser, quindi NON gira in `npm test`. Lancialo con `npm run test:e2e`.
// Uscita 0 = tutto verde; 1 = qualcosa non va (salva uno screenshot di debug).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- server reale su porta effimera, dati isolati ----
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-e2e-'));
process.env.GF_DATA_DIR = DATA;
const { requestHandler } = await import('../server.js');
const server = http.createServer(requestHandler);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const APP = `http://127.0.0.1:${server.address().port}`;

// ---- Chrome headless isolato ----
const DBG = 9400 + Math.floor(Math.random() * 400);
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-e2e-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions',
  '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' });

let ws, idc = 0;
function rpc(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++idc;
    const on = (e) => { const x = JSON.parse(e.data); if (x.id === id) { ws.removeEventListener('message', on); x.error ? rej(new Error(x.error.message)) : res(x.result); } };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expr, aw = false) {
  const r = await rpc('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: aw });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr.slice(0, 80));
  return r.result.value;
}
// Attende che una espressione JS diventi truthy (o va in timeout).
async function waitFor(expr, label, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(`!!(${expr})`)) return; await sleep(150); }
  throw new Error(`timeout in attesa di: ${label}`);
}
async function waitForAsync(expr, label, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(`Promise.resolve(${expr}).then(Boolean).catch(()=>false)`, true)) return;
    await sleep(150);
  }
  throw new Error(`timeout in attesa di: ${label}`);
}

const steps = [];
const logs = [];
const ok = (m) => { steps.push('  ✓ ' + m); };

async function shot(file) {
  try { const s = await rpc('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(s.data, 'base64')); return file; } catch { return null; }
}
async function auditSocialViewport(width, height, rootSelector, name) {
  const mobile = width < 1024;
  await rpc('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await sleep(260);
  const report = await ev(`(()=>{const root=document.querySelector(${JSON.stringify(rootSelector)}),center=root?.querySelector('.socialA-center'),shell=root?.querySelector('.socialA-shell'),topbar=root?.querySelector('.socialA-topbar'),topframe=root?.querySelector('.socialA-topbar-frame'),nav=root?.querySelector('.socialA-mobile-nav');if(!root||!center||!shell||!topbar||!topframe||!nav)return null;const rr=root.getBoundingClientRect(),cr=center.getBoundingClientRect(),sr=shell.getBoundingClientRect(),tr=topframe.getBoundingClientRect();return {innerWidth,scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),root:{left:rr.left,right:rr.right},center:{left:cr.left,right:cr.right,width:cr.width},shell:{left:sr.left,right:sr.right,width:sr.width},topframe:{left:tr.left,right:tr.right,width:tr.width},topbarVisible:getComputedStyle(topbar).display!=='none'&&tr.height>0,mobileNavVisible:getComputedStyle(nav).display!=='none'};})()`);
  if (!report || report.scrollWidth > width + 1 || report.root.left < -1 || report.root.right > width + 1 || report.center.left < -1 || report.center.right > width + 1 || report.shell.left < -1 || report.shell.right > width + 1 || (mobile ? (!report.mobileNavVisible || report.topbarVisible) : (report.mobileNavVisible || !report.topbarVisible))) {
    throw new Error(`layout social ${name} non valido a ${width}px: ` + JSON.stringify(report));
  }
  await shot(path.join(os.tmpdir(), `gf-e2e-social-${name}-${width}.png`));
  return report;
}

async function assertNoAtlas(label, settleMs = 260) {
  if (await ev(`!!document.querySelector('[data-gaia-atlas-transition]')`)) {
    throw new Error(`${label}: loader Atlante inatteso`);
  }
  await sleep(settleMs);
  if (await ev(`!!document.querySelector('[data-gaia-atlas-transition]')`)) {
    throw new Error(`${label}: loader Atlante apparso durante una navigazione interna`);
  }
}

async function armAtlasClock(target) {
  const key = `__gfAtlasClock${Date.now()}${Math.floor(Math.random() * 10000)}`;
  await ev(`(()=>{const key=${JSON.stringify(key)},target=${JSON.stringify(target)},clock={target,armedAt:performance.now(),appearedAt:null};const detect=()=>{const root=document.querySelector('[data-gaia-atlas-transition][data-gaia-atlas-target="'+target+'"]');if(!root)return false;clock.appearedAt=performance.now();return true;};window[key]=clock;if(detect())return;const observer=new MutationObserver(()=>{if(detect())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});clock.observer=observer;})()`);
  return key;
}

async function atlasElapsedFromAppearance(clockKey, lifecycle) {
  const clock = await ev(`window[${JSON.stringify(clockKey)}] && ({target:window[${JSON.stringify(clockKey)}].target,appearedAt:window[${JSON.stringify(clockKey)}].appearedAt})`);
  if (!clock?.appearedAt || !Number.isFinite(lifecycle?.finishedAt)) throw new Error('clock Atlante incompleto: ' + JSON.stringify({ clock, lifecycle }));
  return lifecycle.finishedAt - clock.appearedAt;
}

async function beginAtlasAudit(target, mode, label) {
  await waitFor(`document.querySelectorAll('[data-gaia-atlas-transition]').length===1 && document.querySelector('[data-gaia-atlas-transition]')?.dataset.gaiaAtlasTarget===${JSON.stringify(target)}`, label, 3000);
  const key = `__gfAtlasAudit${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const contract = await ev(`(()=>{const root=document.querySelector('[data-gaia-atlas-transition]'),meter=root?.querySelector('[role="progressbar"]');return root&&{
    overlays:document.querySelectorAll('[data-gaia-atlas-transition]').length,
    target:root.dataset.gaiaAtlasTarget,
    targetClass:root.classList.contains(${JSON.stringify(target === 'community' ? 'is-community' : 'is-app')}),
    maps:root.querySelectorAll('.gaia-atlas-map').length,
    nodes:root.querySelectorAll('[data-gaia-atlas-node]').length,
    lockups:root.querySelectorAll('.gf-lockup').length,
    oldIntros:document.querySelectorAll('.socialA-intro').length,
    progress:{role:meter?.getAttribute('role'),min:meter?.getAttribute('aria-valuemin'),max:meter?.getAttribute('aria-valuemax'),now:meter?.getAttribute('aria-valuenow'),text:meter?.getAttribute('aria-valuetext')},
    stage:!!root.querySelector('[data-gaia-atlas-stage]'),percent:!!root.querySelector('[data-gaia-atlas-percent]'),skip:!!root.querySelector('[data-gaia-atlas-skip]'),
    appInert:document.querySelector('#app')?.hasAttribute('inert'),railInert:document.querySelector('#rail')?.hasAttribute('inert'),
    appHidden:document.querySelector('#app')?.getAttribute('aria-hidden'),railHidden:document.querySelector('#rail')?.getAttribute('aria-hidden')
  };})()`);
  if (!contract || contract.overlays !== 1 || contract.target !== target || !contract.targetClass || contract.maps !== 1 || contract.nodes !== 3 || contract.lockups !== 1 || contract.oldIntros !== 0 || contract.progress.role !== 'progressbar' || contract.progress.min !== '0' || contract.progress.max !== '100' || !contract.progress.text || !contract.stage || !contract.percent || !contract.skip || !contract.appInert || !contract.railInert || contract.appHidden !== 'true' || contract.railHidden !== 'true') {
    throw new Error(`${label}: contratto Atlante non rispettato: ` + JSON.stringify(contract));
  }
  await ev(`(()=>{const key=${JSON.stringify(key)},root=document.querySelector('[data-gaia-atlas-transition]'),meter=root.querySelector('[role="progressbar"]');const audit={target:${JSON.stringify(target)},mode:${JSON.stringify(mode)},startedAt:performance.now(),values:[],stages:[],final:null,event:null};const sample=()=>{const value=Number(meter.getAttribute('aria-valuenow'));if(Number.isFinite(value)&&audit.values.at(-1)!==value)audit.values.push(value);const stage=meter.getAttribute('aria-valuetext')||'';if(stage&&audit.stages.at(-1)!==stage)audit.stages.push(stage);if(value===100)audit.final={activeNodes:root.querySelectorAll('[data-gaia-atlas-node].is-active').length,percent:root.querySelector('[data-gaia-atlas-percent]')?.textContent.trim(),css:root.style.getPropertyValue('--gaia-atlas-progress').trim(),bar:root.querySelector('.gaia-atlas-progress-bar')?.style.width};};sample();const observer=new MutationObserver(sample);observer.observe(root,{subtree:true,attributes:true,childList:true,characterData:true});window.addEventListener('gf:gaia-transition-finished',event=>{audit.event=event.detail;audit.finishedAt=performance.now();observer.disconnect();},{once:true});window[key]=audit;})()`);
  return key;
}

async function auditAtlasViewport(width, height, key) {
  const mobile = width < 821;
  await rpc('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await sleep(70);
  const report = await ev(`(()=>{const root=document.querySelector('[data-gaia-atlas-transition]'),map=root?.querySelector('.gaia-atlas-map');if(!root||!map)return null;const rr=root.getBoundingClientRect(),mr=map.getBoundingClientRect();return {innerWidth,innerHeight,scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),scrollHeight:document.documentElement.scrollHeight,root:{left:rr.left,top:rr.top,right:rr.right,bottom:rr.bottom},map:{left:mr.left,right:mr.right,width:mr.width},overlays:document.querySelectorAll('[data-gaia-atlas-transition]').length,maps:root.querySelectorAll('.gaia-atlas-map').length};})()`);
  if (!report || report.overlays !== 1 || report.maps !== 1 || report.scrollWidth > width + 1 || report.root.left < -1 || report.root.top < -1 || report.root.right > width + 1 || report.root.bottom > height + 1 || report.map.left < -1 || report.map.right > width + 1) {
    throw new Error(`loader Atlante non responsive a ${width}px: ` + JSON.stringify(report));
  }
  await shot(path.join(os.tmpdir(), `gf-e2e-atlas-${key}-${width}.png`));
}

async function finishAtlasAudit(key, { timeout = 7500, expectFocus = true } = {}) {
  await waitFor(`!document.querySelector('[data-gaia-atlas-transition]') && !!window[${JSON.stringify(key)}]?.event`, 'fine loader Atlante', timeout);
  const result = await ev(`window[${JSON.stringify(key)}]`);
  const values = result?.values || [];
  const monotonic = values.every((value, index) => index === 0 || value >= values[index - 1]);
  const restored = await ev(`(()=>{const active=document.activeElement,style=active&&getComputedStyle(active);return {appInert:document.querySelector('#app')?.hasAttribute('inert'),railInert:document.querySelector('#rail')?.hasAttribute('inert'),appHidden:document.querySelector('#app')?.hasAttribute('aria-hidden'),railHidden:document.querySelector('#rail')?.hasAttribute('aria-hidden'),focusInApp:document.querySelector('#app')?.contains(active),focusInert:!!active?.closest('[inert]'),focusVisible:!!active?.getClientRects().length&&style?.display!=='none'&&style?.visibility!=='hidden',focusTag:active?.tagName,focusText:active?.textContent?.trim()};})()`);
  if (!result || result.event?.target !== result.target || result.event?.mode !== result.mode || !values.length || !monotonic || values.at(-1) !== 100 || result.final?.activeNodes !== 3 || result.final?.percent !== '100%' || result.final?.css !== '100%' || result.final?.bar !== '100%' || restored.appInert || restored.railInert || restored.appHidden || restored.railHidden || (expectFocus && (!restored.focusInApp || restored.focusInert || !restored.focusVisible))) {
    throw new Error('lifecycle Atlante incompleto: ' + JSON.stringify({ result, restored, monotonic }));
  }
  return { ...result, elapsed: result.finishedAt - result.startedAt, restored };
}
function cleanup() {
  try { ws && ws.close(); } catch {}
  try { chrome.kill('SIGKILL'); } catch {}          // solo la MIA istanza Chrome, per pid
  try { server.close(); } catch {}
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}

async function main() {
  // trova il target "page" del DevTools
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${DBG}/json`)).json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch {}
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('Chrome DevTools non raggiungibile (target page assente)');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  await rpc('Page.enable'); await rpc('Runtime.enable');
  ws.addEventListener('message', (e) => {
    const x = JSON.parse(e.data);
    if (x.method === 'Runtime.consoleAPICalled') logs.push('console.' + x.params.type + ': ' + (x.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '));
    if (x.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (x.params.exceptionDetails?.exception?.description || x.params.exceptionDetails?.text));
  });
  await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // 1) SPLASH pubblico con la CTA d'accesso
  await rpc('Page.navigate', { url: APP + '/#/' });
  await waitFor(`document.querySelector('.s02-cta')`, 'Splash con CTA');
  ok('Splash renderizzato con la CTA di accesso');

  // 1-bis) REGRESSIONE del fix SW: piantiamo un sentinel su window. Alla prima visita il SW prende
  // il controllo (claim); col vecchio bug la pagina si ricaricava e il sentinel sparirebbe. Col fix
  // (reload solo su AGGIORNAMENTO) il sentinel sopravvive → nessun reload indesiderato.
  const sentinel = 'gf-' + Date.now();
  await ev(`window.__gfSentinel = '${sentinel}'`);
  try { await waitFor(`navigator.serviceWorker && navigator.serviceWorker.controller`, 'SW claim', 5000); } catch {}
  await sleep(1200); // oltre la finestra del claim
  const survived = await ev(`window.__gfSentinel`);
  if (survived !== sentinel) throw new Error('reload indesiderato al primo avvio: il SW ha ricaricato al claim (fix non attivo)');
  ok('Nessun reload al primo avvio: il claim del SW non ricarica la pagina');

  // 2) la CTA apre il POP-UP (non naviga)
  await ev(`document.querySelector('.s02-cta').click()`);
  await waitFor(`document.querySelector('.auth-modal')`, 'pop-up di accesso aperto');
  if (await ev(`location.hash && location.hash !== '#/' ? true : false`)) throw new Error('la CTA ha navigato invece di aprire il pop-up');
  ok('La CTA apre il pop-up di accesso senza cambiare pagina');

  // 3) registrazione email+password → passo ZONA (POST /api/auth/register)
  await ev(`(()=>{const e=document.querySelector('.auth-modal input[name=email]'); e.value='e2e@test.it'; e.dispatchEvent(new Event('input',{bubbles:true}));
    const p=document.querySelector('.auth-modal input[name=password]'); p.value='e2ePassword1'; p.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await ev(`document.querySelector('.auth-modal [data-auth-toggle]').click()`);   // passa a "Registrati"
  await ev(`document.querySelector('.auth-modal [data-auth-submit]').click()`);
  await waitFor(`document.querySelector('.auth-modal.step-zone')`, 'passo Zona dopo la registrazione');
  ok('Registrazione email+password riuscita → si apre il passo "Dove ti trovi?"');

  // 4) scelgo Abruzzo → primo ingresso autenticato in Gaia Food. Atlante deve coprire
  // l'intera app con una sola visuale, rendere inerti le due shell e arrivare al 100%.
  const firstAppClock = await armAtlasClock('app');
  await ev(`document.querySelector('.auth-modal [data-zname="Abruzzo"]').click()`);
  await waitFor(`location.hash === '#/home'`, 'navigazione in Home');
  const firstAppAtlas = await beginAtlasAudit('app', 'entry', 'Atlante Gaia Food al primo ingresso autenticato');
  await auditAtlasViewport(390, 844, firstAppAtlas);
  await auditAtlasViewport(1024, 844, firstAppAtlas);
  await auditAtlasViewport(1440, 900, firstAppAtlas);
  await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const firstAppLifecycle = await finishAtlasAudit(firstAppAtlas);
  const firstAppDuration = await atlasElapsedFromAppearance(firstAppClock, firstAppLifecycle);
  if (firstAppDuration < 3200 || firstAppDuration > 3900) throw new Error('durata ingresso Gaia Food inattesa: ' + firstAppDuration);
  await waitFor(`document.querySelector('.screen.home.home-directory') && document.querySelector('.bottomnav')`, 'Home Scopri pronta con navigazione');
  const n = await ev(`document.querySelectorAll('[data-discover-list] a[href^="#/produttore/"]').length`);
  const nav = await ev(`!!document.querySelector('.bottomnav')`);
  if (!nav) throw new Error('bottom nav assente in Home');
  ok(`Primo ingresso Gaia Food: Atlante 0→100, tre nodi, shell inerte e responsive; Home usabile con ${n} produttori`);

  // Le route e i ridisegni interni allo stesso realm non devono riprodurre il loader.
  await ev(`location.hash='#/profilo'`);
  await waitFor(`location.hash==='#/profilo' && document.querySelector('[data-lang-open]')`, 'Profilo interno Gaia Food');
  await assertNoAtlas('Home → Profilo nello stesso realm');
  await ev(`location.hash='#/home'`);
  await waitFor(`location.hash==='#/home' && document.querySelector('.screen.home.home-directory')`, 'ritorno interno Home');
  await assertNoAtlas('Profilo → Home nello stesso realm');
  await ev(`import('./js/i18n.js').then(m=>m.setLang('it',{persist:false}))`, true);
  await waitFor(`document.querySelector('.screen.home.home-directory')`, 'rerender lingua Home');
  await assertNoAtlas('rerender nello stesso realm');
  ok('Navigazione e rerender interni a Gaia Food: nessun loader duplicato');

  // Il dialog di conferma è riusato anche dall'area amministrativa con nomi inseriti dagli utenti:
  // ogni stringa deve restare testo letterale, mai diventare markup eseguibile.
  const confirmXss = await ev(`(async()=>{const payload='<img src=x onerror="window.__gfConfirmXss=1">';window.__gfConfirmXss=0;const {confirmSheet}=await import('./js/components.js');const pending=confirmSheet(payload,{body:payload,okLabel:payload,cancelLabel:payload,danger:true});const dialog=document.querySelector('.gf-confirm-bd');const result={images:dialog.querySelectorAll('img').length,title:dialog.querySelector('.gf-confirm-t').textContent,body:dialog.querySelector('.gf-confirm-b').textContent,ok:dialog.querySelector('.gf-confirm-ok').textContent,cancel:dialog.querySelector('.gf-confirm-no').textContent};dialog.querySelector('.gf-confirm-no').click();await pending;result.executed=window.__gfConfirmXss;return result;})()`, true);
  if (!confirmXss || confirmXss.images !== 0 || confirmXss.executed !== 0 || ![confirmXss.title, confirmXss.body, confirmXss.ok, confirmXss.cancel].every(value => value.startsWith('<img'))) {
    throw new Error('confirmSheet interpreta input utente come HTML: ' + JSON.stringify(confirmXss));
  }
  ok('Conferme: testo utente neutralizzato, nessun markup eseguibile');

  // 5) la sessione è reale: /api/auth/me riconosce l'utente
  const me = await ev(`fetch('/api/auth/me').then(r=>r.json()).then(d=>d.user&&d.user.email)`, true);
  if (me !== 'e2e@test.it') throw new Error('sessione non riconosciuta dal backend, me=' + JSON.stringify(me));
  ok('Backend: /api/auth/me riconosce la sessione (e2e@test.it)');

  // 6) completa il profilo con una città reale. Usiamo lo store dell'app, così stato client e
  // server cambiano insieme esattamente come nella schermata profilo.
  const city = await ev(`import('./js/store.js').then(m=>m.updateProfile({city:'Terni'})).then(u=>u&&u.city)`, true);
  if (city !== 'Terni') throw new Error('città profilo non salvata, city=' + JSON.stringify(city));
  ok('Profilo test aggiornato con la città di Terni');

  // 7) percorso primario: Home → Community. È un cambio di realm e quindi usa lo stesso
  // Atlante, declinato Community; il vecchio loader fotografico non deve esistere.
  const postText = `E2E · consiglio sul cibo sano a Terni · ${Date.now()}`;
  await ev(`document.querySelector('.bottomnav a[href="#/comunita"]').click()`);
  const firstCommunityAtlas = await beginAtlasAudit('community', 'entry', 'Atlante Gaia Food Community');
  const communityTitle = await ev(`document.querySelector('.gaia-atlas-title')?.textContent.trim()`);
  if (communityTitle !== 'Gaia Food Community') throw new Error('titolo loader Community errato: ' + JSON.stringify(communityTitle));
  await finishAtlasAudit(firstCommunityAtlas);
  await waitFor(`location.hash==='#/comunita' && document.querySelector('.socialA-shell')`, 'Community pronta dopo Atlante');
  ok('Home → Community: Atlante condiviso, un solo overlay/visuale e progresso accessibile fino al 100%');
  const reteContract = await ev(`(()=>({
    scopes:[...document.querySelectorAll('[data-social-scope]')].map(b=>b.dataset.socialScope),
    labels:[...document.querySelectorAll('[data-social-scope]')].map(b=>b.textContent.trim()),
    following:[...document.querySelectorAll('[data-social-scope]')].some(b=>b.dataset.socialScope==='following'||/seguiti/i.test(b.textContent)),
    quick:!!document.querySelector('.socialA-quick-compose,[data-social-draft],[data-social-publish]'),
    backText:document.querySelector('[data-social-back-app],.socialA-back-app')?.textContent.trim()
  }))()`);
  if (JSON.stringify(reteContract.scopes) !== JSON.stringify(['for-you', 'nearby', 'producers']) ||
      JSON.stringify(reteContract.labels) !== JSON.stringify(['Per te', 'Vicino', 'Produttori']) ||
      reteContract.following || reteContract.quick || !/torna all.app/i.test(reteContract.backText || '')) {
    throw new Error('contratto Variante A non rispettato: ' + JSON.stringify(reteContract));
  }
  ok('Variante A: solo Per te, Vicino e Produttori; Seguiti e composer rapido assenti');

  await ev(`document.querySelector('[data-social-open-create]').click()`);
  await waitFor(`document.querySelector('.socialA-modal-backdrop.open [data-social-modal-draft]')`, 'composer testuale aperto da Crea');
  await ev(`(()=>{const d=document.querySelector('[data-social-modal-draft]');d.value=${JSON.stringify(postText)};d.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-social-modal-publish]').click();})()`);
  await waitFor(`[...document.querySelectorAll('[data-social-post]')].some(p=>[...p.querySelectorAll('.social-post-text,.text-card blockquote,.caption')].some(n=>n.textContent.includes(${JSON.stringify(postText)})))`, 'contenuto pubblicato nella Rete Gaia');

  // La località è un comportamento di prodotto, non solo una label tradotta: il server deve
  // proiettare il post come `city` e la card deve mostrare Terni nei metadati autore.
  const localPost = await ev(`fetch('/api/social/feed?scope=for-you').then(r=>r.json()).then(d=>{const p=d.posts.find(x=>x.text===${JSON.stringify(postText)});return p&&{locality:p.locality,city:p.location&&p.location.city};})`, true);
  const localMeta = await ev(`(()=>{const c=[...document.querySelectorAll('[data-social-post]')].find(x=>[...x.querySelectorAll('.social-post-text,.text-card blockquote,.caption')].some(n=>n.textContent.includes(${JSON.stringify(postText)})));return c&&c.querySelector('.social-author-meta,.post-meta')?.textContent;})()`);
  if (!localPost || localPost.locality !== 'city' || localPost.city !== 'Terni' || !String(localMeta || '').includes('Terni')) {
    throw new Error('contenuto non riconosciuto come locale: ' + JSON.stringify({ localPost, localMeta }));
  }
  ok('Rete Gaia: testo pubblicato e riconosciuto come contenuto locale di Terni');

  // 7-a) Il profilo Community è un editor reale e usa la stessa identità dell'app principale.
  // Verifichiamo anche un avatar sicuro, poi cambiamo il nome dalla schermata principale per
  // provare la sincronizzazione nel verso opposto.
  await ev(`document.querySelector('.socialA-mobile-nav a[href="#/comunita/profilo"]').click()`);
  await waitFor(`location.hash==='#/comunita/profilo' && document.querySelector('[data-social-profile-form]')`, 'Profilo Community');
  await assertNoAtlas('Feed → Profilo Community');
  if (!await ev(`document.body.classList.contains('app-social') && !!document.querySelector('.socialA-profile-screen .socialA-nav-item[aria-current="page"],.socialA-profile-screen .socialA-rail-profile[aria-current="page"],.socialA-profile-screen .socialA-mobile-nav [aria-current="page"]')`)) {
    throw new Error('Profilo Community non mantiene shell o navigazione attiva');
  }
  const socialProfile = { name: 'Gaia E2E Social', city: 'Terni Centro', phone: '+39 333 123 4567' };
  await ev(`(()=>{const f=document.querySelector('[data-social-profile-form]');for(const [name,value] of Object.entries(${JSON.stringify({ name: 'Gaia E2E Social', city: 'Terni Centro', phone: '+39 333 123 4567' })})){const i=f.elements[name];i.value=value;i.dispatchEvent(new Event('input',{bubbles:true}));}f.requestSubmit();})()`);
  await waitForAsync(`fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()).then(d=>d.user&&d.user.name==='Gaia E2E Social'&&d.user.city==='Terni Centro'&&d.user.phone==='+39 333 123 4567')`, 'profilo Community salvato sul backend');

  // Territorio deve prima persistere i campi correnti, poi aprire UNA sola volta il modale.
  // Il ritardo controllato rende osservabile l'ordine e prova anche il guard sul doppio click.
  await ev(`(()=>{window.__gfTerritoryRealFetch=window.fetch.bind(window);window.__gfTerritoryTrace=[];window.__gfTerritoryModalSeen=false;window.__gfTerritoryObserver=new MutationObserver(()=>{if(!window.__gfTerritoryModalSeen&&document.querySelector('.auth-modal.step-zone')){window.__gfTerritoryModalSeen=true;window.__gfTerritoryTrace.push({type:'modal'});}});window.__gfTerritoryObserver.observe(document.body,{childList:true,subtree:true});window.fetch=async(input,opts={})=>{const raw=typeof input==='string'?input:input.url;const url=new URL(raw,location.href);const method=String(opts.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();if(url.pathname==='/api/auth/profile'&&method==='PATCH'){window.__gfTerritoryTrace.push({type:'patch-start',body:JSON.parse(opts.body||'{}')});await new Promise(r=>setTimeout(r,240));const response=await window.__gfTerritoryRealFetch(input,opts);window.__gfTerritoryTrace.push({type:'patch-end',status:response.status});return response;}return window.__gfTerritoryRealFetch(input,opts);};const b=document.querySelector('.socialA-profile-screen [data-open-auth="zone"]');b.click();b.click();})()`);
  await sleep(80);
  if (await ev(`!!document.querySelector('.auth-modal')`)) throw new Error('Territorio apre il modale prima della PATCH');
  await waitFor(`document.querySelector('.auth-modal.step-zone.open')`, 'modale Territorio dopo il salvataggio');
  const territorySuccess = await ev(`window.__gfTerritoryTrace`);
  const territoryStarts = territorySuccess.filter(item => item.type === 'patch-start');
  if (territoryStarts.length !== 1 || territorySuccess.filter(item => item.type === 'modal').length !== 1 || territorySuccess.map(item => item.type).join(',') !== 'patch-start,patch-end,modal' || JSON.stringify(territoryStarts[0].body) !== JSON.stringify(socialProfile)) {
    throw new Error('Territorio non atomico o doppio: ' + JSON.stringify(territorySuccess));
  }
  await ev(`document.querySelector('.auth-modal [data-close]').click()`);
  await waitFor(`!document.querySelector('.auth-modal')`, 'chiusura modale Territorio');
  await ev(`(()=>{window.fetch=window.__gfTerritoryRealFetch;window.__gfTerritoryObserver.disconnect();delete window.__gfTerritoryRealFetch;delete window.__gfTerritoryObserver;delete window.__gfTerritoryModalSeen;delete window.__gfTerritoryTrace;})()`);

  // Se la PATCH fallisce, il modale non deve mai apparire e il feedback resta nella pagina.
  await ev(`(()=>{const f=document.querySelector('[data-social-profile-form]');f.elements.name.value='Gaia E2E non salvato';window.__gfTerritoryRealFetch=window.fetch.bind(window);window.__gfTerritoryFailedCalls=0;window.fetch=async(input,opts={})=>{const raw=typeof input==='string'?input:input.url;const url=new URL(raw,location.href);const method=String(opts.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();if(url.pathname==='/api/auth/profile'&&method==='PATCH'){window.__gfTerritoryFailedCalls++;await new Promise(r=>setTimeout(r,120));return new Response(JSON.stringify({error:'errore_e2e'}),{status:500,headers:{'Content-Type':'application/json'}});}return window.__gfTerritoryRealFetch(input,opts);};const b=document.querySelector('.socialA-profile-screen [data-open-auth="zone"]');b.click();b.click();})()`);
  await waitFor(`document.querySelector('[data-social-profile-feedback].is-error')?.textContent.length>0 && !document.querySelector('.auth-modal') && !document.querySelector('[data-open-auth="zone"]').disabled`, 'errore Territorio senza apertura modale');
  if (await ev(`window.__gfTerritoryFailedCalls`) !== 1) throw new Error('Territorio fallito ha inviato più PATCH');
  await ev(`(()=>{window.fetch=window.__gfTerritoryRealFetch;delete window.__gfTerritoryRealFetch;delete window.__gfTerritoryFailedCalls;document.querySelector('[data-social-profile-form]').elements.name.value=${JSON.stringify('Gaia E2E Social')};})()`);
  ok('Territorio: PATCH prima del modale, guard doppio click e fallimento bloccante verificati');

  await ev(`(()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'avatar-gaia.png',{type:'image/png'}));const i=document.querySelector('[data-social-profile-file]');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`!!document.querySelector('[data-social-profile-avatar] img')`, 'avatar Community renderizzato');
  await waitForAsync(`fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()).then(d=>!!(d.user&&d.user.picture))`, 'avatar Community sincronizzato');
  await auditSocialViewport(390, 844, '.socialA-profile-screen', 'profile');
  await auditSocialViewport(1024, 844, '.socialA-profile-screen', 'profile');
  await auditSocialViewport(1440, 900, '.socialA-profile-screen', 'profile');
  await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(200);
  const profileAppClock = await armAtlasClock('app');
  await ev(`location.hash='#/profilo/modifica'`);
  const profileAppAtlas = await beginAtlasAudit('app', 'return', 'ritorno Gaia Food dal profilo Community');
  const profileReturnLifecycle = await finishAtlasAudit(profileAppAtlas);
  const profileReturnDuration = await atlasElapsedFromAppearance(profileAppClock, profileReturnLifecycle);
  if (profileReturnDuration < 2250 || profileReturnDuration > 3000) throw new Error('durata ritorno Gaia Food inattesa: ' + profileReturnDuration);
  await waitFor(`location.hash==='#/profilo/modifica' && document.querySelector('.pedit [data-field="name"]')`, 'editor profilo dell\'app principale');
  const mainProfileValues = await ev(`Object.fromEntries(['name','city','phone'].map(k=>[k,document.querySelector('.pedit [data-field="'+k+'"]')?.value]))`);
  if (mainProfileValues.name !== socialProfile.name || mainProfileValues.city !== socialProfile.city || mainProfileValues.phone !== socialProfile.phone) {
    throw new Error('profilo Community non sincronizzato nell\'app: ' + JSON.stringify(mainProfileValues));
  }
  const mainName = 'Gaia E2E Main';
  await ev(`(()=>{const i=document.querySelector('.pedit [data-field="name"]');i.value=${JSON.stringify(mainName)};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new FocusEvent('blur'));})()`);
  await waitFor(`document.querySelector('.pedit [data-msg]').textContent.length>0`, 'feedback modifica dal profilo principale');
  await waitForAsync(`fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()).then(d=>d.user&&d.user.name===${JSON.stringify(mainName)})`, 'modifica inversa dal profilo principale');
  await ev(`location.hash='#/comunita/profilo'`);
  const profileCommunityAtlas = await beginAtlasAudit('community', 'entry', 'rientro Community dal profilo Gaia Food');
  await finishAtlasAudit(profileCommunityAtlas);
  await waitFor(`location.hash==='#/comunita/profilo' && document.querySelector('[data-social-profile-form] input[name="name"]')?.value===${JSON.stringify(mainName)}`, 'modifica principale riflessa nella Community');
  const socialProfileBack = await ev(`(()=>{const f=document.querySelector('[data-social-profile-form]');return {name:f.elements.name.value,city:f.elements.city.value,phone:f.elements.phone.value,avatar:!!document.querySelector('[data-social-profile-avatar] img')};})()`);
  if (socialProfileBack.city !== socialProfile.city || socialProfileBack.phone !== socialProfile.phone || !socialProfileBack.avatar) {
    throw new Error('sync inversa profilo incompleta: ' + JSON.stringify(socialProfileBack));
  }
  ok('Profilo: campi e avatar sincronizzati Community ↔ app principale');

  // Torniamo alla feed: è una sottoroute dello stesso realm, quindi nessun loader.
  // La Home social deve comunque scrollare in cima e rivalidare i dati.
  await ev(`document.querySelector('.socialA-mobile-nav a[href="#/comunita"]').click()`);
  await waitFor(`location.hash==='#/comunita' && document.querySelector('.socialA-shell')`, 'Home Community dopo il profilo');
  await assertNoAtlas('Profilo Community → Feed Community');
  const scrollBeforeHome = await ev(`(()=>{const s=document.querySelector('.socialA-scroll');s.scrollTop=Math.min(480,Math.max(0,s.scrollHeight-s.clientHeight));window.__gfHomeRealFetch=window.fetch.bind(window);window.__gfHomeFetches=[];window.fetch=(input,opts)=>{const raw=typeof input==='string'?input:input.url;try{window.__gfHomeFetches.push(new URL(raw,location.href).pathname);}catch(_){}return window.__gfHomeRealFetch(input,opts);};return s.scrollTop;})()`);
  if (scrollBeforeHome <= 0) throw new Error('feed Community non scrollabile nel test Home');
  await ev(`document.querySelector('.socialA-mobile-nav a[href="#/comunita"]').click()`);
  await waitFor(`document.querySelector('.socialA-scroll').scrollTop<2`, 'Home social riporta la feed in cima');
  await waitFor(`window.__gfHomeFetches.some(path=>path==='/api/social/feed')`, 'Home social rivalida la feed');
  await ev(`(()=>{window.fetch=window.__gfHomeRealFetch;delete window.__gfHomeRealFetch;delete window.__gfHomeFetches;})()`);
  await assertNoAtlas('rerender Home Community');
  ok('Home Community: scroll-to-top e refresh reale, senza loader nello stesso realm');

  // 7-b) La chrome desktop scelta ha Cerca al centro: il form è reale e conduce alla
  // sottoroute senza uscire dalla Community. Prima rispetta la soglia minima, poi trova
  // davvero il contenuto pubblicato senza esporre email, telefono o id interni.
  await rpc('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(260);
  const topbarContract = await ev(`(()=>{const bar=document.querySelector('[data-social-topbar]'),rail=document.querySelector('.socialA-rail'),form=document.querySelector('[data-social-global-search]');return {bar:!!bar&&getComputedStyle(bar).display!=='none',rail:!!rail,form:!!form,create:!!bar?.querySelector('[data-social-open-create]'),profile:!!bar?.querySelector('a[href="#/comunita/profilo"]')};})()`);
  if (!topbarContract.bar || topbarContract.rail || !topbarContract.form || !topbarContract.create || !topbarContract.profile) {
    throw new Error('topbar Cerca al centro incompleta: ' + JSON.stringify(topbarContract));
  }
  await ev(`(()=>{const f=document.querySelector('[data-social-global-search]'),i=f.querySelector('input');i.value='E';f.requestSubmit();})()`);
  await waitFor(`location.hash==='#/comunita/cerca' && document.querySelector('[data-social-search-input]')`, 'Cerca Community');
  await assertNoAtlas('Feed → Cerca Community');
  await waitFor(`location.hash==='#/comunita/cerca' && document.querySelector('.socialA-search-hint') && !document.querySelector('[data-social-search-post]')`, 'soglia minima della ricerca');
  const searchQuery = 'cibo sano';
  await ev(`(()=>{const i=document.querySelector('[data-social-search-input]');i.value=${JSON.stringify('cibo sano')};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
  await waitFor(`location.hash==='#/comunita/cerca' && [...document.querySelectorAll('[data-social-search-post]')].some(p=>p.textContent.includes(${JSON.stringify(postText)}))`, 'risultato reale nella ricerca Community');
  const searchPrivacy = await ev(`fetch('/api/social/search?q='+encodeURIComponent(${JSON.stringify('cibo sano')}),{cache:'no-store'}).then(r=>r.json()).then(d=>{const raw=JSON.stringify(d);return {raw,dom:document.querySelector('[data-social-search-results]').textContent};})`, true);
  for (const forbidden of ['e2e@test.it', socialProfile.phone, 'ownerId']) {
    if (searchPrivacy.raw.includes(forbidden) || searchPrivacy.dom.includes(forbidden)) throw new Error('ricerca espone dato privato: ' + forbidden);
  }
  await auditSocialViewport(390, 844, '.socialA-search-screen', 'search');
  await auditSocialViewport(1024, 844, '.socialA-search-screen', 'search');
  await auditSocialViewport(1440, 900, '.socialA-search-screen', 'search');
  await ev(`document.querySelector('[data-social-topbar] [data-social-open-create]').click()`);
  await waitFor(`document.querySelector('.socialA-modal-backdrop.open [data-social-modal-draft]')`, 'Crea dalla topbar Community');
  await ev(`document.querySelector('.socialA-modal [data-social-close]').click()`);
  await waitFor(`!document.querySelector('.socialA-modal-backdrop')`, 'chiusura composer dalla topbar');
  await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(200);
  ok('Cerca al centro: topbar social reale, route stabile, Crea, risultati e privacy verificati');

  // La query è stato sensibile alla sessione: un logout/login su un altro account deve
  // cancellare sia il testo sia i risultati prima che la schermata venga rimontata.
  const alternateEmail = 'e2e-alt@test.it';
  const switchedAccount = await ev(`import('./js/store.js').then(async m=>{await m.signOut();await m.registerPassword(${JSON.stringify('e2e-alt@test.it')},${JSON.stringify('e2ePassword2')});return m.currentUser()&&m.currentUser().email;})`, true);
  if (switchedAccount !== alternateEmail) throw new Error('switch al secondo account fallito: ' + JSON.stringify(switchedAccount));
  await ev(`location.hash='#/comunita/messaggi'`);
  await waitFor(`location.hash==='#/comunita/messaggi' && document.querySelector('.socialA-messages-screen')`, 'route intermedia dopo cambio account');
  await ev(`location.hash='#/comunita/cerca'`);
  await waitFor(`location.hash==='#/comunita/cerca' && document.querySelector('[data-social-search-input]')?.value==='' && document.querySelector('.socialA-search-hint') && !document.querySelector('[data-social-search-post]')`, 'ricerca azzerata per il secondo account');
  if ((await ev(`document.querySelector('[data-social-search-results]').textContent`)).includes(postText)) throw new Error('risultati ricerca trapassati al secondo account');
  const restoredAccount = await ev(`import('./js/store.js').then(async m=>{await m.signOut();await m.loginPassword(${JSON.stringify('e2e@test.it')},${JSON.stringify('e2ePassword1')});return m.currentUser()&&m.currentUser().email;})`, true);
  if (restoredAccount !== 'e2e@test.it') throw new Error('ripristino account E2E fallito: ' + JSON.stringify(restoredAccount));
  await ev(`location.hash='#/comunita/messaggi'`);
  await waitFor(`location.hash==='#/comunita/messaggi' && document.querySelector('.socialA-messages-screen')`, 'route intermedia dopo ripristino account');
  await ev(`location.hash='#/comunita/cerca'`);
  await waitFor(`location.hash==='#/comunita/cerca' && document.querySelector('[data-social-search-input]')?.value==='' && document.querySelector('.socialA-search-hint') && !document.querySelector('[data-social-search-post]')`, 'ricerca ancora pulita dopo ripristino account');
  const activeEmail = await ev(`fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()).then(d=>d.user&&d.user.email)`, true);
  if (activeEmail !== 'e2e@test.it') throw new Error('cookie account originale non ripristinato');
  ok('Cambio account: query e risultati Cerca non attraversano logout/login');

  // Messaggi e Notifiche sono stati vuoti utili, ma restano dentro la shell Community.
  await ev(`location.hash='#/comunita/messaggi'`);
  await waitFor(`location.hash==='#/comunita/messaggi' && document.querySelector('.socialA-messages-screen .socialA-empty-panel')`, 'stato vuoto Messaggi');
  await assertNoAtlas('Cerca → Messaggi Community');
  if (!await ev(`document.body.classList.contains('app-social') && !!document.querySelector('.socialA-messages-screen [aria-current="page"]')`)) throw new Error('Messaggi esce dalla shell social');
  await ev(`location.hash='#/comunita/notifiche'`);
  await waitFor(`location.hash==='#/comunita/notifiche' && document.querySelector('.socialA-notifications-screen .socialA-empty-panel')`, 'stato vuoto Notifiche');
  await assertNoAtlas('Messaggi → Notifiche Community');
  if (!await ev(`document.body.classList.contains('app-social') && !!document.querySelector('.socialA-notifications-screen [aria-current="page"]')`)) throw new Error('Notifiche esce dalla shell social');
  await ev(`document.querySelector('.socialA-notifications-screen [data-social-home]').click()`);
  await waitFor(`location.hash==='#/comunita' && document.querySelector('.socialA-shell')`, 'ritorno alla feed dalle notifiche');
  ok('Messaggi e Notifiche: route social, stato vuoto e CTA di ritorno verificati');

  // 7-c) La Variante A espone il composer completo con tutti i formati. Verifichiamo poi
  // un carosello reale e una storia reale via API.
  await ev(`document.querySelector('[data-social-open-create]').click()`);
  await waitFor(`document.querySelector('.socialA-modal-backdrop.open [data-social-modal-draft]')`, 'composer multiformato aperto');
  const formats = await ev(`[...document.querySelectorAll('.socialA-modal [data-social-format]')].map(b=>b.dataset.socialFormat).join(',')`);
  if (formats !== 'text,image,video,carousel') throw new Error('formati composer incompleti: ' + formats);
  const resizeDraft = `Bozza preservata al breakpoint · ${Date.now()}`;
  await ev(`document.querySelector('[data-social-modal-draft]').value=${JSON.stringify(resizeDraft)}`);
  await rpc('Emulation.setDeviceMetricsOverride', { width: 1024, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const draftAfterResize = await ev(`document.querySelector('[data-social-modal-draft]')?.value`);
  if (draftAfterResize !== resizeDraft) throw new Error('composer distrutto dal cambio breakpoint');
  await ev(`document.querySelector('.socialA-modal [data-social-close]').click()`);
  await waitFor(`!document.querySelector('.socialA-modal-backdrop')`, 'composer multiformato chiuso');
  await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await waitFor(`document.querySelector('.social-screen')`, 'Rete Gaia dopo ripristino viewport');

  // Validazione atomica: una selezione mista valida+invalida non deve lasciare file nascosti;
  // un carosello con un solo elemento resta nel composer e mostra il vincolo minimo.
  await ev(`document.querySelector('[data-social-open-create]').click()`);
  await waitFor(`document.querySelector('.socialA-modal-backdrop.open')`, 'composer riaperto per validazione media');
  await ev(`document.querySelector('[data-social-format="carousel"]').click()`);
  await ev(`(()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'valida.png',{type:'image/png'}));dt.items.add(new File([new Uint8Array([1,2,3])],'non-valida.heic',{type:'image/heic'}));const i=document.querySelector('[data-social-media-input]');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`document.querySelector('[data-social-modal-error]').textContent.length>0`, 'errore selezione media non valida');
  if (await ev(`document.querySelectorAll('.socialA-preview-item').length`) !== 0) throw new Error('validazione media non atomica: file valido aggiunto prima del rifiuto');
  await ev(`(()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'uno.png',{type:'image/png'}));const i=document.querySelector('[data-social-media-input]');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`document.querySelectorAll('.socialA-preview-item').length===1`, 'un elemento valido nel carosello');
  await ev(`document.querySelector('[data-social-modal-publish]').click()`);
  await waitFor(`document.querySelector('[data-social-modal-error]').textContent.length>0 && document.querySelectorAll('.socialA-preview-item').length===1`, 'carosello minimo due elementi');
  await ev(`document.querySelector('.socialA-modal [data-social-close]').click()`);
  await waitFor(`!document.querySelector('.socialA-modal-backdrop')`, 'composer validazione chiuso');

  await ev(`document.querySelector('[data-social-create-story]').click()`);
  await waitFor(`document.querySelector('.socialA-modal-backdrop.open [data-social-modal-draft]')`, 'composer storia aperto');
  if (await ev(`document.querySelector('[data-social-modal-draft]').maxLength`) !== 280) throw new Error('maxlength storia diverso da 280');
  await ev(`document.querySelector('.socialA-modal [data-social-close]').click()`);
  await waitFor(`!document.querySelector('.socialA-modal-backdrop')`, 'composer storia chiuso');
  ok('Variante A: formati completi, bozza preservata al resize e validazione media atomica');

  const carouselText = `E2E · carosello misto · ${Date.now()}`;
  const storyText = `E2E · storia da Terni · ${Date.now()}`;
  const seededMedia = await ev(`(async()=>{
    const dataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const upload=()=>fetch('/api/social/media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})}).then(r=>r.json());
    const a=await upload(),b=await upload();
    const post=await fetch('/api/social/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:${JSON.stringify(carouselText)},kind:'tip',mediaRefs:[a.mediaRef,b.mediaRef]})}).then(r=>r.json());
    const story=await fetch('/api/social/stories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:${JSON.stringify(storyText)}})}).then(r=>r.json());
    return {post:post.post&&post.post.id,story:story.story&&story.story.id,format:post.post&&post.post.format};
  })()`, true);
  if (!seededMedia || !seededMedia.post || !seededMedia.story || seededMedia.format !== 'carousel') throw new Error('seed social multiformato fallito: ' + JSON.stringify(seededMedia));

  // 8) regressione refresh: cookie/sessione e route profonda devono sopravvivere al full reload.
  await rpc('Page.reload', { ignoreCache: false });
  await waitFor(`location.hash === '#/comunita' && document.querySelector('.social-screen')`, 'Rete Gaia dopo il reload');
  const reloadCommunityAtlas = await beginAtlasAudit('community', 'entry', 'Atlante Community al bootstrap autenticato');
  await finishAtlasAudit(reloadCommunityAtlas);
  await waitFor(`document.querySelector('.socialA-shell')`, 'Community dopo Atlante al reload');
  await waitFor(`[...document.querySelectorAll('[data-social-post]')].some(p=>[...p.querySelectorAll('.social-post-text,.text-card blockquote,.caption')].some(n=>n.textContent.includes(${JSON.stringify(postText)})))`, 'contenuto persistito dopo il reload');
  await waitFor(`[...document.querySelectorAll('[data-social-post]')].some(p=>[...p.querySelectorAll('.social-post-text,.text-card blockquote,.caption')].some(n=>n.textContent.includes(${JSON.stringify(carouselText)}))&&p.querySelectorAll('.socialA-slide').length===2)`, 'carosello reale renderizzato');
  const carouselCardExpr = `[...document.querySelectorAll('[data-social-post]')].find(p=>[...p.querySelectorAll('.social-post-text,.text-card blockquote,.caption')].some(n=>n.textContent.includes(${JSON.stringify(carouselText)})))`;
  await ev(`(()=>{const c=${carouselCardExpr};c.querySelector('[data-social-carousel-next]').click();})()`);
  await waitFor(`${carouselCardExpr}.querySelector('[data-social-carousel]').dataset.socialCarouselIndex==='1'`, 'carosello avanzato alla seconda slide');
  await waitFor(`[...document.querySelectorAll('[data-social-story]')].some(b=>b.dataset.socialStory===${JSON.stringify(seededMedia.story)})`, 'storia reale nello strip');
  await ev(`[...document.querySelectorAll('[data-social-story]')].find(b=>b.dataset.socialStory===${JSON.stringify(seededMedia.story)}).click()`);
  await waitFor(`document.querySelector('.socialA-story-viewer.open')?.textContent.includes(${JSON.stringify(storyText)})`, 'viewer storia aperto');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await waitFor(`!document.querySelector('.socialA-story-viewer')`, 'viewer storia chiuso con Escape');
  // La conferma di eliminazione è un dialog accessibile e non deve chiudere anche il viewer
  // quando viene annullata con Escape. Al secondo tentativo eliminiamo davvero la storia.
  await ev(`[...document.querySelectorAll('[data-social-story]')].find(b=>b.dataset.socialStory===${JSON.stringify(seededMedia.story)}).click()`);
  await waitFor(`document.querySelector('[data-social-story-delete]')`, 'azione elimina sulla propria storia');
  await ev(`document.querySelector('[data-social-story-delete]').click()`);
  await waitFor(`document.querySelector('.gf-confirm-bd[aria-labelledby]')`, 'conferma elimina storia accessibile');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await waitFor(`!document.querySelector('.gf-confirm-bd') && document.querySelector('.socialA-story-viewer.open')`, 'Escape annulla solo la conferma');
  await ev(`document.querySelector('[data-social-story-delete]').click()`);
  await waitFor(`document.querySelector('.gf-confirm-ok')`, 'seconda conferma elimina storia');
  await ev(`document.querySelector('.gf-confirm-ok').click()`);
  await waitFor(`!document.querySelector('.socialA-story-viewer') && ![...document.querySelectorAll('[data-social-story]')].some(b=>b.dataset.socialStory===${JSON.stringify(seededMedia.story)})`, 'storia propria eliminata');

  // Anche il post proprio espone Elimina (mai Segnala), con rimozione immediata dallo store.
  const ownPostCard = `[...document.querySelectorAll('[data-social-post]')].find(p=>[...p.querySelectorAll('.social-post-text,.text-card blockquote,.caption')].some(n=>n.textContent.includes(${JSON.stringify(postText)})))`;
  await ev(`(()=>{const c=${ownPostCard};c.querySelector('[data-social-menu]').click();})()`);
  await waitFor(`${ownPostCard}.querySelector('[data-social-delete]') && !${ownPostCard}.querySelector('[data-social-report]')`, 'menu proprio post con elimina');
  await ev(`${ownPostCard}.querySelector('[data-social-delete]').click()`);
  await waitFor(`document.querySelector('.gf-confirm-ok')`, 'conferma elimina post');
  await ev(`document.querySelector('.gf-confirm-ok').click()`);
  await waitFor(`!${ownPostCard}`, 'post proprio eliminato dalla UI');
  ok('Rete Gaia: carosello, storia e cancellazione dei propri contenuti verificati');
  const meAfterReload = await ev(`fetch('/api/auth/me').then(r=>r.json()).then(d=>d.user&&d.user.email)`, true);
  const authModal = await ev(`!!document.querySelector('.auth-modal')`);
  if (meAfterReload !== 'e2e@test.it' || authModal) throw new Error('refresh non ha preservato la sessione: ' + JSON.stringify({ meAfterReload, authModal, hash: await ev('location.hash') }));
  ok('Reload autenticato: Atlante Community, route, sessione e contenuto pubblicato preservati');

  // Il comando esplicito "Torna all'app" usa la variante breve di Atlante e porta alla Home.
  // Rientrando dalla bottom nav, la superficie social viene rivalidata senza full reload.
  const reentryText = `E2E · aggiornamento al rientro · ${Date.now()}`;
  const returnAppClock = await armAtlasClock('app');
  await ev(`document.querySelector('[data-social-back-app],.socialA-back-app').click()`);
  const returnAppAtlas = await beginAtlasAudit('app', 'return', 'Atlante breve tornando a Gaia Food');
  const returnAppLifecycle = await finishAtlasAudit(returnAppAtlas);
  const returnAppDuration = await atlasElapsedFromAppearance(returnAppClock, returnAppLifecycle);
  if (returnAppDuration < 2250 || returnAppDuration > 3000) throw new Error('durata ritorno Gaia Food non conforme ad Atlante B: ' + returnAppDuration);
  await waitFor(`location.hash === '#/home'`, 'Torna all\'app conduce alla Home');
  await waitFor(`document.querySelector('.screen.home.home-directory')`, 'Home prima del rientro social');
  await rpc('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(260);
  const mainDesktopFrame = await ev(`(()=>{const rail=document.querySelector('#rail').getBoundingClientRect(),app=document.querySelector('#app').getBoundingClientRect();return {left:rail.left,right:app.right,width:app.right-rail.left,railWidth:rail.width,appWidth:app.width,scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)};})()`);
  if (Math.abs(mainDesktopFrame.left - 80) > 1 || Math.abs(mainDesktopFrame.width - 1280) > 1 || mainDesktopFrame.scrollWidth > 1441) {
    throw new Error('frame desktop Gaia Food non stabile: ' + JSON.stringify(mainDesktopFrame));
  }
  await shot(path.join(os.tmpdir(), 'gf-e2e-main-frame-1440.png'));
  const externalPost = await ev(`fetch('/api/social/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:${JSON.stringify(reentryText)},kind:'question'})}).then(r=>r.json()).then(d=>d.post&&d.post.id)`, true);
  if (!externalPost) throw new Error('creazione esterna per test rientro fallita');
  await ev(`document.querySelector('.bottomnav a[href="#/comunita"]').click()`);
  const reentryCommunityAtlas = await beginAtlasAudit('community', 'entry', 'Atlante al rientro Community');
  await finishAtlasAudit(reentryCommunityAtlas);
  await waitFor(`document.querySelector('.socialA-shell')`, 'Community dopo il rientro Atlante');
  await waitFor(`[...document.querySelectorAll('[data-social-post]')].some(p=>[...p.querySelectorAll('.social-post-text,.text-card blockquote,.caption')].some(n=>n.textContent.includes(${JSON.stringify(reentryText)})))`, 'feed aggiornato al rientro SPA');
  const socialDesktopFrame = await ev(`(()=>{const top=document.querySelector('.socialA-topbar-frame').getBoundingClientRect(),shell=document.querySelector('.socialA-shell').getBoundingClientRect();return {left:top.left,right:top.right,width:top.width,shellLeft:shell.left,shellRight:shell.right,scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)};})()`);
  if (Math.abs(socialDesktopFrame.left - mainDesktopFrame.left) > 1 || Math.abs(socialDesktopFrame.right - mainDesktopFrame.right) > 1 || Math.abs(socialDesktopFrame.width - mainDesktopFrame.width) > 1 || socialDesktopFrame.scrollWidth > 1441) {
    throw new Error('frame Community disallineato da Gaia Food: ' + JSON.stringify({ mainDesktopFrame, socialDesktopFrame }));
  }
  await shot(path.join(os.tmpdir(), 'gf-e2e-community-frame-1440.png'));
  await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(200);
  ok('Community ↔ Gaia Food: stesso frame 1280px, Atlante coerente, ritorno breve e feed rivalidata');

  // Salta deve completare semanticamente il 100% e ripristinare focus/shell.
  await ev(`document.querySelector('[data-social-back-app],.socialA-back-app').click()`);
  const skippedReturnAtlas = await beginAtlasAudit('app', 'return', 'Atlante da saltare');
  await ev(`document.querySelector('[data-gaia-atlas-skip]').click()`);
  const skippedLifecycle = await finishAtlasAudit(skippedReturnAtlas);
  if (!skippedLifecycle.event?.skipped || skippedLifecycle.elapsed > 900) throw new Error('Salta non conclude rapidamente il loader: ' + JSON.stringify(skippedLifecycle));
  await waitFor(`location.hash==='#/home' && document.querySelector('.bottomnav a[href="#/comunita"]')`, 'Home dopo Salta');

  // Se si usa Back mentre Atlante Community è ancora aperto, il controller precedente deve
  // essere cancellato: resta un solo overlay Gaia Food e nessuna shell rimane inerte.
  await ev(`document.querySelector('.bottomnav a[href="#/comunita"]').click()`);
  await waitFor(`location.hash==='#/comunita' && document.querySelector('[data-gaia-atlas-transition][data-gaia-atlas-target="community"]')`, 'Atlante Community prima di Back');
  if (!await ev(`document.querySelector('#app').hasAttribute('inert') && document.querySelector('#rail').hasAttribute('inert')`)) throw new Error('shell non inerte prima del Back');
  await ev(`history.back()`);
  await waitFor(`location.hash==='#/home' && document.querySelectorAll('[data-gaia-atlas-transition]').length===1 && document.querySelector('[data-gaia-atlas-transition]')?.dataset.gaiaAtlasTarget==='app'`, 'Atlante Gaia Food sostituisce quello Community dopo Back');
  const backReturnAtlas = await beginAtlasAudit('app', 'return', 'Atlante dopo Back durante loader');
  await ev(`document.querySelector('[data-gaia-atlas-skip]').click()`);
  await finishAtlasAudit(backReturnAtlas);
  await assertNoAtlas('stato dopo Back durante loader', 120);
  ok('Salta e Back durante il loader: 100%, overlay unico e inert sempre ripristinato');

  // Con prefers-reduced-motion il contenuto resta completo e accessibile, ma il passaggio
  // si conclude in una finestra breve e senza animazioni CSS.
  await rpc('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reducedClock = await armAtlasClock('app');
  await ev(`import('./js/screens.js').then(m=>{m.startGaiaTransition({target:'app',mode:'entry'});return true})`, true);
  const reducedAtlas = await beginAtlasAudit('app', 'entry', 'Atlante con movimento ridotto');
  const reducedCss = await ev(`(()=>{const root=document.querySelector('[data-gaia-atlas-transition]'),route=root.querySelector('.gaia-atlas-route'),pin=root.querySelector('.gaia-atlas-pin'),bar=root.querySelector('.gaia-atlas-progress-bar');return [root,route,pin,bar].map(node=>{const s=getComputedStyle(node);return {animation:s.animationName,duration:s.animationDuration,transition:s.transitionDuration};});})()`);
  if (reducedCss.some(item => (item.animation !== 'none' && item.duration !== '0s') || item.transition !== '0s')) throw new Error('reduced-motion conserva animazioni: ' + JSON.stringify(reducedCss));
  const reducedLifecycle = await finishAtlasAudit(reducedAtlas, { timeout: 2000 });
  const reducedDuration = await atlasElapsedFromAppearance(reducedClock, reducedLifecycle);
  if (reducedDuration < 620 || reducedDuration > 1000) throw new Error('durata reduced-motion inattesa: ' + reducedDuration);
  await rpc('Emulation.setEmulatedMedia', { media: '', features: [] });
  ok('Movimento ridotto: stessa informazione e progresso, senza animazioni e con uscita rapida');

  const cachedApis = await ev(`(async()=>{const out=[];for(const key of await caches.keys()){const cache=await caches.open(key);for(const req of await cache.keys()){if(new URL(req.url).pathname.includes('/api/'))out.push({key,url:req.url});}}return out;})()`, true);
  if (cachedApis.length) throw new Error('API private presenti nella CacheStorage: ' + JSON.stringify(cachedApis));
  ok('Service worker: nessuna risposta /api è conservata tra account');

  // 8-bis) La coda admin viene verificata con un backend controllato nel browser: il gate UX
  // non sostituisce quello server, ma impedisce a un ruolo normale di montare la coda. Poi
  // proviamo filtri, escaping e le due decisioni senza dipendere dai dati seed del test.
  await ev(`(async()=>{const store=await import('./js/store.js');window.__gfRealFetch=window.fetch.bind(window);window.__gfModerationCalls=[];window.__gfModerationItems=[
    {id:'post-xss',type:'post',text:'<img src=x onerror="window.__gfModerationXss=1">',createdAt:new Date().toISOString(),author:{name:'<svg onload="window.__gfModerationXss=1">',picture:'javascript:alert(1)',type:'person'},location:{city:'<script>bad</script>',region:'Umbria'},media:[{url:'javascript:alert(1)',type:'image'}],format:'image',reportCount:3,pendingSince:new Date().toISOString()},
    {id:'story-safe',type:'story',text:'Storia da controllare',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),author:{name:'Azienda E2E',picture:'',type:'producer'},location:{city:'Terni',region:'Umbria'},media:[{url:'./assets/photos/grano.png',type:'image',mime:'image/png'}],format:'image',reportCount:2,pendingSince:new Date().toISOString()}
  ];window.__gfModerationXss=0;window.fetch=(input,opts={})=>{const raw=typeof input==='string'?input:input.url;const url=new URL(raw,location.href);const method=String(opts.method||'GET').toUpperCase();if(url.pathname==='/api/admin/social/moderation'&&method==='GET')return Promise.resolve(new Response(JSON.stringify({items:window.__gfModerationItems,counts:{pending:window.__gfModerationItems.length}}),{status:200,headers:{'Content-Type':'application/json'}}));if(url.pathname==='/api/admin/social/moderation/resolve'&&method==='POST'){const body=JSON.parse(opts.body||'{}');window.__gfModerationCalls.push(body);window.__gfModerationItems=window.__gfModerationItems.filter(x=>!(x.id===body.id&&x.type===body.type));return Promise.resolve(new Response(JSON.stringify({ok:true,resolved:true,decision:body.decision}),{status:200,headers:{'Content-Type':'application/json'}}));}return window.__gfRealFetch(input,opts);};store.getState().role='cliente';location.hash='#/admin/moderazione';})()`, true);
  await waitFor(`document.querySelector('#gsm-view .gsm-state')`, 'gate non-admin moderazione');
  if (await ev(`window.__gfModerationCalls.length`) !== 0) throw new Error('il ruolo non-admin ha invocato la moderazione');
  await ev(`import('./js/store.js').then(m=>{m.getState().role='admin';location.hash='#/home';setTimeout(()=>{location.hash='#/admin/moderazione'},0)})`, true);
  await waitFor(`document.querySelectorAll('[data-moderation-item]').length===2`, 'coda moderazione admin');
  const moderationSafe = await ev(`(()=>{const card=document.querySelector('[data-moderation-item="post-xss"]');return {images:card.querySelectorAll('img').length,text:card.querySelector('.gsm-text').textContent,name:card.querySelector('.gsm-author-copy strong').textContent,executed:window.__gfModerationXss,back:!!document.querySelector('.gsm-back')};})()`);
  if (!moderationSafe || moderationSafe.images !== 0 || moderationSafe.executed !== 0 || !moderationSafe.text.startsWith('<img') || !moderationSafe.name.startsWith('<svg') || !moderationSafe.back) {
    throw new Error('moderazione non neutralizza completamente i payload: ' + JSON.stringify(moderationSafe));
  }
  await shot(path.join(os.tmpdir(), 'gf-e2e-moderation-mobile.png'));
  await rpc('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
  await shot(path.join(os.tmpdir(), 'gf-e2e-moderation-desktop.png'));
  await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(200);
  await ev(`document.querySelector('[data-moderation-filter="story"]').click()`);
  if (await ev(`document.querySelectorAll('[data-moderation-item]').length`) !== 1 || await ev(`document.querySelector('[data-moderation-item]')?.dataset.moderationType`) !== 'story') throw new Error('filtro Storie non applicato');
  await ev(`document.querySelector('[data-moderation-filter="all"]').click()`);
  await ev(`document.querySelector('[data-moderation-item="post-xss"] [data-moderation-decision="keep"]').click()`);
  await waitFor(`!document.querySelector('[data-moderation-item="post-xss"]')`, 'decisione Mantieni applicata');
  await ev(`document.querySelector('[data-moderation-item="story-safe"] [data-moderation-decision="remove"]').click()`);
  await waitFor(`document.querySelector('.gf-confirm-ok')`, 'conferma Rimuovi moderazione');
  await ev(`document.querySelector('.gf-confirm-ok').click()`);
  await waitFor(`!document.querySelector('[data-moderation-item="story-safe"]') && document.querySelector('.gsm-state')`, 'decisione Rimuovi applicata');
  const moderationCalls = await ev(`window.__gfModerationCalls`);
  if (JSON.stringify(moderationCalls) !== JSON.stringify([{ type: 'post', id: 'post-xss', decision: 'keep' }, { type: 'story', id: 'story-safe', decision: 'remove' }])) {
    throw new Error('payload decisioni moderazione errato: ' + JSON.stringify(moderationCalls));
  }
  await ev(`(()=>{window.fetch=window.__gfRealFetch;delete window.__gfRealFetch;delete window.__gfModerationItems;delete window.__gfModerationCalls;import('./js/store.js').then(m=>{m.getState().role=null;location.hash='#/profilo'})})()`);
  ok('Moderazione: gate admin, filtri, XSS e decisioni Mantieni/Rimuovi verificati');

  // 9) cambio lingua → EN: l'interfaccia si traduce (nav + Home)
  await waitFor(`location.hash === '#/profilo' && document.querySelector('[data-lang-open]')`, 'Profilo dopo la moderazione');
  await waitFor(`document.querySelector('[data-lang-open]')`, 'chip lingua in Profilo');
  await ev(`document.querySelector('[data-lang-open]').click()`);
  await waitFor(`[...document.querySelectorAll('[data-lang]')].some(b=>b.dataset.lang==='en')`, 'sheet lingua aperto');
  await ev(`[...document.querySelectorAll('[data-lang]')].find(b=>b.dataset.lang==='en').click()`);
  await waitFor(`[...document.querySelectorAll('.bottomnav a')].map(a=>a.textContent).join(' ').includes('Discover')`, 'nav tradotta in inglese');
  await rpc('Page.navigate', { url: APP + '/#/home' });
  await waitFor(`document.querySelector('.discover-title') && document.querySelector('.discover-title').textContent.includes('Producers in Abruzzo')`, 'Home Scopri in inglese');
  ok('Cambio lingua → EN: nav e Home tradotti');
  await shot(path.join(os.tmpdir(), 'gf-e2e-en-home.png')); // artefatto: Home in inglese (stato finale verde)

  // Hash sconosciuti e logout risolvono sul realm pubblico: un loader di prodotto qui
  // sarebbe fuorviante e rischierebbe di lasciare la shell inerte durante il gate.
  await ev(`location.hash='#/rotta-e2e-inesistente'`);
  await waitFor(`document.querySelector('.splash.s02')`, 'fallback Splash per hash sconosciuto');
  await assertNoAtlas('hash sconosciuto → Splash', 180);
  ok('Hash sconosciuto: fallback Splash senza Atlante');
  await ev(`import('./js/store.js').then(async m=>{await m.signOut();location.hash='#/';return true})`, true);
  await waitFor(`location.hash==='#/' && document.querySelector('.splash.s02') && !document.querySelector('.auth-modal')`, 'Splash pubblico dopo logout');
  await assertNoAtlas('logout → realm pubblico', 180);
  if (await ev(`document.querySelector('#app').hasAttribute('inert') || document.querySelector('#rail').hasAttribute('inert')`)) throw new Error('logout lascia una shell inerte');
  ok('Logout: realm pubblico senza overlay e shell ripristinata');
}

let code = 0;
try {
  await main();
  console.log('\nE2E SMOKE — Splash → login → Home → Rete Gaia → reload → lingua\n' + steps.join('\n') + '\n\n✔ TUTTO VERDE\n');
} catch (e) {
  const png = await shot(path.join(os.tmpdir(), 'gf-e2e-fail.png'));
  console.error('\nE2E SMOKE — FALLITO\n' + steps.join('\n') + `\n  ✗ ${e.message}` + (png ? `\n  (screenshot: ${png})` : '') + '\n\n--- diagnostica ---\n' + logs.join('\n') + '\n');
  code = 1;
} finally {
  cleanup();
}
process.exit(code);
