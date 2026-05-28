<?php
/**
 * getAutomaticNavigation.php — Auto-generate navigation for the current page.
 *
 * GET: shop, pageType, pageHandle
 */
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'GET required'], 405);

$ctx        = requireShop();
$shopId     = $ctx['shopId'];
$db         = getDB();
$pageType   = trim($_GET['pageType']   ?? '');
$pageHandle = trim($_GET['pageHandle'] ?? '');

$modeStmt = $db->prepare('SELECT mode, settings_json FROM navigation_mode WHERE shop_id = ? LIMIT 1');
$modeStmt->execute([$shopId]);
$modeRow = $modeStmt->fetch();

if (!$modeRow || $modeRow['mode'] !== 'automatic')
    jsonResponse(['error' => 'Automatic mode is not enabled for this shop'], 400);

$rules = json_decode($modeRow['settings_json'], true) ?: [
    'autoShowChildren' => true, 'autoShowSiblings' => true, 'fallbackToDefault' => true,
];

$colStmt = $db->prepare(
    'SELECT collectionId as id, title, handle, image, customImage, customLabel, sortOrder, parentCollectionId
     FROM selectedcollection WHERE shopId = ? AND enabled = 1 ORDER BY sortOrder ASC'
);
$colStmt->execute([$shopId]);
$allCols = $colStmt->fetchAll();

$childMap  = [];
$handleMap = [];
foreach ($allCols as $c) {
    $handleMap[$c['handle']] = $c;
    if ($c['parentCollectionId']) $childMap[$c['parentCollectionId']][] = $c;
}

function formatCol(array $c): array {
    return ['id' => $c['id'], 'title' => $c['title'],
            'label' => $c['customLabel'] ?: $c['title'],
            'handle' => $c['handle'], 'image' => $c['customImage'] ?: $c['image'],
            'sortOrder' => (int)$c['sortOrder'], 'type' => 'collection'];
}

$result = null;

if ($pageType === 'collection' && $pageHandle) {
    $current = $handleMap[$pageHandle] ?? null;
    if ($current) {
        if (!empty($childMap[$current['id']]) && $rules['autoShowChildren']) {
            $children = array_map('formatCol', $childMap[$current['id']]);
            usort($children, fn($a, $b) => $a['sortOrder'] - $b['sortOrder']);
            $result = $children;
        }
        if ($result === null && $current['parentCollectionId'] && $rules['autoShowSiblings']) {
            $siblings = array_map('formatCol', $childMap[$current['parentCollectionId']] ?? []);
            usort($siblings, fn($a, $b) => $a['sortOrder'] - $b['sortOrder']);
            $result = $siblings;
        }
    }
}

if ($result === null && $rules['fallbackToDefault']) {
    $topLevel = array_filter($allCols, fn($c) => !$c['parentCollectionId']);
    $result   = array_map('formatCol', array_values($topLevel));
}

jsonResponse(['success' => true, 'mode' => 'automatic', 'pageType' => $pageType,
    'pageHandle' => $pageHandle, 'collections' => $result ?? [], 'rules' => $rules]);
