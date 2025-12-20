export type SocketEvent<T> = { kind: 'empty' } | { kind: 'value'; value: T };

export const emptySocketEvent = <T>(): SocketEvent<T> => ({ kind: 'empty' });

export const socketEvent = <T>(value: T): SocketEvent<T> => ({
  kind: 'value',
  value,
});

export const isSocketEventValue = <T>(
  event: SocketEvent<T>
): event is { kind: 'value'; value: T } => event.kind === 'value';
