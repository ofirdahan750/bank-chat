
type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface User {
  id: string;
  username: string;
  isBot: boolean;
  color: string;
}
