import type { BetterAuthPlugin, User } from "better-auth";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

// users.onboarding_completed_at, declared in the instance's
// user.additionalFields with input: false so only this route sets it.
function readCompletedAt(user: User): unknown {
  return "onboardingCompletedAt" in user ? user.onboardingCompletedAt : null;
}

// The web first-run onboarding ends here when the user finishes or skips it.
// It acts on the session user only and keeps the first completion time.
export const onboardingPlugin = {
  id: "onboarding",
  endpoints: {
    completeOnboarding: createAuthEndpoint(
      "/onboarding/complete",
      { method: "POST", use: [sessionMiddleware] },
      async (ctx) => {
        const { session, user } = ctx.context.session;

        if (readCompletedAt(user) instanceof Date) {
          return ctx.json({ completed: true });
        }

        const updated = await ctx.context.internalAdapter.updateUser(user.id, {
          onboardingCompletedAt: new Date()
        });
        // Rewrites the cached session cookie, which still holds the old user.
        await setSessionCookie(ctx, { session, user: updated });

        return ctx.json({ completed: true });
      }
    )
  }
} satisfies BetterAuthPlugin;
