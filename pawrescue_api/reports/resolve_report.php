
<?php
// =====================================
// PAWRESCUE COMMUNITY
// MARK PET REPORT AS RESOLVED
// =====================================

// CORS is handled by centralized cors.php.

header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store");

// =====================================
// JSON RESPONSE HELPER
// =====================================

function sendResolveResponse(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

// =====================================
// VALIDATE REQUEST METHOD
// =====================================

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    header("Allow: POST, OPTIONS");
    sendResolveResponse(405, [
        "success" => false,
        "message" => "Method not allowed."
    ]);
}

// =====================================
// AUTHENTICATION MIDDLEWARE
// =====================================

require_once __DIR__ . "/../middleware/auth_middleware.php";

try {
    // =====================================
    // AUTHENTICATE RESIDENT
    // =====================================

    $auth = authenticate(["resident"]);
    $conn = $auth["connection"];
    $residentId = (int) $auth["user"]["id"];

    // =====================================
    // READ REQUEST DATA
    // =====================================

    $rawInput = file_get_contents("php://input");
    $data = json_decode($rawInput ?: "", true);

    if (!is_array($data)) {
        sendResolveResponse(400, [
            "success" => false,
            "message" => "Invalid request data."
        ]);
    }

    $reportId = filter_var(
        $data["report_id"] ?? null,
        FILTER_VALIDATE_INT,
        ["options" => ["min_range" => 1]]
    );

    if ($reportId === false || $reportId === null) {
        sendResolveResponse(400, [
            "success" => false,
            "message" => "Invalid report ID."
        ]);
    }

    // =====================================
    // VERIFY REPORT OWNERSHIP
    // =====================================

    $stmt = $conn->prepare("
        SELECT id, status
        FROM pet_reports
        WHERE id = :report_id
          AND user_id = :resident_id
          AND report_type IN ('lost', 'found')
        LIMIT 1
    ");

    $stmt->execute([
        ":report_id" => $reportId,
        ":resident_id" => $residentId
    ]);

    $report = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$report) {
        sendResolveResponse(404, [
            "success" => false,
            "message" => "Report not found or access denied."
        ]);
    }

    // =====================================
    // VALIDATE CURRENT STATUS
    // =====================================

    if ($report["status"] === "resolved") {
        sendResolveResponse(409, [
            "success" => false,
            "message" => "This report is already resolved."
        ]);
    }

    if ($report["status"] === "closed") {
        sendResolveResponse(409, [
            "success" => false,
            "message" => "Closed reports cannot be modified."
        ]);
    }

    if (!in_array(
        $report["status"],
        ["pending", "under_review", "in_progress"],
        true
    )) {
        sendResolveResponse(409, [
            "success" => false,
            "message" => "This report cannot be resolved."
        ]);
    }

    // =====================================
    // UPDATE REPORT STATUS
    // =====================================

    $update = $conn->prepare("
        UPDATE pet_reports
        SET status = 'resolved',
            updated_at = NOW()
        WHERE id = :report_id
          AND user_id = :resident_id
          AND status IN ('pending', 'under_review', 'in_progress')
    ");

    $update->execute([
        ":report_id" => $reportId,
        ":resident_id" => $residentId
    ]);

    if ($update->rowCount() !== 1) {
        sendResolveResponse(409, [
            "success" => false,
            "message" => "Report status changed. Please refresh and try again."
        ]);
    }

    // =====================================
    // SUCCESS RESPONSE
    // =====================================

    sendResolveResponse(200, [
        "success" => true,
        "message" => "Pet report marked as resolved successfully.",
        "report_id" => (int) $reportId,
        "status" => "resolved"
    ]);

} catch (Throwable $e) {
    error_log(
        "[PawRescue Resolve Report Error] " .
        $e->getMessage()
    );

    sendResolveResponse(500, [
        "success" => false,
        "message" => "Unable to resolve pet report."
    ]);
}
