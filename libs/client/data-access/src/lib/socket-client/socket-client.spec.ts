import { TestBed } from '@angular/core/testing';

import { SocketClient } from './socket-client';

describe('SocketClient', () => {
  let service: SocketClient;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SocketClient);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
