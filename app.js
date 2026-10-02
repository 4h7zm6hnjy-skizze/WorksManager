'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const enc = new TextEncoder();
const dec = new TextDecoder();
const APP_VERSION='1.5.1';
let state = blankState();
let cryptoKey = null;
let db = null;

function blankState(){return {version:6,company:{name:'',employeeName:'',contractStart:'',employeeNo:'',notes:'',contracts:[]},shifts:[],meetings:[],notices:[],documents:[],aus:[],childSick:[],rehabs:[],stairs:[],attachments:{company:[],shift:[],meetings:[],notices:[],family:[],rehab:[]}};}
function normalizeState(v){
  const base=blankState();
  const x=v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const rawCompany=x.company&&typeof x.company==='object'&&!Array.isArray(x.company)?x.company:{};
  x.company={...base.company,...rawCompany};
  x.company.contracts=Array.isArray(x.company.contracts)?x.company.contracts:[];
  for(const k of ['shifts','meetings','notices','documents','aus','childSick','rehabs','stairs'])x[k]=Array.isArray(x[k])?x[k]:[];
  delete x.health;
  const incomingAttachments=x.attachments&&typeof x.attachments==='object'?x.attachments:{};
  x.attachments={};
  for(const k of ['company','shift','meetings','notices','family','rehab'])x.attachments[k]=Array.isArray(incomingAttachments[k])?incomingAttachments[k]:[];
  const ensureIds=arr=>{
    const seen=new Set();
    for(const item of arr){
      if(!item||typeof item!=='object')continue;
      const old=String(item.id??'').trim();
      let next=/^[A-Za-z0-9._:-]{1,160}$/.test(old)&&!seen.has(old)?old:id();
      while(seen.has(next))next=id();
      item.id=next;seen.add(next);
    }
  };
  ensureIds(x.company.contracts);
  for(const k of ['shifts','meetings','notices','documents','aus','childSick','rehabs','stairs'])ensureIds(x[k]);
  for(const k of ['company','shift','meetings','notices','family','rehab'])ensureIds(x.attachments[k]);
  x.version=6;
  return x;
}
function id(){return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);}
function now(){return new Date().toISOString();}
function fmtDate(v){if(!v)return '—';const d=new Date(String(v).slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('de-DE');}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function inferMime(name='',mime=''){
  const current=String(mime||'').trim().toLowerCase();
  if(current&&current!=='application/octet-stream')return current;
  const n=String(name||'').toLowerCase();
  if(/\.pdf$/.test(n))return 'application/pdf';
  if(/\.(?:jpe?g|jfif)$/.test(n))return 'image/jpeg';
  if(/\.png$/.test(n))return 'image/png';
  if(/\.webp$/.test(n))return 'image/webp';
  if(/\.gif$/.test(n))return 'image/gif';
  if(/\.bmp$/.test(n))return 'image/bmp';
  if(/\.(?:heic|heif)$/.test(n))return 'image/heic';
  return current||'application/octet-stream';
}
function isImageFile(file){return !!file&&inferMime(file.name,file.type).startsWith('image/');}
function isPdfFile(file){return !!file&&inferMime(file.name,file.type)==='application/pdf';}
function isSupportedDocument(file){return isImageFile(file)||isPdfFile(file);}
function openDB(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open('WorksManagerSecure',2);
    r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv');if(!d.objectStoreNames.contains('files'))d.createObjectStore('files');};
    r.onblocked=()=>rej(new Error('Der lokale Speicher ist noch in einer älteren WorksManager-Instanz geöffnet. Bitte andere WorksManager-Tabs/Fenster schließen und erneut öffnen.'));
    r.onsuccess=()=>{const d=r.result;d.onversionchange=()=>{try{d.close();}catch{}};res(d);};
    r.onerror=()=>rej(r.error||new Error('IndexedDB konnte nicht geöffnet werden.'));
  });
}
function dbGet(k){return new Promise((res,rej)=>{const tx=db.transaction('kv','readonly');const r=tx.objectStore('kv').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function dbPut(k,v){return new Promise((res,rej)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('Speichertransaktion abgebrochen.'));});}
function dbDelete(k){return new Promise((res,rej)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').delete(k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('Speichertransaktion abgebrochen.'));});}
function dbKvKeys(){return new Promise((res,rej)=>{const tx=db.transaction('kv','readonly');const store=tx.objectStore('kv');const out=[];const req=store.openKeyCursor();req.onsuccess=()=>{const c=req.result;if(c){out.push(c.key);c.continue();}else res(out);};req.onerror=()=>rej(req.error);});}
function dbFileGet(k){return new Promise((res,rej)=>{const tx=db.transaction('files','readonly');const r=tx.objectStore('files').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function dbFilePut(k,v){return new Promise((res,rej)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('Dateispeicherung abgebrochen.'));});}
function dbFileDelete(k){return new Promise((res,rej)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('Dateilöschung abgebrochen.'));});}
function dbFileEntries(){return new Promise((res,rej)=>{const tx=db.transaction('files','readonly');const store=tx.objectStore('files');const out=[];const req=store.openCursor();req.onsuccess=()=>{const c=req.result;if(c){out.push([c.key,c.value]);c.continue();}else res(out);};req.onerror=()=>rej(req.error);});}
function dbClear(){return new Promise((res,rej)=>{const names=['kv',...(db.objectStoreNames.contains('files')?['files']:[])];const tx=db.transaction(names,'readwrite');names.forEach(n=>tx.objectStore(n).clear());tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('Löschen der lokalen Daten abgebrochen.'));});}
function dbReplaceAll(salt,payload,files=[]){return new Promise((res,rej)=>{const tx=db.transaction(['kv','files'],'readwrite'),kv=tx.objectStore('kv'),fs=tx.objectStore('files');kv.clear();fs.clear();kv.put(salt,'salt');kv.put(payload,'payload');for(const [key,value] of files)fs.put(value,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('Import abgebrochen'));});}
async function ensureCryptoKey(){if(cryptoKey)return cryptoKey;throw new Error('App ist gesperrt. Bitte einmal erneut entsperren.');}
function clearRememberedCryptoKey(){}
function b64(buf){
  const bytes=buf instanceof Uint8Array?buf:new Uint8Array(buf);
  const chunk=0x8000;
  let binary='';
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  }
  return btoa(binary);
}
function showToast(message,type='success'){
  let el=document.getElementById('wmToast');
  if(!el){el=document.createElement('div');el.id='wmToast';el.setAttribute('role','status');document.body.appendChild(el);}
  el.className=`wm-toast ${type}`;el.textContent=message;el.classList.add('show');
  clearTimeout(showToast._timer);showToast._timer=setTimeout(()=>el.classList.remove('show'),2200);
}
function showFileError(action,e){if(e?._wmAlerted)return;const msg=String(e?.message||e||'unbekannter Fehler');const quota=/quota|storage|space/i.test(`${e?.name||''} ${msg}`);alert(quota?`${action} fehlgeschlagen: Der lokale Speicher ist voll. Bitte zuerst ein Backup erstellen und nicht benötigte Dateien entfernen.`:`${action} fehlgeschlagen: ${msg}`);try{e._wmAlerted=true;}catch{}}
async function compressImageBlob(file,max=1200,q=.64){
  if(!file||!isImageFile(file))return file;
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Bild konnte nicht gelesen werden.'));i.src=url;});
    const scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));c.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    const ctx=c.getContext('2d');if(!ctx)throw new Error('Bildverarbeitung wird auf diesem Gerät nicht unterstützt.');ctx.drawImage(img,0,0,c.width,c.height);
    const blob=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Bild konnte nicht komprimiert werden.')),'image/jpeg',q));
    return blob;
  }finally{URL.revokeObjectURL(url);}
}
async function encryptFileBlob(blob,name='Datei'){
  await ensureCryptoKey();
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=await blob.arrayBuffer();
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,plain);
  return {iv:b64(iv),cipher,mime:inferMime(name,blob.type),name:name||'Datei',size:blob.size||plain.byteLength,createdAt:now()};
}
async function decryptFileBlob(rec){
  await ensureCryptoKey();
  if(!rec||!rec.iv||!rec.cipher)throw new Error('Gespeicherte Datei ist unvollständig.');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(unb64(rec.iv))},cryptoKey,rec.cipher);
  return new Blob([plain],{type:rec.mime||'application/octet-stream'});
}
function dataUrlToBlob(data){
  const m=String(data||'').match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/s);
  if(!m)throw new Error('Ungültiges altes Bildformat.');
  const mime=m[1]||'application/octet-stream';
  if(m[2]){const raw=atob(m[3]);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:mime});}
  return new Blob([decodeURIComponent(m[3])],{type:mime});
}
async function storeEncryptedBlob(fileKey,blob,name){const encrypted=await encryptFileBlob(blob,name);await dbFilePut(fileKey,encrypted);}
async function storeAuBlob(fileKey,blob,name){return storeEncryptedBlob(fileKey,blob,name);}
async function migrateDataUrlRecord(target,prefix,legacyFields=['data']){
  if(!target||target.fileKey)return false;
  const oldField=legacyFields.find(k=>target[k]);
  if(!oldField)return false;
  try{
    const blob=dataUrlToBlob(target[oldField]);
    const key=`${prefix}:${target.id||id()}`;
    await storeEncryptedBlob(key,blob,target.name||'Dokument');
    target.fileKey=key;
    target.mime=blob.type||target.mime||target.type||'application/octet-stream';
    legacyFields.forEach(k=>delete target[k]);
    return true;
  }catch(e){
    console.warn(`Alte Datei ${prefix} konnte nicht migriert werden:`,e);
    return false;
  }
}
async function migrateLegacyStoredFiles(){
  let changed=false;
  for(const a of state.aus||[])changed=(await migrateDataUrlRecord(a,'au',['data','image']))||changed;
  for(const c of state.company?.contracts||[])changed=(await migrateDataUrlRecord(c,'contract',['data']))||changed;
  for(const d of state.documents||[])changed=(await migrateDataUrlRecord(d,'doc',['data']))||changed;
  for(const [section,arr] of Object.entries(state.attachments||{})){
    for(const a of arr||[])changed=(await migrateDataUrlRecord(a,`attachment:${section}`,['data']))||changed;
  }
  for(const n of state.notices||[]){
    if(!n?.file||n.file.fileKey||!n.file.data)continue;
    try{
      const blob=dataUrlToBlob(n.file.data);
      const key=`notice:${n.id||id()}`;
      await storeEncryptedBlob(key,blob,n.file.name||n.title||'Aushang');
      n.file.fileKey=key;n.file.mime=blob.type||n.file.mime||n.file.type||'application/octet-stream';delete n.file.data;changed=true;
    }catch(e){console.warn('Altes Aushang-Dokument konnte nicht migriert werden:',e);}
  }
  if(changed)await persistStateOnly();
  return changed;
}
function referencedFileKeys(source=state){
  const keys=new Set(),add=k=>{if(k)keys.add(String(k));};
  for(const x of source.company?.contracts||[])add(x.fileKey);
  for(const n of source.notices||[])add(n.file?.fileKey);
  for(const d of source.documents||[])add(d.fileKey);
  for(const a of source.aus||[])add(a.fileKey);
  for(const arr of Object.values(source.attachments||{}))for(const x of arr||[])add(x.fileKey);
  return keys;
}
async function cleanupOrphanFiles(){
  try{const refs=referencedFileKeys();for(const [key] of await dbFileEntries()){if(!refs.has(String(key)))await dbFileDelete(key);}}catch(e){console.warn('Verwaiste Dateien konnten nicht bereinigt werden:',e);}
}
async function cleanupLegacySessionKeys(){
  try{for(const key of await dbKvKeys()){if(String(key).startsWith('session-key:'))await dbDelete(key);}}catch(e){console.warn('Alte Sitzungsschlüssel konnten nicht bereinigt werden:',e);}
}
async function getStoredFileBlob(meta){
  if(!meta)throw new Error('Datei nicht gefunden.');
  if(meta.fileKey){
    const rec=await dbFileGet(meta.fileKey);
    if(!rec)throw new Error('Die gespeicherte Datei wurde nicht gefunden.');
    let blob=await decryptFileBlob(rec);
    const name=meta.name||rec.name||'Dokument';
    const mime=inferMime(name,blob.type||meta.mime||rec.mime||'');
    if(blob.type!==mime)blob=new Blob([blob],{type:mime});
    return {blob,name,mime};
  }
  const legacy=meta.data||meta.image||'';
  if(legacy){let blob=dataUrlToBlob(legacy);const name=meta.name||'Dokument';const mime=inferMime(name,blob.type||meta.mime||'');if(blob.type!==mime)blob=new Blob([blob],{type:mime});return {blob,name,mime};}
  throw new Error('Zu diesem Eintrag ist keine Datei gespeichert.');
}
async function openStoredFile(meta,title='WorksManager Dokument'){
  try{
    const {blob,name,mime}=await getStoredFileBlob(meta);
    const url=URL.createObjectURL(blob);
    if(window._wmObjectUrl)URL.revokeObjectURL(window._wmObjectUrl);
    window._wmObjectUrl=url;
    const safeTitle=esc(title||name||'Dokument');
    const safeName=esc(name||title||'Dokument');
    if(String(mime||blob.type).startsWith('image/')){
      modal(`<div class="sheet-head"><strong>${safeTitle}</strong><button type="button" onclick="closeModal()">✕</button></div><img src="${url}" alt="${safeTitle}" style="display:block;max-width:100%;height:auto;margin:12px auto;border-radius:12px">`);
    }else if(String(mime||blob.type)==='application/pdf'){
      modal(`<div class="sheet-head"><strong>${safeTitle}</strong><button type="button" onclick="closeModal()">✕</button></div><iframe class="doc-frame" src="${url}" title="${safeTitle}"></iframe><p><a href="${url}" download="${safeName}" target="_blank" rel="noopener">PDF öffnen / speichern</a></p>`);
    }else{
      modal(`<div class="sheet-head"><strong>${safeTitle}</strong><button type="button" onclick="closeModal()">✕</button></div><p>Diese Datei kann nicht direkt angezeigt werden.</p><p><a href="${url}" download="${safeName}" target="_blank" rel="noopener">Datei öffnen / speichern</a></p>`);
    }
  }catch(e){console.error('Datei öffnen fehlgeschlagen:',e);alert('Die Datei konnte nicht geöffnet werden: '+(e?.message||e));}
}
function unb64(s){const x=atob(s);const a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a.buffer;}
async function deriveKey(password,salt){const base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encryptState(){await ensureCryptoKey();const iv=crypto.getRandomValues(new Uint8Array(12));const plain=enc.encode(JSON.stringify(state));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,plain);return {iv:b64(iv),cipher:b64(cipher),updatedAt:now()};}
async function decryptPayload(payload,key){const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(unb64(payload.iv))},key,unb64(payload.cipher));return JSON.parse(dec.decode(plain));}
async function persistStateOnly(){
  await ensureCryptoKey();
  const payload=await encryptState();
  await dbPut('payload',payload);
  return true;
}
async function save(successMessage='Gespeichert'){
  try{
    await ensureCryptoKey();
    await persistStateOnly();
  }catch(e){
    console.error('WorksManager Speichern fehlgeschlagen:',e);
    try{
      if(cryptoKey){const stored=await dbGet('payload');if(stored)state=normalizeState(await decryptPayload(stored,cryptoKey));}
    }catch(restoreError){console.error('Rollback fehlgeschlagen:',restoreError);}
    const quota=(e&&(/quota/i.test(e.name||'')||/quota|storage|space/i.test(e.message||'')));
    const locked=/gesperrt/i.test(String(e?.message||''));
    try{renderAll();}catch(renderError){console.error('Rollback-Anzeige fehlgeschlagen:',renderError);}
    alert(quota?'Speichern fehlgeschlagen: Der lokale Gerätespeicher für WorksManager ist voll. Bitte zuerst ein verschlüsseltes Backup erstellen und nicht benötigte große Dokumente entfernen.':locked?'Die App-Sitzung ist nicht mehr entsperrt. Bitte WorksManager erneut entsperren und den Vorgang wiederholen.':'Speichern fehlgeschlagen. Technischer Hinweis: '+(e?.message||e));
    try{e._wmAlerted=true;}catch{}
    throw e;
  }
  renderAll();
  if(successMessage)showToast(successMessage);
  return true;
}


