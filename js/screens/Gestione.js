import { Icon } from '../icons.js';
import { StatusBar, toast, confirmSheet } from '../components.js';
import {
  getState, adminListUsers, adminSetLevel, adminDeleteUser, adminCreateInvite, adminRevokeInvite,
  adminListSocialModeration, adminResolveSocialModeration,
} from '../store.js';
import { t, getLang } from '../i18n.js';

// Gestione utenti & inviti — home dell'admin (nuovo modello: admin = proprietà dell'account).
// Elenco persone + livelli (Cliente/Produttore/Verificatore/Admin) + "Invita" (link → account + onboarding).

const esc = s => (s == null ? '' : String(s))
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  .gst-link-social{color:var(--verde-deep);background:var(--verde-pale);border-color:#cfe8d4}
  .gst-mod-badge{display:inline-flex;align-items:center;justify-content:center;min-width:23px;height:23px;padding:0 7px;border-radius:100px;background:#b43c2f;color:#fff;font-size:11px;font-weight:800;font-variant-numeric:tabular-nums}
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
  .gst-tab .tdot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:middle;background:var(--faint)}
  .gst-tab.tb-produttore .tdot{background:var(--verde)}
  .gst-tab.tb-cliente .tdot{background:var(--terra)}
  .gst-tab.tb-verificatore .tdot{background:var(--celeste)}
  .gst-tab.tb-admin .tdot{background:#C0392B}
  .gst-tab.on.tb-produttore{background:var(--verde-pale);color:var(--verde-deep);box-shadow:none}
  .gst-tab.on.tb-cliente{background:#F1E9DC;color:#8C6838;box-shadow:none}
  .gst-tab.on.tb-verificatore{background:var(--celeste-pale,#E3F4FC);color:var(--celeste-deep);box-shadow:none}
  .gst-tab.on.tb-admin{background:#FBEAE7;color:#C0392B;box-shadow:none}
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
    <a class="gst-link gst-link-social" href="#/admin/moderazione" data-moderation-link>
      ${Icon('flag', { size: 16 })}<span>${t('moderation.link')}</span>
      <span class="sp gst-mod-badge" data-moderation-count hidden aria-label=""></span>${Icon('chevron-right', { size: 16 })}
    </a>
    ${invites.length ? `<div class="gst-sect">Inviti in attesa</div>${invites.map(inviteRow).join('')}` : ''}
    <div class="gst-tabs">${tabDefs.map(tb => `<button class="gst-tab tb-${tb.k} ${activeTab === tb.k ? 'on' : ''}" data-tab="${tb.k}"><span class="tdot"></span>${tb.lb}<span class="n">${(groups[tb.k] || []).length}</span></button>`).join('')}</div>
    ${list.length ? list.map(userRow).join('') : '<div class="gst-empty">Nessuno in questa categoria.</div>'}
  `;
  bind(host, data);
  loadModerationCount(host);
}

async function loadModerationCount(host) {
  const badge = host.querySelector('[data-moderation-count]');
  if (!badge) return;
  try {
    const data = await adminListSocialModeration({ status: 'pending' });
    if (!badge.isConnected) return;
    const count = Number(data && data.counts && data.counts.pending) || 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count < 1;
    badge.setAttribute('aria-label', t('moderation.pendingBadge', { count }));
  } catch (_) {
    // Il collegamento resta utilizzabile anche durante un deploy sfalsato o un errore di rete.
  }
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

// --- Moderazione della Rete Gaia -------------------------------------------------
// Superficie volutamente raccolta: una coda operativa, non un secondo social.
// Tutti gli stili restano confinati al prefisso gsm per non contaminare l'app.
const MODERATION_CSS = `
  .gsm-page{width:min(100%,820px);margin:0 auto;padding:10px 18px 52px;color:var(--ink)}
  .gsm-back{display:inline-flex;align-items:center;gap:7px;margin:2px 0 18px;color:var(--ink-soft);font-size:13px;font-weight:700;text-decoration:none}
  .gsm-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:20px;margin-bottom:18px}
  .gsm-eyebrow{display:block;margin-bottom:7px;color:var(--verde-deep);font-size:10px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}
  .gsm-heading h1{font-family:var(--serif);font-size:clamp(26px,4vw,36px);font-weight:600;line-height:1.02;letter-spacing:-.025em}
  .gsm-heading p{max-width:570px;margin-top:7px;color:var(--muted);font-size:13.5px;line-height:1.5}
  .gsm-pending{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:76px;padding:10px 13px;border:1px solid #e9d8c5;border-radius:15px;background:#f7efe4;color:#855d34}
  .gsm-pending strong{font-family:var(--serif);font-size:25px;line-height:1;font-variant-numeric:tabular-nums}
  .gsm-pending span{margin-top:4px;font-size:9px;font-weight:850;letter-spacing:.09em;text-transform:uppercase}
  .gsm-filters{display:flex;gap:6px;margin:0 0 14px;padding:4px;border:1px solid var(--bd);border-radius:14px;background:var(--carta)}
  .gsm-filter{min-height:38px;flex:1;border:0;border-radius:10px;background:transparent;color:var(--muted);font:700 12.5px/1 inherit;cursor:pointer}
  .gsm-filter[aria-pressed="true"]{background:#fff;color:var(--verde-deep);box-shadow:0 1px 4px rgba(41,34,24,.1)}
  .gsm-queue{display:grid;gap:11px}
  .gsm-card{overflow:hidden;border:1px solid var(--bd);border-radius:18px;background:#fff;box-shadow:0 8px 28px rgba(56,44,28,.045)}
  .gsm-card-top{display:flex;align-items:center;gap:9px;padding:12px 14px;border-bottom:1px solid #eee9df}
  .gsm-kind{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:100px;background:var(--verde-pale);color:var(--verde-deep);font-size:10px;font-weight:850;letter-spacing:.07em;text-transform:uppercase}
  .gsm-kind.story{background:#edf3e6;color:#617745}
  .gsm-reports{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:100px;background:#fbeae7;color:#a43b30;font-size:11px;font-weight:800;font-variant-numeric:tabular-nums}
  .gsm-card-body{display:grid;grid-template-columns:minmax(0,1fr) 178px;gap:16px;padding:14px}
  .gsm-author{display:flex;align-items:center;gap:10px;min-width:0;margin-bottom:13px}
  .gsm-avatar{position:relative;display:grid;place-items:center;width:38px;height:38px;overflow:hidden;flex:none;border-radius:50%;background:#e9e4d9;color:var(--verde-deep);font-family:var(--serif);font-size:16px;font-weight:700}
  .gsm-avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .gsm-author-copy{min-width:0}
  .gsm-author-copy strong{display:block;overflow:hidden;font-size:13.5px;white-space:nowrap;text-overflow:ellipsis}
  .gsm-author-copy span{display:block;overflow:hidden;margin-top:2px;color:var(--muted);font-size:11.5px;white-space:nowrap;text-overflow:ellipsis}
  .gsm-text{margin:0;color:var(--ink-soft);font-size:14px;line-height:1.52;overflow-wrap:anywhere;white-space:pre-wrap}
  .gsm-text.empty{color:var(--faint);font-style:italic}
  .gsm-media{position:relative;min-height:128px;overflow:hidden;border-radius:13px;background:#e9e5dc}
  .gsm-media img,.gsm-media video{display:block;width:100%;height:100%;min-height:128px;max-height:190px;object-fit:cover;background:#191b18}
  .gsm-media-more{position:absolute;right:8px;top:8px;display:grid;place-items:center;min-width:31px;height:25px;padding:0 7px;border-radius:100px;background:rgba(24,27,23,.78);color:#fff;font-size:11px;font-weight:800;backdrop-filter:blur(6px)}
  .gsm-actions{display:flex;justify-content:flex-end;gap:8px;padding:11px 14px 13px;border-top:1px solid #eee9df;background:#fdfcf9}
  .gsm-action{min-height:39px;padding:0 16px;border-radius:100px;border:1px solid var(--bd);background:#fff;color:var(--ink-soft);font:750 12.5px/1 inherit;cursor:pointer}
  .gsm-action.keep{border-color:#bedfc6;background:var(--verde-pale);color:var(--verde-deep)}
  .gsm-action.remove{border-color:#ecc9c4;color:#a63b31}
  .gsm-action:disabled{opacity:.5;cursor:wait}
  .gsm-state{display:grid;place-items:center;min-height:220px;padding:30px;text-align:center;border:1px dashed var(--bd);border-radius:18px;background:rgba(255,255,255,.54)}
  .gsm-state span{display:grid;place-items:center;width:48px;height:48px;margin-bottom:12px;border-radius:50%;background:var(--verde-pale);color:var(--verde-deep)}
  .gsm-state h2{font-family:var(--serif);font-size:20px;font-weight:600}
  .gsm-state p{max-width:420px;margin-top:6px;color:var(--muted);font-size:13px;line-height:1.5}
  .gsm-retry{margin-top:15px;padding:9px 15px;border:0;border-radius:100px;background:var(--verde);color:#fff;font:750 12.5px/1 inherit;cursor:pointer}
  .gsm-loading{display:grid;gap:10px}
  .gsm-skeleton{height:176px;border:1px solid var(--bd);border-radius:18px;background:linear-gradient(100deg,#f5f2eb 25%,#fff 38%,#f5f2eb 52%);background-size:220% 100%;animation:gsm-shimmer 1.2s linear infinite}
  @keyframes gsm-shimmer{to{background-position-x:-220%}}
  @media(min-width:1024px){.gsm-page{padding-top:28px}.gsm-back{display:none}}
  @media(max-width:560px){
    .gsm-page{padding-inline:14px}.gsm-heading{grid-template-columns:minmax(0,1fr) 64px;gap:10px}.gsm-pending{min-width:64px;padding-inline:8px}
    .gsm-card-body{grid-template-columns:1fr}.gsm-media{min-height:180px}.gsm-media img,.gsm-media video{min-height:180px;max-height:310px}
    .gsm-actions{display:grid;grid-template-columns:1fr 1fr}.gsm-action{width:100%}
  }
`;

export function ModerazioneSocial() {
  return {
    html: `<div class="screen no-nav"><style>${MODERATION_CSS}</style>${StatusBar()}
      <div class="scroll"><main class="gsm-page" id="gsm-view" aria-busy="true"></main></div></div>`,
    onMount(el) { mountModeration(el.querySelector('#gsm-view')); },
  };
}

function moderationActive(ctx) {
  return !ctx.disposed && ctx.host.isConnected && /^#\/admin\/moderazione$/.test(location.hash);
}

function safeModerationUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('//')) return '';
  try {
    const url = new URL(raw, location.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (!/^https?:\/\//i.test(raw) && url.origin !== location.origin) return '';
    return esc(url.href);
  } catch (_) { return ''; }
}

function moderationDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  try { return new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
  catch (_) { return date.toLocaleString(); }
}

function moderationLocation(value) {
  if (typeof value === 'string') return value.trim();
  const source = value && typeof value === 'object' ? value : {};
  const parts = [source.city, source.zoneLabel || source.zone, source.region]
    .map(part => String(part || '').trim()).filter(Boolean);
  return [...new Set(parts)].slice(0, 2).join(' · ');
}

function moderationAvatar(author = {}) {
  const name = String(author.name || t('moderation.authorFallback')).trim();
  const initial = esc((name[0] || 'G').toUpperCase());
  const picture = safeModerationUrl(author.picture);
  return `<span class="gsm-avatar" aria-hidden="true"><span>${initial}</span>${picture ? `<img src="${picture}" alt="" loading="lazy">` : ''}</span>`;
}

function moderationMedia(item) {
  const media = Array.isArray(item && item.media) ? item.media : [];
  if (!media.length) return '';
  const first = typeof media[0] === 'string' ? { url: media[0] } : (media[0] || {});
  const url = safeModerationUrl(first.url);
  if (!url) return '';
  const mime = String(first.mime || '').toLowerCase();
  const video = first.type === 'video' || mime.startsWith('video/');
  const asset = video
    ? `<video src="${url}" controls preload="metadata" playsinline aria-label="${esc(t('moderation.mediaAlt'))}"></video>`
    : `<img src="${url}" alt="${esc(t('moderation.mediaAlt'))}" loading="lazy">`;
  const extra = media.length - 1;
  return `<div class="gsm-media">${asset}${extra > 0 ? `<span class="gsm-media-more" aria-label="${esc(t('moderation.moreMedia', { count: extra }))}">+${extra}</span>` : ''}</div>`;
}

function moderationCard(item, ctx) {
  const type = item && item.type === 'story' ? 'story' : 'post';
  const id = String(item && item.id || '');
  const author = item && item.author || {};
  const name = String(author.name || t('moderation.authorFallback'));
  const location = moderationLocation(item && item.location) || t('moderation.unknownPlace');
  const date = moderationDate(item && (item.pendingSince || item.createdAt));
  const count = Math.max(0, Number(item && item.reportCount) || 0);
  const key = `${type}:${id}`;
  const busy = ctx.busy.has(key);
  const typeLabel = t(type === 'story' ? 'moderation.type.story' : 'moderation.type.post');
  return `<article class="gsm-card" data-moderation-item="${esc(id)}" data-moderation-type="${type}">
    <header class="gsm-card-top">
      <span class="gsm-kind ${type}">${Icon(type === 'story' ? 'play' : 'message-circle', { size: 13 })}${typeLabel}</span>
      <span class="gsm-reports">${Icon('flag', { size: 13 })}${t('moderation.reportCount', { count })}</span>
    </header>
    <div class="gsm-card-body">
      <div>
        <div class="gsm-author">${moderationAvatar(author)}<div class="gsm-author-copy"><strong>${esc(name)}</strong><span>${esc(location)}${date ? ` · ${esc(date)}` : ''}</span></div></div>
        <p class="gsm-text${item && item.text ? '' : ' empty'}">${item && item.text ? esc(item.text) : t('moderation.noText')}</p>
      </div>
      ${moderationMedia(item)}
    </div>
    <footer class="gsm-actions">
      <button type="button" class="gsm-action keep" data-moderation-decision="keep" data-id="${esc(id)}" data-type="${type}" aria-label="${esc(t('moderation.keepAria', { type: typeLabel, name }))}"${busy ? ' disabled' : ''}>${t('moderation.keep')}</button>
      <button type="button" class="gsm-action remove" data-moderation-decision="remove" data-id="${esc(id)}" data-type="${type}" aria-label="${esc(t('moderation.removeAria', { type: typeLabel, name }))}"${busy ? ' disabled' : ''}>${t('moderation.remove')}</button>
    </footer>
  </article>`;
}

function moderationHeader(ctx) {
  const pending = Math.max(0, Number(ctx.counts && ctx.counts.pending) || ctx.items.length);
  return `<a class="gsm-back" href="#/admin">${Icon('arrow-left', { size: 16 })}${t('moderation.back')}</a>
    <header class="gsm-heading">
      <div><span class="gsm-eyebrow">${t('moderation.eyebrow')}</span><h1>${t('moderation.title')}</h1><p>${t('moderation.subtitle')}</p></div>
      <div class="gsm-pending" aria-label="${esc(t('moderation.pendingBadge', { count: pending }))}"><strong>${pending}</strong><span>${t('moderation.pendingShort')}</span></div>
    </header>`;
}

function moderationFilters(ctx) {
  const defs = [['all', 'moderation.filter.all'], ['post', 'moderation.filter.post'], ['story', 'moderation.filter.story']];
  return `<div class="gsm-filters" role="group" aria-label="${esc(t('moderation.filtersAria'))}">${defs.map(([value, key]) =>
    `<button type="button" class="gsm-filter" data-moderation-filter="${value}" aria-pressed="${ctx.filter === value}">${t(key)}</button>`).join('')}</div>`;
}

function moderationState(icon, title, body, retry = false) {
  return `<section class="gsm-state"><div><span>${Icon(icon, { size: 22 })}</span><h2>${title}</h2><p>${body}</p>${retry ? `<button type="button" class="gsm-retry" data-moderation-retry>${t('moderation.retry')}</button>` : ''}</div></section>`;
}

function renderModeration(ctx) {
  if (!moderationActive(ctx)) return;
  const { host } = ctx;
  host.setAttribute('aria-busy', ctx.loading ? 'true' : 'false');
  if (ctx.loading) {
    host.innerHTML = `${moderationHeader(ctx)}<div class="gsm-loading" aria-label="${esc(t('moderation.loading'))}"><div class="gsm-skeleton"></div><div class="gsm-skeleton"></div></div>`;
    return;
  }
  if (ctx.error) {
    host.innerHTML = `${moderationHeader(ctx)}${moderationState('info', t('moderation.loadErrorTitle'), t('moderation.loadErrorBody'), true)}`;
    host.querySelector('[data-moderation-retry]').onclick = () => refreshModeration(ctx);
    return;
  }
  const visible = ctx.filter === 'all' ? ctx.items : ctx.items.filter(item => item.type === ctx.filter);
  host.innerHTML = `${moderationHeader(ctx)}${moderationFilters(ctx)}<section class="gsm-queue" aria-label="${esc(t('moderation.queueAria'))}">
    ${visible.length ? visible.map(item => moderationCard(item, ctx)).join('') : moderationState('check-circle', t('moderation.emptyTitle'), t('moderation.emptyBody'))}
  </section>`;
  host.querySelectorAll('[data-moderation-filter]').forEach(button => {
    button.onclick = () => { ctx.filter = button.dataset.moderationFilter; renderModeration(ctx); };
  });
  host.querySelectorAll('[data-moderation-decision]').forEach(button => {
    button.onclick = () => resolveModeration(ctx, button.dataset.type, button.dataset.id, button.dataset.moderationDecision);
  });
}

async function refreshModeration(ctx, { silent = false } = {}) {
  if (!moderationActive(ctx)) return;
  if (!silent) { ctx.loading = true; ctx.error = null; renderModeration(ctx); }
  try {
    const data = await adminListSocialModeration({ status: 'pending', signal: ctx.controller.signal });
    if (!moderationActive(ctx)) return;
    ctx.items = Array.isArray(data && data.items) ? data.items : [];
    ctx.counts = data && data.counts || { pending: ctx.items.length };
    ctx.loading = false; ctx.error = null;
    renderModeration(ctx);
  } catch (error) {
    if (!moderationActive(ctx) || error && error.name === 'AbortError') return;
    if (silent) return;
    ctx.loading = false; ctx.error = error;
    renderModeration(ctx);
  }
}

async function resolveModeration(ctx, type, id, decision) {
  if (!moderationActive(ctx)) return;
  const item = ctx.items.find(entry => String(entry.id) === String(id) && entry.type === type);
  if (!item) return;
  if (decision === 'remove') {
    const ok = await confirmSheet(t('moderation.removeConfirmTitle'), {
      body: t('moderation.removeConfirmBody'), okLabel: t('moderation.confirmRemove'),
      cancelLabel: t('moderation.cancel'), danger: true,
    });
    if (!ok || !moderationActive(ctx)) return;
  }
  const key = `${type}:${id}`;
  ctx.busy.add(key); renderModeration(ctx);
  let resolved = false;
  try {
    const data = await adminResolveSocialModeration(type, id, decision, { signal: ctx.controller.signal });
    if (!moderationActive(ctx)) return;
    resolved = true;
    if (data && data.counts) ctx.counts = data.counts;
    else ctx.counts = { ...ctx.counts, pending: Math.max(0, (Number(ctx.counts && ctx.counts.pending) || ctx.items.length) - 1) };
    toast(t(decision === 'remove' ? 'moderation.resolvedRemove' : 'moderation.resolvedKeep'), 'success');
  } catch (error) {
    if (!moderationActive(ctx) || error && error.name === 'AbortError') return;
    if (error && (error.status === 404 || error.status === 410)) {
      resolved = true;
      ctx.counts = { ...ctx.counts, pending: Math.max(0, (Number(ctx.counts && ctx.counts.pending) || ctx.items.length) - 1) };
      toast(t('moderation.alreadyResolved'), 'info');
    } else {
      toast(t('moderation.resolveError'), 'error');
    }
  } finally {
    ctx.busy.delete(key);
    if (resolved && moderationActive(ctx)) {
      ctx.items = ctx.items.filter(entry => !(String(entry.id) === String(id) && entry.type === type));
      if (!ctx.counts || !Number.isFinite(Number(ctx.counts.pending))) ctx.counts = { pending: ctx.items.length };
    }
    if (moderationActive(ctx)) renderModeration(ctx);
  }
  if (resolved && moderationActive(ctx)) void refreshModeration(ctx, { silent: true });
}

async function mountModeration(host) {
  if (!host) return;
  if (getState().role !== 'admin') {
    host.removeAttribute('aria-busy');
    host.innerHTML = moderationState('lock', t('moderation.accessDenied'), t('moderation.accessDeniedBody'));
    return;
  }
  const ctx = {
    host, items: [], counts: { pending: 0 }, filter: 'all', busy: new Set(),
    loading: true, error: null, controller: new AbortController(), disposed: false,
  };
  const dispose = () => {
    if (ctx.disposed) return;
    ctx.disposed = true; ctx.controller.abort(); observer.disconnect();
    window.removeEventListener('hashchange', onHashChange);
  };
  const onHashChange = () => { if (!/^#\/admin\/moderazione$/.test(location.hash)) dispose(); };
  const observer = new MutationObserver(() => { if (!host.isConnected) dispose(); });
  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', onHashChange);
  renderModeration(ctx);
  await refreshModeration(ctx);
}
