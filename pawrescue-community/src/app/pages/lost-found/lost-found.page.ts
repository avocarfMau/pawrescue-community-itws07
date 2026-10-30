import {
  Component,
  inject,
  OnDestroy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
  NgZone,
  HostListener
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import {
  IonContent,
  IonIcon,
  IonSpinner,
  IonButton
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  arrowBackOutline,
  locationOutline,
  calendarOutline,
  pawOutline,
  addOutline,
  refreshOutline,
  mapOutline,
  closeOutline,
  chevronBackOutline,
  chevronForwardOutline,
  expandOutline
} from 'ionicons/icons';

import {
  Subscription,
  timeout,
  finalize
} from 'rxjs';

import * as L from 'leaflet';

import {
  PetReportsService,
  PetReport
} from '../../services/pet-reports';

type ReportFilter = 'all' | 'lost' | 'found';

@Component({
  selector: 'app-lost-found',
  templateUrl: './lost-found.page.html',
  styleUrls: ['./lost-found.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonSpinner,
    IonButton
  ]
})
export class LostFoundPage implements OnDestroy {
  private reportsService = inject(PetReportsService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);

  // =====================================
  // REPORT DATA
  // =====================================
  reports: PetReport[] = [];

  selectedFilter: ReportFilter = 'all';

  // =====================================
  // LOADING STATES
  // =====================================
  loading = false;
  refreshing = false;

  errorMessage = '';

  // =====================================
  // PHP BACKEND URL
  // =====================================
  // =====================================
  // REPORT CACHE
  // =====================================
  private cache = new Map<ReportFilter, PetReport[]>();

  private request?: Subscription;

  private destroyed = false;

  // =====================================
  // MULTIPLE PET PHOTOS / GALLERY STATE
  // =====================================
  // Each report remembers its current photo independently.
  private photoIndexes = new Map<number, number>();

  // Invalid or unavailable photos are skipped in the gallery.
  private brokenPhotoUrls = new Set<string>();

  // Full-screen photo viewer.
  photoViewerReport: PetReport | null = null;

  // Swipe gesture tracking for cards and the photo viewer.
  private photoTouchStartX: number | null = null;
  private photoTouchStartY: number | null = null;
  private photoTouchReportId: number | null = null;
  private lastPhotoSwipeAt = 0;

  // =====================================
  // VIEW LOCATION MAP STATE
  // =====================================
  showLocationMap = false;

  selectedReport: PetReport | null = null;

  private reportMap: L.Map | null = null;

  private reportMarker: L.Marker | null = null;

  private mapResizeTimer: ReturnType<typeof setTimeout> | null = null;

  // =====================================
  // MAP CONTAINER
  // =====================================
  @ViewChild('reportLocationMap')
  set reportLocationMapElement(
    element: ElementRef<HTMLDivElement> | undefined
  ) {
    if (
      element &&
      this.showLocationMap &&
      this.selectedReport &&
      !this.reportMap &&
      !this.destroyed
    ) {
      this.initializeReportMap(element.nativeElement);
    }
  }

  constructor() {
    addIcons({
      arrowBackOutline,
      locationOutline,
      calendarOutline,
      pawOutline,
      addOutline,
      refreshOutline,
      mapOutline,
      closeOutline,
      chevronBackOutline,
      chevronForwardOutline,
      expandOutline
    });
  }

  // =====================================
  // PAGE LIFECYCLE
  // =====================================
  ionViewWillEnter() {
    this.loadReports();
  }

  ionViewDidLeave() {
    this.closeLocationMap();
    this.closePhotoViewer();
  }

  // =====================================
  // UI UPDATE HELPER
  // =====================================
  private updateUI(callback: () => void) {
    if (this.destroyed) {
      return;
    }

    this.zone.run(() => {
      callback();
      this.cdr.detectChanges();
    });
  }

  // =====================================
  // LOAD LOST AND FOUND REPORTS
  // =====================================
  loadReports(forceRefresh = false) {
    // Cancel unfinished request.
    this.request?.unsubscribe();

    const filter = this.selectedFilter;

    const cachedReports = this.cache.get(filter);

    // Show cached data while refreshing.
    if (cachedReports !== undefined) {
      this.reports = cachedReports;
    } else {
      this.reports = [];
    }

    const hasCache = cachedReports !== undefined;

    this.loading = !hasCache;
    this.refreshing = hasCache;

    this.errorMessage = '';

    const startTime = performance.now();

    this.request = this.reportsService
      .getReports(filter)
      .pipe(
        timeout(10000),
        finalize(() => {
          this.updateUI(() => {
            this.loading = false;
            this.refreshing = false;
          });
        })
      )
      .subscribe({
        next: (response) => {
          this.updateUI(() => {
            if (response.success) {
              const updatedReports = response.reports ?? [];

              // Update cached reports.
              this.cache.set(filter, updatedReports);

              // A previously broken image may become available
              // after the resident updates the report.
              this.brokenPhotoUrls.clear();

              // Keep the photo viewer in sync with refreshed data.
              if (this.photoViewerReport && this.selectedFilter === filter) {
                this.photoViewerReport =
                  updatedReports.find(
                    report => report.id === this.photoViewerReport?.id
                  ) ?? null;
              }

              // Display matching filter only.
              if (this.selectedFilter === filter) {
                this.reports = updatedReports;
              }

              console.log(
                'Pet reports loaded in',
                Math.round(performance.now() - startTime),
                'ms'
              );
            } else {
              this.errorMessage =
                response.message ||
                'Unable to retrieve pet reports.';
            }
          });
        },

        error: (error) => {
          console.error('Pet report loading error:', error);

          this.updateUI(() => {
            if (error.name === 'TimeoutError') {
              this.errorMessage =
                'Reports are taking too long to load. Please refresh.';
            } else if (error.status === 401) {
              this.errorMessage =
                'Session expired. Please log in again.';
            } else if (error.status === 0) {
              this.errorMessage =
                'Unable to connect to the server.';
            } else {
              this.errorMessage =
                'Unable to load the latest pet reports.';
            }
          });
        }
      });
  }

  // =====================================
  // FILTER REPORTS
  // =====================================
  changeFilter(filter: ReportFilter) {
    if (this.selectedFilter === filter) {
      return;
    }

    this.closePhotoViewer();
    this.selectedFilter = filter;

    this.reports = this.cache.get(filter) ?? [];

    this.loadReports();
  }

  // =====================================
  // REFRESH REPORTS
  // =====================================
  refreshReports() {
    this.loadReports(true);
  }

  // =====================================
  // GET UPLOADED PET PHOTO URL
  // =====================================
  getPhotoUrl(photoPath: string | null): string | null {
    return this.reportsService.getPhotoUrl(photoPath);
  }

  // =====================================
  // GET MULTIPLE REPORT PHOTOS
  // =====================================
  getReportPhotos(report: PetReport): string[] {
    // The service handles legacy single-photo reports,
    // the new photos[] response, and path validation.
    return this.reportsService
      .getReportPhotoUrls(report)
      .filter(url => !this.brokenPhotoUrls.has(url));
  }

  // =====================================
  // GET CURRENT PHOTO INDEX
  // =====================================
  getCurrentPhotoIndex(report: PetReport): number {
    const count = this.getReportPhotos(report).length;

    if (count === 0) {
      return 0;
    }

    const index = this.photoIndexes.get(report.id) ?? 0;

    return Math.max(0, Math.min(index, count - 1));
  }

  // =====================================
  // GET CURRENT VISIBLE PET PHOTO
  // =====================================
  getCurrentPhotoUrl(report: PetReport): string | null {
    const photos = this.getReportPhotos(report);

    return photos[this.getCurrentPhotoIndex(report)] ?? null;
  }

  // =====================================
  // CHANGE PHOTO IN THE GALLERY
  // =====================================
  changePhoto(report: PetReport, direction: number) {
    const photos = this.getReportPhotos(report);

    if (photos.length < 2) {
      return;
    }

    const currentIndex = this.getCurrentPhotoIndex(report);

    // Wrap around when reaching the first/last photo.
    const nextIndex =
      (currentIndex + direction + photos.length) % photos.length;

    this.photoIndexes.set(report.id, nextIndex);
    this.cdr.detectChanges();
  }

  // =====================================
  // SELECT A SPECIFIC PHOTO
  // =====================================
  selectPhoto(report: PetReport, index: number) {
    const photos = this.getReportPhotos(report);

    if (!Number.isInteger(index) || index < 0 || index >= photos.length) {
      return;
    }

    this.photoIndexes.set(report.id, index);
    this.cdr.detectChanges();
  }

  // =====================================
  // OPEN PHOTO FULL-SCREEN VIEWER
  // =====================================
  openPhotoViewer(report: PetReport) {
    // A touch swipe may dispatch a click on some devices.
    if (
      this.destroyed ||
      Date.now() - this.lastPhotoSwipeAt < 350 ||
      this.getReportPhotos(report).length === 0
    ) {
      return;
    }

    this.photoViewerReport = report;
    this.cdr.detectChanges();
  }

  // =====================================
  // CLOSE PHOTO FULL-SCREEN VIEWER
  // =====================================
  closePhotoViewer() {
    this.photoViewerReport = null;
    this.resetPhotoTouch();

    if (!this.destroyed) {
      this.cdr.detectChanges();
    }
  }

  // =====================================
  // START PHOTO SWIPE
  // =====================================
  onPhotoTouchStart(event: TouchEvent, report: PetReport) {
    if (event.touches.length !== 1) {
      this.resetPhotoTouch();
      return;
    }

    this.photoTouchStartX = event.touches[0].clientX;
    this.photoTouchStartY = event.touches[0].clientY;
    this.photoTouchReportId = report.id;
  }

  // =====================================
  // END PHOTO SWIPE
  // =====================================
  onPhotoTouchEnd(event: TouchEvent, report: PetReport) {
    if (
      this.photoTouchStartX === null ||
      this.photoTouchStartY === null ||
      this.photoTouchReportId !== report.id ||
      event.changedTouches.length === 0
    ) {
      this.resetPhotoTouch();
      return;
    }

    const deltaX =
      event.changedTouches[0].clientX - this.photoTouchStartX;

    const deltaY =
      event.changedTouches[0].clientY - this.photoTouchStartY;

    this.resetPhotoTouch();

    // Ignore small movements and ordinary vertical scrolling.
    if (
      this.getReportPhotos(report).length < 2 ||
      Math.abs(deltaX) < 45 ||
      Math.abs(deltaX) < Math.abs(deltaY) * 1.25
    ) {
      return;
    }

    this.lastPhotoSwipeAt = Date.now();
    this.changePhoto(report, deltaX < 0 ? 1 : -1);
  }

  private resetPhotoTouch() {
    this.photoTouchStartX = null;
    this.photoTouchStartY = null;
    this.photoTouchReportId = null;
  }

  // =====================================
  // SKIP BROKEN PHOTO WITHOUT BREAKING A POST
  // =====================================
  onPhotoLoadError(photoUrl: string) {
    if (!photoUrl || this.brokenPhotoUrls.has(photoUrl)) {
      return;
    }

    this.brokenPhotoUrls.add(photoUrl);
    this.cdr.detectChanges();
  }

  // =====================================
  // KEYBOARD SUPPORT FOR PHOTO VIEWER
  // =====================================
  @HostListener('document:keydown', ['$event'])
  onGalleryKeydown(event: KeyboardEvent) {
    if (!this.photoViewerReport) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closePhotoViewer();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.changePhoto(this.photoViewerReport, 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.changePhoto(this.photoViewerReport, -1);
    }
  }

  // =====================================
  // VALIDATE SAVED COORDINATES
  // =====================================
  hasLocation(report: PetReport): boolean {
    if (
      report.latitude === null ||
      report.longitude === null ||
      report.latitude === undefined ||
      report.longitude === undefined ||
      report.latitude === '' ||
      report.longitude === ''
    ) {
      return false;
    }

    const latitude = Number(report.latitude);

    const longitude = Number(report.longitude);

    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  // =====================================
  // CUSTOM RED SVG LOCATION MARKER
  // =====================================
  private createLocationIcon(): L.DivIcon {
    const svg = `
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="44"
        height="56"
        viewBox="0 0 44 56"
        aria-hidden="true"
      >
        <path
          d="M22 2 C10.4 2 2 10.8 2 22 C2 37.5 22 54 22 54 C22 54 42 37.5 42 22 C42 10.8 33.6 2 22 2 Z"
          fill="#e53935"
          stroke="#ffffff"
          stroke-width="2.5"
        />
        <circle
          cx="22"
          cy="21"
          r="11"
          fill="#ffffff"
        />
        <circle
          cx="22"
          cy="21"
          r="5"
          fill="#e53935"
        />
      </svg>
    `;

    return L.divIcon({
      className: 'pawrescue-custom-marker',
      html: svg,
      iconSize: [44, 56],
      iconAnchor: [22, 54],
      popupAnchor: [0, -48]
    });
  }

  // =====================================
  // VIEW SAVED REPORT LOCATION
  // =====================================
  viewLocation(report: PetReport) {
    if (!this.hasLocation(report) || this.destroyed) {
      return;
    }

    // Remove previous map first.
    this.destroyReportMap();

    this.updateUI(() => {
      this.selectedReport = report;
      this.showLocationMap = true;
    });
  }

  // =====================================
  // INITIALIZE LEAFLET MAP
  // =====================================
  private initializeReportMap(container: HTMLDivElement) {
    if (
      this.destroyed ||
      this.reportMap ||
      !this.showLocationMap ||
      !this.selectedReport
    ) {
      return;
    }

    if (!this.hasLocation(this.selectedReport)) {
      return;
    }

    const report = this.selectedReport;

    const latitude = Number(report.latitude);

    const longitude = Number(report.longitude);

    const coordinates: L.LatLngExpression = [latitude, longitude];

    // Create the map centered at
    // the report's saved coordinates.
    this.reportMap = L.map(container, {
      center: coordinates,
      zoom: 16,
      zoomControl: true,
      scrollWheelZoom: false
    });

    // Add OpenStreetMap tiles.
    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }
    ).addTo(this.reportMap);

    // =====================================
    // CREATE VISIBLE LOCATION MARKER
    // =====================================
    this.reportMarker = L.marker(coordinates, {
      icon: this.createLocationIcon(),
      draggable: false,
      keyboard: true,
      zIndexOffset: 1000
    }).addTo(this.reportMap);

    // =====================================
    // REPORT INFORMATION POPUP
    // =====================================
    // Build DOM elements safely using
    // textContent instead of HTML
    // containing user-provided data.
    const popupContainer = document.createElement('div');

    const petName = document.createElement('strong');

    petName.textContent = report.pet_name || 'Reported Pet';

    const locationText = document.createElement('p');

    locationText.textContent = report.location_address;

    locationText.style.margin = '6px 0 0';

    locationText.style.lineHeight = '1.5';

    popupContainer.appendChild(petName);

    popupContainer.appendChild(locationText);

    this.reportMarker.bindPopup(popupContainer, {
      closeButton: true,
      autoPan: true
    });

    // Display popup when marker is tapped.
    this.reportMarker.on('click', () => {
      this.reportMarker?.openPopup();
    });

    // =====================================
    // MAP SIZE ADJUSTMENT
    // =====================================
    // Map is inside an Angular conditional
    // modal. Refresh the Leaflet dimensions
    // once the modal is rendered.
    this.mapResizeTimer = setTimeout(() => {
      if (
        this.destroyed ||
        !this.showLocationMap ||
        !this.reportMap
      ) {
        return;
      }

      this.reportMap.invalidateSize();

      this.reportMap.setView(coordinates, 16, { animate: false });

      this.reportMarker?.setLatLng(coordinates);

      this.reportMarker?.setZIndexOffset(1000);
    }, 150);

    console.log('Report location marker initialized:', {
      reportId: report.id,
      latitude,
      longitude
    });
  }

  // =====================================
  // CLOSE REPORT LOCATION MAP
  // =====================================
  closeLocationMap() {
    this.showLocationMap = false;

    this.selectedReport = null;

    this.destroyReportMap();

    if (!this.destroyed) {
      this.cdr.detectChanges();
    }
  }

  // =====================================
  // DESTROY LEAFLET MAP
  // =====================================
  private destroyReportMap() {
    if (this.mapResizeTimer !== null) {
      clearTimeout(this.mapResizeTimer);

      this.mapResizeTimer = null;
    }

    if (this.reportMarker) {
      this.reportMarker.off();

      this.reportMarker = null;
    }

    if (this.reportMap) {
      this.reportMap.off();

      this.reportMap.remove();

      this.reportMap = null;
    }
  }

  // =====================================
  // REPORT TRACKING
  // =====================================
  trackReport(index: number, report: PetReport): number {
    return report.id;
  }

  // =====================================
  // NAVIGATION
  // =====================================
  goBack() {
    this.closePhotoViewer();
    this.closeLocationMap();

    this.router.navigateByUrl('/home');
  }

  reportPet() {
    this.closePhotoViewer();
    this.closeLocationMap();

    this.router.navigateByUrl('/report-pet');
  }

  // =====================================
  // PAGE CLEANUP
  // =====================================
  ngOnDestroy() {
    this.destroyed = true;

    this.request?.unsubscribe();

    this.photoViewerReport = null;
    this.resetPhotoTouch();
    this.photoIndexes.clear();
    this.brokenPhotoUrls.clear();

    this.destroyReportMap();
  }
}