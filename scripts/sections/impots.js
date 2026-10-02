// ══════════════════════════════════════════════════════════════════════
//  IMPÔTS — tableau de bord automatique
//  Taille : calculée depuis les opérations Vente/Achat du trésor (semaine).
//  Agrément : liste d'activités activables/désactivables, payables une par une.
// ══════════════════════════════════════════════════════════════════════

const AGREMENT_TARIFS = {
  'Terre (pâtres & paysans)': 0,
  'Récolte': 200,
  'Divertissement': 220,
  'Artisanat': 220,
};
const SECTEURS_LISTE = Object.keys(AGREMENT_TARIFS);

function patenteAmount(secteur) { return AGREMENT_TARIFS[secteur] ?? 220; }

function calculerTaille(benefice) {
  if (benefice <= 0) return 0;
  const tranches = [[500,0],[1000,.10],[1000,.15],[1500,.25],[Infinity,.35]];
  let reste = benefice, impot = 0;
  for (const [p, t] of tranches) {
    if (reste <= 0) break;
    const part = Math.min(reste, p);
    impot += Math.round(part * t);
    reste -= part;
  }
  return impot;
}

function taxeDue(c) {
  if (c.exonere || c.statut !== 'Ouvert') return 0;
  return patenteAmount(c.secteur) + calculerTaille(num(c.benefice));
}
function taxeDetail(c) {
  const p = patenteAmount(c.secteur), t = calculerTaille(num(c.benefice));
  return { patente: p, taille: t, total: p + t };
}
function derniereTaxe(c) {
  return DB.operations.find(o => o.commerce_id === c.id && o.categorie === 'Taxes');
}

function baronnieBeneficeHebdo() {
  const { monday, sunday } = weekRange();
  const from = monday.toISOString().slice(0,10), to = sunday.toISOString().slice(0,10);
  const ops  = DB.operations.filter(o => o.date_op >= from && o.date_op <= to);
  const rec  = ops.filter(o => o.sens === 'Recette' && o.categorie === 'Vente').reduce((s,o) => s+num(o.montant), 0);
  const dep  = ops.filter(o => o.sens === 'Dépense'  && o.categorie === 'Achat').reduce((s,o) => s+num(o.montant), 0);
  return { ventes: rec, achats: dep, benefice: Math.max(0, rec - dep) };
}

function censMontant() { return num(DB.params.cens_montant ?? 45); }
function censSujets()  { return num(DB.params.cens_sujets  ?? 0); }
function loyerTotal()  { return num(DB.params.loyer_total  ?? 0); }

