import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonButton,
  IonToast,
} from '@ionic/angular';

@Component({
  selector: 'app-stray-assistance',
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
    IonToast,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home" text="Back"></ion-back-button>
        </ion-buttons>
        <ion-title>Stray Animal Assistance</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <main class="page-container">
        <section class="hero" aria-labelledby="stray-title">
          <div class="hero-eyebrow">PAWRESCUE COMMUNITY</div>
          <h1 id="stray-title">Help a stray animal in need</h1>
          <p>
            Report a stray dog or cat that may require attention from the
            Municipal Veterinary Office. Include a clear description and
            location to help staff review the situation.
          </p>
        </section>

        <section class="actions" aria-label="Stray animal assistance actions">
          <article class="action-card">
            <div class="card-icon" aria-hidden="true">+</div>
            <div class="card-copy">
              <h2>Report a Stray Animal</h2>
              <p>Submit details about an animal that needs assistance.</p>
            </div>
            <ion-button expand="block" (click)="showNextStep('report')">
              Create Report
            </ion-button>
          </article>

          <article class="action-card">
            <div class="card-icon secondary-icon" aria-hidden="true">&#9776;</div>
            <div class="card-copy">
              <h2>My Stray Reports</h2>
              <p>View your reports and follow their assistance status.</p>
            </div>
            <ion-button fill="outline" expand="block" (click)="showNextStep('mine')">
              View My Reports
            </ion-button>
          </article>
        </section>

        <section class="info" aria-labelledby="how-it-works">
          <h2 id="how-it-works">How it works</h2>
          <ol>
            <li><strong>Report:</strong> Describe the stray animal and its location.</li>
            <li><strong>Review:</strong> Veterinary Office staff review the report.</li>
            <li><strong>Updates:</strong> Track the status as assistance progresses.</li>
          </ol>
          <p class="notice">
            For an immediate threat to people or a critical emergency,
            contact your local emergency services directly.
          </p>
        </section>
      </main>

      <ion-toast
        [isOpen]="toastOpen"
        [message]="toastMessage"
        [duration]="2600"
        position="bottom"
        (didDismiss)="toastOpen = false"
      ></ion-toast>
    </ion-content>
  `,
  styles: [`
    :host { --ion-color-primary: #247b52; --ion-color-primary-contrast: #ffffff; }
    ion-toolbar { --background: #ffffff; --color: #183f2d; }
    ion-content { --background: #f5f8f5; }
    ion-title { font-size: 17px; font-weight: 700; }
    ion-back-button { --color: #247b52; }
    .page-container { width: min(100%, 760px); margin: 0 auto; padding: 20px 16px 44px; }
    .hero { padding: 26px 22px; border-radius: 22px; color: #ffffff; background: linear-gradient(135deg, #276d4a, #439368); }
    .hero-eyebrow { font-size: 11px; letter-spacing: 1.6px; font-weight: 750; opacity: .85; }
    .hero h1 { font-size: clamp(24px, 5vw, 32px); line-height: 1.15; letter-spacing: -.4px; margin: 12px 0; }
    .hero p { margin: 0; max-width: 540px; font-size: 14px; line-height: 1.65; color: #e7f7eb; }
    .actions { display: grid; grid-template-columns: 1fr; gap: 14px; margin: 20px 0 24px; }
    .action-card { background: #ffffff; border: 1px solid #e2eae3; border-radius: 18px; padding: 20px; box-shadow: 0 4px 18px rgba(23, 69, 45, .04); }
    .card-icon { display: grid; place-items: center; width: 42px; height: 42px; background: #e5f4e9; color: #247b52; font-size: 28px; font-weight: 500; border-radius: 12px; margin-bottom: 14px; }
    .secondary-icon { font-size: 22px; }
    .card-copy { min-height: 86px; }
    .card-copy h2 { color: #193a29; font-size: 18px; margin: 0 0 8px; }
    .card-copy p { color: #62756b; font-size: 13px; line-height: 1.5; margin: 0 0 20px; }
    ion-button { --border-radius: 11px; min-height: 44px; text-transform: none; font-weight: 650; }
    .info { padding: 0 4px; }
    .info h2 { font-size: 18px; color: #193a29; }
    .info ol { padding-left: 22px; color: #4d6054; font-size: 14px; line-height: 1.8; }
    .info li { margin-bottom: 7px; }
    .notice { color: #6b756f; font-size: 12px; line-height: 1.6; margin-top: 20px; }
    @media (min-width: 620px) { .page-container { padding: 32px 24px 56px; } .actions { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `],
})
export class StrayAssistancePage {
  toastOpen = false;
  toastMessage = '';

  constructor(private router: Router) {}

  showNextStep(action: 'report' | 'mine'): void {
    if (action === 'report') {
      void this.router.navigateByUrl('/report-stray');
      return;
    }

    this.toastMessage = 'Report tracking will be available after we build the reporting feature.';
    this.toastOpen = true;
  }
}
