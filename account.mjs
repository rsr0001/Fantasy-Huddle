const API = 'https://fantasyhuddle.duckdns.org'
const key = 'fantasy-huddle.session'
const $ = id => document.getElementById(id)
let token = sessionStorage.getItem(key) || ''
let user = null
let scriptPromise
async function api(path, options = {}) {
  const response = await fetch(API + path, { ...options, credentials:'omit', signal:AbortSignal.timeout(15000), headers:{'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {}), ...options.headers} })
  const result = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Account service is unavailable. Please try again.')
  return result
}
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!scriptPromise) scriptPromise = new Promise((resolve,reject) => { const script=document.createElement('script'); script.src='https://accounts.google.com/gsi/client'; script.async=true; script.onload=resolve; script.onerror=()=>{scriptPromise=null;script.remove();reject(new Error('Google sign-in could not load.'))}; document.head.append(script) })
  return scriptPromise
}
export function initAccount({onChange}) {
  function draw() {
    $('account-button').textContent = user ? user.name : 'Sign in'
    $('account-title').textContent = user ? `Signed in as ${user.name}` : 'Your leagues, anywhere'
    $('account-description').textContent = user ? 'Leagues added here are saved to your account. Guest leagues stay on this device.' : 'Continue as a guest to keep leagues on this device, or sign in with Google to save leagues across devices.'
    $('signin').hidden = !!user
    $('signout').hidden = !user
    $('google-signin').replaceChildren()
  }
  $('account-button').addEventListener('click', () => { $('account-status').textContent=''; draw(); $('account-dialog').showModal() })
  $('account-close').addEventListener('click', () => $('account-dialog').close())
  $('signin').addEventListener('click', async () => {
    try {
      $('account-status').textContent='Loading Google sign-in...'
      const config = await api('/config')
      if (!config.googleClientId) throw new Error('Google sign-in is being configured.')
      await loadGoogle()
      const {nonce} = await api('/auth/challenge', {method:'POST',body:'{}'})
      google.accounts.id.initialize({client_id:config.googleClientId, nonce, auto_select:false, ux_mode:'popup', callback:async response => {
        try {
          const result = await api('/auth/google',{method:'POST',body:JSON.stringify({credential:response.credential,nonce})})
          token=result.token
          const saved=await api('/leagues')
          sessionStorage.setItem(key,token); user=result.user; draw(); onChange(saved.leagues)
          $('account-status').textContent='Signed in. Your guest leagues remain on this device.'
        } catch(error) { token=''; sessionStorage.removeItem(key); $('account-status').textContent=error.message }
      }})
      google.accounts.id.renderButton($('google-signin'),{theme:'outline',size:'large',text:'signin_with',shape:'rectangular'})
      $('signin').hidden=true; $('account-status').textContent='Continue with Google above.'
    } catch(error) { $('account-status').textContent=error.message }
  })
  $('signout').addEventListener('click', async () => {
    try { await api('/auth/logout',{method:'POST',body:'{}'}) } catch(error) { $('account-status').textContent=error.message; return }
    token=''; user=null; sessionStorage.removeItem(key); window.google?.accounts.id.disableAutoSelect(); draw(); onChange(null); $('account-status').textContent='Signed out. Guest leagues are available on this device.'
  })
  return {
    signedIn: () => !!user,
    add: (id,name) => api('/leagues/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({name})}),
    remove: id => api('/leagues/'+encodeURIComponent(id),{method:'DELETE'}),
    restore: async () => {
      if (!token) return
      try { const me=await api('/me'); const saved=await api('/leagues'); user=me.user; draw(); onChange(saved.leagues) }
      catch { token=''; sessionStorage.removeItem(key); draw() }
    }
  }
}
