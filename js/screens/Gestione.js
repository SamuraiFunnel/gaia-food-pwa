import { Icon } from '../icons.js';
import { StatusBar, toast, confirmSheet } from '../components.js';
import { getState, adminListUsers, adminSetLevel, adminDeleteUser, adminCreateInvite, adminRevokeInvite } from '../store.js';

// Gestione utenti & inviti — home dell'admin (nuovo modello: admin = proprietà dell'account).
// Elenco persone + livelli (Cliente/Produttore/Verificatore/Admin) + "Invita" (link → account + onboarding).

const esc = s => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const LEVELS = [
  { k: 'cliente', lb: 'Cliente', c: 'cli' },
  { k: 'produttore', lb: 'Produttore', c: 'prod' },
  { k: 'verificatore', lb: 'Verificatore', c: 'ver' },
  { k: 'admin', lb: 'Admin', c: 'adm' },
];
const lvl = k => (LEVELS.find(l => l.k === k) || { lb: k, c: 'cli' });
const trashSvg = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/><path d="M10 11v6M14 11v6"/></svg>`;

const CSS = `
  .gst{padding:12px 18px 46px;max-width:720px;margin:0 auto}
  .gst-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:6px 0 4px}
  .gst-head h1{font-family:var(--serif);font-size:26px;font-weight:600}
  .gst-head p{font-size:13px;color:var(--muted);margin-top:2px}
  .gst-invite{display:inline-flex;align-items:center;gap:7px;background:var(--verde);color:#fff;border:none;border-radius:100px;padding:10px 16px;font-size:14px;font-weight:700;cursor:pointer;flex:none}
  .gst-link{display:flex;align-items:center;gap:8px;margin:14px 0 4px;font-size:13.5px;font-weight:600;color:var(--celeste-deep);background:var(--celeste-pale,#E3F4FC);border:1px solid #cfeaf7;border-radius:12px;padding:11px 13px;text-decoration:none}
  .gst-link .sp{margin-left:auto}
  .gst-sect{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin:22px 0 9px}
  .gst-card{background:#fff;border:1px solid var(--bd);border-radius:16px;padding:13px 14px;margin-bottom:9px}
  .gst-u{display:flex;align-items:center;gap:11px}
  .gst-av{width:42px;height:42px;border-radius:50%;background:var(--carta) center/cover;flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--muted2);font-size:16px}
  .gst-meta{min-width:0;flex:1}
  .gst-nm{font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gst-em{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gst-prov{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted2);background:var(--carta);border-radius:100px;padding:2px 7px;flex:none}
  .gst-own{font-size:10.5px;font-weight:800;color:#8C6838;background:#F1E9DC;border-radius:100px;padding:4px 10px;flex:none}
  .gst-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
  .gst-chip{font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:100px;border:1px solid var(--bd);background:#fff;color:var(--ink-soft);cursor:pointer}
  .gst-chip.on.cli{background:#F1E9DC;border-color:#e2d3ba;color:#8C6838}
  .gst-chip.on.prod{background:var(--verde-pale);border-color:#cfebd6;color:var(--verde-deep)}
  .gst-chip.on.ver{background:var(--celeste-pale,#E3F4FC);border-color:#cfeaf7;color:var(--celeste-deep)}
  .gst-chip.on.adm{background:#FBEAE7;border-color:#f0cfc9;color:#C0392B}
  .gst-chip[disabled]{opacity:.5;cursor:default}
  .gst-pstat{font-size:11.5px;color:var(--muted);margin-top:8px}
  .gst-inv{display:flex;align-items:center;gap:10px}
  .gst-inv .x{margin-left:auto;background:none;border:none;color:var(--muted);cursor:pointer;padding:6px}
  .gst-err{padding:40px 10px;text-align:center;color:#C0392B}
  .gst-empty{padding:24px;text-align:center;color:var(--muted);font-size:13.5px}
  .gst-tabs{display:flex;gap:5px;margin:18px 0 12px;background:var(--carta);border:1px solid var(--bd);border-radius:100px;padding:4px}
  .gst-tab{flex:1;text-align:center;font-size:13px;font-weight:700;padding:9px 6px;border-radius:100px;border:none;background:none;color:var(--muted);cursor:pointer;white-space:nowrap}
  .gst-tab.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(31,24,18,.12)}
  .gst-tab .n{font-weight:800;opacity:.55;margin-left:4px}
  .gst-u .gst-del{margin-left:auto;background:none;border:none;color:var(--faint);cursor:pointer;padding:6px;flex:none;border-radius:8px}
  .gst-u .gst-del:hover{color:#C0392B;background:#FBEAE7}
  /* overlay invito */
  .gst-ov{position:fixed;inset:0;z-index:1200;display:flex;align-items:flex-end;justify-content:center;background:rgba(20,16,12,.42);opacity:0;transition:opacity .2s}
  .gst-ov.in{opacity:1}
  .gst-sheet{background:var(--bianco,#FBF9F5);width:100%;max-width:520px;border-radius:22px 22px 0 0;padding:20px 20px 26px;transform:translateY(16px);transition:transform .24s}
  .gst-ov.in .gst-sheet{transform:none}
  @media(min-width:640px){.gst-ov{align-items:center}.gst-sheet{border-radius:22px}}
  .gst-sheet h2{font-family:var(--serif);font-size:20px;font-weight:600;margin-bottom:4px}
  .gst-sheet p{font-size:13px;color:var(--muted);margin-bottom:14px}
  .gst-sheet label{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted2);margin:12px 0 6px}
  .gst-sheet input{width:100%;padding:12px 13px;border:1px solid var(--bd);border-radius:12px;font-size:15px;font-family:inherit;background:#fff;color:var(--ink)}
  .gst-sheet .go{width:100%;margin-top:18px;background:var(--verde);color:#fff;border:none;border-radius:14px;padding:14px;font-size:15px;font-weight:700;cursor:pointer}
  .gst-sheet .cancel{width:100%;margin-top:8px;background:none;border:none;color:var(--muted);font-size:13.5px;padding:8px;cursor:pointer}
  .gst-linkbox{display:flex;gap:8px;margin-top:10px}
  .gst-linkbox input{font-size:12.5px;color:var(--ink-soft)}
  .gst-linkbox button{flex:none;background:var(--ink);color:#fff;border:none;border-radius:12px;padding:0 16px;font-weight:700;cursor:pointer}
`;

export function Gestione() {
  return {
    html: `<div class="screen no-nav"><style>${CSS}</style>${StatusBar()}
      <div class="scroll"><div class="gst" id="gstv">Caricamento…</div></div></div>`,
    onMount(el) { mount(el.querySelector('#gstv')); },
  };
}

async function mount(host) {
  if (getState().role !== 'admin') {
    host.innerHTML = `<div class="gst-err">Accesso riservato agli amministratori.<br><a href="#/home">Torna alla Home</a></div>`;
    return;
  }
  await load(host);
}

async function load(host) {
  let data;
  try { data = await adminListUsers(); }
  catch (e) { host.innerHTML = `<div class="gst-err">Errore nel caricamento: ${esc(e.message)}</div>`; return; }
  render(host, data);
}

function initials(u) {
  const s = (u.name || u.email || '?').trim();
  return s.slice(0, 1).toUpperCase();
}

function userRow(u) {
  const cur = u.level;
  const av = u.picture
    ? `<div class="gst-av" style="background-image:url('${esc(u.picture)}')"></div>`
    : `<div class="gst-av">${esc(initials(u))}</div>`;
  const chips = u.owner
    ? `<span class="gst-own">Admin · owner (fisso)</span>`
    : LEVELS.map(l => `<button class="gst-chip ${l.c} ${cur === l.k ? 'on' : ''}" data-uid="${esc(u.id)}" data-level="${l.k}"${cur === l.k ? ' disabled' : ''}>${l.lb}</button>`).join('');
  const pstat = (cur === 'produttore' && u.producerStatus && u.producerStatus !== 'approved')
    ? `<div class="gst-pstat">Vetrina: ${esc(u.producerStatus)}</div>` : '';
  const del = u.owner ? '' : `<button class="gst-del" data-del="${esc(u.id)}" title="Elimina account" aria-label="Elimina account">${trashSvg}</button>`;
  return `<div class="gst-card">
    <div class="gst-u">${av}
      <div class="gst-meta"><div class="gst-nm">${esc(u.name || u.email)}</div><div class="gst-em">${esc(u.email)}</div></div>
      <span class="gst-prov">${esc(u.provider || '—')}</span>${del}
    </div>
    <div class="gst-chips">${chips}</div>${pstat}
  </div>`;
}

function inviteRow(inv) {
  return `<div class="gst-card gst-inv">
    ${Icon('mail', { size: 18, color: 'var(--celeste-deep)' })}
    <div class="gst-meta"><div class="gst-nm">${esc(inv.email)}</div><div class="gst-em">invito · ${esc(lvl(inv.level).lb)}</div></div>
    <button class="x" data-copy="${esc(inv.token)}" title="Copia link">${Icon('share', { size: 16 })}</button>
    <button class="x" data-revoke="${esc(inv.token)}" title="Revoca">${Icon('x', { size: 16 })}</button>
  </div>`;
}

function inviteLink(token) { return location.origin + location.pathname + '#/invito/' + token; }

let activeTab = 'produttore'; // tab correntemente aperta (persiste tra i re-render)
let lastData = null;

function render(host, data) {
  lastData = data;
  const users = data.users || [], invites = data.invites || [];
  const groups = { produttore: [], cliente: [], verificatore: [], admin: [] };
  users.forEach(u => (groups[u.level] || groups.cliente).push(u));
  // Tab: Produttori · Clienti · Admin sempre; Verificatori solo se ce ne sono.
  const tabDefs = [{ k: 'produttore', lb: 'Produttori' }, { k: 'cliente', lb: 'Clienti' }, { k: 'admin', lb: 'Admin' }];
  if (groups.verificatore.length) tabDefs.splice(2, 0, { k: 'verificatore', lb: 'Verificatori' });
  if (!tabDefs.some(t => t.k === activeTab)) activeTab = 'produttore';
  const list = groups[activeTab] || [];
  host.innerHTML = `
    <div class="gst-head">
      <div><h1>Gestione</h1><p>${users.length} persone · ${invites.length} inviti attivi</p></div>
      <button class="gst-invite" data-invite>${Icon('plus', { size: 18 })} Invita</button>
    </div>
    <a class="gst-link" href="#/admin/pipeline" data-link>${Icon('check-circle', { size: 16 })} Verifiche e pubblicazione produttori<span class="sp">${Icon('chevron-right', { size: 16 })}</span></a>
    ${invites.length ? `<div class="gst-sect">Inviti in attesa</div>${invites.map(inviteRow).join('')}` : ''}
    <div class="gst-tabs">${tabDefs.map(tb => `<button class="gst-tab ${activeTab === tb.k ? 'on' : ''}" data-tab="${tb.k}">${tb.lb}<span class="n">${(groups[tb.k] || []).length}</span></button>`).join('')}</div>
    ${list.length ? list.map(userRow).join('') : '<div class="gst-empty">Nessuno in questa categoria.</div>'}
  `;
  bind(host, data);
}

function bind(host, data) {
  host.querySelector('[data-invite]').onclick = () => openInvite(host);

  host.querySelectorAll('.gst-tab[data-tab]').forEach(b => b.onclick = () => { activeTab = b.getAttribute('data-tab'); render(host, lastData); });

  host.querySelectorAll('.gst-del[data-del]').forEach(b => b.onclick = async () => {
    const uid = b.getAttribute('data-del');
    const u = (data.users || []).find(x => x.id === uid);
    const extra = (u && u.level === 'produttore') ? ' Verrà rimossa anche la sua scheda produttore.' : '';
    const ok = await confirmSheet('Eliminare questo account?', { body: `${u ? (u.name || u.email) : uid}.${extra} L'azione è definitiva.`, okLabel: 'Elimina', danger: true });
    if (!ok) return;
    try { await adminDeleteUser(uid); toast('Account eliminato', 'success'); await load(host); }
    catch (e) { toast('Errore: ' + e.message, 'error'); }
  });

  host.querySelectorAll('.gst-chip[data-level]').forEach(b => b.onclick = async () => {
    const uid = b.getAttribute('data-uid'), level = b.getAttribute('data-level');
    const u = (data.users || []).find(x => x.id === uid);
    if (level === 'cliente' && u && u.level === 'produttore') {
      const ok = await confirmSheet('Riportare a Cliente?', { body: 'La sua vetrina verrà messa offline (i dati restano). Per ripubblicarla servirà una nuova verifica.', okLabel: 'Sì, a Cliente', danger: true });
      if (!ok) return;
    }
    b.disabled = true;
    try { await adminSetLevel(uid, level); toast(`${u ? (u.name || u.email) : 'Utente'} → ${lvl(level).lb}`, 'success'); await load(host); }
    catch (e) { toast('Errore: ' + e.message, 'error'); b.disabled = false; }
  });

  host.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copyLink(inviteLink(b.getAttribute('data-copy'))));
  host.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
    const ok = await confirmSheet('Revocare l\'invito?', { okLabel: 'Revoca', danger: true });
    if (!ok) return;
    try { await adminRevokeInvite(b.getAttribute('data-revoke')); toast('Invito revocato', 'success'); await load(host); }
    catch (e) { toast('Errore: ' + e.message, 'error'); }
  });
}

async function copyLink(link) {
  try { await navigator.clipboard.writeText(link); toast('Link copiato — incollalo su WhatsApp/email', 'success'); }
  catch { toast('Copia manualmente: ' + link, 'info'); }
}

// --- Overlay "Invita" ---
function openInvite(host) {
  let level = 'produttore';
  const ov = document.createElement('div');
  ov.className = 'gst-ov';
  ov.innerHTML = `<div class="gst-sheet">
    <h2>Invita una persona</h2>
    <p>Genera un link: chi lo apre crea l'account e parte già col ruolo scelto.</p>
    <label>Email</label>
    <input type="email" id="iv-email" placeholder="nome@email.com" autocomplete="off">
    <label>Ruolo</label>
    <div class="gst-chips" id="iv-lvls">
      ${['produttore', 'verificatore', 'admin'].map(k => `<button class="gst-chip ${lvl(k).c} ${k === 'produttore' ? 'on' : ''}" data-l="${k}">${lvl(k).lb}</button>`).join('')}
    </div>
    <div id="iv-body"></div>
    <button class="go" id="iv-go">Genera link d'invito</button>
    <button class="cancel" id="iv-cancel">Annulla</button>
  </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('in'));
  const close = () => { ov.classList.remove('in'); setTimeout(() => ov.remove(), 220); };
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('#iv-cancel').onclick = close;
  ov.querySelectorAll('#iv-lvls .gst-chip').forEach(b => b.onclick = () => {
    level = b.getAttribute('data-l');
    ov.querySelectorAll('#iv-lvls .gst-chip').forEach(x => x.classList.toggle('on', x === b));
  });
  ov.querySelector('#iv-go').onclick = async () => {
    const email = (ov.querySelector('#iv-email').value || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Email non valida', 'error'); return; }
    const go = ov.querySelector('#iv-go'); go.disabled = true; go.textContent = 'Creo…';
    try {
      const r = await adminCreateInvite(email, level);
      const link = inviteLink(r.token);
      ov.querySelector('#iv-body').innerHTML = `<label>Link pronto — copialo e invialo</label>
        <div class="gst-linkbox"><input type="text" readonly value="${esc(link)}" id="iv-link"><button id="iv-copy">Copia</button></div>`;
      go.style.display = 'none';
      ov.querySelector('#iv-cancel').textContent = 'Chiudi';
      ov.querySelector('#iv-copy').onclick = () => { copyLink(link); };
      ov.querySelector('#iv-link').onclick = e => e.target.select();
      load(host); // aggiorna la lista inviti dietro
    } catch (e) { toast('Errore: ' + e.message, 'error'); go.disabled = false; go.textContent = 'Genera link d\'invito'; }
  };
}
