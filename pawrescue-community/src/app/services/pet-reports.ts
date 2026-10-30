import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { concatMap, toArray } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';

// =====================================
// PET REPORT PHOTO INFORMATION
// =====================================

export interface PetReportPhoto {
  id: number;
  photo_path: string;
  sort_order: number;
  created_at: string;
}

// =====================================
// PET REPORT INFORMATION
// =====================================

export interface PetReport {
  id: number;
  report_type: 'lost' | 'found';
  animal_type: 'dog' | 'cat';
  pet_name: string | null;
  description: string;
  photo_path: string | null;
  photos: PetReportPhoto[];
  photo_count: number;
  incident_date: string;
  location_address: string;
  latitude: string | null;
  longitude: string | null;
  status: string;
  created_at: string;
  reporter_name: string;
}

// =====================================
// RESPONSE WHEN RETRIEVING REPORTS
// =====================================

export interface PetReportsResponse {
  success: boolean;
  message: string;
  count: number;
  reports: PetReport[];
}

// =====================================
// DATA FOR CREATING A PET REPORT
// =====================================

export interface CreatePetReportRequest {
  report_type: 'lost' | 'found';
  animal_type: 'dog' | 'cat';
  pet_name: string | null;
  description: string;
  incident_date: string;
  location_address: string;
  latitude: number | null;
  longitude: number | null;
}

// =====================================
// RESPONSE AFTER CREATING A REPORT
// =====================================

export interface CreatePetReportResponse {
  success: boolean;
  message: string;
  report_id: number;
}

// =====================================
// DATA FOR UPDATING A PET REPORT
// =====================================

export interface UpdatePetReportRequest {
  report_id: number;
  report_type: 'lost' | 'found';
  animal_type: 'dog' | 'cat';
  pet_name: string | null;
  description: string;
  incident_date: string;
  location_address: string;
  latitude: number | null;
  longitude: number | null;
}

// =====================================
// RESPONSE AFTER UPDATING A REPORT
// =====================================

export interface UpdatePetReportResponse {
  success: boolean;
  message: string;
  report_id: number;
}

// =====================================
// RESPONSE AFTER UPLOADING PHOTO
// =====================================

export interface UploadPhotoResponse {
  success: boolean;
  message: string;
  report_id: number;
  photo_id: number;
  photo_path: string;
  photo_count: number;
  max_photos: number;
}

// =====================================
// RESPONSE AFTER DELETING A REPORT PHOTO
// =====================================

export interface DeletePhotoResponse {
  success: boolean;
  message: string;
  report_id: number;
  deleted_photo_id: number;
  photo_count: number;
  primary_photo_path: string | null;
}

// =====================================
// RESPONSE AFTER RESOLVING REPORT
// =====================================

export interface ResolveReportResponse {
  success: boolean;
  message: string;
  report_id: number;
  status: 'resolved';
}

@Injectable({
  providedIn: 'root'
})
export class PetReportsService {
  private http = inject(HttpClient);

  // =====================================
  // LOCAL NETWORK CONFIGURATION
  // =====================================

  /**
   * Desktop:
   * http://localhost:8100
   * -> http://localhost/pawrescue/pawrescue_api
   *
   * Cellphone:
   * http://192.168.100.23:8100
   * -> http://192.168.100.23/pawrescue/pawrescue_api
   *
   * Native Capacitor application:
   * -> Uses the configured LAN IP.
   *
   * This setup is for local development.
   */

  private readonly backendHost =
    this.getBackendHost();

  private readonly apiBaseUrl =
    `http://${this.backendHost}`;

  private readonly backendPath =
    '/pawrescue/pawrescue_api';

  private readonly apiUrl =
    `${this.apiBaseUrl}${this.backendPath}/reports`;

  // =====================================
  // GET BACKEND HOST
  // =====================================

  private getBackendHost(): string {
    // Native WebNative / Capacitor preview
    if (Capacitor.isNativePlatform()) {
      return '192.168.100.23';
    }

    const hostname = window.location.hostname;

    // Desktop development
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1'
    ) {
      return hostname;
    }

    // Ionic development accessed through LAN
    if (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) {
      return hostname;
    }

