<?php

declare(strict_types=1);

require __DIR__ . '/backend/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function text_field(array $input, string $key, int $maximum = 200, bool $required = true): string
{
    if (!isset($input[$key]) || !is_string($input[$key])) {
        if (!$required && !isset($input[$key])) {
            return '';
        }
        respond(['error' => 'Please complete ' . str_replace('_', ' ', $key) . '.'], 422);
    }
    $value = trim($input[$key]);
    if (($required && $value === '') || strlen($value) > $maximum) {
        respond(['error' => 'Check ' . str_replace('_', ' ', $key) . ' (maximum ' . $maximum . ' characters).'], 422);
    }
    return $value;
}

function number_field(array $input, string $key, int $minimum, int $maximum): int
{
    $value = filter_var($input[$key] ?? null, FILTER_VALIDATE_INT);
    if ($value === false || $value === null || $value < $minimum || $value > $maximum) {
        respond(['error' => 'Check ' . str_replace('_', ' ', $key) . '.'], 422);
    }
    return $value;
}

function date_field(array $input, string $key): string
{
    $value = text_field($input, $key, 10);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) {
        respond(['error' => 'Enter a valid date.'], 422);
    }
    return $value;
}

function reference_field(array $input, string $key, string $table, bool $optional = false): ?int
{
    if ($optional && empty($input[$key])) {
        return null;
    }
    $value = number_field($input, $key, 1, PHP_INT_MAX);
    $query = database()->prepare("SELECT id FROM $table WHERE id = ?");
    $query->execute([$value]);
    if (!$query->fetch()) {
        respond(['error' => 'The selected record no longer exists. Refresh and try again.'], 422);
    }
    return $value;
}

