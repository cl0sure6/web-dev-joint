<?php

declare(strict_types=1);

require dirname(__DIR__) . '/backend/bootstrap.php';
start_session();
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
$error = '';
try {
    if (is_admin()) {
        header('Location: index.php');
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!csrf_valid($_POST['csrf'] ?? null)) {
            $error = 'Your form expired. Please try again.';
        } elseif (!throttle('admin-login', 10, 600)) {
            http_response_code(429);
            $error = 'Too many attempts. Try again in 10 minutes.';
        } else {
            $email = is_string($_POST['email'] ?? null) ? strtolower(trim($_POST['email'])) : '';
            $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
            $query = database()->prepare('SELECT * FROM users WHERE email = ?');
            $query->execute([$email]);
            $user = $query->fetch();
            $verified = password_verify($password, $user['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
            if ($verified && $user && $user['role'] === 'admin') {
                session_regenerate_id(true);
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['csrf'] = bin2hex(random_bytes(32));
                if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
                    database()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $user['id']]);
                }
                header('Location: index.php');
                exit;
            }
            $error = 'Email or password is incorrect, or this account does not have admin access.';
        }
    }
} catch (Throwable $exception) {
    error_log($exception->getMessage());
    http_response_code(503);
    $error = 'The service is unavailable. Check the PHP database configuration and try again.';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin sign in — FORM</title>
    <link rel="stylesheet" href="../style.css">
    <link rel="stylesheet" href="style.css">
</head>
<body class="login-page">
    <a href="../index.html" class="login-back">← Back to the club</a>
    <main class="login-layout">
        <div class="login-story">
            <a class="logo" href="../index.html"><span class="logo-mark" aria-hidden="true">ƒ</span> FORM<span class="logo-caption">FITNESS CLUB</span></a>
            <p class="eyebrow">THE OTHER SIDE OF THE CLUB</p>
            <h1>Good routines.<br>Great organisation.</h1>
            <p>The space behind the scenes. Keep your people, programmes, and club moving.</p>
            <span class="login-stamp" aria-hidden="true">F /<br>CLUB OPERATIONS</span>
        </div>
        <section class="login-card" aria-labelledby="login-title">
            <span class="eyebrow">STAFF ACCESS / 01</span>
            <h2 id="login-title">Welcome back.</h2>
            <p>Sign in to the club administration.</p>
            <?php if ($error !== ''): ?>
                <p class="form-status form-status--error" role="alert"><?= escape($error) ?></p>
            <?php endif; ?>
            <form method="post" action="login.php" class="stacked-form">
                <input type="hidden" name="csrf" value="<?= escape($_SESSION['csrf']) ?>">
                <label>Email address<input type="email" name="email" autocomplete="username" maxlength="200" required value="<?= escape(is_string($_POST['email'] ?? null) ? $_POST['email'] : '') ?>"></label>
                <label>Password<input type="password" name="password" autocomplete="current-password" maxlength="72" required></label>
                <button class="button" type="submit">Sign in <span aria-hidden="true">↗</span></button>
            </form>
            <p class="login-note">Access is for club administrators. Ask your project maintainer if you need an account.</p>
        </section>
    </main>
</body>
</html>

