/* WorksManager 1.9.2 – local, independent encrypted profiles.
   E-mail is a LOCAL identifier; no server, no e-mail is sent.
   Existing default DB WorksManagerSecure is never renamed or migrated.
*/
(() => {
'use strict';
const VERSION='1.9.2', REGISTRY='wm_profiles_v1', ACTIVE='wm_active_profile_v1';
const DB_BASE='WorksManagerSecure',PREFIX='WorksManagerSecure-profile-';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const $=id=>document.getElementById(id);
const text=x=>String(x??'');
const esc=s=>text(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
const uuid=()=>crypto.randomUUID?.() || [...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
const bytes=n=>crypto.getRandomValues(new Uint8Array(n));
const base64=val=>{const u=val instanceof Uint8Array?val:new Uint8Array(val);let v='';for(let i=0;i<u.length;i+=8192)v+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(v)};
const from64=val=>Uint8Array.from(atob(val),x=>x.charCodeAt(0));
const keyFrom=async(pass,salt)=>{const b=await crypto.subtle.importKey('raw',encoder.encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},b,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])};
const encrypt=async(plain,key)=>{const iv=bytes(12);return {iv:base64(iv),cipher:base64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain))}};
const decrypt=async(obj,key)=>crypto.subtle.decrypt({name:'AES-GCM',iv:from64(obj.iv)},key,from64(obj.cipher));
const genRecovery=()=>base64(bytes(32)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const normalRecovery=s=>text(s).trim().replace(/-/g,'+').replace(/_/g,'/');
const isEmail=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(s).trim());
function registry(){try{const raw=JSON.parse(localStorage.getItem(REGISTRY)||'null');if(Array.isArray(raw)&&raw.length){const valid=raw.filter(x=>x&&typeof x.id==='string'&&(x.id==='primary'||/^[a-f0-9-]{16,60}$/.test(x.id)));if(valid.some(x=>x.id==='primary'))return valid;}}catch{}return [{id:'primary',email:'',label:'Bisheriges Profil'}];}
function updateRegistry(list){localStorage.setItem(REGISTRY,JSON.stringify(list));}
if(typeof module!=='undefined'&&module.exports){module.exports={genRecovery,envelope,unwrap,keyFrom,encrypt,decrypt,normalRecovery};return;}
let records=registry();
let current=localStorage.getItem(ACTIVE)||'primary';
if(!records.some(x=>x.id===current))current='primary';
const originalOpen=indexedDB.open.bind(indexedDB);
const routeDb=current==='primary'?DB_BASE:PREFIX+current;
let intercepted=false;
try{
  Object.defineProperty(indexedDB,'open',{configurable:true,value:function(name,version){return originalOpen(name===DB_BASE?routeDb:name,version)}});
  intercepted=indexedDB.open!==originalOpen;
}catch(e){console.error('Profil-Datenbankzuordnung nicht verfügbar:',e);}
if(!intercepted){ // Fail closed: never allow a secondary profile to read the primary DB.
  if(current!=='primary'){localStorage.setItem(ACTIVE,'primary');location.reload();}
  return;
}
const getDb=()=>{if(typeof db==='undefined'||!db)throw Error('Der lokale Speicher ist noch nicht bereit. Bitte App erneut öffnen.');return db};
const kvGet=k=>new Promise((resolve,reject)=>{let t=getDb().transaction('kv','readonly'),q=t.objectStore('kv').get(k);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
const kvSet=(k,v)=>new Promise((resolve,reject)=>{let t=getDb().transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error)});
const allFiles=()=>new Promise((resolve,reject)=>{const t=getDb().transaction('files','readonly'),q=t.objectStore('files').openCursor(),out=[];q.onsuccess=()=>{if(q.result){out.push([q.result.key,q.result.value]);q.result.continue()}else resolve(out)};q.onerror=()=>reject(q.error)});
async function envelope(password,recovery){const salt=bytes(16),key=await keyFrom(normalRecovery(recovery),salt),val=await encrypt(encoder.encode(password),key);return {...val,salt:base64(salt),v:1}};
async function unwrap(env,recovery){const key=await keyFrom(normalRecovery(recovery),from64(env.salt));return decoder.decode(await decrypt(env,key))};
async function newDB(name,password,recovery){return new Promise((resolve,reject)=>{
  const request=originalOpen(name,2);
  request.onupgradeneeded=()=>{const d=request.result;for(const table of ['kv','files'])if(!d.objectStoreNames.contains(table))d.createObjectStore(table)};
  request.onerror=()=>reject(request.error);
  request.onsuccess=async()=>{const connection=request.result;try{
    const salt=bytes(16),key=await keyFrom(password,salt),plain=encoder.encode(JSON.stringify(typeof blankState==='function'?blankState():{version:7}));
    const payload={...await encrypt(plain,key),updatedAt:new Date().toISOString()},rec=await envelope(password,recovery);
    await new Promise((res,rej)=>{const tx=connection.transaction('kv','readwrite'),store=tx.objectStore('kv');store.put(base64(salt),'salt');store.put(payload,'payload');store.put(rec,'recovery');tx.oncomplete=res;tx.onabort=()=>rej(tx.error||Error('Profil konnte nicht gespeichert werden'));tx.onerror=()=>rej(tx.error)});
    connection.close();resolve();
  }catch(e){connection.close();reject(e)} };
})};
function mountOverlay(){let el=$('wmProfileOverlay');if(el)return el;el=document.createElement('div');el.id='wmProfileOverlay';el.className='wmp-overlay';el.hidden=true;el.innerHTML='<section class="wmp-dialog" role="dialog" aria-modal="true" aria-labelledby="wmpDialogTitle"><div class="wmp-dialog-top"><h3 id="wmpDialogTitle"></h3><button type="button" id="wmpClose" class="wmp-secondary">Schließen</button></div><div id="wmpDialogBody"></div><p id="wmpDialogError" role="alert"></p></section>';document.body.appendChild(el);$('wmpClose').onclick=()=>{el.hidden=true};return el;}
function dialog(title,html,handler){const el=mountOverlay();$('wmpDialogTitle').textContent=title;$('wmpDialogBody').innerHTML=html;$('wmpDialogError').textContent='';el.hidden=false;const f=el.querySelector('form');if(f)f.onsubmit=async ev=>{ev.preventDefault();const button=f.querySelector('button[type=submit]');if(button)button.disabled=true;try{await handler(new FormData(f));}catch(e){$('wmpDialogError').textContent=e?.message||String(e)}finally{if(button)button.disabled=false}};}
function closeDialog(){mountOverlay().hidden=true}
function profileName(p){return p.email||p.label||'Bisheriges Profil'}
function profileOptions(){return records.map(r=>`<option value="${esc(r.id)}" ${r.id===current?'selected':''}>${esc(profileName(r))}</option>`).join('')}
function switchTo(id){if(id===current)return;if(!records.some(p=>p.id===id))return;try{if(typeof lock==='function')lock()}catch{}localStorage.setItem(ACTIVE,id);location.reload()}
function currentLabel(){return profileName(records.find(p=>p.id===current)||records[0])}
function displayRecovery(code){dialog('Wiederherstellungsschlüssel sichern',`<p><strong>Diesen Schlüssel unbedingt außerhalb des iPhones sicher aufbewahren.</strong> Ohne Passwort UND diesen Schlüssel sind die verschlüsselten Daten nicht wiederherstellbar. Die E-Mail-Adresse allein reicht nicht aus.</p><textarea id="wmpRecoveryCode" readonly rows="3" spellcheck="false">${esc(code)}</textarea><div class="wmp-actions"><button type="button" id="wmpCopyCode">Schlüssel kopieren</button><button type="button" id="wmpAcknowledge" class="wmp-secondary">Ich habe den Schlüssel gesichert</button></div>`,()=>{});$('wmpCopyCode').onclick=async()=>{try{await navigator.clipboard.writeText(code)}catch{const t=$('wmpRecoveryCode');t.focus();t.select();document.execCommand('copy')}};$('wmpAcknowledge').onclick=closeDialog}
function addProfile(){dialog('Neues Profil anlegen',`<p>Jedes Profil besitzt eine eigene verschlüsselte Datenbank. Die E-Mail ist eine lokale Kennung, kein Online-Konto.</p><form><label>E-Mail-Adresse<input name="email" type="email" autocomplete="email" required></label><label>Passwort (mindestens 10 Zeichen)<input name="password" type="password" autocomplete="new-password" minlength="10" required></label><label>Passwort wiederholen<input name="confirm" type="password" autocomplete="new-password" minlength="10" required></label><button type="submit">Profil erstellen</button></form>`,async f=>{
  const email=text(f.get('email')).trim().toLowerCase(),pass=text(f.get('password'));
  if(!isEmail(email))throw Error('Gültige E-Mail-Adresse eingeben.');if(pass.length<10||pass!==f.get('confirm'))throw Error('Passwort muss mindestens 10 Zeichen haben und zweimal übereinstimmen.');if(records.some(p=>text(p.email).toLowerCase()===email))throw Error('Die E-Mail-Adresse wird bereits verwendet.');
  const uid=uuid(),recovery=genRecovery();await newDB(PREFIX+uid,pass,recovery);records.push({id:uid,email,label:email});updateRegistry(records);renderProfileControls();displayRecovery(recovery);
});}
function configureEmail(){dialog('E-Mail für dieses Profil',`<p>Diese Adresse wird nur auf diesem Gerät zur Auswahl angezeigt; sie ist nicht verschlüsselt und erhält keine E-Mails.</p><form><label>E-Mail-Adresse<input name="email" type="email" value="${esc(records.find(p=>p.id===current)?.email||'')}" required></label><button type="submit">Speichern</button></form>`,async f=>{const email=text(f.get('email')).trim().toLowerCase();if(!isEmail(email))throw Error('E-Mail-Adresse ungültig.');if(records.some(p=>p.id!==current&&text(p.email).toLowerCase()===email))throw Error('Diese E-Mail-Adresse wird bereits verwendet.');records=records.map(p=>p.id===current?{...p,email,label:email}:p);updateRegistry(records);renderProfileControls();closeDialog()})}
function activateRecovery(){dialog('Wiederherstellung aktivieren',`<p>Bestätige dein aktuelles Passwort. Anschließend wird einmalig ein neuer Wiederherstellungsschlüssel angezeigt.</p><form><label>Aktuelles Passwort<input name="password" type="password" required></label><button type="submit">Schlüssel erzeugen</button></form>`,async f=>{const pass=text(f.get('password')),storedSalt=await kvGet('salt'),payload=await kvGet('payload');if(!storedSalt||!payload)throw Error('Bitte das Profil zuerst entsperren und speichern.');try{const key=await keyFrom(pass,from64(storedSalt));await decrypt(payload,key)}catch{throw Error('Aktuelles Passwort falsch.')}const recovery=genRecovery();await kvSet('recovery',await envelope(pass,recovery));displayRecovery(recovery)})}
function resetPassword(){dialog('Passwort zurücksetzen',`<p>Offline-Wiederherstellung mit deinem persönlichen Schlüssel. Ein E-Mail-Link ist in dieser lokalen App nicht verfügbar.</p><form><label>Wiederherstellungsschlüssel<input name="recovery" spellcheck="false" autocomplete="off" required></label><label>Neues Passwort (mindestens 10 Zeichen)<input name="password" type="password" autocomplete="new-password" minlength="10" required></label><label>Neues Passwort wiederholen<input name="confirm" type="password" autocomplete="new-password" minlength="10" required></label><button type="submit">Passwort ändern</button></form>`,async f=>{
  const recovery=text(f.get('recovery')).trim(),newPass=text(f.get('password'));
  if(newPass.length<10||newPass!==f.get('confirm'))throw Error('Neue Passwörter stimmen nicht überein oder sind zu kurz.');
  const env=await kvGet('recovery');if(!env)throw Error('Für dieses Profil wurde noch kein Wiederherstellungsschlüssel aktiviert. Nur ein bekanntes Passwort oder eine zuvor erstellte Sicherung kann die Daten öffnen.');
  let oldPass;try{oldPass=await unwrap(env,recovery)}catch{throw Error('Wiederherstellungsschlüssel ungültig.')}
  const oldSalt=await kvGet('salt'),payload=await kvGet('payload');if(!oldSalt||!payload)throw Error('Verschlüsselte Profildaten fehlen.');
  const oldKey=await keyFrom(oldPass,from64(oldSalt));let plain;
  try{plain=await decrypt(payload,oldKey)}catch{throw Error('Wiederherstellung fehlgeschlagen: Daten beschädigt oder Passwort ungültig.')}
  const salt=bytes(16),newKey=await keyFrom(newPass,salt),newPayload={...await encrypt(plain,newKey),updatedAt:new Date().toISOString()};
  const sourceFiles=await allFiles(),converted=[];
  for(const [fileKey,entry] of sourceFiles){const iv=from64(entry.iv);const oldCipher=entry.cipher;const filePlain=await crypto.subtle.decrypt({name:'AES-GCM',iv},oldKey,oldCipher);const newIv=bytes(12);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:newIv},newKey,filePlain);converted.push([fileKey,{...entry,iv:base64(newIv),cipher}]);}
  const newRecovery=await envelope(newPass,recovery);
  await new Promise((res,rej)=>{const tx=getDb().transaction(['kv','files'],'readwrite'),kv=tx.objectStore('kv'),files=tx.objectStore('files');kv.put(base64(salt),'salt');kv.put(newPayload,'payload');kv.put(newRecovery,'recovery');for(const [key,row]of converted)files.put(row,key);tx.oncomplete=res;tx.onabort=()=>rej(tx.error||Error('Änderung abgebrochen'));tx.onerror=()=>rej(tx.error)});
  closeDialog();alert('Passwort geändert. Bitte mit dem neuen Passwort entsperren. Den Wiederherstellungsschlüssel weiter sicher aufbewahren.');location.reload();
});}
function renderProfileControls(){const sel=$('wmpSelect');if(sel)sel.innerHTML=profileOptions();const status=$('wmpCurrentName');if(status)status.textContent=currentLabel();}
function styles(){const el=document.createElement('style');el.textContent=`
.wmp-bar{margin:12px 0;padding:11px;border:1px solid var(--line,#dfe7ef);background:var(--card,#fff);border-radius:12px;font-size:13px}.wmp-bar strong{display:block;margin-bottom:7px;color:var(--ink,#082f4c)}.wmp-bar select{width:100%;max-width:100%;min-height:40px;font-size:15px;border:1px solid #a2b5c5;border-radius:8px;padding:6px;background:white;color:#142c3d}.wmp-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.wmp-actions button,.wmp-dialog button{border:0;border-radius:8px;background:var(--accent2,#087d79);color:white;padding:10px 12px;font-size:13px;font-weight:650}.wmp-actions .wmp-secondary,.wmp-dialog .wmp-secondary{color:var(--ink,#082f4c);background:#ecf2f7}.wmp-overlay[hidden]{display:none!important}.wmp-overlay{position:fixed;inset:0;z-index:100000;background:#03121bd9;display:flex;align-items:center;justify-content:center;padding:15px;overflow:auto}.wmp-dialog{width:min(100%,490px);max-height:95vh;overflow:auto;background:white;color:#152c3e;border-radius:17px;padding:18px;box-shadow:0 10px 40px #0006}.wmp-dialog-top{display:flex;justify-content:space-between;align-items:center;gap:8px}.wmp-dialog h3{font-size:18px}.wmp-dialog form,.wmp-dialog label{display:flex;flex-direction:column;gap:6px}.wmp-dialog form{gap:12px}.wmp-dialog input,.wmp-dialog textarea{width:100%;box-sizing:border-box;padding:11px;border:1px solid #bccbd5;border-radius:8px;font:16px system-ui;color:#112e46}.wmp-dialog p{line-height:1.5}.wmp-dialog-error,#wmpDialogError{color:#a61919;font-size:13px}.wmp-dialog textarea{overflow-wrap:anywhere}.wmp-small{font-size:12px;line-height:1.35;color:#647a8b}
`;document.head.appendChild(el)}
async function discoverProfiles(){
 // Recover profile IDs if the local selector registry was lost but IndexedDB still exists.
 if(typeof indexedDB.databases!=='function')return;
 try{const list=await indexedDB.databases();let changed=false;
   for(const entry of list){const name=String(entry?.name||'');if(!name.startsWith(PREFIX))continue;
     const id=name.slice(PREFIX.length);if(!/^[a-f0-9-]{16,60}$/.test(id)||records.some(p=>p.id===id))continue;
     records.push({id,email:'',label:'Wiedergefundenes Profil '+id.slice(0,8)});changed=true;
   }
   if(changed){updateRegistry(records);renderProfileControls();}
 }catch(e){console.warn('Profilsuche nicht unterstützt:',e)}
}
function mount(){styles();
 const box=document.createElement('div');box.id='wmpLoginProfiles';box.className='wmp-bar';box.innerHTML=`<strong>Profil auswählen</strong><select id="wmpSelect" aria-label="Profil auswählen">${profileOptions()}</select><div class="wmp-actions"><button type="button" id="wmpCreate">Profil anlegen</button><button type="button" id="wmpReset" class="wmp-secondary">Passwort vergessen?</button></div><span class="wmp-small">E-Mail dient nur der lokalen Zuordnung; kein E-Mail-Versand.</span>`;
 const pw=$('unlockPassword');if(pw)pw.parentElement.insertBefore(box,pw.previousElementSibling||pw);
 const header=document.querySelector('.topbar');if(header){const mgr=document.createElement('div');mgr.id='wmpManage';mgr.className='wmp-bar';mgr.innerHTML=`<strong>Aktives Profil: <span id="wmpCurrentName"></span></strong><div class="wmp-actions"><button id="wmpManageProfiles" type="button">Profile verwalten</button></div>`;header.insertAdjacentElement('afterend',mgr)}
 $('wmpSelect').addEventListener('change',e=>switchTo(e.target.value));$('wmpCreate').onclick=addProfile;$('wmpReset').onclick=resetPassword;
 $('wmpManageProfiles')?.addEventListener('click',()=>{dialog('Profile verwalten',`<p><strong>Aktuelles Profil:</strong> ${esc(currentLabel())}</p><p>Die Profildaten sind unabhängig verschlüsselt und bleiben lokal auf diesem Gerät.</p><label>Zu einem anderen Profil wechseln<select id="wmpManageSelect">${profileOptions()}</select></label><div class="wmp-actions"><button id="wmpAddNew" type="button">Neues Profil</button><button id="wmpSetEmail" type="button" class="wmp-secondary">E-Mail bearbeiten</button><button id="wmpSetRecovery" type="button" class="wmp-secondary">Wiederherstellung aktivieren / erneuern</button></div>`,()=>{});$('wmpManageSelect').onchange=e=>switchTo(e.target.value);$('wmpAddNew').onclick=addProfile;$('wmpSetEmail').onclick=configureEmail;$('wmpSetRecovery').onclick=activateRecovery;});
 renderProfileControls();discoverProfiles();console.info('WorksManager Profile '+VERSION+' aktiv, Datenbank '+(current==='primary'?'bestehendes Profil':'separates Profil'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.WorksManagerProfiles={get current(){return current},get profileCount(){return records.length}};
})();