try {
    start_session();
    $connection = database();
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';
    if ($method === 'GET' && $action === 'session') {
        respond(['user' => current_user(), 'csrf' => $_SESSION['csrf']]);
    }
    require __DIR__ . '/backend/member-api.php';
    if ($method === 'GET' && $action === 'content') {
        $settings = [];
        foreach ($connection->query("SELECT key, value FROM settings WHERE key != 'initialized'") as $setting) {
            $settings[$setting['key']] = $setting['value'];
        }
        $query = $connection->prepare('SELECT * FROM news WHERE published_on <= ? ORDER BY published_on DESC, id DESC');
        $query->execute([date('Y-m-d')]);
        $faqs = $connection->query('SELECT * FROM faqs ORDER BY position, id')->fetchAll();
        // Refresh the old default copy without overwriting administrator-written answers.
        foreach ($faqs as &$faq) {
            if ($faq['question'] === 'Can I cancel a class?' && in_array($faq['answer'], [
                'Cancellation options will be available in your member account once online booking opens. Until then, contact the club to change your plans.',
                'Yes. Open My bookings in your member account and cancel before the class starts. Your spot will become available to another member.',
                'To cancel a confirmed reservation, contact the club team and provide your booking reference.',
            ], true)) {
                $faq['answer'] = 'For member bookings, open My bookings in your account and cancel before the class starts. For guest reservations, contact the club team with your booking reference.';
            }
        }
        unset($faq);
        respond([
            'settings' => $settings,
            'memberships' => $connection->query('SELECT * FROM memberships ORDER BY id')->fetchAll(),
            'faqs' => $faqs,
            'news' => $query->fetchAll(),
            'reviews' => $connection->query('SELECT reviews.id, users.name, reviews.rating, reviews.comment, reviews.created_at FROM reviews JOIN users ON users.id = reviews.user_id WHERE published = 1 ORDER BY reviews.id DESC LIMIT 12')->fetchAll(),
        ]);
    }
    if ($method === 'GET' && $action === 'public-schedule') {
        $date = date_field($_GET, 'date');
        $requested = new DateTimeImmutable($date);
        $today = new DateTimeImmutable('today');
        if ($requested < $today || $requested > $today->modify('+30 days')) {
            respond(['error' => 'Choose a date within the next 30 days.'], 422);
        }
        $query = $connection->prepare("SELECT s.id, s.start_time, s.room, c.name AS class_name,
               c.capacity, c.duration, COALESCE(t.name, 'To be announced') AS coach,
               c.id AS class_id,
               (SELECT COUNT(*) FROM bookings b WHERE b.schedule_id=s.id AND b.date=? AND b.status='confirmed') +
               (SELECT COUNT(*) FROM guest_bookings g WHERE g.schedule_id=s.id AND g.date=? AND g.status='confirmed') AS reserved
               FROM schedule s JOIN classes c ON c.id=s.class_id
               LEFT JOIN trainers t ON t.id=c.trainer_id WHERE s.weekday=? ORDER BY s.start_time, s.id");
        $query->execute([$date,$date,(int)$requested->format('N')]);
        $rows = $query->fetchAll();
        foreach ($rows as &$row) {
            $row['available'] = max(0, (int)$row['capacity'] - (int)$row['reserved']);
        }
        unset($row);
        respond(['date'=>$date,'sessions'=>$rows]);
    }
    if ($method === 'GET' && $action === 'admin-data') {
        if (!is_admin()) {
            respond(['error' => 'Please sign in as an administrator.'], 401);
        }
        $data = [];
        foreach (['trainers', 'classes', 'schedule', 'memberships', 'faqs', 'news', 'messages'] as $table) {
            $data[$table] = $connection->query("SELECT * FROM $table ORDER BY id DESC")->fetchAll();
        }
        $data['users'] = $connection->query('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC')->fetchAll();
        $data['reviews'] = $connection->query('SELECT reviews.*, users.name FROM reviews JOIN users ON users.id = reviews.user_id ORDER BY reviews.id DESC')->fetchAll();
        $data['bookings'] = $connection->query('SELECT bookings.*, users.name AS member, classes.name AS class_name, schedule.start_time FROM bookings JOIN users ON users.id = bookings.user_id JOIN schedule ON schedule.id = bookings.schedule_id JOIN classes ON classes.id = schedule.class_id ORDER BY bookings.date DESC, schedule.start_time')->fetchAll();
        $guest = $connection->query("SELECT g.id, g.date, g.status, g.name AS member, g.email, g.phone, c.name AS class_name, s.start_time FROM guest_bookings g JOIN schedule s ON s.id=g.schedule_id JOIN classes c ON c.id=s.class_id ORDER BY g.date DESC, s.start_time")->fetchAll();
        $data['bookings'] = array_merge($data['bookings'], $guest);
        $data['settings'] = [];
        foreach ($connection->query("SELECT key, value FROM settings WHERE key != 'initialized'") as $setting) {
            $data['settings'][$setting['key']] = $setting['value'];
        }
        respond($data);
    }
    if ($method !== 'POST') {
        respond(['error' => 'Unknown endpoint or method.'], 404);
    }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 20000) {
        respond(['error' => 'The submitted content is too large.'], 413);
    }
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        respond(['error' => 'Invalid request.'], 400);
    }
    if (!csrf_valid($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
        respond(['error' => 'Your form expired. Refresh the page and try again.'], 403);
    }
    member_action($action, $input, $connection);
    if ($action === 'guest-book') {
        $name = text_field($input, 'name', 100);
        $email = strtolower(text_field($input, 'email', 200));
        $phone = text_field($input, 'phone', 30);
        $date = date_field($input, 'date');
        $scheduleId = number_field($input, 'schedule_id', 1, PHP_INT_MAX);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\+?[0-9 ()-]{6,30}$/', $phone)) {
            respond(['error'=>'Enter a valid email and phone number.'],422);
        }
        $sessionDate = new DateTimeImmutable($date);
        $now = new DateTimeImmutable('now');
        $today = new DateTimeImmutable('today');
        if ($sessionDate < $today || $sessionDate > $today->modify('+30 days')) {
            respond(['error'=>'Choose a date in the next 30 days.'],422);
        }
        if (!throttle('guest-book', 12, 600)) respond(['error'=>'Too many attempts. Try again later.'],429);
        $connection->exec('BEGIN IMMEDIATE');
        try {
            $q=$connection->prepare('SELECT s.weekday, s.start_time, c.capacity FROM schedule s JOIN classes c ON c.id=s.class_id WHERE s.id=?');
            $q->execute([$scheduleId]);
            $session=$q->fetch();
            if (!$session || (int)$session['weekday'] !== (int)$sessionDate->format('N')) {
                $connection->exec('ROLLBACK'); respond(['error'=>'This class is not scheduled on the selected date.'],422);
            }
            if (new DateTimeImmutable($date.' '.$session['start_time']) <= $now) {
                $connection->exec('ROLLBACK'); respond(['error'=>'Choose a future class.'],422);
            }
            $q=$connection->prepare("SELECT
              (SELECT COUNT(*) FROM bookings WHERE schedule_id=? AND date=? AND status='confirmed') +
              (SELECT COUNT(*) FROM guest_bookings WHERE schedule_id=? AND date=? AND status='confirmed')");
            $q->execute([$scheduleId,$date,$scheduleId,$date]);
            if ((int)$q->fetchColumn() >= (int)$session['capacity']) {
                $connection->exec('ROLLBACK'); respond(['error'=>'Sorry, this class is fully booked.'],409);
            }
            $q=$connection->prepare('INSERT INTO guest_bookings(schedule_id,date,name,email,phone) VALUES(?,?,?,?,?)');
            $q->execute([$scheduleId,$date,$name,$email,$phone]);
            $bookingId=(int)$connection->lastInsertId();
            $connection->exec('COMMIT');
            respond(['message'=>'Booking confirmed!','booking_id'=>$bookingId]);
        } catch (Throwable $e) {
            $connection->exec('ROLLBACK');
            if (str_contains($e->getMessage(),'UNIQUE constraint failed')) respond(['error'=>'This email is already booked for the selected class and date.'],409);
            throw $e;
        }
    }
    if ($action === 'contact') {
        $name = text_field($input, 'name', 100);
        $email = text_field($input, 'email', 200);
        $message = text_field($input, 'message', 4000);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respond(['error' => 'Enter a valid email address.'], 422);
        }
        if (!throttle('contact', 5, 600)) {
            respond(['error' => 'Too many messages. Please try again in 10 minutes.'], 429);
        }
        $connection->prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)')->execute([$name, $email, $message]);
        respond(['message' => 'Your message is with the club team. Thank you for getting in touch.']);
    }
    if ($action === 'review') {
        $user = current_user();
        if (!$user || $user['role'] !== 'user') {
            respond(['error' => 'Sign in to your member account to leave a review.'], 401);
        }
        $rating = number_field($input, 'rating', 1, 5);
        $comment = text_field($input, 'comment', 2000);
        if (!throttle('review', 3, 600)) {
            respond(['error' => 'Please wait before submitting another review.'], 429);
        }
        $connection->prepare('INSERT INTO reviews (user_id, rating, comment) VALUES (?, ?, ?)')->execute([$user['id'], $rating, $comment]);
        respond(['message' => 'Thank you. Your review will appear once the club team approves it.']);
    }
    if (!is_admin()) {
        respond(['error' => 'Please sign in as an administrator.'], 401);
    }
    if ($action === 'settings') {
        $settings = [];
        foreach (['club_name', 'tagline', 'about', 'history', 'opened', 'address', 'phone', 'email', 'map_url', 'weekday_hours', 'weekend_hours'] as $key) {
            $settings[$key] = text_field($input, $key, 2000, !in_array($key, ['phone', 'email', 'map_url'], true));
        }
        if ($settings['email'] !== '' && !filter_var($settings['email'], FILTER_VALIDATE_EMAIL)) {
            respond(['error' => 'Enter a valid club email address.'], 422);
        }
        if ($settings['phone'] !== '' && !preg_match('/^\+?[0-9 ()-]{5,30}$/', $settings['phone'])) {
            respond(['error' => 'Enter a valid phone number.'], 422);
        }
        if ($settings['map_url'] !== '' && (!filter_var($settings['map_url'], FILTER_VALIDATE_URL) || parse_url($settings['map_url'], PHP_URL_SCHEME) !== 'https')) {
            respond(['error' => 'Use a valid HTTPS map link.'], 422);
        }
        $connection->beginTransaction();
        $query = $connection->prepare('UPDATE settings SET value = ? WHERE key = ?');
        foreach ($settings as $key => $value) {
            $query->execute([$value, $key]);
        }
        $connection->commit();
        respond(['message' => 'Club information saved.']);
    }
    $table = $input['table'] ?? '';
    $allowed = ['trainers', 'classes', 'schedule', 'memberships', 'faqs', 'news', 'reviews', 'messages'];
    if (!in_array($table, $allowed, true) || !in_array($action, ['save', 'delete'], true)) {
        respond(['error' => 'Unknown admin action.'], 400);
    }
    $id = number_field($input, 'id', 0, PHP_INT_MAX);
    if ($id > 0) {
        $query = $connection->prepare("SELECT id FROM $table WHERE id = ?");
        $query->execute([$id]);
        if (!$query->fetch()) {
            respond(['error' => 'This record no longer exists. Refresh and try again.'], 404);
        }
    }
    if ($action === 'delete') {
        if ($id === 0) {
            respond(['error' => 'Choose a record to delete.'], 422);
        }
        $connection->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
        respond(['message' => 'Record deleted.']);
    }
    $values = [];
    switch ($table) {
        case 'trainers':
            $values = [
                'name' => text_field($input, 'name', 100),
                'specialization' => text_field($input, 'specialization'),
                'experience' => number_field($input, 'experience', 0, 80),
                'education' => text_field($input, 'education', 1000, false),
            ];
            break;
        case 'classes':
            $values = [
                'name' => text_field($input, 'name', 100),
                'description' => text_field($input, 'description', 2000, false),
                'trainer_id' => reference_field($input, 'trainer_id', 'trainers', true),
                'capacity' => number_field($input, 'capacity', 1, 500),
                'duration' => number_field($input, 'duration', 5, 300),
            ];
            break;
        case 'schedule':
            $values = [
                'class_id' => reference_field($input, 'class_id', 'classes'),
                'weekday' => number_field($input, 'weekday', 1, 7),
                'start_time' => text_field($input, 'start_time', 5),
                'room' => text_field($input, 'room', 100),
            ];
            if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $values['start_time'])) {
                respond(['error' => 'Enter a valid class time.'], 422);
            }
            break;
        case 'memberships':
            $values = [
                'slug' => text_field($input, 'slug', 60),
                'name' => text_field($input, 'name', 100),
                'description' => text_field($input, 'description', 2000),
                'price' => number_field($input, 'price', 0, 100000000),
                'duration_days' => number_field($input, 'duration_days', 1, 3650),
                'featured' => number_field($input, 'featured', 0, 1),
            ];
            if (!preg_match('/^[a-z0-9-]+$/', $values['slug'])) {
                respond(['error' => 'Use lowercase letters, numbers, and hyphens for the plan code.'], 422);
            }
            break;
        case 'faqs':
            $values = [
                'question' => text_field($input, 'question', 300),
                'answer' => text_field($input, 'answer', 3000),
                'position' => number_field($input, 'position', 0, 1000),
            ];
            break;
        case 'news':
            $values = [
                'title' => text_field($input, 'title', 200),
                'category' => text_field($input, 'category', 60),
                'body' => text_field($input, 'body', 4000),
                'published_on' => date_field($input, 'published_on'),
            ];
            break;
        case 'reviews':
        case 'messages':
            if ($id === 0) {
                respond(['error' => 'Choose an existing record.'], 422);
            }
            $key = $table === 'reviews' ? 'published' : 'is_read';
            $values = [$key => number_field($input, $key, 0, 1)];
            break;
    }
    $columns = array_keys($values);
    if ($id > 0) {
        $assignments = implode(', ', array_map(fn($column) => "$column = ?", $columns));
        $connection->prepare("UPDATE $table SET $assignments WHERE id = ?")->execute([...array_values($values), $id]);
    } else {
        $names = implode(', ', $columns);
        $placeholders = implode(', ', array_fill(0, count($columns), '?'));
        $connection->prepare("INSERT INTO $table ($names) VALUES ($placeholders)")->execute(array_values($values));
    }
    respond(['message' => 'Changes saved.']);
} catch (PDOException $error) {
    if (isset($connection) && $connection->inTransaction()) {
        $connection->rollBack();
    }
    error_log($error->getMessage());
    if (str_contains($error->getMessage(), 'FOREIGN KEY constraint failed')) {
        respond(['error' => 'This record is used by a schedule or booking. Remove the linked records first.'], 409);
    }
    if (str_contains($error->getMessage(), 'UNIQUE constraint failed')) {
        respond(['error' => 'This plan code already exists. Choose another code.'], 409);
    }
    respond(['error' => 'The database is unavailable. Please try again shortly.'], 503);
} catch (Throwable $error) {
    error_log($error->getMessage());
    respond(['error' => 'The service is unavailable. Please try again shortly.'], 503);
}
