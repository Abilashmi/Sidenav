<?php
/**
 * createSchedule.php — Create a new navigation schedule.
 *
 * POST: shop, name, startDate (ISO 8601), endDate (ISO 8601), timezone, enabled (1|0)
 */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'POST required'], 405);

$ctx    = requireShop();
$shopId = $ctx['shopId'];

$name      = trim($_POST['name']      ?? '');
$startDate = trim($_POST['startDate'] ?? '');
$endDate   = trim($_POST['endDate']   ?? '');
$timezone  = trim($_POST['timezone']  ?? 'UTC');
$enabled   = isset($_POST['enabled']) ? (int)$_POST['enabled'] : 1;

if (!$name || !$startDate || !$endDate)
    jsonResponse(['error' => 'name, startDate, endDate are required'], 400);

$startTs = strtotime($startDate);
$endTs   = strtotime($endDate);
if (!$startTs || !$endTs) jsonResponse(['error' => 'Invalid date format. Use ISO 8601.'], 400);
if ($endTs < $startTs)    jsonResponse(['error' => 'endDate must be after startDate'], 400);

$id        = bin2hex(random_bytes(12));
$startFmt  = date('Y-m-d H:i:s', $startTs);
$endFmt    = date('Y-m-d H:i:s', $endTs);
$now       = date('Y-m-d H:i:s');

getDB()->prepare(
    'INSERT INTO navigation_schedule (id, shop_id, name, start_date, end_date, timezone, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
)->execute([$id, $shopId, $name, $startFmt, $endFmt, $timezone, $enabled, $now, $now]);

jsonResponse(['success' => true, 'schedule' => [
    'id' => $id, 'shopId' => $shopId, 'name' => $name,
    'startDate' => $startFmt, 'endDate' => $endFmt,
    'timezone' => $timezone, 'enabled' => (bool)$enabled,
]]);
