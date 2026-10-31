import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
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

@Injectable({
  providedIn: 'root',
})
export class StrayReportsService {
  private readonly http = inject(HttpClient);

  // Match your current XAMPP folder shown in VS Code.
  // If your project is actually served from C:\\xampp\\htdocs\\pawrescue,
  // change this to '/pawrescue/pawrescue_api/stray'.
  private readonly backendPath =
    '/pawrescue-community-itws07/pawrescue_api/stray';

  // Update this address if testing the installed Android app on a
  // different LAN from your XAMPP computer.
  private readonly nativeBackendHost = '192.168.100.66';

  private readonly apiUrl =
    `http://${this.getBackendHost()}${this.backendPath}`;

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
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) {
      return hostname;
    }

    return this.nativeBackendHost;
  }

  private authHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('pawrescue_token') || '';

    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  // Your VS Code screenshot currently shows the file name
  // stray_create_report.php inside pawrescue_api/stray/.
  // If you rename it to create_report.php, update this URL too.
  createReport(
    payload: CreateStrayReportRequest
  ): Observable<CreateStrayReportResponse> {
    return this.http.post<CreateStrayReportResponse>(
      `${this.apiUrl}/stray_create_report.php`,
      payload,
      { headers: this.authHeaders() }
    );
  }

  // For the next stage: use this method in the report page so
  // both report creation and photo uploads share the same URL.
  uploadPhoto(
    reportId: number,
    file: File
  ): Observable<StrayPhotoUploadResponse> {
    const body = new FormData();
    body.append('report_id', String(reportId));
    body.append('photo', file, file.name);

    return this.http.post<StrayPhotoUploadResponse>(
      `${this.apiUrl}/upload_photo.php`,
      body,
      { headers: this.authHeaders() }
    );
  }
}
