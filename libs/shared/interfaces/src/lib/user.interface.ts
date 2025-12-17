export interface User {
  id: string; // מזהה ייחודי (Socket ID)
  username: string; // הכינוי שהמשתמש בחר
  isBot?: boolean; // דגל לזיהוי הבוט שלנו
  color?: string; // בונוס: צבע ייחודי ליוזר ב-UI
}
