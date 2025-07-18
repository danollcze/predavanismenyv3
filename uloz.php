<?php
header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);

if (!$data) {
  http_response_code(400);
  echo json_encode(['status' => 'error', 'message' => 'Neplatný vstup']);
  exit;
}

file_put_contents('recepty.json', json_encode($data, JSON_PRETTY_PRINT));
echo json_encode(['status' => 'ok']);
?>