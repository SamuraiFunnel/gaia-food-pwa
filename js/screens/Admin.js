import { Icon } from '../icons.js';
import { StatusBar, toast, confirmSheet } from '../components.js';
import { getState, adminMe, adminLogin, adminLogout, createProducer, updateProducer, deleteProducer, uploadPhoto, reloadData, fetchCandidature, adminProducers, approveProducer, verifyProducer, publishProducer } from '../store.js';
import {
  extrasCss,
  buildVideos, bindVideos, readVideos,
  buildMapPicker, bindMapPicker,
  buildSeasonal, bindSeasonal, readSeasonal,
} from '../admin-extras.js';

const TONES = ['pascolo', 'latte', 'olio', 'formaggio', 'uova', 'grano', 'lavoro', 'paesaggio'];
const esc = s => (s == null ? '' : String(s)).replace(/"/g, '&quot;').replace(/</g, '&lt;');
// Contatti: in passato erano booleani (true/false). Ora sono valori (numero/email).
// Un legacy `true` non deve ricomparire come testo "true" nel campo → lo trattiamo come vuoto.
const cval = (p, k) => {
  const v = p.contact && p.contact[k];
  return (v === true || v === false || v == null) ? '' : v;
};

export function Admin() {
  return {
    html: `<div class="screen no-nav"><style>
      .adm{padding:10px 18px 40px}
      .adm h1{font-family:var(--serif);font-size:24px;font-weight:600;margin:4px 0}
      .adm .row{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .adm .field{margin-bottom:12px}
      .adm label{display:block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted2);margin-bottom:5px}
      .adm input[type=text],.adm input[type=number],.adm select,.adm textarea{width:100%;padding:11px 12px;border:1px solid var(--bd);border-radius:12px;font-family:inherit;font-size:14px;background:#fff;color:var(--ink)}
      .adm textarea{min-height:90px;resize:vertical}
      .adm .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .adm .three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
      .adm .checks{display:flex;flex-wrap:wrap;gap:8px}
      .adm .ck{display:inline-flex;align-items:center;gap:6px;font-size:13px;border:1px solid var(--bd);border-radius:100px;padding:7px 12px;cursor:pointer}
      .adm .ck input{accent-color:var(--verde)}
      .adm .arow{display:flex;align-items:center;gap:12px;padding:11px;border:1px solid var(--bd);border-radius:14px;background:#fff;margin-bottom:8px}
      .adm .arow .th{width:46px;height:46px;border-radius:10px;background:#eee center/cover;flex:none}
      .adm .arow .nm{font-family:var(--serif);font-weight:600;font-size:15px}
      .adm .arow .mt{font-size:12px;color:var(--muted)}
      .adm .mini{font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:10px;border:1px solid var(--bd3)}
      .adm .danger{color:var(--red-alert);border-color:rgba(239,68,68,.35)}
      .adm .photo-prev{width:100%;height:160px;border-radius:14px;background:#eee center/cover;border:1px solid var(--bd);margin-bottom:8px}
      .adm .login-card{max-width:360px;margin:60px auto;background:#fff;border:1px solid var(--bd);border-radius:18px;padding:26px}
      ${extrasCss}
    </style>
    ${StatusBar()}
    <div class="scroll"><div class="adm" id="admv">Caricamento…</div></div></div>`,
    onMount(el) { mount(el.querySelector('#admv')); },
  };
}

async function mount(host) {
  let role = null;
  try { role = await adminMe(); } catch {}
  if (role) renderDash(host, role); else renderLogin(host);
}

function renderLogin(host) {
  host.innerHTML = `<div class="login-card">
    <div style="text-align:center;margin-bottom:14px">${Icon('lock', { size: 28, color: 'var(--verde)' })}</div>
    <h1 style="text-align:center;font-size:20px">Area riservata</h1>
    <p class="muted" style="font-size:13px;text-align:center;margin-bottom:18px">Accesso per amministratori e verificatori.</p>
    <div class="field"><label>Password</label><input type="text" id="pw" placeholder="••••••" style="-webkit-text-security:disc"></div>
    <button class="btn btn-grad btn-block" id="go">Entra</button>
    <div id="err" style="color:var(--red-alert);font-size:13px;margin-top:10px;text-align:center"></div>
    <div style="text-align:center;margin-top:16px"><a href="#/home" class="muted" style="font-size:13px">← Torna all'app</a></div>
  </div>`;
  const go = async () => {
    const pw = host.querySelector('#pw').value;
    try { await adminLogin(pw); renderDash(host, getState().role); }
    catch (e) { host.querySelector('#err').textContent = 'Password errata'; }
  };
  host.querySelector('#go').onclick = go;
  host.querySelector('#pw').onkeydown = e => { if (e.key === 'Enter') go(); };
}

async function renderDash(host, role) {
  host.innerHTML = `<div class="muted" style="padding:20px">Caricamento…</div>`;
  // Pipeline self-service: candidature (richieste) + lista COMPLETA produttori (include bozze/in-verifica).
  let cand = [], all = [];
  try { [cand, all] = await Promise.all([fetchCandidature(), adminProducers()]); } catch (e) {}
  const requests = cand.filter(c => c.userId && c.state === 'todo');        // form inviato, non ancora approvato
  const drafts = all.filter(p => p.ownerId && p.status === 'draft');         // approvato, sta compilando
  const review = all.filter(p => p.status === 'in_review');                  // inviato per la verifica
  const ps = getState().producers;                                          // schede pubblicate (lista classica)

  const reqRow = (c) => `<div class="arow">
      <div style="flex:1;min-width:0"><div class="nm">${esc(c.name)}</div>
        <div class="mt">${[esc(c.place), (c.categories || []).join(', '), esc((c.contact && c.contact.phone) || '')].filter(Boolean).join(' · ')}</div></div>
      <button class="mini" style="background:var(--verde);color:#fff;border-color:var(--verde)" data-approve="${esc(c.userId)}" data-name="${esc(c.name)}">Approva</button>
    </div>`;
  const draftRow = (p) => `<div class="arow">
      <div class="th" style="background-image:url('${p.photo || ''}')"></div>
      <div style="flex:1;min-width:0"><div class="nm">${esc(p.name) || '(senza nome)'}</div>
        <div class="mt">${esc(p.ownerId)} · ${(p.products || []).length} prodotti · sta compilando</div></div>
      <button class="mini" data-rev="${p.id}">Rivedi</button>
    </div>`;
  const revRow = (p) => `<div class="arow">
      <div class="th" style="background-image:url('${p.photo || ''}')"></div>
      <div style="flex:1;min-width:0"><div class="nm">${esc(p.name)}</div>
        <div class="mt">${esc(p.place)} · ${(p.products || []).length} prodotti · ${p.verifiedAt ? 'verificato in sede ✓' : 'da verificare in sede'}</div></div>
      ${p.verifiedAt
      ? `<button class="mini" style="background:var(--verde);color:#fff;border-color:var(--verde)" data-pub="${p.id}">Pubblica</button>`
      : `<button class="mini" data-ver="${p.id}">Segna verificato</button>`}
      <button class="mini" data-rev="${p.id}">Rivedi</button>
    </div>`;
  const section = (title, count, inner, hint) => `
    <div style="margin:18px 0 8px" class="row"><h1 style="font-size:18px">${title} <span class="muted" style="font-size:13px;font-weight:400">(${count})</span></h1></div>
    ${count ? inner : `<div class="muted" style="font-size:13px;padding:0 2px 4px">${hint}</div>`}`;

  host.innerHTML = `
    <div class="row"><h1>Produttori</h1><button class="mini" id="logout">Esci (${role})</button></div>
    ${section('🟠 Richieste da approvare', requests.length, requests.map(reqRow).join(''), 'Nessuna richiesta in attesa.')}
    ${section('✍️ In compilazione', drafts.length, drafts.map(draftRow).join(''), 'Nessuna bozza in compilazione.')}
    ${section('🔎 Da verificare e pubblicare', review.length, review.map(revRow).join(''), 'Nessuna scheda inviata alla verifica.')}
    <div style="margin:22px 0 8px" class="row"><h1 style="font-size:18px">✅ Pubblicati <span class="muted" style="font-size:13px;font-weight:400">(${ps.length})</span></h1></div>
    <button class="btn btn-grad btn-block" id="add" style="margin:6px 0 14px">${Icon('plus', { size: 18, color: '#fff' })} Aggiungi produttore</button>
    <div id="rows">${ps.map(p => `
      <div class="arow">
        <div class="th" style="background-image:url('${p.photo || ''}')"></div>
        <div style="flex:1;min-width:0"><div class="nm">${esc(p.name)}</div>
          <div class="mt">${esc(p.place)} · ${esc(p.primary)} · ${p.verify ? p.verify.state : '—'}</div></div>
        <button class="mini" data-edit="${p.id}">Modifica</button>
        <button class="mini danger" data-del="${p.id}">Elimina</button>
      </div>`).join('')}</div>`;

  host.querySelector('#logout').onclick = async () => { await adminLogout(); renderLogin(host); };
  host.querySelector('#add').onclick = () => renderEditor(host, null);
  host.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    b.disabled = true; b.textContent = '…';
    try { await approveProducer(b.getAttribute('data-approve'), b.getAttribute('data-name')); renderDash(host, role); }
    catch (e) { b.disabled = false; b.textContent = 'Approva'; toast('Errore: ' + e.message, 'error'); }
  });
  host.querySelectorAll('[data-ver]').forEach(b => b.onclick = async () => {
    b.disabled = true; try { await verifyProducer(b.getAttribute('data-ver')); renderDash(host, role); } catch (e) { b.disabled = false; toast('Errore: ' + e.message, 'error'); }
  });
  host.querySelectorAll('[data-pub]').forEach(b => b.onclick = async () => {
    if (!(await confirmSheet('Pubblicare la scheda?', { body: 'Andrà live sulla mappa col badge «Verificato sul campo».', okLabel: 'Pubblica' }))) return;
    b.disabled = true; try { await publishProducer(b.getAttribute('data-pub')); await reloadData(); renderDash(host, role); } catch (e) { b.disabled = false; toast('Errore: ' + e.message, 'error'); }
  });
  host.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => { const p = all.find(x => x.id === b.getAttribute('data-rev')); if (p) renderEditor(host, p); });
  host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => renderEditor(host, ps.find(p => p.id === b.dataset.edit)));
  host.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const p = ps.find(x => x.id === b.dataset.del);
    if (await confirmSheet('Eliminare "' + p.name + '"?', { body: "L'azione è definitiva.", okLabel: 'Elimina', danger: true })) { await deleteProducer(p.id); renderDash(host, role); }
  });
}

