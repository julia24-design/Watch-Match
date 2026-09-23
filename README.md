````markdown
# WatchMatch

WatchMatch is a lightweight web app that helps two Letterboxd users find movies they both want to watch.

Instead of manually comparing watchlists, users can enter two Letterboxd usernames and see where their movie preferences overlap across watchlists, watched films, and liked films.

**Live app:** https://watch-match-seven.vercel.app/

## Features

- Compare two Letterboxd users' watchlists
- Identify movies both users have already watched
- Find films both users have liked
- Browse shared matches with movie posters
- Use **Surprise Me** to randomly select a movie from matched results
- Support larger watchlists through CSV uploads when public profile data is incomplete
- Handle pagination, duplicate results, and partial profile data

## Why I Built It

I use Letterboxd to keep track of movies I want to watch, but choosing a movie with someone else usually means searching through two separate watchlists.

I built WatchMatch to make that process easier: enter two profiles, see the overlap, and pick something you both already want to watch.

The project was also an opportunity to build and deploy a web application end-to-end and work through the limitations of retrieving data from public Letterboxd profiles.

## How It Works

WatchMatch retrieves publicly available Letterboxd profile data and compares the resulting movie lists between two users.

Because Letterboxd profile pages can behave differently depending on list size, pagination, and request limits, the app includes fallback logic for incomplete results. Users can also upload Letterboxd CSV exports for more complete matching when needed.

Uploaded CSV files are processed in the browser and are not stored by the application.

## Tech Stack

- JavaScript
- HTML / CSS
- Node.js
- Vercel serverless functions
- Vercel for deployment

## Running Locally

Clone the repository:

```bash
git clone https://github.com/julia24-design/Watch-Match.git
cd Watch-Match
````

Install dependencies:

```bash
npm install
```

Run the project locally:

```bas
```

