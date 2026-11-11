<?php
require_once '../includes/auth_simulator.php';
check_auth('teacher');
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Espace Enseignant</title>
    <link rel="stylesheet" href="../css/style.css">
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Bienvenue, <?php echo $_SESSION['user']['name']; ?> (Enseignant)</h2>
            <a href="../auth/logout.php" class="btn btn-danger">Déconnexion</a>
        </div>

        <h3>Gestion des Ressources</h3>
        <p>En tant qu'enseignant de l'UPPA, vous pouvez ajouter de nouvelles ressources pédagogiques.</p>
        
        <div class="course-card" style="background: #e9ecef;">
            <h4>Ajouter une nouvelle ressource (Activité A1)</h4>
            <form>
                <label>Titre de la ressource</label>
                <input type="text" placeholder="Ex: Cours sur l'ETL Talend">
                
                <label>Concepts ESCO / Wikidata</label>
                <input type="text" placeholder="Ex: Data Integration (Q45345)">
                
                <label>Visibilité</label>
                <select>
                    <option>Indexée dans le Triple Store</option>
                    <option>Restreinte (UPPA uniquement)</option>
                </select>
                
                <button type="button" class="btn" style="margin-top: 15px;">Générer RDF & Publier</button>
            </form>
        </div>

        <h3>Propositions d'amélioration en attente</h3>
        <div class="course-card">
            <h4>[Proposition] Mettre à jour les scripts Docker</h4>
            <p><strong>Par:</strong> kaisse.belalem (Étudiant M1 SIGLIS - UPPA)</p>
            <p><strong>Score communautaire:</strong> +5 votes favorables</p>
            <button class="btn" style="background: green;">Accepter (Générer v2)</button>
            <button class="btn btn-danger">Rejeter</button>
        </div>
    </div>
</body>
</html>
