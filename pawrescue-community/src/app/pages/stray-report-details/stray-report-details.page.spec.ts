import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StrayReportDetailsPage } from './stray-report-details.page';

describe('StrayReportDetailsPage', () => {
  let component: StrayReportDetailsPage;
  let fixture: ComponentFixture<StrayReportDetailsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(StrayReportDetailsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
