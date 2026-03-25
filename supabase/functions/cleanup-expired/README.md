# cleanup-expired function

This edge function deletes expired `posts` and `messages`, then removes related
storage objects in `post-media` and `photos`.

## Deploy

```bash
supabase functions deploy cleanup-expired
```

## Invoke manually

```bash
curl -X POST \
  "https://<project-ref>.functions.supabase.co/cleanup-expired" \
  -H "Authorization: Bearer <service-role-or-scheduled-secret>" \
  -H "Content-Type: application/json"
```

## Suggested schedule

- Run every 15 minutes using Supabase Scheduled Functions or your cron runner.
- Keep `SUPABASE_SERVICE_ROLE_KEY` configured for this function.
