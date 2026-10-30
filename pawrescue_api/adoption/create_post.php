<?php
// =====================================
// PAWRESCUE COMMUNITY - CREATE ADOPTION POST
// =====================================
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
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === false) {
    reply(415, ['success' => false, 'message' => 'Content-Type must be application/json.']);
}

require_once __DIR__ . '/../middleware/auth_middleware.php';

try {
    $auth = authenticate(['resident']);
    $conn = $auth['connection'];
    $userId = (int)$auth['user']['id'];
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data) || array_is_list($data)) {
        reply(400, ['success' => false, 'message' => 'Invalid JSON request.']);
    }

    $required = ['pet_name', 'animal_type', 'description', 'barangay'];
    foreach ($required as $field) {
        if (!isset($data[$field]) || !is_string($data[$field]) || trim($data[$field]) === '') {
            reply(400, ['success' => false, 'message' => 'Please complete all required fields.']);
        }
    }

    $petName = trim($data['pet_name']);
    $animalType = trim($data['animal_type']);
    $description = trim($data['description']);
    $barangay = trim($data['barangay']);
    $sex = $data['sex'] ?? 'unknown';
    $ageMonths = $data['age_months'] ?? null;
    $breed = $data['breed'] ?? null;
    $healthNotes = $data['health_notes'] ?? null;
    $locationDetails = $data['location_details'] ?? null;

    if (mb_strlen($petName) > 100 || mb_strlen($description) > 5000 ||
        !in_array($animalType, ['dog', 'cat'], true) ||
        !is_string($sex) || !in_array($sex, ['male', 'female', 'unknown'], true)) {
        reply(400, ['success' => false, 'message' => 'Invalid pet information.']);
    }

    $barangays = [
        'San Bartolome', 'Burgos', 'Rizal', 'Bonifacio', 'Mallorca',
        'Mambangnan', 'Diversion', 'Tambo-Adorable', 'Nieves',
        'Tabuating', 'Magpapalayoc', 'San Anton', 'Castellano',
        'Tagumpay', 'San Roque'
    ];
    if (!in_array($barangay, $barangays, true)) {
        reply(400, ['success' => false, 'message' => 'Please select a valid San Leonardo barangay.']);
    }

    if ($ageMonths === '') $ageMonths = null;
    if ($ageMonths !== null) {
        $ageMonths = filter_var($ageMonths, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 0, 'max_range' => 600]
        ]);
        if ($ageMonths === false) {
            reply(400, ['success' => false, 'message' => 'Age must be between 0 and 600 months.']);
        }
    }

    $optional = [
        'breed' => &$breed, 'health_notes' => &$healthNotes,
        'location_details' => &$locationDetails
    ];
    $maxLength = ['breed' => 120, 'health_notes' => 3000, 'location_details' => 255];
    foreach ($optional as $key => &$value) {
        if ($value !== null && !is_string($value)) {
            reply(400, ['success' => false, 'message' => 'Invalid ' . $key . '.']);
        }
        if ($value !== null) {
            $value = trim($value);
            if (mb_strlen($value) > $maxLength[$key]) {
                reply(400, ['success' => false, 'message' => ucfirst($key) . ' is too long.']);
            }
            if ($value === '') $value = null;
        }
    }
    unset($value);

    $stmt = $conn->prepare(
        "INSERT INTO pet_adoption_posts
         (user_id, pet_name, animal_type, sex, age_months,
          breed, description, health_notes, barangay, location_details, status)
         VALUES
         (:user_id, :pet_name, :animal_type, :sex, :age_months,
          :breed, :description, :health_notes, :barangay, :location_details, 'available')"
    );
    $stmt->execute([
        ':user_id' => $userId,
        ':pet_name' => $petName,
        ':animal_type' => $animalType,
        ':sex' => $sex,
        ':age_months' => $ageMonths,
        ':breed' => $breed,
        ':description' => $description,
        ':health_notes' => $healthNotes,
        ':barangay' => $barangay,
        ':location_details' => $locationDetails
    ]);

    reply(201, [
        'success' => true,
        'message' => 'Pet adoption post created successfully.',
        'adoption_id' => (int)$conn->lastInsertId()
    ]);
} catch (Throwable $e) {
    error_log('[PawRescue Adoption Create Post] ' . $e->getMessage());
    reply(500, ['success' => false, 'message' => 'Unable to create adoption post.']);
}
