import { calculatePoints } from './stats.mjs'
const endpoint='https://api.sleeper.app'
const numeric=n=>typeof n==='number'&&Number.isFinite(n)
export function initDefense({root}) {
  let context=null,visible=false,generation=0
  let period='season',end=1,start=1,metric='points_qb'
  const cache=new Map()
  async function get(url) {const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Defense data is unavailable. Please try again.');return r.json()}
  async function weekly(week) {
    const key=`${context.league.league_id}:${week}`
    if(!cache.has(key))cache.set(key,Promise.all([
      get(`https://fantasyhuddle.duckdns.org/data/nfl/${context.league.season}/${week}`),
      get(`${endpoint}/v1/league/${context.league.league_id}/matchups/${week}`)
    ]).catch(error=>{cache.delete(key);throw error}))
    return cache.get(key)
  }
  function setup() {
    root.innerHTML=`<div class="section-title"><h2>Defense vs. position</h2><p>Allowed to opponents</p></div><div class="stats-controls">
      <label>Time period<select id="def-period"><option value="season">Season to date</option><option value="week">Selected week</option><option value="2">Last 2 weeks</option><option value="3">Last 3 weeks</option><option value="4">Last 4 weeks</option><option value="5">Last 5 weeks</option><option value="custom">Custom range</option></select></label>
      <label>From<select id="def-start"></select></label><label>Through<select id="def-end"></select></label>
      <label>Allowed per game<select id="def-metric"><option value="points_qb">Fantasy points to QB</option><option value="points_rb">Fantasy points to RB</option><option value="points_wr">Fantasy points to WR</option><option value="points_te">Fantasy points to TE</option><option value="pass_yd">Passing yards</option><option value="rush_yd">Rushing yards</option></select></label></div><p id="def-status" role="status" class="data-note"></p><div id="def-list"></div>`
    const s=root.querySelector('#def-start'),e=root.querySelector('#def-end')
    for(let i=1;i<=context.maximum;i++){s.add(new Option(`Week ${i}`,i));e.add(new Option(`Week ${i}`,i))}
    end=context.currentWeek||context.maximum;start=1;s.value=String(start);e.value=String(end);root.querySelector('#def-period').value=period;root.querySelector('#def-metric').value=metric
    root.querySelector('#def-period').addEventListener('change',event=>{period=event.target.value;draw()})
    s.addEventListener('change',event=>{start=Number(event.target.value);period='custom';root.querySelector('#def-period').value='custom';draw()})
    e.addEventListener('change',event=>{end=Number(event.target.value);draw()})
    root.querySelector('#def-metric').addEventListener('change',event=>{metric=event.target.value;draw()})
  }
  async function draw(){
    if(!visible||!context)return
    const id=++generation,status=root.querySelector('#def-status'),list=root.querySelector('#def-list')
    const from=period==='season'?1:period==='week'?end:period==='custom'?start:Math.max(1,end-Number(period)+1)
    if(from>end){status.textContent='Choose a valid week range.';list.replaceChildren();return}
    status.textContent='Loading defensive matchup data...';list.replaceChildren()
    try{
      const data=await Promise.all(Array.from({length:end-from+1},(_,i)=>weekly(from+i)));if(id!==generation)return
      const teams=new Map();let checked=0,mismatched=0,missing=0,stale=false;const updated=[]
      for(const [snapshot,matchups] of data){
        const players=snapshot.details,raw=snapshot.raw;stale ||= snapshot.stale;if(snapshot.updated_at)updated.push(Date.parse(snapshot.updated_at))
        if(!Array.isArray(players)||!Array.isArray(matchups)||!raw||Array.isArray(raw))throw Error('Sleeper returned unexpected defensive data.')
        for(const row of matchups)for(const [id,official] of Object.entries(row.players_points||{})){if(!numeric(official))continue;const s=raw[id];if(!s){if(official!==0)missing++;continue}checked++;if(Math.abs(calculatePoints(s,context.league.scoring_settings)-official)>.051)mismatched++}
        for(const row of players){
          if(!row.opponent||!row.game_id||!row.stats)continue
          const id=String(row.player_id), s=row.stats, pos=context.directory[id]?.position || row.position
          if(!['QB','RB','WR','TE'].includes(pos))continue
          const team=teams.get(row.opponent)||{games:new Set(),pass_yd:0,rush_yd:0,points_qb:0,points_rb:0,points_wr:0,points_te:0}
          team.games.add(row.game_id);team.pass_yd+=s.pass_yd||0;team.rush_yd+=s.rush_yd||0;team[`points_${pos.toLowerCase()}`]+=calculatePoints(s,context.league.scoring_settings);teams.set(row.opponent,team)
        }
      }
      const verified=checked>0&&!mismatched&&!missing
      if(metric.startsWith('points_')&&!verified){status.textContent=`League scoring could not be verified (${mismatched} mismatches, ${missing} missing; ${checked} comparisons). Fantasy points allowed are hidden.`;return}
      const rows=[...teams].filter(([,t])=>t.games.size).map(([name,t])=>({name,games:t.games.size,total:t[metric],avg:t[metric]/t.games.size})).sort((a,b)=>b.avg-a.avg||a.name.localeCompare(b.name))
      status.textContent=`Weeks ${from}-${end} | Most allowed per game first | ${metric.startsWith('points_')?'Estimated league-scored points, checked against rostered scores. ':''}Sleeper opponent data is unofficial.${stale ? ' Some stored data is stale.' : ''} Oldest update: ${updated.length ? new Date(Math.min(...updated)).toLocaleString() : 'unknown'}.`
      list.innerHTML=rows.map((r,i)=>`<article class="performance-row defense-row"><span class="rank">${i+1}</span><div class="performance-body"><div><h3>${r.name.replace(/[^A-Z0-9]/g,'')}</h3><strong>${r.avg.toFixed(2)} / game</strong></div><p>${r.total.toFixed(2)} total · ${r.games} games</p></div></article>`).join('')||'<p class="empty">No defensive data for this range.</p>'
    }catch(error){if(id===generation)status.textContent=error.message}
  }
  return {setContext(c){context=c;if(visible){setup();draw()}},clear(){context=null;generation++;cache.clear();root.innerHTML='<p class="empty">Add a league to explore defense stats.</p>'},show(){visible=true;if(context){setup();draw()}},hide(){visible=false;generation++}}
}
