import test from 'node:test'
import assert from 'node:assert/strict'
import { completedWeek } from './weeks.mjs'
const league = season => ({ season: String(season) })
const state = (season, season_type, week) => ({ season: String(season), season_type, week })
test('current and future weeks are unavailable until Sleeper advances', () => {
  assert.equal(completedWeek(league(2026), state(2026, 'regular', 11)), 10)
  assert.equal(completedWeek(league(2026), state(2026, 'regular', 1)), 0)
  assert.equal(completedWeek(league(2026), state(2026, 'regular', 12)), 11)
})
test('season boundaries and unknown state are handled conservatively', () => {
  assert.equal(completedWeek(league(2025), state(2026, 'regular', 11)), 18)
  assert.equal(completedWeek(league(2027), state(2026, 'regular', 11)), 0)
  assert.equal(completedWeek(league(2026), state(2026, 'pre', 1)), 0)
  assert.equal(completedWeek(league(2026), state(2026, 'post', 1)), 18)
  assert.equal(completedWeek(league(2026), null), null)
  assert.equal(completedWeek(league(2026), state(2026, 'regular', 0)), null)
})
