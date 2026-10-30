
import {
  Component,
  OnDestroy,
  inject
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

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
  refreshOutline,
  addOutline,
  checkmarkCircleOutline,
  closeOutline,
  chevronBackOutline,
  chevronForwardOutline,
  locationOutline,
  heartOutline
} from 'ionicons/icons';

import {
  firstValueFrom,
  timeout
} from 'rxjs';

import {
  AdoptionPost,
  AdoptionRequest,
  PetAdoptionService
} from '../../services/pet-adoption';

// =====================================
// TAB TYPES
// =====================================

type Tab = 'posts' | 'received' | 'sent';

// =====================================
// MY ADOPTIONS PAGE
// =====================================

@Component({
  selector: 'app-my-adoptions',
  templateUrl: './my-adoptions.page.html',
  styleUrls: ['./my-adoptions.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonButton,
    IonSpinner
  ]
})
export class MyAdoptionsPage implements OnDestroy {

  // =====================================
  // SERVICES
  // =====================================

  private readonly adoption =
    inject(PetAdoptionService);

  private readonly router =
    inject(Router);

  private destroyed = false;

  // =====================================
  // PAGE STATE
  // =====================================

  selectedTab: Tab = 'posts';

  posts: AdoptionPost[] = [];

  received: AdoptionRequest[] = [];

  sent: AdoptionRequest[] = [];

  loading = false;

  busy = false;

  errorMessage = '';

  successMessage = '';

  // =====================================
  // PHOTO GALLERY STATE
  // =====================================

  private photoIndexes =
    new Map<number, number>();

  viewerPost: AdoptionPost | null = null;

  private touchX: number | null = null;

  // =====================================
  // CONSTRUCTOR
  // =====================================

  constructor() {

    addIcons({
      arrowBackOutline,
      pawOutline,
      refreshOutline,
      addOutline,
      checkmarkCircleOutline,
      closeOutline,
      chevronBackOutline,
      chevronForwardOutline,
      locationOutline,
      heartOutline
    });

  }

  // =====================================
  // IONIC LIFECYCLE
  // =====================================

  ionViewWillEnter(): void {

    void this.loadAll();

  }

  ionViewDidLeave(): void {

    this.viewerPost = null;

  }

  // =====================================
  // LOAD ALL ADOPTION INFORMATION
  // =====================================

  async loadAll(
    preserveMessages = false
  ): Promise<void> {

    if (this.loading || this.busy) {
      return;
    }

    this.loading = true;

    if (!preserveMessages) {

      this.errorMessage = '';

      this.successMessage = '';

    }

    try {

      // Get own adoption posts,
      // received requests and sent requests.

      const [
        posts,
        received,
        sent
      ] = await Promise.all([

        firstValueFrom(
          this.adoption
            .getPosts('all', 'mine')
            .pipe(timeout(15000))
        ),

        firstValueFrom(
          this.adoption
            .getRequests('received')
            .pipe(timeout(15000))
        ),

        firstValueFrom(
          this.adoption
            .getRequests('sent')
            .pipe(timeout(15000))
        )

      ]);

      if (this.destroyed) {
        return;
      }

      if (
        !posts.success ||
        !received.success ||
        !sent.success
      ) {

        throw new Error(
          'Unable to retrieve adoption data.'
        );

      }

      this.posts = posts.posts || [];

      this.received =
        received.requests || [];

      this.sent =
        sent.requests || [];

      this.photoIndexes.clear();

    } catch (error: any) {

      if (!this.destroyed) {

        this.errorMessage =
          error.status === 401
            ? 'Session expired. Please log in again.'
            : 'Unable to load adoption information. Check your connection.';

      }

    } finally {

      if (!this.destroyed) {
        this.loading = false;
      }

    }

  }

  // =====================================
  // CHANGE SELECTED TAB
  // =====================================

  setTab(tab: Tab): void {

    this.selectedTab = tab;

    this.errorMessage = '';

    this.successMessage = '';

  }

  // =====================================
  // GET ADOPTION PHOTO URLS
  // =====================================

  photoUrls(
    post: AdoptionPost
  ): string[] {

    return this.adoption.getPhotoUrls(post);

  }

  // =====================================
  // CURRENT PHOTO INDEX
  // =====================================

  index(post: AdoptionPost): number {

    return Math.min(
      this.photoIndexes.get(post.id) || 0,
      Math.max(
        0,
        this.photoUrls(post).length - 1
      )
    );

  }

  // =====================================
  // CURRENT PHOTO URL
  // =====================================

  currentUrl(
    post: AdoptionPost
  ): string | null {

    return (
      this.photoUrls(post)[this.index(post)] ||
      null
    );

  }

  // =====================================
  // NEXT / PREVIOUS PHOTO
  // =====================================

