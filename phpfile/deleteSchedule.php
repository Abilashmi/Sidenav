<?php
/**
 * deleteSchedule.php — Delete a navigation schedule.
 *
 * POST: shop, id
 */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'POST required'], 405);

$ctx    = requireShop();
$shopId = $ctx['shopId'];
$id     = trim($_POST['id'] ?? '');

if (!$id) jsonResponse(['error' => 'id is required'], 400);

$stmt = getDB()->prepare('DELETE FROM navigation_schedule WHERE id = ? AND shop_id = ?');
$stmt->execute([$id, $shopId]);

if ($stmt->rowCount() === 0) jsonResponse(['error' => 'Schedule not found'], 404);

jsonResponse(['success' => true, 'deleted' => $id]);
