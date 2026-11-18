const entries = [
  ['4881','Josh Allen','QB','BUF',32.6],
  ['6794','Justin Jefferson','WR','MIN',29.4],
  ['2449','Saquon Barkley','RB','PHI',34.5],
  ['3321','Travis Kelce','TE','KC',21.3],
  ['8183','Ja’Marr Chase','WR','CIN',26.5],
  ['4984','Lamar Jackson','QB','BAL',27.1],
  ['4034','Christian McCaffrey','RB','SF',26.2],
  ['6797','CeeDee Lamb','WR','DAL',23.8],
  ['9226','Trey McBride','TE','ARI',19.7],
  ['5849','DK Metcalf','WR','PIT',15.1],
  ['7523','Jalen Hurts','QB','PHI',29.4],
  ['9221','Bijan Robinson','RB','ATL',25.3],
  ['7564','Amon-Ra St. Brown','WR','DET',22.7],
  ['8130','Brock Bowers','TE','LV',17.4],
  ['8112','Drake London','WR','ATL',23.8],
  ['6770','Joe Burrow','QB','CIN',22.8],
  ['2133','Derrick Henry','RB','BAL',18.6],
  ['8126','Garrett Wilson','WR','NYJ',16.9],
  ['9509','Sam LaPorta','TE','DET',12.5],
  ['9758','Puka Nacua','WR','LAR',20.4]
]

export function demoData(week) {
  const names = ['Sunday Standard','Fourth & Gold','The Red Zone','Gridiron Club']
  const directory = Object.fromEntries(entries.map(([id, full_name, position, team]) => [id, { full_name, position, team }]))
  const league = {
    league_id: 'demo', name: 'Demo league', season: '2025', sport: 'nfl',
    roster_positions: ['QB','RB','WR','TE','FLEX','BN'],
    scoring_settings: { pass_td: 6, pass_yd: 0.04, rush_yd: 0.1, rush_fd: 0.5, rec: 1, rec_yd: 0.1, rec_td: 6 }
  }
  const users = names.map((name, index) => ({ user_id: String(index), display_name: ['Alex','Jordan','Sam','Morgan'][index], metadata: { team_name: name } }))
  const rosters = names.map((_, index) => ({ roster_id: index + 1, owner_id: String(index) }))
  const groups = rosters.map((roster, index) => {
    const group = entries.slice(index * 5, index * 5 + 5)
    const bench = [ ['4035','Alvin Kamara','RB','NO',8.1], ['3164','Tyreek Hill','WR','MIA',22.8], ['4046','George Kittle','TE','SF',20.1], ['10229','Jahmyr Gibbs','RB','DET',27.1] ][index]
    const [id,full_name,position,team] = bench
    directory[id] = { full_name, position, team }
    const starters = group.map(player => player[0])
    const players_points = Object.fromEntries([...group, bench].map(([playerId,,,,score], i) => [playerId, Math.round((score + ((week - 10) * (i + index + 1) % 7)) * 100) / 100]))
    const points = starters.reduce((total, playerId) => total + players_points[playerId], 0)
    return { roster_id: roster.roster_id, matchup_id: index % 2 + 1, starters, players: [...starters,id], players_points, points: Math.round(points * 100) / 100 }
  })
  return { league, users, rosters, matchups: groups, directory }
}
