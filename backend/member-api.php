<?php
declare(strict_types=1);

function member_required(): array
{
    $user = current_user();
    if (!$user) respond(['error' => 'Please sign in to continue.'], 401);
    if ($user['role'] !== 'user') respond(['error' => 'This area is for club members. Please use staff access.'], 403);
    return $user;
}

function member_password(array $input, string $key = 'password'): string
{
    $value = $input[$key] ?? null;
    if (!is_string($value) || strlen($value) < 12 || strlen($value) > 72) {
        respond(['error' => 'Use a password between 12 and 72 bytes (at least 12 characters for an English password).'], 422);
    }
    return $value;
}

function member_email(array $input): string
{
    $email = strtolower(text_field($input, 'email', 200));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) respond(['error' => 'Enter a valid email address.'], 422);
    return $email;
}

function member_signed_in(array $user): void
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $_SESSION['password_stamp'] = hash('sha256', $user['password_hash']);
}

function member_date(array $input): DateTimeImmutable
{
    $date = new DateTimeImmutable(date_field($input, 'date'));
    if ($date < new DateTimeImmutable('today') || $date > new DateTimeImmutable('today +28 days')) {
        respond(['error' => 'Choose a date within the next 28 days.'], 422);
    }
    return $date;
}

if ($method === 'GET' && $action === 'member-data') {
    $member = member_required();
    $query = $connection->prepare('SELECT b.id, b.date, b.status, s.start_time, s.room, c.name, c.duration, t.name AS trainer FROM bookings b JOIN schedule s ON s.id=b.schedule_id JOIN classes c ON c.id=s.class_id LEFT JOIN trainers t ON t.id=c.trainer_id WHERE b.user_id=? ORDER BY b.date DESC, s.start_time DESC');
    $query->execute([$member['id']]);
    $bookings = $query->fetchAll();
    foreach ($bookings as &$booking) {
        $booking['upcoming'] = $booking['date'] . ' ' . $booking['start_time'] > date('Y-m-d H:i');
    }
    unset($booking);
    $query = $connection->prepare("SELECT um.*, m.name FROM user_memberships um JOIN memberships m ON m.id=um.membership_id WHERE um.user_id=? ORDER BY CASE WHEN um.status='active' AND um.starts_on<=? AND um.ends_on>=? THEN 0 ELSE 1 END, um.ends_on DESC LIMIT 1");
    $query->execute([$member['id'], date('Y-m-d'), date('Y-m-d')]);
    $plan = $query->fetch() ?: null;
    if ($plan && $plan['status'] === 'active') {
        $plan['status'] = $plan['starts_on'] > date('Y-m-d') ? 'upcoming' : ($plan['ends_on'] < date('Y-m-d') ? 'expired' : 'active');
    }
    respond(['user' => $member, 'bookings' => $bookings, 'membership' => $plan, 'today' => date('Y-m-d'), 'last_date' => date('Y-m-d', strtotime('+28 days'))]);
}

