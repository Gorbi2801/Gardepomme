// ══════════════════════════════════════════════════════════════════════
//  CONTRATS — accords commerciaux avec les partenaires
//  Section informative uniquement, sans impact sur le trésor.
// ══════════════════════════════════════════════════════════════════════
const CONTRAT_STATUTS = ['Actif', 'Suspendu', 'Terminé'];
const CONTRAT_TYPES   = ['Achat', 'Vente'];
const CONTRAT_UNITES  = ['unité', 'pièce', 'kg', 'L', 'tonneau', 'caisse', 'botte', 'lot', 'sac'];

let contratSelected = null;
let _contratItems   = [];

RENDERERS.contrats = () => {
  if (!contratSelected || !DB.contrats.find(c => c.id === contratSelected))
    contratSelected = DB.contrats[0]?.id || null;

  const edit    = canEdit('contrats');
  const actifs  = DB.contrats.filter(c => c.statut === 'Actif');
  const autres  = DB.contrats.filter(c => c.statut !== 'Actif');

  const listeSection = (titre, liste) => !liste.length ? '' : `
    <div class="codex-group">
      <h3>${titre}</h3>
      <ol>${liste.map(c => `
        <li data-s="${esc(norm(c.partenaire))}">
          <button class="codex-link${c.id === contratSelected ? ' active' : ''}" onclick="openContrat('${c.id}')">
            ${esc(c.partenaire)}
            ${c.date_debut ? `<span class="ref">${fmtDate(c.date_debut)}</span>` : ''}
          </button>
        </li>`).join('')}
      </ol>
    </div>`;

  const index = listeSection('Actifs', actifs) + listeSection('Suspendus / Terminés', autres)
    || `<p class="muted-text" style="padding:.5rem">${edit ? 'Aucun contrat. Ajoutes-en un.' : 'Aucun contrat enregistré.'}</p>`;

  const c = DB.contrats.find(x => x.id === contratSelected);
  const items = Array.isArray(c?.items) ? c.items : [];

  const detail = c ? `<article class="codex-page">
    <p class="codex-recueil">
      <span class="pill pill-${norm(c.statut)}">${esc(c.statut)}</span>
      ${c.date_debut ? `&nbsp;·&nbsp;Depuis le ${fmtDate(c.date_debut)}` : ''}
    </p>
    <h3>${esc(c.partenaire)}</h3>
    <table class="ledger ing-view" style="margin-top:1rem">
      <thead><tr><th>Description</th><th class="center">Type</th><th class="num">Prix unitaire</th><th>Unité</th></tr></thead>
      <tbody>${items.length
        ? items.map((it, i) => `<tr>
            <td>${esc(it.description || '—')}</td>
            <td class="center"><span class="pill pill-${it.type === 'Vente' ? 'actif' : 'apayer'}">${esc(it.type || '—')}</span></td>
            <td class="num">${it.prix != null && it.prix !== '' ? septims(it.prix) : '?'}</td>
            <td>${esc(it.unite || '')}</td>
          </tr>`).join('')
        : `<tr class="empty"><td colspan="4">Aucun item renseigné.</td></tr>`}
      </tbody>
    </table>
    ${c.notes ? `<p class="codex-source" style="margin-top:1.2rem">${esc(c.notes)}</p>` : ''}
    ${edit ? `<div class="codex-actions">
      <button class="btn btn-ghost" onclick="editContrat('${c.id}')">Modifier</button>
      <button class="btn btn-ghost danger" onclick="delContrat('${c.id}')">Supprimer</button>
    </div>` : ''}
  </article>`
  : `<div class="codex-empty"><p>${edit ? 'Ajoute ton premier contrat.' : 'Aucun contrat sélectionné.'}</p></div>`;

  return `${sectionHead('Contrats', 'Accords commerciaux conclus avec les partenaires de la baronnie. Informatif uniquement.')}
  <div class="summary-strip">
    <div><span>Contrats actifs</span><strong>${actifs.length}</strong></div>
    <div><span>Suspendus / Terminés</span><strong>${autres.length}</strong></div>
    <div><span>Total items</span><strong>${DB.contrats.reduce((s,c) => s + (c.items?.length||0), 0)}</strong></div>
  </div>
  <div class="codex">
    <aside class="codex-index">
      <input type="search" id="con-q" class="search" placeholder="Chercher un partenaire…" oninput="filterContrats()" aria-label="Chercher">
      ${edit ? `<button class="btn btn-primary block" onclick="editContrat()">Ajouter un contrat</button>` : ''}
      <nav>${index}</nav>
    </aside>
    ${detail}
  </div>
  ${sectionHistory(['gp_contrats'])}`;
};

