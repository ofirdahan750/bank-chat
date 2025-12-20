// libs/client/data-access/src/lib/local-storage/local-storage.spec.ts

import { TestBed } from '@angular/core/testing';
import { LocalStorageService } from './local-storage';

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key) ?? null : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.map.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('LocalStorageService', () => {
  let service: LocalStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // cleanup window.localStorage override if any
    if (typeof window !== 'undefined') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (window as any).localStorage;
      } catch {
        // ignore
      }
    }
  });

  it('should create', () => {
    service = TestBed.inject(LocalStorageService);
    expect(service).toBeTruthy();
  });

  it('getString() should return null when storage is not available', () => {
    // Force initStorage to see "no window" (without messing with globals):
    // instantiate directly and stub initStorage
    const s = new LocalStorageService() as any;
    jest.spyOn(s, 'initStorage').mockReturnValue(null);

    const reCreated = new (LocalStorageService as any)() as LocalStorageService;
    // NOTE: Above line creates a new instance without our spy.
    // So we instead patch its private storage after creation.
    (reCreated as any).storage = null;

    expect(reCreated.getString('x')).toBeNull();
  });

  it('getString() should read from storage when available', () => {
    const mem = new MemoryStorage();

    service = TestBed.inject(LocalStorageService);
    (service as any).storage = mem;

    mem.setItem('k', 'v');
    expect(service.getString('k')).toBe('v');
    expect(service.getString('missing')).toBeNull();
  });

  it('setString() should return false when storage is not available', () => {
    service = TestBed.inject(LocalStorageService);
    (service as any).storage = null;

    expect(service.setString('k', 'v')).toBe(false);
  });

  it('setString() should write and return true when available', () => {
    const mem = new MemoryStorage();

    service = TestBed.inject(LocalStorageService);
    (service as any).storage = mem;

    expect(service.setString('k', 'v')).toBe(true);
    expect(mem.getItem('k')).toBe('v');
  });

  it('setString() should return false if storage throws', () => {
    const mem = new MemoryStorage();
    const setSpy = jest.spyOn(mem, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    service = TestBed.inject(LocalStorageService);
    (service as any).storage = mem;

    expect(service.setString('k', 'v')).toBe(false);
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it('remove() should not throw when storage is not available', () => {
    service = TestBed.inject(LocalStorageService);
    (service as any).storage = null;

    expect(() => service.remove('k')).not.toThrow();
  });

  it('remove() should remove key when available', () => {
    const mem = new MemoryStorage();

    service = TestBed.inject(LocalStorageService);
    (service as any).storage = mem;

    mem.setItem('k', 'v');
    service.remove('k');
    expect(mem.getItem('k')).toBeNull();
  });
});
