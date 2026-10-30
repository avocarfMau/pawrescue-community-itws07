
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
  addOutline,
  refreshOutline,
  imagesOutline,
  chevronBackOutline,
  chevronForwardOutline,
  closeOutline,
  expandOutline,
  locationOutline,
  calendarOutline,
  heartOutline,
  listOutline
} from 'ionicons/icons';

import {
  Subscription,
  finalize,
  timeout
} from 'rxjs';

import {
  PetAdoptionService,
  AdoptionPost
} from '../../services/pet-adoption';

// =====================================
// ANIMAL FILTER TYPES
// =====================================

type AnimalFilter = 'all' | 'dog' | 'cat';

// =====================================
// PET ADOPTION PAGE
// =====================================

@Component({
  selector: 'app-pet-adoption',
  templateUrl: './pet-adoption.page.html',
  styleUrls: ['./pet-adoption.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonButton,
    IonSpinner
  ]
})
export class PetAdoptionPage implements OnDestroy {

  // =====================================
  // SERVICES
  // =====================================

  private readonly adoption =
    inject(PetAdoptionService);

  private readonly router =
    inject(Router);

  private request?: Subscription;

  // =====================================
  // PAGE STATE
  // =====================================

  posts: AdoptionPost[] = [];

  selectedFilter: AnimalFilter = 'all';

  loading = false;

  errorMessage = '';

  viewerPost: AdoptionPost | null = null;

  // =====================================
  // PHOTO GALLERY STATE
  // =====================================

  private photoIndexes =
    new Map<number, number>();

  private startX: number | null = null;

  // =====================================
  // CONSTRUCTOR
  // =====================================

  constructor() {

    addIcons({
      arrowBackOutline,
      pawOutline,
      addOutline,
      refreshOutline,
      imagesOutline,
      chevronBackOutline,
      chevronForwardOutline,
      closeOutline,
      expandOutline,
      locationOutline,
      calendarOutline,
      heartOutline,
      listOutline
    });

  }

  // =====================================
  // IONIC LIFECYCLE
  // =====================================

  ionViewWillEnter(): void {

    this.loadPosts();

  }

  ionViewDidLeave(): void {

    this.closeViewer();

  }

  // =====================================
  // LOAD ADOPTION LISTINGS
  // =====================================

  loadPosts(): void {

    this.request?.unsubscribe();

    this.loading = true;

    this.errorMessage = '';

    this.request = this.adoption
      .getPosts(this.selectedFilter)
      .pipe(
        timeout(15000),
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({

        next: response => {

          if (response.success) {

            this.posts = response.posts || [];

            this.photoIndexes.clear();

          } else {

            this.errorMessage =
              response.message ||
              'Unable to load adoption listings.';

          }

        },

        error: error => {

          this.errorMessage =
            error.status === 401
              ? 'Session expired. Please log in again.'
              : 'Unable to load adoption listings. Check your connection.';

        }

      });

  }

  // =====================================
  // FILTER PETS
  // =====================================

  changeFilter(filter: AnimalFilter): void {

    if (filter === this.selectedFilter) {
      return;
    }

    this.selectedFilter = filter;

    this.loadPosts();

  }

  // =====================================
  // GET PHOTO URLS
  // =====================================

  urls(post: AdoptionPost): string[] {

    return this.adoption.getPhotoUrls(post);

  }

  // =====================================
  // CURRENT PHOTO INDEX
  // =====================================

  index(post: AdoptionPost): number {

    return Math.min(
      this.photoIndexes.get(post.id) || 0,
      Math.max(0, this.urls(post).length - 1)
    );

  }

  // =====================================
  // CURRENT PHOTO URL
  // =====================================

  currentUrl(post: AdoptionPost): string | null {

    return this.urls(post)[this.index(post)] || null;

  }

  // =====================================
  // SELECT PHOTO
  // =====================================

  choosePhoto(
    post: AdoptionPost,
    index: number
  ): void {

    if (
      index >= 0 &&
      index < this.urls(post).length
    ) {

      this.photoIndexes.set(post.id, index);

    }

  }

  // =====================================
  // NEXT / PREVIOUS PHOTO
  // =====================================

  movePhoto(
    post: AdoptionPost,
    offset: number
  ): void {

    const count = this.urls(post).length;

    if (count > 1) {

      this.photoIndexes.set(
        post.id,
        (this.index(post) + offset + count) % count
      );

    }

  }

  // =====================================
  // TOUCH SWIPE START
  // =====================================

  touchStart(event: TouchEvent): void {

    this.startX =
      event.changedTouches[0]?.clientX ?? null;

  }

  // =====================================
  // TOUCH SWIPE END
  // =====================================

  touchEnd(
    event: TouchEvent,
    post: AdoptionPost
  ): void {

    if (this.startX === null) {
      return;
    }

    const delta =
      (event.changedTouches[0]?.clientX ?? this.startX)
      - this.startX;

    this.startX = null;

    if (Math.abs(delta) >= 45) {

      this.movePhoto(
        post,
        delta < 0 ? 1 : -1
      );

    }

  }

  // =====================================
  // OPEN FULL PHOTO VIEWER
  // =====================================

  openViewer(post: AdoptionPost): void {

    this.viewerPost = post;

  }

  // =====================================
  // CLOSE PHOTO VIEWER
  // =====================================

  closeViewer(): void {

    this.viewerPost = null;

    this.startX = null;

  }

  // =====================================
  // VIEW ADOPTION DETAILS
  // =====================================

  openPost(post: AdoptionPost): void {

    this.closeViewer();

    this.router.navigate([
      '/adoption-details',
      post.id
    ]);

  }

  // =====================================
  // TRACK POSTS
  // =====================================

  trackPost(
    _index: number,
    post: AdoptionPost
  ): number {

    return post.id;

  }

  // =====================================
  // NAVIGATION
  // =====================================

  goBack(): void {

    this.router.navigateByUrl('/home');

  }

  postPet(): void {

    this.router.navigateByUrl('/post-adoption');

  }

  myAdoptions(): void {

    this.router.navigateByUrl('/my-adoptions');

  }

  // =====================================
  // CLEANUP
  // =====================================

  ngOnDestroy(): void {

    this.request?.unsubscribe();

  }

}
