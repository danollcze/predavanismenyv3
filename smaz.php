<?php
// smaz.php
define('HESLO_MAZANI', 'recept2024');

// Nactení dat
$input = json_decode(file_get_contents('php://input'), true);
$index = $input['index'] ?? -1;
$heslo = $input['heslo'] ?? '';

if ($heslo !== HESLO_MAZANI) {
  echo json_encode(['ok' => false, 'message' => 'Neplatné heslo.']);
  exit;
}

$path = 'recepty.json'; // nebo jak se jmenuje tvuj soubor
if (!file_exists($path)) {
  echo json_encode(['ok' => false, 'message' => 'Soubor nenalezen.']);
  exit;
}

$data = json_decode(file_get_contents($path), true);
if (!is_array($data) || !isset($data[$index])) {
  echo json_encode(['ok' => false, 'message' => 'Neplatnı index.']);
  exit;
}

array_splice($data, $index, 1);
file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT));

echo json_encode(['ok' => true]);