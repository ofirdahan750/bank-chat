import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeatureChat } from './feature-chat';

describe('FeatureChat', () => {
  let component: FeatureChat;
  let fixture: ComponentFixture<FeatureChat>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureChat],
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureChat);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
