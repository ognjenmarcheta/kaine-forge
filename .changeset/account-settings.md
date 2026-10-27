---
"@repo/auth": minor
"@repo/db": major
"@repo/api": minor
"@repo/web": minor
"@repo/ui": minor
"@repo/translation": minor
---

A signed-in user now manages their own account on the web app's new `/account` page, opened from the sidebar user menu: avatar and display name, email address, password, signed-in sessions, linked sign-in methods, and account deletion. The avatar uploader moves there from `/security`, which keeps two-step verification only.

`@repo/auth` turns on better-auth `user.changeEmail` (`updateEmailWithoutVerification: false`, so the email changes only after the new address is verified; a verified user's old address approves the change first) and `user.deleteUser` with an emailed confirmation link to `<WEB_APP_URL>/account/delete?token=…`. Deletion is refused with `SOLE_OWNER_OF_SHARED_ORGANIZATION` or `PERSONAL_ORGANIZATION_HAS_MEMBERS`, and the error body carries `organizationName`. Before the user row goes, `organizations.user_id` of every Organization with another member moves to another owner, so only the Organizations the user was alone in are deleted. New `GET /account/social-providers` lists the providers the server configured. `AuthTransport` gains `updateProfile`, `changePassword`, `changeEmail`, `listSessions`, `revokeSession`, `revokeOtherSessions`, `listAccounts`, `listSocialProviders`, `linkSocialAccount`, `unlinkAccount`, `requestAccountDeletion` and `confirmAccountDeletion`; `AuthRequestError` gains `organizationName`.

`@repo/db` breaking change: migration `0015` makes `files.uploaded_by` nullable with `ON DELETE SET NULL`, so `File.uploadedBy` is `string | null` and an Attachment stays with its Organization after its uploader deletes their account. The migration also adds a `public_asset_purges` queue that a trigger fills with the avatar URL of every deleted user. The API storage sweep deletes those avatars from the public bucket, best effort, and drops URLs outside it.

`@repo/ui`: `NavUser` takes an optional `accountItem` menu entry above log out.
