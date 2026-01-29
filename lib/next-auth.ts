import { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

// Extend the Session interface
declare module "next-auth" {
  interface Session {
    user: {
      id?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      githubHandle?: string | null;
    };
    accessToken?: string;
  }

  interface User {
    id?: string;
    githubHandle?: string | null;
  }
}

// Extend the JWT interface
declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    accessToken?: string;
    githubHandle?: string | null;
    apiblazeUserId?: string | null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: { scope: "read:user user:email repo" },
      },
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
          login: profile.login,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (user) {
        const u = user as { login?: string };
        if (u.login) token.githubHandle = u.login;
      }
      // Resolve apiblaze user id once so list projects uses team_${apiblazeUserId}
      if (!token.apiblazeUserId && token.sub) {
        const base = process.env.APIBLAZE_ADMIN_API_BASE || 'https://internalapi.apiblaze.com';
        const apiKey = process.env.INTERNAL_API_KEY || process.env.APIBLAZE_ADMIN_API_KEY;
        if (apiKey) {
          try {
            const res = await fetch(`${base}/ensure-apiblaze-user`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
              body: JSON.stringify({
                provider: 'github',
                provider_sub: token.sub,
                email: (token as { email?: string }).email,
                display_name: (token as { name?: string }).name,
              }),
            });
            if (res.ok) {
              const data = (await res.json()) as { apiblazeUserId: string };
              token.apiblazeUserId = data.apiblazeUserId;
            }
          } catch {
            // keep token.apiblazeUserId unset; session will fall back to github:sub
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.accessToken === 'string') {
        session.accessToken = token.accessToken;
      }
      if (session.user) {
        if (typeof token.githubHandle === 'string') {
          session.user.githubHandle = token.githubHandle;
        }
        // Use apiblaze user id so team_id and project list match admin-api (user:${apiblazeUserId}:projects)
        if (token.apiblazeUserId) {
          session.user.id = token.apiblazeUserId;
        } else if (token.sub) {
          session.user.id = `github:${token.sub}`;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
  },
};

