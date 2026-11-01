import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReportStrayPage } from './report-stray.page';

describe('ReportStrayPage', () => {
  let component: ReportStrayPage;
  let fixture: ComponentFixture<ReportStrayPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ReportStrayPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
