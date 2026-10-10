<?php
declare(strict_types=1);
// The integration runner always supplies a fresh, isolated database path.
if (!getenv('CLUB_DATABASE_PATH')) { fwrite(STDERR, "An isolated test database is required.\n"); exit(1); }
require dirname(__DIR__) . '/backend/bootstrap.php';
$db = database();
$db->prepare("INSERT INTO users(name,email,password_hash,role) VALUES('Test administrator','admin@test.example',?,'admin')")->execute([password_hash('TestAdminPass123!', PASSWORD_DEFAULT)]);
$db->exec("INSERT INTO trainers(name,specialization) VALUES('Test trainer','Yoga')");
$db->exec("INSERT INTO classes(name,description,trainer_id,capacity,duration) VALUES('Test yoga','Bring your mat.',1,1,60)");
$day = new DateTimeImmutable('tomorrow');
$db->prepare("INSERT INTO schedule(class_id,weekday,start_time,room) VALUES(1,?,'18:00','Studio 1')")->execute([(int)$day->format('N')]);
echo $day->format('Y-m-d');
