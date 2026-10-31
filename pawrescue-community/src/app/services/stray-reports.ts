import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Capacitor } from '@capacitor/core';

// =====================================
// PAWRESCUE COMMUNITY
// STRAY ANIMAL ASSISTANCE API SERVICE
// File: src/app/services/stray-reports.ts
// =====================================

export type StrayAnimalType = 'dog' | 'cat';

export type StrayAssistanceReason =
  | 'injured'
  | 'sick'
  | 'trapped'
  | 'aggressive'
  | 'abandoned'
  | 'roaming'
  | 'other';

export type StrayReportStatus =
  | 'pending'
  | 'under_review'
  | 'in_progress'
  | 'resolved'
  | 'rejected';

export interface CreateStrayReportRequest {
  animal_type: StrayAnimalType;
  assistance_reason: StrayAssistanceReason;
  description: string;
  incident_date: string; // YYYY-MM-DD
  location_address: string;
  latitude: number | null;
  longitude: number | null;
}

export interface CreateStrayReportResponse {
  success: boolean;
  message: string;
  report_id: number;
  status?: 'pending';
}

export interface StrayPhotoUploadResponse {
  success: boolean;
  message: string;
  photo_id?: number;
  photo_path?: string;
  photo_count?: number;
  max_photos?: number;
}

// Matches pawrescue_api/stray/get_my_reports.php.
export interface StrayReportPhoto {
  id: number;
  photo_url: string;
  sort_order: number;
  created_at: string;
}

export interface StrayReport {
  id: number;
  animal_type: StrayAnimalType;
  assistance_reason: StrayAssistanceReason;
  description: string;
  incident_date: string;
  location_address: string;
  latitude: number | null;
  longitude: number | null;
  status: StrayReportStatus;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  photos: StrayReportPhoto[];
  photo_count: number;
  cover_photo_url: string | null;
}

export interface MyStrayReportsResponse {
  success: boolean;
  message: string;
  reports: StrayReport[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class StrayReportsService {
  private readonly http = inject(HttpClient);

  // XAMPP folder under C:/xampp/htdocs.
  private readonly backendPath =
    '/pawrescue-community-itws07/pawrescue_api/stray';

  // Change this if the XAMPP computer's Wi-Fi IP changes.
  private readonly nativeBackendHost = '192.168.0.146';

  // Apache uses port 80. Ionic's dev server (8100/8101) is separate.
  private readonly backendOrigin = `http://${this.getBackendHost()}`;
  private readonly apiUrl = `${this.backendOrigin}${this.backendPath}`;

  private getBackendHost(): string {
    if (Capacitor.isNativePlatform()) {
      return this.nativeBackendHost;
    }

    const hostname = window.location.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return hostname;
    }

    if (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) {
      return hostname;
    }

    return this.nativeBackendHost;
  }

  private authHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('pawrescue_token') || '';
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  createReport(
    payload: CreateStrayReportRequest
  ): Observable<CreateStrayReportResponse> {
    // Keep the endpoint name as it exists in your current project.
    return this.http.post<CreateStrayReportResponse>(
      `${this.apiUrl}/stray_create_report.php`,
      payload,
      { headers: this.authHeaders() }
    );
  }

  uploadPhoto(
    reportId: number,
    file: File
  ): Observable<StrayPhotoUploadResponse> {
    const formData = new FormData();
    formData.append('report_id', String(reportId));
    formData.append('photo', file, file.name);

    return this.http.post<StrayPhotoUploadResponse>(
      `${this.apiUrl}/upload_photo.php`,
      formData,
      { headers: this.authHeaders() }
    );
  }

  // Retrieve only reports belonging to the authenticated resident.
  // The backend determines ownership from the auth token, not a user ID.
  getMyReports(limit = 20, offset = 0): Observable<MyStrayReportsResponse> {
    const params = new HttpParams()
      .set('limit', String(limit))
      .set('offset', String(offset));

    return this.http.get<MyStrayReportsResponse>(
      `${this.apiUrl}/get_my_reports.php`,
      { headers: this.authHeaders(), params }
    ).pipe(
      map((response) => ({
        ...response,
        // PHP returns URLs starting with /pawrescue-community-itws07/.
        // Convert them to Apache URLs so they work even when Ionic runs
        // on localhost:8100 or localhost:8101 (or inside Android).
        reports: response.reports.map((report) => ({
          ...report,
          cover_photo_url: this.toPhotoUrl(report.cover_photo_url),
          photos: report.photos.map((photo) => ({
            ...photo,
            photo_url: this.toPhotoUrl(photo.photo_url) ?? '',
          })),
        })),
      }))
    );
  }

  private toPhotoUrl(path: string | null): string | null {
    if (!path) return null;

    // The server returns an absolute URL *path*, not the full URL.
    // Only construct URLs for files in this backend's stray uploads directory.
    const expectedPrefix =
      '/pawrescue-community-itws07/pawrescue_api/uploads/strays/';
    if (!path.startsWith(expectedPrefix)) return null;

    return `${this.backendOrigin}${path}`;
  }
}
