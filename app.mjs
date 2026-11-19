import { buildReport, parseLeagueId } from './scoring.mjs'
import { completedWeek } from './weeks.mjs'
import { initAccount } from './account.mjs'

const $ = id => document.getElementById(id)
const api = 'https://api.sleeper.app/v1'
const savedKey = 'fantasy-huddle.leagues'
const directoryKey = 'https://fantasy-huddle.local/player-directory'
const format = value => value == null ? '—' : value.toFixed(2)
const percent = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`
const scoreOrder = ['QB','RB','WR','TE','K','DEF','DL','DE','DT','LB','DB','CB','S','FB','P']
const scoringLabels = { pass_td: 'Passing TD', pass_yd: 'Passing yard', pass_fd: 'Passing first down', rush_td: 'Rushing TD', rush_fd: 'Rushing first down', rush_yd: 'Rushing yard', rec: 'Reception', rec_yd: 'Receiving yard', rec_td: 'Receiving TD', rec_fd: 'Receiving first down' }
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character])
let leagues = []
try {
  const stored = JSON.parse(sessionStorage.getItem(savedKey))
  if (Array.isArray(stored)) leagues = stored.filter(league => typeof league?.name === 'string' && /^\d{8,24}$/.test(league.league_id))
} catch {}
const params = new URLSearchParams(location.search)
let active = parseLeagueId(params.get('league') ?? '') || leagues[0]?.league_id || ''
let week = Number(params.get('week')) || null
if (!Number.isInteger(week) || week < 1 || week > 18) week = null
let pending
let directoryRequest
let installPrompt
const metadata = new Map()

async function request(path, signal) {
  const response = await fetch(`${api}/${path}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(response.status === 404 ? 'Sleeper could not find this league or week.' : `Sleeper returned an error (${response.status}). Try again shortly.`)
  return response.json()
}

async function getDirectory() {
  const cache = await globalThis.caches?.open('fantasy-huddle-player-data').catch(() => null)
  const cached = await cache?.match(directoryKey).catch(() => null)
  if (cached && Date.now() - Number(cached.headers.get('x-saved')) < 86400000) {
    try { return await cached.clone().json() } catch {}
  }
  try {
    const data = await request('players/nfl')
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Player directory unavailable')
    const directory = Object.fromEntries(Object.entries(data).map(([id, player]) => [id, {
      full_name: player.full_name, first_name: player.first_name, last_name: player.last_name,
      position: player.position, fantasy_positions: player.fantasy_positions, team: player.team
    }]))
    await cache?.put(directoryKey, new Response(JSON.stringify(directory), { headers: { 'x-saved': String(Date.now()) } })).catch(() => {})
    return directory
  } catch {
    return cached?.json().catch(() => ({})) ?? {}
  }
}

function saveLeagues() {
  try { sessionStorage.setItem(savedKey, JSON.stringify(leagues)) } catch {}
}

function updateControls() {
  $('league').replaceChildren(new Option('Select a league', ''), ...leagues.map(league => new Option(league.name, league.league_id)))
  if (active && !leagues.some(league => league.league_id === active)) $('league').add(new Option('Shared league', active))
  $('league').value = active
  $('remove').hidden = !leagues.some(league => league.league_id === active)
}

function updateUrl() {
  const url = new URL(location.href)
  if (active) url.searchParams.set('league', active)
  else url.searchParams.delete('league')
  if (week) url.searchParams.set('week', String(week))
  else url.searchParams.delete('week')
  history.replaceState(null, '', url)
}

function setWeekOptions(maximum) {
  const choices = Array.from({ length: maximum }, (_, index) => new Option(`Week ${maximum - index}`, maximum - index))
  $('week').replaceChildren(...choices)
  $('week').value = String(week)
}

function avatar(team) {
  const initials = team.name.split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase()
  return `<span class="avatar" aria-hidden="true">${escape(initials)}${team.avatar ? `<img src="https://sleepercdn.com/avatars/thumbs/${encodeURIComponent(team.avatar)}" alt="">` : ''}</span>`
}

