import { socketHandler } from './socket-handler';

describe('socketHandler', () => {
  it('should work', () => {
    expect(socketHandler()).toEqual('socket-handler');
  });
});
