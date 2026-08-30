import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface UserAuthSession {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

export class UserAuthService {
  constructor(private readonly client: SupabaseClient) {}

  async signIn(email: string, password: string): Promise<UserAuthSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) throw new Error('Invalid email or password.');
    return this.session(data.user, data.session);
  }

  async signUp(email: string, password: string, metadata: Record<string, string>): Promise<{ confirmationRequired: boolean; session?: UserAuthSession }> {
    const { data, error } = await this.client.auth.signUp({ email, password, options: { data: metadata } });
    if (error || !data.user) throw new Error(error?.message ?? 'Could not create account.');
    return data.session
      ? { confirmationRequired: false, session: this.session(data.user, data.session) }
      : { confirmationRequired: true };
  }

  async refresh(refreshToken: string): Promise<UserAuthSession> {
    const { data, error } = await this.client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session || !data.user) throw new Error('Authentication session expired.');
    return this.session(data.user, data.session);
  }

  async getUser(accessToken: string): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null };
  }

  private session(user: { id: string; email?: string }, session: { access_token: string; refresh_token: string; expires_at?: number }): UserAuthSession {
    return {
      user: { id: user.id, email: user.email ?? null },
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? null,
    };
  }
}
