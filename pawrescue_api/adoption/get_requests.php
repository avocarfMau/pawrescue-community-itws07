<?php
// =====================================
// PAWRESCUE COMMUNITY - GET ADOPTION REQUESTS
// =====================================
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function reply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET, OPTIONS');
    reply(405, ['success' => false, 'message' => 'Method not allowed.']);
}
require_once __DIR__ . '/../middleware/auth_middleware.php';

try {
    $auth = authenticate(['resident']);
    $conn = $auth['connection'];
    $userId = (int)$auth['user']['id'];
    $direction = $_GET['direction'] ?? 'sent';
    if (!is_string($direction) || !in_array($direction, ['sent', 'received'], true)) {
        reply(400, ['success' => false, 'message' => 'Invalid request direction.']);
    }

    $sql = "SELECT r.id, r.adoption_id, r.requester_id, r.message,
                   r.status, r.created_at, r.updated_at,
                   p.pet_name, p.animal_type, p.status AS adoption_status,
                   p.user_id AS owner_id,
                   requester.full_name AS requester_name,
                   owner.full_name AS owner_name
            FROM pet_adoption_requests r
            INNER JOIN pet_adoption_posts p ON p.id = r.adoption_id
            INNER JOIN users requester ON requester.id = r.requester_id
            INNER JOIN users owner ON owner.id = p.user_id
            WHERE ";

    if ($direction === 'received') {
        $sql .= 'p.user_id = :user_id';
    } else {
        $sql .= 'r.requester_id = :user_id';
    }
    $sql .= ' ORDER BY r.created_at DESC, r.id DESC LIMIT 100';
    $stmt = $conn->prepare($sql);
    $stmt->execute([':user_id' => $userId]);
    $requests = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($requests as &$request) {
        foreach (['id', 'adoption_id', 'requester_id', 'owner_id'] as $key) {
            $request[$key] = (int)$request[$key];
        }
    }
    unset($request);

    reply(200, [
        'success' => true,
        'message' => 'Adoption requests retrieved successfully.',
        'count' => count($requests),
        'requests' => $requests
    ]);
} catch (Throwable $e) {
    error_log('[PawRescue Adoption Get Requests] ' . $e->getMessage());
    reply(500, ['success' => false, 'message' => 'Unable to retrieve adoption requests.']);
}
