<?php
/**
 * saveNavigationMode.php — Set the navigation mode (manual|automatic) for a shop.
 *
 * POST: shop, mode (manual|automatic), autoShowChildren (1|0),
 *       autoShowSiblings (1|0), fallbackToDefault (1|0)
 */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'POST required'], 405);

$ctx    = requireShop();
$shopId = $ctx['shopId'];
$db     = getDB();

$mode = trim($_POST['mode'] ?? 'manual');
if (!in_array($mode, ['manual', 'automatic'], true))
    jsonResponse(['error' => 'mode must be "manual" or "automatic"'], 400);

$settingsJson = json_encode([
    'autoShowChildren'  => (bool)(int)($_POST['autoShowChildren']  ?? 1),
    'autoShowSiblings'  => (bool)(int)($_POST['autoShowSiblings']  ?? 1),
    'fallbackToDefault' => (bool)(int)($_POST['fallbackToDefault'] ?? 1),
]);

$now = date('Y-m-d H:i:s');

$check = $db->prepare('SELECT id FROM navigation_mode WHERE shop_id = ?');
$check->execute([$shopId]);
$existing = $check->fetch();

if ($existing) {
    $db->prepare('UPDATE navigation_mode SET mode = ?, settings_json = ?, updated_at = ? WHERE shop_id = ?')
       ->execute([$mode, $settingsJson, $now, $shopId]);
    $id = $existing['id'];
} else {
    $id = bin2hex(random_bytes(12));
    $db->prepare('INSERT INTO navigation_mode (id, shop_id, mode, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
       ->execute([$id, $shopId, $mode, $settingsJson, $now, $now]);
}

jsonResponse(['success' => true, 'id' => $id, 'mode' => $mode,
    'settings' => json_decode($settingsJson, true)]);
