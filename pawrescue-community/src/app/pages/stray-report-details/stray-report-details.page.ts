import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, inject,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
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
import { Subscription } from 'rxjs';
import {
  StrayAssistanceReason,
  StrayReport,
  StrayReportStatus,
  StrayReportsService,
} from '../../services/stray-reports';

// ============================================================
// PAWRESCUE COMMUNITY - STRAY REPORT DETAILS
// File: src/app/pages/stray-report-details/stray-report-details.page.ts
// Displays one of the signed-in resident's own reports.
// Reuses the existing authenticated getMyReports() endpoint.
// ============================================================

@Component({
  selector: 'app-stray-report-details',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonButton,
    IonSpinner,
  ],
  templateUrl: './stray-report-details.page.html',
  styleUrls: ['./stray-report-details.page.scss'],
})
export class StrayReportDetailsPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(StrayReportsService);
  private readonly zone = inject(NgZone);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private requestSubscription?: Subscription;

  private readonly pageSize = 20;
  private readonly maxPages = 100;
  private loadedOnce = false;
  private readonly brokenPhotos = new Set<string>();

  reportId = 0;
  report: StrayReport | null = null;
  isLoading = false;
  errorMessage = '';
  selectedPhotoIndex = 0;
  photoViewerOpen = false;

  ngOnInit(): void {
    const idText = this.route.snapshot.paramMap.get('id') ?? '';
    const id = Number(idText);

    if (!/^\d+$/.test(idText) || !Number.isSafeInteger(id) || id <= 0) {
      this.errorMessage = 'Invalid stray report reference.';
      return;
    }

    this.reportId = id;
    this.loadReport();
  }

  // Refresh when returning to a cached Ionic page.
  ionViewWillEnter(): void {
    if (this.loadedOnce && !this.isLoading) {
      this.loadReport();
    }
  }

  loadReport(): void {
    if (!this.reportId) return;

    this.requestSubscription?.unsubscribe();
    this.isLoading = true;
    this.errorMessage = '';
    this.report = null;
    this.selectedPhotoIndex = 0;
    this.photoViewerOpen = false;
    this.brokenPhotos.clear();
    this.changeDetector.markForCheck();

    this.loadReportPage(0, 0);
  }

  private loadReportPage(offset: number, pagesChecked: number): void {
    this.requestSubscription = this.service
      .getMyReports(this.pageSize, offset)
      .subscribe({
        next: (response) => {
          this.zone.run(() => {
            if (!response.success || !Array.isArray(response.reports)) {
              this.finishWithError(response.message || 'Unable to load report details.');
              return;
            }

            const found = response.reports.find(
              (item) => Number(item.id) === this.reportId
            );

            if (found) {
              this.report = found;
              this.isLoading = false;
              this.loadedOnce = true;
              this.changeDetector.markForCheck();
              return;
            }

            // The list API is paginated. Search later pages when necessary.
            if (
              response.has_more &&
              response.reports.length > 0 &&
              pagesChecked + 1 < this.maxPages
            ) {
              this.loadReportPage(offset + response.reports.length, pagesChecked + 1);
              return;
            }

            this.finishWithError(
              'This report was not found among your submitted stray reports.'
            );
          });
        },
        error: (error: HttpErrorResponse) => {
          this.zone.run(() => {
            this.finishWithError(this.formatError(error));
          });
        },
      });
  }

  private finishWithError(message: string): void {
    this.report = null;
    this.isLoading = false;
    this.loadedOnce = true;
    this.errorMessage = message;
    this.changeDetector.markForCheck();
  }

  get animalLabel(): string {
    return this.report?.animal_type === 'dog' ? 'Dog' : 'Cat';
  }

  get reportTitle(): string {
    if (!this.report) return 'Stray Animal Report';
    return `${this.reasonLabel(this.report.assistance_reason)} Stray ${this.animalLabel}`;
  }

  get photoUrls(): string[] {
    if (!this.report) return [];

    const gallery = (this.report.photos ?? [])
      .map((photo) => photo.photo_url)
      .filter((url): url is string => !!url && !this.brokenPhotos.has(url));

    if (gallery.length) return gallery;

    const cover = this.report.cover_photo_url;
    return cover && !this.brokenPhotos.has(cover) ? [cover] : [];
  }

  get selectedPhotoUrl(): string | null {
    const urls = this.photoUrls;
    return urls.length ? urls[Math.min(this.selectedPhotoIndex, urls.length - 1)] : null;
  }

  showPhoto(index: number): void {
    if (index < 0 || index >= this.photoUrls.length) return;
    this.selectedPhotoIndex = index;
    this.photoViewerOpen = true;
  }

  closePhotoViewer(): void {
    this.photoViewerOpen = false;
  }

  nextPhoto(): void {
    const count = this.photoUrls.length;
    if (count > 0) this.selectedPhotoIndex = (this.selectedPhotoIndex + 1) % count;
  }

  previousPhoto(): void {
    const count = this.photoUrls.length;
    if (count > 0) {
      this.selectedPhotoIndex = (this.selectedPhotoIndex - 1 + count) % count;
    }
  }

  photoFailed(url: string): void {
    this.brokenPhotos.add(url);
    this.selectedPhotoIndex = 0;
    if (!this.photoUrls.length) this.photoViewerOpen = false;
    this.changeDetector.markForCheck();
  }

  reasonLabel(reason: StrayAssistanceReason): string {
    const labels: Record<StrayAssistanceReason, string> = {
      injured: 'Injured',
      sick: 'Sick',
      trapped: 'Trapped',
      aggressive: 'Aggressive / Safety Concern',
      abandoned: 'Possibly Abandoned',
      roaming: 'Roaming / Unattended',
      other: 'Other Concern',
    };
    return labels[reason] ?? reason;
  }

  statusLabel(status: StrayReportStatus): string {
    const labels: Record<StrayReportStatus, string> = {
      pending: 'Pending',
      under_review: 'Under Review',
      in_progress: 'In Progress',
      resolved: 'Resolved',
      rejected: 'Rejected',
    };
    return labels[status] ?? status;
  }

  displayDateTime(value: string | null | undefined): string {
    if (!value) return 'Not available';
    return value.replace('T', ' ').slice(0, 16);
  }

  viewOnMap(): void {
    if (!this.report) return;
    const { latitude, longitude } = this.report;
    if (latitude === null || longitude === null) return;

    const url = 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(`${latitude},${longitude}`);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  backToReports(): void {
    void this.router.navigateByUrl('/my-stray-reports');
  }

  private formatError(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Cannot connect to PawRescue. Check XAMPP and your API network address.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'Your session has expired or you do not have permission to view this report.';
    }
    return typeof error.error?.message === 'string'
      ? error.error.message
      : 'Unable to load report details. Please try again.';
  }

  ngOnDestroy(): void {
    this.requestSubscription?.unsubscribe();
  }
}