async function unlock(){
  const pass=$('#unlockPassword').value;
  if(!pass){$('#unlockHint').textContent='Bitte Passwort eingeben.';return;}
  try{
    let saltB64=await dbGet('salt');
    if(!saltB64){const salt=crypto.getRandomValues(new Uint8Array(16));saltB64=b64(salt);await dbPut('salt',saltB64);}
    const candidateKey=await deriveKey(pass,new Uint8Array(unb64(saltB64)));
    const payload=await dbGet('payload');
    const loaded=payload?normalizeState(await decryptPayload(payload,candidateKey)):blankState();
    cryptoKey=candidateKey;state=loaded;
    if(!payload)await persistStateOnly();
  }catch(e){
    console.error('Entsperren fehlgeschlagen:',e);
    cryptoKey=null;clearRememberedCryptoKey();
    $('#app').classList.add('hidden');$('#unlock').classList.remove('hidden');
    $('#unlockHint').textContent='Passwort falsch oder Daten beschädigt.';return;
  }
  $('#unlockHint').textContent='Daten werden vorbereitet …';
  let maintenanceWarning=false;
  try{
    await cleanupLegacySessionKeys();
    await migrateLegacyStoredFiles();
    // Normalisierte IDs und Datenstruktur immer dauerhaft speichern. So bleiben auch alte
    // Einträge nach einem Neustart eindeutig lösch- und auffindbar.
    await persistStateOnly();
    await cleanupOrphanFiles();
  }catch(e){maintenanceWarning=true;console.error('Dateimigration/Bereinigung fehlgeschlagen:',e);}
  $('#unlock').classList.add('hidden');$('#app').classList.remove('hidden');$('#unlockPassword').value='';$('#unlockHint').textContent='';
  renderAll();resetViewportPosition();setTimeout(resetViewportPosition,60);
  if(maintenanceWarning)showToast('Alte Dateien konnten teilweise nicht optimiert werden.','error');
}
function lock(){clearRememberedCryptoKey();cryptoKey=null;state=blankState();closeModal();$('#moreMenu').classList.add('hidden');$('#app').classList.add('hidden');$('#unlock').classList.remove('hidden');}