function teamCard(team, label, icon, style) {
  return `<article class="team-card ${style}"><div class="card-label"><span>${label}</span><span aria-hidden="true">${icon}</span></div><div class="team-main">${avatar(team)}<div><h3>${escape(team.name)}</h3>${team.owner ? `<p>${escape(team.owner)}</p>` : ''}</div><strong>${format(team.points)}<small>PTS</small></strong></div></article>`
}

function leaders(players) {
  const positions = [...new Set(players.map(player => player.position).filter(Boolean))]
  positions.sort((a,b) => (scoreOrder.indexOf(a) + 1 || 99) - (scoreOrder.indexOf(b) + 1 || 99))
  return positions.map(position => players.find(player => player.position === position))
}

function playerCard(player) {
  return `<article class="player-card" data-position="${escape(player.position)}">
    <div class="player-top"><span class="position">${escape(player.position)}</span><span>${escape(player.nflTeam)}</span></div>
    <div class="headshot" aria-hidden="true"><span>${escape(player.name.split(' ').map(word => word[0]).slice(0,2).join(''))}</span>${/^\d+$/.test(player.id) ? `<img loading="lazy" src="https://sleepercdn.com/content/nfl/players/${player.id}.jpg" alt="">` : ''}</div>
    <h3>${escape(player.name)}</h3><p>${escape(player.team)}</p><strong>${format(player.points)} <small>PTS</small></strong></article>`
}

function playerSection(title, players, empty, detail = '') {
  return `<section class="report-section"${title.startsWith('Starters') ? ' id="players"' : ''}><div class="section-title"><h2>${title}</h2>${detail ? `<p>${detail}</p>` : ''}</div>
    ${players.length ? `<div class="players">${players.map(playerCard).join('')}</div>` : `<p class="empty">${empty}</p>`}</section>`
}

function award(title, team, result, caption) {
  return `<article class="award"><p>${title}</p><div><strong>${escape(team.name)}</strong><b>${result}</b></div><small>${escape(caption)}</small></article>`
}

