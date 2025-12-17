import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LocalStorageService {
  // Keep a safe reference. If storage is blocked, this becomes null.
  private readonly storage: Storage | null = this.initStorage();

  private initStorage(): Storage | null {
    // localStorage exists only in the browser.
    if (typeof window === 'undefined') return null;

    // Some environments can throw here (blocked storage / quota).
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  getString(key: string): string | null {
    // If storage is not available, behave like "not found".
    return this.storage?.getItem(key) ?? null;
  }

  setString(key: string, value: string): boolean {
    // Return success/failure so the caller can decide what to do.
    if (!this.storage) return false;

    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    // Removing is safe even if key does not exist.
    this.storage?.removeItem(key);
  }
}
