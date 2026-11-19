# Fantasy Huddle

Add a Sleeper NFL league by ID or league link, then pick a completed week. During the current season, the most recent available week is the week before Sleeper?s current NFL week; it becomes available after Sleeper advances the week. Guest league IDs are saved for the current browser tab session and are cleared when the tab closes. Google sign-in saves a separate league list to your account across devices; signing out restores the guest list. A report URL includes the league and week for sharing.

## Scoring

The [Sleeper matchup API](https://docs.sleeper.com/#getting-matchups-in-a-league) supplies league-scored player points and team totals. The app uses Sleeper's weekly values for passing touchdowns, first downs, PPR, and other scoring rules. Standings honor commissioner overrides. The public matchup API provides fantasy points. Raw stat lines and projections are outside this report.

Optimal points are estimated from the weekly matchup roster and eligible lineup slots, allowing zero-point empty slots. Historical lineup rules, injured reserve and taxi eligibility can differ from what the matchup and player-directory endpoints provide. Efficiency uses the unadjusted starter total. Missing scores or positions make the estimate unavailable. Best ball leagues show rostered players without a starter and bench split.

## GitHub Pages

Put these files at the root of a GitHub repository. In **Settings → Pages**, select **Deploy from a branch → main → / (root)**, the same Pages configuration as Poker Nights. Assets use paths relative to the project site. The browser reads Sleeper directly. Optional account sync uses the separate Fantasy Huddle API at https://fantasyhuddle.duckdns.org; guest reports need no account or API key.

For local use, run `python3 -m http.server 8000` in this folder and open `http://localhost:8000`.

On iOS, use Safari’s **Share → Add to Home Screen**. On supported Chromium browsers, use **Install**. The cached app shell can open offline after the first visit. Live reports require an internet connection. When releasing updates, bump the shell cache version in `sw.js`.

## Account service

The isolated Node.js account API is in `backend/` and runs on the VPS as `fantasyhuddle.service`, bound to `127.0.0.1:5011` behind its own Nginx virtual host. It uses a separate `fantasyhuddle` PostgreSQL database and role. Configuration is kept in `/etc/fantasyhuddle/api.env`. Google sign-in uses a server-generated, single-use nonce and verified ID tokens; account sessions expire after 12 hours. Guest leagues remain in the current tab session and are not automatically imported into an account. Account leagues persist until removed.
