# Fantasy Huddle

Add a Sleeper NFL league by ID or league link, then pick a week. League IDs are saved in this browser. A report URL includes the league and week for sharing.

## Scoring

The [Sleeper matchup API](https://docs.sleeper.com/#getting-matchups-in-a-league) supplies league-scored player points and team totals. The app uses Sleeper's weekly values for passing touchdowns, first downs, PPR, and other scoring rules. Standings honor commissioner overrides. The public matchup API provides fantasy points. Raw stat lines and projections are outside this report.

Optimal points are estimated from the weekly matchup roster and eligible lineup slots, allowing zero-point empty slots. Historical lineup rules, injured reserve and taxi eligibility can differ from what the matchup and player-directory endpoints provide. Efficiency uses the unadjusted starter total. Missing scores or positions make the estimate unavailable. Best ball leagues show rostered players without a starter and bench split.

## GitHub Pages

Put these files at the root of a GitHub repository. In **Settings → Pages**, select **Deploy from a branch → main → / (root)**, the same Pages configuration as Poker Nights. Assets use paths relative to the project site. The browser reads Sleeper directly without a backend or API key.

For local use, run `python3 -m http.server 8000` in this folder and open `http://localhost:8000`.

On iOS, use Safari’s **Share → Add to Home Screen**. On supported Chromium browsers, use **Install**. The cached app and demo can open offline after the first visit. Live reports require an internet connection. When releasing updates, bump the shell cache version in `sw.js`.
