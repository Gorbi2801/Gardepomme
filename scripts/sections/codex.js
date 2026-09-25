// ══════════════════════════════════════════════════════════════════════
//  CODEX — bibliothèque des lois
// ══════════════════════════════════════════════════════════════════════
const LOI_CATEGORIES = ['Lois de Bruma', 'Édits de la baronnie', 'Fiscalité', 'Commerce', 'Justice & peines', 'Garde & défense', 'Autre'];
const LOI_FIELDS = [
  { key: 'titre', label: 'Titre', required: true },
  { key: 'categorie', label: 'Recueil', type: 'select', options: LOI_CATEGORIES },
  { key: 'reference', label: 'Référence', hint: 'Ex : Art. 4, Édit n° 2' },
  { key: 'ordre', label: "Ordre d'affichage", type: 'number', default: 100, hint: 'Plus petit = plus haut dans le recueil.' },
  { key: 'source', label: 'Promulgation', hint: 'Par qui et quand (ex : Comte de Bruma, 4E 226)', full: true },
  { key: 'contenu', label: 'Texte', type: 'textarea', rows: 14, required: true,
    hint: 'Ligne vide = nouveau paragraphe. **texte** = gras. Une ligne commençant par « - » = puce.' },
];

let codexSelected = null;

function formatLoi(txt) {
  const blocks = esc(txt).split(/\n\s*\n/);
  return blocks.map(b => {
    const lines = b.split('\n');
    if (lines.every(l => /^\s*-\s+/.test(l))) return `<ul>${lines.map(l => `<li>${l.replace(/^\s*-\s+/, '')}</li>`).join('')}</ul>`;
    return `<p>${lines.join('<br>')}</p>`;
  }).join('').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

RENDERERS.codex = () => {
  const edit = canEdit('codex');
  if (!codexSelected || !DB.lois.find(l => l.id === codexSelected)) codexSelected = DB.lois[0]?.id || null;
  const cats = LOI_CATEGORIES.filter(c => DB.lois.some(l => l.categorie === c))
    .concat([...new Set(DB.lois.map(l => l.categorie))].filter(c => !LOI_CATEGORIES.includes(c)));

  const index = cats.map(c => `<div class="codex-group" data-cat>
      <h3>${esc(c)}</h3>
      <ol>${DB.lois.filter(l => l.categorie === c).map(l => `
        <li data-s="${esc(norm([l.titre, l.reference, l.contenu].join(' ')))}">
          <button class="codex-link${l.id === codexSelected ? ' active' : ''}" onclick="openLoi('${l.id}')">
            ${l.reference ? `<span class="ref">${esc(l.reference)}</span>` : ''}${esc(l.titre)}
          </button></li>`).join('')}</ol>
    </div>`).join('');

  const l = DB.lois.find(x => x.id === codexSelected);
  const reader = l ? `<article class="codex-page">
      <p class="codex-recueil">${esc(l.categorie)}${l.reference ? ' — ' + esc(l.reference) : ''}</p>
      <h3>${esc(l.titre)}</h3>
      <div class="codex-text">${formatLoi(l.contenu)}</div>
      ${l.source ? `<p class="codex-source">${esc(l.source)}</p>` : ''}
      ${edit ? `<div class="codex-actions"><button class="btn btn-ghost" onclick="editLoi('${l.id}')">Modifier ce texte</button><button class="btn btn-ghost danger" onclick="delLoi('${l.id}')">Supprimer</button></div>` : ''}
    </article>`
    : `<div class="codex-empty"><p>Le codex est vide.</p>${edit ? '<p>Ajoute les lois de Bruma et les édits de la baronnie pour les rendre consultables par tous.</p>' : ''}</div>`;

  return `${sectionHead('Codex', 'Les lois du Comté de Bruma et les édits de la baronnie, consultables par tous.')}
  <div class="codex">
    <aside class="codex-index">
      <input type="search" id="codex-q" class="search" placeholder="Chercher dans les textes…" oninput="filterCodex()" aria-label="Chercher dans les textes">
      ${edit ? `<button class="btn btn-primary block" onclick="editLoi()">Ajouter un texte</button>` : ''}
      <nav aria-label="Sommaire du codex">${index}</nav>
      <p id="codex-none" class="muted-text" hidden>Aucun texte ne correspond.</p>
    </aside>
    ${reader}
  </div>
  ${sectionHistory(['gp_lois'])}`;
};

function filterCodex() {
  const q = norm(document.getElementById('codex-q').value);
  let any = false;
  document.querySelectorAll('.codex-group').forEach(g => {
    let n = 0;
    g.querySelectorAll('li[data-s]').forEach(li => { const ok = !q || li.dataset.s.includes(q); li.hidden = !ok; if (ok) n++; });
    g.hidden = !n; if (n) any = true;
  });
  document.getElementById('codex-none').hidden = any || !DB.lois.length;
}
function openLoi(id) {
  codexSelected = id;
  const q = document.getElementById('codex-q')?.value || '';
  renderActive();
  if (q) { document.getElementById('codex-q').value = q; filterCodex(); }
  if (window.innerWidth < 900) document.querySelector('.codex-page')?.scrollIntoView({ behavior: 'smooth' });
}
function editLoi(id) {
  const row = id ? DB.lois.find(l => l.id === id) : null;
  openEditor({ table: 'gp_lois', section: 'codex', title: 'texte de loi', fields: LOI_FIELDS, row, after: reload });
}
function delLoi(id) {
  const l = DB.lois.find(x => x.id === id);
  removeRow({ table: 'gp_lois', section: 'codex', id, label: l?.titre, after: async () => { codexSelected = null; await reload(); } });
}
