// ══════════════════════════════════════════════════════════════════════
//  DÉMARRAGE — chargé en dernier
// ══════════════════════════════════════════════════════════════════════
(async function init() {
  // Arrêt propre si le fichier généré par GitHub Actions ou la bibliothèque
  // Supabase n'a pas été chargé. Évite les erreurs en cascade dans l'interface.
  if (!window.GardepommeConfig?.supabaseUrl || !window.GardepommeConfig?.supabaseKey) {
    const page = document.getElementById('page');
    if (page) page.innerHTML = `
      <section class="panel" role="alert" style="margin:2rem;padding:1.5rem">
        <h2>Configuration Supabase introuvable</h2>
        <p>Le fichier <code>scripts/config.js</code> est absent ou incomplet.</p>
        <p>Vérifie les secrets <code>SUPABASEURL</code> et <code>SUPABASEKEY</code>
        dans GitHub → Settings → Secrets and variables → Actions, puis relance
        le workflow de déploiement GitHub Pages.</p>
      </section>`;
    console.error('[Gardepomme] Configuration Supabase absente. Vérifie le workflow GitHub Pages et ses secrets.');
    return;
  }
  if (!window.supabase?.createClient) {
    const page = document.getElementById('page');
    if (page) page.innerHTML = '<section class="panel" role="alert" style="margin:2rem;padding:1.5rem"><h2>Bibliothèque Supabase indisponible</h2><p>Le script Supabase n’a pas pu être chargé. Vérifie ta connexion ou le CDN jsDelivr.</p></section>';
    console.error('[Gardepomme] La bibliothèque Supabase (CDN) est indisponible.');
    return;
  }

  document.addEventListener('keydown', e => {
    const modalOpen = !document.getElementById('modal').hidden;
    if (e.key === 'Escape' && modalOpen) closeModal();
    if (e.key === 'Enter' && modalOpen && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); modalOk(); }
  });
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h !== activeSection && SECTIONS[h]) go(h);
  });

  const hash = location.hash.replace('#', '');
  if (SECTIONS[hash]) activeSection = hash;

  await loadSession();
  await refreshAll();
})();
