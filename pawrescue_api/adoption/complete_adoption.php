<?php
// =====================================
// PAWRESCUE COMMUNITY - CONFIRM ADOPTION HANDOVER
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
    $ownerId = (int)$auth['user']['id'];
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data) || array_is_list($data)) {
        reply(400, ['success' => false, 'message' => 'Invalid JSON request.']);
    }
    $adoptionId = filter_var($data['adoption_id'] ?? null, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1]
    ]);
    if ($adoptionId === false || $adoptionId === null) {
        reply(400, ['success' => false, 'message' => 'Invalid adoption post ID.']);
    }

    $conn->beginTransaction();
    $postStmt = $conn->prepare(
        'SELECT id, status FROM pet_adoption_posts
         WHERE id = :adoption_id AND user_id = :user_id LIMIT 1 FOR UPDATE'
    );
    $postStmt->execute([':adoption_id' => $adoptionId, ':user_id' => $ownerId]);
    $post = $postStmt->fetch(PDO::FETCH_ASSOC);
    if (!$post) {
        $conn->rollBack();
        reply(404, ['success' => false, 'message' => 'Adoption post not found or access denied.']);
    }
    if ($post['status'] !== 'reserved') {
        $conn->rollBack();
        reply(409, ['success' => false, 'message' => 'Only reserved pets can be marked adopted.']);
    }
    $approvedStmt = $conn->prepare(
        "SELECT id FROM pet_adoption_requests
         WHERE adoption_id = :adoption_id AND status = 'approved'
         LIMIT 1 FOR UPDATE"
    );
    $approvedStmt->execute([':adoption_id' => $adoptionId]);
    $approvedRequestId = $approvedStmt->fetchColumn();
    if (!$approvedRequestId) {
        $conn->rollBack();
        reply(409, ['success' => false, 'message' => 'No approved adoption request was found.']);
    }

    $completeRequest = $conn->prepare(
        "UPDATE pet_adoption_requests SET status = 'completed' WHERE id = :request_id"
    );
    $completeRequest->execute([':request_id' => $approvedRequestId]);
    $completePost = $conn->prepare(
        "UPDATE pet_adoption_posts
         SET status = 'adopted', adopted_at = NOW() WHERE id = :adoption_id"
    );
    $completePost->execute([':adoption_id' => $adoptionId]);
    $conn->commit();
    reply(200, [
        'success' => true,
        'message' => 'Adoption completed successfully.',
        'adoption_id' => (int)$adoptionId,
        'request_id' => (int)$approvedRequestId,
        'status' => 'adopted'
    ]);
} catch (Throwable $e) {
    if ($conn instanceof PDO && $conn->inTransaction()) $conn->rollBack();
    error_log('[PawRescue Adoption Complete] ' . $e->getMessage());
    reply(500, ['success' => false, 'message' => 'Unable to complete adoption.']);
}