function render(data) {
  const { league } = data
  const report = buildReport(data)
  const { teams, players, managers, biggest, closest, toughLoss, lowestWin, bestBall } = report
  $('season').textContent = `${league.season} NFL SEASON / WEEK ${week}`
  $('hero-description').textContent = `${league.name} · League-scored fantasy points`
  document.querySelector('.hero-link').hidden = !teams.length
  if (!teams.length) {
    $('report').innerHTML = '<p class="empty">Sleeper has no matchup scores for this week yet. Choose another week or refresh later.</p>'
    return
  }
  const awards = []
  if (managers.length) awards.push(award('Best lineup efficiency', managers[0], percent(managers[0].efficiency), `${format(managers[0].max)} optimal pts`))
  if (managers.length > 1) awards.push(award('Lowest lineup efficiency', managers.at(-1), percent(managers.at(-1).efficiency), `${format(managers.at(-1).max)} optimal pts`))
  if (toughLoss) awards.push(award('Highest score in a loss', toughLoss.loser, format(toughLoss.loser.points), `vs. ${toughLoss.winner.name} · ${format(toughLoss.winner.points)} pts`))
  if (lowestWin) awards.push(award('Lowest score in a win', lowestWin.winner, format(lowestWin.winner.points), `vs. ${lowestWin.loser.name} · ${format(lowestWin.loser.points)} pts`))
  if (biggest) awards.push(award('Biggest blowout', biggest.winner, `+${format(biggest.margin)}`, `vs. ${biggest.loser.name}`))
  if (closest) awards.push(award('Narrowest victory', closest.winner, `+${format(closest.margin)}`, `vs. ${closest.loser.name}`))
  const scores = Object.entries(league.scoring_settings ?? {}).filter(([,value]) => value !== 0)
  const scoredWithoutPosition = players.filter(player => !player.position).length
  const missingScores = teams.some(team => team.players.some(player => player.points == null))
  $('report').innerHTML = `
    <div class="team-grid">${teamCard(teams[0], 'Highest score', '↗', 'best')}${teams.length > 1 ? teamCard(teams.at(-1), 'Lowest score', '↘', 'worst') : ''}</div>
    ${missingScores || scoredWithoutPosition ? '<p class="data-note">Some player scores or positions are unavailable for this week. Leaderboards reflect the available data.</p>' : ''}
    ${playerSection(bestBall ? 'Players of the week' : 'Starters of the week', leaders(bestBall ? players : players.filter(player => player.starter)), 'No player scores with known positions for this week.', 'Top scorer at each position')}
    ${bestBall ? '' : playerSection('Benchwarmers of the week', leaders(players.filter(player => !player.starter)), 'No bench scores with known positions for this week.', 'Top bench scorer at each position')}
    <section class="report-section"><div class="section-title"><h2>Player leaderboard</h2></div>
    ${players.length ? `<details class="details"><summary>View all ${players.length} scored players</summary><div class="table-wrap"><table><thead><tr><th scope="col">Player</th><th scope="col">Team</th><th scope="col">Lineup</th><th scope="col">Points</th></tr></thead><tbody>${players.map(player => `<tr><td>${escape(player.name)} <small>${escape(player.position)}</small></td><td>${escape(player.team)}</td><td>${bestBall ? 'Rostered' : player.starter ? 'Starter' : 'Bench'}</td><td>${format(player.points)}</td></tr>`).join('')}</tbody></table></div></details>` : '<p class="empty">Sleeper did not return player points for this week.</p>'}</section>
    ${awards.length ? `<section class="report-section" id="awards"><div class="section-title"><h2>League awards</h2></div><div class="award-grid">${awards.join('')}</div></section>` : ''}
    <section class="report-section" id="performance"><div class="section-title"><h2>Team performance</h2><p>Weekly standings</p></div>
    <div class="performance">${teams.map(team => `<article class="performance-row"><span class="rank">${teams.findIndex(other => other.points === team.points) + 1}</span>${avatar(team)}<div class="performance-body"><div><h3>${escape(team.name)}</h3><strong>${format(team.points)} pts</strong></div>${team.efficiency == null ? '' : `<progress value="${team.efficiency}" max="1" aria-label="${escape(team.name)} lineup efficiency"></progress>`}<p>${team.max == null ? 'Optimal lineup unavailable' : `${format(team.max)} optimal pts`}${team.efficiency == null ? '' : ` · ${percent(team.efficiency)} efficiency`}</p></div></article>`).join('')}</div>
    <p class="data-note">Optimal points are estimated from scored players in the weekly matchup roster and eligible lineup slots. Efficiency uses the starter total before commissioner adjustments.</p></section>
    <section class="report-section"><div class="section-title"><h2>League scoring</h2></div><details class="details"><summary>View Sleeper scoring settings</summary>
    <dl>${scores.map(([key, value]) => `<div><dt>${escape(scoringLabels[key] ?? key)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></details></section>`
  $('report').querySelectorAll('img').forEach(image => {
    image.addEventListener('error', () => { image.hidden = true }, { once: true })
    if (image.complete && !image.naturalWidth) image.hidden = true
  })
}

async function load({ refresh = false } = {}) {
  pending?.abort()
  const controller = new AbortController()
  pending = controller
  const { signal } = controller
  const id = active
  $('status').textContent = id ? 'Loading Sleeper scores...' : ''
  $('report').replaceChildren()
  document.querySelector('.hero-link').hidden = true
  $('refresh').disabled = true
  $('week').disabled = true
  try {
    if (!id) {
      week = null
      $('week').replaceChildren(new Option('No completed weeks', ''))
      $('season').textContent = ''
      $('hero-description').textContent = 'Add a Sleeper league to see its completed weekly reports.'
      $('report').innerHTML = '<p class="empty">No league selected. Choose Add league to get started.</p>'
      updateUrl()
      return
    }
    $('season').textContent = ''
    $('hero-description').textContent = 'Loading your league…'
    if (refresh) metadata.delete(id)
    let info = metadata.get(id)
    if (!info) {
      const [league, users, rosters] = await Promise.all([
        request(`league/${id}`, signal),
        request(`league/${id}/users`, signal),
        request(`league/${id}/rosters`, signal)
      ])
      if (league?.sport !== 'nfl' || !Array.isArray(users) || !Array.isArray(rosters)) throw new Error('Sleeper did not return an NFL league for this ID.')
      if (signal.aborted) return
      info = { league, users, rosters }
      metadata.set(id, info)
    }
    const state = await request('state/nfl', signal)
    if (signal.aborted) return
    const maximum = completedWeek(info.league, state)
    if (maximum === null) throw new Error('Unable to determine completed NFL weeks. Please try Refresh.')
    if (maximum === 0) {
      week = null
      $('week').replaceChildren(new Option('No completed weeks', ''))
      $('season').textContent = `${info.league.season} NFL SEASON`
      $('hero-description').textContent = 'No completed NFL weeks are available yet.'
      $('status').textContent = ''
      updateUrl()
      return
    }
    if (!week || week > maximum) week = maximum
    setWeekOptions(maximum)
    updateUrl()
    directoryRequest ??= getDirectory().then(directory => {
      if (!Object.keys(directory).length) directoryRequest = null
      return directory
    }).catch(() => { directoryRequest = null; return {} })
    const [matchups, directory] = await Promise.all([request(`league/${id}/matchups/${week}`, signal), directoryRequest])
    if (signal.aborted) return
    if (!Array.isArray(matchups)) throw new Error('Sleeper did not return matchup data for this week.')
    render({ ...info, matchups, directory })
    $('status').textContent = ''
  } catch (error) {
    if (signal.aborted) return
    $('status').textContent = error instanceof TypeError || error.name === 'TimeoutError' ? 'Could not connect to Sleeper. Check your connection and try Refresh.' : error.message
    $('hero-description').textContent = 'Choose a league and week to view its report.'
  } finally {
    if (!signal.aborted) {
      $('refresh').disabled = !active
      $('week').disabled = !active || !week
    }
  }
}

$('open-league').addEventListener('click', () => {
  $('league-form').reset()
  $('league-error').textContent = ''
  $('league-dialog').showModal()
  $('league-id').focus()
})
document.querySelector('#league-dialog .close').addEventListener('click', () => $('league-dialog').close())
$('league-form').addEventListener('submit', async event => {
  event.preventDefault()
  const id = parseLeagueId($('league-id').value)
  if (!id) {
    $('league-error').textContent = 'Enter a numeric league ID or a Sleeper league link.'
    return
  }
  const button = event.submitter
  button.disabled = true
  $('league-error').textContent = 'Checking league…'
  try {
    const league = await request(`league/${id}`)
    if (league?.sport !== 'nfl' || typeof league.name !== 'string') throw new Error('No NFL league was found for that ID.')
    if (!$('league-dialog').open) return
    if (account.signedIn()) await account.add(id, league.name)
    leagues = [...leagues.filter(saved => saved.league_id !== id), { league_id: id, name: league.name }]
    if (!account.signedIn()) saveLeagues()
    active = id
    week = null
    updateControls()
    $('league-dialog').close()
    load()
  } catch (error) {
    $('league-error').textContent = error instanceof TypeError || error.name === 'TimeoutError' ? 'Sleeper is currently unreachable. Try again shortly.' : error.message
  } finally {
    button.disabled = false
  }
})
$('league').addEventListener('change', event => {
  active = event.target.value
  week = null
  $('week').replaceChildren()
  updateControls()
  load()
})
$('week').addEventListener('change', event => {
  week = Number(event.target.value)
  load()
})
$('refresh').addEventListener('click', () => load({ refresh: true }))
$('remove').addEventListener('click', async () => {
  try { if (account.signedIn()) await account.remove(active) } catch (error) { $('status').textContent = error.message; return }
  leagues = leagues.filter(league => league.league_id !== active)
  if (!account.signedIn()) saveLeagues()
  active = leagues[0]?.league_id || ''
  week = null
  updateControls()
  load()
})
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  installPrompt = event
  $('install').hidden = false
})
$('install').addEventListener('click', async () => {
  await installPrompt?.prompt()
  installPrompt = null
  $('install').hidden = true
})
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
const account = initAccount({ onChange: saved => {
  if (saved) leagues = saved
  else { try { const guest = JSON.parse(sessionStorage.getItem(savedKey)); leagues = Array.isArray(guest) ? guest.filter(league => typeof league?.name === 'string' && /^\d{8,24}$/.test(league.league_id)) : [] } catch { leagues = [] } }
  active = leagues[0]?.league_id || ''; week = null; updateControls(); load()
} })
updateControls()
load()
account.restore()
