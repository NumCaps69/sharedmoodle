// ============================================================
// SharedMoodle : App Frontend (SPA simple)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');

  // Router simple basé sur le hash
  function navigate(page) {
    window.location.hash = page;
  }

  function getCurrentPage() {
    return window.location.hash.slice(1).split('/')[0] || 'home';
  }

  function getPageParam() {
    return window.location.hash.slice(1).split('/')[1] || '';
  }

  // Texte venant d'un utilisateur : jamais inséré tel quel dans la page
  function esc(valeur) {
    return String(valeur ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  // ---- Forfaits (lus depuis l'API : /api/plans) ----
  const PLAN_STYLE = {
    FREE: { classe: '', couleur: '', bouton: 'btn-outline' },
    GOLD: { classe: 'gold', couleur: 'var(--gold)', bouton: 'btn-gold' },
    PLATINUM: { classe: 'platinum', couleur: 'var(--platinum)', bouton: 'btn-platinum' },
  };
  let plansCache = null;

  async function loadPlans() {
    if (!plansCache) plansCache = (await api.getPlans()).plans;
    return plansCache;
  }

  function prixTexte(prix) {
    return `${String(prix.toFixed(2)).replace('.', ',').replace(',00', '')}€`;
  }

  function featuresHtml(p) {
    return `
      <li>${p.maxUtilisateurs} utilisateurs max</li>
      <li>${p.maxCours === -1 ? 'Cours illimités' : `${p.maxCours} cours actifs`}</li>
      <li>${p.stockageGo} Go de stockage</li>
      <li>Backup ${p.frequenceBackup}</li>
      <li>Support ${p.supportDelai}</li>
      <li class="${p.pluginsCustom ? '' : 'disabled'}">Plugins personnalisés</li>`;
  }

  // mode : 'home' (bouton inscription) ou 'subscription' (forfait actuel / passer à)
  function planCardsHtml(plans, mode, currentPlan) {
    const ordre = plans.map((p) => p.nom);
    return plans.map((p) => {
      const st = PLAN_STYLE[p.nom] || PLAN_STYLE.FREE;
      const color = st.couleur ? ` style="color:${st.couleur};"` : '';
      let action;
      if (mode === 'home') {
        action = `<a href="#register" class="btn ${st.bouton} btn-block">${p.nom === 'FREE' ? "S'inscrire" : 'Commencer en FREE puis upgrader'}</a>`;
      } else if (p.nom === currentPlan) {
        action = `<div class="badge badge-${p.nom.toLowerCase()}" style="margin-top:0.5rem;">Forfait actuel</div>`;
      } else if (ordre.indexOf(p.nom) > ordre.indexOf(currentPlan)) {
        action = `<a href="#upgrade/${p.nom}" class="btn ${st.bouton} btn-block" style="margin-top:0.5rem;">Passer en ${p.nom}</a>`;
      } else {
        action = '';
      }
      return `
        <div class="plan-card ${st.classe} ${p.nom === currentPlan ? 'current' : ''}">
          <div class="plan-name"${color}>${p.nom}</div>
          <div class="plan-price"${color}>${prixTexte(p.prix)} <small>/mois</small></div>
          <ul class="plan-features">${featuresHtml(p)}</ul>
          ${action}
        </div>`;
    }).join('');
  }

  // ---- Rendu des pages ----
  function render() {
    const page = getCurrentPage();

    if (!api.isLoggedIn() && !['home', 'login', 'register', 'catalogue'].includes(page)) {
      navigate('login');
      return;
    }

    switch (page) {
      case 'home': renderHome(); break;
      case 'login': renderLogin(); break;
      case 'register': renderRegister(); break;
      case 'dashboard': renderDashboard(); break;
      case 'subscription': renderSubscription(); break;
      case 'upgrade': renderUpgrade(); break;
      case 'catalogue': renderCatalogue(); break;
      case 'admin': renderAdmin(); break;
      default: renderHome();
    }
  }

  // ---- Navbar ----
  function renderNavbar(activePage) {
    const client = api.getClient();
    const isLogged = api.isLoggedIn();

    return `
      <nav class="navbar">
        <a href="#home" class="navbar-brand">
          Shared<span>Moodle</span>
        </a>
        <ul class="navbar-nav">
          ${isLogged ? `
            <li><a href="#dashboard" class="${activePage === 'dashboard' ? 'active' : ''}">Dashboard</a></li>
            <li><a href="#subscription" class="${activePage === 'subscription' ? 'active' : ''}">Abonnement</a></li>
            <li><a href="#catalogue" class="${activePage === 'catalogue' ? 'active' : ''}">Cours partagés</a></li>
            ${client?.estAdmin ? `<li><a href="#admin" class="${activePage === 'admin' ? 'active' : ''}">Admin</a></li>` : ''}
            <li><button onclick="handleLogout()">Déconnexion</button></li>
          ` : `
            <li><a href="#catalogue" class="${activePage === 'catalogue' ? 'active' : ''}">Cours partagés</a></li>
            <li><a href="#login" class="${activePage === 'login' ? 'active' : ''}">Connexion</a></li>
            <li><a href="#register" class="btn btn-primary" style="color:#fff;padding:0.45rem 1rem;">S'inscrire</a></li>
          `}
        </ul>
      </nav>`;
  }

  // ---- Page d'accueil ----
  function renderHome() {
    app.innerHTML = `
      ${renderNavbar('home')}
      <div class="container">
        <div style="text-align:center; padding: 3rem 0;">
          <h1 style="font-size:2.5rem; margin-bottom:0.5rem;">Votre Moodle, hébergé et managé</h1>
          <p style="color:var(--fg-muted); font-size:1.1rem; max-width:550px; margin:0 auto 2rem;">
            Testez un portail simple pour gérer votre compte, votre abonnement et accéder à Moodle.
          </p>
          <a href="#register" class="btn btn-primary" style="font-size:1rem; padding:0.85rem 2rem;">
            Commencer gratuitement
          </a>
        </div>

        <div class="plans-grid" id="home-plans" style="margin-top:2rem;"></div>
      </div>`;

    loadPlans()
      .then((plans) => { document.getElementById('home-plans').innerHTML = planCardsHtml(plans, 'home'); })
      .catch(() => { document.getElementById('home-plans').innerHTML = '<p>Forfaits indisponibles.</p>'; });
  }

  // ---- Page de connexion ----
  function renderLogin() {
    app.innerHTML = `
      ${renderNavbar('login')}
      <div class="auth-container">
        <div class="auth-card">
          <h1>Connexion</h1>
          <p class="subtitle">Accédez à votre espace SharedMoodle</p>
          <div id="login-alert"></div>
          <form id="login-form">
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" class="form-control" placeholder="votre@email.com" required>
            </div>
            <div class="form-group">
              <label for="password">Mot de passe</label>
              <input type="password" id="password" class="form-control" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn btn-primary btn-block">Se connecter</button>
          </form>
          <p class="divider">Pas encore de compte ? <a href="#register">S'inscrire</a></p>
        </div>
      </div>`;

    document.getElementById('login-form').addEventListener('submit', handleLogin);
  }

  // ---- Page d'inscription ----
  function renderRegister() {
    app.innerHTML = `
      ${renderNavbar('register')}
      <div class="auth-container">
        <div class="auth-card">
          <h1>Inscription</h1>
          <p class="subtitle">Créez votre compte SharedMoodle</p>
          <div id="register-alert"></div>
          <form id="register-form">
            <div class="form-group">
              <label for="nom">Votre nom</label>
              <input type="text" id="nom" class="form-control" placeholder="Jean Dupont" required>
            </div>
            <div class="form-group">
              <label for="organisation">Nom de l'organisation</label>
              <input type="text" id="organisation" class="form-control" placeholder="Mon École" required>
              <small style="color:var(--fg-muted);font-size:0.8rem;">Ce nom identifiera votre organisation.</small>
            </div>
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" class="form-control" placeholder="votre@email.com" required>
            </div>
            <div class="form-group">
              <label for="password">Mot de passe</label>
              <input type="password" id="password" class="form-control" placeholder="8 caractères minimum" required minlength="8">
            </div>
            <button type="submit" class="btn btn-primary btn-block">Créer mon compte</button>
          </form>
          <p class="divider">Déjà inscrit ? <a href="#login">Se connecter</a></p>
        </div>
      </div>`;

    document.getElementById('register-form').addEventListener('submit', handleRegister);

    // Preview du slug
    const orgInput = document.getElementById('organisation');
    const slugPreview = orgInput?.nextElementSibling;
    if (orgInput && slugPreview) {
      orgInput.addEventListener('input', () => {
        const slug = orgInput.value.toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        slugPreview.textContent = slug
          ? `Identifiant de l'organisation : ${slug}`
          : '';
      });
    }
  }

  // ---- Dashboard ----
  async function renderDashboard() {
    const client = api.getClient();
    app.innerHTML = `
      ${renderNavbar('dashboard')}
      <div class="container">
        <div class="page-header">
          <h1>Bonjour, ${esc(client?.nom || 'Client')}</h1>
          <p>${esc(client?.organisation)} · <span class="badge badge-${(client?.plan || 'free').toLowerCase()}">${client?.plan || 'FREE'}</span></p>
        </div>
        <div id="dashboard-content">
          <p style="color:var(--fg-muted);">Chargement...</p>
        </div>
      </div>`;

    try {
      const [subData, consoData, instanceData] = await Promise.all([
        api.getSubscription().catch(() => null),
        api.getConsumption().catch(() => null),
        api.getInstance().catch(() => null),
      ]);

      const conso = consoData?.consommation;
      const instance = instanceData?.instance;
      const alertes = consoData?.alertes || [];
      const miseANiveau = consoData?.miseANiveau;
      const blocages = consoData?.blocages || {};

      document.getElementById('dashboard-content').innerHTML = `
        ${instance ? `
          <div class="card">
            <div class="card-header">
              <h2>Mon instance Moodle</h2>
              <span>
                <span class="status-dot status-${instance.statut.toLowerCase()}"></span>
                ${instance.statut}
              </span>
            </div>
            <a href="${instance.url}" target="_blank" class="instance-url">${instance.url}</a>
            ${instance.statut === 'PROVISIONING' ? `
              <p style="color:var(--fg-muted);font-size:0.85rem;margin-top:0.75rem;">
                Votre Moodle est en cours de création (quelques minutes). Cette page se met à jour toute seule.
              </p>` : ''}
            ${instance.statut === 'RUNNING' ? `
              <p style="color:var(--fg-muted);font-size:0.85rem;margin-top:0.75rem;">
                Connexion administrateur : <strong>admin</strong> / le mot de passe de votre compte portail.
              </p>` : ''}
            ${instance.statut === 'ERROR' ? '<div class="alert alert-error" style="margin-top:0.75rem;">La création de votre Moodle a échoué. Contactez le support.</div>' : ''}
          </div>
        ` : ''}

        ${(blocages.utilisateur || blocages.cours) ? `
          <div class="alert alert-error">
            Forfait dépassé : ${blocages.utilisateur ? `${blocages.utilisateur} utilisateur(s) suspendu(s)` : ''}
            ${blocages.utilisateur && blocages.cours ? ' et ' : ''}${blocages.cours ? `${blocages.cours} cours masqué(s)` : ''}
            dans votre Moodle. Ils seront rétablis en passant au forfait supérieur.
          </div>` : ''}

        ${alertes.map((a) => `
          <div class="alert ${a.niveau === 'limite' ? 'alert-error' : 'alert-warning'}">${a.message}</div>
        `).join('')}

        ${miseANiveau ? `
          <div class="card" style="border-color:var(--${miseANiveau === 'PLATINUM' ? 'platinum' : 'gold'});">
            <h2 style="margin-bottom:0.5rem;">Vous approchez de vos limites</h2>
            <p style="margin-bottom:1rem;">Passez en ${miseANiveau} pour augmenter vos limites.</p>
            <a href="#upgrade/${miseANiveau}" class="btn btn-${miseANiveau.toLowerCase()}">Passer en ${miseANiveau}</a>
          </div>
        ` : ''}

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${conso?.utilisateurs?.actuel ?? '-'}</div>
            <div class="stat-label">Utilisateurs / ${conso?.utilisateurs?.max ?? '-'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${conso?.cours?.actuel ?? '-'}</div>
            <div class="stat-label">Cours / ${conso?.cours?.max ?? '-'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${conso?.stockage ? (conso.stockage.utiliseMo / 1024).toFixed(1) : '-'}</div>
            <div class="stat-label">Go utilisés / ${conso?.stockage?.maxGo ?? '-'} Go</div>
          </div>
        </div>

        ${conso ? `
          <div class="card">
            <h2 style="margin-bottom:0.25rem;">Consommation</h2>
            <p style="color:var(--fg-muted);font-size:0.8rem;margin-bottom:1rem;">
              ${conso.source === 'moodle' ? 'Mesurée dans Moodle' : 'Dernière mesure'} : ${new Date(conso.derniereMaj).toLocaleString('fr-FR')}
            </p>
            <div class="progress-group">
              <div class="progress-label"><span>Utilisateurs</span><span>${conso.utilisateurs.actuel} / ${conso.utilisateurs.max}</span></div>
              <div class="progress-bar"><div class="progress-fill ${conso.utilisateurs.pourcentage > 90 ? 'danger' : conso.utilisateurs.pourcentage > 70 ? 'warning' : ''}" style="width:${conso.utilisateurs.pourcentage}%"></div></div>
            </div>
            <div class="progress-group">
              <div class="progress-label"><span>Cours</span><span>${conso.cours.actuel} / ${conso.cours.max}</span></div>
              <div class="progress-bar"><div class="progress-fill" style="width:${typeof conso.cours.pourcentage === 'number' ? conso.cours.pourcentage : 0}%"></div></div>
            </div>
            <div class="progress-group">
              <div class="progress-label"><span>Stockage</span><span>${(conso.stockage.utiliseMo / 1024).toFixed(1)} Go / ${conso.stockage.maxGo} Go</span></div>
              <div class="progress-bar"><div class="progress-fill ${conso.stockage.pourcentage > 90 ? 'danger' : conso.stockage.pourcentage > 70 ? 'warning' : ''}" style="width:${conso.stockage.pourcentage}%"></div></div>
            </div>
            <p style="margin-top:1rem;">
              <a href="/api/subscription/report?format=csv" class="btn btn-outline">Télécharger le rapport d'usage (CSV)</a>
              <a href="/api/subscription/report" target="_blank" class="btn btn-outline">Voir le rapport complet</a>
            </p>
          </div>
        ` : ''}

        ${client?.plan === 'FREE' && !miseANiveau ? `
          <div class="card" style="border-color:var(--gold);background:var(--gold-soft);">
            <h2 style="color:var(--gold);margin-bottom:0.5rem;">Passez en GOLD</h2>
            <p style="margin-bottom:1rem;">Débloquez 500 utilisateurs, cours illimités, 20 Go et le support prioritaire.</p>
            <a href="#upgrade/GOLD" class="btn btn-gold">Upgrader maintenant</a>
          </div>
        ` : ''}
      `;
      // Moodle en création : recharger le tableau de bord dans 15 s
      if (instance?.statut === 'PROVISIONING' && getCurrentPage() === 'dashboard') {
        setTimeout(() => { if (getCurrentPage() === 'dashboard') renderDashboard(); }, 15000);
      }
    } catch (err) {
      document.getElementById('dashboard-content').innerHTML = `
        <div class="alert alert-error">Erreur de chargement : ${err.error || 'Serveur injoignable'}</div>`;
    }
  }

  // ---- Page abonnement ----
  async function renderSubscription() {
    const client = api.getClient();
    app.innerHTML = `
      ${renderNavbar('subscription')}
      <div class="container">
        <div class="page-header">
          <h1>Mon abonnement</h1>
        </div>
        <div class="plans-grid" id="sub-plans"><p style="color:var(--fg-muted);">Chargement...</p></div>
      </div>`;

    try {
      const plans = await loadPlans();
      document.getElementById('sub-plans').innerHTML = planCardsHtml(plans, 'subscription', client?.plan || 'FREE');
    } catch {
      document.getElementById('sub-plans').innerHTML = '<div class="alert alert-error">Forfaits indisponibles</div>';
    }
  }

  // ---- Page upgrade ----
  async function renderUpgrade() {
    const client = api.getClient();
    const plans = await loadPlans().catch(() => []);
    const ordre = plans.map((p) => p.nom);
    const cible = plans.find((p) => p.nom === (getPageParam() || 'GOLD'));
    if (!cible || ordre.indexOf(cible.nom) <= ordre.indexOf(client?.plan || 'FREE')) {
      navigate('subscription');
      return;
    }
    const st = PLAN_STYLE[cible.nom];

    app.innerHTML = `
      ${renderNavbar('upgrade')}
      <div class="auth-container">
        <div class="auth-card" style="max-width:460px;">
          <h1>Passer en ${cible.nom}</h1>
          <p class="subtitle">${prixTexte(cible.prix)}/mois : ${cible.maxUtilisateurs} utilisateurs, ${cible.stockageGo} Go, support ${cible.supportDelai}</p>
          <div id="upgrade-alert"></div>
          <div class="alert alert-info">
            MVP : utilisez la carte de test <strong>4242 4242 4242 4242</strong>
          </div>
          <form id="upgrade-form">
            <div class="form-group">
              <label for="card">Numéro de carte</label>
              <input type="text" id="card" class="form-control" placeholder="4242 4242 4242 4242" required
                     pattern="[0-9 ]+" maxlength="19">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
              <div class="form-group">
                <label for="expiry">Expiration</label>
                <input type="text" id="expiry" class="form-control" placeholder="12/28" required>
              </div>
              <div class="form-group">
                <label for="cvc">CVC</label>
                <input type="text" id="cvc" class="form-control" placeholder="123" required maxlength="4">
              </div>
            </div>
            <input type="hidden" id="target-plan" value="${cible.nom}">
            <button type="submit" class="btn ${st.bouton} btn-block" style="margin-top:0.5rem;">
              Confirmer le passage en ${cible.nom}
            </button>
          </form>
          <p class="divider"><a href="#subscription">Retour</a></p>
        </div>
      </div>`;

    // Formatage auto du numéro de carte
    const cardInput = document.getElementById('card');
    cardInput.addEventListener('input', () => {
      let v = cardInput.value.replace(/\D/g, '').substring(0, 16);
      cardInput.value = v.replace(/(.{4})/g, '$1 ').trim();
    });

    document.getElementById('upgrade-form').addEventListener('submit', handleUpgrade);
  }

  // ---- Catalogue de cours partagés (intelligence collective) ----
  function tailleTexte(octets) {
    return octets >= 1024 * 1024 ? `${(octets / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;
  }

  async function renderCatalogue() {
    const client = api.getClient();
    app.innerHTML = `
      ${renderNavbar('catalogue')}
      <div class="container">
        <div class="page-header">
          <h1>Cours partagés</h1>
          <p>Les établissements mettent leurs cours en commun, sous licence libre, et les réutilisent dans leur propre Moodle.</p>
        </div>
        <div class="card">
          <form id="catalogue-filtres" style="display:grid;grid-template-columns:2fr 1fr auto;gap:0.75rem;align-items:end;">
            <div class="form-group" style="margin:0;">
              <label for="cat-q">Rechercher</label>
              <input type="search" id="cat-q" class="form-control" placeholder="Titre ou description">
            </div>
            <div class="form-group" style="margin:0;">
              <label for="cat-discipline">Discipline</label>
              <select id="cat-discipline" class="form-control"><option value="">Toutes</option></select>
            </div>
            <button type="submit" class="btn btn-outline">Filtrer</button>
          </form>
        </div>
        <div id="catalogue-liste"><p style="color:var(--fg-muted);">Chargement...</p></div>
        ${client ? `
          <div class="card">
            <h2 style="margin-bottom:0.5rem;">Partager un cours</h2>
            <p style="color:var(--fg-muted);font-size:0.85rem;margin-bottom:1rem;">
              Dans votre Moodle : ouvrez le cours, menu <strong>Plus</strong> puis <strong>Sauvegarde</strong>,
              et téléchargez le fichier <code>.mbz</code>. Ne cochez pas les utilisateurs : seul le contenu du cours doit être partagé.
            </p>
            <div id="partage-alert"></div>
            <form id="partage-form">
              <div class="form-group">
                <label for="p-titre">Titre</label>
                <input type="text" id="p-titre" class="form-control" required minlength="3" maxlength="150">
              </div>
              <div class="form-group">
                <label for="p-description">Description</label>
                <textarea id="p-description" class="form-control" rows="3" maxlength="2000"></textarea>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;">
                <div class="form-group">
                  <label for="p-discipline">Discipline</label>
                  <input type="text" id="p-discipline" class="form-control" maxlength="60" placeholder="Mathématiques">
                </div>
                <div class="form-group">
                  <label for="p-niveau">Niveau</label>
                  <input type="text" id="p-niveau" class="form-control" maxlength="60" placeholder="Licence 1">
                </div>
                <div class="form-group">
                  <label for="p-licence">Licence</label>
                  <select id="p-licence" class="form-control"></select>
                </div>
              </div>
              <div class="form-group">
                <label for="p-fichier">Sauvegarde Moodle (.mbz)</label>
                <input type="file" id="p-fichier" class="form-control" accept=".mbz" required>
                <small id="p-taille" style="color:var(--fg-muted);font-size:0.8rem;"></small>
              </div>
              <button type="submit" class="btn btn-primary">Partager</button>
            </form>
          </div>` : `
          <div class="alert alert-info"><a href="#login">Connectez-vous</a> pour télécharger ou partager un cours.</div>`}
        <p style="color:var(--fg-muted);font-size:0.8rem;">
          Catalogue en données ouvertes (JSON-LD schema.org) : <a href="/api/catalogue/jsonld" target="_blank">/api/catalogue/jsonld</a>
        </p>
      </div>`;

    const charger = async () => {
      const liste = document.getElementById('catalogue-liste');
      try {
        const data = await api.getCatalogue({
          q: document.getElementById('cat-q').value,
          discipline: document.getElementById('cat-discipline').value,
        });
        const select = document.getElementById('cat-discipline');
        if (select.options.length === 1) {
          select.innerHTML += data.disciplines.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
        }
        const licence = document.getElementById('p-licence');
        if (licence && !licence.options.length) {
          licence.innerHTML = data.licences.map((l) => `<option>${esc(l)}</option>`).join('');
          document.getElementById('p-taille').textContent = `${data.tailleMaxMo} Mo maximum`;
        }
        liste.innerHTML = data.cours.length ? `
          <div class="card table-wrap">
            <table>
              <thead><tr><th>Cours</th><th>Établissement</th><th>Licence</th><th>Taille</th><th>Téléchargé</th><th></th></tr></thead>
              <tbody>${data.cours.map((c) => `
                <tr>
                  <td><strong>${esc(c.titre)}</strong>
                    <div style="color:var(--fg-muted);font-size:0.8rem;">${esc([c.discipline, c.niveau].filter(Boolean).join(' · '))}</div>
                    ${c.description ? `<div style="font-size:0.85rem;margin-top:0.25rem;">${esc(c.description)}</div>` : ''}</td>
                  <td>${esc(c.organisation)}</td>
                  <td>${esc(c.licence)}</td>
                  <td>${tailleTexte(c.taille_octets)}</td>
                  <td>${Number(c.telechargements)} fois</td>
                  <td style="white-space:nowrap;">
                    ${client ? `<a class="btn btn-outline" href="/api/catalogue/${encodeURIComponent(c.id)}/fichier">Télécharger</a>` : ''}
                    ${client && (client.slug === c.etablissement || client.estAdmin) ? `<button class="btn btn-outline" data-supprimer="${esc(c.id)}">Retirer</button>` : ''}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
            ${client ? `<p style="color:var(--fg-muted);font-size:0.8rem;margin-top:0.75rem;">
              Pour l'utiliser : dans votre Moodle, <strong>Administration du site</strong>, <strong>Cours</strong>, <strong>Restaurer un cours</strong>, puis déposez le fichier.</p>` : ''}
          </div>` : '<div class="card"><p style="color:var(--fg-muted);">Aucun cours partagé pour le moment.</p></div>';
        liste.querySelectorAll('[data-supprimer]').forEach((b) => b.addEventListener('click', async () => {
          if (!confirm('Retirer ce cours du catalogue ?')) return;
          try { await api.supprimerCours(b.dataset.supprimer); charger(); } catch (err) { alert(err.error || 'Erreur'); }
        }));
      } catch (err) {
        liste.innerHTML = `<div class="alert alert-error">Catalogue indisponible : ${esc(err.error || 'serveur injoignable')}</div>`;
      }
    };

    document.getElementById('catalogue-filtres').addEventListener('submit', (e) => { e.preventDefault(); charger(); });
    document.getElementById('partage-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('partage-alert');
      const fichier = document.getElementById('p-fichier').files[0];
      if (!fichier) return;
      alertEl.innerHTML = '<div class="alert alert-info">Envoi en cours...</div>';
      try {
        const data = await api.publierCours(fichier, {
          titre: document.getElementById('p-titre').value,
          description: document.getElementById('p-description').value,
          discipline: document.getElementById('p-discipline').value,
          niveau: document.getElementById('p-niveau').value,
          licence: document.getElementById('p-licence').value,
        });
        alertEl.innerHTML = `<div class="alert alert-success">${esc(data.message)}</div>`;
        e.target.reset();
        charger();
      } catch (err) {
        alertEl.innerHTML = `<div class="alert alert-error">${esc(err.error || 'Erreur')}</div>`;
      }
    });
    charger();
  }

  // ---- Administration de la plateforme ----
  async function renderAdmin() {
    if (!api.getClient()?.estAdmin) { navigate('dashboard'); return; }
    app.innerHTML = `
      ${renderNavbar('admin')}
      <div class="container">
        <div class="page-header">
          <h1>Administration</h1>
          <p>Établissements, forfaits et état de leur Moodle</p>
        </div>
        <div id="admin-content"><p style="color:var(--fg-muted);">Chargement...</p></div>
      </div>`;

    const content = document.getElementById('admin-content');
    try {
      const { resume, etablissements } = await api.getEtablissements();
      const jauge = (m, max) => (max === -1 ? `${m.actuel} / illimité` : `${m.actuel} / ${max} (${m.pourcentage} %)`);
      const couleur = (p) => (p >= 100 ? 'var(--danger)' : p >= 80 ? 'var(--warning)' : 'inherit');
      content.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${resume.total}</div><div class="stat-label">Établissements</div></div>
          ${['FREE', 'GOLD', 'PLATINUM'].map((p) => `
            <div class="stat-card"><div class="stat-value">${resume.parForfait[p] || 0}</div><div class="stat-label">${p}</div></div>`).join('')}
          <div class="stat-card"><div class="stat-value">${prixTexte(resume.revenuMensuel)}</div><div class="stat-label">Revenu mensuel (simulé)</div></div>
          <div class="stat-card"><div class="stat-value" style="color:${resume.alertes ? 'var(--warning)' : 'inherit'};">${resume.alertes}</div><div class="stat-label">Proches de leur limite</div></div>
        </div>
        <div class="card table-wrap">
          <table>
            <thead><tr><th>Établissement</th><th>Forfait</th><th>Moodle</th><th>Utilisateurs</th><th>Cours</th><th>Stockage</th><th>Bloqués</th><th>Partagés</th></tr></thead>
            <tbody>${etablissements.map((e) => {
              const etat = e.moodle.etatPile || e.moodle.statut || 'AUCUN';
              const c = e.consommation;
              return `
              <tr>
                <td><strong>${esc(e.organisation)}</strong>${e.estAdmin ? ' <span class="badge badge-free">admin</span>' : ''}
                  <div style="color:var(--fg-muted);font-size:0.8rem;">${esc(e.contact.email)} · inscrit le ${new Date(e.creeLe).toLocaleDateString('fr-FR')}</div></td>
                <td><span class="badge badge-${esc(e.plan.toLowerCase())}">${esc(e.plan)}</span>${e.statut !== 'ACTIVE' ? `<div style="font-size:0.8rem;color:var(--danger);">${esc(e.statut)}</div>` : ''}</td>
                <td><span class="status-dot status-${esc(etat.toLowerCase())}"></span>${esc(etat)}
                  ${e.moodle.url ? `<div><a href="${esc(e.moodle.url)}" target="_blank" style="font-size:0.8rem;">${esc(e.moodle.url.replace(/^https?:\/\//, ''))}</a></div>` : ''}</td>
                <td style="color:${couleur(c.utilisateurs.pourcentage)};">${jauge(c.utilisateurs, c.utilisateurs.max)}</td>
                <td style="color:${couleur(c.cours.pourcentage)};">${jauge(c.cours, c.cours.max)}</td>
                <td style="color:${couleur(c.stockage.pourcentage)};">${(c.stockage.utiliseMo / 1024).toFixed(2)} / ${c.stockage.maxGo} Go</td>
                <td style="color:${e.blocages ? 'var(--danger)' : 'inherit'};">${e.blocages}</td>
                <td>${e.coursPartages}</td>
              </tr>`;
            }).join('')}
            </tbody>
          </table>
        </div>
        <p style="color:var(--fg-muted);font-size:0.8rem;">
          Détail des ressources (CPU, mémoire, trafic) dans Grafana, tableau « Établissements ».
        </p>`;
    } catch (err) {
      content.innerHTML = `<div class="alert alert-error">${esc(err.error || 'Erreur de chargement')}</div>`;
    }
  }

  // ---- Handlers ----
  async function handleLogin(e) {
    e.preventDefault();
    const alertEl = document.getElementById('login-alert');
    alertEl.innerHTML = '';

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      await api.login(email, password);
      navigate('dashboard');
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">${err.error || 'Erreur de connexion'}</div>`;
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const alertEl = document.getElementById('register-alert');
    alertEl.innerHTML = '';

    const nom = document.getElementById('nom').value;
    const organisation = document.getElementById('organisation').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      const data = await api.register(email, password, nom, organisation);
      alertEl.innerHTML = `<div class="alert alert-success">
        ${data.message}<br>
        URL : <strong>${data.instance?.url || ''}</strong>
      </div>`;
      setTimeout(() => navigate('dashboard'), 4000);
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">${err.error || err.errors?.[0]?.msg || 'Erreur'}</div>`;
    }
  }

  async function handleUpgrade(e) {
    e.preventDefault();
    const alertEl = document.getElementById('upgrade-alert');
    alertEl.innerHTML = '';

    const numeroCarte = document.getElementById('card').value;
    const plan = document.getElementById('target-plan').value;

    try {
      const data = await api.upgrade(numeroCarte, plan);
      // Mettre à jour le client local avec le forfait confirmé par le serveur
      const client = api.getClient();
      if (client) {
        client.plan = data.plan;
        localStorage.setItem('sm_client', JSON.stringify(client));
      }
      alertEl.innerHTML = `<div class="alert alert-success">${data.message}</div>`;
      setTimeout(() => navigate('dashboard'), 1500);
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">${err.error || 'Erreur'}</div>`;
    }
  }

  // Fonction globale pour la déconnexion
  window.handleLogout = async () => {
    await api.logout();
    navigate('home');
  };

  // ---- Init ----
  window.addEventListener('hashchange', render);
  api.restoreSession().finally(render);
});
