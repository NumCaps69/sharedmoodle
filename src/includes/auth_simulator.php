<?php
session_start();

function authenticate($username, $password, $role) {
    $users = [
        'etudiant1' => ['pwd' => 'pass123', 'role' => 'student', 'name' => 'Alice (UPPA Anglet)'],
        'prof1'     => ['pwd' => 'prof123', 'role' => 'teacher', 'name' => 'Mr. Dupont (UPPA Anglet)'],
    ];

    if (isset($users[$username]) && $users[$username]['pwd'] === $password && $users[$username]['role'] === $role) {
        $_SESSION['user'] = [
            'username' => $username,
            'name' => $users[$username]['name'],
            'role' => $role,
            'token' => 'fake_jwt_token_12345'
        ];
        return true;
    }
    return false;
}

function check_auth($required_role) {
    if (!isset($_SESSION['user']) || $_SESSION['user']['role'] !== $required_role) {
        header("Location: /auth/login.php?error=access_denied");
        exit();
    }
}
?>