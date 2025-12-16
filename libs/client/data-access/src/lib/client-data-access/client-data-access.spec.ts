import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClientDataAccess } from './client-data-access';

describe('ClientDataAccess', () => {
  let component: ClientDataAccess;
  let fixture: ComponentFixture<ClientDataAccess>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientDataAccess],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientDataAccess);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
