'use strict';
/* WorksManager 2.0.4: cache-first offline shell; encryptierte lokale DB wird nicht angefasst. */
const CACHE_PREFIX='worksmanager-v';
const CACHE_NAME='worksmanager-v2.0.4-v1-20261030-b';
const REQUIRED=['./index.html','./worksmanager-profiles.js?v=2.0.4','./styles.css?v=1.8.4','./app.js?v=1.8.4',
                './worksmanager-plus.js?v=2.0.4','./worksmanager-19.js?v=1.9.1','./worksmanager-insurance.js?v=2.0.4','./worksmanager-lohn.js?v=2.0.4','./worksmanager-uhr.js?v=2.0.4',
                './worksmanager-195.js?v=2.0.4','./worksmanager-calendar.js?v=2.0.4','./worksmanager-quality.js?v=2.0.4','./worksmanager-organize.js?v=2.0.4','./worksmanager-pro.js?v=2.0.4','./worksmanager-netto.js?v=2.0.4','./worksmanager-integrity.json','./manifest.json?v=2.0.4','./worksmanager-release.json'];
const OPTIONAL=['./','./worksmanager-logo.png','./favicon.png','./apple-touch-icon.png',
                './icon-192.png','./icon-512.png','./icon-1024.png'];
// Installing an incomplete release must not activate it. Verify every shipped application file.
async function verifyReleaseCache(cache){
  const manifest=await cache.match('./worksmanager-integrity.json');
  if(!manifest)throw Error('Integritätsmanifest fehlt');
  const info=await manifest.json();
  if(info.version!=='2.0.4'||!info.files||typeof crypto?.subtle?.digest!=='function')throw Error('Integritätsprüfung nicht verfügbar');
  const requiredFiles=REQUIRED.filter(p=>!p.endsWith('/worksmanager-integrity.json')).map(p=>p.replace(/^\.\//,''));
  if(requiredFiles.some(p=>!Object.prototype.hasOwnProperty.call(info.files,p)) || Object.keys(info.files).length!==requiredFiles.length)throw Error('Prüfliste enthält nicht alle Programmdateien');
  for(const [path,expected] of Object.entries(info.files)){
    const response=await cache.match('./'+path);
    if(!response||!response.ok)throw Error('Datei fehlt: '+path);
    const data=await response.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
    if(!/^[a-f0-9]{64}$/.test(expected)||hash!==expected)throw Error('Datei verändert oder unvollständig: '+path);
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
// A checked version is immutable: never replace executable files with unverified HTTP responses.
// The next release is loaded only by a new service worker and activated after complete hash verification.
async function navigation(request){
 const c=await caches.open(CACHE_NAME);
 return await c.match('./index.html')||new Response('WorksManager-Startdatei fehlt. Bitte online neu laden.',{status:503,headers:{'content-type':'text/plain;charset=utf-8'}});
}
async function asset(request){
 const c=await caches.open(CACHE_NAME),cached=await c.match(request);
 // This includes scripts, style sheets and release metadata: only the verified installed copy is delivered.
 if(cached)return cached;
 // Unknown/new resources may be fetched but must not overwrite or be inserted into the verified cache.
 try{return await fetch(request);}catch{return Response.error();}
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
