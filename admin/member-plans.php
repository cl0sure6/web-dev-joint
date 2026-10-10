<?php
declare(strict_types=1);
require dirname(__DIR__) . '/backend/bootstrap.php';
start_session();
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
if (!is_admin()) { header('Location: login.php'); exit; }
$db = database();
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!csrf_valid(is_string($_POST['csrf'] ?? null) ? $_POST['csrf'] : null)) throw new RuntimeException('Your form expired. Refresh the page and try again.');
        if (($_POST['action'] ?? '') === 'cancel') {
            $id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
            if (!$id || $id < 1) throw new RuntimeException('Choose a valid membership.');
            $db->prepare("UPDATE user_memberships SET status='cancelled' WHERE id=?")->execute([$id]);
        } else {
            $userId = filter_var($_POST['user_id'] ?? null, FILTER_VALIDATE_INT);
            $planId = filter_var($_POST['membership_id'] ?? null, FILTER_VALIDATE_INT);
            $raw = is_string($_POST['starts_on'] ?? null) ? $_POST['starts_on'] : '';
            $start = DateTimeImmutable::createFromFormat('!Y-m-d', $raw);
            if (!$start || $start->format('Y-m-d') !== $raw) throw new RuntimeException('Enter a valid start date.');
            $query = $db->prepare("SELECT id FROM users WHERE id=? AND role='user'");
            $query->execute([$userId]);
            if (!$query->fetch()) throw new RuntimeException('Choose a member.');
            $query = $db->prepare('SELECT * FROM memberships WHERE id=?');
            $query->execute([$planId]);
            $plan = $query->fetch();
            if (!$plan) throw new RuntimeException('Choose a membership plan.');
            $end = $start->modify('+' . ((int)$plan['duration_days'] - 1) . ' days')->format('Y-m-d');
            $db->exec('BEGIN IMMEDIATE');
            try {
                $query = $db->prepare("SELECT id FROM user_memberships WHERE user_id=? AND status='active' AND starts_on<=? AND ends_on>=?");
                $query->execute([$userId, $end, $raw]);
                if ($query->fetch()) throw new RuntimeException('This member already has a membership covering these dates. Choose a later date or cancel the existing membership.');
                $db->prepare('INSERT INTO user_memberships(user_id,membership_id,starts_on,ends_on) VALUES(?,?,?,?)')->execute([$userId,$planId,$raw,$end]);
                $db->exec('COMMIT');
            } catch (Throwable $exception) { $db->exec('ROLLBACK'); throw $exception; }
        }
        $_SESSION['plan_message'] = 'Member membership updated.';
        header('Location: member-plans.php'); exit;
    } catch (PDOException $exception) { error_log($exception->getMessage()); $error = 'Unable to save the membership. Please try again.'; }
    catch (RuntimeException $exception) { $error = $exception->getMessage(); }
}
$members = $db->query("SELECT id,name,email FROM users WHERE role='user' ORDER BY name")->fetchAll();
$plans = $db->query('SELECT id,name,duration_days FROM memberships ORDER BY id')->fetchAll();
$assigned = $db->query('SELECT um.*, u.name AS member, u.email, m.name AS plan FROM user_memberships um JOIN users u ON u.id=um.user_id JOIN memberships m ON m.id=um.membership_id ORDER BY um.id DESC')->fetchAll();
$message = $_SESSION['plan_message'] ?? '';
unset($_SESSION['plan_message']);
?>
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Member memberships — FORM</title><link rel="stylesheet" href="../style.css"><link rel="stylesheet" href="../account/style.css"></head><body>
<header class="member-header"><a class="logo" href="index.php">ƒ FORM</a><a href="index.php#users" class="text-link">Back to administration ↗</a></header>
<main class="member-main" style="max-width:1100px;margin:auto"><p class="eyebrow">CLUB OPERATIONS</p><h1>Member <em>memberships.</em></h1><p class="member-lead">Assign a plan after confirming the member's arrangements with the club.</p>
<?php if ($error): ?><p class="form-status form-status--error" role="alert"><?= escape($error) ?></p><?php endif; ?>
<?php if ($message): ?><p class="form-status" role="status"><?= escape($message) ?></p><?php endif; ?>
<div class="profile-grid"><form method="post" class="stacked-form member-card"><h2>Assign a membership</h2><input type="hidden" name="csrf" value="<?= escape($_SESSION['csrf']) ?>"><label>Member<select name="user_id" required><option value="">Choose a member</option><?php foreach($members as $member): ?><option value="<?= (int)$member['id'] ?>"><?= escape($member['name'] . ' — ' . $member['email']) ?></option><?php endforeach; ?></select></label><label>Plan<select name="membership_id" required><option value="">Choose a plan</option><?php foreach($plans as $plan): ?><option value="<?= (int)$plan['id'] ?>"><?= escape($plan['name']) ?> · <?= (int)$plan['duration_days'] ?> days</option><?php endforeach; ?></select></label><label>Start date<input name="starts_on" type="date" value="<?= date('Y-m-d') ?>" required></label><p class="field-hint">The end date is calculated from the plan duration, including the start date.</p><button class="button" type="submit" <?= !$members || !$plans ? 'disabled' : '' ?>>Assign membership ↗</button><?php if(!$members): ?><p class="field-hint">Members will appear after they register on the website.</p><?php endif; ?></form><div><h2 class="list-heading">Assigned memberships</h2><?php if(!$assigned): ?><p class="member-empty">No memberships have been assigned yet.</p><?php endif; ?><?php foreach($assigned as $row): $label = $row['status'] === 'cancelled' ? 'Cancelled' : ($row['ends_on'] < date('Y-m-d') ? 'Expired' : ($row['starts_on'] > date('Y-m-d') ? 'Upcoming' : 'Active')); ?><article class="member-row"><div><h3><?= escape($row['member']) ?></h3><p><?= escape($row['email']) ?></p><p><?= escape($row['plan']) ?> · <?= escape($label) ?></p><p><?= escape($row['starts_on']) ?> – <?= escape($row['ends_on']) ?></p></div><?php if($row['status'] === 'active' && $row['ends_on'] >= date('Y-m-d')): ?><form method="post"><input type="hidden" name="csrf" value="<?= escape($_SESSION['csrf']) ?>"><input type="hidden" name="action" value="cancel"><input type="hidden" name="id" value="<?= (int)$row['id'] ?>"><button class="button button--outline" type="submit">Cancel membership</button></form><?php endif; ?></article><?php endforeach; ?></div></div></main></body></html>
