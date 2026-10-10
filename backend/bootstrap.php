<?php

declare(strict_types=1);

// Shared by the API, admin pages, and the command-line setup script.
$config = ['database_path' => dirname(__DIR__) . '/var/club.sqlite', 'timezone' => 'Asia/Qyzylorda'];
if (is_file(dirname(__DIR__) . '/config.local.php')) {
    $config = array_replace($config, require dirname(__DIR__) . '/config.local.php');
}
if (getenv('CLUB_DATABASE_PATH')) {
    $config['database_path'] = getenv('CLUB_DATABASE_PATH');
}
date_default_timezone_set($config['timezone']);

function database(): PDO
{
    global $config;
    static $connection;
    if ($connection instanceof PDO) {
        return $connection;
    }
    $directory = dirname($config['database_path']);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Cannot create the database directory.');
    }
    $connection = new PDO('sqlite:' . $config['database_path'], null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $connection->exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    $connection->exec(file_get_contents(__DIR__ . '/schema.sql'));
    seed_content($connection);
    seed_demo_schedule($connection);
    return $connection;
}

function seed_content(PDO $connection): void
{
    // A marker prevents intentionally deleted content from being seeded again.
    $connection->beginTransaction();
    if ($connection->query("SELECT value FROM settings WHERE key = 'initialized'")->fetchColumn()) {
        $connection->commit();
        return;
    }
    $settings = [
        'initialized' => '1',
        'club_name' => 'FORM',
        'tagline' => 'A little stronger. Every day.',
        'about' => 'A neighbourhood fitness club built around one simple idea: training should fit your life. Find your rhythm with space to lift, move, swim, and recover.',
        'history' => 'Our story starts with a shared love of movement. We are building a welcoming place for first sessions, fresh starts, and the routines that last.',
        'opened' => 'Opening date to be announced',
        'address' => 'Club address to be announced',
        'phone' => '',
        'email' => '',
        'map_url' => '',
        'weekday_hours' => '07:00 – 23:00',
        'weekend_hours' => '08:00 – 22:00',
    ];
    $insert = $connection->prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    foreach ($settings as $key => $value) {
        $insert->execute([$key, $value]);
    }
    $plans = [
        ['single', 'Single Visit', 'Single gym session entry at any convenient time.', 1500, 1, 0],
        ['month', '1 Month', 'Unlimited facility access for 30 consecutive calendar days.', 18000, 30, 0],
        ['3months', '3 Months', 'Ideal commitment for building a consistent fitness routine.', 48000, 90, 0],
        ['6months', '6 Months', 'Half-year membership including one 14-day hold allowance.', 85000, 180, 0],
        ['year', 'Annual', 'Maximum savings plus 30 complimentary freeze days.', 150000, 365, 1],
        ['student', 'Student', 'Off-peak daytime access upon presenting a valid student ID.', 12000, 30, 0],
        ['child', 'Kids & Teens', 'Sports sections and supervised group sessions for ages 6–14.', 10000, 30, 0],
        ['family', 'Family', 'Joint monthly membership for two adults and one child.', 32000, 30, 0],
    ];
    $insert = $connection->prepare('INSERT INTO memberships (slug, name, description, price, duration_days, featured) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($plans as $plan) {
        $insert->execute($plan);
    }
    $questions = [
        ['How do I buy a membership?', 'Explore Memberships & Pricing, then send us an enquiry with your preferred plan. Our team will help you choose and arrange your first visit.'],
        ['Can I cancel a class?', 'Cancellation options will be available in your member account once online booking opens. Until then, contact the club to change your plans.'],
        ['Is there a student discount?', 'Yes. The Student plan offers daytime access with a valid student ID. See Memberships & Pricing for the current price.'],
        ['Can I use the pool?', 'Pool access depends on your membership and the swimming schedule. Ask the club to confirm what is included before you buy.'],
        ['What should I bring to my first session?', 'Comfortable sportswear, clean indoor trainers, a water bottle, and a towel. Bring swimwear and a swimming cap if you plan to use the pool.'],
    ];
    $insert = $connection->prepare('INSERT INTO faqs (question, answer, position) VALUES (?, ?, ?)');
    foreach ($questions as $index => $question) {
        $insert->execute([$question[0], $question[1], $index + 1]);
    }
    // Members, trainers, reviews, and events start empty; the admin adds real records.
    $connection->commit();
}


