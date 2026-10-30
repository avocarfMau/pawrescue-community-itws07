
import { Injectable, inject } from '@angular/core';

import {
  HttpClient,
  HttpHeaders
} from '@angular/common/http';

import {
  Observable,
  of,
  map,
  catchError
} from 'rxjs';

// =====================================
// USER INFORMATION
// =====================================

export interface User {
  id: number;
  full_name: string;
  email: string;
  username: string;
  role: 'resident' | 'staff';
}

// =====================================
// LOGIN RESPONSE
// =====================================

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  token_type: string;
  expires_at: string;
  user: User;
}

// =====================================
// REGISTRATION REQUEST
// =====================================

export interface RegisterRequest {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  username: string;
  contact_number: string;
  password: string;
  confirm_password: string;
}

// =====================================
// REGISTRATION RESPONSE
// =====================================

export interface RegisterResponse {
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient);

  // =====================================
  // LOCAL NETWORK API CONFIGURATION
  // =====================================

  /*
   * When running in a browser:
   *
   * localhost:8100
   *   -> localhost/pawrescue_api
   *
   * 192.168.100.23:8100
   *   -> 192.168.100.23/pawrescue_api
   *
   * For a native WebNative/Capacitor app,
   * the backend's LAN IP is used.
   *
   * Replace the IP if your computer's
   * local network address changes.
   */

  private readonly backendHost =
    this.getBackendHost();

  private readonly apiUrl =
    `http://${this.backendHost}/pawrescue/pawrescue_api/auth`;

  private getBackendHost(): string {

    const hostname =
      window.location.hostname;

    // Browser development
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1'
    ) {
      return hostname;
    }

    // Ionic development server accessed
    // through the computer's LAN IP.
    if (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) {
      return hostname;
    }

    // Native application / WebNative preview
    return '192.168.100.23';
  }

  // =====================================
  // LOGIN
  // =====================================

  login(
    login: string,
    password: string
  ): Observable<LoginResponse> {

    return this.http.post<LoginResponse>(
      `${this.apiUrl}/login.php`,
      {
        login,
        password
      }
    );
  }

  // =====================================
  // REGISTRATION
  // =====================================

  register(
    data: RegisterRequest
  ): Observable<RegisterResponse> {

    return this.http.post<RegisterResponse>(
      `${this.apiUrl}/register.php`,
      data
    );
  }

  // =====================================
  // SAVE AUTHENTICATION SESSION
  // =====================================

  saveSession(
    response: LoginResponse
  ): void {

    sessionStorage.setItem(
      'pawrescue_token',
      response.token
    );
  }

  // =====================================
  // GET SAVED TOKEN
  // =====================================

  getToken(): string | null {

    return sessionStorage.getItem(
      'pawrescue_token'
    );
  }

  // =====================================
  // VERIFY SESSION
  // =====================================

  verifySession(
    requiredRole?: 'resident' | 'staff'
  ): Observable<boolean> {

    const token =
      this.getToken();

    if (!token) {
      return of(false);
    }

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });

    return this.http.get<{
      success: boolean;
      user: User;
    }>(
      `${this.apiUrl}/me.php`,
      {
        headers
      }
    ).pipe(

      map(response => {

        if (!response.success) {
          return false;
        }

        return (
          !requiredRole ||
          response.user.role === requiredRole
        );
      }),

      catchError(error => {

        console.error(
          'Session verification failed:',
          error.status,
          error.message
        );

        if (error.status === 401) {
          this.clearSession();
        }

        return of(false);
      })
    );
  }

  // =====================================
  // LOGOUT
  // =====================================

  logout(): Observable<boolean> {

    const token =
      this.getToken();

    if (!token) {

      this.clearSession();

      return of(true);
    }

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`
    });

    return this.http.post<{
      success: boolean;
      message: string;
    }>(
      `${this.apiUrl}/logout.php`,
      {},
      {
        headers
      }
    ).pipe(

      map(response => {

        if (response.success) {

          this.clearSession();

          return true;
        }

        return false;
      }),

      catchError(error => {

        console.error(
          'Logout request failed:',
          error.status,
          error.message
        );

        if (error.status === 401) {

          this.clearSession();

          return of(true);
        }

        return of(false);
      })
    );
  }

  // =====================================
  // CLEAR AUTHENTICATION SESSION
  // =====================================

  clearSession(): void {

    sessionStorage.removeItem(
      'pawrescue_token'
    );
  }
}
