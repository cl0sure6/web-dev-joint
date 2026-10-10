<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/backend/bootstrap.php';
try {
    $db = database();
    $db->beginTransaction();
    $db->query('SELECT pg_advisory_xact_lock(732104, 0)');
    $db->exec(file_get_contents(dirname(__DIR__) . '/backend/schema.sql'));
    $db->commit();
    if (!in_array('--empty', $argv, true)) {
        seed_content($db);
        seed_demo_schedule($db);
    }
    echo "PostgreSQL schema is ready.\n";
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    fwrite(STDERR, "Database setup failed: " . $error->getMessage() . "\n"); exit(1);
}