RENDERERS.impots = () => {
  const edit = canEdit('impots');
  const { ventes, achats, benefice } = baronnieBeneficeHebdo();
  const baronTaille = calculerTaille(benefice);

  // Agréments actifs
  const agrActifs = (DB.agrements || []).filter(a => a.actif);
  const totalAgrement = agrActifs.reduce((s,a) => s + patenteAmount(a.secteur), 0);
  const baronTotal    = baronTaille + totalAgrement;

  // Commerces tiers
  const taxables      = DB.commerces.filter(c => taxeDue(c) > 0);
  const totalCommerces = taxables.reduce((s,c) => s + taxeDue(c), 0);

  // Fixes
  const totalCens  = censMontant() * censSujets();
  const totalFixed = totalCens + loyerTotal();
  const grandTotal = baronTotal + totalCommerces + totalFixed;

  // Lignes agrément
  const agrRows = (DB.agrements || []).map(a => {
    const montant = patenteAmount(a.secteur);
    return `<tr class="${!a.actif ? 'muted' : ''}">
      <td><strong>${esc(a.nom)}</strong><span class="note-inline">${esc(a.secteur)}</span></td>
      <td class="num">${septims(montant)}</td>
      <td class="center">
        <input type="checkbox" class="salaire-check" ${a.actif ? 'checked' : ''}
          ${edit ? `onchange="toggleAgrement('${a.id}', this.checked)"` : 'disabled'}
          aria-label="Activer">
      </td>
      <td class="center">
        ${a.actif ? (a.paye
          ? '<span class="pill pill-paye">Payé</span>'
          : (edit ? `<button class="btn btn-small btn-primary" onclick="payerAgrement('${a.id}')">Payer</button>` : '<span class="pill pill-apayer">À payer</span>'))
          : '<span class="muted-text">—</span>'}
      </td>
      ${edit ? `<td class="actions">
        <button class="icon-btn" aria-label="Modifier" onclick="editAgrement('${a.id}')">✎</button>
        <button class="icon-btn danger" aria-label="Supprimer" onclick="delAgrement('${a.id}')">✕</button>
      </td>` : ''}
    </tr>`;
  }).join('');

  // Tranches Taille
  const trancheRows = (() => {
    const def = [[500,0],[1000,.10],[1000,.15],[1500,.25],[Infinity,.35]];
    let reste = benefice;
    return def.map(([p,t],i) => {
      const part = Math.min(reste, p);
      const imp  = Math.round(part * t);
      reste -= part;
      const label = ['0 à 500','501 à 1 500','1 501 à 2 500','2 501 à 4 000','4 001+'][i];
      return `<tr class="${part<=0?'muted':''}">
        <td>T${i+1} — ${label} sept.</td>
        <td class="num">${part>0?septims(part):'—'}</td>
        <td class="num muted-text">${(t*100).toFixed(0)} %</td>
        <td class="num">${part>0?septims(imp):'—'}</td></tr>`;
    }).join('');
  })();

  return `${sectionHead('Impôts','Récapitulatif automatique. La Taille est calculée depuis les ventes et achats du trésor de la semaine.')}
  <div class="summary-strip">
    <div><span>Taille (baronnie)</span><strong>${septims(baronTaille)}</strong></div>
    <div><span>Agréments actifs (${agrActifs.length})</span><strong>${septims(totalAgrement)}</strong></div>
    ${totalCommerces ? `<div><span>Taxes commerces</span><strong>${septims(totalCommerces)}</strong></div>` : ''}
    <div><span>Cens & loyers</span><strong>${septims(totalFixed)}</strong></div>
    <div class="ruled"><span>Total dû cette semaine</span><strong>${septims(grandTotal)}</strong></div>
  </div>

  <!-- Agréments -->
  <div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.5rem">
      <h3 class="sheet-title" style="margin:0">Agréments (Art. IV)</h3>
      <div style="display:flex;gap:.5rem">
        ${edit ? `<button class="btn btn-ghost" onclick="resetPaiementsAgrements()">Nouvelle période</button>
        <button class="btn btn-primary" onclick="editAgrement()">+ Ajouter</button>` : ''}
      </div>
    </div>
    <p class="lead-in">Coche les activités exercées cette semaine. Décoche celles en pause. Paye chaque Agrément indépendamment.</p>
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Activité</th>${th('Montant','num')}<th class="center">Actif</th><th class="center">Paiement</th>
        ${edit?'<th class="actions"><span class="sr-only">Actions</span></th>':''}</tr></thead>
      <tbody>${agrRows || emptyRow(edit?5:4, edit?'Aucun Agrément. Ajoute tes activités.':'Aucun Agrément configuré.')}</tbody>
      <tfoot><tr class="total"><td colspan="1">Total Agréments actifs</td><td class="num">${septims(totalAgrement)}</td><td colspan="${edit?3:2}"></td></tr></tfoot>
    </table></div>
  </div>

  <!-- Taille -->
  <div class="sheet">
    <h3 class="sheet-title">Taille — impôt progressif (Art. V)</h3>
    <p class="lead-in">Bénéfice de la semaine : Ventes ${septims(ventes)} − Achats ${septims(achats)} = <strong>${septims(benefice)}</strong></p>
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Tranche</th>${th('Part imposée','num')}${th('Taux','num')}${th('Impôt','num')}</tr></thead>
      <tbody>${trancheRows}</tbody>
      <tfoot><tr class="total"><td colspan="3">Total Taille</td><td class="num">${septims(baronTaille)}</td></tr></tfoot>
    </table></div>
  </div>

  <!-- Commerces tiers -->
  ${taxables.length ? `<div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.5rem">
      <h3 class="sheet-title" style="margin:0">Commerces enregistrés</h3>
      ${edit?`<button class="btn btn-primary" onclick="percevoirTout()">Tout percevoir (${septims(totalCommerces)})</button>`:''}
    </div>
    <div class="table-wrap"><table class="ledger">
      <thead><tr><th>Commerce</th>${th('Bénéfice','num')}${th('Agrément','num')}${th('Taille','num')}${th('Total','num')}<th>Dernière perception</th>${edit?'<th class="actions"><span class="sr-only">Actions</span></th>':''}</tr></thead>
      <tbody>${taxables.map(c=>{const d=taxeDetail(c);const last=derniereTaxe(c);return`<tr>
        <td><strong>${esc(c.nom)}</strong></td><td class="num">${septims(c.benefice)}</td>
        <td class="num muted-text">${septims(d.patente)}</td><td class="num muted-text">${septims(d.taille)}</td>
        <td class="num"><strong>${septims(d.total)}</strong></td>
        <td class="muted-text">${last?fmtDate(last.date_op):'Jamais'}</td>
        ${edit?`<td class="actions"><button class="btn btn-small btn-primary" onclick="percevoirTaxe('${c.id}')">Percevoir</button></td>`:''}
      </tr>`;}).join('')}</tbody>
      <tfoot><tr class="total"><td colspan="4">Total</td><td class="num">${septims(totalCommerces)}</td><td></td>${edit?'<td></td>':''}</tr></tfoot>
    </table></div>
  </div>` : ''}

  <!-- Total général -->
  <div class="sheet" style="border-top:3px double var(--encre)">
    <table class="ledger">
      <tbody>
        <tr class="subtotal"><td>Taille (baronnie)</td><td class="num">${septims(baronTaille)}</td></tr>
        <tr class="subtotal"><td>Agréments actifs (${agrActifs.length})</td><td class="num">${septims(totalAgrement)}</td></tr>
        ${totalCommerces ? `<tr class="subtotal"><td>Taxes commerces</td><td class="num">${septims(totalCommerces)}</td></tr>` : ''}
        <tr class="subtotal"><td>Cens de Sujétion</td><td class="num">${septims(totalCens)}</td></tr>
        <tr class="subtotal"><td>Loyers</td><td class="num">${septims(loyerTotal())}</td></tr>
      </tbody>
      <tfoot>
        <tr class="total"><td><strong>Total des impôts de la semaine</strong></td><td class="num"><strong>${septims(grandTotal)}</strong></td></tr>
      </tfoot>
    </table>
  </div>

  <!-- Fixes -->
  <div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.5rem">
      <h3 class="sheet-title" style="margin:0">Impôts fixes (Art. II & III)</h3>
      ${edit?`<button class="btn btn-ghost" onclick="editParamsFiscaux()">Modifier</button>`:''}
    </div>
    <table class="ledger">
      <thead><tr><th>Impôt</th><th>Détail</th><th class="num">Montant hebdo</th></tr></thead>
      <tbody>
        <tr><td><strong>Cens de Sujétion</strong></td><td>${censSujets()} sujet(s) × ${septims(censMontant())}</td><td class="num">${septims(totalCens)}</td></tr>
        <tr><td><strong>Loyers</strong></td><td>Total des parcelles</td><td class="num">${septims(loyerTotal())}</td></tr>
      </tbody>
      <tfoot><tr class="total"><td colspan="2">Total fixe</td><td class="num">${septims(totalFixed)}</td></tr></tfoot>
    </table>
  </div>`;
};

