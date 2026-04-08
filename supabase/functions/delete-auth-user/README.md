# delete-auth-user

Deletes the authenticated user via `auth.admin.deleteUser` after validating their JWT. Use this because Supabase hosted often returns **405** for `DELETE /auth/v1/user` with a user access token.

Deploy (from repo root, linked project):

```bash
supabase functions deploy delete-auth-user
```

The handler validates the JWT with `getUser(jwt)` then calls `auth.admin.deleteUser` for that id only.

If the app shows **`Invalid JWT` (401)** when invoking the function, redeploy with JWT verification disabled so only your handler validates the token:

```bash
npx supabase functions deploy delete-auth-user --no-verify-jwt
```
