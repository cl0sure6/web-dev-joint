<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/backend/bootstrap.php';

$email = strtolower(trim($argv[1] ?? ''));
$name = trim($argv[2] ?? 'Club administrator');
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($name) > 100 || $name === '') {
    fwrite(STDERR, "Usage: php scripts/create-admin.php admin@example.com \"Your name\"\n");
    exit(1);
}
// Keep credentials out of command history and process arguments.
fwrite(STDOUT, "Password (at least 12 characters; terminal input may be visible): ");
$password = rtrim((string) fgets(STDIN), "\r\n");
if (strlen($password) < 12 || strlen($password) > 72) {
    fwrite(STDERR, "Use a password between 12 and 72 characters.\n");
    exit(1);
}
try {
    $query = database()->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    $query->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), 'admin']);
    fwrite(STDOUT, "Administrator created. Open /admin/login.php to sign in.\n");
} catch (PDOException $error) {
    fwrite(STDERR, "Could not create the administrator. Check the database settings and whether this email already exists.\n");
    exit(1);
}

