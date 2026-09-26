// ══════════════════════════════════════════════════════════════════════
//  CŒUR — client Supabase, état, outils communs
// ══════════════════════════════════════════════════════════════════════
// Mode intendance — mot de passe partagé, modifié par auth.js
let _editMode = false;
let _intendantName = '';
function currentAuthor() { return _intendantName || 'Intendance'; }

const SECTIONS = {
  accueil:   { label: 'Tableau de bord' },
  effectifs: { label: 'Effectifs & salaires', editable: true },
  commerces: { label: 'Commerces', editable: true },
  codex:     { label: 'Codex', editable: true },
  finances:  { label: 'Trésor', editable: true },
  impots:    { label: 'Impôts', editable: true },
  journal:   { label: 'Historique' },
};

const CFG = window.GardepommeConfig;
const sb = window.supabase && CFG?.supabaseUrl && CFG?.supabaseKey
  ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey)
  : null;
const EDITABLE_SECTIONS = Object.keys(SECTIONS).filter(k => SECTIONS[k].editable);

// Table → section (pour les droits et l'historique)
const TABLE_SECTION = {
  gp_membres: 'effectifs', gp_commerces: 'commerces', gp_lois: 'codex',
  gp_operations: 'finances', gp_catalogue: 'finances',
  gp_impots: 'impots', gp_parametres: 'impots',
};
const TABLE_LABEL = {
  gp_membres: 'Effectifs', gp_commerces: 'Commerces', gp_lois: 'Codex',
  gp_operations: 'Trésor', gp_catalogue: 'Catalogue',
  gp_impots: 'Impôts', gp_parametres: 'Paramètres',
};

// Données en mémoire, rechargées par section
const DB = {
  membres: [], commerces: [], lois: [], operations: [], catalogue: [], impots: [],
  params: { taux_taxe_commerce: '10', periode_label: 'semaine' },
};

let session = null;        // { user, username, displayName, titre, isSuperadmin, sectionsEdit }
let activeSection = 'accueil';

