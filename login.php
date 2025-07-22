<?php
header('Content-Type: application/json; charset=utf-8');
session_start();

$username = trim($_POST['username'] ?? '');
$password = $_POST['password'] ?? '';
if (!$username || !$password) {
    echo json_encode(['ok' => false, 'msg' => 'Zadejte jméno i heslo!']);
    exit;
}
$file = __DIR__ . '/uzivatele.json';
$users = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
foreach ($users as $u) {
    if (strtolower($u['username']) === strtolower($username) && password_verify($password, $u['password'])) {
        $_SESSION['username'] = $u['username'];
        echo json_encode(['ok' => true]);
        exit;
    }
}
echo json_encode(['ok' => false, 'msg' => 'Špatné jméno nebo heslo!']);