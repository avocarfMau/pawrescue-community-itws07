import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import {
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraDirection } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import * as L from 'leaflet';
import { firstValueFrom } from 'rxjs';
import {
  CreateStrayReportRequest,
  StrayAnimalType,
  StrayAssistanceReason,
  StrayReportsService,
} from '../../services/stray-reports';

type AnimalType = '' | StrayAnimalType;
type AssistanceReason = '' | StrayAssistanceReason;

interface SelectedStrayPhoto {
  file: File;
  previewUrl: string;
  uploaded: boolean;
}

interface PhotoUploadResponse {
  success: boolean;
  message: string;
  photo_id?: number;
  photo_path?: string;
}

@Component({
  selector: 'app-report-stray',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonButton,
    IonSpinner,
  ],
  templateUrl: './report-stray.page.html',
  styleUrls: ['./report-stray.page.scss'],
})
export class ReportStrayPage implements OnDestroy {
  private readonly service = inject(StrayReportsService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private destroyed = false;
  private locationRequestId = 0;
  private map: L.Map | null = null;
  private marker: L.Marker | null = null;

  readonly today = this.localDate(new Date());
  readonly maxPhotos = 10;
  animalType: AnimalType = '';
  assistanceReason: AssistanceReason = '';
  description = '';
  incidentDate = this.today;
  locationAddress = '';
  latitude: number | null = null;
  longitude: number | null = null;
  gettingLocation = false;
  locationMessage = '';
  locationError = '';
  showMap = false;
  selectedPhotos: SelectedStrayPhoto[] = [];
  photoMessage = '';
  cameraOpening = false;
  showPreview = false;
  isSubmitting = false;
  submissionComplete = false;
  submittedReportId: number | null = null;
  submitMessage = '';
  uploadingPhotos = false;
  currentPhotoNumber = 0;
  uploadedPhotosCount = 0;
  allPhotosUploaded = false;
  photoUploadMessage = '';
  photoUploadUncertain = false;

  // Keep both steps in this component so the resident's entered data and
  // selected photos remain available while reviewing the report.
  @ViewChild(IonContent) private pageContent?: IonContent;

  @ViewChild('locationMap')
  set locationMapElement(element: ElementRef<HTMLDivElement> | undefined) {
    if (element && this.showMap && !this.map && !this.destroyed) {
      this.initMap(element.nativeElement);
    }
  }

  private localDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  get reasonLabel(): string {
    const labels: Record<StrayAssistanceReason, string> = {
      injured: 'Injured', sick: 'Sick', trapped: 'Trapped',
      aggressive: 'Aggressive / safety concern', abandoned: 'Possibly abandoned',
      roaming: 'Roaming / unattended', other: 'Other concern',
    };
    return this.assistanceReason ? labels[this.assistanceReason] : '';
  }

  private get blocked(): boolean {
    return this.destroyed || this.isSubmitting || this.uploadingPhotos || this.submissionComplete;
  }

  private onUI(change: () => void): void {
    if (this.destroyed) return;
    this.zone.run(change);
  }

  async useCurrentLocation(): Promise<void> {
    if (this.blocked || this.gettingLocation) return;
    this.locationError = '';
    this.locationMessage = '';

    if (!Capacitor.isNativePlatform() && !window.isSecureContext) {
      this.locationError = 'Browser GPS requires HTTPS or localhost. Open the application on localhost, or use Choose on Map to select the location manually.';
      return;
    }

    this.gettingLocation = true;
    const requestId = ++this.locationRequestId;

    try {
      if (Capacitor.isNativePlatform()) {
        let permissions = await Geolocation.checkPermissions();
        if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
          permissions = await Geolocation.requestPermissions();
        }
        if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
          throw new Error('Permission denied');
        }
      }
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });
      if (this.destroyed || requestId !== this.locationRequestId) return;
      this.onUI(() => {
        this.selectCoordinates(position.coords.latitude, position.coords.longitude);
        this.locationMessage = 'GPS location captured. Confirm that the pin represents the animal’s location and enter its street or barangay.';
      });
    } catch (error: unknown) {
      if (this.destroyed || requestId !== this.locationRequestId) return;
      const message = String((error as { message?: string })?.message || '').toLowerCase();
      this.onUI(() => {
        this.locationError = message.includes('denied') || message.includes('permission')
          ? 'Location permission denied. Enable location permission or select the location on the map.'
          : message.includes('timeout') || message.includes('timed out')
            ? 'GPS request timed out. Enable device location services, try again, or choose the location on the map.'
            : 'Unable to retrieve GPS coordinates. Check your device location settings or use Choose on Map.';
      });
    } finally {
      if (!this.destroyed && requestId === this.locationRequestId) {
        this.onUI(() => { this.gettingLocation = false; });
      }
    }
  }

  toggleMap(): void {
    if (this.blocked) return;
    if (this.showMap) {
      this.showMap = false;
      this.destroyMap();
    } else {
      this.showMap = true;
    }
  }

  private initMap(container: HTMLDivElement): void {
    const hasLocation = this.latitude !== null && this.longitude !== null;
    const center: L.LatLngExpression = hasLocation
      ? [this.latitude!, this.longitude!]
      : [12.8797, 121.7740];
    this.map = L.map(container, { center, zoom: hasLocation ? 16 : 6, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    this.map.on('click', (event: L.LeafletMouseEvent) => {
      if (this.blocked) return;
      this.onUI(() => {
        this.selectCoordinates(event.latlng.lat, event.latlng.lng);
        this.locationMessage = 'Map location selected. Drag the pin to adjust the animal’s location.';
      });
    });
    if (hasLocation) this.updateMarker();
    setTimeout(() => {
      if (this.map && this.showMap && !this.destroyed) this.map.invalidateSize();
    }, 150);
  }

  private selectCoordinates(lat: number, lng: number): void {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    this.latitude = Number(lat.toFixed(7));
    this.longitude = Number(lng.toFixed(7));
    this.locationError = '';
    this.updateMarker();
    if (this.map) {
      this.map.setView([this.latitude, this.longitude], Math.max(this.map.getZoom(), 16));
    }
  }

  private updateMarker(): void {
    if (!this.map || this.latitude === null || this.longitude === null) return;
    const point: L.LatLngExpression = [this.latitude, this.longitude];
    if (this.marker) {
      this.marker.setLatLng(point);
      return;
    }
    const icon = L.divIcon({
      className: '',
      html: '<div style="width:26px;height:34px;background:#247b52;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px #0005;"><div style="width:8px;height:8px;background:white;border-radius:50%;margin:9px"></div></div>',
      iconSize: [32, 42],
      iconAnchor: [16, 40],
    });
    this.marker = L.marker(point, { icon, draggable: true, autoPan: true }).addTo(this.map);
    this.marker.on('dragend', () => {
      if (this.blocked || !this.marker) return;
      const newPosition = this.marker.getLatLng();
      this.onUI(() => {
        this.selectCoordinates(newPosition.lat, newPosition.lng);
        this.locationMessage = 'Location pin updated.';
      });
    });
  }

  clearLocation(): void {
    if (this.blocked) return;
    ++this.locationRequestId;
    this.gettingLocation = false;
    this.latitude = null;
    this.longitude = null;
    this.locationMessage = '';
    this.locationError = '';
    if (this.marker && this.map) this.map.removeLayer(this.marker);
    this.marker = null;
  }

  private destroyMap(): void {
    this.map?.off();
    this.map?.remove();
    this.map = null;
    this.marker = null;
  }

  onPhotosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // Allow choosing the same gallery image again.
    if (this.blocked || this.cameraOpening) return;
    this.photoMessage = '';
    const warnings: string[] = [];
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        warnings.push('Only JPG, PNG and WebP photos are supported.');
        continue;
      }
      if (file.size === 0 || file.size > 5 * 1024 * 1024) {
        warnings.push('Each photo must be 5 MB or smaller.');
        continue;
      }
      if (this.selectedPhotos.length >= this.maxPhotos) {
        warnings.push(`Maximum ${this.maxPhotos} photos per report.`);
        break;
      }
      const duplicate = this.selectedPhotos.some(p =>
        p.file.name === file.name && p.file.size === file.size && p.file.lastModified === file.lastModified
      );
      if (duplicate) continue;
      this.addPhoto(file);
    }
    this.photoMessage = [...new Set(warnings)].join(' ');
  }

  async takePhoto(): Promise<void> {
    if (this.blocked || this.cameraOpening) return;
    if (this.selectedPhotos.length >= this.maxPhotos) {
      this.photoMessage = `Maximum ${this.maxPhotos} photos per report.`;
      return;
    }
    if (!Capacitor.isNativePlatform()) {
      this.photoMessage = 'The Take Photo button requires the installed Android app. On a browser, use Choose Photos to select or capture an image.';
      return;
    }
    this.cameraOpening = true;
    this.photoMessage = '';
    try {
      const captured = await Camera.takePhoto({
        quality: 75,
        cameraDirection: CameraDirection.Rear,
        targetWidth: 1600,
        targetHeight: 1600,
        saveToGallery: false,
      });
      if (this.destroyed || !captured.webPath) return;
      const response = await fetch(captured.webPath);
      if (!response.ok) throw new Error('Could not read camera image.');
      const blob = await response.blob();
      const file = await this.compressCameraPhoto(blob);
      if (file.size === 0 || file.size > 5 * 1024 * 1024) {
        throw new Error('Captured photo exceeds 5 MB.');
      }
      this.onUI(() => {
        if (!this.blocked && this.selectedPhotos.length < this.maxPhotos) this.addPhoto(file);
      });
    } catch (error: unknown) {
      const message = String((error as { message?: string })?.message || '').toLowerCase();
      if (!message.includes('cancel')) {
        this.onUI(() => { this.photoMessage = 'Camera capture failed. Check permissions or choose a photo from the gallery.'; });
      }
    } finally {
      this.onUI(() => { this.cameraOpening = false; });
    }
  }

  private async compressCameraPhoto(blob: Blob): Promise<File> {
    if (blob.size > 0 && blob.size <= 5 * 1024 * 1024 && blob.type === 'image/jpeg') {
      return new File([blob], `stray-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    }
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to process photo.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
      if (!compressed) throw new Error('Unable to compress photo.');
      return new File([compressed], `stray-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    } finally {
      bitmap.close();
    }
  }

  private addPhoto(file: File): void {
    this.selectedPhotos.push({ file, previewUrl: URL.createObjectURL(file), uploaded: false });
    this.showPreview = false;
  }

  removePhoto(index: number): void {
    if (this.blocked || index < 0 || index >= this.selectedPhotos.length) return;
    const [removed] = this.selectedPhotos.splice(index, 1);
    URL.revokeObjectURL(removed.previewUrl);
    this.showPreview = false;
    this.photoMessage = '';
  }

  private isReportValid(): boolean {
    return !!this.animalType && !!this.assistanceReason &&
      this.description.trim().length >= 10 && this.description.length <= 5000 &&
      !!this.incidentDate && this.incidentDate <= this.today &&
      !!this.locationAddress.trim() && this.locationAddress.length <= 255;
  }

  reviewReport(): void {
    if (this.blocked) return;
    this.submitMessage = '';

    // Keep the original validation requirements before entering Step 2.
    if (!this.isReportValid()) {
      this.showPreview = false;
      this.submitMessage = 'Please complete all required fields before reviewing.';
      return;
    }

    // Step 1 will be removed from the DOM in the HTML update. Dispose of
    // Leaflet first so returning to edit can re-create the map safely.
    if (this.map) this.destroyMap();
    // Keep showMap and the selected coordinates so the map can reopen.
    this.showPreview = true;
    void this.pageContent?.scrollToTop(0);
  }

  backToEditReport(): void {
    if (this.blocked) return;
    // No form values, coordinates, or photo previews are reset here.
    this.showPreview = false;
    this.submitMessage = '';
    void this.pageContent?.scrollToTop(0);
  }

  async submitReport(): Promise<void> {
    if (this.blocked) return;
    this.submitMessage = '';
    if (!this.isReportValid() || !this.animalType || !this.assistanceReason) {
      this.submitMessage = 'Please correct the report information before submitting.';
      return;
    }

    const payload: CreateStrayReportRequest = {
      animal_type: this.animalType,
      assistance_reason: this.assistanceReason,
      description: this.description.trim(),
      incident_date: this.incidentDate,
      location_address: this.locationAddress.trim(),
      latitude: this.latitude,
      longitude: this.longitude,
    };

    this.isSubmitting = true;
    try {
      const response = await firstValueFrom(this.service.createReport(payload));
      if (!response.success || !Number.isInteger(Number(response.report_id)) || Number(response.report_id) < 1) {
        throw new Error(response.message || 'The server returned an invalid report reference.');
      }
      this.onUI(() => {
        this.submittedReportId = Number(response.report_id);
        this.submissionComplete = true;
        this.showPreview = false;
      });
    } catch (error: unknown) {
      this.onUI(() => { this.submitMessage = this.requestError(error); });
    } finally {
      this.onUI(() => { this.isSubmitting = false; });
    }

    // Create the report only ONCE. Retry uploads, never the report creation.
    if (this.submittedReportId !== null && this.selectedPhotos.length) {
      await this.uploadRemainingPhotos();
    }
  }

  async uploadRemainingPhotos(): Promise<void> {
    if (!this.submittedReportId || this.uploadingPhotos || this.photoUploadUncertain || this.destroyed) return;
    const pending = this.selectedPhotos.filter(photo => !photo.uploaded);
    if (!pending.length) {
      this.allPhotosUploaded = true;
      return;
    }
    this.uploadingPhotos = true;
    this.photoUploadMessage = '';
    const headers = new HttpHeaders({
      Authorization: `Bearer ${sessionStorage.getItem('pawrescue_token') || ''}`,
    });
    const uploadUrl = this.strayUploadUrl();

    try {
      for (const photo of pending) {
        if (this.destroyed) return;
        this.onUI(() => {
          this.currentPhotoNumber = this.selectedPhotos.indexOf(photo) + 1;
        });
        const data = new FormData();
        data.append('report_id', String(this.submittedReportId));
        data.append('photo', photo.file, photo.file.name);
        const response = await firstValueFrom(this.http.post<PhotoUploadResponse>(uploadUrl, data, { headers }));
        if (!response.success) throw new Error(response.message || 'Photo upload failed.');
        this.onUI(() => {
          photo.uploaded = true;
          this.uploadedPhotosCount = this.selectedPhotos.filter(item => item.uploaded).length;
        });
      }
      this.onUI(() => { this.allPhotosUploaded = true; });
    } catch (error: unknown) {
      this.onUI(() => {
        const httpError = error as HttpErrorResponse;
        const status = typeof httpError.status === 'number' ? httpError.status : undefined;
        this.photoUploadUncertain = status === 0 || (status !== undefined && status >= 500);
        this.photoUploadMessage = status === 404
          ? 'The stray photo upload endpoint is not installed yet. The report was saved, but photos were not uploaded.'
          : this.photoUploadUncertain
            ? 'Photo upload response was uncertain. The report is saved; check your report photos before retrying.'
            : this.requestError(error);
      });
    } finally {
      this.onUI(() => { this.uploadingPhotos = false; });
    }
  }

  private strayUploadUrl(): string {
    // Matches the host selection currently used by StrayReportsService.
    // Update the native host here if you change that service's LAN IP.
    const nativeHost = '192.168.0.146';
    let host = nativeHost;
    if (!Capacitor.isNativePlatform()) {
      const current = window.location.hostname;
      if (current === 'localhost' || current === '127.0.0.1' ||
          /^192\.168\.\d{1,3}\.\d{1,3}$/.test(current) ||
          /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(current) ||
          /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(current)) {
        host = current;
      }
    }
    return `http://${host}/pawrescue-community-itws07/pawrescue_api/stray/upload_photo.php`;
  }

  private requestError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Cannot reach the PawRescue API. Check XAMPP, your network and the server URL. If submission timed out, confirm it was not already saved before retrying.';
      if (error.status === 401 || error.status === 403) return 'Your session may have expired. Log in again.';
      const serverMessage = error.error && typeof error.error.message === 'string' ? error.error.message : '';
      return serverMessage || `Server request failed (HTTP ${error.status}).`;
    }
    return error instanceof Error ? error.message : 'Unexpected error. Please try again.';
  }

  backToAssistance(): void {
    if (this.uploadingPhotos) return;
    void this.router.navigateByUrl('/stray-assistance');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.locationRequestId;
    this.destroyMap();
    this.selectedPhotos.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
    this.selectedPhotos = [];
  }
}