// ── Agréments ────────────────────────────────────────────────────────
function editAgrement(id) {
  const row = id ? DB.agrements.find(a => a.id === id) : null;
  const fields = [
    { key: 'nom', label: 'Nom de l\'activité', required: true, hint: 'Ex : Cidrerie, Forge, Verger…' },
    { key: 'secteur', label: 'Secteur fiscal', type: 'select', options: SECTEURS_LISTE },
  ];
  openEditor({ table: 'gp_agrements', section: 'impots', title: 'Agrément', fields, row, after: reload });
}

async function toggleAgrement(id, actif) {
  try {
    await apiUpdate('gp_agrements', id, { actif });
    const a = DB.agrements.find(x => x.id === id);
    if (a) a.actif = actif;
    renderActive();
  } catch(e) { toast(errMsg(e), 'err'); }
}

async function payerAgrement(id) {
  const a = DB.agrements.find(x => x.id === id);
  if (!a) return;
  const montant = patenteAmount(a.secteur);
  if (!await confirmBox(`Payer l'Agrément "${a.nom}" — ${septims(montant)} ?`, 'Payer')) return;
  try {
    await apiInsert('gp_operations', {
      date_op: today(), sens: 'Dépense', categorie: 'Impôts', auteur: currentAuthor(),
      libelle: `Agrément — ${a.nom}`, montant,
    });
    await apiUpdate('gp_agrements', id, { paye: true });
    toast(`Agrément "${a.nom}" payé — ${septims(montant)} sortis du trésor.`);
    await reload();
  } catch(e) { toast(errMsg(e), 'err'); }
}

