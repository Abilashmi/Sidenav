<?php
/**
 * saveAutomaticRules.php — Update only the automatic mode rules without changing mode.
 *
 * POST: shop, autoShowChildren (1|0), autoShowSiblings (1|0), fallbackToDefault (1|0)
 */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'POST required'], 405);

$ctx    = requireShop();
$shopId = $ctx['shopId'];
$db     = getDB();

$settingsJson = json_encode([
    'autoShowChildren'  => (bool)(int)($_POST['autoShowChildren']  ?? 1),
    'autoShowSiblings'  => (bool)(int)($_POST['autoShowSiblings']  ?? 1),
    'fallbackToDefault' => (bool)(int)($_POST['fallbackToDefault'] ?? 1),
]);

$now = date('Y-m-d H:i:s');

$check = $db->prepare('SELECT id, mode FROM navigation_mode WHERE shop_id = ?');
$check->execute([$shopId]);
$existing = $check->fetch();

if ($existing) {
    $db->prepare('UPDATE navigation_mode SET settings_json = ?, updated_at = ? WHERE shop_id = ?')
       ->execute([$settingsJson, $now, $shopId]);
    $id   = $existing['id'];
    $mode = $existing['mode'];
} else {
    $id   = bin2hex(random_bytes(12));
    $mode = 'automatic';
    $db->prepare('INSERT INTO navigation_mode (id, shop_id, mode, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
       ->execute([$id, $shopId, $mode, $settingsJson, $now, $now]);
}

jsonResponse(['success' => true, 'id' => $id, 'mode' => $mode,
    'rules' => json_decode($settingsJson, true)]);