function resetViewportPosition(){
  try{document.documentElement.scrollLeft=0;document.body.scrollLeft=0;window.scrollTo({top:0,left:0,behavior:'auto'});}catch{}
}
function go(name){$$('.page').forEach(p=>p.classList.toggle('active',p.id===name));$$('.nav-btn[data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===name));$('#moreMenu').classList.add('hidden');window.scrollTo({top:0,left:0,behavior:'smooth'});}

function renderAll(){
  const renderers=[['Dashboard',renderDashboard],['Firma',renderCompany],['Schichten',renderShifts],['Gespräche',renderMeetings],['Aushänge',renderNotices],['Dokumente',renderDocs],['AU',renderAUs],['Kind krank',renderChild],['Reha',renderRehab],['Treppen',renderStairs],['Anhänge',renderAttachments],['Jahresbericht',renderAnnualReport]];
  const errors=[];
  for(const [name,fn] of renderers){try{fn();}catch(e){errors.push(name);console.error(`Renderfehler in ${name}:`,e);}}
  if(errors.length)showToast(`Anzeigeproblem: ${errors.join(', ')}`,'error');
}

function renderDashboard(){const auDays=countUniqueRangeDays(state.aus);const extraDocs=Object.values(state.attachments||{}).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);$('#statAuDays').textContent=auDays;$('#statAuCases').textContent=state.aus.length;$('#statChildCases').textContent=state.childSick.length;$('#statShifts').textContent=state.shifts.length;$('#statDocs').textContent=state.documents.length+state.company.contracts.length+state.notices.filter(n=>n.file).length+extraDocs;$('#welcomeText').textContent=state.company.employeeName?`${state.company.employeeName}${state.company.name?' · '+state.company.name:''}`:'Noch kein Mitarbeitername hinterlegt.';const today=localDateValue();const stairsToday=(state.stairs||[]).filter(x=>x.date===today).reduce((n,x)=>n+(Number(x.count)||0),0);const stairStat=$('#statStairsToday');if(stairStat)stairStat.textContent=stairsToday;}
function renderCompany(){const c=state.company;$('#companyName').value=c.name||'';$('#employeeName').value=c.employeeName||'';$('#contractStart').value=c.contractStart||'';$('#employeeNo').value=c.employeeNo||'';$('#companyNotes').value=c.notes||'';$('#contractList').innerHTML=(c.contracts||[]).map(x=>itemHtml('Arbeitsvertrag',esc(x.name||'Dokument'),x.createdAt,[`<button onclick="viewDoc('${x.id}','contract')">Öffnen</button>`,`<button onclick="delContract('${x.id}')">Löschen</button>`])).join('')||empty('Noch kein Arbeitsvertrag gespeichert.');}
function renderShifts(){const arr=[...state.shifts].sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#shiftList').innerHTML=arr.map(s=>itemHtml(`${fmtDate(s.date)} · ${esc(s.shift||'Schicht')}`,`${esc(s.start||'—')}–${esc(s.end||'—')}${s.note?' · '+esc(s.note):''}`,s.createdAt,[`<button onclick="delShift('${s.id}')">Löschen</button>`])).join('')||empty('Noch keine Schichten gespeichert.');}
function renderMeetings(){const arr=[...state.meetings].sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#meetingList').innerHTML=arr.map(m=>itemHtml(`${esc(m.type)} · ${fmtDate(m.date)}`,`${esc(m.time||'')} ${esc(m.partner||'')}${m.place?' · '+esc(m.place):''}${m.note?' · '+esc(m.note):''}`,m.createdAt,[`<button onclick="delMeeting('${m.id}')">Löschen</button>`])).join('')||empty('Noch keine Einträge.');}
function renderNotices(){const arr=[...state.notices].sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#noticeList').innerHTML=arr.map(n=>itemHtml(`${esc(n.type)} · ${esc(n.title||'Aushang')}`,`${fmtDate(n.date)}${n.note?' · '+esc(n.note):''}`,n.createdAt,[n.file?`<button onclick="viewDoc('${n.id}','notice')">Dokument</button>`:'',`<button onclick="delNotice('${n.id}')">Löschen</button>`])).join('')||empty('Noch keine Aushänge.');}
function renderDocs(){
  const arr=[...state.documents].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  $('#payrollList').innerHTML=arr.map(d=>{const label=d.type==='payroll'?'Lohnabrechnung':d.type==='stamp'?'Stempelübersicht':'Arbeitsplan';return itemHtml(`${label}${d.month?' · '+esc(d.month):''}`,esc(d.name||'Dokument gespeichert'),d.createdAt,[`<button onclick="viewDoc('${d.id}','doc')">Öffnen</button>`,`<button onclick="delDoc('${d.id}')">Löschen</button>`]);}).join('')||empty('Noch keine Abrechnungen, Stempelübersichten oder Arbeitspläne gespeichert.');
}
function auDates(item){
  const from=String(item?.from||item?.to||'').slice(0,10);
  const to=String(item?.to||item?.from||'').slice(0,10);
  return {from,to};
}
function isoDayNumber(v){
  const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  const t=Date.UTC(y,mo-1,d),x=new Date(t);
  if(x.getUTCFullYear()!==y||x.getUTCMonth()!==mo-1||x.getUTCDate()!==d)return null;
  return Math.floor(t/86400000);
}
function daysInPeriod(from,to,start,end){
  const f=isoDayNumber(from),t=isoDayNumber(to),s=isoDayNumber(start),e=isoDayNumber(end);
  if([f,t,s,e].some(v=>v===null))return 0;
  const lo=Math.max(Math.min(f,t),s),hi=Math.min(Math.max(f,t),e);
  return hi>=lo?hi-lo+1:0;
}
function auOverlapsPeriod(item,start,end){
  const {from,to}=auDates(item);return daysInPeriod(from,to,start,end)>0;
}
function monthBounds(key){
  if(!/^\d{4}-\d{2}$/.test(key||''))return null;
  const [y,m]=key.split('-').map(Number);if(m<1||m>12)return null;
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  return {start:`${y}-${String(m).padStart(2,'0')}-01`,end:`${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`};
}
function yearBounds(year){const y=String(year||'');return /^\d{4}$/.test(y)?{start:`${y}-01-01`,end:`${y}-12-31`}:null;}
function countUniqueRangeDays(items,start='',end=''){
  const clampStart=start?isoDayNumber(start):null,clampEnd=end?isoDayNumber(end):null,ranges=[];
  for(const item of items||[]){
    const d=auDates(item),a=isoDayNumber(d.from),b=isoDayNumber(d.to);if(a===null||b===null)continue;
    let lo=Math.min(a,b),hi=Math.max(a,b);
    if(clampStart!==null)lo=Math.max(lo,clampStart);if(clampEnd!==null)hi=Math.min(hi,clampEnd);
    if(hi>=lo)ranges.push([lo,hi]);
  }
  ranges.sort((x,y)=>x[0]-y[0]);let total=0,lo=null,hi=null;
  for(const [a,b] of ranges){if(lo===null){lo=a;hi=b;continue;}if(a<=hi+1){hi=Math.max(hi,b);}else{total+=hi-lo+1;lo=a;hi=b;}}
  if(lo!==null)total+=hi-lo+1;return total;
}
function auStatsForPeriod(items,start,end){
  const rows=items.filter(x=>auOverlapsPeriod(x,start,end));
  return {cases:rows.length,days:countUniqueRangeDays(rows,start,end)};
}
function renderAUs(){
  // IDs werden bei älteren Datensätzen beim Laden ergänzt. Die Liste behält zusätzlich
  // den Originalindex als Fallback, damit auch alte Einträge zuverlässig löschbar sind.
  const arr=state.aus.map((a,index)=>({a,index})).sort((x,y)=>(y.a.from||y.a.to||y.a.createdAt||'').localeCompare(x.a.from||x.a.to||x.a.createdAt||''));
  const records=arr.map(x=>x.a);
  const allDays=countUniqueRangeDays(records);
  $('#statAuDays').textContent=allDays;$('#statAuCases').textContent=records.length;

  const today=localDateValue(),currentMonth=today.slice(0,7),currentYear=today.slice(0,4);
  const monthEl=$('#auStatsMonth'),yearEl=$('#auStatsYear');
  if(monthEl&&!monthEl.value)monthEl.value=currentMonth;
  const years=new Set([currentYear]);
  records.forEach(a=>{const d=auDates(a);if(/^\d{4}/.test(d.from))years.add(d.from.slice(0,4));if(/^\d{4}/.test(d.to))years.add(d.to.slice(0,4));});
  const yearValues=[...years].sort().reverse();
  const keepYear=yearEl?.value||currentYear;
  if(yearEl){yearEl.innerHTML=yearValues.map(y=>`<option value="${y}">${y}</option>`).join('');yearEl.value=yearValues.includes(keepYear)?keepYear:currentYear;}
  const month=monthEl?.value||currentMonth,year=yearEl?.value||currentYear;
  const mb=monthBounds(month),yb=yearBounds(year);
  const ms=mb?auStatsForPeriod(records,mb.start,mb.end):{cases:0,days:0};
  const ys=yb?auStatsForPeriod(records,yb.start,yb.end):{cases:0,days:0};
  if($('#auMonthCases'))$('#auMonthCases').textContent=ms.cases;
  if($('#auMonthDays'))$('#auMonthDays').textContent=ms.days;
  if($('#auYearCases'))$('#auYearCases').textContent=ys.cases;
  if($('#auYearDays'))$('#auYearDays').textContent=ys.days;
  if($('#auStatsYearLabel'))$('#auStatsYearLabel').textContent=year;

  if($('#auMonthlyStats'))$('#auMonthlyStats').innerHTML=Array.from({length:12},(_,i)=>{
    const key=`${year}-${String(i+1).padStart(2,'0')}`,b=monthBounds(key),st=auStatsForPeriod(records,b.start,b.end);
    return `<div class="item"><div class="item-top"><div><div class="item-title">${esc(monthLabel(key))}</div><div class="item-meta">${st.cases} Krankschreibung${st.cases===1?'':'en'}</div></div><strong>${st.days} Tage</strong></div></div>`;
  }).join('');

  const list=$('#auList');
  list.innerHTML=arr.map(({a,index})=>{
    const d=auDates(a),hasDates=d.from&&d.to;
    const title=hasDates?(d.from===d.to?fmtDate(d.from):`${fmtDate(d.from)}–${fmtDate(d.to)}`):'Krankschreibung ohne Datumsangabe';
    const meta=a.name?esc(a.name):'Foto gespeichert';
    const key=esc(String(a.id||''));
    return itemHtml(title,meta,a.createdAt,[(a.fileKey||a.data||a.image)?`<button type="button" data-au-view="${key}" data-au-index="${index}">Foto ansehen</button>`:'',`<button type="button" data-au-delete="${key}" data-au-index="${index}">Löschen</button>`]);
  }).join('')||empty('Noch keine Krankschreibung gespeichert.');

  list.querySelectorAll('[data-au-view]').forEach(btn=>btn.addEventListener('click',()=>viewAuRecord(btn.dataset.auView,btn.dataset.auIndex)));
  list.querySelectorAll('[data-au-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteAuRecord(btn.dataset.auDelete,btn.dataset.auIndex)));
}
function localDateValue(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function localTimeValue(d=new Date()){return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function monthLabel(key){if(!/^\d{4}-\d{2}$/.test(key||''))return key||'';const [y,m]=key.split('-');return new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(Number(y),Number(m)-1,1));}
function stairStats(items){const total=items.reduce((n,x)=>n+(Number(x.count)||0),0);const days=new Set(items.map(x=>x.date).filter(Boolean)).size;return {total,entries:items.length,days,avg:days?Math.round((total/days)*10)/10:0};}
function renderStairs(){
  state.stairs=Array.isArray(state.stairs)?state.stairs:[];
  const dateEl=$('#stairDate'),timeEl=$('#stairTime');
  if(dateEl&&!dateEl.value)dateEl.value=localDateValue();
  if(timeEl&&!timeEl.value)timeEl.value=localTimeValue();
  const today=localDateValue(),month=today.slice(0,7),year=today.slice(0,4);
  const dayItems=state.stairs.filter(x=>x.date===today),monthItems=state.stairs.filter(x=>(x.date||'').startsWith(month)),yearItems=state.stairs.filter(x=>(x.date||'').startsWith(year));
  if($('#stairsToday'))$('#stairsToday').textContent=stairStats(dayItems).total;
  if($('#stairsMonth'))$('#stairsMonth').textContent=stairStats(monthItems).total;
  if($('#stairsYear'))$('#stairsYear').textContent=stairStats(yearItems).total;

  const monthly={};for(const x of state.stairs){const k=(x.date||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(k))(monthly[k]??=[]).push(x);}
  const monthlyRows=Object.keys(monthly).sort().reverse();
  if($('#stairsMonthlyStats'))$('#stairsMonthlyStats').innerHTML=monthlyRows.map(k=>{const s=stairStats(monthly[k]);return `<div class="item"><div class="item-top"><div><div class="item-title">${esc(monthLabel(k))}</div><div class="item-meta">${s.entries} Einträge · ${s.days} aktive Tage · Ø ${String(s.avg).replace('.',',')} pro Tag</div></div><strong>${s.total}</strong></div></div>`;}).join('')||empty('Noch keine Monatsdaten.');

  const yearly={};for(const x of state.stairs){const k=(x.date||'').slice(0,4);if(/^\d{4}$/.test(k))(yearly[k]??=[]).push(x);}
  const yearlyRows=Object.keys(yearly).sort().reverse();
  if($('#stairsYearlyStats'))$('#stairsYearlyStats').innerHTML=yearlyRows.map(k=>{const s=stairStats(yearly[k]);return `<div class="item"><div class="item-top"><div><div class="item-title">${esc(k)}</div><div class="item-meta">${s.entries} Einträge · ${s.days} aktive Tage · Ø ${String(s.avg).replace('.',',')} pro Tag</div></div><strong>${s.total}</strong></div></div>`;}).join('')||empty('Noch keine Jahresdaten.');

  const rows=[...state.stairs].sort((a,b)=>`${b.date||''} ${b.time||''}`.localeCompare(`${a.date||''} ${a.time||''}`));
  if($('#stairEntryList'))$('#stairEntryList').innerHTML=rows.map(x=>itemHtml(`${fmtDate(x.date)} · ${esc(x.time||'—')} · ${Number(x.count)||0} Treppen`,x.reason?esc(x.reason):'Kein Grund angegeben',x.createdAt,[`<button onclick="delStairEntry('${x.id}')">Löschen</button>`])).join('')||empty('Noch keine Treppen eingetragen.');
}
async function saveStairEntry(){
  const date=$('#stairDate')?.value||'',time=$('#stairTime')?.value||'',count=Math.floor(Number($('#stairCount')?.value||0)),reason=$('#stairReason')?.value.trim()||'';
  if(!date)return alert('Bitte ein Datum auswählen.');
  if(!time)return alert('Bitte eine Uhrzeit auswählen.');
  if(!Number.isFinite(count)||count<1)return alert('Bitte eine Anzahl ab 1 eintragen.');
  state.stairs.push({id:id(),date,time,count,reason,createdAt:now()});
  await save('Treppen gespeichert');
  $('#stairCount').value='';$('#stairReason').value='';$('#stairDate').value=localDateValue();$('#stairTime').value=localTimeValue();
}
window.delStairEntry=ident=>runAction(async()=>{if(confirm('Treppeneintrag löschen?'))await deleteById('stairs',ident,'Treppeneintrag gelöscht');},'Treppeneintrag löschen')();

function renderChild(){const arr=[...state.childSick].sort((a,b)=>(b.from||'').localeCompare(a.from||''));$('#childList').innerHTML=arr.map(x=>itemHtml(`${esc(x.child||'Kind')} · ${fmtDate(x.from)}–${fmtDate(x.to)}`,esc(x.note||''),x.createdAt,[`<button onclick="delChild('${x.id}')">Löschen</button>`])).join('')||empty('Noch keine Einträge.');}
function renderRehab(){const arr=[...state.rehabs].sort((a,b)=>(b.from||'').localeCompare(a.from||''));$('#rehabList').innerHTML=arr.map(x=>itemHtml(`${esc(x.status)} · ${esc(x.clinic||'Reha')}`,`${fmtDate(x.from)}–${fmtDate(x.to)}${x.note?' · '+esc(x.note):''}`,x.createdAt,[`<button onclick="delRehab('${x.id}')">Löschen</button>`])).join('')||empty('Noch keine Reha-Einträge.');}
const attachmentUi={company:'companyPhotoList',shift:'shiftPhotoList',meetings:'meetingPhotoList',notices:'noticePhotoList',family:'familyPhotoList',rehab:'rehabPhotoList'};
function renderAttachments(){for(const [section,listId] of Object.entries(attachmentUi)){const el=$('#'+listId);if(!el)continue;const arr=[...(state.attachments?.[section]||[])].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));el.innerHTML=arr.map(x=>itemHtml(esc(x.name||'Foto / Dokument'),'Nur gespeichert · keine Analyse',x.createdAt,[`<button onclick="viewAttachment('${section}','${x.id}')">Öffnen</button>`,`<button onclick="delAttachment('${section}','${x.id}')">Löschen</button>`])).join('')||empty('Noch keine Fotos oder Dokumente gespeichert.');}}
async function saveGenericAttachment(section,inputId){
  const input=$('#'+inputId),f=input?.files?.[0];if(!f){alert('Bitte zuerst ein Foto oder eine Datei auswählen.');return;}if(!isSupportedDocument(f)){alert('Bitte ein Foto oder eine PDF-Datei auswählen.');return;}
  const recordId=id(),fileKey=`attachment:${section}:${recordId}`;
  try{
    await storeEncryptedBlob(fileKey,f,f.name||'Foto / Dokument');
    if(!state.attachments[section])state.attachments[section]=[];
    state.attachments[section].push({id:recordId,name:f.name||'Foto / Dokument',mime:f.type||'',fileKey,createdAt:now()});
    await save('Foto / Dokument gespeichert');input.value='';
  }catch(e){await dbFileDelete(fileKey).catch(()=>{});console.error('Anhang speichern fehlgeschlagen:',e);showFileError('Foto / Dokument speichern',e);}
}
window.viewAttachment=async(section,ident)=>{const obj=(state.attachments?.[section]||[]).find(x=>x.id===ident);if(!obj){alert('Datei nicht gefunden.');return;}await openStoredFile(obj,obj.name||'WorksManager Dokument');};
window.delAttachment=async(section,ident)=>{
  if(!confirm('Foto / Dokument löschen?'))return;
  const arr=state.attachments?.[section]||[],obj=arr.find(x=>x.id===ident);if(!obj){alert('Der Eintrag konnte nicht gefunden werden.');return;}
  state.attachments[section]=arr.filter(x=>x.id!==ident);
  try{await save('Foto / Dokument gelöscht');if(obj.fileKey)await dbFileDelete(obj.fileKey).catch(()=>{});}catch(e){console.error('Anhang löschen fehlgeschlagen:',e);}
};

function itemHtml(title,meta,created,actions=[]){return `<div class="item"><div class="item-top"><div><div class="item-title">${title}</div><div class="item-meta">${meta||''}</div></div></div><div class="item-actions">${actions.filter(Boolean).join('')}</div></div>`;}
function empty(t){return `<div class="muted">${esc(t)}</div>`;}

function modal(html){$('#modalCard').innerHTML=html;$('#modal').classList.remove('hidden');}
function closeModal(){if(window._wmObjectUrl){URL.revokeObjectURL(window._wmObjectUrl);window._wmObjectUrl='';}$('#modal').classList.add('hidden');}

async function saveCompany(){state.company={...state.company,name:$('#companyName').value.trim(),employeeName:$('#employeeName').value.trim(),contractStart:$('#contractStart').value,employeeNo:$('#employeeNo').value.trim(),notes:$('#companyNotes').value.trim()};await save();}
async function saveContractFile(){
  const input=$('#contractFile'),f=input?.files?.[0];if(!f){alert('Bitte zuerst ein Foto oder eine Datei auswählen.');return;}if(!isSupportedDocument(f)){alert('Bitte ein Foto oder eine PDF-Datei auswählen.');return;}
  const recordId=id(),fileKey=`contract:${recordId}`;
  try{
    await storeEncryptedBlob(fileKey,f,f.name||'Arbeitsvertrag');
    state.company.contracts.push({id:recordId,name:f.name||'Arbeitsvertrag',mime:f.type||'',fileKey,createdAt:now()});
    await save('Arbeitsvertrag gespeichert');input.value='';
  }catch(e){await dbFileDelete(fileKey).catch(()=>{});console.error('Arbeitsvertrag speichern fehlgeschlagen:',e);showFileError('Arbeitsvertrag speichern',e);}
}
window.viewDoc=async(ident,type)=>{
  let obj=null,title='WorksManager Dokument';
  if(type==='contract'){obj=(state.company.contracts||[]).find(x=>x.id===ident);title=obj?.name||'Arbeitsvertrag';}
  else if(type==='notice'){const n=(state.notices||[]).find(x=>x.id===ident);obj=n?.file||null;title=obj?.name||n?.title||'Aushang';}
  else if(type==='doc'){obj=(state.documents||[]).find(x=>x.id===ident);title=obj?.name||'Dokument';}
  else if(type==='au'){obj=(state.aus||[]).find(x=>x.id===ident);title=obj?.name||'Krankschreibung';}
  if(!obj){alert('Der Eintrag konnte nicht gefunden werden.');return;}
  await openStoredFile(obj,title);
};
async function deleteById(listName,ident,message){
  const list=state[listName];
  if(!Array.isArray(list))return;
  const before=list.length;
  state[listName]=list.filter(x=>x.id!==ident);
  if(state[listName].length===before){alert('Der Eintrag konnte nicht gefunden werden. Bitte die App einmal neu öffnen und erneut versuchen.');return;}
  await save(message);
}
window.delContract=async ident=>{
  if(!confirm('Arbeitsvertrag wirklich löschen?'))return;const obj=(state.company.contracts||[]).find(x=>x.id===ident);if(!obj){alert('Der Eintrag konnte nicht gefunden werden.');return;}
  state.company.contracts=state.company.contracts.filter(x=>x.id!==ident);try{await save('Arbeitsvertrag gelöscht');if(obj.fileKey)await dbFileDelete(obj.fileKey).catch(()=>{});}catch(e){}
};
window.delShift=ident=>runAction(async()=>{if(confirm('Schichteintrag wirklich löschen?'))await deleteById('shifts',ident,'Schicht gelöscht');},'Schicht löschen')();
window.delMeeting=ident=>runAction(async()=>{if(confirm('Gesprächseintrag wirklich löschen?'))await deleteById('meetings',ident,'Eintrag gelöscht');},'Gespräch löschen')();
window.delNotice=async ident=>{
  if(!confirm('Aushang wirklich löschen?'))return;const obj=(state.notices||[]).find(x=>x.id===ident);if(!obj){alert('Der Eintrag konnte nicht gefunden werden.');return;}
  state.notices=state.notices.filter(x=>x.id!==ident);try{await save('Aushang gelöscht');if(obj.file?.fileKey)await dbFileDelete(obj.file.fileKey).catch(()=>{});}catch(e){}
};
window.delDoc=async ident=>{
  if(!confirm('Dokument wirklich löschen?'))return;const obj=(state.documents||[]).find(x=>x.id===ident);if(!obj){alert('Der Eintrag konnte nicht gefunden werden.');return;}
  state.documents=state.documents.filter(x=>x.id!==ident);try{await save('Dokument gelöscht');if(obj.fileKey)await dbFileDelete(obj.fileKey).catch(()=>{});}catch(e){}
};
function findAuRecordIndex(ident,indexFallback){
  const key=String(ident??'');
  let i=key?state.aus.findIndex(x=>String(x?.id??'')===key):-1;
  if(i<0&&!key){const fallback=Number(indexFallback);if(Number.isInteger(fallback)&&fallback>=0&&fallback<state.aus.length)i=fallback;}
  return i;
}
async function viewAuRecord(ident,indexFallback){
  const i=findAuRecordIndex(ident,indexFallback),obj=i>=0?state.aus[i]:null;if(!obj){alert('Die Krankschreibung konnte nicht gefunden werden.');return;}
  await openStoredFile(obj,obj.name||'Krankschreibung');
}
async function deleteAuRecord(ident,indexFallback){
  if(!confirm('Krankschreibung wirklich löschen?'))return;
  const i=findAuRecordIndex(ident,indexFallback);
  if(i<0){alert('Die Krankschreibung konnte nicht gefunden werden.');return;}
  const removed=state.aus[i];
  state.aus=state.aus.filter((_,idx)=>idx!==i);
  try{
    await save('Krankschreibung gelöscht');
    if(removed?.fileKey)await dbFileDelete(removed.fileKey).catch(e=>console.warn('Verwaistes AU-Foto konnte nicht entfernt werden:',e));
  }catch(e){console.error('AU löschen fehlgeschlagen:',e);}
}
window.viewAuAt=index=>viewAuRecord('',index);
window.delAuAt=index=>deleteAuRecord('',index);
window.delAu=ident=>deleteAuRecord(ident,-1);
window.delChild=ident=>runAction(async()=>{if(confirm('Kind-krank-Eintrag wirklich löschen?'))await deleteById('childSick',ident,'Eintrag gelöscht');},'Kind-krank-Eintrag löschen')();
window.delRehab=ident=>runAction(async()=>{if(confirm('Reha-Eintrag wirklich löschen?'))await deleteById('rehabs',ident,'Reha-Eintrag gelöscht');},'Reha-Eintrag löschen')();
async function saveMeeting(){const date=$('#meetingDate').value;if(!date){alert('Bitte ein Datum auswählen.');return;}state.meetings.push({id:id(),type:$('#meetingType').value,date,time:$('#meetingTime').value,partner:$('#meetingPartner').value.trim(),place:$('#meetingPlace').value.trim(),note:$('#meetingNote').value.trim(),createdAt:now()});await save('Gespräch gespeichert');['meetingDate','meetingTime','meetingPartner','meetingPlace','meetingNote'].forEach(i=>$('#'+i).value='');}
async function saveNotice(){
  const f=$('#noticeFile').files[0],recordId=id();let file=null,fileKey='';
  if(f&&!isSupportedDocument(f)){alert('Bitte ein Foto oder eine PDF-Datei auswählen.');return;}
  try{
    if(f){fileKey=`notice:${recordId}`;await storeEncryptedBlob(fileKey,f,f.name||'Aushang');file={name:f.name,type:f.type,mime:f.type||'',fileKey};}
    state.notices.push({id:recordId,type:$('#noticeType').value,date:$('#noticeDate').value,title:$('#noticeTitle').value.trim(),note:$('#noticeNote').value.trim(),file,createdAt:now()});
    await save('Aushang gespeichert');$('#noticeTitle').value='';$('#noticeNote').value='';$('#noticeFile').value='';
  }catch(e){if(fileKey)await dbFileDelete(fileKey).catch(()=>{});console.error('Aushang speichern fehlgeschlagen:',e);showFileError('Aushang speichern',e);}
}
async function saveChild(){const from=$('#childFrom').value,to=$('#childTo').value;if(!from||!to){alert('Bitte Von- und Bis-Datum auswählen.');return;}if(to<from){alert('Das Bis-Datum darf nicht vor dem Von-Datum liegen.');return;}state.childSick.push({id:id(),child:$('#childName').value.trim(),from,to,note:$('#childNote').value.trim(),createdAt:now()});await save('Kind-krank-Eintrag gespeichert');$('#childName').value='';$('#childFrom').value='';$('#childTo').value='';$('#childNote').value='';}
async function saveRehab(){const from=$('#rehabFrom').value,to=$('#rehabTo').value;if(from&&to&&to<from){alert('Das Bis-Datum darf nicht vor dem Von-Datum liegen.');return;}state.rehabs.push({id:id(),status:$('#rehabStatus').value,clinic:$('#rehabClinic').value.trim(),from,to,note:$('#rehabNote').value.trim(),createdAt:now()});await save('Reha-Eintrag gespeichert');$('#rehabClinic').value='';$('#rehabFrom').value='';$('#rehabTo').value='';$('#rehabNote').value='';}

async function addManualShift(){modal(`<div class="sheet-head"><strong>Schicht hinzufügen</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Datum<input id="mShiftDate" type="date"></label><label>Schicht<input id="mShiftName" placeholder="Früh / Spät / Nacht"></label><label>Von<input id="mShiftStart" type="time"></label><label>Bis<input id="mShiftEnd" type="time"></label><label class="wide">Notiz<input id="mShiftNote"></label><button class="primary wide" onclick="commitManualShift()">Speichern</button></div>`);}
window.commitManualShift=async()=>{const date=$('#mShiftDate').value,shift=$('#mShiftName').value.trim();if(!date){alert('Bitte ein Datum auswählen.');return;}if(!shift){alert('Bitte eine Schicht eintragen.');return;}try{state.shifts.push({id:id(),date,shift,start:$('#mShiftStart').value,end:$('#mShiftEnd').value,note:$('#mShiftNote').value.trim(),createdAt:now()});await save('Schicht gespeichert');closeModal();}catch(e){if(!e?._wmAlerted)console.error('Schicht speichern fehlgeschlagen:',e);}};
async function saveSimpleDoc(type){
  const map={payroll:['payrollImage','payrollMonth'],stamp:['stampImage','stampMonth'],workplan:['workplanImage','workplanMonth']},cfg=map[type];if(!cfg)return;
  const fileEl=$('#'+cfg[0]),monthEl=$('#'+cfg[1]),f=fileEl?.files?.[0];if(!f){alert('Bitte zuerst ein Foto oder eine Datei auswählen.');return;}if(!isSupportedDocument(f)){alert('Bitte ein Foto oder eine PDF-Datei auswählen.');return;}
  const recordId=id(),fileKey=`doc:${recordId}`;
  try{
    await storeEncryptedBlob(fileKey,f,f.name||'Dokument');
    state.documents.push({id:recordId,type,month:monthEl?.value||'',name:f.name||'Dokument',mime:f.type||'',fileKey,createdAt:now()});
    await save('Dokument gespeichert');fileEl.value='';
  }catch(e){await dbFileDelete(fileKey).catch(()=>{});console.error('Dokument speichern fehlgeschlagen:',e);showFileError('Dokument speichern',e);}
}
async function saveAuPhoto(){
  const btn=$('#saveAuPhoto');
  const f=$('#auImage')?.files?.[0],from=$('#auFrom')?.value||'',to=$('#auTo')?.value||from;
  if(!from){alert('Bitte den ersten Krankheitstag im Kalender auswählen.');return;}
  if(to<from){alert('Das Bis-Datum darf nicht vor dem Von-Datum liegen.');return;}
  if(!f){alert('Bitte zuerst ein Foto der Krankschreibung auswählen.');return;}
  if(!isImageFile(f)){alert('Bitte ein Foto auswählen.');return;}

  const oldText=btn?.textContent||'Krankschreibung speichern';
  if(btn){btn.disabled=true;btn.textContent='Wird gespeichert …';}
  const status=$('#auSaveStatus');
  if(status){status.textContent='Foto wird sicher gespeichert …';status.className='save-status working';}
  let fileKey='';
  try{
    const recordId=id();fileKey=`au:${recordId}`;
    let blob;try{blob=await compressImageBlob(f,1800,.78);}catch(e){console.warn('Komprimierung fehlgeschlagen, Originalfoto wird verschlüsselt gespeichert.',e);blob=f;}
    await storeAuBlob(fileKey,blob,f.name||'Krankschreibung');
    const record={id:recordId,from,to,name:f.name||'Krankschreibung',mime:blob.type||f.type||'image/jpeg',fileKey,createdAt:now()};
    state.aus.push(record);
    try{await save('Krankschreibung gespeichert');}catch(e){state.aus=state.aus.filter(x=>x.id!==recordId);await dbFileDelete(fileKey).catch(()=>{});throw e;}
    $('#auImage').value='';$('#auFrom').value='';$('#auTo').value='';
    if(status){status.textContent='Krankschreibung wurde gespeichert.';status.className='save-status success';}
  }catch(e){
    console.error('AU speichern fehlgeschlagen:',e);
    if(fileKey)await dbFileDelete(fileKey).catch(()=>{});
    if(status){status.textContent='Speichern fehlgeschlagen: '+(e?.message||'unbekannter Fehler')+' – die Eingaben wurden nicht gelöscht.';status.className='save-status error';}
  }finally{
    if(btn){btn.disabled=false;btn.textContent=oldText;}
  }
}

function reportYearFromValue(value){
  const str=String(value??'').trim();if(!str)return '';
  const m=str.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);return m?m[1]:'';
}
function reportEntryYear(item,fields=[]){
  for(const f of fields){const y=reportYearFromValue(item?.[f]);if(y)return y;}
  return reportYearFromValue(item?.createdAt);
}
function reportInYear(item,fields,year){return reportEntryYear(item,fields)===String(year);}
function reportRangeOverlapsYear(from,to,year,createdAt=''){
  const yb=yearBounds(year),a=isoDayNumber(from||to),b=isoDayNumber(to||from);
  if(yb&&a!==null&&b!==null){const lo=Math.min(a,b),hi=Math.max(a,b),ys=isoDayNumber(yb.start),ye=isoDayNumber(yb.end);return hi>=ys&&lo<=ye;}
  return reportYearFromValue(createdAt)===String(year);
}
function reportAvailableYears(){
  const years=new Set([String(new Date().getFullYear())]);
  const add=v=>{const y=reportYearFromValue(v);if(y)years.add(y);};
  add(state.company?.contractStart);
  for(const x of state.shifts)add(x.date||x.createdAt);
  for(const x of state.meetings)add(x.date||x.createdAt);
  for(const x of state.notices)add(x.date||x.createdAt);
  for(const x of state.documents)add(x.month||x.createdAt);
  for(const x of state.aus){add(x.from||x.to||x.createdAt);add(x.to);}
  for(const x of state.childSick){add(x.from||x.to||x.createdAt);add(x.to);}
  for(const x of state.rehabs){add(x.from||x.to||x.createdAt);add(x.to);}
  for(const x of state.stairs)add(x.date||x.createdAt);
  for(const x of state.company.contracts||[])add(x.createdAt);
  for(const arr of Object.values(state.attachments||{}))for(const x of arr||[])add(x.createdAt);
  return [...years].filter(x=>/^\d{4}$/.test(x)).sort().reverse();
}
function reportYearData(year){
  const y=String(year);
  const shifts=state.shifts.filter(x=>reportInYear(x,['date'],y));
  const meetings=state.meetings.filter(x=>reportInYear(x,['date'],y));
  const notices=state.notices.filter(x=>reportInYear(x,['date'],y));
  const documents=state.documents.filter(x=>reportInYear(x,['month'],y));
  const aus=state.aus.filter(x=>reportRangeOverlapsYear(x.from,x.to,y,x.createdAt));
  const childSick=state.childSick.filter(x=>reportRangeOverlapsYear(x.from,x.to,y,x.createdAt));
  const rehabs=state.rehabs.filter(x=>reportRangeOverlapsYear(x.from,x.to,y,x.createdAt));
  const stairs=state.stairs.filter(x=>reportInYear(x,['date'],y));
  const contracts=(state.company.contracts||[]).filter(x=>reportInYear(x,[],y));
  const attachments={};
  for(const [key,arr] of Object.entries(state.attachments||{}))attachments[key]=(arr||[]).filter(x=>reportInYear(x,[],y));
  return {year:y,shifts,meetings,notices,documents,aus,childSick,rehabs,stairs,contracts,attachments};
}
function reportSummary(year){
  const d=reportYearData(year);
  const auDays=countUniqueRangeDays(d.aus,`${d.year}-01-01`,`${d.year}-12-31`);
  const childDays=countUniqueRangeDays(d.childSick,`${d.year}-01-01`,`${d.year}-12-31`);
  const stair=stairStats(d.stairs);
  const attached=Object.values(d.attachments).reduce((n,a)=>n+a.length,0);
  const noticeDocs=d.notices.filter(x=>x.file).length;
  const auDocs=d.aus.filter(x=>x.fileKey||x.data||x.image||x.name).length;
  const docs=d.documents.length+d.contracts.length+attached+noticeDocs+auDocs;
  return {...d,auDays,childDays,stair,docs};
}
function renderAnnualReport(){
  const select=$('#annualYear');if(!select)return;
  const previous=select.value;
  const years=reportAvailableYears();
  select.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
  if(previous&&years.includes(previous))select.value=previous;
  else select.value=years.includes(String(new Date().getFullYear()))?String(new Date().getFullYear()):years[0]||String(new Date().getFullYear());
  const s=reportSummary(select.value);
  if($('#annualStatShifts'))$('#annualStatShifts').textContent=s.shifts.length;
  if($('#annualStatAuCases'))$('#annualStatAuCases').textContent=s.aus.length;
  if($('#annualStatAuDays'))$('#annualStatAuDays').textContent=`${s.auDays} Tage`;
  if($('#annualStatStairs'))$('#annualStatStairs').textContent=s.stair.total;
  if($('#annualStatStairDays'))$('#annualStatStairDays').textContent=`${s.stair.days} aktive Tage`;
  if($('#annualStatDocs'))$('#annualStatDocs').textContent=s.docs;
  if($('#annualStatMeetings'))$('#annualStatMeetings').textContent=s.meetings.length;
  const preview=$('#annualPreview');
  if(preview)preview.innerHTML=`<div class="annual-preview-grid">
    <div><strong>AU</strong><span>${s.aus.length} Fälle · ${s.auDays} Kalendertage</span></div>
    <div><strong>Kind krank</strong><span>${s.childSick.length} Einträge · ${s.childDays} Kalendertage</span></div>
    <div><strong>Schichten</strong><span>${s.shifts.length} Einträge</span></div>
    <div><strong>Treppen</strong><span>${s.stair.total} gesamt · ${s.stair.entries} Einträge · ${s.stair.days} aktive Tage</span></div>
    <div><strong>Dokumente</strong><span>${s.docs} gespeicherte Dateien/Scans</span></div>
    <div><strong>Gespräche</strong><span>${s.meetings.length} Einträge</span></div>
    <div><strong>Aushänge</strong><span>${s.notices.length} Einträge</span></div>
    <div><strong>Reha</strong><span>${s.rehabs.length} Einträge</span></div>
  </div>`;
}
function reportText(v,fallback='—'){const s=String(v??'').trim();return s||fallback;}
function reportOneLine(v){return reportText(v,'').replace(/\s+/g,' ').trim();}
function buildAnnualReportLines(year){
  const d=reportSummary(year),lines=[];
  const title=t=>lines.push({kind:'title',text:t});
  const h2=t=>lines.push({kind:'h2',text:t});
  const h3=t=>lines.push({kind:'h3',text:t});
  const row=(label,value)=>lines.push({kind:'text',text:`${label}: ${reportText(value)}`});
  const bullet=t=>lines.push({kind:'bullet',text:t});
  const empty=()=>lines.push({kind:'spacer',text:''});
  const section=(name,items,formatter)=>{h2(name);if(!items.length)bullet('Keine Einträge.');else items.forEach((x,i)=>bullet(formatter(x,i)));empty();};

  title(`WorksManager Jahresstatistik ${d.year}`);
  row('Erstellt am',new Date().toLocaleString('de-DE'));
  row('Mitarbeiter',state.company.employeeName||'nicht hinterlegt');
  row('Firma',state.company.name||'nicht hinterlegt');
  row('Personalnummer',state.company.employeeNo||'nicht hinterlegt');
  row('Vertragsbeginn',state.company.contractStart?fmtDate(state.company.contractStart):'nicht hinterlegt');
  if(state.company.notes)row('Firmennotiz',reportOneLine(state.company.notes));
  empty();

  h2('Jahresübersicht');
  row('Schichten',d.shifts.length);
  row('AU-Fälle',d.aus.length);
  row('AU-Kalendertage im Jahr',d.auDays);
  row('Kind-krank-Einträge',d.childSick.length);
  row('Kind-krank-Kalendertage im Jahr',d.childDays);
  row('Gespräche / BEM / AMZ',d.meetings.length);
  row('Aushänge',d.notices.length);
  row('Reha-Einträge',d.rehabs.length);
  row('Gespeicherte Dokumente/Scans',d.docs);
  row('Treppen gesamt',d.stair.total);
  row('Treppeneinträge',d.stair.entries);
  row('Aktive Treppentage',d.stair.days);
  row('Ø Treppen pro aktivem Tag',String(d.stair.avg).replace('.',','));
  empty();

  h2('Treppen - Monatsstatistik');
  for(let m=1;m<=12;m++){
    const key=`${d.year}-${String(m).padStart(2,'0')}`;
    const items=d.stairs.filter(x=>(x.date||'').startsWith(key));
    const s=stairStats(items);
    bullet(`${monthLabel(key)}: ${s.total} Treppen · ${s.entries} Einträge · ${s.days} aktive Tage · Ø ${String(s.avg).replace('.',',')} pro aktivem Tag`);
  }
  empty();

  section('Schichten',d.shifts,x=>`${fmtDate(x.date)} · ${reportText(x.shift,'Schicht')} · ${reportText(x.start,'—')}–${reportText(x.end,'—')}${x.note?' · '+reportOneLine(x.note):''}`);
  section('Krankheit & AU',d.aus,x=>`${x.from?fmtDate(x.from):'ohne Von-Datum'}${x.to?' bis '+fmtDate(x.to):''}${x.name?' · Foto: '+reportOneLine(x.name):''}`);
  section('Kind krank',d.childSick,x=>`${reportText(x.child,'Kind')} · ${x.from?fmtDate(x.from):'ohne Von-Datum'}${x.to?' bis '+fmtDate(x.to):''}${x.note?' · '+reportOneLine(x.note):''}`);
  section('BEM · AMZ · Gespräche',d.meetings,x=>`${reportText(x.type,'Gespräch')} · ${x.date?fmtDate(x.date):'ohne Datum'}${x.time?' '+x.time:''}${x.partner?' · '+reportOneLine(x.partner):''}${x.place?' · '+reportOneLine(x.place):''}${x.note?' · '+reportOneLine(x.note):''}`);
  section('Aushänge',d.notices,x=>`${reportText(x.type,'Aushang')} · ${x.date?fmtDate(x.date):'ohne Datum'} · ${reportText(x.title,'ohne Titel')}${x.note?' · '+reportOneLine(x.note):''}${x.file?.name?' · Datei: '+reportOneLine(x.file.name):''}`);
  section('Abrechnung · Stempelübersicht · Arbeitsplan',d.documents,x=>`${x.month?monthLabel(x.month):'ohne Monat'} · ${x.type==='payroll'?'Lohnabrechnung':x.type==='stamp'?'Stempelübersicht':x.type==='workplan'?'Arbeitsplan':reportText(x.type,'Dokument')} · Datei: ${reportText(x.name,'Dokument')}`);

  section('Reha',d.rehabs,x=>`${reportText(x.status,'Reha')} · ${reportText(x.clinic,'ohne Einrichtung')} · ${x.from?fmtDate(x.from):'ohne Von-Datum'}${x.to?' bis '+fmtDate(x.to):''}${x.note?' · '+reportOneLine(x.note):''}`);
  section('Treppenzähler - Einzeleinträge',d.stairs,x=>`${x.date?fmtDate(x.date):'ohne Datum'}${x.time?' '+x.time:''} · ${Number(x.count)||0} Treppen${x.reason?' · '+reportOneLine(x.reason):''}`);

  h2('Weitere Fotos / Dokumente');
  if(d.contracts.length){h3('Arbeitsverträge / Vertragsdokumente');d.contracts.forEach(x=>bullet(`${reportFormatDateTime(x.createdAt)} · ${reportText(x.name,'Dokument')}`));}
  const attachmentLabels={company:'Firma & Vertrag',shift:'Schichtplan',meetings:'BEM / AMZ / Gespräche',notices:'Aushänge',family:'Kind krank',rehab:'Reha'};
  let anyAttachment=d.contracts.length>0;
  for(const [key,arr] of Object.entries(d.attachments)){
    if(!arr.length)continue;anyAttachment=true;h3(attachmentLabels[key]||key);
    arr.forEach(x=>bullet(`${reportFormatDateTime(x.createdAt)} · ${reportText(x.name,'Foto / Dokument')}`));
  }
  if(!anyAttachment)bullet('Keine weiteren Dateien im gewählten Jahr.');
  empty();

  h2('Hinweis');
  bullet('Diese Jahresstatistik enthält die in WorksManager gespeicherten Angaben und eine Dateiliste. Die Originalfotos und Original-PDFs sind nicht in diese Statistik-PDF eingebettet.');
  bullet('Für eine vollständige Datensicherung einschließlich Originaldateien zusätzlich das verschlüsselte WorksManager-Backup exportieren.');
  return lines;
}
function pdfWinAnsiByte(ch){
  const cp=ch.codePointAt(0);
  if(cp>=32&&cp<=255)return cp;
  const map={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159};
  return map[cp]??63;
}
function pdfLiteral(text){
  let out='(';
  for(const ch of String(text??'')){
    const b=pdfWinAnsiByte(ch);
    if(b===40||b===41||b===92)out+='\\'+String.fromCharCode(b);
    else if(b<32||b>=127)out+='\\'+b.toString(8).padStart(3,'0');
    else out+=String.fromCharCode(b);
  }
  return out+')';
}
function pdfWrap(text,size=9,indent=0){
  const maxChars=Math.max(28,Math.floor((500-indent)/(size*.53)));
  const paragraphs=String(text??'').replace(/\r/g,'').split('\n');
  const result=[];
  for(const p of paragraphs){
    const words=p.split(/\s+/).filter(Boolean);
    if(!words.length){result.push('');continue;}
    let line='';
    for(const word of words){
      if(word.length>maxChars){
        if(line){result.push(line);line='';}
        for(let i=0;i<word.length;i+=maxChars)result.push(word.slice(i,i+maxChars));
        continue;
      }
      const candidate=line?line+' '+word:word;
      if(candidate.length>maxChars){result.push(line);line=word;}else line=candidate;
    }
    if(line)result.push(line);
  }
  return result;
}
function makeAnnualPdfBlob(year,reportLines){
  const pageW=595.28,pageH=841.89,left=46,right=46,top=796,bottom=54;
  const pages=[[]];let y=top;
  const spec={title:{size:18,bold:true,before:0,after:10,lh:23},h2:{size:13,bold:true,before:10,after:4,lh:18},h3:{size:10.5,bold:true,before:6,after:2,lh:15},text:{size:9,bold:false,before:0,after:1,lh:12.5},bullet:{size:8.7,bold:false,before:0,after:1,lh:12.2}};
  const newPage=()=>{pages.push([]);y=top;};
  for(const item of reportLines){
    if(item.kind==='spacer'){y-=7;if(y<bottom)newPage();continue;}
    const s=spec[item.kind]||spec.text,indent=item.kind==='bullet'?12:0,prefix=item.kind==='bullet'?'• ':'';
    y-=s.before;
    const wrapped=pdfWrap(prefix+item.text,s.size,indent);
    const need=wrapped.length*s.lh+s.after;
    if(y-need<bottom&&pages[pages.length-1].length)newPage();
    for(const line of wrapped){
      if(y-s.lh<bottom)newPage();
      pages[pages.length-1].push({x:left+indent,y,size:s.size,bold:s.bold,text:line});
      y-=s.lh;
    }
    y-=s.after;
  }
  const objects={};
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const pageIds=[];
  for(let i=0;i<pages.length;i++)pageIds.push(5+i*2);
  objects[2]=`<< /Type /Pages /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] /Count ${pages.length} >>`;
  for(let i=0;i<pages.length;i++){
    const pageId=5+i*2,contentId=pageId+1;
    objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    const cmds=[];
    for(const line of pages[i])cmds.push(`BT /${line.bold?'F2':'F1'} ${line.size} Tf 1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm ${pdfLiteral(line.text)} Tj ET`);
    cmds.push(`BT /F1 7.5 Tf 1 0 0 1 ${left.toFixed(2)} 27 Tm ${pdfLiteral(`WorksManager · Jahresstatistik ${year} · Seite ${i+1} / ${pages.length}`)} Tj ET`);
    const content=cmds.join('\n');
    objects[contentId]=`<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }
  const maxId=4+pages.length*2;
  let pdf='%PDF-1.4\n%WorksManager\n';
  const offsets=[0];
  for(let i=1;i<=maxId;i++){
    offsets[i]=pdf.length;
    pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref=pdf.length;
  pdf+=`xref\n0 ${maxId+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=maxId;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf],{type:'application/pdf'});
}
function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function createAnnualPdf(){
  const year=$('#annualYear')?.value||String(new Date().getFullYear());
  try{
    const lines=buildAnnualReportLines(year);const blob=makeAnnualPdfBlob(year,lines);
    downloadBlob(blob,`WorksManager-Jahresstatistik-${year}.pdf`);
    showToast(`Jahres-PDF ${year} erstellt`);
  }catch(e){console.error('Jahres-PDF fehlgeschlagen:',e);alert('Jahres-PDF konnte nicht erstellt werden: '+(e?.message||e));}
}

async function exportBackup(){
  const payload=await dbGet('payload'),salt=await dbGet('salt');
  if(!payload?.iv||!payload?.cipher||!salt)throw new Error('Es sind keine gültigen verschlüsselten App-Daten vorhanden.');
  const entries=await dbFileEntries();
  const files=entries.map(([key,v])=>({key,iv:v.iv,cipher:b64(v.cipher),mime:v.mime||'',name:v.name||'',size:v.size||0,createdAt:v.createdAt||''}));
  const blob=new Blob([JSON.stringify({app:'WorksManager',version:4,appVersion:APP_VERSION,salt,payload,files,exportedAt:now()},null,2)],{type:'application/json'});
  downloadBlob(blob,`WorksManager-Backup-${new Date().toISOString().slice(0,10)}.json`);
  showToast('Verschlüsseltes Backup erstellt');
}
async function validateBackupRows(rows,key){
  for(const [fileKey,rec] of rows){
    if(!rec?.iv||!rec?.cipher)throw new Error(`Dateieintrag ${fileKey} ist unvollständig.`);
    await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(unb64(rec.iv))},key,rec.cipher);
  }
}
async function importBackup(file){
  try{
    const j=JSON.parse(await file.text());
    if(j.app!=='WorksManager'||!j.salt||!j.payload?.iv||!j.payload?.cipher)throw new Error('Ungültiges WorksManager-Backup.');
    const rows=[],backupKeys=new Set();
    if(Array.isArray(j.files))for(const f of j.files){
      if(!f?.key||!f?.iv||!f?.cipher)throw new Error('Das Backup enthält einen unvollständigen Dateieintrag.');
      const key=String(f.key);
      if(backupKeys.has(key))throw new Error('Das Backup enthält doppelte Dateischlüssel.');
      backupKeys.add(key);
      rows.push([key,{iv:f.iv,cipher:unb64(f.cipher),mime:f.mime||'',name:f.name||'',size:f.size||0,createdAt:f.createdAt||''}]);
    }
    const pass=prompt('Passwort / PIN des Backups eingeben. Das Passwort wird nicht gespeichert.');
    if(pass===null)return;
    if(!pass)throw new Error('Kein Backup-Passwort eingegeben.');
    const backupKey=await deriveKey(pass,new Uint8Array(unb64(j.salt)));
    let loaded;
    try{
      loaded=normalizeState(await decryptPayload(j.payload,backupKey));
      await validateBackupRows(rows,backupKey);
      const missing=[...referencedFileKeys(loaded)].filter(k=>!backupKeys.has(k));
      if(missing.length)throw new Error(`Im Backup fehlen ${missing.length} referenzierte Datei(en).`);
    }catch(e){
      if(/referenzierte Datei|doppelte Dateischlüssel|unvollständigen Dateieintrag/i.test(String(e?.message||'')))throw e;
      throw new Error('Backup-Passwort falsch oder Backup beschädigt.');
    }
    if(!confirm('Backup importieren? Die derzeit lokal gespeicherten WorksManager-Daten werden vollständig durch das geprüfte Backup ersetzt.'))return;
    await dbReplaceAll(j.salt,j.payload,rows);
    cryptoKey=backupKey;state=loaded;
    let importMaintenanceWarning=false;
    try{await migrateLegacyStoredFiles();await persistStateOnly();}catch(e){importMaintenanceWarning=true;console.warn('Backup importiert, Nachbearbeitung unvollständig:',e);}
    try{await cleanupOrphanFiles();}catch(e){importMaintenanceWarning=true;console.warn('Backup importiert, Dateibereinigung unvollständig:',e);}
    $('#unlock').classList.add('hidden');$('#app').classList.remove('hidden');
    renderAll();showToast(importMaintenanceWarning?'Backup importiert – Nachbereinigung teilweise ausgelassen':'Backup erfolgreich importiert',importMaintenanceWarning?'error':'success');
  }catch(e){console.error('Backup-Import fehlgeschlagen:',e);alert('Backup konnte nicht importiert werden: '+(e?.message||e));}
  finally{const input=$('#importBackup');if(input)input.value='';}
}



function runAction(fn,label='Aktion'){
  return (...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>{
    console.error(`${label} fehlgeschlagen:`,e);
    if(!e?._wmAlerted)showFileError(label,e);
  });
}
function bind(){
  $('#unlockBtn').onclick=runAction(unlock,'Entsperren');$('#unlockPassword').addEventListener('keydown',e=>{if(e.key==='Enter')runAction(unlock,'Entsperren')();});$('#lockBtn').onclick=lock;
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));$('#moreBtn').onclick=()=>$('#moreMenu').classList.remove('hidden');$('#closeMore').onclick=()=>$('#moreMenu').classList.add('hidden');$('#moreMenu').addEventListener('click',e=>{if(e.target===$('#moreMenu'))$('#moreMenu').classList.add('hidden');});$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});
  $('#saveStairEntry').onclick=runAction(saveStairEntry,'Treppeneintrag speichern');
  $('#annualYear').onchange=renderAnnualReport;$('#createAnnualPdf').onclick=createAnnualPdf;
  $('#saveCompany').onclick=runAction(saveCompany,'Firmendaten speichern');$('#saveContractFile').onclick=runAction(saveContractFile,'Arbeitsvertrag speichern');$('#saveMeeting').onclick=runAction(saveMeeting,'Gespräch speichern');$('#saveNotice').onclick=runAction(saveNotice,'Aushang speichern');$('#saveChild').onclick=runAction(saveChild,'Kind-krank-Eintrag speichern');$('#saveRehab').onclick=runAction(saveRehab,'Reha-Eintrag speichern');
  $('#addShiftManual').onclick=addManualShift;
  $('#saveAuPhoto').onclick=runAction(saveAuPhoto,'Krankschreibung speichern');$('#auStatsMonth').onchange=renderAUs;$('#auStatsYear').onchange=renderAUs;
  $$('[data-docsave]').forEach(b=>b.onclick=runAction(()=>saveSimpleDoc(b.dataset.docsave),'Dokument speichern'));
  $$('[data-attachment-section]').forEach(b=>b.onclick=runAction(()=>saveGenericAttachment(b.dataset.attachmentSection,b.dataset.attachmentInput),'Foto / Dokument speichern'));
  $('#exportBackup').onclick=runAction(exportBackup,'Backup exportieren');$('#importBackup').onchange=e=>{if(e.target.files[0])runAction(()=>importBackup(e.target.files[0]),'Backup importieren')();};
  $('#wipeData').onclick=runAction(async()=>{if(confirm('Wirklich ALLE lokalen WorksManager-Daten löschen?')){await dbClear();location.reload();}},'Daten löschen');
}

