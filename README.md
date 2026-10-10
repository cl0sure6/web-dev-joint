# FORM Fitness Club

A joint Web Development project for Fitness Club Management.

## Requirements

- PHP 8.1+ with `pdo_pgsql` enabled.
- PostgreSQL 14+.
- Node.js and PHP CGI for integration tests.

The website uses PostgreSQL exclusively. SQLite is used only by the optional one-time import utility.

## Create a new local database

Stop the PHP web server with Ctrl+C. From the project directory, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-postgres.ps1
```

Enter your PostgreSQL `postgres` password at the hidden prompt. The script creates `form_club`, a dedicated application role, and an ignored `config.local.php` containing its generated credentials. It copies and imports an existing `var/club.sqlite`, preserving account password hashes and record IDs. The original database is retained. Keep the server stopped until setup finishes.

The default PHP path is `D:\php\php.exe`. Optional parameters: `-Php`, `-Database`, `-Server`, `-Port`, and `-AdminUser`. Existing databases and local configuration are never overwritten. Do not commit `config.local.php` or database backups.

If import fails after database creation, resolve the reported error and rerun `scripts/migrate-sqlite.php` with the printed backup path. Do not initialize sample data before retrying the import.

## Use an existing PostgreSQL database

Copy `config.example.php` to `config.local.php` and enter your connection settings. Initialize a new empty database:

```powershell
& 'D:\php\php.exe' scripts/init-db.php
```

Alternatively, import an old database into an empty target before initialization:

```powershell
& 'D:\php\php.exe' scripts/migrate-sqlite.php 'path\to\backup.sqlite'
```

The importer requires `pdo_sqlite`. It refuses to replace existing target records. Initialization creates the tables and default club content without creating member accounts.

Connection settings can be overridden with `CLUB_DB_HOST`, `CLUB_DB_PORT`, `CLUB_DB_NAME`, `CLUB_DB_USER`, `CLUB_DB_PASSWORD`, and `CLUB_DB_SSLMODE`. `CLUB_DB_SCHEMA` defaults to `public` and is used to isolate integration tests.

## Run locally

```powershell
& 'D:\php\php.exe' -S 127.0.0.1:8000 router.php
```

Open http://127.0.0.1:8000. Restart PHP after changing `php.ini`.

## Member accounts

- Choose **Sign in**, then **Create an account**. Registration creates a member role only.
- The account page provides a schedule, upcoming/past bookings, profile editing and password changes.
- Passwords require 12-72 bytes. Profile changes require the current password. Changing a password invalidates other member sessions.
- Members can book up to 28 days ahead and cancel before the start time in the configured club timezone. Cancelled reservations can be booked again.
- Public guest bookings allow reservations up to 30 days ahead. Guest and member reservations share capacity; PostgreSQL row locks serialize competing reservations.
- Membership information is displayed separately. Registered members can book regardless of membership status; no online payments are processed.
- Admins manage trainers, classes and schedules. Initialization seeds a demo timetable only when none exists; it does not create demo members or bookings.
- **Assign member memberships** lets admins select a member, plan and start date. Overlapping active assignments are rejected.
- Reviews require administrator approval.

Create an administrator:

```powershell
& 'D:\php\php.exe' scripts/create-admin.php admin@example.com 'Club administrator'
```

The script prompts for a password. Sign in at `/admin/login.php`.

## Verify member flows

Configure PostgreSQL first. Tests create an isolated `form_test_*` schema in the configured database and drop it on exit. The database role needs permission to create schemas; the role created by setup owns the database and has this permission. Tests do not use the public schema's records.

```powershell
$env:PHP_BINARY = 'D:\php\php.exe'
$env:PHP_CGI_BINARY = 'D:\php\php-cgi.exe'
node tests/member-integration.cjs
```

Checks cover authentication, access control, CSRF, date and shared capacity validation, booking ownership, cancellation/rebooking, profile changes, password/session invalidation, reviews, membership assignments and sign out. Temporary files go into `tests/.runtime`; set `MEMBER_TEST_DIR` to choose another location.
