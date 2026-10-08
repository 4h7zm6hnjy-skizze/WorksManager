'use strict';
/* WorksManager 1.8.4 + Erweiterungen 1.0.0. Daten verbleiben in verschluesselter IndexedDB.
   Der Worker ergänzt das Erweiterungsskript nur bei Seitenaufrufen. Die unveränderte
   Haupt-App index.html/app.js kann deshalb weiterhin separat aktualisiert werden. */
const CACHE_PREFIX='worksmanager-v';
const CACHE_NAME='worksmanager-v1.8.4-plus1_1-20261008';
const SCRIPT='./worksmanager-plus.js?v=1.1.0';
const REQUIRED=['./index.html','./styles.css?v=1.8.4','./app.js?v=1.8.4','./manifest.json?v=1.8.4',SCRIPT,'./worksmanager-release.json'];
const OPTIONAL=['./','./worksmanager-logo.png','./favicon.png','./apple-touch-icon.png','./icon-192.png','./icon-512.png','./icon-1024.png'];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    // Keine Aktivierung bei unvollstaendiger App. Vorherigen Offline-Stand erhalten.
    await cache.addAll(REQUIRED);
    await Promise.allSettled(OPTIONAL.map(item=>cache.add(item)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    await Promise.all((await caches.keys())
      .filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME)
      .map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
async function injectAddon(response){
  if(!response||!response.ok)return response;
  const source=await response.text();
  const html=source.includes('worksmanager-plus.js')||!source.includes('</body>')
    ?source:source.replace('</body>','<script src="./worksmanager-plus.js?v=1.1.0"></script>\n</body>');
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');
  headers.set('content-type','text/html; charset=utf-8');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
async function page(request){
  const cache=await caches.open(CACHE_NAME);
  let response;
  try{
    response=await fetch(request);
    if(response&&response.ok){
      const enhanced=await injectAddon(response);
      await cache.put(request,enhanced.clone()).catch(()=>{});
      return enhanced;
    }
  }catch(e){/* Cache-Fallback fuer Flugmodus. */}
  const cached=await cache.match(request)||await cache.match('./index.html');
  if(cached)return injectAddon(cached);
  if(response)return response;
  return new Response('WorksManager ist noch nicht offline gespeichert. Bitte zuerst online oeffnen.',{
    status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}
  });
}
async function staticAsset(request){
  const cache=await caches.open(CACHE_NAME);
  const stored=await cache.match(request);
  try{
    const response=await fetch(request);
    if(response&&response.ok){
      await cache.put(request,response.clone()).catch(()=>{});
      return response;
    }
    return stored||response;
  }catch{return stored||Response.error();}
}
async function otherAsset(request){
  const cache=await caches.open(CACHE_NAME),stored=await cache.match(request);
  if(stored)return stored;
  try{
    const response=await fetch(request);
    if(response&&response.ok)await cache.put(request,response.clone()).catch(()=>{});
    return response;
  }catch{return Response.error();}
}
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'||url.pathname.endsWith('/index.html'))event.respondWith(page(request));
  else if(/\.(?:js|css|json)$/.test(url.pathname))event.respondWith(staticAsset(request));
  else event.respondWith(otherAsset(request));
});
