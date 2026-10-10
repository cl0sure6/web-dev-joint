<?php
declare(strict_types=1);
require dirname(__DIR__) . '/backend/bootstrap.php';
start_session();
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
try {
    $user = current_user();
    if ($user) {
        header('Location: ' . ($user['role'] === 'admin' ? '../admin/index.php' : 'index.php'));
        exit;
    }
} catch (Throwable $error) { error_log($error->getMessage()); }
$register = ($_GET['mode'] ?? '') === 'register';
?>
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="csrf-token" content="<?= escape($_SESSION['csrf']) ?>"><title><?= $register ? 'Join FORM' : 'Member sign in' ?> — FORM</title><link rel="stylesheet" href="../style.css"><link rel="stylesheet" href="style.css"><script src="auth.js" defer></script></head>
<body class="member-auth">
<a class="auth-back" href="../index.html">← Back to the club</a>
<main class="auth-layout">
    <section class="auth-story"><a class="logo" href="../index.html"><span class="logo-mark" aria-hidden="true">ƒ</span> FORM<span class="logo-caption">FITNESS CLUB</span></a><p class="eyebrow">A LITTLE STRONGER. EVERY DAY.</p><h1>Your space.<br>Your <em>rhythm.</em></h1><p>Make time for movement. Book your next class, find your routine, and keep coming back to yourself.</p><span class="auth-stamp">FORM / MEMBER ACCESS</span></section>
    <section class="auth-card" aria-labelledby="auth-title"><p class="eyebrow">YOUR ROUTINE STARTS HERE</p><h2 id="auth-title"><?= $register ? 'Start with you.' : 'Welcome back.' ?></h2><p><?= $register ? 'Create your member account.' : 'Sign in to your space at FORM.' ?></p>
    <form id="auth-form" class="stacked-form" data-action="<?= $register ? 'member-register' : 'member-login' ?>">
        <?php if ($register): ?><label>Your name<input name="name" maxlength="100" autocomplete="name" required></label><?php endif; ?>
        <label>Email address<input type="email" name="email" maxlength="200" autocomplete="username" required></label>
        <label>Password<input type="password" name="password" <?= $register ? 'minlength="12"' : '' ?> maxlength="72" autocomplete="<?= $register ? 'new-password' : 'current-password' ?>" required></label>
        <?php if ($register): ?><p class="field-hint">Use 12–72 characters. Longer passphrases are welcome.</p><label>Confirm password<input type="password" name="password_confirmation" minlength="12" maxlength="72" autocomplete="new-password" required></label><?php endif; ?>
        <p id="auth-status" class="form-status" role="status" aria-live="polite"></p><button class="button" type="submit"><?= $register ? 'Create account' : 'Sign in' ?> <span aria-hidden="true">↗</span></button>
    </form>
    <noscript><p>Please enable JavaScript to sign in or create your account.</p></noscript>
    <p class="auth-switch"><?= $register ? 'Already a member? <a href="login.php">Sign in</a>' : 'New to FORM? <a href="login.php?mode=register">Create an account</a>' ?></p><p class="field-hint">Club team? <a href="../admin/login.php">Staff access ↗</a></p>
    </section>
</main></body></html>
