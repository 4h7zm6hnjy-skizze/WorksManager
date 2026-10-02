'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const enc = new TextEncoder();
const dec = new TextDecoder();
let state = blankState();
let cryptoKey = null;
let db = null;

function blankState(){return {version:4,company:{name:'',employeeName:'',contractStart:'',employeeNo:'',notes:'',contracts:[]},shifts:[],meetings:[],notices:[],documents:[],aus:[],childSick:[],rehabs:[],stairs:[],health:{lungTests:[],labResults:[],doctorLetters:[]},attachments:{company:[],shift:[],meetings:[],notices:[],family:[],rehab:[]}};}
function normalizeState(v){const base=blankState();const x=v&&typeof v==='object'?v:{};x.company={...base.company,...(x.company||{})};x.company.contracts=Array.isArray(x.company.contracts)?x.company.contracts:[];for(const k of ['shifts','meetings','notices','documents','aus','childSick','rehabs','stairs'])x[k]=Array.isArray(x[k])?x[k]:[];x.health=x.health&&typeof x.health==='object'?x.health:{};x.health.lungTests=Array.isArray(x.health.lungTests)?x.health.lungTests:[];x.health.labResults=Array.isArray(x.health.labResults)?x.health.labResults:[];x.health.doctorLetters=Array.isArray(x.health.doctorLetters)?x.health.doctorLetters:[];x.attachments=x.attachments&&typeof x.attachments==='object'?x.attachments:{};for(const k of ['company','shift','meetings','notices','family','rehab'])x.attachments[k]=Array.isArray(x.attachments[k])?x.attachments[k]:[];x.version=4;return x;}
function id(){return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);}
function now(){return new Date().toISOString();}
function fmtDate(v){if(!v)return '—';const d=new Date(v+'T12:00:00');return d.toLocaleDateString('de-DE');}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function daysInclusive(a,b){if(!a||!b)return 0;const d1=new Date(a+'T12:00:00'),d2=new Date(b+'T12:00:00');return Math.max(0,Math.floor((d2-d1)/86400000)+1);}
function normalizeDate(s){if(!s)return '';let m=s.match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/);if(!m)return '';let y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}
async function compressImage(file,max=1600,q=.78){if(!file.type.startsWith('image/')) return await fileToDataURL(file);const src=await fileToDataURL(file);const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});const scale=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',q);}