function seed_demo_schedule(PDO $connection): void
{
    // Only initialize demo timetable once, and only if club has no real schedule.
    if ($connection->query("SELECT value FROM settings WHERE key = 'demo_schedule_initialized'")->fetchColumn()) return;
    $connection->exec('BEGIN IMMEDIATE');
    try {
        if (!(int)$connection->query('SELECT COUNT(*) FROM schedule')->fetchColumn()
            && !(int)$connection->query('SELECT COUNT(*) FROM classes')->fetchColumn()) {
            $trainers = [
                ['Sophia Williams','Yoga & Pilates',6], ['Olivia Brown','Pilates & Stretching',4],
                ['Emma Thompson','Swimming',5], ['Alex Morgan','Functional Training',7],
            ];
            $insT = $connection->prepare('INSERT INTO trainers(name,specialization,experience) VALUES (?,?,?)');
            $trainerIds = [];
            foreach ($trainers as $trainer) { $insT->execute($trainer); $trainerIds[] = (int)$connection->lastInsertId(); }
            $classes = [
                ['Yoga', $trainerIds[0],15,60], ['Pilates',$trainerIds[1],12,50],
                ['Swimming',$trainerIds[2],10,45], ['Stretching',$trainerIds[1],15,45],
                ['Functional Training',$trainerIds[3],12,60], ['Aerobics',$trainerIds[0],20,50],
            ];
            $insC = $connection->prepare('INSERT INTO classes(name,trainer_id,capacity,duration) VALUES (?,?,?,?)');
            $classIds = [];
            foreach ($classes as $class) { $insC->execute($class); $classIds[] = (int)$connection->lastInsertId(); }
            $entries = [
                1=>[[0,'08:00'],[1,'10:00'],[2,'12:00'],[4,'17:00'],[5,'19:00']],
                2=>[[3,'08:00'],[2,'10:00'],[0,'12:00'],[1,'17:00'],[4,'19:00']],
                3=>[[0,'08:00'],[5,'10:00'],[1,'12:00'],[2,'17:00'],[3,'19:00']],
                4=>[[4,'08:00'],[0,'10:00'],[2,'12:00'],[5,'17:00'],[1,'19:00']],
                5=>[[3,'08:00'],[1,'10:00'],[4,'12:00'],[0,'17:00'],[5,'19:00']],
                6=>[[0,'09:00'],[2,'11:00'],[4,'13:00'],[5,'16:00']],
                7=>[[3,'09:00'],[0,'11:00'],[1,'13:00']],
            ];
            $insS = $connection->prepare('INSERT INTO schedule(class_id,weekday,start_time,room) VALUES (?,?,?,?)');
            foreach ($entries as $day=>$times) foreach ($times as [$ix,$time]) {
                $insS->execute([$classIds[$ix],$day,$time,'Studio '.($ix+1)]);
            }
        }
        $connection->prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('demo_schedule_initialized','1')")->execute();
        $connection->commit();
    } catch (Throwable $e) { $connection->rollBack(); throw $e; }
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('form_club_session');
    session_set_cookie_params([
        'httponly' => true,
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'samesite' => 'Lax',
        'path' => '/',
    ]);
    session_start();
    if (isset($_SESSION['last_activity']) && time() - $_SESSION['last_activity'] > 1800) {
        unset($_SESSION['user_id']);
        session_regenerate_id(true);
    }
    $_SESSION['last_activity'] = time();
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

function current_user(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $query = database()->prepare('SELECT id, name, email, role FROM users WHERE id = ?');
    $query->execute([$_SESSION['user_id']]);
    return $query->fetch() ?: null;
}

function is_admin(): bool
{
    return (current_user()['role'] ?? '') === 'admin';
}

function escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function csrf_valid(?string $token): bool
{
    return is_string($token) && hash_equals($_SESSION['csrf'], $token);
}

function throttle(string $action, int $limit, int $seconds): bool
{
    // Persist by IP so clearing cookies cannot bypass the limit.
    $key = hash('sha256', $action . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'cli'));
    $connection = database();
    $connection->beginTransaction();
    $connection->prepare('DELETE FROM rate_limits WHERE started_at < ?')->execute([time() - 3600]);
    $query = $connection->prepare('SELECT attempts, started_at FROM rate_limits WHERE key = ?');
    $query->execute([$key]);
    $record = $query->fetch();
    if (!$record || time() - $record['started_at'] >= $seconds) {
        $connection->prepare('INSERT OR REPLACE INTO rate_limits (key, attempts, started_at) VALUES (?, 1, ?)')->execute([$key, time()]);
        $connection->commit();
        return true;
    }
    $connection->prepare('UPDATE rate_limits SET attempts = attempts + 1 WHERE key = ?')->execute([$key]);
    $connection->commit();
    return $record['attempts'] < $limit;
}

