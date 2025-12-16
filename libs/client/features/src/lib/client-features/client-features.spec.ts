import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClientFeatures } from './client-features';

describe('ClientFeatures', () => {
  let component: ClientFeatures;
  let fixture: ComponentFixture<ClientFeatures>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientFeatures],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientFeatures);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
