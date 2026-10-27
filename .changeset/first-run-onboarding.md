---
"@repo/auth": major
"@repo/db": minor
"@repo/web": minor
"@repo/translation": minor
---

After sign-up, the web app (and the desktop app, which loads the same bundle) shows a first-run onboarding once at `/onboarding`: name the Personal Organization or create a new Organization with that name, then invite teammates with the Members page invite form. Every step can be skipped; skip and finish both end onboarding and open `/dashboard`, and a user who finished it is sent from `/onboarding` to `/dashboard`. A user who signs up from an Invitation link reaches the Invitation page first; after accepting, onboarding offers only the steps that still apply, and ends at once for a member. Mobile sign-ups are not redirected.

`@repo/auth`: new `POST /onboarding/complete` marks onboarding complete for the session user and refreshes the cached session cookie. `user.additionalFields.onboardingCompletedAt` (`input: false`) puts the completion time on the session, and `/update-user` refuses it. `AuthSessionUser` gains an optional `onboardingCompleted` that the client transport sets, and `AuthTransport` gains `completeOnboarding()`. Breaking: `/organization/create` and `/organization/update` refuse a name over 64 characters (`AUTH_DEFINITIONS.ORGANIZATION_NAME_MAX_LENGTH`) with `ORGANIZATION_NAME_TOO_LONG`, because Organization names appear in invitation emails.

`@repo/db`: migration `0018` adds the nullable `users.onboarding_completed_at` column and backfills it for every existing user, so existing accounts never see onboarding. The seed user is created with it set.
