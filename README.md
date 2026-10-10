# web-dev-joint

# The joint project on the Wed Development subject, with topic 7 chosen (Fitness Club Management).

## Run locally

Use PHP 8.1+ with PDO SQLite enabled. From this directory:

```powershell
& "D:\php\php.exe" -S 127.0.0.1:8000 router.php
```

Open http://127.0.0.1:8000. SQLite tables are created automatically; existing data is preserved.

## Member accounts

- Choose **Sign in** on the homepage, then **Create an account**. Registration creates a member (`user`) role only.
- `/account/index.php` provides an overview, date-based schedule, upcoming/past bookings, profile editing and password changes.
- Passwords require 12–72 bytes. Profile changes require the current password. Password changes invalidate other member sessions.
- Members can book classes up to 28 days ahead and cancel before the start time, using the configured club timezone. Capacity checks run under a SQLite write lock. Cancelled bookings can be booked again.
- Classes are open to registered members regardless of membership status. Membership information is displayed separately; this project does not process online payments.
- The admin creates trainers, classes and weekly schedules in the existing administration panel. New installations show empty states until records are added; no demo bookings or members are inserted.
- **Assign member memberships** in the admin sidebar opens `/admin/member-plans.php`. Select a member, plan and start date. The end date uses the plan duration; overlapping active assignments are rejected.
- Reviews remain subject to administrator approval.

Create an administrator from the terminal:

```powershell
& "D:\php\php.exe" scripts/create-admin.php admin@example.com "Club administrator"
```

The script prompts for the password. Open `/admin/login.php` to sign in.

## Verify member flows

The integration test needs Node.js, PHP CLI and PHP CGI with PDO SQLite. It creates a fresh database under `tests/.runtime/` and never uses the club database.

```powershell
$env:PHP_BINARY = 'D:\php\php.exe'
$env:PHP_CGI_BINARY = 'D:\php\php-cgi.exe'
node tests/member-integration.cjs
```

Checks cover authentication, member-only access, CSRF, date and capacity validation, booking ownership, cancellation/rebooking, profile updates, password/session invalidation, reviews, membership assignment and sign out.