// ── Outils ──────────────────────────────────────────────────────────
function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function septims(v) { return num(v).toLocaleString('fr-FR') + ' sept.'; }
function septimsSigned(v) { const n = num(v); return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('fr-FR') + ' sept.'; }
function today() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d.length === 10 ? d + 'T12:00:00' : d);
  return Number.isNaN(x.getTime()) ? '—' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(d) {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '—' : x.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fullName(m) { return [m?.prenom, m?.nom].filter(Boolean).join(' ') || '—'; }
function norm(s) { return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function periode() { return DB.params.periode_label || 'semaine'; }
function tauxTaxe() { return Math.max(0, num(DB.params.taux_taxe_commerce)); }

// ── Droits ──────────────────────────────────────────────────────────
function isLogged() { return _editMode; }
function canEdit(section) { return _editMode; }
function canSee(section) { return !!SECTIONS[section]; }

// ── API (supabase-js) ───────────────────────────────────────────────
async function apiList(table, order = 'created_at', asc = true) {
  const { data, error } = await sb.from(table).select('*').order(order, { ascending: asc });
  if (error) throw error;
  return data || [];
}
async function apiInsert(table, row) {
  const { data, error } = await sb.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}
async function apiUpdate(table, id, patch, key = 'id') {
  const { data, error } = await sb.from(table).update(patch).eq(key, id).select().single();
  if (error) throw error;
  return data;
}
async function apiDelete(table, id, key = 'id') {
  const { error } = await sb.from(table).delete().eq(key, id);
  if (error) throw error;
}
function errMsg(e) {
  const m = e?.message || String(e);
  if (/row-level security|permission denied|violates row/i.test(m)) return "Ton compte n'a pas le droit de modifier cette section.";
  if (/Failed to fetch|NetworkError|522/i.test(m)) return 'Base injoignable. Vérifie ta connexion ou que le projet Supabase est actif.';
  return m;
}

// ── Toasts, loader, confirmation ────────────────────────────────────
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast toast-' + kind;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3600);
}
function setLoading(on) { document.body.classList.toggle('is-loading', !!on); }

function confirmBox(message, okLabel = 'Confirmer') {
  return new Promise(resolve => {
    openModal({
      title: 'Confirmation',
      body: `<p class="modal-text">${esc(message)}</p>`,
      okLabel,
      danger: /suppr|retir|congéd|efface/i.test(okLabel),
      onOk: () => { resolve(true); return true; },
      onCancel: () => resolve(false),
    });
  });
}

// ── Modale générique ────────────────────────────────────────────────
let modalCtx = null;
function openModal({ title, body, okLabel = 'Enregistrer', onOk, onCancel, danger = false, wide = false }) {
  modalCtx = { onOk, onCancel };
  const ov = document.getElementById('modal');
  ov.querySelector('.modal-card').classList.toggle('wide', wide);
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  const ok = document.getElementById('modal-ok');
  ok.textContent = okLabel;
  ok.classList.toggle('btn-danger', danger);
  ok.style.display = onOk ? '' : 'none';
  document.getElementById('modal-err').textContent = '';
  ov.hidden = false;
  const first = ov.querySelector('input:not([type=hidden]),select,textarea');
  setTimeout(() => (first || ok).focus(), 30);
}
function closeModal(cancelled = true) {
  const ov = document.getElementById('modal');
  if (ov.hidden) return;
  ov.hidden = true;
  if (cancelled && modalCtx?.onCancel) modalCtx.onCancel();
  modalCtx = null;
}
async function modalOk() {
  if (!modalCtx?.onOk) return closeModal();
  const btn = document.getElementById('modal-ok');
  btn.disabled = true;
  try {
    const res = await modalCtx.onOk();
    if (res !== false) closeModal(false);
  } catch (e) {
    console.error(e);
    document.getElementById('modal-err').textContent = errMsg(e);
  } finally { btn.disabled = false; }
}
function modalError(msg) { document.getElementById('modal-err').textContent = msg; return false; }

// ── Formulaires décrits par des champs ──────────────────────────────
// champ : { key, label, type:'text'|'number'|'date'|'select'|'textarea'|'checkbox', options, required, hint, full }
function renderFields(fields, row = {}) {
  return `<div class="form-grid">${fields.map(f => {
    const v = row[f.key] ?? f.default ?? '';
    const id = 'f-' + f.key;
    const req = f.required ? ' required' : '';
    const label = `<label for="${id}">${esc(f.label)}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>`;
    const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
    let input;
    if (f.type === 'select') {
      input = `<select id="${id}"${req}>${f.options.map(o => `<option${String(o) === String(v) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" rows="${f.rows || 4}"${req}>${esc(v)}</textarea>`;
    } else if (f.type === 'checkbox') {
      return `<div class="field field-check${f.full ? ' full' : ''}"><label><input type="checkbox" id="${id}"${v ? ' checked' : ''}> ${esc(f.label)}</label>${hint}</div>`;
    } else if (f.type === 'datalist') {
      input = `<input id="${id}" list="${id}-dl" value="${esc(v)}"${req}><datalist id="${id}-dl">${f.options.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
    } else {
      const extra = f.type === 'number' ? ' min="0" step="1" inputmode="numeric"' : '';
      input = `<input id="${id}" type="${f.type || 'text'}" value="${esc(v)}"${extra}${req}>`;
    }
    return `<div class="field${f.full || f.type === 'textarea' ? ' full' : ''}">${label}${input}${hint}</div>`;
  }).join('')}</div>`;
}
function readFields(fields) {
  const out = {};
  for (const f of fields) {
    const el = document.getElementById('f-' + f.key);
    if (!el) continue;
    let v = f.type === 'checkbox' ? el.checked : el.value.trim();
    if (f.type === 'number') v = v === '' ? 0 : Math.round(num(v));
    if (f.type === 'date' && v === '') v = null;
    if (f.required && (v === '' || v === null)) throw new Error(`Le champ « ${f.label} » est obligatoire.`);
    if (typeof v === 'string' && v === '' && !f.required) v = null;
    out[f.key] = v;
  }
  return out;
}

// Ouvre le formulaire d'ajout / modification d'une entrée
function openEditor({ table, section, title, fields, row, after, transform }) {
  if (!canEdit(section)) return toast("Ton compte n'a pas le droit de modifier cette section.", 'err');
  openModal({
    title: (row ? 'Modifier — ' : 'Ajouter — ') + title,
    body: renderFields(fields, row || {}),
    okLabel: row ? 'Enregistrer les modifications' : 'Ajouter',
    onOk: async () => {
      let data = readFields(fields);
      if (transform) data = transform(data);
      if (row) await apiUpdate(table, row.id, data);
      else await apiInsert(table, data);
      toast(row ? 'Modifications enregistrées.' : 'Entrée ajoutée.');
      if (after) await after();
    },
  });
}

async function removeRow({ table, section, id, label, after }) {
  if (!canEdit(section)) return;
  if (!await confirmBox(`Supprimer « ${label} » ? Tu pourras le rétablir depuis l'historique.`, 'Supprimer')) return;
  try {
    await apiDelete(table, id);
    toast('Entrée supprimée.');
    if (after) await after();
  } catch (e) { toast(errMsg(e), 'err'); }
}

// Barre d'outils standard d'une section
function toolbar({ section, searchId, onSearch, filters = '', addLabel, onAdd, extra = '' }) {
  const add = canEdit(section) && addLabel
    ? `<button class="btn btn-primary" onclick="${onAdd}">${esc(addLabel)}</button>` : '';
  return `<div class="toolbar">
    <input type="search" id="${searchId}" class="search" placeholder="Rechercher…" oninput="${onSearch}" aria-label="Rechercher">
    ${filters}
    <div class="toolbar-actions">${extra}${add}</div>
  </div>`;
}
function rowActions(section, editCall, delCall) {
  if (!canEdit(section)) return '';
  return `<td class="actions"><button class="icon-btn" title="Modifier" aria-label="Modifier" onclick="${editCall}">✎</button><button class="icon-btn danger" title="Supprimer" aria-label="Supprimer" onclick="${delCall}">✕</button></td>`;
}
function emptyRow(cols, text) { return `<tr class="empty"><td colspan="${cols}">${esc(text)}</td></tr>`; }
