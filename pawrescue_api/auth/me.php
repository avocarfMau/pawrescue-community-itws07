
<?php

// =====================================
// PAWRESCUE COMMUNITY
// VERIFY AUTHENTICATED SESSION
// =====================================

// =====================================
// RESPONSE HEADERS
// =====================================

// CORS is automatically handled by
// cors.php through .htaccess.

header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store");

// =====================================
// ALLOW GET REQUESTS ONLY
// =====================================

if ($_SERVER["REQUEST_METHOD"] !== "GET") {

    http_response_code(405);

    header("Allow: GET, OPTIONS");

    echo json_encode([
        "success" => false,
        "message" => "Method not allowed."
    ]);

    exit;
}

// =====================================
// AUTHENTICATION MIDDLEWARE
// =====================================

require_once __DIR__ . "/../middleware/auth_middleware.php";

try {

    // Verify token and retrieve user.
    $auth = authenticate();

    $user = $auth["user"];

    // =====================================
    // SUCCESS RESPONSE
    // =====================================

    http_response_code(200);

    echo json_encode([
        "success" => true,
        "message" => "Authenticated successfully.",
        "user" => [
            "id" => (int) $user["id"],
            "full_name" => $user["full_name"],
            "email" => $user["email"],
            "username" => $user["username"],
            "contact_number" => $user["contact_number"],
            "role" => $user["role"]
        ]
    ]);

} catch (Throwable $e) {

    error_log(
        "PawRescue Session Verification Error: " .
        $e->getMessage()
    );

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => "Unable to verify session."
    ]);
}
