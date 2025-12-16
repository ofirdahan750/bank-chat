import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClientCore } from './client-core';

describe('ClientCore', () => {
  let component: ClientCore;
  let fixture: ComponentFixture<ClientCore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientCore],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientCore);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
