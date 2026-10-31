import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  alertCircleOutline,
  arrowBackOutline,
  documentTextOutline,
  listOutline,
  pawOutline,
  shieldCheckmarkOutline,
  timeOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-stray-assistance',
  standalone: true,
  imports: [CommonModule, IonContent, IonButton, IonIcon],
  templateUrl: './stray-assistance.page.html',
  styleUrls: ['./stray-assistance.page.scss'],
})
export class StrayAssistancePage {
  private readonly router = inject(Router);

  constructor() {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'paw-outline': pawOutline,
      'add-outline': addOutline,
      'list-outline': listOutline,
      'document-text-outline': documentTextOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
      'time-outline': timeOutline,
      'alert-circle-outline': alertCircleOutline,
    });
  }

  goBack(): void {
    void this.router.navigateByUrl('/home');
  }

  goToReport(): void {
    void this.router.navigateByUrl('/report-stray');
  }

  goToMyReports(): void {
    void this.router.navigateByUrl('/my-stray-reports');
  }
}
