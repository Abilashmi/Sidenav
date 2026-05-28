<?php
/**
 * getDeviceNavigation.php — Fetch device-specific navigation settings.
 *
 * GET: shop, deviceType (optional filter)
 */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'GET required'], 405);

$ctx        = requireShop();
$shopId     = $ctx['shopId'];
$db         = getDB();
$deviceType = trim($_GET['deviceType'] ?? '');

if ($deviceType) {
    $stmt = $db->prepare('SELECT id, device_type, settings_json, enabled, created_at, updated_at FROM device_navigation_settings WHERE shop_id = ? AND device_type = ?');
    $stmt->execute([$shopId, $deviceType]);
} else {
    $stmt = $db->prepare('SELECT id, device_type, settings_json, enabled, created_at, updated_at FROM device_navigation_settings WHERE shop_id = ?');
    $stmt->execute([$shopId]);
}

$result = array_map(fn($r) => [
    'id'         => $r['id'],
    'deviceType' => $r['device_type'],
    'enabled'    => (bool)$r['enabled'],
    'settings'   => json_decode($r['settings_json'], true) ?: [],
    'createdAt'  => $r['created_at'],
    'updatedAt'  => $r['updated_at'],
], $stmt->fetchAll());

jsonResponse(['success' => true, 'deviceSettings' => $result]);
