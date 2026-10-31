
import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpHeaders,
  HttpParams
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { Capacitor } from '@capacitor/core';

// =====================================
// PAWRESCUE COMMUNITY - ADOPTION SERVICE
// =====================================

export type AdoptionAnimalType = 'dog' | 'cat';

export type AdoptionStatus =
  | 'available'
  | 'reserved'
  | 'adopted'
  | 'closed';

export type AdoptionRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'completed';

// =====================================
// ADOPTION PHOTO
// =====================================

export interface AdoptionPhoto {
  id: number;
  adoption_id: number;
  photo_path: string;
  sort_order: number;
  created_at: string;
}

// =====================================
// ADOPTION POST
// =====================================

export interface AdoptionPost {
  id: number;
  user_id: number;
  pet_name: string;
  animal_type: AdoptionAnimalType;
  sex: 'male' | 'female' | 'unknown';
  age_months: number | null;
  breed: string | null;
  description: string;
  health_notes: string | null;
  barangay: string;
  location_details: string | null;
  status: AdoptionStatus;
  adopted_at: string | null;
  created_at: string;
  updated_at: string;
  owner_name: string;
  photos: AdoptionPhoto[];
  photo_count: number;
  photo_path: string | null;
  is_owner: boolean;
}

// =====================================
// ADOPTION REQUEST
// =====================================

export interface AdoptionRequest {
  id: number;
  adoption_id: number;
  requester_id: number;
  message: string;
  status: AdoptionRequestStatus;
  created_at: string;
  updated_at: string;
  pet_name: string;
  animal_type: AdoptionAnimalType;
  adoption_status: AdoptionStatus;
  owner_id: number;
  requester_name: string;
  owner_name: string;
}

// =====================================
// NEW ADOPTION POST DATA
// =====================================

export interface NewAdoptionPost {
  pet_name: string;
  animal_type: AdoptionAnimalType;
  sex: 'male' | 'female' | 'unknown';
  age_months: number | null;
  breed: string | null;
  description: string;
  health_notes: string | null;
  barangay: string;
  location_details: string | null;
}

// =====================================
// API RESPONSES
// =====================================

export interface ApiResult {
  success: boolean;
  message: string;
}

export interface AdoptionPostsResponse extends ApiResult {
  count: number;
  posts: AdoptionPost[];
}

export interface AdoptionRequestsResponse extends ApiResult {
  count: number;
  requests: AdoptionRequest[];
}

export interface CreateAdoptionPostResponse extends ApiResult {
  adoption_id: number;
}

export interface UploadAdoptionPhotoResponse extends ApiResult {
  adoption_id: number;
  photo_id: number;
  photo_path: string;
  photo_count: number;
}

export interface SubmitAdoptionRequestResponse extends ApiResult {
  request_id: number;
  status: AdoptionRequestStatus;
}

// =====================================
// PET ADOPTION SERVICE
// =====================================

@Injectable({
  providedIn: 'root'
})
export class PetAdoptionService {

  private readonly http = inject(HttpClient);

  private readonly baseUrl =
    `http://${this.getBackendHost()}/pawrescue/pawrescue_api`;

  private readonly apiUrl =
    `${this.baseUrl}/adoption`;

  // =====================================
  // BACKEND HOST CONFIGURATION
  // =====================================

  private getBackendHost(): string {

    if (Capacitor.isNativePlatform()) {
      return '192.168.100.23';
    }

    const hostname = window.location.hostname;

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) {
      return hostname;
    }

