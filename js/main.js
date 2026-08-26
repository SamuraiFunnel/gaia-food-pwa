import { loadData, results, currentUser, authMe, producerStatusNotice, getState, adminMe } from './store.js';
import { Icon } from './icons.js';
import { initMap, ProducerCard, Lockup } from './components.js';
import * as S from './screens.js';
import { enhanceHome, enhanceMapFull } from './desktop.js';
// schermate (fan-out)
import { openAuthModal } from './screens/AuthModal.js';
import { Custodi } from './screens/Custodi.js';
import { Termini, Privacy } from './screens/Legal.js';
import { initI18n, setLang, detectLang, t } from './i18n.js';
import { OnbVideo } from './screens/OnbVideo.js';
import { Zona } from './screens/Zona.js';
import { Ricerca } from './screens/Ricerca.js';
import { Filtri } from './screens/Filtri.js';
import { Percorso } from './screens/Percorso.js';
import { Player } from './screens/Player.js';
import { Candidati } from './screens/Candidati.js';
import { Form } from './screens/Form.js';
import { StatoCandidatura } from './screens/StatoCandidatura.js';
import { SashaCoda } from './screens/SashaCoda.js';
import { SashaVerifica } from './screens/SashaVerifica.js';
import { SashaPianifica } from './screens/SashaPianifica.js';
import { SashaRevoca } from './screens/SashaRevoca.js';
import { Stati } from './screens/Stati.js';
// Flusso "Consegna a casa" CONGELATO (audit A3): non attivo → rotte rimosse dal router.
// Resta solo il teaser "non disponibile" (linkato dall'Hub). I file DlvScegli/Carrello/Zona/Slot/
// Riepilogo/Tracking restano in repo, pronti da riattivare quando la consegna sarà scoped.
import { DlvNonDisp } from './screens/DlvNonDisp.js';
import { Admin } from './screens/Admin.js';
import { Gestione } from './screens/Gestione.js';
import { Invito } from './screens/Invito.js';
import { Azienda } from './screens/Azienda.js';
import { Hub } from './screens/Hub.js';

const app = document.getElementById('app');