function renderEditor(host, p) {
  const isNew = !p; p = p || { categories: [], contact: {}, verify: { state: 'valid', date: '' } };
  const cats = getState().categories;
  const catChecks = cats.map(c => `<label class="ck"><input type="checkbox" name="cat" value="${c.id}" ${p.categories && p.categories.includes(c.id) ? 'checked' : ''}>${c.label}</label>`).join('');
  const toneOpts = TONES.map(t => `<option value="${t}" ${p.tone === t ? 'selected' : ''}>${t}</option>`).join('');
  const stOpts = ['valid', 'expiring', 'suspended'].map(s => `<option value="${s}" ${p.verify && p.verify.state === s ? 'selected' : ''}>${s}</option>`).join('');
  host.innerHTML = `
    <div class="row"><h1>${isNew ? 'Nuovo produttore' : 'Modifica'}</h1><button class="mini" id="cancel">← Indietro</button></div>
    ${!isNew ? `<div class="photo-prev" style="background-image:url('${p.photo || ''}')"></div>
      <div class="field"><label>Foto del produttore</label><input type="file" id="photo" accept="image/*"><div class="muted" id="pmsg" style="font-size:12px;margin-top:4px"></div></div>` : '<p class="muted" style="font-size:13px;margin-bottom:12px">Salva prima il produttore, poi potrai caricare la foto.</p>'}
    <div class="field"><label>Nome azienda</label><input type="text" id="name" value="${esc(p.name)}"></div>
    <div class="two">
      <div class="field"><label>Comune / luogo</label><input type="text" id="place" value="${esc(p.place)}"></div>
      <div class="field"><label>Distanza (km)</label><input type="number" step="0.1" id="km" value="${esc(p.km)}"></div>
    </div>
    <div class="two">
      <div class="field"><label>Lat</label><input type="number" step="0.0001" id="lat" value="${esc(p.lat)}"></div>
      <div class="field"><label>Lng</label><input type="number" step="0.0001" id="lng" value="${esc(p.lng)}"></div>
    </div>
    <div class="field"><label>Categorie</label><div class="checks">${catChecks}</div></div>
    <div class="two">
      <div class="field"><label>Categoria principale</label><select id="primary">${cats.map(c => `<option value="${c.id}" ${p.primary === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>
      <div class="field"><label>Tono foto (placeholder)</label><select id="tone">${toneOpts}</select></div>
    </div>
    <div class="two">
      <div class="field"><label>Stato verifica</label><select id="vstate">${stOpts}</select></div>
      <div class="field"><label>Data verifica</label><input type="text" id="vdate" value="${esc(p.verify && p.verify.date)}" placeholder="12 giugno 2026"></div>
    </div>
    <div class="field"><label>Orari</label><input type="text" id="hours" value="${esc(p.hours)}" placeholder="Aperto ora · chiude 19:00"></div>
    <div class="field"><label>Indirizzo</label><input type="text" id="address" value="${esc(p.address)}"></div>
    <div class="field"><label>Contatti (lascia vuoto per non pubblicarli)</label>
      <div class="field"><input type="text" id="c_wa" value="${esc(cval(p, 'whatsapp'))}" placeholder="WhatsApp · numero es. 393331234567"></div>
      <div class="field"><input type="text" id="c_ph" value="${esc(cval(p, 'phone'))}" placeholder="Telefono · es. +39 0864 12345"></div>
      <div class="field"><input type="text" id="c_em" value="${esc(cval(p, 'email'))}" placeholder="Email · es. info@produttore.it"></div>
    </div>
    <div class="field"><label>Racconto</label><textarea id="story">${esc(p.story)}</textarea></div>
    ${buildMapPicker()}
    ${buildSeasonal(p)}
    ${buildVideos(p)}
    <button class="btn btn-grad btn-block" id="save" style="margin-top:18px">${isNew ? 'Crea produttore' : 'Salva modifiche'}</button>
    <div id="savemsg" class="muted" style="font-size:13px;text-align:center;margin-top:10px"></div>`;

  host.querySelector('#cancel').onclick = () => renderDash(host, getState().role);

  // Sezioni extra (helper in admin-extras.js): anteprima video, picker mappa, inventario.
  bindVideos(host);
  bindSeasonal(host);
  const z = getState().zone;
  bindMapPicker(host, { center: (z && Array.isArray(z.center)) ? z.center : [13.934, 41.776] });

  if (!isNew) {
    const fi = host.querySelector('#photo');
    fi.onchange = () => {
      const f = fi.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = async () => {
        host.querySelector('#pmsg').textContent = 'Caricamento…';
        try { const up = await uploadPhoto(p.id, rd.result); host.querySelector('.photo-prev').style.backgroundImage = `url('${up.photo}?t=${Date.now()}')`; host.querySelector('#pmsg').textContent = 'Foto aggiornata ✓'; }
        catch (e) { host.querySelector('#pmsg').textContent = 'Errore: ' + e.message; }
      };
      rd.readAsDataURL(f);
    };
  }
  const saveBtn = host.querySelector('#save');
  const saveMsg = host.querySelector('#savemsg');
  saveBtn.onclick = async () => {
    const g = id => host.querySelector('#' + id);
    const patch = {
      name: g('name').value.trim(), place: g('place').value.trim(),
      km: parseFloat(g('km').value) || 0, lat: parseFloat(g('lat').value) || null, lng: parseFloat(g('lng').value) || null,
      categories: [...host.querySelectorAll('input[name=cat]:checked')].map(c => c.value),
      primary: g('primary').value, tone: g('tone').value,
      verify: { ...(p.verify || {}), state: g('vstate').value, date: g('vdate').value.trim() },
      hours: g('hours').value.trim(), address: g('address').value.trim(),
      // Contatti: salviamo il VALORE reale (numero/email). Vuoto = non pubblicato.
      contact: {
        whatsapp: g('c_wa').value.trim(),
        phone: g('c_ph').value.trim(),
        email: g('c_em').value.trim(),
      },
      story: g('story').value.trim(),
      seasonal: readSeasonal(host),
      videos: readVideos(host),
    };
    if (!patch.name) { saveMsg.style.color = 'var(--red-alert)'; saveMsg.textContent = 'Il nome è obbligatorio.'; return; }
    saveBtn.disabled = true;
    saveMsg.style.color = 'var(--muted)'; saveMsg.textContent = 'Salvataggio…';
    try {
      if (isNew) {
        const np = await createProducer(patch);
        renderEditor(host, getState().producers.find(x => x.id === np.id) || np);
        const m2 = host.querySelector('#savemsg');
        if (m2) { m2.style.color = 'var(--verde-deep)'; m2.textContent = 'Produttore creato ✓ — ora puoi caricare la foto.'; }
      } else {
        await updateProducer(p.id, patch);
        saveMsg.style.color = 'var(--verde-deep)'; saveMsg.textContent = 'Modifiche salvate ✓';
        saveBtn.disabled = false;
      }
    } catch (e) {
      saveBtn.disabled = false;
      saveMsg.style.color = 'var(--red-alert)'; saveMsg.textContent = 'Errore nel salvataggio: ' + e.message;
    }
  };
}
