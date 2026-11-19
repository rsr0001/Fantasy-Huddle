const endpoint = 'https://api.sleeper.app/v1'
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
const number = value => typeof value === 'number' && Number.isFinite(value)
function statStrip(player) {
  const d=player.stats
  const snap=player.snapGames===player.games&&player.teamSnaps?`${Math.round(player.snaps/player.teamSnaps*100)}%`:'--'
  const fields=player.pos==='QB'?[['PASS YD',d.pass_yd],['PASS TD',d.pass_td],['INT',d.pass_int],['RUSH YD',d.rush_yd],['RUSH TD',d.rush_td]]:
    player.pos==='RB'?[['TOUCHES',player.touches],['CARRIES',d.rush_att],['RUSH YD',d.rush_yd],['RUSH TD',d.rush_td],['TARGETS',player.targets],['REC',d.rec],['REC YD',d.rec_yd]]:
    ['WR','TE'].includes(player.pos)?[['TARGETS',player.targets],['REC',d.rec],['REC YD',d.rec_yd],['REC TD',d.rec_td],['TOUCHES',player.touches]]:
    player.pos==='K'?[['FG MADE',d.fgm],['FG ATT',d.fga],['XP MADE',d.xpm],['XP MISS',d.xpmiss]]:
    [['SACKS',d.sack],['INT',d.int],['FUM REC',d.fum_rec],['DEF TD',d.def_td]]
  return [['SNAP',snap],...fields].map(([name,value])=>`<span>${name} ${value ?? 0}</span>`).join('')
}
export function calculatePoints(stats, settings) {
  return Object.entries(settings || {}).reduce((total, [key, weight]) => total + (number(weight) && number(stats[key]) ? weight * stats[key] : 0), 0)
}
export function initStats({root}) {
  let context = null, visible = false, generation = 0
  const cache = new Map()
  const state = {position:'ALL',period:'season',start:1,end:1,sort:'points',query:'',pool:'all'}
  async function request(path) {
    const url = path.startsWith('data/') ? `https://fantasyhuddle.duckdns.org/${path}` : `${endpoint}/${path}`
    const response = await fetch(url, {signal:AbortSignal.timeout(120000)})
    if (!response.ok) throw Error('Sleeper stats are unavailable. Please try again.')
    return response.json()
  }
  async function weekly(week) {
    const key = `${context.league.league_id}:${week}`
    if (!cache.has(key)) cache.set(key, Promise.all([
      request(`data/nfl/${context.league.season}/${week}`),
      request(`league/${context.league.league_id}/matchups/${week}`)
    ]).catch(error => {cache.delete(key);throw error}))
    return cache.get(key)
  }
  function setup() {
    root.innerHTML = `<div class="section-title"><h2>Player leaders</h2><p>All NFL players, including free agents</p></div>
      <div class="stats-controls"><label>Time period<select id="stats-period"><option value="season">Season to date</option><option value="week">Selected week</option><option value="2">Last 2 weeks</option><option value="3">Last 3 weeks</option><option value="4">Last 4 weeks</option><option value="5">Last 5 weeks</option><option value="custom">Custom range</option></select></label>
      <label>From<select id="stats-start"></select></label><label>Through<select id="stats-end"></select></label>
      <label>Players<select id="stats-pool"><option value="all">All NFL players</option><option value="rostered">Rostered now</option><option value="available">Available now</option></select></label>
      <label>Sort by<select id="stats-sort"><option value="points">Fantasy points</option><option value="average">Points per game</option><option value="targets">Targets</option><option value="touches">Touches</option><option value="snap">Snap %</option></select></label>
      <label>Search<input id="stats-search" placeholder="Player or team" type="search"></label></div>
      <div class="position-tabs" role="group" aria-label="Position">${['ALL','QB','RB','WR','TE','FLEX','K','DEF'].map(pos=>`<button type="button" data-pos="${pos}">${pos==='DEF'?'D/ST':pos}</button>`).join('')}</div>
      <p id="stats-status" class="data-note" role="status"></p><div id="stats-list"></div>`
    const end=root.querySelector('#stats-end'),start=root.querySelector('#stats-start')
    for (let i=1;i<=context.maximum;i++){start.add(new Option(`Week ${i}`,i));end.add(new Option(`Week ${i}`,i))}
    state.start=1;state.end=context.currentWeek || context.maximum
    start.value=String(state.start);end.value=String(state.end)
    root.querySelector('#stats-period').value=state.period
    root.querySelector('#stats-pool').value=state.pool
    root.querySelector('#stats-sort').value=state.sort
    root.querySelector('#stats-search').value=state.query
    root.querySelectorAll('[data-pos]').forEach(button=>button.addEventListener('click',()=>{state.position=button.dataset.pos;draw()}))
    root.querySelector('#stats-period').addEventListener('change',e=>{state.period=e.target.value;draw()})
    start.addEventListener('change',e=>{state.start=Number(e.target.value);state.period='custom';root.querySelector('#stats-period').value='custom';draw()})
    end.addEventListener('change',e=>{state.end=Number(e.target.value);draw()})
    root.querySelector('#stats-pool').addEventListener('change',e=>{state.pool=e.target.value;draw()})
    root.querySelector('#stats-sort').addEventListener('change',e=>{state.sort=e.target.value;draw()})
    root.querySelector('#stats-search').addEventListener('input',e=>{state.query=e.target.value;draw()})
  }
  async function draw() {
    if(!context||!visible)return
    const id=++generation, status=root.querySelector('#stats-status'), list=root.querySelector('#stats-list')
    if(!status)return
    const end=Math.min(context.maximum,state.end), start=state.period==='season'?1:state.period==='week'?end:state.period==='custom'?state.start:Math.max(1,end-Number(state.period)+1)
    root.querySelectorAll('[data-pos]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.pos===state.position)))
    if(start>end){status.textContent='Choose a starting week no later than the ending week.';list.replaceChildren();return}
    status.textContent='Loading NFL player stats...';list.replaceChildren()
    try {
      const weeks=Array.from({length:end-start+1},(_,i)=>start+i), result=await Promise.all(weeks.map(weekly))
      if(id!==generation)return
      let checked=0,mismatch=0,missing=0;const totals=new Map();let stale=false;const updated=[]
      const rostered=new Set(context.rosters.flatMap(r=>(r.players||[]).map(String)))
      for(const [snapshot,matchups] of result){
        const raw=snapshot.raw; stale ||= snapshot.stale; if(snapshot.updated_at) updated.push(Date.parse(snapshot.updated_at))
        if(!raw || Array.isArray(raw)||!Array.isArray(matchups))throw Error('Sleeper returned unexpected stats data.')
        for(const row of matchups)for(const [playerId,official] of Object.entries(row.players_points||{})){
          if(!number(official))continue
          const score=raw[playerId]
          if(!score){if(official!==0)missing++;continue}
          checked++
          if(Math.abs(calculatePoints(score,context.league.scoring_settings)-official)>.051)mismatch++
        }
        for(const [playerId,values] of Object.entries(raw)){
          if(!values || typeof values!=='object')continue
          const meta=context.directory[playerId] || {}, pos=meta.position || (/^[A-Z]{2,3}$/.test(playerId)?'DEF':'')
          if(!['QB','RB','WR','TE','K','DEF'].includes(pos))continue
          if(!(values.gp>0 || values.off_snp>0 || values.def_snp>0 || values.st_snp>0 || values.pass_att>0 || values.rush_att>0 || values.rec_tgt>0 || values.fgm>0 || values.pts_ppr))continue
          const item=totals.get(playerId)||{id:playerId,pos,name:meta.full_name || (pos==='DEF'?`${playerId} Defense`:`Player ${playerId}`),team:meta.team || '',games:0,points:0,targets:0,touches:0,snaps:0,teamSnaps:0,snapGames:0,stats:{}}
          item.games++;item.points+=calculatePoints(values,context.league.scoring_settings);item.targets+=values.rec_tgt||0;item.touches+=(values.rush_att||0)+(values.rec||0);if(number(values.off_snp)&&number(values.tm_off_snp)&&values.tm_off_snp>0){item.snaps+=values.off_snp;item.teamSnaps+=values.tm_off_snp;item.snapGames++}
          for(const [k,v] of Object.entries(values))if(number(v))item.stats[k]=(item.stats[k]||0)+v
          totals.set(playerId,item)
        }
      }
      const verified=checked>0 && mismatch===0 && missing===0
      let flex=new Set((context.league.roster_positions||[]).includes('FLEX')?['RB','WR','TE']:[])
      if((context.league.roster_positions||[]).includes('SUPER_FLEX'))for(const p of ['QB','RB','WR','TE'])flex.add(p)
      if((context.league.roster_positions||[]).includes('WRRB_FLEX'))for(const p of ['RB','WR'])flex.add(p)
      if((context.league.roster_positions||[]).includes('REC_FLEX'))for(const p of ['WR','TE'])flex.add(p)
      const query=state.query.trim().toLowerCase()
      let rows=[...totals.values()].filter(p=>(state.position==='ALL'||p.pos===state.position||(state.position==='FLEX'&&flex.has(p.pos)))&&(state.pool==='all'||(state.pool==='rostered')===rostered.has(p.id))&&(!query||`${p.name} ${p.team}`.toLowerCase().includes(query)))
      const metric=p=>state.sort==='targets'?p.targets:state.sort==='touches'?p.touches:state.sort==='snap'?(p.snapGames===p.games&&p.teamSnaps?p.snaps/p.teamSnaps:-1):state.sort==='average'?p.points/p.games:p.points
      rows.sort((a,b)=>metric(b)-metric(a)||a.name.localeCompare(b.name))
      status.textContent=`Weeks ${start}-${end} | ${rows.length} players | ${verified?'Estimated league points; checked against rostered matchup scores for these weeks.':`League points could not be verified (${mismatch} mismatches, ${missing} missing; ${checked} comparisons). Rankings by points are hidden.`} Roster status is current, not historical. Player stats use an undocumented Sleeper feed.${stale ? ' Some stored data is stale.' : ''} Oldest update: ${updated.length ? new Date(Math.min(...updated)).toLocaleString() : 'unknown'}. `
      if(!verified && ['points','average'].includes(state.sort)){list.innerHTML='<p class="empty">Select a raw stat to explore, or try again later when league scoring can be verified.</p>';return}
      list.innerHTML=rows.map((p,i)=>{const d=p.stats; return `<article class="stats-row"><div class="stats-main"><span class="rank">${i+1}</span><div class="headshot">${/^\d+$/.test(p.id)?`<img loading="lazy" src="https://sleepercdn.com/content/nfl/players/${encodeURIComponent(p.id)}.jpg" alt="">`:''}</div><div class="stats-name"><h3>${esc(p.name)}</h3><p>${esc(p.pos)} · ${esc(p.team||'--')} · ${rostered.has(p.id)?'Rostered':'Available'} · ${p.games} games</p></div><strong>${verified?p.points.toFixed(2):'--'}<small>FPTS</small></strong></div><div class="stats-strip">${statStrip(p)}</div></article>`}).join('') || '<p class="empty">No players match these filters.</p>'
    } catch(error){if(id===generation){status.textContent=error.message;list.replaceChildren()}}
  }
  return { setContext(value){context=value;state.end=value.currentWeek||value.maximum;if(visible){setup();draw()}},clear(){context=null;generation++;cache.clear();root.innerHTML='<p class="empty">Add a league to explore NFL player stats.</p>'},show(){visible=true;if(context){setup();draw()}},hide(){visible=false;generation++} }
}
