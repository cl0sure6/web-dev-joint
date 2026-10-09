<?php

declare(strict_types=1);

require dirname(__DIR__) . '/backend/bootstrap.php';
start_session();
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
if (!is_admin()) {
    header('Location: login.php');
    exit;
}
$user = current_user();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="<?= escape($_SESSION['csrf']) ?>">
    <title>Club administration — FORM</title>
    <link rel="stylesheet" href="../style.css">
    <link rel="stylesheet" href="style.css">
    <script src="script.js" defer></script>
</head>
<body class="admin-page">
    <a class="skip-link" href="#admin-content">Skip to content</a>
    <aside class="admin-sidebar">
        <a class="logo" href="../index.html"><span class="logo-mark" aria-hidden="true">ƒ</span> FORM<span class="logo-caption">CLUB OPERATIONS</span></a>
        <p class="sidebar-label">WORKSPACE</p>
        <nav class="admin-nav" aria-label="Administration">
            <a href="#overview" aria-current="page"><span>01</span> Overview</a>
            <a href="#trainers"><span>02</span> Trainers</a>
            <a href="#classes"><span>03</span> Classes</a>
            <a href="#schedule"><span>04</span> Schedule</a>
            <a href="#memberships"><span>05</span> Memberships</a>
            <a href="#users"><span>06</span> Members & staff</a>
            <a href="#bookings"><span>07</span> Bookings</a>
            <a href="#news"><span>08</span> News & events</a>
            <a href="#reviews"><span>09</span> Reviews</a>
            <a href="#faqs"><span>10</span> FAQ</a>
            <a href="#messages"><span>11</span> Inbox</a>
            <a href="#settings"><span>12</span> Club information</a>
        </nav>
        <div class="sidebar-footer">
            <span class="staff-avatar" aria-hidden="true"><?= escape(substr($user['name'], 0, 1)) ?></span>
            <div><strong><?= escape($user['name']) ?></strong><span>Administrator</span></div>
            <form method="post" action="logout.php">
                <input type="hidden" name="csrf" value="<?= escape($_SESSION['csrf']) ?>">
                <button type="submit" class="text-button">Sign out</button>
            </form>
        </div>
    </aside>
    <main id="admin-content" class="admin-main">
        <header class="admin-topbar"><span>FORM / ADMINISTRATION</span><a href="../index.html" target="_blank" rel="noopener">View website ↗</a></header>
        <div class="admin-heading"><div><p class="eyebrow" id="admin-eyebrow">YOUR CLUB, AT A GLANCE</p><h1 id="admin-title">The daily overview.</h1><p id="admin-description">A clear picture of what is happening at the club.</p></div><button type="button" id="add-record" class="button" hidden>+ Add record</button></div>
        <p id="admin-status" class="form-status" role="status" aria-live="polite"></p>
        <div id="admin-view" aria-busy="true"><p class="empty-state">Loading your club…</p></div>
    </main>
    <dialog id="record-dialog" class="record-dialog" aria-labelledby="dialog-title">
        <header><h2 id="dialog-title">Add record</h2><button type="button" id="close-dialog" class="icon-button" aria-label="Close dialog">×</button></header>
        <form id="record-form" class="stacked-form">
            <div id="record-fields"></div>
            <p id="dialog-status" class="form-status" role="status" aria-live="polite"></p>
            <div class="dialog-actions"><button type="button" id="cancel-dialog" class="button button--outline">Cancel</button><button type="submit" class="button">Save changes ↗</button></div>
        </form>
    </dialog>
    <dialog id="delete-dialog" class="record-dialog" aria-labelledby="delete-title">
        <h2 id="delete-title">Delete this record?</h2>
        <p id="delete-description">This will permanently remove the record from the club.</p>
        <p id="delete-status" class="form-status" role="status"></p>
        <div class="dialog-actions"><button type="button" id="cancel-delete" class="button button--outline">Keep record</button><button type="button" id="confirm-delete" class="button button--danger">Delete record</button></div>
    </dialog>
</body>
</html>
