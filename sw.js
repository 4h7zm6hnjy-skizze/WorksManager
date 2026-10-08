'use strict';
/* WorksManager 1.9.3: cache-first offline shell; encryptierte lokale DB wird nicht angefasst. */
const CACHE_PREFIX='worksmanager-v';
const CACHE_NAME='worksmanager-v1.9.3-homeclock-20261008';
const REQUIRED=['./index.html','./worksmanager-profiles.js?v=1.9.3','./styles.css?v=1.8.4','./app.js?v=1.8.4',
                './worksmanager-plus.js?v=1.9.3','./worksmanager-19.js?v=1.9.1','./worksmanager-lohn.js?v=1.9.1','./worksmanager-uhr.js?v=1.9.3',
                './manifest.json?v=1.9.3','./worksmanager-release.json'];
const OPTIONAL=['./','./worksmanager-logo.png','./favicon.png','./apple-touch-icon.png',
                './icon-192.png','./icon-512.png','./icon-1024.png'];
self.addEventListener('install', event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(REQUIRED); // Aktivierung erst nach vollständiger Speicherung.
    await Promise.allSettled(OPTIONAL.map(asset=>cache.add(asset)));
    await self.skipWaiting();
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
