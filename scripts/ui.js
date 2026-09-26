// ══════════════════════════════════════════════════════════════════════
//  NAVIGATION & CHARGEMENT
// ══════════════════════════════════════════════════════════════════════
const RENDERERS = {};   // section → fonction de rendu (remplies par chaque module)

async function loadData() {
  const [membres, commerces, lois, operations, impots, params] = await Promise.all([
    apiList('gp_membres', 'prenom'),
    apiList('gp_commerces', 'nom'),
    apiList('gp_lois', 'ordre'),
    apiList('gp_operations', 'date_op', false),
    apiList('gp_impots', 'echeance'),
    apiList('gp_parametres', 'cle'),
  ]);
  Object.assign(DB, { membres, commerces, lois, operations, impots });
  params.forEach(p => { DB.params[p.cle] = p.valeur; });
}

async function refreshAll() {
  setLoading(true);
  try {
    await loadData();
    renderNav();
    renderActive();
  } catch (e) {
    console.error(e);
    document.getElementById('page').innerHTML =
      `<div class="sheet"><h2>Le livret n'a pas pu être chargé</h2><p>${esc(errMsg(e))}</p>
       <p>Si c'est la première installation, vérifie que <code>supabase/sql/01_schema.sql</code> a bien été exécuté.</p></div>`;
  } finally { setLoading(false); }
}

// Recharge les données puis ré-affiche la section courante (après une écriture)
async function reload() { await loadData(); renderActive(); }

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = Object.entries(SECTIONS).filter(([k]) => canSee(k)).map(([k, s]) => {
    const badge = navBadge(k);
    return `<button class="nav-btn${k === activeSection ? ' active' : ''}" onclick="go('${k}')"${k === activeSection ? ' aria-current="page"' : ''}>
      <span>${esc(s.label)}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}${canEdit(k) && s.editable ? '<span class="nav-pen" title="Tu peux modifier cette section">✎</span>' : ''}
    </button>`;
  }).join('');
}

function navBadge(k) {
  if (k === 'impots') {
    const late = DB.impots.filter(i => i.statut !== 'Payé' && i.echeance && i.echeance < today()).length;
    return late ? `${late} en retard` : '';
  }
  return '';
}

function go(sec) {
  if (!canSee(sec)) return;
  activeSection = sec;
  history.replaceState(null, '', '#' + sec);
  renderNav();
  renderActive();
  document.getElementById('page').focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  document.body.classList.remove('nav-open');
}

function renderActive() {
  if (!canSee(activeSection)) activeSection = 'accueil';
  const fn = RENDERERS[activeSection];
  document.getElementById('page').innerHTML = fn ? fn() : '';
  const after = RENDERERS[activeSection + ':after'];
  if (after) after();
}

function sectionHead(title, lead) {
  return `<header class="page-head"><h2>${esc(title)}</h2>${lead ? `<p>${lead}</p>` : ''}</header>`;
}

// Filtre texte simple sur les lignes d'un tableau (data-s = texte normalisé)
function filterTable(tbodyId, inputId, extra = {}) {
  const q = norm(document.getElementById(inputId)?.value || '');
  document.querySelectorAll(`#${tbodyId} tr[data-s]`).forEach(tr => {
    const okQ = !q || tr.dataset.s.includes(q);
    const okX = Object.entries(extra).every(([attr, val]) => !val || tr.dataset[attr] === val);
    tr.hidden = !(okQ && okX);
  });
}

// Tri par clic sur l'en-tête (data-sort = valeur, data-num pour les nombres)
function sortBy(th) {
  const table = th.closest('table');
  const idx = [...th.parentNode.children].indexOf(th);
  const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
  table.querySelectorAll('th').forEach(t => { delete t.dataset.dir; t.removeAttribute('aria-sort'); });
  th.dataset.dir = dir;
  th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
  const tbody = table.tBodies[0];
  const rows = [...tbody.querySelectorAll('tr[data-s]')];
  const val = tr => { const c = tr.children[idx]; return c?.dataset.sort ?? c?.textContent.trim() ?? ''; };
  rows.sort((a, b) => {
    const va = val(a), vb = val(b);
    const na = Number(va), nb = Number(vb);
    const r = (va !== '' && vb !== '' && !isNaN(na) && !isNaN(nb)) ? na - nb : va.localeCompare(vb, 'fr');
    return dir === 'asc' ? r : -r;
  });
  rows.forEach(r => tbody.appendChild(r));
}
function th(label, cls = '') { return `<th class="${cls}"><button class="th-sort" onclick="sortBy(this.parentNode)">${esc(label)}</button></th>`; }

// Export CSV d'un tableau visible
function exportCsv(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const rows = [...table.querySelectorAll('tr')].filter(tr => !tr.hidden && !tr.classList.contains('empty'));
  const csv = rows.map(tr => [...tr.children].filter(c => !c.classList.contains('actions'))
    .map(c => `"${c.textContent.trim().replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
}

function toggleNav() { document.body.classList.toggle('nav-open'); }
