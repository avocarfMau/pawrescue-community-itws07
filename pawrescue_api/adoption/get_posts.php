<?php
// =====================================
// PAWRESCUE COMMUNITY - ADOPTION POSTS
// =====================================
// CORS is handled by the existing .htaccess / cors.php.
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
    $auth = authenticate(['resident', 'staff']);
    $conn = $auth['connection'];
    $userId = (int)$auth['user']['id'];
    $role = (string)$auth['user']['role'];

    $scope = $_GET['scope'] ?? 'community';
    $type = $_GET['type'] ?? 'all';
    $status = $_GET['status'] ?? 'all';
    $postIdRaw = $_GET['id'] ?? null;

    if (!is_string($scope) || !in_array($scope, ['community', 'mine'], true) ||
        !is_string($type) || !in_array($type, ['all', 'dog', 'cat'], true) ||
        !is_string($status) || !in_array($status, ['all', 'available', 'reserved', 'adopted', 'closed'], true)) {
        reply(400, ['success' => false, 'message' => 'Invalid listing filters.']);
    }

    if ($scope === 'mine' && $role !== 'resident') {
        reply(403, ['success' => false, 'message' => 'Only residents have personal adoption posts.']);
    }

    $postId = null;
    if ($postIdRaw !== null) {
        $postId = filter_var($postIdRaw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($postId === false) {
            reply(400, ['success' => false, 'message' => 'Invalid adoption post ID.']);
        }
    }

    $sql = "SELECT p.id, p.user_id, p.pet_name, p.animal_type,
                   p.sex, p.age_months, p.breed, p.description,
                   p.health_notes, p.barangay, p.location_details,
                   p.status, p.adopted_at, p.created_at, p.updated_at,
                   u.full_name AS owner_name
            FROM pet_adoption_posts p
            INNER JOIN users u ON u.id = p.user_id
            WHERE 1 = 1";
    $params = [];

    if ($scope === 'mine') {
        $sql .= ' AND p.user_id = :user_id';
        $params[':user_id'] = $userId;
    } else {
        // Closed posts are private to the owner; public default shows available pets.
        if ($status === 'all') {
            $sql .= " AND p.status = 'available'";
        } elseif ($status === 'closed') {
            reply(400, ['success' => false, 'message' => 'Closed listings are not public.']);
        } else {
            $sql .= ' AND p.status = :status';
            $params[':status'] = $status;
        }
    }

    if ($scope === 'mine' && $status !== 'all') {
        $sql .= ' AND p.status = :status';
        $params[':status'] = $status;
    }
    if ($type !== 'all') {
        $sql .= ' AND p.animal_type = :animal_type';
        $params[':animal_type'] = $type;
    }
    if ($postId !== null) {
        $sql .= ' AND p.id = :post_id';
        $params[':post_id'] = $postId;
    }

    $sql .= ' ORDER BY p.created_at DESC, p.id DESC LIMIT 100';
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $posts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if ($posts) {
        $ids = array_map(static fn($p) => (int)$p['id'], $posts);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $photosStmt = $conn->prepare(
            'SELECT id, adoption_id, photo_path, sort_order, created_at
             FROM pet_adoption_photos
             WHERE adoption_id IN (' . $placeholders . ')
             ORDER BY adoption_id, sort_order, id'
        );
        $photosStmt->execute($ids);
        $photosByPost = [];
        foreach ($photosStmt->fetchAll(PDO::FETCH_ASSOC) as $photo) {
            $key = (int)$photo['adoption_id'];
            $photo['id'] = (int)$photo['id'];
            $photo['adoption_id'] = $key;
            $photo['sort_order'] = (int)$photo['sort_order'];
            $photosByPost[$key][] = $photo;
        }
        foreach ($posts as &$post) {
            $id = (int)$post['id'];
            $post['id'] = $id;
            $post['user_id'] = (int)$post['user_id'];
            $post['age_months'] = $post['age_months'] !== null ? (int)$post['age_months'] : null;
            $post['photos'] = $photosByPost[$id] ?? [];
            $post['photo_count'] = count($post['photos']);
            $post['photo_path'] = $post['photos'][0]['photo_path'] ?? null;
            $post['is_owner'] = $post['user_id'] === $userId;
        }
        unset($post);
    }

    reply(200, [
        'success' => true,
        'message' => 'Adoption posts retrieved successfully.',
        'count' => count($posts),
        'posts' => $posts
    ]);
} catch (Throwable $e) {
    error_log('[PawRescue Adoption Get Posts] ' . $e->getMessage());
    reply(500, ['success' => false, 'message' => 'Unable to retrieve adoption posts.']);
}
