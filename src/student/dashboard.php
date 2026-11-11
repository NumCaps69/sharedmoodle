<?php
require_once '../includes/auth_simulator.php';
check_auth('student');

$courses = [
    ['titre' => 'Systèmes d\'Information (SIGLIS)', 'etab' => 'UPPA - Anglet', 'niveau' => 'M1', 'tags' => 'Architecture, SI'],
    ['titre' => 'Introduction à Python', 'etab' => 'UPPA - Anglet', 'niveau' => 'L3', 'tags' => 'Développement'],
    ['titre' => 'Infrastructures Docker Swarm', 'etab' => 'UPPA - Anglet', 'niveau' => 'M1', 'tags' => 'DevSecOps']
];
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Espace Étudiant</title>
    <link rel="stylesheet" href="../css/style.css">
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Bienvenue, <?php echo $_SESSION['user']['name']; ?> (Étudiant)</h2>
            <a href="../auth/logout.php" class="btn btn-danger">Déconnexion</a>
        </div>
        
        <h3>Moteur de recherche</h3>
        <form style="flex-direction: row; gap: 10px; margin-bottom: 20px;">
            <input type="text" placeholder="Rechercher une ressource (ex: Docker)..." style="flex: 1; margin: 0;">
            <button type="button" class="btn">Chercher</button>
        </form>

        <h3>Vos cours disponibles</h3>
        <?php foreach ($courses as $course): ?>
            <div class="course-card">
                <h3><?php echo $course['titre']; ?></h3>
                <div class="meta">
                    <strong>Établissement:</strong> <?php echo $course['etab']; ?> | 
                    <strong>Niveau:</strong> <?php echo $course['niveau']; ?>
                </div>
                <p>Tags: <em><?php echo $course['tags']; ?></em></p>
                <button class="btn" style="padding: 5px 10px; font-size: 0.9em;">Consulter la fiche</button>
            </div>
        <?php endforeach; ?>
    </div>
</body>
</html>