function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open('WorksManagerSecure',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function dbGet(k){return new Promise((res,rej)=>{const tx=db.transaction('kv','readonly');const r=tx.objectStore('kv').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function dbPut(k,v){return new Promise((res,rej)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
function dbClear(){return new Promise((res,rej)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
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
async function imageForStorage(file){
  if(!file)return '';
  if(!file.type.startsWith('image/'))return await fileToDataURL(file);
  try{return await compressImage(file,2400,.88);}catch(e){console.warn('Bildkomprimierung nicht möglich, Original wird verwendet.',e);return await fileToDataURL(file);}
}
function unb64(s){const x=atob(s);const a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a.buffer;}
async function deriveKey(password,salt){const base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encryptState(){const iv=crypto.getRandomValues(new Uint8Array(12));const plain=enc.encode(JSON.stringify(state));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,plain);return {iv:b64(iv),cipher:b64(cipher),updatedAt:now()};}
async function decryptPayload(payload,key){const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(unb64(payload.iv))},key,unb64(payload.cipher));return JSON.parse(dec.decode(plain));}
async function save(successMessage='Gespeichert'){
  if(!cryptoKey)throw new Error('App ist gesperrt. Bitte erneut entsperren.');
  try{
    const payload=await encryptState();
    await dbPut('payload',payload);
    renderAll();
    if(successMessage)showToast(successMessage);
    return true;
  }catch(e){
    console.error('WorksManager Speichern fehlgeschlagen:',e);
    // Nicht gespeicherte Änderungen aus dem Arbeitsspeicher zurückrollen, damit ein erneuter Klick keine Duplikate erzeugt.
    try{const stored=await dbGet('payload');if(stored){state=normalizeState(await decryptPayload(stored,cryptoKey));renderAll();}}catch(restoreError){console.error('Rollback fehlgeschlagen:',restoreError);}
    const quota=(e&&(/quota/i.test(e.name||'')||/quota|storage|space/i.test(e.message||'')));
    alert(quota?'Speichern fehlgeschlagen: Der lokale Gerätespeicher für WorksManager ist voll. Bitte zuerst ein verschlüsseltes Backup erstellen und nicht benötigte große Dokumente entfernen.':'Speichern fehlgeschlagen. Bitte erneut versuchen. Technischer Hinweis: '+(e?.message||e));
    throw e;
  }
}

async function unlock(){const pass=$('#unlockPassword').value;if(!pass){$('#unlockHint').textContent='Bitte Passwort eingeben.';return;}try{let saltB64=await dbGet('salt');if(!saltB64){const salt=crypto.getRandomValues(new Uint8Array(16));saltB64=b64(salt);await dbPut('salt',saltB64);}cryptoKey=await deriveKey(pass,new Uint8Array(unb64(saltB64)));const payload=await dbGet('payload');if(payload){state=normalizeState(await decryptPayload(payload,cryptoKey));}else{state=blankState();await save('');}$('#unlock').classList.add('hidden');$('#app').classList.remove('hidden');$('#unlockPassword').value='';$('#unlockHint').textContent='';renderAll();}catch(e){cryptoKey=null;$('#unlockHint').textContent='Passwort falsch oder Daten beschädigt.';}}
function lock(){cryptoKey=null;state=blankState();$('#app').classList.add('hidden');$('#unlock').classList.remove('hidden');}

function go(name){$$('.page').forEach(p=>p.classList.toggle('active',p.id===name));$$('.nav-btn[data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===name));$('#moreMenu').classList.add('hidden');window.scrollTo({top:0,behavior:'smooth'});}

function renderAll(){renderDashboard();renderCompany();renderShifts();renderMeetings();renderNotices();renderDocs();renderAUs();renderHealth();renderChild();renderRehab();renderStairs();renderAttachments();renderAnnualReport();}
function renderDashboard(){const auDays=state.aus.reduce((s,a)=>s+daysInclusive(a.from,a.to),0);const healthEntries=state.health.lungTests.length+state.health.labResults.length+state.health.doctorLetters.length;const healthDocs=[...state.health.lungTests,...state.health.labResults,...state.health.doctorLetters].filter(x=>x.data).length;const extraDocs=Object.values(state.attachments||{}).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);$('#statAuDays').textContent=auDays;$('#statAuCases').textContent=state.aus.length;$('#statChildCases').textContent=state.childSick.length;$('#statShifts').textContent=state.shifts.length;$('#statDocs').textContent=state.documents.length+state.company.contracts.length+state.notices.filter(n=>n.file).length+healthDocs+extraDocs;$('#statHealthEntries').textContent=healthEntries;$('#welcomeText').textContent=state.company.employeeName?`${state.company.employeeName}${state.company.name?' · '+state.company.name:''}`:'Noch kein Mitarbeitername hinterlegt.';const today=localDateValue();const stairsToday=(state.stairs||[]).filter(x=>x.date===today).reduce((n,x)=>n+(Number(x.count)||0),0);const stairStat=$('#statStairsToday');if(stairStat)stairStat.textContent=stairsToday;}
function renderCompany(){const c=state.company;$('#companyName').value=c.name||'';$('#employeeName').value=c.employeeName||'';$('#contractStart').value=c.contractStart||'';$('#employeeNo').value=c.employeeNo||'';$('#companyNotes').value=c.notes||'';$('#contractList').innerHTML=(c.contracts||[]).map(x=>itemHtml('Arbeitsvertrag',x.name||'Dokument',x.createdAt,[`<button onclick="viewDoc('${x.id}','contract')">Öffnen</button>`,`<button onclick="delContract('${x.id}')">Löschen</button>`])).join('')||empty('Noch kein Arbeitsvertrag gespeichert.');}
function renderShifts(){const arr=[...state.shifts].sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#shiftList').innerHTML=arr.map(s=>itemHtml(`${fmtDate(s.date)} · ${esc(s.shift||'Schicht')}`,`${esc(s.start||'—')}–${esc(s.end||'—')}${s.note?' · '+esc(s.note):''}`,s.createdAt,[`<button onclick="delShift('${s.id}')">Löschen</button>`])).join('')||empty('Noch keine Schichten gespeichert.');}
function renderMeetings(){const arr=[...state.meetings].sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#meetingList').innerHTML=arr.map(m=>itemHtml(`${esc(m.type)} · ${fmtDate(m.date)}`,`${esc(m.time||'')} ${esc(m.partner||'')}${m.place?' · '+esc(m.place):''}${m.note?' · '+esc(m.note):''}`,m.createdAt,[`<button onclick="delMeeting('${m.id}')">Löschen</button>`])).join('')||empty('Noch keine Einträge.');}
function renderNotices(){const arr=[...state.notices].sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#noticeList').innerHTML=arr.map(n=>itemHtml(`${esc(n.type)} · ${esc(n.title||'Aushang')}`,`${fmtDate(n.date)}${n.note?' · '+esc(n.note):''}`,n.createdAt,[n.file?`<button onclick="viewDoc('${n.id}','notice')">Dokument</button>`:'',`<button onclick="delNotice('${n.id}')">Löschen</button>`])).join('')||empty('Noch keine Aushänge.');}
function renderDocs(){
  const arr=[...state.documents].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  $('#payrollList').innerHTML=arr.map(d=>{const label=d.type==='payroll'?'Lohnabrechnung':d.type==='stamp'?'Stempelübersicht':'Arbeitsplan';return itemHtml(`${label}${d.month?' · '+esc(d.month):''}`,esc(d.name||'Dokument gespeichert'),d.createdAt,[`<button onclick="viewDoc('${d.id}','doc')">Öffnen</button>`,`<button onclick="delDoc('${d.id}')">Löschen</button>`]);}).join('')||empty('Noch keine Abrechnungen, Stempelübersichten oder Arbeitspläne gespeichert.');
}
function renderAUs(){const arr=[...state.aus].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));const days=arr.reduce((s,a)=>s+daysInclusive(a.from,a.to),0),follow=arr.filter(a=>a.kind==='Folgebescheinigung').length;$('#auCases').textContent=arr.length;$('#auDays').textContent=days;$('#auFollow').textContent=follow;$('#statAuDays').textContent=days;$('#statAuCases').textContent=arr.length;$('#auList').innerHTML=arr.map(a=>{const hasDates=a.from||a.to;const title=hasDates?`${fmtDate(a.from)}–${fmtDate(a.to)} · ${esc(a.kind||'AU')}`:`AU-Dokument · ${esc(a.name||'Foto')}`;const meta=[a.codes?.length?'ICD‑10: '+esc(a.codes.join(', ')):'',a.note?esc(a.note):'',!hasDates?'Nur Foto/Dokument gespeichert':''].filter(Boolean).join(' · ');return itemHtml(title,meta||'AU gespeichert',a.createdAt,[(a.data||a.image)?`<button onclick="viewDoc('${a.id}','au')">Original ansehen</button>`:'',`<button onclick="delAu('${a.id}')">Löschen</button>`]);}).join('')||empty('Noch keine AU gespeichert.');const counts={};arr.forEach(a=>(a.codes||[]).forEach(c=>counts[c]=(counts[c]||0)+1));const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]);$('#icdStats').innerHTML=rows.map(([c,n])=>`<div class="item"><div class="item-top"><div><div class="item-title">${esc(c)}</div><div class="item-meta">manuell gespeicherte AU mit diesem Code</div></div><strong>${n}×</strong></div></div>`).join('')||empty('Keine manuell eingetragenen ICD‑10-Codes gespeichert.');}
function renderHealth(){
  const lung=[...state.health.lungTests].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  $('#lungTestList').innerHTML=lung.map(x=>{const manual=[x.fev1Percent&&`FEV1 ${esc(x.fev1Percent)} %`,x.fev1Liters&&`FEV1 ${esc(x.fev1Liters)} L`,x.fvcPercent&&`FVC ${esc(x.fvcPercent)} %`,x.ratio&&`FEV1/FVC ${esc(x.ratio)}`].filter(Boolean).join(' · ');return itemHtml(x.date?`Lungenfunktion · ${fmtDate(x.date)}`:`Lungenfunktion · ${esc(x.name||'Befund')}`,manual||x.note||'Originalbefund gespeichert',x.createdAt,[x.data?`<button onclick="viewDoc('${x.id}','lung')">Öffnen</button>`:'',`<button onclick="delHealth('${x.id}','lung')">Löschen</button>`]);}).join('')||empty('Noch keine Lungenfunktion gespeichert.');
  const labs=[...state.health.labResults].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  $('#labResultList').innerHTML=labs.map(x=>itemHtml(x.date?`Labor · ${fmtDate(x.date)}`:`Laborbefund · ${esc(x.name||'Dokument')}`,x.values?esc(x.values).split('\n').join(' · '):(x.note?esc(x.note):'Originalbefund gespeichert'),x.createdAt,[x.data?`<button onclick="viewDoc('${x.id}','lab')">Öffnen</button>`:'',`<button onclick="delHealth('${x.id}','lab')">Löschen</button>`])).join('')||empty('Noch keine Laborbefunde gespeichert.');
  const letters=[...state.health.doctorLetters].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  $('#doctorLetterList').innerHTML=letters.map(x=>itemHtml(x.subject?`${esc(x.subject)}${x.date?' · '+fmtDate(x.date):''}`:`Arztbrief · ${esc(x.name||'Dokument')}`,x.note?esc(x.note):(x.doctor?esc(x.doctor):'Originaldokument gespeichert'),x.createdAt,[x.data?`<button onclick="viewDoc('${x.id}','letter')">Öffnen</button>`:'',`<button onclick="delHealth('${x.id}','letter')">Löschen</button>`])).join('')||empty('Noch keine Arztbriefe gespeichert.');
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
  $('#stairCount').value='';$('#stairReason').value='';$('#stairDate').value=localDateValue();$('#stairTime').value=localTimeValue();
  await save('Treppen gespeichert');
}
window.delStairEntry=async ident=>{if(confirm('Treppeneintrag löschen?')){state.stairs=state.stairs.filter(x=>x.id!==ident);await save('Treppeneintrag gelöscht');}};

function renderChild(){const arr=[...state.childSick].sort((a,b)=>(b.from||'').localeCompare(a.from||''));$('#childList').innerHTML=arr.map(x=>itemHtml(`${esc(x.child||'Kind')} · ${fmtDate(x.from)}–${fmtDate(x.to)}`,x.note||'',x.createdAt,[`<button onclick="delChild('${x.id}')">Löschen</button>`])).join('')||empty('Noch keine Einträge.');}
function renderRehab(){const arr=[...state.rehabs].sort((a,b)=>(b.from||'').localeCompare(a.from||''));$('#rehabList').innerHTML=arr.map(x=>itemHtml(`${esc(x.status)} · ${esc(x.clinic||'Reha')}`,`${fmtDate(x.from)}–${fmtDate(x.to)}${x.note?' · '+esc(x.note):''}`,x.createdAt,[`<button onclick="delRehab('${x.id}')">Löschen</button>`])).join('')||empty('Noch keine Reha-Einträge.');}
const attachmentUi={company:'companyPhotoList',shift:'shiftPhotoList',meetings:'meetingPhotoList',notices:'noticePhotoList',family:'familyPhotoList',rehab:'rehabPhotoList'};
function renderAttachments(){for(const [section,listId] of Object.entries(attachmentUi)){const el=$('#'+listId);if(!el)continue;const arr=[...(state.attachments?.[section]||[])].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));el.innerHTML=arr.map(x=>itemHtml(esc(x.name||'Foto / Dokument'),'Nur gespeichert · keine Analyse',x.createdAt,[`<button onclick="viewAttachment('${section}','${x.id}')">Öffnen</button>`,`<button onclick="delAttachment('${section}','${x.id}')">Löschen</button>`])).join('')||empty('Noch keine Fotos oder Dokumente gespeichert.');}}
async function saveGenericAttachment(section,inputId){const input=$('#'+inputId);const f=input?.files?.[0];if(!f){alert('Bitte zuerst ein Foto oder eine Datei auswählen.');return;}const data=f.type.startsWith('image/')?await imageForStorage(f):await fileToDataURL(f);if(!state.attachments[section])state.attachments[section]=[];state.attachments[section].push({id:id(),name:f.name||'Foto',mime:f.type||'',data,createdAt:now()});input.value='';await save('Foto / Dokument gespeichert');}
window.viewAttachment=(section,ident)=>{const obj=(state.attachments?.[section]||[]).find(x=>x.id===ident);if(!obj?.data)return;const w=window.open();if(!w)return alert('Popup wurde blockiert.');if(obj.data.startsWith('data:application/pdf'))w.location=obj.data;else w.document.write(`<title>WorksManager Dokument</title><img src="${obj.data}" style="max-width:100%;height:auto">`);};
window.delAttachment=async(section,ident)=>{if(confirm('Foto / Dokument löschen?')){state.attachments[section]=(state.attachments[section]||[]).filter(x=>x.id!==ident);await save();}};

function itemHtml(title,meta,created,actions=[]){return `<div class="item"><div class="item-top"><div><div class="item-title">${title}</div><div class="item-meta">${meta||''}</div></div></div><div class="item-actions">${actions.filter(Boolean).join('')}</div></div>`;}
function empty(t){return `<div class="muted">${esc(t)}</div>`;}

function modal(html){$('#modalCard').innerHTML=html;$('#modal').classList.remove('hidden');}
function closeModal(){$('#modal').classList.add('hidden');}

async function saveCompany(){state.company={...state.company,name:$('#companyName').value.trim(),employeeName:$('#employeeName').value.trim(),contractStart:$('#contractStart').value,employeeNo:$('#employeeNo').value.trim(),notes:$('#companyNotes').value.trim()};await save();}
async function saveMeeting(){state.meetings.push({id:id(),type:$('#meetingType').value,date:$('#meetingDate').value,time:$('#meetingTime').value,partner:$('#meetingPartner').value.trim(),place:$('#meetingPlace').value.trim(),note:$('#meetingNote').value.trim(),createdAt:now()});await save();['meetingDate','meetingTime','meetingPartner','meetingPlace','meetingNote'].forEach(i=>$('#'+i).value='');}
async function saveNotice(){const f=$('#noticeFile').files[0];let file=null;if(f)file={name:f.name,type:f.type,data:f.type.startsWith('image/')?await imageForStorage(f):await fileToDataURL(f)};state.notices.push({id:id(),type:$('#noticeType').value,date:$('#noticeDate').value,title:$('#noticeTitle').value.trim(),note:$('#noticeNote').value.trim(),file,createdAt:now()});await save();$('#noticeTitle').value='';$('#noticeNote').value='';$('#noticeFile').value='';}
async function saveChild(){state.childSick.push({id:id(),child:$('#childName').value.trim(),from:$('#childFrom').value,to:$('#childTo').value,note:$('#childNote').value.trim(),createdAt:now()});await save();}
async function saveRehab(){state.rehabs.push({id:id(),status:$('#rehabStatus').value,clinic:$('#rehabClinic').value.trim(),from:$('#rehabFrom').value,to:$('#rehabTo').value,note:$('#rehabNote').value.trim(),createdAt:now()});await save();}

async function selectedFileData(inputId){const f=$(inputId).files[0];if(!f)return {name:'',mime:'',data:''};const data=f.type.startsWith('image/')?await imageForStorage(f):await fileToDataURL(f);return {name:f.name,mime:f.type,data};}
function addLungTest(){modal(`<div class="sheet-head"><strong>Lungenfunktion manuell</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Datum<input id="mLungDate" type="date"></label><label>Arzt / Praxis<input id="mLungDoctor" placeholder="optional"></label><label>Testart<input id="mLungType" placeholder="z. B. Spirometrie"></label><label>FEV1 (Liter)<input id="mLungFev1L" inputmode="decimal"></label><label>FEV1 (% Soll)<input id="mLungFev1P" inputmode="decimal"></label><label>FVC (Liter)<input id="mLungFvcL" inputmode="decimal"></label><label>FVC (% Soll)<input id="mLungFvcP" inputmode="decimal"></label><label>FEV1/FVC<input id="mLungRatio"></label><label class="wide">Weitere Werte<textarea id="mLungOther" rows="4"></textarea></label><label class="wide">Originalbefund (Foto/PDF)<input id="mLungFile" type="file" accept="image/*,.pdf"><span class="media-source-hint">📷 Kamera · 🖼 Fotomediathek · 📁 Dateien</span></label><label class="wide">Notiz<textarea id="mLungNote" rows="3"></textarea></label><button class="primary wide" onclick="commitLungTest()">Speichern</button></div>`);}
window.commitLungTest=async()=>{const f=await selectedFileData('#mLungFile');state.health.lungTests.push({id:id(),date:$('#mLungDate').value,doctor:$('#mLungDoctor').value.trim(),testType:$('#mLungType').value.trim(),fev1Liters:$('#mLungFev1L').value.trim(),fev1Percent:$('#mLungFev1P').value.trim(),fvcLiters:$('#mLungFvcL').value.trim(),fvcPercent:$('#mLungFvcP').value.trim(),ratio:$('#mLungRatio').value.trim(),otherValues:$('#mLungOther').value.trim(),note:$('#mLungNote').value.trim(),...f,createdAt:now()});await save();closeModal();};

function addLabResult(){modal(`<div class="sheet-head"><strong>Laborwerte</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Datum<input id="mLabDate" type="date"></label><label>Arzt / Labor<input id="mLabProvider" placeholder="optional"></label><label class="wide">Laborwerte<textarea id="mLabValues" rows="6" placeholder="z. B. CRP: 3 mg/l&#10;Leukozyten: 7,2 /nl&#10;... "></textarea></label><label class="wide">Laborbefund (Foto/PDF)<input id="mLabFile" type="file" accept="image/*,.pdf"><span class="media-source-hint">📷 Kamera · 🖼 Fotomediathek · 📁 Dateien</span></label><label class="wide">Notiz<textarea id="mLabNote" rows="3"></textarea></label><button class="primary wide" onclick="commitLabResult()">Speichern</button></div>`);}
window.commitLabResult=async()=>{const f=await selectedFileData('#mLabFile');state.health.labResults.push({id:id(),date:$('#mLabDate').value,provider:$('#mLabProvider').value.trim(),values:$('#mLabValues').value.trim(),note:$('#mLabNote').value.trim(),...f,createdAt:now()});await save();closeModal();};
function addDoctorLetter(){modal(`<div class="sheet-head"><strong>Arztbrief</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Datum<input id="mLetterDate" type="date"></label><label>Arzt / Praxis / Klinik<input id="mLetterDoctor"></label><label>Fachrichtung<input id="mLetterSpecialty" placeholder="z. B. Pneumologie"></label><label>Betreff<input id="mLetterSubject" placeholder="z. B. Befundbericht"></label><label class="wide">Arztbrief (Foto/PDF)<input id="mLetterFile" type="file" accept="image/*,.pdf"><span class="media-source-hint">📷 Kamera · 🖼 Fotomediathek · 📁 Dateien</span></label><label class="wide">Notiz<textarea id="mLetterNote" rows="3"></textarea></label><button class="primary wide" onclick="commitDoctorLetter()">Speichern</button></div>`);}
window.commitDoctorLetter=async()=>{const f=await selectedFileData('#mLetterFile');state.health.doctorLetters.push({id:id(),date:$('#mLetterDate').value,doctor:$('#mLetterDoctor').value.trim(),specialty:$('#mLetterSpecialty').value.trim(),subject:$('#mLetterSubject').value.trim(),note:$('#mLetterNote').value.trim(),...f,createdAt:now()});await save();closeModal();};
async function addManualShift(){modal(`<div class="sheet-head"><strong>Schicht hinzufügen</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Datum<input id="mShiftDate" type="date"></label><label>Schicht<input id="mShiftName" placeholder="Früh / Spät / Nacht"></label><label>Von<input id="mShiftStart" type="time"></label><label>Bis<input id="mShiftEnd" type="time"></label><label class="wide">Notiz<input id="mShiftNote"></label><button class="primary wide" onclick="commitManualShift()">Speichern</button></div>`);}
window.commitManualShift=async()=>{state.shifts.push({id:id(),date:$('#mShiftDate').value,shift:$('#mShiftName').value,start:$('#mShiftStart').value,end:$('#mShiftEnd').value,note:$('#mShiftNote').value,createdAt:now()});await save();closeModal();};
async function addManualAu(){modal(`<div class="sheet-head"><strong>AU hinzufügen</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Art<select id="mAuKind"><option>Erstbescheinigung</option><option>Folgebescheinigung</option></select></label><label>ICD‑10-Code(s)<input id="mAuCodes" placeholder="z. B. J45.9, J20.9"></label><label>Von<input id="mAuFrom" type="date"></label><label>Bis<input id="mAuTo" type="date"></label><label class="wide">Notiz<textarea id="mAuNote"></textarea></label><button class="primary wide" onclick="commitManualAu()">Speichern</button></div>`);}
window.commitManualAu=async()=>{state.aus.push({id:id(),kind:$('#mAuKind').value,from:$('#mAuFrom').value,to:$('#mAuTo').value,codes:$('#mAuCodes').value.toUpperCase().split(/[,;\s]+/).filter(Boolean),note:$('#mAuNote').value.trim(),createdAt:now()});await save();closeModal();};

async function saveSimpleDoc(type){const map={payroll:['payrollImage','payrollMonth'],stamp:['stampImage','stampMonth'],workplan:['workplanImage','workplanMonth']};const cfg=map[type];if(!cfg)return;const fileEl=$('#'+cfg[0]),monthEl=$('#'+cfg[1]);const f=fileEl?.files?.[0];if(!f){alert('Bitte zuerst ein Foto oder eine Datei auswählen.');return;}const data=f.type.startsWith('image/')?await imageForStorage(f):await fileToDataURL(f);state.documents.push({id:id(),type,month:monthEl?.value||'',name:f.name||'Dokument',mime:f.type||'',data,createdAt:now()});fileEl.value='';await save('Dokument gespeichert');}
async function saveAuPhoto(){const f=$('#auImage')?.files?.[0];if(!f){alert('Bitte zuerst eine AU als Foto oder Datei auswählen.');return;}const data=f.type.startsWith('image/')?await imageForStorage(f):await fileToDataURL(f);state.aus.push({id:id(),kind:'AU-Dokument',from:'',to:'',codes:[],note:'',name:f.name||'AU',mime:f.type||'',data,createdAt:now()});$('#auImage').value='';await save('AU gespeichert');}
async function saveLungPhoto(){const f=$('#lungImage')?.files?.[0];if(!f){alert('Bitte zuerst einen Lungenfunktionsbefund auswählen.');return;}const data=f.type.startsWith('image/')?await imageForStorage(f):await fileToDataURL(f);state.health.lungTests.push({id:id(),date:'',doctor:'',testType:'',fev1Liters:'',fev1Percent:'',fvcLiters:'',fvcPercent:'',ratio:'',otherValues:'',note:'',name:f.name||'Lungenfunktion',mime:f.type||'',data,createdAt:now()});$('#lungImage').value='';await save('Lungenfunktion gespeichert');}
async function saveLabPhoto(){const f=$('#labPhoto')?.files?.[0];if(!f){alert('Bitte zuerst einen Laborbefund auswählen.');return;}const data=f.type.startsWith('image/')?await imageForStorage(f):await fileToDataURL(f);state.health.labResults.push({id:id(),date:'',provider:'',values:'',note:'',name:f.name||'Laborbefund',mime:f.type||'',data,createdAt:now()});$('#labPhoto').value='';await save('Laborbefund gespeichert');}
async function saveLetterPhoto(){const f=$('#letterPhoto')?.files?.[0];if(!f){alert('Bitte zuerst einen Arztbrief auswählen.');return;}const data=f.type.startsWith('image/')?await imageForStorage(f):await fileToDataURL(f);state.health.doctorLetters.push({id:id(),date:'',doctor:'',specialty:'',subject:'',note:'',name:f.name||'Arztbrief',mime:f.type||'',data,createdAt:now()});$('#letterPhoto').value='';await save('Arztbrief gespeichert');}

async function saveContractFile(){const f=$('#contractFile').files[0];if(!f)return alert('Bitte Datei auswählen.');const data=f.type.startsWith('image/')?await imageForStorage(f):await fileToDataURL(f);state.company.contracts.push({id:id(),name:f.name,type:f.type,data,createdAt:now()});$('#contractFile').value='';await save();}

window.viewDoc=(ident,kind)=>{let obj;if(kind==='contract')obj=state.company.contracts.find(x=>x.id===ident);if(kind==='notice')obj=state.notices.find(x=>x.id===ident)?.file;if(kind==='doc')obj=state.documents.find(x=>x.id===ident);if(kind==='au')obj=state.aus.find(x=>x.id===ident);if(kind==='lung')obj=state.health.lungTests.find(x=>x.id===ident);if(kind==='lab')obj=state.health.labResults.find(x=>x.id===ident);if(kind==='letter')obj=state.health.doctorLetters.find(x=>x.id===ident);const data=obj?.data||obj?.image;if(!data)return;const w=window.open();if(!w)return alert('Popup wurde blockiert.');if(data.startsWith('data:application/pdf'))w.location=data;else w.document.write(`<title>WorksManager Dokument</title><img src="${data}" style="max-width:100%;height:auto">`);};
window.delShift=async x=>{if(confirm('Schicht löschen?')){state.shifts=state.shifts.filter(y=>y.id!==x);await save();}};
window.delMeeting=async x=>{if(confirm('Eintrag löschen?')){state.meetings=state.meetings.filter(y=>y.id!==x);await save();}};
window.delNotice=async x=>{if(confirm('Aushang löschen?')){state.notices=state.notices.filter(y=>y.id!==x);await save();}};
window.delDoc=async x=>{if(confirm('Dokument löschen?')){state.documents=state.documents.filter(y=>y.id!==x);await save();}};
window.delAu=async x=>{if(confirm('AU löschen?')){state.aus=state.aus.filter(y=>y.id!==x);await save();}};
window.delHealth=async (x,kind)=>{if(!confirm('Gesundheitseintrag löschen?'))return;const key=kind==='lung'?'lungTests':kind==='lab'?'labResults':'doctorLetters';state.health[key]=state.health[key].filter(y=>y.id!==x);await save();};
window.delChild=async x=>{if(confirm('Eintrag löschen?')){state.childSick=state.childSick.filter(y=>y.id!==x);await save();}};
window.delRehab=async x=>{if(confirm('Eintrag löschen?')){state.rehabs=state.rehabs.filter(y=>y.id!==x);await save();}};
window.delContract=async x=>{if(confirm('Arbeitsvertrag löschen?')){state.company.contracts=state.company.contracts.filter(y=>y.id!==x);await save();}};
window.closeModal=closeModal;


function reportYearFromValue(value){
  const m=String(value||'').match(/^(\d{4})/);
  return m?m[1]:'';
}
function reportEntryYear(item,fields=[]){
  for(const f of fields){const y=reportYearFromValue(item?.[f]);if(y)return y;}
  return reportYearFromValue(item?.createdAt);
}
function reportInYear(item,fields,year){return reportEntryYear(item,fields)===String(year);}
function reportRangeOverlapsYear(from,to,year,createdAt=''){
  const y=String(year),startYear=`${y}-01-01`,endYear=`${y}-12-31`;
  const a=from||to,b=to||from;
  if(a&&b)return a<=endYear&&b>=startYear;
  return reportYearFromValue(createdAt)===y;
}
function reportDateOrdinal(value){
  const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;
  return Math.floor(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]))/86400000);
}
function reportDaysWithinYear(from,to,year){
  if(!from||!to)return 0;
  const y=String(year),start=`${y}-01-01`,end=`${y}-12-31`;
  const a=from<start?start:from,b=to>end?end:to;
  const ao=reportDateOrdinal(a),bo=reportDateOrdinal(b);
  return ao===null||bo===null||bo<ao?0:bo-ao+1;
}
function reportFormatDateTime(value){
  if(!value)return '—';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);
  return d.toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});
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
  for(const x of state.health.lungTests)add(x.date||x.createdAt);
  for(const x of state.health.labResults)add(x.date||x.createdAt);
  for(const x of state.health.doctorLetters)add(x.date||x.createdAt);
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
  const lungTests=state.health.lungTests.filter(x=>reportInYear(x,['date'],y));
  const labResults=state.health.labResults.filter(x=>reportInYear(x,['date'],y));
  const doctorLetters=state.health.doctorLetters.filter(x=>reportInYear(x,['date'],y));
  const contracts=(state.company.contracts||[]).filter(x=>reportInYear(x,[],y));
  const attachments={};
  for(const [key,arr] of Object.entries(state.attachments||{}))attachments[key]=(arr||[]).filter(x=>reportInYear(x,[],y));
  return {year:y,shifts,meetings,notices,documents,aus,childSick,rehabs,stairs,lungTests,labResults,doctorLetters,contracts,attachments};
}
function reportSummary(year){
  const d=reportYearData(year);
  const auDays=d.aus.reduce((n,x)=>n+reportDaysWithinYear(x.from,x.to,d.year),0);
  const childDays=d.childSick.reduce((n,x)=>n+reportDaysWithinYear(x.from,x.to,d.year),0);
  const stair=stairStats(d.stairs);
  const health=d.lungTests.length+d.labResults.length+d.doctorLetters.length;
  const attached=Object.values(d.attachments).reduce((n,a)=>n+a.length,0);
  const healthDocs=[...d.lungTests,...d.labResults,...d.doctorLetters].filter(x=>x.data).length;
  const noticeDocs=d.notices.filter(x=>x.file).length;
  const auDocs=d.aus.filter(x=>x.data||x.image||x.name).length;
  const docs=d.documents.length+d.contracts.length+attached+healthDocs+noticeDocs+auDocs;
  return {...d,auDays,childDays,stair,health,docs};
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
  if($('#annualStatHealth'))$('#annualStatHealth').textContent=s.health;
  if($('#annualStatMeetings'))$('#annualStatMeetings').textContent=s.meetings.length;
  const preview=$('#annualPreview');
  if(preview)preview.innerHTML=`<div class="annual-preview-grid">
    <div><strong>AU</strong><span>${s.aus.length} Fälle · ${s.auDays} Kalendertage</span></div>
    <div><strong>Kind krank</strong><span>${s.childSick.length} Einträge · ${s.childDays} Kalendertage</span></div>
    <div><strong>Schichten</strong><span>${s.shifts.length} Einträge</span></div>
    <div><strong>Treppen</strong><span>${s.stair.total} gesamt · ${s.stair.entries} Einträge · ${s.stair.days} aktive Tage</span></div>
    <div><strong>Gesundheit</strong><span>${s.health} Einträge</span></div>
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
  row('Gesundheitseinträge',d.health);
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
  section('Krankheit & AU',d.aus,x=>`${x.from?fmtDate(x.from):'ohne Von-Datum'}${x.to?' bis '+fmtDate(x.to):''} · ${reportText(x.kind,'AU')}${x.codes?.length?' · ICD-10: '+x.codes.join(', '):''}${x.note?' · '+reportOneLine(x.note):''}${x.name?' · Datei: '+reportOneLine(x.name):''}`);
  section('Kind krank',d.childSick,x=>`${reportText(x.child,'Kind')} · ${x.from?fmtDate(x.from):'ohne Von-Datum'}${x.to?' bis '+fmtDate(x.to):''}${x.note?' · '+reportOneLine(x.note):''}`);
  section('BEM · AMZ · Gespräche',d.meetings,x=>`${reportText(x.type,'Gespräch')} · ${x.date?fmtDate(x.date):'ohne Datum'}${x.time?' '+x.time:''}${x.partner?' · '+reportOneLine(x.partner):''}${x.place?' · '+reportOneLine(x.place):''}${x.note?' · '+reportOneLine(x.note):''}`);
  section('Aushänge',d.notices,x=>`${reportText(x.type,'Aushang')} · ${x.date?fmtDate(x.date):'ohne Datum'} · ${reportText(x.title,'ohne Titel')}${x.note?' · '+reportOneLine(x.note):''}${x.file?.name?' · Datei: '+reportOneLine(x.file.name):''}`);
  section('Abrechnung · Stempelübersicht · Arbeitsplan',d.documents,x=>`${x.month?monthLabel(x.month):'ohne Monat'} · ${x.type==='payroll'?'Lohnabrechnung':x.type==='stamp'?'Stempelübersicht':x.type==='workplan'?'Arbeitsplan':reportText(x.type,'Dokument')} · Datei: ${reportText(x.name,'Dokument')}`);

  h2('Gesundheit');
  h3('Lungenfunktion');
  if(!d.lungTests.length)bullet('Keine Einträge.');
  else d.lungTests.forEach(x=>bullet(`${x.date?fmtDate(x.date):'ohne Datum'}${x.doctor?' · '+reportOneLine(x.doctor):''}${x.testType?' · '+reportOneLine(x.testType):''}${x.fev1Liters?' · FEV1 '+x.fev1Liters+' L':''}${x.fev1Percent?' / '+x.fev1Percent+' %':''}${x.fvcLiters?' · FVC '+x.fvcLiters+' L':''}${x.fvcPercent?' / '+x.fvcPercent+' %':''}${x.ratio?' · FEV1/FVC '+x.ratio:''}${x.otherValues?' · '+reportOneLine(x.otherValues):''}${x.note?' · '+reportOneLine(x.note):''}${x.name?' · Datei: '+reportOneLine(x.name):''}`));
  h3('Laborwerte');
  if(!d.labResults.length)bullet('Keine Einträge.');
  else d.labResults.forEach(x=>bullet(`${x.date?fmtDate(x.date):'ohne Datum'}${x.provider?' · '+reportOneLine(x.provider):''}${x.values?' · '+reportOneLine(x.values):''}${x.note?' · '+reportOneLine(x.note):''}${x.name?' · Datei: '+reportOneLine(x.name):''}`));
  h3('Arztbriefe');
  if(!d.doctorLetters.length)bullet('Keine Einträge.');
  else d.doctorLetters.forEach(x=>bullet(`${x.date?fmtDate(x.date):'ohne Datum'}${x.doctor?' · '+reportOneLine(x.doctor):''}${x.specialty?' · '+reportOneLine(x.specialty):''}${x.subject?' · '+reportOneLine(x.subject):''}${x.note?' · '+reportOneLine(x.note):''}${x.name?' · Datei: '+reportOneLine(x.name):''}`));
  empty();

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

async function exportBackup(){const payload=await dbGet('payload');const salt=await dbGet('salt');const blob=new Blob([JSON.stringify({app:'WorksManager',version:1,salt,payload,exportedAt:now()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`WorksManager-Backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function importBackup(file){try{const j=JSON.parse(await file.text());if(j.app!=='WorksManager'||!j.salt||!j.payload)throw new Error('Ungültiges Backup');await dbPut('salt',j.salt);await dbPut('payload',j.payload);alert('Backup importiert. Bitte erneut mit dem Backup-Passwort öffnen.');lock();}catch(e){alert('Backup konnte nicht importiert werden: '+e.message);}}

function bind(){
  $('#unlockBtn').onclick=unlock;$('#unlockPassword').addEventListener('keydown',e=>{if(e.key==='Enter')unlock();});$('#lockBtn').onclick=lock;
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));$('#moreBtn').onclick=()=>$('#moreMenu').classList.remove('hidden');$('#closeMore').onclick=()=>$('#moreMenu').classList.add('hidden');$('#moreMenu').addEventListener('click',e=>{if(e.target===$('#moreMenu'))$('#moreMenu').classList.add('hidden');});$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});
  $('#saveStairEntry').onclick=saveStairEntry;
  $('#annualYear').onchange=renderAnnualReport;$('#createAnnualPdf').onclick=createAnnualPdf;
  $('#saveCompany').onclick=saveCompany;$('#saveContractFile').onclick=saveContractFile;$('#saveMeeting').onclick=saveMeeting;$('#saveNotice').onclick=saveNotice;$('#saveChild').onclick=saveChild;$('#saveRehab').onclick=saveRehab;
  $('#addLungTest').onclick=addLungTest;$('#addLabResult').onclick=addLabResult;$('#addDoctorLetter').onclick=addDoctorLetter;$('#addShiftManual').onclick=addManualShift;$('#addAuManual').onclick=addManualAu;
  $('#saveAuPhoto').onclick=saveAuPhoto;$('#saveLungPhoto').onclick=saveLungPhoto;$('#saveLabPhoto').onclick=saveLabPhoto;$('#saveLetterPhoto').onclick=saveLetterPhoto;
  $$('[data-docsave]').forEach(b=>b.onclick=()=>saveSimpleDoc(b.dataset.docsave));
  $$('[data-attachment-section]').forEach(b=>b.onclick=()=>saveGenericAttachment(b.dataset.attachmentSection,b.dataset.attachmentInput));
  $('#exportBackup').onclick=exportBackup;$('#importBackup').onchange=e=>e.target.files[0]&&importBackup(e.target.files[0]);
  $('#wipeData').onclick=async()=>{if(confirm('Wirklich ALLE lokalen WorksManager-Daten löschen?')){await dbClear();location.reload();}};
}

(async function init(){
  db=await openDB();bind();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{try{if(!sessionStorage.getItem('wm-sw-reload')){sessionStorage.setItem('wm-sw-reload','1');location.reload();}}catch{}});
    navigator.serviceWorker.register('./sw.js').then(r=>r.update()).catch(()=>{});
  }
  const has=await dbGet('payload');
  $('#unlockHint').textContent=has?'Daten vorhanden – mit deinem Passwort öffnen.':'Erster Start: Dieses Passwort verschlüsselt deine Daten. Merke es dir; es kann nicht wiederhergestellt werden.';
})();
