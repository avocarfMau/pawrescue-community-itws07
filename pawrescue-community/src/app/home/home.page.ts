
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import {
  IonContent,
  IonButton,
  IonIcon
} from '@ionic/angular';

import { AuthService } from '../services/auth';

import { addIcons } from 'ionicons';

import {
  paw,
  searchOutline,
  heartOutline,
  medkitOutline,
  personCircleOutline,
  documentTextOutline,
  homeOutline,
  arrowForwardOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonButton,
    IonIcon
  ]
})
export class HomePage {

  loggingOut = false;
  logoutError = '';

  constructor(
    private router: Router,
    private authService: AuthService
  ) {
    addIcons({
      paw,
      searchOutline,
      heartOutline,
      medkitOutline,
      personCircleOutline,
      documentTextOutline,
      homeOutline,
      arrowForwardOutline
    });
  }

  // =====================================
  // LOST AND FOUND, ADOPTION, STRAY
  // =====================================

  openFeature(feature: string): void {

    // LOST AND FOUND PETS
    if (feature === 'lost-found') {

      this.router.navigateByUrl('/lost-found');
      return;

    }

    // PET ADOPTION COMMUNITY
    if (feature === 'adoption') {

      this.router.navigateByUrl('/pet-adoption');
      return;

    }

    // STRAY ANIMAL ASSISTANCE
    if (feature === 'stray') {

      this.router.navigateByUrl('/stray-assistance');
      return;

    }

    console.log(
      'Unknown feature:',
      feature
    );
  }

  // =====================================
  // MY ACCOUNT
  // =====================================

  openAccount(): void {

    console.log('My Account selected');

    // Account page will be implemented next.

  }

  // =====================================
  // MY REPORTS
  // =====================================

  openReports(): void {

    this.router.navigateByUrl('/my-reports');

  }

  // =====================================
  // LOGOUT
  // =====================================

  logout(): void {

    if (this.loggingOut) {
      return;
    }

    this.loggingOut = true;
    this.logoutError = '';

    this.authService.logout().subscribe({

      next: (success) => {

        this.loggingOut = false;

        if (success) {

          this.router.navigateByUrl('/login', {
            replaceUrl: true
          });

        } else {

          this.logoutError =
            'Unable to log out. Please try again.';

        }

      },

      error: (error) => {

        this.loggingOut = false;

        console.error('Logout error:', error);

        this.logoutError =
          'Unable to log out. Please try again.';

      }

    });

  }

}
