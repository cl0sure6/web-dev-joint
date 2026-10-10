<?php
declare(strict_types=1);
// One-time import utility. The website itself only connects to PostgreSQL.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/backend/bootstrap.php';
try {
    $source = $argv[1] ?? '';
    if (!is_file($source)) throw new RuntimeException('Usage: php scripts/migrate-sqlite.php path/to/backup.sqlite');
    $sqlite = new PDO('sqlite:' . realpath($source), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    if ($sqlite->query('PRAGMA integrity_check')->fetchColumn() !== 'ok') throw new RuntimeException('The source database failed its integrity check.');
    $sqlite->exec('PRAGMA query_only=ON');
    $tables = ['settings','users','trainers','classes','schedule','memberships','bookings','reviews','faqs','news','messages','user_memberships','guest_bookings'];
    $existing = $sqlite->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
    $db = database();
    $db->beginTransaction();
    $db->exec(file_get_contents(dirname(__DIR__) . '/backend/schema.sql'));
    // Never merge into live records or silently replace user data.
    foreach ($tables as $table) {
        $db->exec('LOCK TABLE ' . $table . ' IN ACCESS EXCLUSIVE MODE');
        if ((int)$db->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn()) throw new RuntimeException('The target database must be empty. Existing data was not changed.');
    }
    foreach ($tables as $table) {
        if (!in_array($table, $existing, true)) continue;
        $count = 0;
        foreach ($sqlite->query('SELECT * FROM ' . $table) as $row) {
            if (in_array($table, ['users','guest_bookings'], true)) $row['email'] = strtolower($row['email']);
            $columns = array_keys($row);
            foreach ($columns as $column) if (!preg_match('/^[a-z_]+$/', $column)) throw new RuntimeException('Unexpected source column.');
            $quoted = implode(',', array_map(fn($column) => '"' . $column . '"', $columns));
            $query = $db->prepare('INSERT INTO ' . $table . '(' . $quoted . ') VALUES(' . implode(',', array_fill(0,count($columns),'?')) . ')');
            $query->execute(array_values($row));
            $count++;
        }
        if ($table !== 'settings') $db->query("SELECT setval(pg_get_serial_sequence('$table','id'), COALESCE(MAX(id),1), COUNT(*)>0) FROM $table");
        echo $table . ': ' . $count . " rows copied.\n";
    }
    $db->commit();
    seed_content($db);
    seed_demo_schedule($db);
    echo "Import complete. Account password hashes and record IDs were preserved.\n";
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    fwrite(STDERR, "Import failed: " . $error->getMessage() . "\n"); exit(1);
}
