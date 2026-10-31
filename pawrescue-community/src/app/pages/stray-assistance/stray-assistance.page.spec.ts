import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StrayAssistancePage } from './stray-assistance.page';

describe('StrayAssistancePage', () => {
  let component: StrayAssistancePage;
  let fixture: ComponentFixture<StrayAssistancePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(StrayAssistancePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