/* ---- Rail laterale (solo desktop, via CSS) ---- */
// Barra base (uguale a tutti): Scopri · Mappa · Rete · Salvati. Le tab di ruolo (Area personale,
// Verifica, Gestione) e il Profilo stanno sotto il separatore e compaiono solo a chi servono.
const RAIL = [
  { ic: 'home', key: 'nav.scopri', href: '#/home', match: ['#/home', '#/', '#/ricerca', '#/filtri'] },
  { ic: 'map-pin', key: 'rail.map', href: '#/mappa', match: ['#/mappa'] },
  { ic: 'message-circle', key: 'nav.rete', href: '#/comunita', match: ['#/comunita', '#/cibovero'] },
  { ic: 'bookmark', key: 'nav.salvati', href: '#/salvati', match: ['#/salvati'] },
];
function buildRail() {
  const r = document.createElement('aside'); r.id = 'rail';
  const link = (href, ic, key) => `<a class="rl" href="${href}">${Icon(ic, { size: 20 })} <span class="rl-t" data-k="${key}">${t(key)}</span></a>`;
  // Etichette ruolo in chiaro (IT): evita di toccare i file i18n / il test locali.
  const roleLink = (href, ic, label) => `<a class="rl rl-role" href="${href}">${Icon(ic, { size: 20 })} <span class="rl-t">${label}</span></a>`;
  r.innerHTML = `
    <a class="rl-logo" href="#/home">${Lockup('')}</a>
    ${RAIL.map(i => link(i.href, i.ic, i.key)).join('')}
    <div class="rl-spacer"></div>
    <div class="rl-sep"></div>
    ${roleLink('#/azienda', 'leaf', 'Area personale')}
    ${roleLink('#/sasha', 'check-circle', 'Verifica')}
    ${roleLink('#/admin', 'sliders', 'Gestione')}
    ${link('#/profilo', 'user', 'nav.tu')}
    <div class="rl-foot" data-k="rail.tagline">${t('rail.tagline')}</div>`;
  document.body.insertBefore(r, app);
}
// Ridisegna le etichette del rail nella lingua attiva (a ogni render / cambio lingua).
function refreshRail() {
  document.querySelectorAll('#rail [data-k]').forEach(el => { el.textContent = t(el.getAttribute('data-k')); });
  // "Area personale": tab del produttore. Compare SOLO se l'utente ha uno stato produttore
  // attivo (i clienti la promozione la trovano nel Profilo → "Diventa produttore").
  const azLink = document.querySelector('#rail a[href="#/azienda"]');
  if (azLink) {
    const s = (currentUser() || {}).producerStatus;
    const active = ['requested', 'approved', 'onboarding', 'in_review', 'published'].includes(s);
    azLink.style.display = active ? '' : 'none';
    const az = azLink.querySelector('.rl-t');
    if (az) az.textContent = (s === 'requested') ? 'Richiesta in corso' : 'Area personale';
    // pallino di notifica quando c'è una novità di stato non ancora vista
    const notice = producerStatusNotice();
    let dot = azLink.querySelector('.rl-dot');
    if (notice && !dot) { dot = document.createElement('span'); dot.className = 'rl-dot'; dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:var(--verde);margin-left:6px;flex:none'; azLink.appendChild(dot); }
    else if (!notice && dot) dot.remove();
  }
  // RBAC: Gestione solo admin · Verifica ad admin+verificatore. Nascosti del tutto a cliente/produttore.
  const role = getState().role;
  const sashaLink = document.querySelector('#rail a[href="#/sasha"]');
  const adminLink = document.querySelector('#rail a[href="#/admin"]');
  if (sashaLink) sashaLink.style.display = (role === 'admin' || role === 'verificatore') ? '' : 'none';
  if (adminLink) adminLink.style.display = (role === 'admin') ? '' : 'none';
}
function markRail() {
  const h = location.hash || '#/home';
  document.querySelectorAll('#rail a.rl').forEach(a => {
    const href = a.getAttribute('href');
    const item = RAIL.find(i => i.href === href);
    const on = item ? item.match.some(m => h === m || (m !== '#/' && h.startsWith(m))) : (h.startsWith(href));
    a.classList.toggle('active', !!on);
  });
}
buildRail();

/* mappa a schermo intero (inline) */
function MapFull() {
  const list = results();
  const center = [13.934, 41.776];
  return {
    html: `<div class="screen no-nav" style="padding:0">
      <div class="mapwrap full"><div id="mapf" class="map-canvas"></div>
        <button class="map-fab center" data-back style="left:12px;right:auto;top:12px;bottom:auto">${Icon('arrow-left', { size: 18 })}</button>
      </div></div>`,
    onMount(el) {
      const m = el.querySelector('#mapf');
      if (m) {
        const map = initMap(m, list, { me: true, center });
        if (map) { map.__gfCenter = center; el._gfMap = map; }
      }
      const back = el.querySelector('[data-back]'); if (back) back.onclick = () => history.back();
      // bottom-sheet dell'handoff (S_MapFull): conteggio + ProducerCard + toggle Lista.
      // Attivo sia mobile che desktop; il "Lista (N)" sostituisce il vecchio fab.
      enhanceMapFull(el, list, ProducerCard, { goListHref: '#/home' });
    },
  };
}

// ordine: rotte specifiche PRIMA di quelle generiche / con parametro
const routes = [
  { re: /^#?\/?$/, view: () => S.Splash() },
  { re: /^#\/onboarding$/, view: () => OnbVideo() },
  { re: /^#\/zona$/, view: () => Zona() },
  { re: /^#\/hub$/, view: () => Hub() },
  { re: /^#\/home$/, view: () => S.Home() },
  { re: /^#\/mappa$/, view: () => MapFull() },
  { re: /^#\/ricerca$/, view: () => Ricerca() },
  { re: /^#\/filtri$/, view: () => Filtri() },
  { re: /^#\/percorso$/, view: () => Percorso() },
  { re: /^#\/comunita$/, view: () => S.Comunita() },
  { re: /^#\/cibovero$/, view: () => S.Comunita() }, // alias storico → nuova Rete Gaia
  { re: /^#\/video\/([^/]+)\/(\d+)$/, view: (m) => Player(m[1], +m[2]) },
  { re: /^#\/video\/(.+)$/, view: (m) => Player(m[1]) },
  { re: /^#\/produttore\/(.+)$/, view: (m) => S.Producer(m[1]) },
  { re: /^#\/salvati$/, view: () => S.Salvati() },
  { re: /^#\/custodi\/produttore$/, view: () => Custodi('produttore') },
  { re: /^#\/custodi$/, view: () => Custodi('cliente') },
  { re: /^#\/termini$/, view: () => Termini() },
  { re: /^#\/privacy$/, view: () => Privacy() },
  { re: /^#\/profilo\/modifica$/, view: () => S.ProfiloEdit() },
  { re: /^#\/profilo$/, view: () => S.Profilo() },
  { re: /^#\/azienda$/, view: () => Azienda() },
  { re: /^#\/candidati\/form$/, view: () => Form() },
  { re: /^#\/candidati\/stato$/, view: () => StatoCandidatura() },
  { re: /^#\/candidati$/, view: () => Candidati() },
  { re: /^#\/sasha\/verifica$/, view: () => SashaVerifica() },
  { re: /^#\/sasha\/pianifica$/, view: () => SashaPianifica() },
  { re: /^#\/sasha\/revoca$/, view: () => SashaRevoca() },
  { re: /^#\/sasha$/, view: () => SashaCoda() },
  { re: /^#\/admin$/, view: () => Gestione() },                 // NUOVO: gestione persone/livelli/inviti
  { re: /^#\/admin\/pipeline$/, view: () => Admin() },          // vecchia pipeline verifiche/pubblicazione produttori
  { re: /^#\/invito\/(.+)$/, view: (m) => Invito(m[1]) },       // accettazione invito → account + onboarding
  { re: /^#\/stati$/, view: () => Stati() },
  { re: /^#\/consegna\/non-disponibile$/, view: () => DlvNonDisp() }, // teaser "in arrivo" (Hub) — l'unico attivo
];

// Rotte pubbliche (raggiungibili senza login): solo lo splash. L'accesso avviene nel POP-UP (openAuthModal),
// non più in una pagina dedicata. Tutto il resto è gated.
const PUBLIC_ROUTES = ['#/', '', '#/termini', '#/privacy'];
function isPublic(h) { return PUBLIC_ROUTES.includes(h) || h.startsWith('#/invito/'); } // l'invito si apre da sloggati

function render() {
  const h = location.hash || '#/';
  // La Rete Gaia ha una shell dedicata (rail, testata e navigazione mobile proprie).
  // Mantieni il flag sincronizzato a ogni render: uscendo dal social le altre rotte
  // tornano immediatamente alla chrome globale senza dipendere dal lifecycle della view.
  document.body.classList.toggle('app-social', h === '#/comunita' || h === '#/cibovero');
  // GATE "alla Glovo": nessun ospite entra. Se non loggato e la rotta non è pubblica →
  // riporta allo splash e apri il POP-UP di accesso (niente più pagina #/registrati).
  if (!currentUser() && !isPublic(h)) {
    if (location.hash !== '#/') location.hash = '#/';
    openAuthModal();
    return;
  }
  document.body.classList.toggle('app-bare', ['#/', '#/onboarding', '#/zona', '#/hub'].includes(h));
  document.body.classList.toggle('app-splash', h === '#/' || h === ''); // splash = hero a tutta larghezza su desktop
  const r = routes.find(r => r.re.test(h)) || routes[0];
  let view;
  try { view = r.view(h.match(r.re)); }
  catch (e) { console.error(e); view = { html: `<div class="screen no-nav"><div class="pad" style="padding:40px">Errore schermata: ${e.message}<br><a href="#/home">Torna alla Home</a></div></div>` }; }
  app.innerHTML = view.html;
  app.scrollTop = 0;
  if (view.onMount) { try { view.onMount(app); } catch (e) { console.error('onMount', e); } }
  // Layer desktop split-view (additivo, solo >=1024px; no-op sotto).
  try { enhanceHome(app); } catch (e) { console.error('enhanceHome', e); }
  markRail();
  refreshRail(); // etichette del rail nella lingua attiva
}

S.setRerender(render);
initI18n(render); // cambio lingua → ridisegna la schermata corrente
window.addEventListener('hashchange', render);
// POP-UP di accesso: qualunque elemento con [data-open-auth] apre il modale (valore "zone" = parti dallo step zona).
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-open-auth]');
  if (!t) return;
  e.preventDefault();
  openAuthModal({ step: t.getAttribute('data-open-auth') === 'zone' ? 'zone' : 'auth' });
});
// Attraversare il breakpoint 1024px ridisegna: il pannello split-view appare/scompare pulito.
// Se l'utente sta componendo un contenuto social, il layout della Rete è già governato dal CSS:
// rinviamo il render fino alla chiusura dell'overlay per non perdere testo e file selezionati.
try {
  let breakpointRenderPending = false;
  const socialOverlayOpen = () => !!document.querySelector('#app .socialA-modal-backdrop.open,#app .socialA-story-viewer.open,#app .gf-confirm-bd');
  window.matchMedia('(min-width: 1024px)').addEventListener('change', () => {
    if (socialOverlayOpen()) { breakpointRenderPending = true; return; }
    render();
  });
  window.addEventListener('gf:social-overlay-closed', () => {
    if (!breakpointRenderPending || socialOverlayOpen()) return;
    breakpointRenderPending = false; render();
  });
} catch (_) {}

// Bootstrap: prima risolviamo la sessione (cookie httpOnly) così il GATE sa subito se l'utente è loggato,
// poi carichiamo i dati. authMe() non fallisce mai (ritorna null se non loggato).
// setLang(detectLang()) carica il dizionario giusto (lingua salvata o del dispositivo) PRIMA del primo render.
// Il primo setLang non deve ridisegnare da solo: authMe potrebbe essere ancora in volo e il gate
// scambierebbe per ospite una sessione valida, perdendo la route profonda al refresh.
Promise.all([authMe().catch(() => null), adminMe().catch(() => null), loadData(), setLang(detectLang(), { persist: false, notify: false })]).then(render).catch(err => {
  app.innerHTML = `<div class="pad" style="padding:40px">Errore nel caricare i dati: ${err.message}</div>`;
});
