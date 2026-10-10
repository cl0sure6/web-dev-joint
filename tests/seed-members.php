<?php
declare(strict_types=1);
// The integration runner always supplies a fresh, isolated database path.
if (!getenv('CLUB_DATABASE_PATH')) { fwrite(STDERR, "An isolated test database is required.\n"); exit(1); }
require dirname(__DIR__) . '/backend/bootstrap.php';
$db = database();
$demoCount = (int) $db->query('SELECT COUNT(*) FROM schedule')->fetchColumn();
if ($demoCount === 0) throw new RuntimeException('Demo schedule was not initialized.');
seed_demo_schedule($db);
if ((int) $db->query('SELECT COUNT(*) FROM schedule')->fetchColumn() !== $demoCount) throw new RuntimeException('Demo schedule was initialized twice.');
$db->prepare("INSERT INTO users(name,email,password_hash,role) VALUES('Test administrator','admin@test.example',?,'admin')")->execute([password_hash('TestAdminPass123!', PASSWORD_DEFAULT)]);
$db->exec("INSERT INTO trainers(name,specialization) VALUES('Test trainer','Yoga')");
$trainerId = (int) $db->lastInsertId();
$db->prepare("INSERT INTO classes(name,description,trainer_id,capacity,duration) VALUES('Test yoga','Bring your mat.',?,1,60)")->execute([$trainerId]);
$classId = (int) $db->lastInsertId();
$day = new DateTimeImmutable('tomorrow');
$db->prepare("INSERT INTO schedule(class_id,weekday,start_time,room) VALUES(?,?,'18:00','Studio 1')")->execute([$classId, (int)$day->format('N')]);
echo json_encode(['day' => $day->format('Y-m-d'), 'scheduleId' => (int) $db->lastInsertId()]);
