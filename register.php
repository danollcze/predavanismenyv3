<?php
header('Content-Type: application/json; charset=utf-8');
header('Content-Type: application/json');
session_start();

$REG_KLIC = "MOJKLIC123";  // ZMĚŇ SI!

$username = trim($_POST['username'] ?? '');
$password = $_POST['password'] ?? '';
$regkey   = trim($_POST['regkey'] ?? '');

if (!$username || !$password || !$regkey) {
    echo json_encode(['ok' => false, 'msg' => 'Vyplňte vše!']);
    exit;
}
if ($regkey !== $REG_KLIC) {
    echo json_encode(['ok' => false, 'msg' => 'Špatný registrační klíč!']);
    exit;
}
if (!preg_match('/^[a-zA-Z0-9._-]{3,20}$/', $username)) {
    echo json_encode(['ok' => false, 'msg' => 'Používejte 3-20 znaků, pouze písmena/čísla.']);
    exit;
}
$file = __DIR__ . '/uzivatele.json';
$users = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
foreach ($users as $u) {
    if (strtolower($u['username']) === strtolower($username)) {
        echo json_encode(['ok' => false, 'msg' => 'Uživatel už existuje!']);
        exit;
    }
}
$users[] = ['username' => $username, 'password' => password_hash($password, PASSWORD_DEFAULT)];
file_put_contents($file, json_encode($users, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
echo json_encode(['ok' => true]);