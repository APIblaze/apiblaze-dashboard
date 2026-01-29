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
        // NextAuth sets token.sub from user.id (our profile() returns id: profile.id.toString())
        if (token.sub) {
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

