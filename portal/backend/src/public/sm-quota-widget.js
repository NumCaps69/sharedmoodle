/* SharedMoodle : forfait de l'établissement, affiché dans son Moodle.
 * Chargé par chaque page Moodle (config.php de la pile sm-<slug>).
 * - Page de connexion : rappelle l'identifiant de l'administrateur.
 * - Administrateur : fenêtre à 80 % puis à 100 % du forfait (cours, utilisateurs),
 *   bandeau permanent tant que la limite est proche, et création d'un cours
 *   ou d'un compte bloquée quand la limite est atteinte.
 * Les limites sont aussi appliquées côté serveur par le portail (cours masqués,
 * comptes suspendus) : ce script ne fait que prévenir au bon moment. */
(function () {
  if (window.__smQuota) return;
  window.__smQuota = true;

  var page = location.pathname;
  var params = new URLSearchParams(location.search);

  var css = '' +
    '.smq-veil{position:fixed;inset:0;background:rgba(15,23,32,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.smq-box{background:#fff;color:#16202b;max-width:480px;width:100%;border-radius:12px;padding:22px 22px 18px;box-shadow:0 18px 48px rgba(0,0,0,.3);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '.smq-box h2{font-size:19px;margin:0 0 8px;font-weight:700}' +
    '.smq-box p{margin:0 0 10px}' +
    '.smq-tag{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:99px;margin-bottom:10px}' +
    '.smq-warn .smq-tag{background:#fff1d6;color:#8a5300}.smq-stop .smq-tag{background:#fde4e1;color:#a2241b}' +
    '.smq-bar{height:8px;background:#e6e9ee;border-radius:99px;overflow:hidden;margin:6px 0 12px}' +
    '.smq-bar span{display:block;height:100%}.smq-warn .smq-bar span{background:#d98a00}.smq-stop .smq-bar span{background:#c0362c}' +
    '.smq-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:6px}' +
    '.smq-btn{border:0;border-radius:8px;padding:9px 14px;font-weight:600;cursor:pointer;text-decoration:none;font-size:14px}' +
    '.smq-main{background:#d98a00;color:#fff}.smq-stop .smq-main{background:#c0362c}.smq-sec{background:#eef1f5;color:#16202b}' +
    '.smq-btn:hover{color:inherit;filter:brightness(.95);text-decoration:none}.smq-main:hover{color:#fff}' +
    '.smq-banner{margin:0 0 16px;padding:10px 14px;border-radius:8px;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between}' +
    '.smq-banner.smq-warn{background:#fff6e5;border:1px solid #f0c46b;color:#5c3a00}.smq-banner.smq-stop{background:#fdecea;border:1px solid #f0a39b;color:#7a1d16}' +
    '.smq-banner a{font-weight:600}' +
    '.smq-hint{margin:12px 0;padding:10px 12px;border-radius:8px;background:#e8f0fb;color:#16324f;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}';

  function addCss() {
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function vu(cle) {
    try { if (localStorage.getItem(cle)) return true; localStorage.setItem(cle, '1'); } catch (e) { /* stockage refusé */ }
    return false;
  }

  function modal(niveau, titre, lignes, pct, upgrade, bloquant) {
    var veil = el('div', 'smq-veil');
    var box = el('div', 'smq-box smq-' + niveau);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.appendChild(el('span', 'smq-tag', niveau === 'stop' ? 'Limite atteinte' : 'Forfait bientôt plein'));
    box.appendChild(el('h2', '', titre));
    lignes.filter(Boolean).forEach(function (l) { box.appendChild(el('p', '', l)); });
    if (typeof pct === 'number') {
      var bar = el('div', 'smq-bar'); var fill = el('span');
      fill.style.width = Math.min(100, pct) + '%'; bar.appendChild(fill); box.appendChild(bar);
    }
    var actions = el('div', 'smq-actions');
    var fermer = el('button', 'smq-btn smq-sec', bloquant ? 'Retour' : 'Plus tard');
    fermer.type = 'button';
    fermer.onclick = function () {
      if (bloquant) { history.length > 1 ? history.back() : (location.href = '/course/management.php'); }
      else veil.remove();
    };
    actions.appendChild(fermer);
    if (upgrade) {
      var go = el('a', 'smq-btn smq-main', 'Passer en ' + upgrade.plan);
      go.href = upgrade.url; go.target = '_blank'; go.rel = 'noopener';
      actions.appendChild(go);
    }
    box.appendChild(actions);
    veil.appendChild(box);
    document.body.appendChild(veil);
    (upgrade ? box.querySelector('.smq-main') : fermer).focus();
  }

  function banner(niveau, texte, upgrade) {
    var zone = document.querySelector('#region-main') || document.querySelector('#page-content') || document.body;
    var b = el('div', 'smq-banner smq-' + niveau);
    b.appendChild(el('span', '', texte));
    if (upgrade) {
      var a = el('a', '', 'Passer en ' + upgrade.plan);
      a.href = upgrade.url; a.target = '_blank'; a.rel = 'noopener';
      b.appendChild(a);
    }
    zone.insertBefore(b, zone.firstChild);
  }

  function bloquerFormulaire() {
    var main = document.querySelector('#region-main') || document;
    main.querySelectorAll('form').forEach(function (f) {
      f.addEventListener('submit', function (e) { e.preventDefault(); e.stopImmediatePropagation(); }, true);
      f.querySelectorAll('input[type=submit],button[type=submit]').forEach(function (b) { b.disabled = true; });
    });
  }

  addCss();

  // Page de connexion : rappel pour l'administrateur de l'établissement
  if (page === '/login/index.php') {
    var form = document.querySelector('#login') || document.querySelector('form.login-form');
    if (form) {
      var hint = el('div', 'smq-hint', 'Administrateur de l’établissement : identifiant « admin » (ou son adresse e-mail) et le mot de passe de votre compte portail SharedMoodle.');
      form.parentNode.insertBefore(hint, form);
    }
    return;
  }

  // Seuls les administrateurs voient le menu « Site administration »
  var estAdmin = !!document.querySelector('a[href*="/admin/search.php"]');
  if (!estAdmin) return;

  fetch('/sm-quota/status', { credentials: 'omit', cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (s) {
      if (!s) return;
      var up = s.miseANiveau;
      var res = [
        { cle: 'cours', nom: 'cours', d: s.cours },
        { cle: 'utilisateurs', nom: 'utilisateurs', d: s.utilisateurs }
      ];

      var creationCours = page === '/course/edit.php' && !params.get('id');
      var creationCompte = (page === '/user/editadvanced.php' && params.get('id') === '-1') || page === '/admin/tool/uploaduser/index.php';
      var cible = creationCours ? res[0] : creationCompte ? res[1] : null;

      // Création au-delà de la limite : bloquée
      if (cible && cible.d.max !== null && cible.d.actuel >= cible.d.max) {
        bloquerFormulaire();
        modal('stop',
          'Limite de ' + cible.nom + ' atteinte : ' + cible.d.actuel + ' sur ' + cible.d.max,
          ['Votre forfait ' + s.plan + ' ne permet pas de créer d’autres ' + cible.nom + '.',
           up ? 'Passez en ' + up.plan + ' pour continuer : la limite est levée tout de suite, sans perdre vos données.' : ''],
          100, up, true);
        return;
      }

      // 80 % puis 100 % : une fenêtre à chaque nouveau palier, puis un bandeau
      res.forEach(function (r) {
        var d = r.d;
        if (d.max === null || d.pourcentage < s.seuil) return;
        var plein = d.actuel >= d.max;
        var niveau = plein ? 'stop' : 'warn';
        var texte = 'Forfait ' + s.plan + ' : ' + d.actuel + ' ' + r.nom + ' sur ' + d.max + ' (' + d.pourcentage + ' %).' +
          (d.bloques ? ' ' + d.bloques + (r.cle === 'cours' ? ' cours masqué(s)' : ' compte(s) suspendu(s)') + ' au-delà du forfait.' : '');
        banner(niveau, texte, up);
        if (!vu('smq:' + location.host + ':' + s.plan + ':' + r.cle + ':' + d.actuel)) {
          modal(niveau,
            plein ? 'Limite de ' + r.nom + ' atteinte' : 'Vous approchez de la limite de ' + r.nom,
            [texte,
             plein ? 'Vous ne pouvez plus en créer. Passez au forfait supérieur pour continuer.'
                   : 'Il vous reste ' + (d.max - d.actuel) + ' ' + r.nom + ' avant la limite.'],
            d.pourcentage, up, false);
        }
      });
    })
    .catch(function () { /* portail injoignable : Moodle reste utilisable */ });
})();
