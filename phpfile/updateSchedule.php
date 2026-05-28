<?php
/**
 * updateSchedule.php — Update an existing navigation schedule.
 *
 * POST: shop, id, name, startDate, endDate, timezone, enabled (1|0)
 */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'POST required'], 405);

$ctx    = requireShop();
$shopId = $ctx['shopId'];

$id        = trim($_POST['id']        ?? '');
$name      = trim($_POST['name']      ?? '');
$startDate = trim($_POST['startDate'] ?? '');
$endDate   = trim($_POST['endDate']   ?? '');
$timezone  = trim($_POST['timezone']  ?? 'UTC');
$enabled   = isset($_POST['enabled']) ? (int)$_POST['enabled'] : 1;

if (!$id) jsonResponse(['error' => 'id is required'], 400);

// Verify ownership
$check = getDB()->prepare('SELECT id FROM navigation_schedule WHERE id = ? AND shop_id = ?');
$check->execute([$id, $shopId]);
if (!$check->fetch()) jsonResponse(['error' => 'Schedule not found'], 404);

$fields = ['timezone = ?', 'enabled = ?', 'updated_at = ?'];
$params = [$timezone, $enabled, date('Y-m-d H:i:s')];

if ($name) { array_unshift($fields, 'name = ?'); array_unshift($params, $name); }

if ($startDate) {
    $ts = strtotime($startDate);
    if (!$ts) jsonResponse(['error' => 'Invalid startDate'], 400);
    array_splice($fields, 1, 0, ['start_date = ?']);
    array_splice($params, 1, 0, [date('Y-m-d H:i:s', $ts)]);
}
if ($endDate) {
    $ts = strtotime($endDate);
    if (!$ts) jsonResponse(['error' => 'Invalid endDate'], 400);
    array_splice($fields, 2, 0, ['end_date = ?']);
    array_splice($params, 2, 0, [date('Y-m-d H:i:s', $ts)]);
}

$params[] = $id;
$params[] = $shopId;
getDB()->prepare('UPDATE navigation_schedule SET ' . implode(', ', $fields) . ' WHERE id = ? AND shop_id = ?')
       ->execute($params);

jsonResponse(['success' => true, 'id' => $id]);
