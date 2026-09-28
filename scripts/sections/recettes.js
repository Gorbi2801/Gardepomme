// ══════════════════════════════════════════════════════════════════════
//  RECETTES — liste d'ingrédients par produit + calculateur de besoins
// ══════════════════════════════════════════════════════════════════════
const RECETTE_CATEGORIES = ['Alimentation', 'Boissons', 'Artisanat', 'Autre'];
const UNITES = ['unité', 'pièce', 'kg', 'g', 'L', 'cl', 'ml', 'tonneau', 'caisse', 'botte', 'boisseaux', 'lot'];

let recetteSelected = null;
let recetteTab = 'liste';   // 'liste' | 'calcul'
let _ings = [];             // état temporaire de l'éditeur d'ingrédients

// ── Rendu principal ─────────────────────────────────────────────────
RENDERERS.recettes = () => {
  if (!recetteSelected || !DB.recettes.find(r => r.id === recetteSelected))
    recetteSelected = DB.recettes[0]?.id || null;

  const cats = [...new Set(DB.recettes.map(r => r.categorie))].sort();
  const edit = canEdit('recettes');

  const index = cats.length
    ? cats.map(c => `<div class="codex-group">
        <h3>${esc(c)}</h3>
        <ol>${DB.recettes.filter(r => r.categorie === c).map(r => `
          <li data-s="${esc(norm(r.nom))}">
            <button class="codex-link${r.id === recetteSelected ? ' active' : ''}" onclick="openRecette('${r.id}')">
              ${esc(r.nom)}${r.rendement ? `<span class="ref">→ ${esc(r.rendement)}</span>` : ''}
            </button></li>`).join('')}</ol>
      </div>`).join('')
    : `<p class="muted-text" style="padding:.5rem">${edit ? 'Aucune recette. Ajoute-en une.' : 'Aucune recette.'}</p>`;

  const r = DB.recettes.find(x => x.id === recetteSelected);
  const ings = Array.isArray(r?.ingredients) ? r.ingredients : [];

  const detail = r ? `<article class="codex-page">
    <p class="codex-recueil">${esc(r.categorie)}${r.rendement ? ` — ${esc(r.rendement)}` : ''}</p>
    <h3>${esc(r.nom)}</h3>
    <table class="ledger ing-view">
      <thead><tr><th>Ingrédient</th><th class="num">Quantité</th><th>Unité</th></tr></thead>
      <tbody>${ings.length
        ? ings.map(i => `<tr><td>${esc(i.nom || '—')}</td><td class="num">${num(i.quantite).toLocaleString('fr-FR')}</td><td>${esc(i.unite || '')}</td></tr>`).join('')
        : `<tr class="empty"><td colspan="3">Aucun ingrédient renseigné.</td></tr>`}
      </tbody>
    </table>
    ${r.notes ? `<p class="codex-source" style="margin-top:1.2rem">${esc(r.notes)}</p>` : ''}
    ${edit ? `<div class="codex-actions">
      <button class="btn btn-ghost" onclick="editRecette('${r.id}')">Modifier</button>
      <button class="btn btn-ghost danger" onclick="delRecette('${r.id}')">Supprimer</button>
    </div>` : ''}
  </article>`
  : `<div class="codex-empty"><p>${edit ? 'Ajoute ta première recette.' : 'Aucune recette sélectionnée.'}</p></div>`;

  const tabs = [['liste', 'Recettes'], ['calcul', 'Calculateur de besoins']];

  return `${sectionHead('Recettes', 'Ingrédients par produit. L\'onglet Calculateur te donne la liste de courses pour une production donnée.')}
  <div class="tabs" role="tablist">
    ${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === recetteTab}" class="tab${k === recetteTab ? ' active' : ''}" onclick="recSetTab('${k}')">${l}</button>`).join('')}
  </div>
  ${recetteTab === 'calcul' ? renderCalculateur() : `
  <div class="codex">
    <aside class="codex-index">
      <input type="search" id="rec-q" class="search" placeholder="Chercher…" oninput="filterRecettes()" aria-label="Chercher">
      ${edit ? `<button class="btn btn-primary block" onclick="editRecette()">Ajouter une recette</button>` : ''}
      <nav>${index}</nav>
    </aside>
    ${detail}
  </div>`}
  ${sectionHistory(['gp_recettes'])}`;
};

function recSetTab(k) { recetteTab = k; renderActive(); }

function filterRecettes() {
  const q = norm(document.getElementById('rec-q')?.value || '');
  document.querySelectorAll('.codex-group').forEach(g => {
    let n = 0;
    g.querySelectorAll('li[data-s]').forEach(li => { const ok = !q || li.dataset.s.includes(q); li.hidden = !ok; if (ok) n++; });
    g.hidden = !n;
  });
}

function openRecette(id) {
  recetteSelected = id;
  recetteTab = 'liste';
  renderActive();
}

// ── Calculateur ──────────────────────────────────────────────────────
function renderCalculateur() {
  const rows = DB.recettes.map(r => `
    <tr>
      <td><label><input type="checkbox" class="calc-check" data-id="${r.id}"> ${esc(r.nom)}</label></td>
      <td>${esc(r.categorie)}</td>
      <td>${esc(r.rendement || '—')}</td>
      <td><input type="number" class="calc-qty" data-id="${r.id}" min="1" step="1" value="1" style="width:70px;padding:.3rem .4rem;border:1px solid var(--filet);border-radius:var(--radius)"></td>
    </tr>`).join('');

  return `<div class="sheet">
    <p class="lead-in">Coche les recettes à produire, indique la quantité, puis calcule les besoins totaux en ingrédients.</p>
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Recette</th><th>Catégorie</th><th>Rendement unitaire</th><th style="width:90px">Quantité</th></tr></thead>
      <tbody>${rows || emptyRow(4, 'Aucune recette disponible.')}</tbody>
    </table></div>
    <div class="form-actions"><button class="btn btn-primary" onclick="calculerBesoins()">Calculer les besoins</button></div>
    <div id="calc-result"></div>
  </div>`;
}

function calculerBesoins() {
  const checks = [...document.querySelectorAll('.calc-check:checked')];
  if (!checks.length) { toast('Coche au moins une recette.', 'err'); return; }

  const totaux = {};
  for (const cb of checks) {
    const id  = cb.dataset.id;
    const qty = Math.max(1, Math.round(num(document.querySelector(`.calc-qty[data-id="${id}"]`)?.value)));
    const r   = DB.recettes.find(x => x.id === id);
    if (!r) continue;
    for (const ing of (Array.isArray(r.ingredients) ? r.ingredients : [])) {
      const key = `${(ing.nom || '').trim()}||${(ing.unite || 'unité').trim()}`;
      totaux[key] = (totaux[key] || 0) + num(ing.quantite) * qty;
    }
  }

  const result = document.getElementById('calc-result');
  if (!Object.keys(totaux).length) {
    result.innerHTML = '<p class="muted-text" style="margin-top:1rem">Aucun ingrédient trouvé dans les recettes sélectionnées.</p>';
    return;
  }

  const lignes = Object.entries(totaux)
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([key, qte]) => {
      const [nom, unite] = key.split('||');
      return `<tr><td><strong>${esc(nom)}</strong></td><td class="num">${qte.toLocaleString('fr-FR')}</td><td>${esc(unite)}</td></tr>`;
    }).join('');

  result.innerHTML = `<div style="margin-top:1.2rem">
    <h3 class="sheet-title">Besoins totaux</h3>
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Ingrédient</th><th class="num">Quantité totale</th><th>Unité</th></tr></thead>
      <tbody>${lignes}</tbody>
    </table></div>
  </div>`;
}

// ── Éditeur de recette ───────────────────────────────────────────────
function editRecette(id) {
  if (!canEdit('recettes')) return;
  const row = id ? DB.recettes.find(r => r.id === id) : null;
  _ings = row ? JSON.parse(JSON.stringify(row.ingredients || [])) : [];

  openModal({
    title: (row ? 'Modifier — ' : 'Ajouter — ') + 'recette',
    wide: true,
    body: `<div class="form-grid">
      <div class="field"><label for="r-nom">Nom <span class="req">*</span></label><input id="r-nom" value="${esc(row?.nom || '')}"></div>
      <div class="field"><label for="r-cat">Catégorie</label>
        <select id="r-cat">${RECETTE_CATEGORIES.map(c => `<option${c === (row?.categorie || 'Alimentation') ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label for="r-rend">Rendement</label><input id="r-rend" placeholder="ex : 1 tonneau, 20 portions" value="${esc(row?.rendement || '')}"></div>
      <div class="field"><label for="r-ordre">Ordre</label><input id="r-ordre" type="number" value="${num(row?.ordre ?? 100)}"></div>
      <div class="field full"><label for="r-notes">Notes</label><textarea id="r-notes" rows="2">${esc(row?.notes || '')}</textarea></div>
    </div>
    <h4 style="margin:.9rem 0 .5rem;font-family:var(--font-sc)">Ingrédients</h4>
    <div id="ing-editor"></div>
    <button class="btn btn-ghost" style="margin-top:.5rem" onclick="addIngRow()">+ Ajouter un ingrédient</button>`,
    okLabel: row ? 'Enregistrer' : 'Ajouter',
    onOk: async () => {
      const nom = document.getElementById('r-nom').value.trim();
      if (!nom) return modalError('Le nom est obligatoire.');
      syncIngEditor();
      const data = {
        nom,
        categorie: document.getElementById('r-cat').value,
        rendement: document.getElementById('r-rend').value.trim() || null,
        ordre: Math.round(num(document.getElementById('r-ordre').value)) || 100,
        notes: document.getElementById('r-notes').value.trim() || null,
        ingredients: _ings.filter(i => i.nom.trim()),
      };
      if (row) await apiUpdate('gp_recettes', row.id, data);
      else await apiInsert('gp_recettes', data);
      toast(row ? 'Recette modifiée.' : 'Recette ajoutée.');
      await reload();
    },
  });
  refreshIngEditor();
}