(async function init(){
  try{
    const htmlVersion=document.documentElement.dataset.appVersion||'';
    if(htmlVersion!==APP_VERSION)throw new Error(`Versionskonflikt: HTML ${htmlVersion||'unbekannt'}, JavaScript ${APP_VERSION}`);
    db=await openDB();bind();
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register(`./sw.js?v=${APP_VERSION}`,{updateViaCache:'none'}).then(r=>r.update()).catch(e=>console.warn('Service Worker konnte nicht aktualisiert werden:',e));
    }
    window.addEventListener('pageshow',()=>{setTimeout(resetViewportPosition,0);const app=$('#app');if(app&&!app.classList.contains('hidden')&&!cryptoKey){app.classList.add('hidden');$('#unlock').classList.remove('hidden');$('#unlockHint').textContent='Die Sitzung wurde neu geladen. Bitte einmal erneut entsperren.';}});
    window.addEventListener('orientationchange',()=>setTimeout(resetViewportPosition,120));
    resetViewportPosition();
    const has=await dbGet('payload');
    $('#unlockHint').textContent=has?'Daten vorhanden – mit deinem Passwort öffnen.':'Erster Start: Dieses Passwort verschlüsselt deine Daten. Merke es dir; es kann nicht wiederhergestellt werden.';
  }catch(e){
    console.error('WorksManager konnte nicht gestartet werden:',e);
    const hint=$('#unlockHint');if(hint)hint.textContent=/Versionskonflikt/.test(String(e?.message||''))?`${e.message}. Bitte die Seite vollständig neu laden.`:'Der lokale App-Speicher konnte nicht geöffnet werden. Bitte Safari/WorksManager vollständig schließen und erneut öffnen.';
    const btn=$('#unlockBtn');if(btn)btn.disabled=true;
  }
})();
