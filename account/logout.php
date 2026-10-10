<?php
declare(strict_types=1);
require dirname(__DIR__) . '/backend/bootstrap.php';
start_session();
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !csrf_valid(is_string($_POST['csrf'] ?? null) ? $_POST['csrf'] : null)) {
    http_response_code(403);
    exit('Invalid sign-out request. Refresh the page and try again.');
}
$_SESSION = [];
$cookie = session_get_cookie_params();
setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $cookie['path'], 'secure' => $cookie['secure'], 'httponly' => true, 'samesite' => 'Lax']);
session_destroy();
header('Location: login.php');
exit;
