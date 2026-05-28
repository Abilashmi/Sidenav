<?php
/**
 * Shared database connection for Floating Side Navigation PHP APIs.
 * Uses the same MySQL database as the Node.js/Prisma app.
 */

define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'floating_sidenav');
define('DB_USER', 'root');
define('DB_PASS', '');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

function jsonResponse(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    echo json_encode($data);
    exit;
}

function getShopId(string $shop): ?string {
    $stmt = getDB()->prepare('SELECT id FROM Shop WHERE shop = ? LIMIT 1');
    $stmt->execute([$shop]);
    $row = $stmt->fetch();
    return $row ? $row['id'] : null;
}

function requireShop(): array {
    $shop = $_REQUEST['shop'] ?? '';
    if (!$shop) {
        jsonResponse(['error' => 'Missing shop parameter'], 400);
    }
    $shopId = getShopId($shop);
    if (!$shopId) {
        jsonResponse(['error' => 'Shop not found'], 404);
    }
    return ['shop' => $shop, 'shopId' => $shopId];
}