function syncIngEditor() {
  document.querySelectorAll('#ing-editor .ing-row').forEach((el, i) => {
    if (!_ings[i]) return;
    _ings[i].nom      = el.querySelector('.ing-nom').value.trim();
    _ings[i].quantite = parseFloat(el.querySelector('.ing-qte').value) || 0;
    _ings[i].unite    = el.querySelector('.ing-unite').value;
  });
}

function addIngRow() {
  syncIngEditor();
  _ings.push({ nom: '', quantite: 1, unite: 'unité' });
  refreshIngEditor();
}

function removeIngRow(i) {
  syncIngEditor();
  _ings.splice(i, 1);
  refreshIngEditor();
}

function refreshIngEditor() {
  const box = document.getElementById('ing-editor');
  if (!box) return;
  box.innerHTML = _ings.map((ing, i) => `
    <div class="ing-row">
      <input class="ing-nom" placeholder="Ingrédient" value="${esc(ing.nom || '')}">
      <input class="ing-qte" type="number" min="0" step="0.1" value="${num(ing.quantite) || 1}" inputmode="decimal" style="width:80px">
      <select class="ing-unite">${UNITES.map(u => `<option${u === (ing.unite || 'unité') ? ' selected' : ''}>${u}</option>`).join('')}</select>
      <button class="icon-btn danger" aria-label="Retirer" onclick="removeIngRow(${i})">✕</button>
    </div>`).join('');
}

function delRecette(id) {
  const r = DB.recettes.find(x => x.id === id);
  removeRow({ table: 'gp_recettes', section: 'recettes', id, label: r?.nom,
    after: async () => { recetteSelected = null; await reload(); } });
}
