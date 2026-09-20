export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  timezone: string;
  colorHex: string | null;
  createdAt: string;
  /** A display PIN is set; guest mode asks for it before exiting. */
  hasPin: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
  email?: string;
  role?: 'ADMIN' | 'MEMBER' | 'VIEWER';
}
