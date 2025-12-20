import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('@poalim-challenge/feature-chat').then((m) => m.FeatureChat),
  },
  { path: '**', redirectTo: '' },
  
];
