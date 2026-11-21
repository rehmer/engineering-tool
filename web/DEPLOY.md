# Putting the site online

The site is plain static files in `web/`. All calculation runs in the visitor's browser and saved projects stay in their browser, so there is no server or database to run.

Hosting: **Cloudflare Pages** (free), connected to the GitHub repository so every push to `main` redeploys. The domain stays registered at GoDaddy.

## 1. Cloudflare Pages (about 10 minutes)

1. Sign up at dash.cloudflare.com (free plan).
2. **Workers & Pages → Create → Pages → Connect to Git.** Authorize GitHub and choose this repository.
3. Settings: **Production branch** `main`, **Build command** empty, **Build output directory** `web`. Save and deploy.
4. Open the `*.pages.dev` address it gives you and check the tools load.

## 2. Point www.engineeringclarity.com at it

1. In the Pages project: **Custom domains → Set up a custom domain** → `www.engineeringclarity.com`. Cloudflare shows a CNAME target (your `*.pages.dev` address).
2. In GoDaddy: **My Products → engineeringclarity.com → DNS → Manage DNS**. Edit the existing **CNAME** record named `www` (it usually points to `@`) so its value is the `*.pages.dev` address. Save.
3. Back in Cloudflare, wait for the domain to show **Active** (minutes to an hour). HTTPS is issued automatically.
4. For the bare domain: GoDaddy **Domain settings → Forwarding → Add forwarding**, forward `engineeringclarity.com` to `https://www.engineeringclarity.com`, type **Permanent (301)**.

## 3. Connect the feedback form

1. Create a free account at formspree.io and add a new form. Formspree emails each submission to the account's address.
2. Copy the form endpoint (`https://formspree.io/f/xxxxxxx`) into `FEEDBACK_ENDPOINT` in `web/app/config.js`, commit and push.
3. Send a test from the site's **Feedback** button and confirm the email arrives.

Until the endpoint is set, the Feedback button copies the report to the visitor's clipboard instead of sending it.

## Notes

- `web/_headers` sets security headers, including a Content-Security-Policy that allows posts only to this site and formspree.io.
- `tests/` and `tools/` are deployed too. They are harmless (test files and Excel reference numbers, no secrets).
- To restrict the site to invited people later, add Cloudflare Access to the Pages project (Settings → General → Access policy) with an email allow list.
