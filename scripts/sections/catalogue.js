// ══════════════════════════════════════════════════════════════════════
//  CATALOGUE — prix de vente et d'achat/rachat des articles,
//              avec lien optionnel vers un contrat existant.
// ══════════════════════════════════════════════════════════════════════
const CAT_CATEGORIES = ['Nourriture', 'Boissons', 'Bois & Charbon', 'Bétail', 'Matières premières', 'Autre'];
const CAT_UNITES     = ['unité', 'pièce', 'kg', 'L', 'tonneau', 'caisse', 'botte', 'sac', 'lot'];

RENDERERS.catalogue = () => {
  const edit = canEdit('catalogue');
  const cats = [...new Set(DB.catalogue.map(c => c.categorie).filter(Boolean))].sort();

  const filters = `
    <select id="cat-fil" onchange="filterCatalogue()" aria-label="Catégorie">
      <option value="">Toutes catégories</option>
      ${CAT_CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}
    </select>`;

  const rows = DB.catalogue.map(a => {
    const contrat = DB.contrats.find(c => c.id === a.contrat_id);
    return `<tr data-s="${esc(norm([a.nom, a.categorie, a.notes].join(' ')))}" data-cat="${esc(a.categorie || '')}">
      <td><strong>${esc(a.nom)}</strong>${a.notes ? `<span class="note-inline">${esc(a.notes)}</span>` : ''}</td>
      <td>${esc(a.categorie || '—')}</td>
      <td>${esc(a.unite || 'unité')}</td>
      <td class="num in">${num(a.prix_vente) > 0 ? septims(a.prix_vente) : '<span class="muted-text">—</span>'}</td>
      <td class="num out">${num(a.prix_achat) > 0 ? septims(a.prix_achat) : '<span class="muted-text">—</span>'}</td>
      <td>${contrat
        ? `<button class="link" onclick="go('contrats');openContrat('${contrat.id}')">${esc(contrat.partenaire)}</button>`
        : '<span class="muted-text">—</span>'}</td>
      ${rowActions('catalogue', `editArticle('${a.id}')`, `delArticle('${a.id}')`)}
    </tr>`;
  }).join('');

  const totalVente = DB.catalogue.filter(a => num(a.prix_vente) > 0).length;
  const totalAchat = DB.catalogue.filter(a => num(a.prix_achat) > 0).length;

  return `${sectionHead('Catalogue', 'Prix de vente et d\'achat/rachat des articles de la baronnie. Un article peut être lié à un contrat existant.')}
  <div class="summary-strip">
    <div><span>Articles référencés</span><strong>${DB.catalogue.length}</strong></div>
    <div><span>Avec prix de vente</span><strong>${totalVente}</strong></div>
    <div><span>Avec prix d'achat</span><strong>${totalAchat}</strong></div>
    <div><span>Liés à un contrat</span><strong>${DB.catalogue.filter(a => a.contrat_id).length}</strong></div>
  </div>
  <div class="sheet">
    ${toolbar({ section: 'catalogue', searchId: 'cat-q', onSearch: 'filterCatalogue()',
      filters, addLabel: 'Ajouter un article', onAdd: 'editArticle()',
      extra: `<button class="btn btn-ghost" onclick="exportCsv('cat-table','catalogue_gardepomme.csv')">Exporter</button>` })}
    <div class="table-wrap"><table id="cat-table" class="ledger">
      <thead><tr>
        ${th('Article')}${th('Catégorie')}${th('Unité')}
        ${th('Prix de vente','num')}${th('Prix d\'achat/rachat','num')}
        <th>Contrat lié</th>
        ${edit ? '<th class="actions"><span class="sr-only">Actions</span></th>' : ''}
      </tr></thead>
      <tbody id="cat-tbody">${rows || emptyRow(7, edit ? 'Aucun article. Ajoutes-en un.' : 'Aucun article référencé.')}</tbody>
    </table></div>
  </div>
  ${sectionHistory(['gp_catalogue'])}`;
};

function filterCatalogue() {
  filterTable('cat-tbody', 'cat-q', { cat: document.getElementById('cat-fil').value });
}

function editArticle(id) {
  const row = id ? DB.catalogue.find(a => a.id === id) : null;
  const contratsOptions = [{ id: '', partenaire: '— Aucun contrat —' }, ...DB.contrats.filter(c => c.statut === 'Actif')];

  const fields = [
    { key: 'nom', label: 'Nom de l\'article', required: true },
    { key: 'categorie', label: 'Catégorie', type: 'datalist', options: CAT_CATEGORIES },
    { key: 'unite', label: 'Unité', type: 'datalist', options: CAT_UNITES, default: 'unité' },
    { key: 'prix_vente', label: 'Prix de vente (septims)', type: 'number', hint: 'Ce que la baronnie vend cet article.' },
    { key: 'prix_achat', label: 'Prix d\'achat / rachat (septims)', type: 'number', hint: 'Ce que la baronnie paie ou rembourse pour cet article.' },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2, full: true },
  ];

  const contratSelect = `<div class="field full" style="margin-top:.4rem">
    <label for="f-contrat">Contrat lié <small>(optionnel)</small></label>
    <select id="f-contrat">
      ${contratsOptions.map(c => `<option value="${esc(c.id)}"${c.id === (row?.contrat_id || '') ? ' selected' : ''}>${esc(c.partenaire)}</option>`).join('')}
    </select>
    <small>Lie cet article à un contrat actif pour faire le lien entre les deux sections.</small>
  </div>`;

  openModal({
    title: (row ? 'Modifier — ' : 'Ajouter — ') + 'article',
    wide: true,
    body: renderFields(fields, row || {}) + `<div class="form-grid">${contratSelect}</div>`,
    okLabel: row ? 'Enregistrer' : 'Ajouter',
    onOk: async () => {
      const data = readFields(fields);
      data.contrat_id = document.getElementById('f-contrat').value || null;
      if (row) await apiUpdate('gp_catalogue', row.id, data);
      else await apiInsert('gp_catalogue', data);
      toast(row ? 'Article modifié.' : 'Article ajouté.');
      await reload();
    },
  });
}

function delArticle(id) {
  const a = DB.catalogue.find(x => x.id === id);
  removeRow({ table: 'gp_catalogue', section: 'catalogue', id, label: a?.nom, after: reload });
}
