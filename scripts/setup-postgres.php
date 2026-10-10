<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = dirname(__DIR__);
try {
    if (!extension_loaded('pdo_pgsql')) throw new RuntimeException('Enable extension=pdo_pgsql in php.ini first.');
    $input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
    $name = $input['database'] ?? 'form_club';
    $host = $input['host'] ?? '127.0.0.1';
    $port = (int)($input['port'] ?? 5432);
    if (!preg_match('/^[a-z][a-z0-9_]{0,39}$/', $name) || preg_match('/[;\s]/', $host)) throw new RuntimeException('Use a simple lowercase database name and a valid host.');
    if (is_file($root . '/config.local.php')) throw new RuntimeException('config.local.php already exists. It was not overwritten. Use scripts/init-db.php with your existing settings.');
    $admin = new PDO("pgsql:host=$host;port=$port;dbname=postgres;connect_timeout=5", $input['user'], $input['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    unset($input['password']);
    $query = $admin->prepare('SELECT 1 FROM pg_database WHERE datname=?');
    $query->execute([$name]);
    if ($query->fetchColumn()) throw new RuntimeException('This database already exists. Choose a new name with -Database; existing databases are never overwritten.');
    $role = $name . '_app_' . bin2hex(random_bytes(3));
    $password = bin2hex(random_bytes(24));
    $admin->exec('CREATE ROLE "' . $role . '" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ' . $admin->quote($password));
    $admin->exec('CREATE DATABASE "' . $name . '" OWNER "' . $role . '" ENCODING \'UTF8\' TEMPLATE template0');
    $local = ['database_host'=>$host,'database_port'=>$port,'database_name'=>$name,'database_user'=>$role,'database_password'=>$password,'database_sslmode'=>'prefer','timezone'=>'Asia/Qyzylorda'];
    $file = fopen($root . '/config.local.php', 'x');
    if (!$file) throw new RuntimeException('Database created, but local configuration could not be saved.');
    $written = fwrite($file, "<?php\n// Local credentials: never commit this file.\nreturn " . var_export($local,true) . ";\n");
    fclose($file);
    if ($written === false) throw new RuntimeException('Could not write local configuration.');
    echo "Created PostgreSQL database $name and a dedicated application user.\n";
    $source = $root . '/var/club.sqlite';
    if (is_file($source)) {
        // Recover any SQLite journal only in a copy. The original remains untouched.
        $backupDir = sys_get_temp_dir() . '/form-sqlite-backup-' . bin2hex(random_bytes(6));
        if (!mkdir($backupDir,0700,true) || !copy($source,$backupDir.'/club.sqlite')) throw new RuntimeException('Could not back up the old database. Run migration manually before initializing PostgreSQL.');
        foreach (['-journal','-wal','-shm'] as $suffix) {
            if (is_file($source.$suffix) && !copy($source.$suffix,$backupDir.'/club.sqlite'.$suffix)) throw new RuntimeException('Could not copy the SQLite journal. Stop the web server and retry the migration.');
        }
        echo "Original SQLite database preserved. Migration backup: $backupDir\n";
        $argv = ['migrate-sqlite.php', $backupDir . '/club.sqlite'];
        require __DIR__ . '/migrate-sqlite.php';
    } else {
        $argv = ['init-db.php'];
        require __DIR__ . '/init-db.php';
    }
    echo "Setup complete. Restart the PHP server, then open your website.\n";
} catch (Throwable $error) {
    fwrite(STDERR, "Setup failed: " . $error->getMessage() . "\n"); exit(1);
}
