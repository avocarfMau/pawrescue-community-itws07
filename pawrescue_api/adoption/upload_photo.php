<?php
// =====================================
// PAWRESCUE COMMUNITY - ADOPTION PHOTO UPLOAD
// =====================================
// Upload ONE photo per request. Repeat up to ten per listing.
// CORS is handled by the existing .htaccess / cors.php.
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

require_once __DIR__ . '/../middleware/auth_middleware.php';

$conn = null;
$destination = null;
try {
    $auth = authenticate(['resident']);
    $conn = $auth['connection'];
    $userId = (int)$auth['user']['id'];

    $adoptionId = filter_var($_POST['adoption_id'] ?? null, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1]
    ]);
    if ($adoptionId === false || $adoptionId === null) {
        reply(400, ['success' => false, 'message' => 'Invalid adoption post ID.']);
    }

    if (!isset($_FILES['photo']) || !is_array($_FILES['photo']) ||
        is_array($_FILES['photo']['error'] ?? null)) {
        reply(400, ['success' => false, 'message' => 'Please choose one photo.']);
    }
    $file = $_FILES['photo'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $large = in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
        reply($large ? 413 : 400, [
            'success' => false,
            'message' => $large ? 'Photo is too large.' : 'Photo upload failed.'
        ]);
    }
    if (($file['size'] ?? 0) < 1 || $file['size'] > 5 * 1024 * 1024) {
        reply(413, ['success' => false, 'message' => 'Each photo must not exceed 5 MB.']);
    }
    $tmp = $file['tmp_name'] ?? '';
    if (!is_string($tmp) || !is_uploaded_file($tmp)) {
        reply(400, ['success' => false, 'message' => 'Invalid uploaded file.']);
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($allowed[$mime])) {
        reply(400, ['success' => false, 'message' => 'Only JPG, PNG, or WebP photos are allowed.']);
    }
    $imageInfo = @getimagesize($tmp);
    if (!$imageInfo || $imageInfo['mime'] !== $mime ||
        (int)$imageInfo[0] < 1 || (int)$imageInfo[1] < 1 ||
        (int)$imageInfo[0] > 6000 || (int)$imageInfo[1] > 6000) {
        reply(400, ['success' => false, 'message' => 'Invalid photo dimensions or content.']);
    }

    $root = realpath(dirname(__DIR__));
    if ($root === false) {
        throw new RuntimeException('API project directory not found.');
    }
    $uploadDir = $root . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'adoptions';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('Unable to create adoption upload directory.');
    }
    if (!is_writable($uploadDir)) {
        throw new RuntimeException('Adoption upload directory is not writable.');
    }

    // Lock the parent row to enforce the photo limit across concurrent requests.
    $conn->beginTransaction();
    $ownerStmt = $conn->prepare(
        'SELECT id, status FROM pet_adoption_posts
         WHERE id = :adoption_id AND user_id = :user_id
         LIMIT 1 FOR UPDATE'
    );
    $ownerStmt->execute([':adoption_id' => $adoptionId, ':user_id' => $userId]);
    $post = $ownerStmt->fetch(PDO::FETCH_ASSOC);
    if (!$post) {
        $conn->rollBack();
        reply(404, ['success' => false, 'message' => 'Adoption post not found or access denied.']);
    }
    if ($post['status'] !== 'available') {
        $conn->rollBack();
        reply(409, ['success' => false, 'message' => 'Only available adoption posts can be edited.']);
    }
    $countStmt = $conn->prepare(
        'SELECT COUNT(*) FROM pet_adoption_photos WHERE adoption_id = :adoption_id'
    );
    $countStmt->execute([':adoption_id' => $adoptionId]);
    $count = (int)$countStmt->fetchColumn();
    if ($count >= 10) {
        $conn->rollBack();
        reply(409, ['success' => false, 'message' => 'Maximum of 10 photos per adoption post.']);
    }

    $filename = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
    $destination = $uploadDir . DIRECTORY_SEPARATOR . $filename;
    if (!move_uploaded_file($tmp, $destination)) {
        throw new RuntimeException('Unable to store uploaded photo.');
    }
    $photoPath = '/pawrescue_api/uploads/adoptions/' . $filename;

    $insert = $conn->prepare(
        'INSERT INTO pet_adoption_photos (adoption_id, photo_path, sort_order)
         VALUES (:adoption_id, :photo_path, :sort_order)'
    );
    $insert->execute([
        ':adoption_id' => $adoptionId,
        ':photo_path' => $photoPath,
        ':sort_order' => $count
    ]);
    $photoId = (int)$conn->lastInsertId();
    $conn->commit();

    reply(201, [
        'success' => true,
        'message' => 'Adoption photo uploaded successfully.',
        'adoption_id' => (int)$adoptionId,
        'photo_id' => $photoId,
        'photo_count' => $count + 1,
        'photo_path' => $photoPath
    ]);
} catch (Throwable $e) {
    if ($conn instanceof PDO && $conn->inTransaction()) {
        $conn->rollBack();
    }
    if ($destination !== null && is_file($destination)) {
        @unlink($destination);
    }
    error_log('[PawRescue Adoption Upload Photo] ' . $e->getMessage());
    reply(500, ['success' => false, 'message' => 'Unable to upload adoption photo.']);
}
