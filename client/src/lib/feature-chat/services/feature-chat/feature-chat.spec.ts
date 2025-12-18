import { TestBed } from '@angular/core/testing';

import { FeatureChat } from './feature-chat';

describe('FeatureChat', () => {
  let service: FeatureChat;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FeatureChat);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
