# Troubleshooting

Common deployment problems and what to check. For the full setup, see
[deployment.md](deployment.md).

| Symptom | Check |
| --- | --- |
| `That account does not have access` | The identity provider succeeded, but the user did not match the Allow policy. Test the exact email and verify the selector. |
| `No Access cookie found. Please login first.` | Open the normal production root URL again. Avoid private browsing modes that block Access cookies, and confirm the hostname is covered by the production Access application. |
| Cloud sync is not active | Confirm `DB`, `RESUME_FILES`, `TEAM_DOMAIN`, and `POLICY_AUD` are all configured in Production, then redeploy. |
| API returns a configuration error | Confirm the AUD came from the exact production application and that `TEAM_DOMAIN` includes `https://` with no callback path. |
| D1 reports a missing table | Re-run `npx wrangler d1 migrations apply job-application-tracker --remote` against the correct account and database. |
| The wildcard cannot be removed | Edit the public hostname destination, leave **Subdomain** completely blank, keep the exact `pages.dev` domain selected, and save. Rename the application if Cloudflare reports a conflict. |
| `Deploy production` is skipped | For Direct Upload projects, add the `CLOUDFLARE_PAGES_PROJECT` repository variable and run CI from `main`. For Git-integrated projects, a skipped job is expected. |
| Cloudflare reports `Project not found` | Set `CLOUDFLARE_PAGES_PROJECT` to the Pages project name, not its `pages.dev` hostname, and confirm the project belongs to `CLOUDFLARE_ACCOUNT_ID`. |
| Cloudflare rejects the deployment token | Recreate `CLOUDFLARE_API_TOKEN` with **Account -> Cloudflare Pages -> Edit**, restrict it to the correct account, and replace the GitHub secret. |
| GitHub shows a successful merge but the live site is old | Check the latest CI run for a successful `Deploy production` job, confirm its commit appears in Cloudflare Deployments, then hard-refresh the production page. |