if ($method === 'GET' && $action === 'member-schedule') {
    $member = member_required();
    $date = member_date($_GET);
    $query = $connection->prepare("SELECT s.id, s.start_time, s.room, c.name, c.description, c.duration, c.capacity, t.name AS trainer,
        (SELECT COUNT(*) FROM bookings b WHERE b.schedule_id=s.id AND b.date=? AND b.status='confirmed') +
        (SELECT COUNT(*) FROM guest_bookings g WHERE g.schedule_id=s.id AND g.date=? AND g.status='confirmed') AS booked,
        (SELECT b.id FROM bookings b WHERE b.schedule_id=s.id AND b.date=? AND b.user_id=? AND b.status='confirmed') AS booking_id
        FROM schedule s JOIN classes c ON c.id=s.class_id LEFT JOIN trainers t ON t.id=c.trainer_id WHERE s.weekday=? ORDER BY s.start_time, s.id");
    $query->execute([$date->format('Y-m-d'), $date->format('Y-m-d'), $date->format('Y-m-d'), $member['id'], (int) $date->format('N')]);
    $classes = $query->fetchAll();
    foreach ($classes as &$class) $class['started'] = $date->format('Y-m-d') . ' ' . $class['start_time'] <= date('Y-m-d H:i');
    unset($class);
    respond(['classes' => $classes]);
}

function member_action(string $action, array $input, PDO $db): void
{
    if (in_array($action, ['member-register', 'member-login'], true)) {
        if (!throttle($action, $action === 'member-register' ? 5 : 10, 600)) respond(['error' => 'Too many attempts. Please try again in 10 minutes.'], 429);
        $email = member_email($input);
        if ($action === 'member-register') {
            $name = text_field($input, 'name', 100);
            $password = member_password($input);
            if ($password !== ($input['password_confirmation'] ?? null)) respond(['error' => 'The passwords do not match.'], 422);
            try {
                $db->prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'user')")->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
            } catch (PDOException $error) {
                if (str_contains($error->getMessage(), 'UNIQUE')) respond(['error' => 'An account with this email already exists. Please sign in.'], 409);
                throw $error;
            }
        }
        $query = $db->prepare('SELECT * FROM users WHERE email=?');
        $query->execute([$email]);
        $user = $query->fetch();
        $password = is_string($input['password'] ?? null) ? $input['password'] : '';
        $verified = password_verify($password, $user['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
        if (!$verified || !$user || $user['role'] !== 'user') respond(['error' => 'Email or password is incorrect. Staff should use staff access.'], 401);
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $user['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
            $db->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([$user['password_hash'], $user['id']]);
        }
        member_signed_in($user);
        respond(['message' => 'Welcome to FORM.', 'csrf' => $_SESSION['csrf']]);
    }
    if (!in_array($action, ['member-profile', 'member-password', 'member-book', 'member-cancel'], true)) return;
    $member = member_required();
    if ($action === 'member-profile' || $action === 'member-password') {
        if (!throttle('member-credentials', 10, 600)) respond(['error' => 'Too many attempts. Please try again in 10 minutes.'], 429);
        $query = $db->prepare('SELECT password_hash FROM users WHERE id=?');
        $query->execute([$member['id']]);
        $hash = $query->fetchColumn();
        $current = is_string($input['current_password'] ?? null) ? $input['current_password'] : '';
        if (!password_verify($current, $hash)) respond(['error' => 'Your current password is incorrect.'], 422);
        if ($action === 'member-profile') {
            $name = text_field($input, 'name', 100);
            $email = member_email($input);
            try {
                $db->prepare('UPDATE users SET name=?,email=? WHERE id=?')->execute([$name, $email, $member['id']]);
            } catch (PDOException $error) {
                if (str_contains($error->getMessage(), 'UNIQUE')) respond(['error' => 'This email is already used by another account.'], 409);
                throw $error;
            }
            respond(['message' => 'Your profile has been updated.']);
        }
        $password = member_password($input, 'new_password');
        if ($password !== ($input['password_confirmation'] ?? null)) respond(['error' => 'The passwords do not match.'], 422);
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $db->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([$hash, $member['id']]);
        member_signed_in(['id' => $member['id'], 'password_hash' => $hash]);
        respond(['message' => 'Your password has been updated. Other member sessions have been signed out.', 'csrf' => $_SESSION['csrf']]);
    }
    if ($action === 'member-cancel') {
        $id = number_field($input, 'id', 1, PHP_INT_MAX);
        $query = $db->prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND user_id=? AND status='confirmed' AND date || ' ' || (SELECT start_time FROM schedule WHERE id=bookings.schedule_id)>?");
        $query->execute([$id, $member['id'], date('Y-m-d H:i')]);
        if (!$query->rowCount()) respond(['error' => 'This booking cannot be cancelled. It may have started or already been cancelled.'], 409);
        respond(['message' => 'Your booking has been cancelled.']);
    }
    $date = member_date($input);
    $id = number_field($input, 'schedule_id', 1, PHP_INT_MAX);
    // Acquire the write lock before checking capacity so concurrent requests cannot overbook.
    $db->exec('BEGIN IMMEDIATE');
    try {
        $query = $db->prepare('SELECT s.*, c.capacity FROM schedule s JOIN classes c ON c.id=s.class_id WHERE s.id=?');
        $query->execute([$id]);
        $slot = $query->fetch();
        $error = null;
        if (!$slot || (int) $slot['weekday'] !== (int) $date->format('N')) $error = 'This class does not run on the selected date.';
        elseif ($date->format('Y-m-d') . ' ' . $slot['start_time'] <= date('Y-m-d H:i')) $error = 'This class has already started.';
        $query = $db->prepare("SELECT
            (SELECT COUNT(*) FROM bookings WHERE schedule_id=? AND date=? AND status='confirmed') +
            (SELECT COUNT(*) FROM guest_bookings WHERE schedule_id=? AND date=? AND status='confirmed')");
        $query->execute([$id, $date->format('Y-m-d'), $id, $date->format('Y-m-d')]);
        if (!$error && (int) $query->fetchColumn() >= (int) $slot['capacity']) $error = 'This class is full. Please choose another session.';
        if ($error) {
            $db->exec('ROLLBACK');
            respond(['error' => $error], 409);
        }
        $query = $db->prepare("INSERT INTO bookings(user_id,schedule_id,date,status) VALUES(?,?,?,'confirmed') ON CONFLICT(user_id,schedule_id,date) DO UPDATE SET status='confirmed'");
        $query->execute([$member['id'], $id, $date->format('Y-m-d')]);
        $db->exec('COMMIT');
    } catch (Throwable $error) {
        $db->exec('ROLLBACK');
        throw $error;
    }
    respond(['message' => 'You are booked in. See you at the club!']);
}