async function resetPaiementsAgrements() {
  if (!await confirmBox('Nouvelle période — remettre tous les Agréments à "non payé" ?', 'Confirmer')) return;
  for (const a of DB.agrements.filter(x => x.paye)) {
    await apiUpdate('gp_agrements', a.id, { paye: false });
  }
  toast('Agréments réinitialisés.'); await reload();
}

function delAgrement(id) {
  const a = DB.agrements.find(x => x.id === id);
  removeRow({ table: 'gp_agrements', section: 'impots', id, label: a?.nom, after: reload });
}

// ── Paramètres fixes ─────────────────────────────────────────────────
function editParamsFiscaux() {
  const fields = [
    { key: 'cens_montant', label: 'Cens de Sujétion (par sujet)', type: 'number', hint: 'Art. II — 45 sept. par semaine.' },
    { key: 'cens_sujets', label: 'Nombre de sujets assujettis', type: 'number' },
    { key: 'loyer_total', label: 'Total des loyers hebdomadaires', type: 'number', hint: 'Art. III.' },
  ];
  openModal({
    title: 'Paramètres fiscaux fixes',
    body: renderFields(fields, DB.params),
    okLabel: 'Enregistrer',
    onOk: async () => {
      const v = readFields(fields);
      for (const [cle, valeur] of Object.entries(v))
        await sb.from('gp_parametres').upsert({ cle, valeur: String(valeur ?? 0) });
      toast('Paramètres enregistrés.'); await reload();
    },
  });
}

// ── Commerces tiers ──────────────────────────────────────────────────
async function percevoirTaxe(id, silent = false) {
  const c = DB.commerces.find(x => x.id === id);
  const due = taxeDue(c || {});
  if (!c || !due) return;
  const d = taxeDetail(c);
  if (!silent && !await confirmBox(`Percevoir ${septims(due)} sur « ${c.nom} » ?\nAgrément ${septims(d.patente)} + Taille ${septims(d.taille)}`, 'Percevoir')) return;
  try {
    await apiInsert('gp_operations', {
      date_op: today(), sens: 'Recette', categorie: 'Taxes', auteur: currentAuthor(),
      libelle: `Taxe commerciale — ${c.nom}`, montant: due, commerce_id: c.id,
    });
    if (!silent) { toast(`${septims(due)} perçus.`); await reload(); }
  } catch(e) { toast(errMsg(e), 'err'); throw e; }
}

async function percevoirTout() {
  const list = DB.commerces.filter(c => taxeDue(c) > 0);
  const total = list.reduce((s,c) => s + taxeDue(c), 0);
  if (!await confirmBox(`Percevoir la taxe sur ${list.length} commerce(s), soit ${septims(total)} ?`, 'Tout percevoir')) return;
  let ok = 0;
  for (const c of list) { try { await percevoirTaxe(c.id, true); ok++; } catch(e) { break; } }
  toast(`${ok} taxe(s) perçue(s).`); await reload();
}
