export interface User {
  id: string; // Socket connection ID
  username: string; // Display name
  isBot?: boolean; // Identifies the automated bot
  color?: string; // Avatar background color
}
