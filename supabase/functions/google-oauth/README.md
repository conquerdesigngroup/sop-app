# google-oauth

Exchanges and refreshes Google OAuth tokens for the **staff** Google Calendar
feature, so the client secret stays on the server.

Deploy to project `sgppeenmvskwztaszkgn` with `verify_jwt: true`.

## Why it exists

`src/services/googleCalendar.ts` used to POST to Google's token endpoint from
the browser, passing `process.env.REACT_APP_GOOGLE_CLIENT_SECRET`. Every
`REACT_APP_*` var is compiled into the CRA bundle — the same rule that put the
`admin-users` function here — so the studio's OAuth **client secret was served
in plain text** to anyone who opened didc.app and read the JavaScript. It was
confirmed present in three chunks of the live production build on 2026-08-21.

That lets a stranger run OAuth flows as this app: a Google consent screen
carrying the studio's name, and the project's API quota. It does not by itself
give anyone access to studio data.

## Secrets

| name | value |
|---|---|
| `GOOGLE_CLIENT_ID` | the OAuth client ID (public; also in the bundle, correctly) |
| `GOOGLE_CLIENT_SECRET` | the **new** secret, after rotating |

## Deploying it is not the whole fix

The exposed secret stays exposed — it is in builds people already have.

1. Google Cloud Console → APIs & Services → Credentials → the OAuth client →
   **add a new secret, then delete the old one**.
2. Set `GOOGLE_CLIENT_SECRET` on this function to the new value.
3. Delete `REACT_APP_GOOGLE_CLIENT_SECRET` from the Vercel project, so no future
   build can put it back in the bundle.
4. Redeploy the site and confirm the string is gone:

   ```bash
   curl -sL https://didc.app/ | grep -o '/static/js/[a-z0-9.]*\.js'
   # then grep each chunk for GOCSPX
   ```

Steps 1 and 3 are Google Cloud and Vercel console work — they cannot be done
from this repo.

## What it does not fix

The tokens still come back to the browser and live in `localStorage`, which is
what the existing staff feature is built on. That is a user's own token on their
own device — a smaller problem of a different kind, and moving it server-side
would mean rewriting that feature rather than closing the hole.

The **parent portal sync uses none of this.** It authenticates as a service
account in `portal-calendar-sync`, with no user tokens at all.

## Shape

```
POST { action: 'exchange', code, redirectUri }  -> { access_token, refresh_token, expires_in }
POST { action: 'refresh',  refreshToken }       -> { access_token, expires_in }  (no new refresh token)
```

Both require a signed-in employee; the function verifies the caller's session
before it will talk to Google.
