<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
$schema = getenv('CLUB_DB_SCHEMA') ?: '';
if (!preg_match('/^form_test_[a-z0-9_]+$/', $schema)) exit(1);
require dirname(__DIR__) . '/backend/bootstrap.php';
database()->exec('DROP SCHEMA IF EXISTS "' . $schema . '" CASCADE');
