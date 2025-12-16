import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiPoalim } from './ui-poalim';

describe('UiPoalim', () => {
  let component: UiPoalim;
  let fixture: ComponentFixture<UiPoalim>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiPoalim],
    }).compileComponents();

    fixture = TestBed.createComponent(UiPoalim);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