  movePhoto(
    post: AdoptionPost,
    delta: number
  ): void {

    const count =
      this.photoUrls(post).length;

    if (count > 1) {

      this.photoIndexes.set(
        post.id,
        (
          this.index(post) +
          delta +
          count
        ) % count
      );

    }

  }

  // =====================================
  // SWIPE PHOTO START
  // =====================================

  touchStart(event: TouchEvent): void {

    this.touchX =
      event.changedTouches[0]?.clientX ?? null;

  }

  // =====================================
  // SWIPE PHOTO END
  // =====================================

  touchEnd(
    event: TouchEvent,
    post: AdoptionPost
  ): void {

    if (this.touchX === null) {
      return;
    }

    const dx =
      (
        event.changedTouches[0]?.clientX ??
        this.touchX
      ) - this.touchX;

    this.touchX = null;

    if (Math.abs(dx) > 45) {

      this.movePhoto(
        post,
        dx < 0 ? 1 : -1
      );

    }

  }

  // =====================================
  // FORMAT STATUS LABEL
  // =====================================

  statusLabel(status: string): string {

    return status
      .replace(/_/g, ' ')
      .replace(
        /\b\w/g,
        char => char.toUpperCase()
      );

  }

  // =====================================
  // APPROVE / REJECT ADOPTION REQUEST
  // =====================================

  async actOnRequest(
    request: AdoptionRequest,
    action: 'approve' | 'reject'
  ): Promise<void> {

    if (
      this.busy ||
      this.loading ||
      request.status !== 'pending'
    ) {
      return;
    }

    const warning =
      action === 'approve'
        ? `Approve ${request.requester_name}'s request for ${request.pet_name}? Other pending requests will be rejected. Confirm adoption separately after the physical handover.`
        : `Reject ${request.requester_name}'s request for ${request.pet_name}?`;

    // Require confirmation before updating.
    if (!window.confirm(warning)) {
      return;
    }

    this.busy = true;

    this.errorMessage = '';

    this.successMessage = '';

    try {

      const response =
        await firstValueFrom(
          this.adoption
            .respondToRequest(
              request.id,
              action
            )
            .pipe(timeout(20000))
        );

      if (!response.success) {

        throw new Error(
          response.message
        );

      }

      if (!this.destroyed) {

        this.successMessage =
          response.message;

      }

    } catch (error: any) {

      if (!this.destroyed) {

        this.errorMessage =
          error.error?.message ||
          'Unable to confirm the update. Refresh requests before trying again.';

      }

    } finally {

      this.busy = false;

      if (!this.destroyed) {

        await this.loadAll(true);

      }

    }

  }

  // =====================================
  // COMPLETE ADOPTION AFTER HANDOVER
  // =====================================

  async finishAdoption(
    post: AdoptionPost
  ): Promise<void> {

    if (
      this.busy ||
      this.loading ||
      post.status !== 'reserved'
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Has ${post.pet_name} actually been handed over to the approved adopter? Only mark adopted after a completed handover.`
    );

    if (!confirmed) {
      return;
    }

    this.busy = true;

    this.errorMessage = '';

    this.successMessage = '';

    try {

      const response =
        await firstValueFrom(
          this.adoption
            .completeAdoption(post.id)
            .pipe(timeout(20000))
        );

      if (!response.success) {

        throw new Error(
          response.message
        );

      }

      if (!this.destroyed) {

        this.successMessage =
          response.message;

      }

    } catch (error: any) {

      if (!this.destroyed) {

        this.errorMessage =
          error.error?.message ||
          'Unable to confirm completion. Refresh the post before trying again.';

      }

    } finally {

      this.busy = false;

      if (!this.destroyed) {

        await this.loadAll(true);

      }

    }

  }

  // =====================================
  // VIEW ADOPTION POST
  // =====================================

  viewPost(post: AdoptionPost): void {

    this.router.navigate(
      [
        '/adoption-details',
        post.id
      ],
      {
        queryParams: {
          mine: 1
        }
      }
    );

  }

  // =====================================
  // TRACK ADOPTION POSTS
  // =====================================

  trackPost(
    _index: number,
    post: AdoptionPost
  ): number {

    return post.id;

  }

  // =====================================
  // TRACK ADOPTION REQUESTS
  // =====================================

  trackRequest(
    _index: number,
    request: AdoptionRequest
  ): number {

    return request.id;

  }

  // =====================================
  // NAVIGATION
  // =====================================

  goBack(): void {

    this.router.navigateByUrl(
      '/pet-adoption'
    );

  }

  postPet(): void {

    this.router.navigateByUrl(
      '/post-adoption'
    );

  }

  // =====================================
  // CLEANUP
  // =====================================

  ngOnDestroy(): void {

    this.destroyed = true;

  }

}
