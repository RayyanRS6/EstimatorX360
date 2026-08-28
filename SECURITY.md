# Security Notes

## What is protected in this version

- Secrets and integration endpoints are read from the server-only `.env` file, which is excluded by `.gitignore` and cannot be served by the application.
- Price and form edits require an administrator password and an HTTP-only, SameSite session cookie.
- Each form's GHL webhook is stored in a separate server-only Firestore collection, called only by the server, never returned to the browser, and restricted to approved HTTPS LeadConnector hosts with redirects disabled.
- Estimates are recalculated from server-controlled service data. Client-provided prices, labels, totals, and webhook destinations are not trusted.
- Image uploads require an administrator session, signed Cloudinary credentials, approved MIME types, valid file signatures, and a 5 MB limit.
- Service data is read from Firestore, schema-validated, length-limited, and written in an atomic Firestore batch.
- Login, estimate, and general request rate limits reduce brute-force and abuse risk.
- Same-origin checks, restrictive security headers, sanitized rendering, generic API errors, and request size limits are enabled.
- The server exposes only `index.html`, `app.js`, and `styles.css`; `.env`, server code, saved data, and package metadata are not public routes.

## Required one-time account cleanup

Values previously placed in frontend code must be treated as public even after removal. Moving a value does not revoke copies that may already exist.

1. The repository's deny-all `firestore.rules` were deployed on 2026-08-06. Post-deployment verification confirmed unauthenticated reads return HTTP 403 while authenticated server access remains available. Keep these rules deployed, review earlier Firestore audit/usage logs for unexpected access, and rotate/restrict the previously exposed browser API key.
2. In Cloudinary, disable/delete the previously exposed unsigned upload preset and review uploaded assets and usage for abuse.
3. If a real GHL webhook URL was ever entered in the old UI or committed elsewhere, regenerate it. Clear the old `pg_webhook_url` and `pg_services` browser local-storage entries on administrator devices.
4. Configure new per-form GHL webhook URLs only through the authenticated GHL Webhook screen (or keep one optional legacy fallback in `.env`). Keep Cloudinary server credentials in `.env`. Do not put Firebase client configuration back into `app.js`.

The original Firebase client configuration and Cloudinary cloud name/upload preset are retained only in the ignored local `.env` file at the owner's request. Only `FIREBASE_PROJECT_ID` is needed by the server; Firebase database access requires a service account or Application Default Credentials. The old unsigned Cloudinary preset must remain disabled; secure image upload requires `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`.

## Production checklist

- Use Node.js 20 or newer and run `npm audit --omit=dev` during every deployment.
- Set `NODE_ENV=production` and terminate TLS/HTTPS at a trusted proxy or hosting platform.
- Set `FRAME_ANCESTORS` to `self` plus your trusted parent-page origins (supports wildcard subdomains such as `https://*.bridgelandbuilders.com` and localhost ports) for `/embed`. The main dashboard is always restricted to same-origin framing.
- Back up Firestore and restrict service-account IAM permissions to the required project/database.
- Monitor failed logins, rate-limit responses, webhook failures, and Cloudinary usage.

## Remaining design limitation

The current interface uses inline event handlers, so its Content Security Policy permits inline script attributes. Dynamic values are escaped and server data identifiers are allow-listed, but replacing inline handlers with delegated JavaScript events would allow an even stricter CSP. No security review can guarantee that an application is impossible to hack; account rotation, HTTPS, access logs, updates, and ongoing monitoring remain necessary.
