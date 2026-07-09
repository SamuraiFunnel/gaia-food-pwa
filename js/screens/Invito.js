import { Icon } from '../icons.js';
import { StatusBar } from '../components.js';
import { currentUser, authMe, signOut, inviteInfo, acceptInvite } from '../store.js';
import { openAuthModal } from './AuthModal.js';

// Accettazione invito: link → (crea account con la mail invitata) → applica il livello → onboarding.
// Rotta pubblica (#/invito/:token): funziona anche da sloggati.

const esc = s => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const LV = { produttore: 'Produttore', verificatore: 'Verificatore', admin: 'Admin' };

const CSS = `
  .inv{min-height:70vh;display:flex;align-items:center;justify-content:center;padding:30px 22px}
  .inv-c{max-width:400px;text-align:center}
  .inv-ic{width:74px;height:74px;border-radius:50%;background:linear-gradient(135deg,var(--verde),var(--celeste));display:flex;align-items:center;justify-content:center;margin:0 auto 18px;box-shadow:0 14px 34px -14px rgba(22,163,74,.6)}
  .inv-c h1{font-family:var(--serif);font-size:27px;font-weight:600;letter-spacing:-.01em;margin-bottom:10px}
  .inv-c p{font-size:15px;color:var(--muted);line-height:1.55}
  .inv-c p b{color:var(--ink)}
  .inv-go{margin-top:22px;background:var(--verde);color:#fff;border:none;border-radius:14px;padding:15px 26px;font-size:15.5px;font-weight:700;cursor:pointer;width:100%;max-width:320px}
  .inv-alt{display:inline-block;margin-top:16px;color:var(--muted);font-size:14px;text-decoration:none}
`;

export function Invito(token) {
  return {
    html: `<div class="screen no-nav"><style>${CSS}</style>${StatusBar()}
      <div class="scroll"><div class="inv" id="invv">Verifico l'invito…</div></div></div>`,
    onMount(el) { mount(el.querySelector('#invv'), token); },
  };
}

async function mount(host, token) {
  let info;
  try { info = await inviteInfo(token); }
  catch (e) { return card(host, 'mail', 'Invito non valido', 'Questo link non esiste o non è più valido.', null); }
  if (info.used) return card(host, 'mail', 'Invito già usato', 'È già stato accettato. Accedi normalmente all\'app.', { label: 'Vai all\'accesso', fn: () => { location.hash = '#/'; } });
  if (info.expired || !info.valid) return card(host, 'mail', 'Invito scaduto', 'Chiedi un nuovo link a chi ti ha invitato.', null);

  await authMe(); // rinfresca lo stato utente
  const me = currentUser();
  const roleLabel = LV[info.level] || info.level;

  if (!me) {
    return card(host, 'leaf', 'Benvenuto in Gaia Food',
      `Sei stato invitato come <b>${esc(roleLabel)}</b> con l'email <b>${esc(info.email)}</b>. Crea il tuo account per iniziare.`,
      { label: 'Crea il tuo account', fn: () => openAuthModal({ redirect: '#/invito/' + token }) });
  }

  const myEmail = String(me.email || me.id || '').toLowerCase();
  if (myEmail !== String(info.email).toLowerCase()) {
    return card(host, 'mail', 'Invito per un\'altra email',
      `Questo invito è per <b>${esc(info.email)}</b>, ma sei entrato come <b>${esc(myEmail)}</b>. Esci e accedi con l'email invitata.`,
      { label: 'Esci e cambia account', fn: async () => { await signOut(); openAuthModal({ redirect: '#/invito/' + token }); } });
  }

  // stessa email → accetta e manda all'onboarding
  host.innerHTML = `<div class="inv-c"><div class="inv-ic">${Icon('leaf', { size: 30, color: '#fff' })}</div>
    <h1>Ci siamo…</h1><p>Attivo il tuo accesso come <b>${esc(roleLabel)}</b>.</p></div>`;
  try {
    const r = await acceptInvite(token);
    await authMe();
    const dest = (r.level === 'produttore') ? '#/azienda' : '#/home';
    location.hash = dest; setTimeout(() => window.dispatchEvent(new Event('hashchange')), 40);
  } catch (e) {
    card(host, 'mail', 'Non riesco ad attivare', esc(e.message || 'Riprova più tardi.'), { label: 'Vai alla Home', fn: () => { location.hash = '#/home'; } });
  }
}

function card(host, ic, title, bodyHtml, action) {
  host.innerHTML = `<div class="inv-c">
    <div class="inv-ic">${Icon(ic, { size: 28, color: '#fff' })}</div>
    <h1>${esc(title)}</h1><p>${bodyHtml}</p>
    ${action ? `<button class="inv-go" id="inv-go">${esc(action.label)}</button>` : '<a class="inv-alt" href="#/home">Torna alla Home</a>'}
  </div>`;
  if (action) host.querySelector('#inv-go').onclick = action.fn;
}
