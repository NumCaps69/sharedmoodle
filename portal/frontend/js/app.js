// ============================================================
// SharedMoodle — App Frontend (SPA simple)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');

  // Router simple basé sur le hash
  function navigate(page) {
    window.location.hash = page;
  }

  function getCurrentPage() {
    return window.location.hash.slice(1) || 'home';
  }

  // ---- Rendu des pages ----
  function render() {
    const page = getCurrentPage();

    if (!api.isLoggedIn() && !['home', 'login', 'register'].includes(page)) {
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
            <li><button onclick="handleLogout()">Déconnexion</button></li>
          ` : `
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

        <div class="plans-grid" style="margin-top:2rem;">
          <div class="plan-card">
            <div class="plan-name">FREE</div>
            <div class="plan-price">0€ <small>/mois</small></div>
            <ul class="plan-features">
              <li>50 utilisateurs max</li>
              <li>5 cours actifs</li>
              <li>1 Go de stockage</li>
              <li>Backup hebdomadaire</li>
              <li>Support email (48h)</li>
              <li class="disabled">Plugins personnalisés</li>
            </ul>
            <a href="#register" class="btn btn-outline btn-block">S'inscrire</a>
          </div>
          <div class="plan-card gold">
            <div class="plan-name" style="color:var(--gold);">GOLD</div>
            <div class="plan-price" style="color:var(--gold);">29,99€ <small>/mois</small></div>
            <ul class="plan-features">
              <li>500 utilisateurs max</li>
              <li>Cours illimités</li>
              <li>20 Go de stockage</li>
              <li>Backup quotidien</li>
              <li>Support prioritaire (4h)</li>
              <li>Plugins personnalisés</li>
            </ul>
            <a href="#register" class="btn btn-gold btn-block">Commencer en FREE puis upgrader</a>
          </div>
        </div>
      </div>`;
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
          <h1>Bonjour, ${client?.nom || 'Client'}</h1>
          <p>${client?.organisation || ''} — <span class="badge badge-${(client?.plan || 'free').toLowerCase()}">${client?.plan || 'FREE'}</span></p>
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
          </div>
        ` : ''}

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${conso?.utilisateurs?.actuel ?? '—'}</div>
            <div class="stat-label">Utilisateurs / ${conso?.utilisateurs?.max ?? '—'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${conso?.cours?.actuel ?? '—'}</div>
            <div class="stat-label">Cours / ${conso?.cours?.max ?? '—'}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${conso?.stockage ? (conso.stockage.utiliseMo / 1024).toFixed(1) : '—'}</div>
            <div class="stat-label">Go utilisés / ${conso?.stockage?.maxGo ?? '—'} Go</div>
          </div>
        </div>

        ${conso ? `
          <div class="card">
            <h2 style="margin-bottom:1rem;">Consommation</h2>
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
          </div>
        ` : ''}

        ${client?.plan === 'FREE' ? `
          <div class="card" style="border-color:var(--gold);background:var(--gold-soft);">
            <h2 style="color:var(--gold);margin-bottom:0.5rem;">Passez en GOLD</h2>
            <p style="margin-bottom:1rem;">Débloquez 500 utilisateurs, cours illimités, 20 Go et le support prioritaire.</p>
            <a href="#upgrade" class="btn btn-gold">Upgrader maintenant</a>
          </div>
        ` : ''}
      `;
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
        <div class="plans-grid">
          <div class="plan-card ${client?.plan === 'FREE' ? 'current' : ''}">
            <div class="plan-name">FREE</div>
            <div class="plan-price">0€ <small>/mois</small></div>
            <ul class="plan-features">
              <li>50 utilisateurs</li>
              <li>5 cours actifs</li>
              <li>1 Go de stockage</li>
              <li>Backup hebdomadaire</li>
              <li>Support 48h</li>
              <li class="disabled">Plugins personnalisés</li>
            </ul>
            ${client?.plan === 'FREE' ? '<div class="badge badge-free" style="margin-top:0.5rem;">Forfait actuel</div>' : ''}
          </div>
          <div class="plan-card gold ${client?.plan === 'GOLD' ? 'current' : ''}">
            <div class="plan-name" style="color:var(--gold);">GOLD</div>
            <div class="plan-price" style="color:var(--gold);">29,99€ <small>/mois</small></div>
            <ul class="plan-features">
              <li>500 utilisateurs</li>
              <li>Cours illimités</li>
              <li>20 Go de stockage</li>
              <li>Backup quotidien</li>
              <li>Support prioritaire 4h</li>
              <li>Plugins personnalisés</li>
            </ul>
            ${client?.plan === 'GOLD'
              ? '<div class="badge badge-gold" style="margin-top:0.5rem;">Forfait actuel</div>'
              : '<a href="#upgrade" class="btn btn-gold btn-block" style="margin-top:0.5rem;">Passer en GOLD</a>'}
          </div>
        </div>
      </div>`;
  }

  // ---- Page upgrade ----
  function renderUpgrade() {
    const client = api.getClient();
    if (client?.plan === 'GOLD') {
      navigate('dashboard');
      return;
    }

    app.innerHTML = `
      ${renderNavbar('upgrade')}
      <div class="auth-container">
        <div class="auth-card" style="max-width:460px;">
          <h1>Passer en GOLD</h1>
          <p class="subtitle">29,99€/mois — Débloquez toutes les fonctionnalités</p>
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
            <button type="submit" class="btn btn-gold btn-block" style="margin-top:0.5rem;">
              Confirmer l'upgrade
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
        Inscription réussie ! Votre accès au Moodle de démonstration est prêt.<br>
        URL : <strong>${data.instance?.url || ''}</strong>
      </div>`;
      setTimeout(() => navigate('dashboard'), 2000);
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">${err.error || err.errors?.[0]?.msg || 'Erreur'}</div>`;
    }
  }

  async function handleUpgrade(e) {
    e.preventDefault();
    const alertEl = document.getElementById('upgrade-alert');
    alertEl.innerHTML = '';

    const numeroCarte = document.getElementById('card').value;

    try {
      const data = await api.upgrade(numeroCarte);
      // Mettre à jour le client local
      const client = api.getClient();
      if (client) {
        client.plan = 'GOLD';
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
