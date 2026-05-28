<?php
/**
 * getActiveNavigation.php — Full sidebar payload respecting active schedules.
 *
 * GET: shop
 */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'GET required'], 405);

$ctx    = requireShop();
$shopId = $ctx['shopId'];
$db     = getDB();
$now    = date('Y-m-d H:i:s');

// Schedule gate: if schedules exist but none active → hidden
$totalSched = $db->prepare('SELECT COUNT(*) as cnt FROM navigation_schedule WHERE shop_id = ? AND enabled = 1');
$totalSched->execute([$shopId]);
$totalCount = (int)$totalSched->fetch()['cnt'];

if ($totalCount > 0) {
    $activeSched = $db->prepare(
        'SELECT COUNT(*) as cnt FROM navigation_schedule WHERE shop_id = ? AND enabled = 1 AND start_date <= ? AND end_date >= ?'
    );
    $activeSched->execute([$shopId, $now, $now]);
    if ((int)$activeSched->fetch()['cnt'] === 0)
        jsonResponse(['hidden' => true, 'reason' => 'no_active_schedule']);
}

// Settings (Phase 1/2 table: sidebarsettings, keyed by shopId)
$sStmt = $db->prepare('SELECT * FROM sidebarsettings WHERE shopId = ? LIMIT 1');
$sStmt->execute([$shopId]);
$sr = $sStmt->fetch();
$settings = $sr ? [
    'enabled' => (bool)$sr['enabled'], 'position' => $sr['position'],
    'mobileOnly' => (bool)$sr['mobileOnly'], 'backgroundColor' => $sr['backgroundColor'],
    'textColor' => $sr['textColor'], 'borderRadius' => (int)$sr['borderRadius'],
    'shadow' => (bool)$sr['shadow'], 'iconSize' => (int)$sr['iconSize'],
    'animationStyle' => $sr['animationStyle'], 'opacity' => (float)$sr['opacity'],
    'zIndex' => (int)$sr['zIndex'], 'sidebarMode' => $sr['sidebarMode'],
    'sidebarWidth' => (int)$sr['sidebarWidth'], 'topMargin' => (int)$sr['topMargin'],
    'bottomMargin' => (int)$sr['bottomMargin'], 'pageVisibilityMode' => $sr['pageVisibilityMode'],
    'showOnHome' => (bool)$sr['showOnHome'], 'showOnCollection' => (bool)$sr['showOnCollection'],
    'showOnProduct' => (bool)$sr['showOnProduct'], 'showOnBlog' => (bool)$sr['showOnBlog'],
    'showOnArticle' => (bool)$sr['showOnArticle'], 'showOnCart' => (bool)$sr['showOnCart'],
    'showOnSearch' => (bool)$sr['showOnSearch'], 'showOnOtherPages' => (bool)$sr['showOnOtherPages'],
] : ['enabled' => false];

// Collections
$cStmt = $db->prepare(
    'SELECT collectionId as id, title, handle, image, customImage, customLabel, imageType, sortOrder, parentCollectionId
     FROM selectedcollection WHERE shopId = ? AND enabled = 1 ORDER BY sortOrder ASC'
);
$cStmt->execute([$shopId]);
$allCols  = $cStmt->fetchAll();
$childMap = [];
foreach ($allCols as $c) {
    if ($c['parentCollectionId']) $childMap[$c['parentCollectionId']][] = $c;
}
$collections = [];
foreach ($allCols as $c) {
    if ($c['parentCollectionId']) continue;
    $item = ['id' => $c['id'], 'title' => $c['title'], 'label' => $c['customLabel'] ?: $c['title'],
             'handle' => $c['handle'], 'image' => $c['customImage'] ?: $c['image'],
             'imageType' => $c['imageType'], 'sortOrder' => (int)$c['sortOrder'],
             'type' => 'collection', 'children' => []];
    if (!empty($childMap[$c['id']])) {
        $item['children'] = array_map(fn($ch) => [
            'id' => $ch['id'], 'title' => $ch['title'], 'label' => $ch['customLabel'] ?: $ch['title'],
            'handle' => $ch['handle'], 'image' => $ch['customImage'] ?: $ch['image'],
            'sortOrder' => (int)$ch['sortOrder'], 'type' => 'collection',
        ], $childMap[$c['id']]);
        usort($item['children'], fn($a, $b) => $a['sortOrder'] - $b['sortOrder']);
    }
    $collections[] = $item;
}

// Products
$pStmt = $db->prepare(
    'SELECT productId as id, title, handle, image, customImage, customLabel, price, badge, sortOrder
     FROM sidebarproduct WHERE shopId = ? AND enabled = 1 ORDER BY sortOrder ASC'
);
$pStmt->execute([$shopId]);
$products = array_map(fn($p) => [
    'id' => $p['id'], 'title' => $p['title'], 'label' => $p['customLabel'] ?: $p['title'],
    'handle' => $p['handle'], 'image' => $p['customImage'] ?: $p['image'],
    'price' => $p['price'], 'badge' => $p['badge'], 'sortOrder' => (int)$p['sortOrder'], 'type' => 'product',
], $pStmt->fetchAll());

// Mappings
$mStmt = $db->prepare(
    'SELECT parentHandle, parentCollectionId, relatedCollectionId as id, relatedHandle as handle,
            relatedTitle as title, customLabel, relatedImage, customImage
     FROM collectionmapping WHERE shopId = ? AND enabled = 1 ORDER BY parentCollectionId ASC, position ASC'
);
$mStmt->execute([$shopId]);
$mappings = [];
foreach ($mStmt->fetchAll() as $m) {
    if (!isset($mappings[$m['parentHandle']]))
        $mappings[$m['parentHandle']] = ['parentCollectionId' => $m['parentCollectionId'], 'items' => []];
    $mappings[$m['parentHandle']]['items'][] = ['id' => $m['id'], 'handle' => $m['handle'],
        'title' => $m['title'], 'label' => $m['customLabel'] ?: $m['title'],
        'image' => $m['customImage'] ?: $m['relatedImage']];
}

// Schedules
$schStmt = $db->prepare('SELECT name, start_date, end_date, timezone, enabled FROM navigation_schedule WHERE shop_id = ? AND enabled = 1');
$schStmt->execute([$shopId]);
$schedules = array_map(fn($s) => ['name' => $s['name'], 'startDate' => $s['start_date'],
    'endDate' => $s['end_date'], 'timezone' => $s['timezone'], 'enabled' => (bool)$s['enabled']], $schStmt->fetchAll());

// Device settings
$dStmt = $db->prepare('SELECT device_type, settings_json, enabled FROM device_navigation_settings WHERE shop_id = ? AND enabled = 1');
$dStmt->execute([$shopId]);
$deviceSettings = array_map(fn($d) => ['deviceType' => $d['device_type'],
    'settingsJson' => $d['settings_json'], 'enabled' => (bool)$d['enabled']], $dStmt->fetchAll());

// Navigation mode
$nmStmt = $db->prepare('SELECT mode, settings_json FROM navigation_mode WHERE shop_id = ? LIMIT 1');
$nmStmt->execute([$shopId]);
$nmRow = $nmStmt->fetch();
$navigationMode = $nmRow ? ['mode' => $nmRow['mode'], 'settingsJson' => $nmRow['settings_json']] : null;

jsonResponse(compact('settings', 'collections', 'products', 'mappings', 'schedules', 'deviceSettings', 'navigationMode'));
