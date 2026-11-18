const flexPositions = {
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['WR', 'RB'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'DE', 'DT', 'LB', 'DB', 'CB', 'S']
}

const positionGroups = { DL: ['DE', 'DT'], DB: ['CB', 'S'] }
const reserves = new Set(['BN', 'IR', 'TAXI'])
const valid = id => id && id !== '0'
export const numeric = value => typeof value === 'number' && Number.isFinite(value)

export function parseLeagueId(input) {
  const value = input.trim()
  if (/^\d{8,24}$/.test(value)) return value
  try {
    const url = new URL(value)
    if (!['sleeper.app', 'sleeper.com', 'www.sleeper.app', 'www.sleeper.com'].includes(url.hostname)) return null
    return url.pathname.match(/(?:^|\/)leagues?\/(\d{8,24})(?:\/|$)/)?.[1] ?? null
  } catch {
    return null
  }
}

export function bestLineup(players, rosterPositions) {
  const slots = rosterPositions.filter(slot => !reserves.has(slot))
  if (!slots.length || players.some(player => !numeric(player.points) || !player.positions.length)) return null
  const assigned = Array(slots.length).fill(null)
  const eligible = (player, slot) => {
    const allowed = flexPositions[slot] ?? [slot, ...(positionGroups[slot] ?? [])]
    return player.positions.some(position => allowed.includes(position))
  }
  if (slots.some(slot => !Object.hasOwn(flexPositions, slot) &&
      !['QB','RB','FB','WR','TE','K','DEF','DL','DE','DT','LB','DB','CB','S','P'].includes(slot))) return null

  // Move an already selected player to another eligible slot when possible.
  function assign(player, visited) {
    for (const [index, slot] of slots.entries()) {
      if (visited.has(index) || !eligible(player, slot)) continue
      visited.add(index)
      if (!assigned[index] || assign(assigned[index], visited)) {
        assigned[index] = player
        return true
      }
    }
    return false
  }

  for (const player of [...players].sort((a, b) => b.points - a.points)) {
    if (player.points >= 0) assign(player, new Set())
  }
  return Math.round(assigned.reduce((sum, player) => sum + (player?.points ?? 0), 0) * 100) / 100
}

export function buildReport({ league, users, rosters, matchups, directory }) {
  const usersById = new Map(users.map(user => [user.user_id, user]))
  const rostersById = new Map(rosters.map(roster => [roster.roster_id, roster]))
  const bestBall = Boolean(league.settings?.best_ball)
  const teams = matchups.map(row => {
    const roster = rostersById.get(row.roster_id)
    const user = usersById.get(roster?.owner_id)
    const name = user?.metadata?.team_name || user?.display_name || user?.username || `Team ${row.roster_id}`
    const starters = (row.starters ?? []).map(String)
    const ids = new Set([...(row.players ?? []).map(String), ...starters].filter(valid))
    const players = [...ids].map(id => {
      const meta = directory[id]
      const starterIndex = starters.indexOf(id)
      const starterPoints = starterIndex >= 0 ? row.starters_points?.[starterIndex] : null
      const points = row.players_points?.[id]
      const position = meta?.position || (/^[A-Z]{2,3}$/.test(id) ? 'DEF' : null)
      return {
        id, name: meta?.full_name || (meta?.first_name ? `${meta.first_name} ${meta.last_name ?? ''}`.trim() : (position === 'DEF' ? `${id} Defense` : `Player ${id}`)),
        position, positions: meta?.fantasy_positions?.length ? meta.fantasy_positions : position ? [position] : [],
        nflTeam: meta?.team || '', team: name, starter: starterIndex >= 0,
        points: numeric(points) ? points : numeric(starterPoints) ? starterPoints : null
      }
    })
    const points = numeric(row.custom_points) ? row.custom_points : numeric(row.points) ? row.points : null
    const max = players.length ? bestLineup(players, league.roster_positions ?? []) : null
    const starterScores = players.filter(player => player.starter).map(player => player.points)
    const starterTotal = starterScores.reduce((sum, score) => sum + score, 0)
    const efficiency = !bestBall && starterScores.length && starterScores.every(numeric) &&
      max > 0 && starterTotal >= 0 && starterTotal <= max + 0.01 ? Math.min(1, starterTotal / max) : null
    return { id: row.roster_id, name, owner: user?.display_name || user?.username || '', avatar: user?.avatar, matchup: row.matchup_id, points, max, efficiency, players }
  }).filter(team => numeric(team.points)).sort((a, b) => b.points - a.points || a.id - b.id)

  const players = teams.flatMap(team => team.players).filter(player => numeric(player.points)).sort((a,b) => b.points - a.points || a.name.localeCompare(b.name))
  const games = new Map()
  for (const team of teams) {
    if (team.matchup == null || team.matchup <= 0) continue
    if (!games.has(team.matchup)) games.set(team.matchup, [])
    games.get(team.matchup).push(team)
  }
  const results = [...games.values()].filter(game => game.length === 2 && game[0].points > game[1].points)
    .map(([winner, loser]) => ({ winner, loser, margin: winner.points - loser.points }))
  const biggest = [...results].sort((a,b) => b.margin - a.margin)[0]
  const closest = [...results].sort((a,b) => a.margin - b.margin)[0]
  const toughLoss = [...results].sort((a,b) => b.loser.points - a.loser.points)[0]
  const lowestWin = [...results].sort((a,b) => a.winner.points - b.winner.points)[0]
  const managers = teams.filter(team => team.efficiency != null).sort((a,b) => b.efficiency - a.efficiency)
  return { teams, players, bestBall, biggest, closest, toughLoss, lowestWin, managers }
}
