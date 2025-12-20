import { appRoutes } from './app.routes';

describe('appRoutes', () => {
  it('should have a default route for "" with loadComponent', () => {
    const first = appRoutes[0];

    expect(first).toBeTruthy();
    expect(first.path).toBe('');
    expect(typeof first.loadComponent).toBe('function');
  });

  it('should have a wildcard redirect to ""', () => {
    const last = appRoutes[appRoutes.length - 1];

    expect(last).toBeTruthy();
    expect(last.path).toBe('**');
    expect(last.redirectTo).toBe('');
  });
});
