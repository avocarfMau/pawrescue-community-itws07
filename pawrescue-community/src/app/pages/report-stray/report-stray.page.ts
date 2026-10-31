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
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/stray-assistance" text="Back" [disabled]="isSubmitting || uploadingPhotos"></ion-back-button>
        </ion-buttons>
        <ion-title>Report Stray Animal</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <main class="page-container">
        <div class="intro">
          <span class="eyebrow">STRAY ANIMAL ASSISTANCE</span>
          <h1>Tell us about the animal</h1>
          <p>Provide accurate details so Municipal Veterinary Office staff can assess the situation.</p>
        </div>

        <section *ngIf="submissionComplete" class="success-card" aria-live="polite">
          <div class="success-icon" aria-hidden="true">✓</div>
          <h2>Stray report saved</h2>
          <p>Your report is awaiting review by the Municipal Veterinary Office.</p>
          <p><strong>Report reference: #{{ submittedReportId }}</strong></p>
          <p class="status-text">Status: Pending</p>

          <div *ngIf="selectedPhotos.length" class="upload-summary">
            <ion-spinner *ngIf="uploadingPhotos" name="crescent"></ion-spinner>
            <p *ngIf="uploadingPhotos">
              Uploading photo {{ currentPhotoNumber }} of {{ selectedPhotos.length }}...
            </p>
            <p>{{ uploadedPhotosCount }} of {{ selectedPhotos.length }} photos confirmed uploaded.</p>
            <p *ngIf="allPhotosUploaded" class="success-text">All photos uploaded successfully.</p>
            <p *ngIf="photoUploadMessage" class="error-text" role="alert">{{ photoUploadMessage }}</p>
            <p *ngIf="photoUploadUncertain" class="notice">
              The last upload may have reached the server without a response. Check your report before retrying to avoid duplicates.
            </p>
            <ion-button
              *ngIf="!uploadingPhotos && !allPhotosUploaded && !photoUploadUncertain"
              type="button" fill="outline" expand="block"
              (click)="uploadRemainingPhotos()"
            >Retry Remaining Photos</ion-button>
          </div>

          <ion-button expand="block" type="button" [disabled]="uploadingPhotos" (click)="backToAssistance()">
            Back to Stray Animal Assistance
          </ion-button>
        </section>

        <form *ngIf="!submissionComplete" #strayForm="ngForm" (ngSubmit)="reviewReport()" class="report-form">
          <section class="form-card">
            <h2>Animal information</h2>

            <label for="animal-type">Animal type <span class="required">*</span></label>
            <select id="animal-type" name="animal_type" [(ngModel)]="animalType" required [disabled]="isSubmitting">
              <option value="" disabled>Select animal type</option>
              <option value="dog">Dog</option>
              <option value="cat">Cat</option>
            </select>

            <label for="assistance-reason">Reason for assistance <span class="required">*</span></label>
            <select id="assistance-reason" name="assistance_reason" [(ngModel)]="assistanceReason" required [disabled]="isSubmitting">
              <option value="" disabled>Select a reason</option>
              <option value="injured">Injured</option>
              <option value="sick">Sick</option>
              <option value="trapped">Trapped</option>
              <option value="aggressive">Aggressive / safety concern</option>
              <option value="abandoned">Possibly abandoned</option>
              <option value="roaming">Roaming / unattended</option>
              <option value="other">Other concern</option>
            </select>

            <label for="description">Description <span class="required">*</span></label>
            <textarea
              id="description" name="description" [(ngModel)]="description"
              [disabled]="isSubmitting" required minlength="10" maxlength="5000" rows="5"
              placeholder="Describe the animal's condition, appearance, and any immediate concerns."
            ></textarea>
            <p class="hint">At least 10 characters · {{ description.length }}/5000</p>
          </section>

          <section class="form-card">
            <h2>Location and date</h2>
            <label for="incident-date">Date observed <span class="required">*</span></label>
            <input id="incident-date" name="incident_date" type="date" [(ngModel)]="incidentDate" [max]="today" required [disabled]="isSubmitting" />

            <label for="location-address">Location / landmark <span class="required">*</span></label>
            <textarea id="location-address" name="location_address" [(ngModel)]="locationAddress"
              required maxlength="255" rows="3" [disabled]="isSubmitting"
              placeholder="Barangay, street and nearest landmark"
            ></textarea>
            <p class="hint">The address is required even when you select a GPS location.</p>

            <p class="hint">Select where the stray animal was actually observed, not necessarily your current location.</p>
            <div class="location-buttons">
              <ion-button type="button" fill="outline" [disabled]="gettingLocation || isSubmitting" (click)="useCurrentLocation()">
                <ion-spinner *ngIf="gettingLocation" name="crescent"></ion-spinner>
                {{ gettingLocation ? 'Getting location...' : 'Use My GPS Location' }}
              </ion-button>
              <ion-button type="button" fill="outline" [disabled]="isSubmitting" (click)="toggleMap()">
                {{ showMap ? 'Hide Map' : 'Choose on Map' }}
              </ion-button>
            </div>
            <p *ngIf="locationError" class="error-text" role="alert">{{ locationError }}</p>
            <p *ngIf="locationMessage" class="success-text" role="status">{{ locationMessage }}</p>

            <div *ngIf="showMap" class="map-card">
              <p class="hint">Tap to place a pin; drag it to adjust the location.</p>
              <div #locationMap class="location-map" aria-label="Map to select the location of the stray animal"></div>
              <p class="hint">Map tiles require an internet connection.</p>
            </div>

            <div *ngIf="latitude !== null && longitude !== null" class="coordinates">
              <strong>Location selected</strong>
              <p>Latitude: {{ latitude | number:'1.6-7' }}</p>
              <p>Longitude: {{ longitude | number:'1.6-7' }}</p>
              <button type="button" class="text-button" [disabled]="isSubmitting" (click)="clearLocation()">Clear Pin</button>
            </div>
          </section>

          <section class="form-card">
            <h2>Animal photos <span class="optional">(optional)</span></h2>
            <p class="hint">Add up to {{ maxPhotos }} clear photos. Only take photos when it is safe.</p>

            <div class="photo-actions">
              <label class="upload-label" for="stray-photos">
                {{ selectedPhotos.length ? 'Add More Photos' : 'Choose Photos from Gallery' }}
                <input id="stray-photos" type="file" multiple accept="image/jpeg,image/png,image/webp"
                  [disabled]="isSubmitting || cameraOpening || selectedPhotos.length >= maxPhotos"
                  (change)="onPhotosSelected($event)" />
              </label>
              <ion-button type="button" fill="outline" [disabled]="isSubmitting || cameraOpening || selectedPhotos.length >= maxPhotos" (click)="takePhoto()">
                {{ cameraOpening ? 'Opening Camera...' : 'Take Photo' }}
              </ion-button>
            </div>
            <p class="hint">JPG, PNG or WebP · Maximum 5 MB each · {{ selectedPhotos.length }}/{{ maxPhotos }} selected</p>
            <p *ngIf="photoMessage" class="error-text" role="alert">{{ photoMessage }}</p>

            <div *ngIf="selectedPhotos.length" class="photo-grid">
              <div *ngFor="let photo of selectedPhotos; let i = index" class="photo-tile">
                <img [src]="photo.previewUrl" [alt]="'Selected stray animal photo ' + (i + 1)" />
                <button type="button" [disabled]="isSubmitting" (click)="removePhoto(i)" aria-label="Remove selected photo">×</button>
              </div>
            </div>
          </section>

          <p class="disclaimer">Do not approach or handle an injured or aggressive animal. Contact local emergency services if there is an immediate threat to people.</p>
          <p *ngIf="submitMessage" class="error-text" role="alert">{{ submitMessage }}</p>
          <ion-button type="submit" expand="block" [disabled]="isSubmitting || strayForm.invalid || !description.trim() || !locationAddress.trim()">
            Review Report
          </ion-button>
        </form>

        <section *ngIf="showPreview && !submissionComplete" class="preview-card">
          <h2>Review your report</h2>
          <p><strong>Animal:</strong> {{ animalType === 'dog' ? 'Dog' : 'Cat' }}</p>
          <p><strong>Reason:</strong> {{ reasonLabel }}</p>
          <p><strong>Date:</strong> {{ incidentDate }}</p>
          <p><strong>Location:</strong> {{ locationAddress }}</p>
          <p><strong>GPS:</strong> {{ latitude !== null ? 'Pin selected' : 'Not provided' }}</p>
          <p><strong>Description:</strong> {{ description }}</p>
          <p><strong>Photos:</strong> {{ selectedPhotos.length }}</p>
          <p class="hint">The report is created first, then the photos are uploaded individually. If an upload fails, the report remains saved.</p>
          <p *ngIf="submitMessage" class="error-text" role="alert">{{ submitMessage }}</p>
          <ion-button type="button" expand="block" [disabled]="isSubmitting" (click)="submitReport()">
            <ion-spinner *ngIf="isSubmitting" name="crescent"></ion-spinner>
            {{ isSubmitting ? 'Submitting...' : 'Submit Report' }}
          </ion-button>
        </section>
      </main>
    </ion-content>
  `,
  styles: [`
    :host { --ion-color-primary: #247b52; --ion-color-primary-contrast: #fff; }
    ion-toolbar { --background: #fff; --color: #183f2d; }
    ion-back-button { --color: #247b52; }
    ion-title { font-size: 17px; font-weight: 700; }
    ion-content { --background: #f5f8f5; }
    .page-container { width: min(100%, 740px); margin: 0 auto; padding: 22px 16px 48px; }
    .intro { margin-bottom: 20px; }
    .eyebrow { color: #247b52; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; }
    h1 { color: #193a29; font-size: clamp(24px, 5vw, 31px); margin: 8px 0; }
    .intro p { color: #607268; font-size: 14px; line-height: 1.6; }
    .report-form { display: grid; gap: 16px; }
    .form-card,.preview-card,.success-card { background: #fff; border: 1px solid #e2eae3; border-radius: 18px; padding: 20px; box-shadow: 0 4px 18px rgba(23,69,45,.04); }
    h2 { font-size: 18px; color: #193a29; margin: 0 0 18px; }
    label:not(.upload-label) { display: block; font-weight: 700; font-size: 13px; color: #344d3e; margin: 15px 0 7px; }
    input:not([type='file']), select, textarea { display: block; width: 100%; padding: 13px 12px; border-radius: 11px; border: 1px solid #ccdad0; background: #fff; color: #233e2d; font: inherit; font-size: 14px; outline: none; box-sizing: border-box; }
    textarea { resize: vertical; min-height: 85px; line-height: 1.55; }
    input:focus,select:focus,textarea:focus { border-color: #247b52; box-shadow: 0 0 0 3px rgba(36,123,82,.12); }
    .required { color: #b93131; } .optional { color: #839288; font-size: 12px; font-weight: 500; }
    .hint { margin: 7px 0 12px; font-size: 12px; line-height: 1.55; color: #728277; }
    .location-buttons,.photo-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    ion-button { --border-radius: 11px; min-height: 44px; text-transform: none; font-weight: 700; }
    ion-spinner { width: 17px; height: 17px; margin-right: 8px; vertical-align: middle; }
    .map-card { margin-top: 14px; border: 1px solid #dfeae0; padding: 12px; border-radius: 14px; }
    .location-map { width: 100%; height: 310px; border-radius: 10px; background: #eef2ec; position: relative; z-index: 0; }
    .coordinates { border-radius: 12px; padding: 12px; background: #eaf6ed; margin-top: 12px; font-size: 12px; color: #25603e; }
    .coordinates p { margin: 5px 0; } .text-button { padding: 8px 0; border: 0; background: transparent; color: #a13d33; cursor: pointer; font-weight: 700; }
    .upload-label { display: inline-flex; padding: 12px 14px; border-radius: 11px; background: #e9f5ed; color: #247b52; font-size: 13px; font-weight: 750; cursor: pointer; position: relative; overflow: hidden; }
    .upload-label input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
    .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(98px, 1fr)); gap: 10px; margin-top: 15px; }
    .photo-tile { position: relative; background: #f0f4ef; border-radius: 12px; overflow: hidden; aspect-ratio: 1; }
    .photo-tile img { width: 100%; height: 100%; object-fit: cover; }
    .photo-tile button { position: absolute; top: 4px; right: 4px; background: rgba(30,30,30,.83); color: white; border: 0; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 22px; }
    .error-text { color: #a22c24; font-size: 13px; line-height: 1.5; margin: 10px 0; overflow-wrap: anywhere; }
    .success-text { color: #227d4b; font-size: 13px; line-height: 1.5; }
    .notice { background: #fff8e9; border-radius: 9px; padding: 10px; color: #805f25; font-size: 12px; }
    .disclaimer { color: #607268; font-size: 12px; line-height: 1.65; }
    .preview-card { margin-top: 20px; overflow-wrap: anywhere; }
    .preview-card p { color: #4c6253; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
    .success-card { text-align: center; padding: 26px 20px; }
    .success-card p { font-size: 14px; color: #597160; }
    .success-card .error-text { color: #a22c24; }
    .success-icon { display: grid; place-items: center; margin: 0 auto 12px; width: 48px; height: 48px; background: #e3f5e8; color: #247b52; border-radius: 50%; font-size: 27px; font-weight: 800; }
    .status-text { color: #247b52 !important; font-weight: 700; }
    .upload-summary { padding: 14px; margin: 16px 0; background: #f7faf7; border-radius: 12px; }
    @media(min-width:620px) { .page-container { padding: 32px 24px 56px; } }
  `],
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
    this.showPreview = this.isReportValid();
    if (!this.showPreview) this.submitMessage = 'Please complete all required fields before reviewing.';
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
    const nativeHost = '192.168.100.23';
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
