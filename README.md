# WatchMatch prototype

A tiny Vercel web app that compares two public Letterboxd watchlists by username/URL and displays the overlap.

## Deploy without a command line

1. Create a new GitHub repository (for example `watchmatch`).
2. Upload **all files and the `api` folder** from this project to the repository root.
3. In Vercel, choose **Add New → Project**, import the GitHub repository, and click **Deploy**.
4. Open the generated `.vercel.app` URL and test the prefilled pair `juliastephenson` + `coliebb`.

No environment variables are required for this prototype.

## Important limitation

Letterboxd may block automated requests from Vercel/other datacenter IPs. The API is intentionally written to surface a readable error if that happens. Letterboxd can also change page markup, which would require updating the parser.

## Files

- `index.html` — page UI
- `styles.css` — styling
- `script.js` — browser behavior
- `api/match.js` — Vercel serverless function that fetches/paginates two public watchlists and intersects film slugs
- `vercel.json` — serves the homepage
