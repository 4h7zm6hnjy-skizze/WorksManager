const CACHE_PREFIX='worksmanager-v';
const CACHE='worksmanager-v1.6.0';
const ASSETS=['./','./index.html','./styles.css?v=1.6.0','./app.js?v=1.6.0','./manifest.json?v=1.6.0','./worksmanager-logo.png','./favicon.png','./apple-touch-icon.png','./icon-192.png','./icon-512.png','./icon-1024.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  const core=e.request.mode==='navigate'||(u.origin===self.location.origin&&/\.(?:html|js|css|json)$/.test(u.pathname));
  if(core){
    e.respondWith(fetch(e.request).then(resp=>{
      if(resp&&resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}
      if(resp&&resp.ok)return resp;
      return caches.match(e.request).then(r=>r||caches.match('./index.html').then(f=>f||resp));
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
    if(resp&&resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}return resp;
  })));
});
