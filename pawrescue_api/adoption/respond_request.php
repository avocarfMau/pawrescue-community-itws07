<?php
// =====================================
// PAWRESCUE COMMUNITY - APPROVE / REJECT REQUEST
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
    $requestId = filter_var($data['request_id'] ?? null, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1]
    ]);
    $action = $data['action'] ?? null;
    if ($requestId === false || $requestId === null ||
        !is_string($action) || !in_array($action, ['approve', 'reject'], true)) {
        reply(400, ['success' => false, 'message' => 'Invalid adoption request or action.']);
    }

    // Find parent ID, then lock parent first to serialize competing approvals.
    $lookup = $conn->prepare('SELECT adoption_id FROM pet_adoption_requests WHERE id = :id LIMIT 1');
    $lookup->execute([':id' => $requestId]);
    $adoptionId = $lookup->fetchColumn();
    if (!$adoptionId) {
        reply(404, ['success' => false, 'message' => 'Adoption request not found.']);
    }
    $adoptionId = (int)$adoptionId;

    $conn->beginTransaction();
    $parentStmt = $conn->prepare(
        'SELECT id, status, user_id FROM pet_adoption_posts
         WHERE id = :id LIMIT 1 FOR UPDATE'
    );
    $parentStmt->execute([':id' => $adoptionId]);
    $post = $parentStmt->fetch(PDO::FETCH_ASSOC);
    if (!$post || (int)$post['user_id'] !== $ownerId) {
        $conn->rollBack();
        reply(404, ['success' => false, 'message' => 'Adoption request not found or access denied.']);
    }

    $requestStmt = $conn->prepare(
        'SELECT id, status FROM pet_adoption_requests
         WHERE id = :request_id AND adoption_id = :adoption_id LIMIT 1 FOR UPDATE'
    );
    $requestStmt->execute([':request_id' => $requestId, ':adoption_id' => $adoptionId]);
    $request = $requestStmt->fetch(PDO::FETCH_ASSOC);
    if (!$request || $request['status'] !== 'pending') {
        $conn->rollBack();
        reply(409, ['success' => false, 'message' => 'Request has already been processed.']);
    }
    if ($post['status'] !== 'available') {
        $conn->rollBack();
        reply(409, ['success' => false, 'message' => 'Adoption post is no longer available.']);
    }

    if ($action === 'approve') {
        $approve = $conn->prepare(
            "UPDATE pet_adoption_requests SET status = 'approved' WHERE id = :request_id"
        );
        $approve->execute([':request_id' => $requestId]);

        $rejectOthers = $conn->prepare(
            "UPDATE pet_adoption_requests
             SET status = 'rejected'
             WHERE adoption_id = :adoption_id AND id <> :request_id AND status = 'pending'"
        );
        $rejectOthers->execute([':adoption_id' => $adoptionId, ':request_id' => $requestId]);

        $reserve = $conn->prepare(
            "UPDATE pet_adoption_posts SET status = 'reserved' WHERE id = :adoption_id"
        );
        $reserve->execute([':adoption_id' => $adoptionId]);
        $newStatus = 'approved';
    } else {
        $reject = $conn->prepare(
            "UPDATE pet_adoption_requests SET status = 'rejected' WHERE id = :request_id"
        );
        $reject->execute([':request_id' => $requestId]);
        $newStatus = 'rejected';
    }
    $conn->commit();
    reply(200, [
        'success' => true,
        'message' => $action === 'approve' ?
            'Adoption request approved. Confirm handover before marking adopted.' :
            'Adoption request rejected.',
        'request_id' => (int)$requestId,
        'adoption_id' => $adoptionId,
        'status' => $newStatus
    ]);
} catch (Throwable $e) {
    if ($conn instanceof PDO && $conn->inTransaction()) $conn->rollBack();
    error_log('[PawRescue Adoption Respond Request] ' . $e->getMessage());
    reply(500, ['success' => false, 'message' => 'Unable to process adoption request.']);
}
