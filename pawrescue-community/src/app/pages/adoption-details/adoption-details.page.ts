
import {
  Component,
  OnDestroy,
  inject
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  ActivatedRoute,
  Router
} from '@angular/router';

import {
  IonContent,
  IonIcon,
  IonButton,
  IonSpinner
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  arrowBackOutline,
  pawOutline,
  locationOutline,
  chevronBackOutline,
  chevronForwardOutline,
  heartOutline,
  closeOutline,
  informationCircleOutline
} from 'ionicons/icons';

import {
  firstValueFrom,
  timeout
} from 'rxjs';

import {
  PetAdoptionService,
  AdoptionPost
} from '../../services/pet-adoption';

// =====================================
// PAWRESCUE COMMUNITY
// ADOPTION DETAILS PAGE
// =====================================

@Component({
  selector: 'app-adoption-details',
  templateUrl: './adoption-details.page.html',
  styleUrls: ['./adoption-details.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonIcon,
    IonButton,
    IonSpinner
  ]
})
export class AdoptionDetailsPage implements OnDestroy {

  // =====================================
  // SERVICES
  // =====================================

  private readonly adoption =
    inject(PetAdoptionService);

  private readonly route =
    inject(ActivatedRoute);

  private readonly router =
    inject(Router);

  private destroyed = false;

  // =====================================
  // PET DETAILS
  // =====================================

  post: AdoptionPost | null = null;

  loading = false;

  errorMessage = '';

  successMessage = '';

  // =====================================
  // ADOPTION REQUEST
  // =====================================

  message = '';

  submitting = false;

  requested = false;

  requestUncertain = false;

  // =====================================
  // PHOTO GALLERY
  // =====================================

  photoIndex = 0;

  viewerOpen = false;

  private touchX: number | null = null;

  // =====================================
  // CONSTRUCTOR
  // =====================================

  constructor() {

    addIcons({
      arrowBackOutline,
      pawOutline,
      locationOutline,
      chevronBackOutline,
      chevronForwardOutline,
      heartOutline,
      closeOutline,
      informationCircleOutline
    });

  }

  // =====================================
  // PAGE LIFECYCLE
  // =====================================

  ionViewWillEnter(): void {

    void this.load();

  }

  ionViewDidLeave(): void {

    this.viewerOpen = false;

  }

  // =====================================
  // LOAD PET ADOPTION DETAILS
  // =====================================

  async load(): Promise<void> {

    if (this.loading) {
      return;
    }

    const id = Number(
      this.route.snapshot.paramMap.get('id')
    );

    if (
      !Number.isInteger(id) ||
      id < 1
    ) {

      this.post = null;

      this.errorMessage =
        'Invalid adoption post ID.';

      return;
    }

    this.loading = true;

    this.errorMessage = '';

    this.post = null;

    try {

      // If opened from My Adoptions,
      // retrieve the owner's post.

      const mine =
        this.route.snapshot.queryParamMap
          .get('mine') === '1';

      const response = await firstValueFrom(
        this.adoption
          .getPosts(
            'all',
            mine ? 'mine' : 'community',
            'all',
            id
          )
          .pipe(timeout(15000))
      );

      if (this.destroyed) {
        return;
      }

      if (!response.success) {

        this.errorMessage =
          response.message ||
          'Unable to load adoption details.';

        return;
      }

      this.post =
        response.posts?.find(
          item => item.id === id
        ) || null;

      this.photoIndex = 0;

      this.viewerOpen = false;

      if (!this.post) {

        this.errorMessage =
          'This adoption post is unavailable or could not be found.';

      }

    } catch (error: any) {

      if (!this.destroyed) {

        this.errorMessage =
          error.status === 401
            ? 'Session expired. Please log in again.'
            : 'Unable to load adoption details. Check your connection.';

      }

    } finally {

      if (!this.destroyed) {
        this.loading = false;
      }

    }

  }

  // =====================================
  // GET PET PHOTOS
  // =====================================

  get photos(): string[] {

    if (!this.post) {
      return [];
    }

    return this.adoption.getPhotoUrls(
      this.post
    );

  }

  // =====================================
  // CURRENT PHOTO URL
  // =====================================

