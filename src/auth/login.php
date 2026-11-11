<?php
require_once '../includes/auth_simulator.php';

$error = '';
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username = $_POST['username'];
    $password = $_POST['password'];
    $role = $_POST['role'];

    if (authenticate($username, $password, $role)) {
        if ($role === 'student') {
            header("Location: ../student/dashboard.php");
        } else {
            header("Location: ../teacher/dashboard.php");
        }
        exit();
    } else {
        $error = "Identifiant, mot de passe ou rôle incorrect.";
    }
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Connexion - SharedMoodle</title>
    <link rel="stylesheet" href="../css/style.css">
</head>
<body>
    <div class="container" style="max-width: 400px;">
        <h2>Connexion SharedMoodle</h2>
        <p><em>Portail d'authentification</em></p>
        
        <?php if($error): ?>
            <div style="color: red; margin-bottom: 15px;"><?php echo $error; ?></div>
        <?php endif; ?>

        <form method="POST" action="login.php">
            <label>Établissement</label>
            <select name="school">
                <option value="uppa">UPPA (Campus Anglet)</option>
            </select>

            <label>Identifiant</label>
            <input type="text" name="username" required placeholder="etudiant1 ou prof1">

            <label>Mot de passe</label>
            <input type="password" name="password" required placeholder="pass123 ou prof123">

            <label>Je suis :</label>
            <select name="role">
                <option value="student">Étudiant</option>
                <option value="teacher">Enseignant</option>
            </select>

            <button type="submit" class="btn" style="margin-top: 20px;">S'authentifier</button>
        </form>
    </div>
</body>
</html>
