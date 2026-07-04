// E2E smoke — il flusso critico end-to-end, con Chrome headless via CDP.
// Boota il server reale (requestHandler) su porta effimera + dati usa-e-getta, poi guida un
// Chrome ISOLATO (proprio --user-data-dir: NON tocca il Chrome di Daniele) attraverso:
//   Splash → apri pop-up login → email → step zona → scegli Abruzzo → Home con produttori.
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
await new Promise((r) => server.listen(0, r));
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

const steps = [];
const logs = [];
const ok = (m) => { steps.push('  ✓ ' + m); };

async function shot(file) {
  try { const s = await rpc('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(s.data, 'base64')); return file; } catch { return null; }
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
  // Warm-up service worker: alla PRIMA visita il SW, quando prende il controllo (claim), ricarica
  // la pagina UNA volta (index.html: controllerchange → reload). Aspettiamo che la ricarica si consumi,
  // così non interrompe il flusso a metà. Su un utente reale è un flicker una-tantum al primo avvio.
  try { await waitFor(`navigator.serviceWorker && navigator.serviceWorker.controller`, 'SW in controllo', 5000); } catch {}
  await sleep(1200);
  await waitFor(`document.querySelector('.s02-cta')`, 'Splash stabile dopo il SW');
  ok('Splash renderizzato con la CTA di accesso');

  // 2) la CTA apre il POP-UP (non naviga)
  await ev(`document.querySelector('.s02-cta').click()`);
  await waitFor(`document.querySelector('.auth-modal')`, 'pop-up di accesso aperto');
  if (await ev(`location.hash && location.hash !== '#/' ? true : false`)) throw new Error('la CTA ha navigato invece di aprire il pop-up');
  ok('La CTA apre il pop-up di accesso senza cambiare pagina');

  // 3) login via email → passo ZONA (dimostra che il POST /api/auth/email ha funzionato)
  await ev(`(()=>{const i=document.querySelector('.auth-modal input[name=email]'); i.value='e2e@test.it'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await ev(`document.querySelector('.auth-modal [data-email-form] .am-go').click()`);
  await waitFor(`document.querySelector('.auth-modal.step-zone')`, 'passo Zona dopo il login');
  ok('Login email riuscito → si apre il passo "Dove ti trovi?"');

  // 4) scelgo Abruzzo → entro in HOME
  await ev(`document.querySelector('.auth-modal [data-zname="Abruzzo"]').click()`);
  await waitFor(`location.hash === '#/home'`, 'navigazione in Home');
  await waitFor(`document.querySelectorAll('a[href^="#/produttore/"]').length > 0`, 'schede produttore in Home');
  const n = await ev(`document.querySelectorAll('a[href^="#/produttore/"]').length`);
  const nav = await ev(`!!document.querySelector('.bottomnav')`);
  if (!nav) throw new Error('bottom nav assente in Home');
  ok(`Home raggiunta: ${n} schede produttore caricate + bottom nav presente`);

  // 5) la sessione è reale: /api/auth/me riconosce l'utente
  const me = await ev(`fetch('/api/auth/me').then(r=>r.json()).then(d=>d.user&&d.user.email)`, true);
  if (me !== 'e2e@test.it') throw new Error('sessione non riconosciuta dal backend, me=' + JSON.stringify(me));
  ok('Backend: /api/auth/me riconosce la sessione (e2e@test.it)');
}

let code = 0;
try {
  await main();
  console.log('\nE2E SMOKE — flusso critico Splash → login → Home\n' + steps.join('\n') + '\n\n✔ TUTTO VERDE\n');
} catch (e) {
  const png = await shot(path.join(os.tmpdir(), 'gf-e2e-fail.png'));
  console.error('\nE2E SMOKE — FALLITO\n' + steps.join('\n') + `\n  ✗ ${e.message}` + (png ? `\n  (screenshot: ${png})` : '') + '\n\n--- diagnostica ---\n' + logs.join('\n') + '\n');
  code = 1;
} finally {
  cleanup();
}
process.exit(code);
