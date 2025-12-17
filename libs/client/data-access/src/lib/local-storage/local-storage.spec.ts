// libs/client/data-access/src/lib/services/local-storage.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { LocalStorageService } from './local-storage';

describe('LocalStorageService', () => {
  let service: LocalStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LocalStorageService);

    localStorage.clear();
  });

  it('getString should return null when key is missing', () => {
    expect(service.getString('missing')).toBeNull();
  });

  it('setString should store and return true', () => {
    expect(service.setString('k', 'v')).toBe(true);
    expect(service.getString('k')).toBe('v');
  });

  it('remove should delete the key', () => {
    service.setString('k', 'v');
    service.remove('k');
    expect(service.getString('k')).toBeNull();
  });

  it('setString should return false when storage is unavailable', () => {
    Object.defineProperty(window, 'localStorage', {
      value: undefined,
      configurable: true,
    });

    const fresh = new LocalStorageService();
    expect(fresh.setString('k', 'v')).toBe(false);
  });
});
