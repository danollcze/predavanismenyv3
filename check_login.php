<?php
header('Content-Type: application/json');
session_start();
echo json_encode(['logged' => isset($_SESSION['username']), 'username' => $_SESSION['username'] ?? '']);