# Production setup

Production provisioning is intentionally human-controlled. Do not place real
credentials in this repository.

Before a private-beta deployment:

1. Create separate Supabase development and production projects.
2. Create the Vercel project with `apps/web` as the application root.
3. Co-locate Vercel Functions and Supabase PostgreSQL regions.
4. Apply migrations from an empty database and run the SQL regression suite.
5. Configure the Supabase site URL and exact invite, callback, and recovery
   redirect URLs.
6. Activate the installed Before User Created PostgreSQL hook.
7. Disable public and anonymous signup, unused Auth providers, and Realtime.
8. Configure production SMTP, Auth rate limits, and CAPTCHA.
9. Create private import and immutable catalog-artifact Storage buckets with
   MIME, size, retention, and signed-URL policies.
10. Store server/worker secrets in Vercel, Supabase, and GitHub environment
    secret stores. Never use a `NEXT_PUBLIC_` prefix for privileged values.
11. Configure WAF limits for login/recovery, admin invitation, catalog sync, and
    `/api/v1/device` routes.
12. Enable Vercel Spend Management and Supabase cost controls.
13. Bootstrap the first platform administrator through the trusted CLI.
14. Keep catalog sync disabled until a fixture import and first live manual
    import have been reviewed.
15. Verify backups and complete a restore rehearsal before admitting real users.

The complete environment matrix, incident controls, backup procedure, and
deployment acceptance evidence are maintained with Phase 6 delivery.
