<?php
// =====================================
// PAWRESCUE COMMUNITY - REQUEST ADOPTION
// =====================================
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function reply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST, OPTIONS');
    reply(405, ['success' => false, 'message' => 'Method not allowed.']);
}
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === false) {
    reply(415, ['success' => false, 'message' => 'Content-Type must be application/json.']);
}
require_once __DIR__ . '/../middleware/auth_middleware.php';

$conn = null;
try {
    $auth = authenticate(['resident']);
    $conn = $auth['connection'];
    $requesterId = (int)$auth['user']['id'];
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data) || array_is_list($data)) {
        reply(400, ['success' => false, 'message' => 'Invalid JSON request.']);
    }
    $adoptionId = filter_var($data['adoption_id'] ?? null, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1]
    ]);
    $message = $data['message'] ?? null;
    if ($adoptionId === false || $adoptionId === null ||
        !is_string($message) || mb_strlen(trim($message)) < 10 || mb_strlen(trim($message)) > 2000) {
        reply(400, [
            'success' => false,
            'message' => 'Select an adoption post and write a message of 10–2000 characters.'
        ]);
    }
    $message = trim($message);

    $conn->beginTransaction();
    $stmt = $conn->prepare(
        'SELECT user_id, status FROM pet_adoption_posts
         WHERE id = :adoption_id LIMIT 1 FOR UPDATE'
    );
    $stmt->execute([':adoption_id' => $adoptionId]);
    $post = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$post) {
        $conn->rollBack();
        reply(404, ['success' => false, 'message' => 'Adoption listing not found.']);
    }
    if ((int)$post['user_id'] === $requesterId) {
        $conn->rollBack();
        reply(403, ['success' => false, 'message' => 'You cannot adopt your own posted pet.']);
    }
    if ($post['status'] !== 'available') {
        $conn->rollBack();
        reply(409, ['success' => false, 'message' => 'This pet is no longer available for requests.']);
    }
    $exists = $conn->prepare(
        'SELECT id FROM pet_adoption_requests
         WHERE adoption_id = :adoption_id AND requester_id = :requester_id LIMIT 1'
    );
    $exists->execute([':adoption_id' => $adoptionId, ':requester_id' => $requesterId]);
    if ($exists->fetchColumn()) {
        $conn->rollBack();
        reply(409, ['success' => false, 'message' => 'You already requested to adopt this pet.']);
    }
    $insert = $conn->prepare(
        "INSERT INTO pet_adoption_requests
         (adoption_id, requester_id, message, status)
         VALUES (:adoption_id, :requester_id, :message, 'pending')"
    );
    $insert->execute([
        ':adoption_id' => $adoptionId,
        ':requester_id' => $requesterId,
        ':message' => $message
    ]);
    $requestId = (int)$conn->lastInsertId();
    $conn->commit();
    reply(201, [
        'success' => true,
        'message' => 'Adoption request submitted successfully.',
        'request_id' => $requestId,
        'status' => 'pending'
    ]);
} catch (Throwable $e) {
    if ($conn instanceof PDO && $conn->inTransaction()) $conn->rollBack();
    error_log('[PawRescue Adoption Submit Request] ' . $e->getMessage());
    reply(500, ['success' => false, 'message' => 'Unable to submit adoption request.']);
}
