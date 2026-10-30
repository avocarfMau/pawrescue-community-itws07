import {
  Component,
  OnDestroy,
  inject,
  ChangeDetectorRef,
  NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  cameraOutline,
  imagesOutline,
  closeCircleOutline,
  informationCircleOutline,
  checkmarkCircleOutline
} from 'ionicons/icons';
import { Camera, CameraDirection } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom, timeout } from 'rxjs';
import {
  PetAdoptionService,
  NewAdoptionPost
} from '../../services/pet-adoption';

interface SelectedPhoto {
  file: File;
  preview: string;
}

@Component({
  selector: 'app-post-adoption',
  templateUrl: './post-adoption.page.html',
  styleUrls: ['./post-adoption.page.scss'],
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
export class PostAdoptionPage implements OnDestroy {
  private readonly adoption = inject(PetAdoptionService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private destroyed = false;

  readonly barangays = [
    'San Bartolome',
    'Burgos',
    'Rizal',
    'Bonifacio',
    'Mallorca',
    'Mambangnan',
    'Diversion',
    'Tambo-Adorable',
    'Nieves',
    'Tabuating',
    'Magpapalayoc',
    'San Anton',
    'Castellano',
    'Tagumpay',
    'San Roque'
  ];

  readonly maxPhotos = 10;
  selectedPhotos: SelectedPhoto[] = [];

  model = {
    pet_name: '',
    animal_type: 'dog' as 'dog' | 'cat',
    sex: 'unknown' as 'male' | 'female' | 'unknown',
    age_months: null as number | null,
    breed: '',
    description: '',
    health_notes: '',
    barangay: '',
    location_details: ''
  };

  cameraOpening = false;
  saving = false;
  uploading = false;
  uploadPosition = 0;
  uploadedCount = 0;
  createdId: number | null = null;
  submissionUncertain = false;
  errorMessage = '';
  photoError = '';
  successMessage = '';

  constructor() {
    addIcons({
      arrowBackOutline,
      pawOutline,
      cameraOutline,
      imagesOutline,
      closeCircleOutline,
      informationCircleOutline,
      checkmarkCircleOutline
    });
  }

  private get isLocked(): boolean {
    return (
      this.saving ||
      this.uploading ||
      this.cameraOpening ||
      this.createdId !== null ||
      this.submissionUncertain
    );
  }

  // Add gallery photos. Keep original previews for immediate feedback.
  onPhotosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';

    if (this.isLocked) return;
    this.photoError = '';

    for (const file of files) {
      if (this.selectedPhotos.length >= this.maxPhotos) {
        this.photoError = 'Maximum of 10 photos per adoption post.';
        break;
      }

      const allowed = [
        'image/jpeg',
        'image/png',
        'image/webp'
      ].includes(file.type);

      if (!allowed || file.size < 1 || file.size > 5 * 1024 * 1024) {
        this.photoError =
          'Each photo must be JPG, PNG, or WebP and no larger than 5 MB.';
        continue;
      }

      this.selectedPhotos.push({
        file,
        preview: URL.createObjectURL(file)
      });
    }
  }

  // Android camera. The chosen photo is already optimized for uploading.
  async takePhoto(): Promise<void> {
    if (this.isLocked) return;

    if (this.selectedPhotos.length >= this.maxPhotos) {
      this.photoError = 'Maximum of 10 photos per adoption post.';
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      this.photoError =
        'Camera capture is available in the Android app. Use Choose Photos in the browser.';
      return;
    }

    this.cameraOpening = true;
    this.photoError = '';

    try {
      const captured = await Camera.takePhoto({
        quality: 75,
        cameraDirection: CameraDirection.Rear,
        targetWidth: 1600,
        targetHeight: 1600,
        saveToGallery: false
      });

      if (!captured.webPath) {
        throw new Error('Camera did not return an image.');
      }

      const response = await fetch(captured.webPath);
      if (!response.ok) throw new Error('Unable to read camera image.');

      const file = await this.compressPhoto(await response.blob());
      if (this.destroyed) return;

      if (file.size < 1 || file.size > 5 * 1024 * 1024) {
        throw new Error('Photo exceeds 5 MB.');
      }

      this.zone.run(() => {
        this.selectedPhotos.push({
          file,
          preview: URL.createObjectURL(file)
        });
        this.cdr.detectChanges();
      });
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('cancel') && !this.destroyed) {
        this.zone.run(() => {
          this.photoError =
            'Unable to capture photo. Check camera permission and try again.';
          this.cdr.detectChanges();
        });
      }
    } finally {
      if (!this.destroyed) {
        this.zone.run(() => {
          this.cameraOpening = false;
          this.cdr.detectChanges();
        });
      }
    }
  }

  // Converts large camera photos to an upload-friendly JPEG.
  private async compressPhoto(blob: Blob): Promise<File> {
    const result = await this.resizeImage(blob);
    if (!result) throw new Error('Unable to process camera photo.');
    return new File(
      [result],
      `adoption-camera-${Date.now()}.jpg`,
      { type: 'image/jpeg' }
    );
  }

  // Reduce the upload size without changing the selected photo order.
  // Keep the original when conversion is unsupported or is not smaller.
  private async optimizePhoto(file: File): Promise<File> {
    if (file.size < 250 * 1024) return file;

    try {
      const converted = await this.resizeImage(file);
      if (!converted || converted.size >= file.size) return file;
      return new File(
        [converted],
        `${file.name.replace(/\.[^.]+$/, '') || 'adoption-photo'}.jpg`,
        { type: 'image/jpeg' }
      );
    } catch {
      return file;
    }
  }

  // 1280px long side and JPEG compression substantially reduce transfer size
  // for large phone-camera images. White background avoids black transparent pixels.
  private async resizeImage(blob: Blob): Promise<Blob | null> {
    const bitmap = await createImageBitmap(blob);

    try {
      const scale = Math.min(
        1,
        1280 / Math.max(bitmap.width, bitmap.height)
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const output = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.76);
      });

      if (!output || output.size < 1 || output.size > 5 * 1024 * 1024) {
        return null;
      }
      return output;
    } finally {
      bitmap.close();
    }
  }

  removePhoto(index: number): void {
    if (this.isLocked) return;
    const removed = this.selectedPhotos.splice(index, 1)[0];
    if (removed) URL.revokeObjectURL(removed.preview);
    this.photoError = '';
  }

  async submitPost(): Promise<void> {
    if (this.isLocked || this.destroyed) return;

    this.errorMessage = '';
    this.photoError = '';
    this.successMessage = '';

    const rawAge: unknown = this.model.age_months;
    const age = rawAge === null || rawAge === undefined || rawAge === ''
      ? null
      : Number(rawAge);

    const data: NewAdoptionPost = {
      pet_name: this.model.pet_name.trim(),
      animal_type: this.model.animal_type,
      sex: this.model.sex,
      age_months: age,
      breed: this.model.breed.trim() || null,
      description: this.model.description.trim(),
      health_notes: this.model.health_notes.trim() || null,
      barangay: this.model.barangay,
      location_details: this.model.location_details.trim() || null
    };

    if (!data.pet_name || !data.description || !this.barangays.includes(data.barangay)) {
      this.errorMessage = 'Please complete the required fields.';
      return;
    }

    if (
      age !== null &&
      (!Number.isInteger(age) || age < 0 || age > 600)
    ) {
      this.errorMessage = 'Age must be between 0 and 600 months.';
      return;
    }

    if (
      data.pet_name.length > 100 ||
      data.description.length > 5000 ||
      (data.breed?.length || 0) > 120 ||
      (data.health_notes?.length || 0) > 3000 ||
      (data.location_details?.length || 0) > 255
    ) {
      this.errorMessage = 'One or more fields are too long.';
      return;
    }

    // The database insert is the FIRST step. Once confirmed, stop saying
    // "Saving..." and show the photo-upload progress separately.
    this.saving = true;
    try {
      const result = await firstValueFrom(
        this.adoption.createPost(data).pipe(timeout(20000))
      );
      if (!result.success || !Number.isInteger(result.adoption_id) || result.adoption_id < 1) {
        this.errorMessage = result.message || 'Unable to create adoption post.';
        return;
      }

      this.createdId = result.adoption_id;
      this.successMessage = 'Adoption post saved successfully.';
    } catch (error: any) {
      if (error.status === 400 || error.status === 415) {
        this.errorMessage = error.error?.message || 'Invalid post details.';
      } else if (error.status === 401) {
        this.errorMessage = 'Session expired. Please log in again.';
      } else {
        this.submissionUncertain = true;
        this.errorMessage =
          'Unable to confirm post creation. Check My Adoptions before submitting again to avoid duplicates.';
      }
      return;
    } finally {
      this.saving = false;
    }

    // Saving the listing and uploading photos are separate operations.
    if (this.createdId !== null && this.selectedPhotos.length > 0) {
      await this.uploadPhotos();
    }
  }

  private async uploadPhotos(): Promise<void> {
    if (this.createdId === null || this.uploading || this.destroyed) return;

    this.uploading = true;
    this.uploadPosition = 0;
    this.uploadedCount = 0;

    try {
      // Upload sequentially: backend assigns sort_order as each photo arrives.
      for (let i = 0; i < this.selectedPhotos.length; i++) {
        if (this.destroyed) break;

        this.uploadPosition = i + 1;
        const uploadFile = await this.optimizePhoto(this.selectedPhotos[i].file);

        try {
          const result = await firstValueFrom(
            this.adoption
              .uploadPhoto(this.createdId, uploadFile)
              .pipe(timeout(30000))
          );

          if (!result.success) {
            throw new Error(result.message || 'Photo upload failed.');
          }
          this.uploadedCount++;
        } catch (error: any) {
          this.photoError =
            `Your pet post is saved, but photo ${i + 1} could not be confirmed. ` +
            `${error?.error?.message || 'There may be a connection problem.'} ` +
            'Check My Adoptions before trying again to avoid duplicate photos.';
          break;
        }
      }
    } catch {
      this.photoError =
        'Your pet post was saved, but a photo could not be processed. Check My Adoptions.';
    } finally {
      this.uploading = false;
    }

    if (!this.destroyed && !this.photoError && this.uploadedCount === this.selectedPhotos.length) {
      this.successMessage =
        `Pet posted successfully with ${this.uploadedCount} photo(s)!`;
    }
  }

  goBack(): void {
    if (!this.saving && !this.uploading) {
      this.router.navigateByUrl('/pet-adoption');
    }
  }

  viewMyAdoptions(): void {
    if (!this.saving && !this.uploading) {
      this.router.navigateByUrl('/my-adoptions');
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    for (const photo of this.selectedPhotos) {
      URL.revokeObjectURL(photo.preview);
    }
  }
}