    return '192.168.100.23';
  }

  // =====================================
  // AUTHORIZATION HEADERS
  // =====================================

  private headers(): HttpHeaders {

    const token =
      sessionStorage.getItem('pawrescue_token') || '';

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  // =====================================
  // GET ADOPTION POSTS
  // =====================================

  getPosts(
    type: 'all' | 'dog' | 'cat' = 'all',
    scope: 'community' | 'mine' = 'community',
    status: AdoptionStatus | 'all' = 'all',
    id?: number
  ): Observable<AdoptionPostsResponse> {

    let params = new HttpParams()
      .set('type', type)
      .set('scope', scope)
      .set('status', status);

    if (id !== undefined) {
      params = params.set('id', String(id));
    }

    return this.http.get<AdoptionPostsResponse>(
      `${this.apiUrl}/get_posts.php`,
      {
        headers: this.headers(),
        params
      }
    );
  }

  // =====================================
  // CREATE ADOPTION POST
  // =====================================

  createPost(
    data: NewAdoptionPost
  ): Observable<CreateAdoptionPostResponse> {

    return this.http.post<CreateAdoptionPostResponse>(
      `${this.apiUrl}/create_post.php`,
      data,
      {
        headers: this.headers()
      }
    );
  }

  // =====================================
  // UPLOAD ADOPTION PHOTO
  // =====================================

  uploadPhoto(
    adoptionId: number,
    photo: File
  ): Observable<UploadAdoptionPhotoResponse> {

    const body = new FormData();

    body.append(
      'adoption_id',
      String(adoptionId)
    );

    body.append(
      'photo',
      photo,
      photo.name
    );

    return this.http.post<UploadAdoptionPhotoResponse>(
      `${this.apiUrl}/upload_photo.php`,
      body,
      {
        headers: this.headers()
      }
    );
  }

  // =====================================
  // SUBMIT ADOPTION REQUEST
  // =====================================

  submitRequest(
    adoptionId: number,
    message: string
  ): Observable<SubmitAdoptionRequestResponse> {

    return this.http.post<SubmitAdoptionRequestResponse>(
      `${this.apiUrl}/submit_request.php`,
      {
        adoption_id: adoptionId,
        message
      },
      {
        headers: this.headers()
      }
    );
  }

  // =====================================
  // GET SENT OR RECEIVED REQUESTS
  // =====================================

  getRequests(
    direction: 'sent' | 'received'
  ): Observable<AdoptionRequestsResponse> {

    return this.http.get<AdoptionRequestsResponse>(
      `${this.apiUrl}/get_requests.php`,
      {
        headers: this.headers(),
        params: { direction }
      }
    );
  }

  // =====================================
  // APPROVE OR REJECT REQUEST
  // =====================================

  respondToRequest(
    requestId: number,
    action: 'approve' | 'reject'
  ): Observable<ApiResult> {

    return this.http.post<ApiResult>(
      `${this.apiUrl}/respond_request.php`,
      {
        request_id: requestId,
        action
      },
      {
        headers: this.headers()
      }
    );
  }

  // =====================================
  // COMPLETE PET ADOPTION
  // =====================================

  completeAdoption(
    adoptionId: number
  ): Observable<ApiResult> {

    return this.http.post<ApiResult>(
      `${this.apiUrl}/complete_adoption.php`,
      {
        adoption_id: adoptionId
      },
      {
        headers: this.headers()
      }
    );
  }

  // =====================================
  // GET PHOTO URL
  // =====================================

  getPhotoUrl(
    photoPath: string | null | undefined
  ): string | null {

    if (!photoPath) {
      return null;
    }

    const validPath =
      /^\/(?:pawrescue\/)?pawrescue_api\/uploads\/adoptions\/[a-f0-9]{32}\.(jpg|png|webp)$/;

    if (!validPath.test(photoPath)) {
      return null;
    }

    const normalizedPath =
      photoPath.startsWith('/pawrescue_api/')
        ? `/pawrescue${photoPath}`
        : photoPath;

    return `http://${this.getBackendHost()}${normalizedPath}`;
  }

  // =====================================
  // GET ALL PHOTO URLS
  // =====================================

  getPhotoUrls(post: AdoptionPost): string[] {

    const paths = (post.photos || [])
      .map(photo => photo.photo_path);

    if (
      paths.length === 0 &&
      post.photo_path
    ) {
      paths.push(post.photo_path);
    }

    return Array.from(new Set(paths))
      .map(path => this.getPhotoUrl(path))
      .filter(
        (url): url is string => !!url
      );
  }
}
