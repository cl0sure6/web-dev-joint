<?php
declare(strict_types=1);
// The integration runner creates a fresh schema and never changes the public schema.
$schema = getenv('CLUB_DB_SCHEMA') ?: '';
if (!preg_match('/^form_test_[a-z0-9_]+$/', $schema)) { fwrite(STDERR, "An isolated test schema is required.\n"); exit(1); }
require dirname(__DIR__) . '/backend/bootstrap.php';
$db = database();
$db->exec('CREATE SCHEMA "' . $schema . '"');
$db->exec(file_get_contents(dirname(__DIR__) . '/backend/schema.sql'));
seed_content($db);
seed_demo_schedule($db);
$demoCount = (int) $db->query('SELECT COUNT(*) FROM schedule')->fetchColumn();
if ($demoCount === 0) throw new RuntimeException('Demo schedule was not initialized.');
seed_demo_schedule($db);
if ((int) $db->query('SELECT COUNT(*) FROM schedule')->fetchColumn() !== $demoCount) throw new RuntimeException('Demo schedule was initialized twice.');
$db->prepare("INSERT INTO users(name,email,password_hash,role) VALUES('Test administrator','admin@test.example',?,'admin')")->execute([password_hash('TestAdminPass123!', PASSWORD_DEFAULT)]);
$trainerId = (int)$db->query("INSERT INTO trainers(name,specialization) VALUES('Test trainer','Yoga') RETURNING id")->fetchColumn();
$query = $db->prepare("INSERT INTO classes(name,description,trainer_id,capacity,duration) VALUES('Test yoga','Bring your mat.',?,1,60) RETURNING id");
$query->execute([$trainerId]);
$classId = (int)$query->fetchColumn();
$day = new DateTimeImmutable('tomorrow');
$query = $db->prepare("INSERT INTO schedule(class_id,weekday,start_time,room) VALUES(?,?,'18:00','Studio 1') RETURNING id");
$query->execute([$classId, (int)$day->format('N')]);
echo json_encode(['day' => $day->format('Y-m-d'), 'scheduleId' => (int)$query->fetchColumn()]);
