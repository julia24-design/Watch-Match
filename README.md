# WatchMatch

Compare two public Letterboxd profiles and find:

- films on both watchlists
- films both people have watched
- films both people have liked

The frontend is a static HTML/CSS/JavaScript page. A Vercel serverless function reads the public Letterboxd pages on demand, calculates the overlap, and lazy-loads poster art.

Watchlist and Watched comparisons show the matches confirmed from the public profile pages Letterboxd permits. For complete lists, both people can optionally upload the `watchlist.csv` or `watched.csv` files from their official Letterboxd data exports. Those files are parsed and saved only in the browser; they are never uploaded to the app or Vercel.

## Deploy

Upload these files to the root of the existing GitHub repository. Vercel will redeploy automatically from the connected branch.

No environment variables or API keys are required.

## Notes

Only public Letterboxd data can be compared. Private or unavailable sections show a friendly error message. This is an unofficial personal project and is not affiliated with Letterboxd.

Version 2.6.1 loads complete paginated watchlists when Letterboxd permits it, preserves confirmed partial matches if a later page is blocked, and keeps CSV as the reliable fallback. Watched histories continue to use the safer first-page-plus-CSV workflow.
