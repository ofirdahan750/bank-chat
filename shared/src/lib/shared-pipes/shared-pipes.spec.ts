import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SharedPipes } from './shared-pipes';

describe('SharedPipes', () => {
  let component: SharedPipes;
  let fixture: ComponentFixture<SharedPipes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SharedPipes],
    }).compileComponents();

    fixture = TestBed.createComponent(SharedPipes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
