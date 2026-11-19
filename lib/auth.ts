import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedDomains = (process.env.ALLOWED_DOMAINS ?? "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn } = NextAuth({
  trustHost: true,
  providers: [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase() ?? "";
      return profile?.email_verified === true && (allowedDomains.length === 0 || allowedDomains.some((domain) => email.endsWith(`@${domain}`)));
    },
  },
});

export function boardName(email: string | null | undefined): string | null {
  return email ? email.split("@")[0].replace(/[^a-zA-Z0-9-]/g, "-") : null;
}