function filterContrats() {
  const q = norm(document.getElementById('con-q')?.value || '');
  document.querySelectorAll('.codex-group li[data-s]').forEach(li => { li.hidden = !!q && !li.dataset.s.includes(q); });
}

function openContrat(id) { contratSelected = id; renderActive(); }

// ── Éditeur ──────────────────────────────────────────────────────────
function editContrat(id) {
  if (!canEdit('contrats')) return;
  const row = id ? DB.contrats.find(c => c.id === id) : null;
  _contratItems = row ? JSON.parse(JSON.stringify(row.items || [])) : [];

  openModal({
    title: (row ? 'Modifier — ' : 'Ajouter — ') + 'contrat',
    wide: true,
    body: `<div class="form-grid">
      <div class="field"><label for="ct-part">Partenaire <span class="req">*</span></label>
        <input id="ct-part" value="${esc(row?.partenaire || '')}" placeholder="ex : Ferme de Blancherive"></div>
      <div class="field"><label for="ct-date">Date de signature</label>
        <input id="ct-date" type="date" value="${row?.date_debut || ''}"></div>
      <div class="field"><label for="ct-statut">Statut</label>
        <select id="ct-statut">${CONTRAT_STATUTS.map(s => `<option${s===(row?.statut||'Actif')?' selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field full"><label for="ct-notes">Notes</label>
        <textarea id="ct-notes" rows="2">${esc(row?.notes || '')}</textarea></div>
    </div>
    <h4 style="margin:.9rem 0 .5rem;font-family:var(--font-sc)">Items du contrat</h4>
    <div id="ct-items"></div>
    <button class="btn btn-ghost" style="margin-top:.5rem" onclick="addContratItem()">+ Ajouter un item</button>`,
    okLabel: row ? 'Enregistrer' : 'Ajouter',
    onOk: async () => {
      const partenaire = document.getElementById('ct-part').value.trim();
      if (!partenaire) return modalError('Le nom du partenaire est obligatoire.');
      syncContratItems();
      const data = {
        partenaire,
        date_debut: document.getElementById('ct-date').value || null,
        statut: document.getElementById('ct-statut').value,
        notes: document.getElementById('ct-notes').value.trim() || null,
        items: _contratItems.filter(i => i.description.trim()),
      };
      if (row) await apiUpdate('gp_contrats', row.id, data);
      else await apiInsert('gp_contrats', data);
      toast(row ? 'Contrat modifié.' : 'Contrat ajouté.');
      await reload();
    },
  });
  setTimeout(refreshContratItems, 10);
}

function syncContratItems() {
  document.querySelectorAll('#ct-items .ing-row').forEach((el, i) => {
    if (!_contratItems[i]) return;
    _contratItems[i].description = el.querySelector('.ct-desc').value.trim();
    _contratItems[i].type        = el.querySelector('.ct-type').value;
    _contratItems[i].prix        = el.querySelector('.ct-prix').value !== '' ? num(el.querySelector('.ct-prix').value) : '';
    _contratItems[i].unite       = el.querySelector('.ct-unite').value;
  });
}

function addContratItem() {
  syncContratItems();
  _contratItems.push({ description: '', type: 'Achat', prix: '', unite: 'unité' });
  refreshContratItems();
}

function removeContratItem(i) {
  syncContratItems();
  _contratItems.splice(i, 1);
  refreshContratItems();
}

function refreshContratItems() {
  const box = document.getElementById('ct-items');
  if (!box) return;
  box.innerHTML = _contratItems.map((it, i) => `
    <div class="ing-row">
      <input class="ct-desc" style="flex:2" placeholder="Description" value="${esc(it.description || '')}">
      <select class="ct-type" style="width:90px">${CONTRAT_TYPES.map(t => `<option${t===it.type?' selected':''}>${t}</option>`).join('')}</select>
      <input class="ct-prix" type="number" min="0" step="1" placeholder="Prix" value="${it.prix !== '' ? num(it.prix) : ''}" style="width:90px" inputmode="numeric">
      <select class="ct-unite" style="width:90px">${CONTRAT_UNITES.map(u => `<option${u===(it.unite||'unité')?' selected':''}>${u}</option>`).join('')}</select>
      <button class="icon-btn danger" aria-label="Retirer" onclick="removeContratItem(${i})">✕</button>
    </div>`).join('');
}

function delContrat(id) {
  const c = DB.contrats.find(x => x.id === id);
  removeRow({ table: 'gp_contrats', section: 'contrats', id, label: c?.partenaire,
    after: async () => { contratSelected = null; await reload(); } });
}
