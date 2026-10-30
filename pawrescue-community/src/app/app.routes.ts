import { Routes } from '@angular/router';

import { residentGuard } from './guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },

  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },

  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.page').then((m) => m.RegisterPage),
  },

  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
    canActivate: [residentGuard],
  },

  {
    path: 'lost-found',
    loadComponent: () => import('./pages/lost-found/lost-found.page').then((m) => m.LostFoundPage),
    canActivate: [residentGuard],
  },

  {
    path: 'report-pet',
    loadComponent: () => import('./pages/report-pet/report-pet.page').then((m) => m.ReportPetPage),
    canActivate: [residentGuard],
  },

  {
    path: 'my-reports',
    loadComponent: () => import('./pages/my-reports/my-reports.page').then((m) => m.MyReportsPage),
    canActivate: [residentGuard],
  },

  // =====================================
  // EDIT EXISTING PET REPORT
  // =====================================

  {
    path: 'edit-report/:id',
    loadComponent: () => import('./pages/edit-report/edit-report.page').then((m) => m.EditReportPage),
    canActivate: [residentGuard],
  },

  // =====================================
  // PET ADOPTION COMMUNITY
  // =====================================

  {
    path: 'pet-adoption',
    loadComponent: () => import('./pages/pet-adoption/pet-adoption.page').then((m) => m.PetAdoptionPage),
    canActivate: [residentGuard],
  },

  {
    path: 'post-adoption',
    loadComponent: () => import('./pages/post-adoption/post-adoption.page').then((m) => m.PostAdoptionPage),
    canActivate: [residentGuard],
  },

  {
    path: 'my-adoptions',
    loadComponent: () => import('./pages/my-adoptions/my-adoptions.page').then((m) => m.MyAdoptionsPage),
    canActivate: [residentGuard],
  },

  {
    path: 'adoption-details/:id',
    loadComponent: () => import('./pages/adoption-details/adoption-details.page').then((m) => m.AdoptionDetailsPage),
    canActivate: [residentGuard],
  },

  // Keep this route at the very end
  {
    path: '**',
    redirectTo: 'login',
  },
];