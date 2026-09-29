// ══════════════════════════════════════════════════════════════════════
//  TABLEAU DE BORD
// ══════════════════════════════════════════════════════════════════════
RENDERERS.accueil = () => {
  const solde = soldeTresor();

  // 7 derniers jours
  const d7 = new Date(); d7.setDate(d7.getDate() - 7);
  const from7 = d7.toISOString().slice(0, 10);
  const recent = DB.operations.filter(o => o.date_op >= from7);
  const rec7 = recent.filter(o => o.sens === 'Recette').reduce((s, o) => s + num(o.montant), 0);
  const dep7 = recent.filter(o => o.sens === 'Dépense').reduce((s, o) => s + num(o.montant), 0);

  // Impôts de la semaine (auto-calculés)
  const { benefice } = baronnieBeneficeHebdo();
  const taille        = calculerTaille(benefice);
  const agrActifs     = (DB.agrements || []).filter(a => a.actif);
  const totalAgrement = agrActifs.reduce((s, a) => s + patenteAmount(a.secteur), 0);
  const taxesCommerces = DB.commerces.reduce((s, c) => s + taxeDue(c), 0);
  const totalImpots   = taille + totalAgrement + taxesCommerces;

  const paie     = masseRestante();
  const projete  = solde - totalImpots - paie;
  const enPoste  = DB.membres.filter(m => m.statut !== 'Congédié' && estEmploye(m)).length;
  const ouverts  = DB.commerces.filter(c => c.statut === 'Ouvert').length;

  const alerts = [];
  if (solde < 0) alerts.push(`<li class="bad"><button onclick="go('finances')">Le trésor est en négatif</button></li>`);
  if (projete < 0 && solde >= 0) alerts.push(`<li class="warn"><button onclick="go('finances')">Le trésor ne couvre pas la paie et les impôts de la semaine</button></li>`);
  const agrementsNonPaies = agrActifs.filter(a => !a.paye).length;
  if (agrementsNonPaies) alerts.push(`<li><button onclick="go('impots')">${agrementsNonPaies} Agrément${agrementsNonPaies > 1 ? 's' : ''} actif${agrementsNonPaies > 1 ? 's' : ''} non payé${agrementsNonPaies > 1 ? 's' : ''} cette semaine</button></li>`);

  const last = DB.operations.slice(0, 6).map(o => `<tr>
    <td>${fmtDate(o.date_op)}</td><td>${esc(o.libelle)}</td>
    <td class="num ${o.sens === 'Recette' ? 'in' : 'out'}">${septimsSigned(signed(o))}</td></tr>`).join('');

  return `<section class="hero">
    <img src="assets/blason.png" alt="" class="hero-seal" width="96" height="96" style="object-fit:contain">
    <div class="hero-text">
      <h2>Baronnie de Gardepomme</h2>
      <p>Vassale du Comté de Bruma. Registres tenus au nom du Baron.</p>
    </div>
    <div class="hero-balance ${solde < 0 ? 'neg' : ''}">
      <span>Trésor de la baronnie</span>
      <strong>${septims(solde)}</strong>
      <em>${septimsSigned(rec7 - dep7)} sur les 7 derniers jours</em>
    </div>
  </section>

  ${alerts.length ? `<ul class="alerts">${alerts.join('')}</ul>` : ''}

  <div class="dash">
    <section class="sheet dash-block">
      <h3 class="sheet-title">Engagements de la semaine</h3>
      <table class="ledger compact">
        <tbody>
          <tr><td>Trésor actuel</td><td class="num">${septims(solde)}</td></tr>
          <tr><td><button class="link" onclick="go('effectifs')">Paie des effectifs (reste)</button></td><td class="num out">− ${septims(paie)}</td></tr>
          <tr><td><button class="link" onclick="go('impots')">Impôts de la semaine</button></td><td class="num out">− ${septims(totalImpots)}</td></tr>
        </tbody>
        <tfoot><tr class="total"><td>Trésor prévisionnel</td><td class="num ${projete < 0 ? 'out' : ''}">${septims(projete)}</td></tr></tfoot>
      </table>
    </section>

    <section class="sheet dash-block">
      <h3 class="sheet-title">La baronnie en chiffres</h3>
      <dl class="figures">
        <div><dt><button class="link" onclick="go('effectifs')">Employés en poste</button></dt><dd>${enPoste}</dd></div>
        <div><dt><button class="link" onclick="go('commerces')">Commerces ouverts</button></dt><dd>${ouverts}</dd></div>
        <div><dt><button class="link" onclick="go('codex')">Textes au codex</button></dt><dd>${DB.lois.length}</dd></div>
        <div><dt>Recettes, 7 jours</dt><dd class="in">${septims(rec7)}</dd></div>
        <div><dt>Dépenses, 7 jours</dt><dd class="out">${septims(dep7)}</dd></div>
      </dl>
    </section>

    <section class="sheet dash-block wide">
      <h3 class="sheet-title">Dernières opérations</h3>
      ${last ? `<table class="ledger compact"><tbody>${last}</tbody></table><p><button class="link" onclick="go('finances')">Voir tout le registre</button></p>` : '<p class="muted-text">Aucune opération inscrite pour le moment.</p>'}
    </section>
  </div>`;
};