    // Fallback for local mobile testing
    return '192.168.100.23';
  }

  // =====================================
  // AUTHENTICATION HEADERS
  // =====================================

  private getHeaders(): HttpHeaders {
    const token =
      sessionStorage.getItem('pawrescue_token');

    return new HttpHeaders({
      Authorization: `Bearer ${token || ''}`
    });
  }

  // =====================================
  // GET COMMUNITY LOST AND FOUND REPORTS
  // =====================================

  getReports(
    type: 'all' | 'lost' | 'found' = 'all'
  ): Observable<PetReportsResponse> {
    return this.http.get<PetReportsResponse>(
      `${this.apiUrl}/get_reports.php`,
      {
        headers: this.getHeaders(),
        params: { type }
      }
    );
  }

  // =====================================
  // GET LOGGED-IN RESIDENT'S REPORTS
  // =====================================

  getMyReports(
    type: 'all' | 'lost' | 'found' = 'all'
  ): Observable<PetReportsResponse> {
    return this.http.get<PetReportsResponse>(
      `${this.apiUrl}/get_my_reports.php`,
      {
        headers: this.getHeaders(),
        params: { type }
      }
    );
  }

  // =====================================
  // CREATE LOST OR FOUND PET REPORT
  // =====================================

  createReport(
    data: CreatePetReportRequest
  ): Observable<CreatePetReportResponse> {
    return this.http.post<CreatePetReportResponse>(
      `${this.apiUrl}/create_report.php`,
      data,
      {
        headers: this.getHeaders()
      }
    );
  }

  // =====================================
  // UPDATE LOST OR FOUND PET REPORT
  // =====================================

  updateReport(
    data: UpdatePetReportRequest
  ): Observable<UpdatePetReportResponse> {
    return this.http.post<UpdatePetReportResponse>(
      `${this.apiUrl}/update_report.php`,
      data,
      {
        headers: this.getHeaders()
      }
    );
  }

  // =====================================
  // UPLOAD ONE PET PHOTO
  // =====================================

  uploadPhoto(
    reportId: number,
    file: File
  ): Observable<UploadPhotoResponse> {
    const formData = new FormData();

    formData.append(
      'report_id',
      String(reportId)
    );

    formData.append(
      'photo',
      file,
      file.name
    );

    return this.http.post<UploadPhotoResponse>(
      `${this.apiUrl}/upload_photo.php`,
      formData,
      {
        headers: this.getHeaders()
      }
    );
  }

  // =====================================
  // UPLOAD MULTIPLE PET PHOTOS
  // =====================================

  uploadPhotos(
    reportId: number,
    files: File[]
  ): Observable<UploadPhotoResponse[]> {
    // Upload photos one at a time to preserve
    // their order and respect the backend limit.
    // The API allows up to 10 photos per report.
    return from(files).pipe(
      concatMap(file => this.uploadPhoto(reportId, file)),
      toArray()
    );
  }

  // =====================================
  // DELETE ONE OWNED REPORT PHOTO
  // =====================================

  deletePhoto(
    reportId: number,
    photoId: number
  ): Observable<DeletePhotoResponse> {
    return this.http.post<DeletePhotoResponse>(
      `${this.apiUrl}/delete_photo.php`,
      {
        report_id: reportId,
        photo_id: photoId
      },
      {
        headers: this.getHeaders()
      }
    );
  }

  // =====================================
  // MARK PET REPORT AS RESOLVED
  // =====================================

  resolveReport(
    reportId: number
  ): Observable<ResolveReportResponse> {
    return this.http.post<ResolveReportResponse>(
      `${this.apiUrl}/resolve_report.php`,
      {
        report_id: reportId
      },
      {
        headers: this.getHeaders()
      }
    );
  }

  // =====================================
  // GET UPLOADED PET PHOTO URL
  // =====================================

  getPhotoUrl(
    photoPath: string | null
  ): string | null {
    if (!photoPath) {
      return null;
    }

    // Allow only valid pet-upload paths.
    const validPath =
      /^\/(?:pawrescue\/)?pawrescue_api\/uploads\/pets\/[a-f0-9]{32}\.(jpg|png|webp)$/;

    if (!validPath.test(photoPath)) {
      return null;
    }

    // Convert legacy paths to the new backend folder.
    const normalizedPath = photoPath.startsWith(
      '/pawrescue_api/uploads/pets/'
    )
      ? `/pawrescue${photoPath}`
      : photoPath;

    return `${this.apiBaseUrl}${normalizedPath}`;
  }

  // =====================================
  // GET ALL VALID PHOTO URLS FOR A REPORT
  // =====================================

  getReportPhotoUrls(
    report: PetReport
  ): string[] {
    const photoPaths =
      Array.isArray(report.photos) && report.photos.length > 0
        ? report.photos.map(photo => photo.photo_path)
        : (report.photo_path ? [report.photo_path] : []);

    const urls: string[] = [];

    for (const path of photoPaths) {
      const url = this.getPhotoUrl(path);

      if (url && !urls.includes(url)) {
        urls.push(url);
      }
    }

    return urls;
  }
}
