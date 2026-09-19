# WatchMatch

Compare two public Letterboxd profiles and find:

- films on both watchlists
- films both people have watched
- films both people have liked

The frontend is a static HTML/CSS/JavaScript page. A Vercel serverless function reads the public Letterboxd pages on demand, calculates the overlap, and lazy-loads poster art.

## Deploy

Upload these files to the root of the existing GitHub repository. Vercel will redeploy automatically from the connected branch.

No environment variables or API keys are required.

## Notes

Only public Letterboxd data can be compared. Private or unavailable sections show a friendly error message. This is an unofficial personal project and is not affiliated with Letterboxd.

Version 2.1 fetches paginated histories sequentially with a short delay, reuses one Letterboxd session, and caches completed lists to reduce rate limiting.
