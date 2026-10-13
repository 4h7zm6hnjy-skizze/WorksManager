'use strict';
/* WorksManager 2.0.0: cache-first offline shell; encryptierte lokale DB wird nicht angefasst. */
const CACHE_PREFIX='worksmanager-v';
const CACHE_NAME='worksmanager-v2.0.0-v1-20261014-a';
const REQUIRED=['./index.html','./worksmanager-profiles.js?v=2.0.0','./styles.css?v=1.8.4','./app.js?v=1.8.4',
                './worksmanager-plus.js?v=2.0.0','./worksmanager-19.js?v=1.9.1','./worksmanager-insurance.js?v=2.0.0','./worksmanager-lohn.js?v=2.0.0','./worksmanager-uhr.js?v=2.0.0',
                './worksmanager-195.js?v=2.0.0','./worksmanager-calendar.js?v=2.0.0','./worksmanager-quality.js?v=2.0.0','./worksmanager-organize.js?v=2.0.0','./worksmanager-pro.js?v=2.0.0','./worksmanager-netto.js?v=2.0.0','./worksmanager-integrity.json','./manifest.json?v=2.0.0','./worksmanager-release.json'];
const OPTIONAL=['./','./worksmanager-logo.png','./favicon.png','./apple-touch-icon.png',
                './icon-192.png','./icon-512.png','./icon-1024.png'];
// Installing an incomplete release must not activate it. Verify every shipped application file.
async function verifyReleaseCache(cache){
  const manifest=await cache.match('./worksmanager-integrity.json');
  if(!manifest)throw Error('Integritätsmanifest fehlt');
  const info=await manifest.json();
  if(info.version!=='2.0.0'||!info.files||typeof crypto?.subtle?.digest!=='function')throw Error('Integritätsprüfung nicht verfügbar');
  for(const [path,expected] of Object.entries(info.files)){
    const response=await cache.match('./'+path);
    if(!response||!response.ok)throw Error('Datei fehlt: '+path);
    const data=await response.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==expected)throw Error('Datei verändert oder unvollständig: '+path);
  }
}
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
   const cache=await caches.open(CACHE_NAME);
   try{
     await cache.addAll(REQUIRED);
     await verifyReleaseCache(cache);
     await Promise.allSettled(OPTIONAL.map(asset=>cache.add(asset)));
     await self.skipWaiting();
   }catch(error){await caches.delete(CACHE_NAME);throw error;}
 })());
});
self.addEventListener('activate', event=>{
  event.waitUntil((async()=>{
    await Promise.all((await caches.keys())
      .filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME)
      .map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
async function navigation(request){
  const c=await caches.open(CACHE_NAME);
  try{const response=await fetch(request);if(response.ok){
    await c.put(request,response.clone()).catch(()=>{});return response;
  }return await c.match(request)||await c.match('./index.html')||response;}
  catch{return await c.match(request)||await c.match('./index.html')||new Response('Bitte WorksManager einmal online öffnen.',{status:503,headers:{'content-type':'text/plain;charset=utf-8'}});}
}
async function asset(request){
  const c=await caches.open(CACHE_NAME),cached=await c.match(request);
  // Online bevorzugen bei JavaScript und HTML, offline aus dem Cache laden.
  try{const response=await fetch(request);if(response.ok){await c.put(request,response.clone()).catch(()=>{});return response;}return cached||response;}
  catch{return cached||Response.error();}
}
async function other(request){
  const c=await caches.open(CACHE_NAME),cached=await c.match(request);
  if(cached)return cached;
  try{const response=await fetch(request);if(response.ok)await c.put(request,response.clone()).catch(()=>{});return response;}
  catch{return Response.error();}
}
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'||url.pathname.endsWith('/index.html'))event.respondWith(navigation(request));
  else if(/\.(?:js|css|json|webmanifest)$/i.test(url.pathname))event.respondWith(asset(request));
  else event.respondWith(other(request));
});
