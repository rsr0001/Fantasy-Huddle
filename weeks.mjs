export function completedWeek(league, state) {
  const season = Number(league?.season)
  const currentSeason = Number(state?.season)
  if (!Number.isInteger(season) || !Number.isInteger(currentSeason) || !['pre','regular','post'].includes(state?.season_type)) return null
  if (season < currentSeason) return 18
  if (season > currentSeason || state.season_type === 'pre') return 0
  if (state.season_type === 'post') return 18
  const currentWeek = Number(state.week)
  if (!Number.isInteger(currentWeek) || currentWeek < 1 || currentWeek > 19) return null
  return Math.min(18, currentWeek - 1)
}
