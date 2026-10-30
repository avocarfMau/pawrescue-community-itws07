
<?php

// =====================================
// PAWRESCUE COMMUNITY
// CREATE LOST OR FOUND PET REPORT
// =====================================

// CORS is automatically handled by
// cors.php through .htaccess.

header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store");

// =====================================
// RESPONSE HELPER
// =====================================

function sendResponse(
    $status,
    $success,
    $message,
    $extra = []
) {
    http_response_code($status);

    echo json_encode(array_merge([
        "success" => $success,
        "message" => $message
    ], $extra));

    exit;
}

// =====================================
// PERFORMANCE MONITORING
// =====================================

$requestStart = microtime(true);

function logPerformance(
    $stage,
    $startTime
) {
    $elapsed = round(
        (microtime(true) - $startTime) * 1000,
        2
    );

    error_log(
        "[PawRescue Performance] " .
        $stage . ": " .
        $elapsed . " ms"
    );
}

// =====================================
// VALIDATE REQUEST METHOD
// =====================================

// OPTIONS requests are already
// handled by centralized cors.php.

if ($_SERVER["REQUEST_METHOD"] !== "POST") {

    header("Allow: POST, OPTIONS");

    sendResponse(
        405,
        false,
        "Method not allowed."
    );
}

// =====================================
// LOAD AUTHENTICATION
// =====================================

require_once __DIR__ .
    "/../middleware/auth_middleware.php";

// =====================================
// VALIDATE CONTENT TYPE
// =====================================

if (
    stripos(
        $_SERVER["CONTENT_TYPE"] ?? "",
        "application/json"
    ) === false
) {
    sendResponse(
        415,
        false,
        "Content-Type must be application/json."
    );
}

try {

    // =====================================
    // AUTHENTICATE RESIDENT
    // =====================================

    $authStart = microtime(true);

    $auth = authenticate(["resident"]);

    $conn = $auth["connection"];
    $userId = (int) $auth["user"]["id"];

    logPerformance(
        "Authentication",
        $authStart
    );

    // =====================================
    // READ REQUEST DATA
    // =====================================

    $validationStart = microtime(true);

    $data = json_decode(
        file_get_contents("php://input"),
        true
    );

    if (
        !is_array($data) ||
        array_is_list($data)
    ) {
        sendResponse(
            400,
            false,
            "Invalid JSON request."
        );
    }

    // =====================================
    // REQUIRED FIELDS
    // =====================================

    $required = [
        "report_type",
        "animal_type",
        "description",
        "incident_date",
        "location_address"
    ];

    foreach ($required as $field) {

        if (
            !isset($data[$field]) ||
            !is_string($data[$field]) ||
            trim($data[$field]) === ""
        ) {
            sendResponse(
                400,
                false,
                "Please complete all required fields."
            );
        }
    }

    // =====================================
    // EXTRACT DATA
    // =====================================

    $reportType = trim(
        $data["report_type"]
    );

    $animalType = trim(
        $data["animal_type"]
    );

    $description = trim(
        $data["description"]
    );

    $incidentDate = trim(
        $data["incident_date"]
    );

    $location = trim(
        $data["location_address"]
    );

    $petName = $data["pet_name"] ?? null;
    $latitude = $data["latitude"] ?? null;
    $longitude = $data["longitude"] ?? null;

    // =====================================
    // VALIDATE REPORT TYPE
    // =====================================

    if (!in_array(
        $reportType,
        ["lost", "found"],
        true
    )) {
        sendResponse(
            400,
            false,
            "Invalid report type."
        );
    }

    // =====================================
    // VALIDATE ANIMAL TYPE
    // =====================================

    if (!in_array(
        $animalType,
        ["dog", "cat"],
        true
    )) {
        sendResponse(
            400,
            false,
            "Invalid animal type."
        );
    }

    // =====================================
    // VALIDATE TEXT LENGTHS
    // =====================================

    if (
        mb_strlen($description) > 5000 ||
        mb_strlen($location) > 255
    ) {
        sendResponse(
            400,
            false,
            "Description or location is too long."
        );
    }

    // =====================================
    // VALIDATE OPTIONAL PET NAME
    // =====================================

    if ($petName !== null) {

        if (
            !is_string($petName) ||
            mb_strlen($petName) > 100
        ) {
            sendResponse(
                400,
                false,
                "Invalid pet name."
            );
        }

        $petName = trim($petName);

        if ($petName === "") {
            $petName = null;
        }
    }

    // =====================================
    // VALIDATE INCIDENT DATE
    // =====================================

    $date = DateTimeImmutable::createFromFormat(
        "!Y-m-d",
        $incidentDate
    );

    if (
        !$date ||
        $date->format("Y-m-d") !== $incidentDate
    ) {
        sendResponse(
            400,
            false,
            "Invalid incident date."
        );
    }

    if (
        $date > new DateTimeImmutable("today")
    ) {
        sendResponse(
            400,
            false,
            "Incident date cannot be in the future."
        );
    }

    // =====================================
    // VALIDATE GPS COORDINATES
    // =====================================

    // Latitude and longitude must both
    // be provided or both be null.

    if (
        ($latitude === null) !==
        ($longitude === null)
    ) {
        sendResponse(
            400,
            false,
            "Both coordinates are required."
        );
    }

    if ($latitude !== null) {

        if (
            !is_numeric($latitude) ||
            !is_numeric($longitude) ||
            !is_finite((float) $latitude) ||
            !is_finite((float) $longitude) ||
            (float) $latitude < -90 ||
            (float) $latitude > 90 ||
            (float) $longitude < -180 ||
            (float) $longitude > 180
        ) {
            sendResponse(
                400,
                false,
                "Invalid coordinates."
            );
        }
    }

    logPerformance(
        "Validation",
        $validationStart
    );

    // =====================================
    // INSERT PET REPORT INTO DATABASE
    // =====================================

    $databaseStart = microtime(true);

    $stmt = $conn->prepare(
        "INSERT INTO pet_reports
        (
            user_id,
            report_type,
            animal_type,
            pet_name,
            description,
            incident_date,
            location_address,
            latitude,
            longitude,
            status
        )
        VALUES
        (
            :user_id,
            :report_type,
            :animal_type,
            :pet_name,
            :description,
            :incident_date,
            :location_address,
            :latitude,
            :longitude,
            'pending'
        )"
    );

    $stmt->execute([
        ":user_id" => $userId,
        ":report_type" => $reportType,
        ":animal_type" => $animalType,
        ":pet_name" => $petName,
        ":description" => $description,
        ":incident_date" => $incidentDate,
        ":location_address" => $location,
        ":latitude" => $latitude,
        ":longitude" => $longitude
    ]);

    $reportId = (int) $conn->lastInsertId();

    logPerformance(
        "Database Insert",
        $databaseStart
    );

    // =====================================
    // TOTAL PROCESSING TIME
    // =====================================

    logPerformance(
        "Total Request",
        $requestStart
    );

    // =====================================
    // SUCCESS RESPONSE
    // =====================================

    sendResponse(
        201,
        true,
        "Pet report submitted successfully!",
        [
            "report_id" => $reportId
        ]
    );

} catch (Throwable $e) {

    error_log(
        "[PawRescue Create Report Error] " .
        $e->getMessage()
    );

    logPerformance(
        "Failed Request",
        $requestStart
    );

    sendResponse(
        500,
        false,
        "Unable to submit report. Please try again."
    );
}