  get photoUrl(): string | null {

    return (
      this.photos[this.photoIndex] ||
      null
    );

  }

  // =====================================
  // NEXT / PREVIOUS PHOTO
  // =====================================

  movePhoto(delta: number): void {

    const count = this.photos.length;

    if (count <= 1) {
      return;
    }

    this.photoIndex =
      (
        this.photoIndex +
        delta +
        count
      ) % count;

  }

  // =====================================
  // SWIPE PHOTO START
  // =====================================

  onTouchStart(event: TouchEvent): void {

    this.touchX =
      event.changedTouches[0]?.clientX ??
      null;

  }

  // =====================================
  // SWIPE PHOTO END
  // =====================================

  onTouchEnd(event: TouchEvent): void {

    if (this.touchX === null) {
      return;
    }

    const endX =
      event.changedTouches[0]?.clientX ??
      this.touchX;

    const difference =
      endX - this.touchX;

    this.touchX = null;

    if (Math.abs(difference) >= 45) {

      this.movePhoto(
        difference < 0 ? 1 : -1
      );

    }

  }

  // =====================================
  // SUBMIT ADOPTION REQUEST
  // =====================================

  async sendRequest(): Promise<void> {

    // Prevent invalid and duplicate requests.

    if (
      !this.post ||
      this.post.is_owner ||
      this.post.status !== 'available' ||
      this.loading ||
      this.submitting ||
      this.requested ||
      this.requestUncertain
    ) {
      return;
    }

    this.errorMessage = '';

    this.successMessage = '';

    const requestMessage =
      this.message.trim();

    // =====================================
    // VALIDATE MESSAGE
    // =====================================

    if (
      requestMessage.length < 10 ||
      requestMessage.length > 2000
    ) {

      this.errorMessage =
        'Please write an adoption message between 10 and 2000 characters.';

      return;
    }

    // =====================================
    // CONFIRM REQUEST
    // =====================================

    const confirmed = window.confirm(
      `Are you sure you want to submit an adoption request for ${this.post.pet_name}?`
    );

    if (!confirmed) {
      return;
    }

    this.submitting = true;

    try {

      // =====================================
      // SEND REQUEST TO BACKEND
      // =====================================

      const response = await firstValueFrom(
        this.adoption
          .submitRequest(
            this.post.id,
            requestMessage
          )
          .pipe(timeout(20000))
      );

      if (this.destroyed) {
        return;
      }

      if (response.success) {

        this.requested = true;

        this.successMessage =
          'Adoption request submitted successfully! You can track your application in My Adoptions.';

      } else {

        this.errorMessage =
          response.message ||
          'Unable to submit adoption request.';

      }

    } catch (error: any) {

      if (this.destroyed) {
        return;
      }

      if (error.status === 409) {

        // A duplicate request or an unavailable pet.

        this.errorMessage =
          error.error?.message ||
          'This adoption request cannot be submitted.';

        this.requestUncertain = true;

      } else if (
        error.status === 400 ||
        error.status === 403 ||
        error.status === 404
      ) {

        this.errorMessage =
          error.error?.message ||
          'Unable to submit adoption request.';

      } else if (error.status === 401) {

        this.errorMessage =
          'Session expired. Please log in again.';

      } else {

        // Request may have reached the server.
        // Avoid automatically submitting again.

        this.requestUncertain = true;

        this.errorMessage =
          'Unable to confirm your adoption request. Check My Adoptions before trying again.';

      }

    } finally {

      if (!this.destroyed) {
        this.submitting = false;
      }

    }

  }

  // =====================================
  // NAVIGATION - BACK
  // =====================================

  goBack(): void {

    const fromMyAdoptions =
      this.route.snapshot.queryParamMap
        .get('mine') === '1';

    this.router.navigateByUrl(
      fromMyAdoptions
        ? '/my-adoptions'
        : '/pet-adoption'
    );

  }

  // =====================================
  // NAVIGATION - MY ADOPTIONS
  // =====================================

  goToMyAdoptions(): void {

    this.router.navigateByUrl(
      '/my-adoptions'
    );

  }

  // =====================================
  // CLEANUP
  // =====================================

  ngOnDestroy(): void {

    this.destroyed = true;

  }

}
