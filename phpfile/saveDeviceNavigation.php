<?php
/**
 * saveDeviceNavigation.php — Upsert device-specific navigation settings.
 *
 * POST: shop, deviceType (desktop|tablet|mobile), enabled (1|0),
 *       showOnDevice (1|0), sidebarMode, position, overrideWidth (1|0), sidebarWidth
 */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'POST required'], 405);

$ctx    = requireShop();
$shopId = $ctx['shopId'];
$db     = getDB();

$deviceType    = trim($_POST['deviceType']    ?? '');
$enabled       = isset($_POST['enabled'])       ? (int)$_POST['enabled']       : 0;
$showOnDevice  = isset($_POST['showOnDevice'])  ? (int)$_POST['showOnDevice']  : 1;
$sidebarMode   = trim($_POST['sidebarMode']   ?? 'inherit');
$position      = trim($_POST['position']      ?? 'inherit');
$overrideWidth = isset($_POST['overrideWidth']) ? (int)$_POST['overrideWidth'] : 0;
$sidebarWidth  = isset($_POST['sidebarWidth'])  ? (int)$_POST['sidebarWidth']  : 280;

if (!in_array($deviceType, ['desktop', 'tablet', 'mobile'], true))
    jsonResponse(['error' => 'deviceType must be desktop, tablet, or mobile'], 400);

$settingsJson = json_encode([
    'showOnDevice'  => (bool)$showOnDevice,
    'sidebarMode'   => $sidebarMode,
    'position'      => $position,
    'overrideWidth' => (bool)$overrideWidth,
    'sidebarWidth'  => $overrideWidth ? $sidebarWidth : null,
]);

$now = date('Y-m-d H:i:s');

$check = $db->prepare('SELECT id FROM device_navigation_settings WHERE shop_id = ? AND device_type = ?');
$check->execute([$shopId, $deviceType]);
$existing = $check->fetch();

if ($existing) {
    $db->prepare('UPDATE device_navigation_settings SET settings_json = ?, enabled = ?, updated_at = ? WHERE shop_id = ? AND device_type = ?')
       ->execute([$settingsJson, $enabled, $now, $shopId, $deviceType]);
    $id = $existing['id'];
} else {
    $id = bin2hex(random_bytes(12));
    $db->prepare('INSERT INTO device_navigation_settings (id, shop_id, device_type, settings_json, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
       ->execute([$id, $shopId, $deviceType, $settingsJson, $enabled, $now, $now]);
}

jsonResponse(['success' => true, 'id' => $id, 'deviceType' => $deviceType,
    'enabled' => (bool)$enabled, 'settings' => json_decode($settingsJson, true)]);
