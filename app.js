'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const enc = new TextEncoder();
const dec = new TextDecoder();
let state = blankState();
let cryptoKey = null;
let db = null;
let pendingAuOriginal = null;
let pendingLungOriginal = null;
let pendingWorkplanOriginal = null;

function blankState(){return {version:2,company:{name:'',employeeName:'',contractStart:'',employeeNo:'',notes:'',contracts:[]},shifts:[],meetings:[],notices:[],documents:[],aus:[],childSick:[],rehabs:[],health:{lungTests:[],labResults:[],doctorLetters:[]}};}
function normalizeState(v){const base=blankState();const x=v&&typeof v==='object'?v:{};x.company={...base.company,...(x.company||{})};x.company.contracts=Array.isArray(x.company.contracts)?x.company.contracts:[];for(const k of ['shifts','meetings','notices','documents','aus','childSick','rehabs'])x[k]=Array.isArray(x[k])?x[k]:[];x.health=x.health&&typeof x.health==='object'?x.health:{};x.health.lungTests=Array.isArray(x.health.lungTests)?x.health.lungTests:[];x.health.labResults=Array.isArray(x.health.labResults)?x.health.labResults:[];x.health.doctorLetters=Array.isArray(x.health.doctorLetters)?x.health.doctorLetters:[];x.version=2;return x;}
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
function b64(buf){return btoa(String.fromCharCode(...new Uint8Array(buf)));}
function unb64(s){const x=atob(s);const a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a.buffer;}
async function deriveKey(password,salt){const base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encryptState(){const iv=crypto.getRandomValues(new Uint8Array(12));const plain=enc.encode(JSON.stringify(state));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,plain);return {iv:b64(iv),cipher:b64(cipher),updatedAt:now()};}
async function decryptPayload(payload,key){const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(unb64(payload.iv))},key,unb64(payload.cipher));return JSON.parse(dec.decode(plain));}
async function save(){if(!cryptoKey)return;await dbPut('payload',await encryptState());renderAll();}

async function unlock(){const pass=$('#unlockPassword').value;if(!pass){$('#unlockHint').textContent='Bitte Passwort eingeben.';return;}try{let saltB64=await dbGet('salt');if(!saltB64){const salt=crypto.getRandomValues(new Uint8Array(16));saltB64=b64(salt);await dbPut('salt',saltB64);}cryptoKey=await deriveKey(pass,new Uint8Array(unb64(saltB64)));const payload=await dbGet('payload');if(payload){state=normalizeState(await decryptPayload(payload,cryptoKey));}else{state=blankState();await save();}$('#unlock').classList.add('hidden');$('#app').classList.remove('hidden');$('#unlockPassword').value='';$('#unlockHint').textContent='';renderAll();}catch(e){cryptoKey=null;$('#unlockHint').textContent='Passwort falsch oder Daten beschädigt.';}}
function lock(){cryptoKey=null;state=blankState();pendingAuOriginal=null;pendingLungOriginal=null;pendingWorkplanOriginal=null;$('#app').classList.add('hidden');$('#unlock').classList.remove('hidden');}

async function loadTesseract(){if(window.Tesseract)return window.Tesseract;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});return window.Tesseract;}
async function ocrFile(file,statusEl){if(!file)throw new Error('Kein Bild ausgewählt.');if(!file.type.startsWith('image/'))throw new Error('OCR unterstützt hier nur Bilddateien. PDFs werden gespeichert, aber nicht automatisch gelesen.');statusEl.textContent='OCR wird lokal geladen …';const T=await loadTesseract();const image=await compressImage(file,1800,.9);statusEl.textContent='Texterkennung läuft lokal auf diesem Gerät …';const result=await T.recognize(image,'deu+eng',{logger:m=>{if(m.progress!=null)statusEl.textContent=`Texterkennung: ${Math.round(m.progress*100)} %`;}});statusEl.textContent='Erkennung abgeschlossen. Bitte Ergebnis prüfen.';return {text:result.data.text,image};}

function go(name){$$('.page').forEach(p=>p.classList.toggle('active',p.id===name));$$('.nav-btn[data-go]').forEach(b=>b.classList.toggle('active',b.dataset.go===name));$('#moreMenu').classList.add('hidden');window.scrollTo({top:0,behavior:'smooth'});}

function renderAll(){renderDashboard();renderCompany();renderShifts();renderMeetings();renderNotices();renderDocs();renderAUs();renderHealth();renderChild();renderRehab();}
function renderDashboard(){const auDays=state.aus.reduce((s,a)=>s+daysInclusive(a.from,a.to),0);const healthEntries=state.health.lungTests.length+state.health.labResults.length+state.health.doctorLetters.length;const healthDocs=[...state.health.lungTests,...state.health.labResults,...state.health.doctorLetters].filter(x=>x.data).length;$('#statAuDays').textContent=auDays;$('#statAuCases').textContent=state.aus.length;$('#statChildCases').textContent=state.childSick.length;$('#statShifts').textContent=state.shifts.length;$('#statDocs').textContent=state.documents.length+state.company.contracts.length+state.notices.filter(n=>n.file).length+healthDocs;$('#statHealthEntries').textContent=healthEntries;$('#welcomeText').textContent=state.company.employeeName?`${state.company.employeeName}${state.company.name?' · '+state.company.name:''}`:'Noch kein Mitarbeitername hinterlegt.';}
function renderCompany(){const c=state.company;$('#companyName').value=c.name||'';$('#employeeName').value=c.employeeName||'';$('#contractStart').value=c.contractStart||'';$('#employeeNo').value=c.employeeNo||'';$('#companyNotes').value=c.notes||'';$('#contractList').innerHTML=(c.contracts||[]).map(x=>itemHtml('Arbeitsvertrag',x.name||'Dokument',x.createdAt,[`<button onclick="viewDoc('${x.id}','contract')">Öffnen</button>`,`<button onclick="delContract('${x.id}')">Löschen</button>`])).join('')||empty('Noch kein Arbeitsvertrag gespeichert.');}
function renderShifts(){const arr=[...state.shifts].sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#shiftList').innerHTML=arr.map(s=>itemHtml(`${fmtDate(s.date)} · ${esc(s.shift||'Schicht')}`,`${esc(s.start||'—')}–${esc(s.end||'—')}${s.note?' · '+esc(s.note):''}`,s.createdAt,[`<button onclick="delShift('${s.id}')">Löschen</button>`])).join('')||empty('Noch keine Schichten gespeichert.');}
function renderMeetings(){const arr=[...state.meetings].sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#meetingList').innerHTML=arr.map(m=>itemHtml(`${esc(m.type)} · ${fmtDate(m.date)}`,`${esc(m.time||'')} ${esc(m.partner||'')}${m.place?' · '+esc(m.place):''}${m.note?' · '+esc(m.note):''}`,m.createdAt,[`<button onclick="delMeeting('${m.id}')">Löschen</button>`])).join('')||empty('Noch keine Einträge.');}
function renderNotices(){const arr=[...state.notices].sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#noticeList').innerHTML=arr.map(n=>itemHtml(`${esc(n.type)} · ${esc(n.title||'Aushang')}`,`${fmtDate(n.date)}${n.note?' · '+esc(n.note):''}`,n.createdAt,[n.file?`<button onclick="viewDoc('${n.id}','notice')">Dokument</button>`:'',`<button onclick="delNotice('${n.id}')">Löschen</button>`])).join('')||empty('Noch keine Aushänge.');}
function renderDocs(){
  const arr=[...state.documents].sort((a,b)=>(b.month||'').localeCompare(a.month||''));
  $('#payrollList').innerHTML=arr.map(d=>{
    const label=d.type==='payroll'?'Lohnabrechnung':d.type==='stamp'?'Stempelübersicht':'Arbeitsplan';
    let meta='Dokument gespeichert';
    if(d.type==='workplan'&&d.analysis){
      const a=d.analysis;
      const bits=[];
      if(a.employee)bits.push('Person: '+esc(a.employee));
      if(Number.isFinite(a.detectedShiftCount))bits.push(a.detectedShiftCount+' Schicht'+(a.detectedShiftCount===1?'':'en')+' erkannt');
      if(Number.isFinite(a.importedShiftCount))bits.push(a.importedShiftCount+' übernommen');
      if(a.statuses?.length)bits.push('Status: '+esc(a.statuses.join(', ')));
      meta=bits.join(' · ')||'Arbeitsplan analysiert';
    }else if(d.ocrText){
      meta=`${esc(d.ocrText.slice(0,120))}${d.ocrText.length>120?'…':''}`;
    }
    return itemHtml(`${label} · ${esc(d.month||'ohne Monat')}`,meta,d.createdAt,[`<button onclick="viewDoc('${d.id}','doc')">Original</button>`,`<button onclick="delDoc('${d.id}')">Löschen</button>`]);
  }).join('')||empty('Noch keine Abrechnungen, Stempelübersichten oder Arbeitspläne.');
}
function renderAUs(){const arr=[...state.aus].sort((a,b)=>(b.from||'').localeCompare(a.from||''));const days=arr.reduce((s,a)=>s+daysInclusive(a.from,a.to),0),follow=arr.filter(a=>a.kind==='Folgebescheinigung').length;$('#auCases').textContent=arr.length;$('#auDays').textContent=days;$('#auFollow').textContent=follow;$('#statAuDays').textContent=days;$('#statAuCases').textContent=arr.length;$('#auList').innerHTML=arr.map(a=>itemHtml(`${fmtDate(a.from)}–${fmtDate(a.to)} · ${esc(a.kind||'AU')}`,`${a.codes?.length?'ICD‑10: '+esc(a.codes.join(', ')):'Kein ICD‑10 gespeichert'}${a.note?' · '+esc(a.note):''}`,a.createdAt,[(a.data||a.image)?`<button onclick="viewDoc('${a.id}','au')">Original-AU ansehen</button>`:'',`<button onclick="delAu('${a.id}')">Löschen</button>`])).join('')||empty('Noch keine AU gespeichert.');const counts={};arr.forEach(a=>(a.codes||[]).forEach(c=>counts[c]=(counts[c]||0)+1));const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]);$('#icdStats').innerHTML=rows.map(([c,n])=>`<div class="item"><div class="item-top"><div><div class="item-title">${esc(c)}</div><div class="item-meta">Krankschreibungen mit diesem Code</div></div><strong>${n}×</strong></div></div>`).join('')||empty('Noch keine ICD‑10-Codes gespeichert.');}
function renderHealth(){
  const lung=[...state.health.lungTests].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  $('#lungTestList').innerHTML=lung.map(x=>{
    const vals=[];
    if(x.fev1Percent) vals.push(`FEV1 ${esc(x.fev1Percent)} %`);
    if(x.fev1Liters) vals.push(`FEV1 ${esc(x.fev1Liters)} L`);
    if(x.fvcPercent) vals.push(`FVC ${esc(x.fvcPercent)} %`);
    if(x.fvcLiters) vals.push(`FVC ${esc(x.fvcLiters)} L`);
    if(x.ratio) vals.push(`FEV1/FVC ${esc(x.ratio)}`);
    if(x.testType) vals.push(esc(x.testType));
    const extra=x.otherValues?` · ${esc(x.otherValues).replace(/\n/g,' · ')}`:'';
    return itemHtml(`Lungenfunktion · ${fmtDate(x.date)}`,`${x.doctor?esc(x.doctor)+' · ':''}${vals.join(' · ')||'Messwerte gespeichert'}${extra}${x.note?' · '+esc(x.note):''}`,x.createdAt,[(x.data||x.image)?`<button onclick="viewDoc('${x.id}','lung')">Originalbefund</button>`:'',`<button onclick="delHealth('${x.id}','lung')">Löschen</button>`]);
  }).join('')||empty('Noch keine Lungenfunktionstests gespeichert.');
  const labs=[...state.health.labResults].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  $('#labResultList').innerHTML=labs.map(x=>itemHtml(`Labor · ${fmtDate(x.date)}`,`${x.provider?esc(x.provider)+' · ':''}${x.values?esc(x.values).replace(/\n/g,' · '):'Keine Werte eingetragen'}${x.note?' · '+esc(x.note):''}`,x.createdAt,[x.data?`<button onclick="viewDoc('${x.id}','lab')">Befund</button>`:'',`<button onclick="delHealth('${x.id}','lab')">Löschen</button>`])).join('')||empty('Noch keine Laborwerte gespeichert.');
  const letters=[...state.health.doctorLetters].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  $('#doctorLetterList').innerHTML=letters.map(x=>itemHtml(`${esc(x.subject||'Arztbrief')} · ${fmtDate(x.date)}`,`${x.doctor?esc(x.doctor):'Arzt/Praxis nicht angegeben'}${x.specialty?' · '+esc(x.specialty):''}${x.note?' · '+esc(x.note):''}`,x.createdAt,[x.data?`<button onclick="viewDoc('${x.id}','letter')">Arztbrief</button>`:'',`<button onclick="delHealth('${x.id}','letter')">Löschen</button>`])).join('')||empty('Noch keine Arztbriefe gespeichert.');
}
function renderChild(){const arr=[...state.childSick].sort((a,b)=>(b.from||'').localeCompare(a.from||''));$('#childList').innerHTML=arr.map(x=>itemHtml(`${esc(x.child||'Kind')} · ${fmtDate(x.from)}–${fmtDate(x.to)}`,x.note||'',x.createdAt,[`<button onclick="delChild('${x.id}')">Löschen</button>`])).join('')||empty('Noch keine Einträge.');}
function renderRehab(){const arr=[...state.rehabs].sort((a,b)=>(b.from||'').localeCompare(a.from||''));$('#rehabList').innerHTML=arr.map(x=>itemHtml(`${esc(x.status)} · ${esc(x.clinic||'Reha')}`,`${fmtDate(x.from)}–${fmtDate(x.to)}${x.note?' · '+esc(x.note):''}`,x.createdAt,[`<button onclick="delRehab('${x.id}')">Löschen</button>`])).join('')||empty('Noch keine Reha-Einträge.');}
function itemHtml(title,meta,created,actions=[]){return `<div class="item"><div class="item-top"><div><div class="item-title">${title}</div><div class="item-meta">${meta||''}</div></div></div><div class="item-actions">${actions.filter(Boolean).join('')}</div></div>`;}
function empty(t){return `<div class="muted">${esc(t)}</div>`;}

function modal(html){$('#modalCard').innerHTML=html;$('#modal').classList.remove('hidden');}
function closeModal(){$('#modal').classList.add('hidden');}

function extractPrintedIcdCodes(text){
  let t=String(text||'').toUpperCase()
    .replace(/([A-TV-Z])\s+([0-9O]{2})/g,'$1$2')
    .replace(/([A-TV-Z][0-9O]{2})\s*[,\.]\s*([0-9O]{1,2})/g,'$1.$2')
    .replace(/\b([A-TV-Z])([0-9O]{2})([0-9O]{2})\b/g,'$1$2.$3')
    .replace(/\b([A-TV-Z][0-9O]{2})\s+([0-9O]{1,2})\b/g,'$1.$2');
  const matches=t.match(/\b[A-TV-Z][0-9O]{2}(?:\.[0-9O]{1,2})?\b/g)||[];
  return [...new Set(matches.map(raw=>raw[0]+raw.slice(1).replace(/O/g,'0')))];
}
function inferIcdFromDiagnosisText(text){
  const s=String(text||'').toLowerCase().replace(/\s+/g,' ');
  const found=[];
  const add=(code,label,match)=>{if(!found.some(x=>x.code===code))found.push({code,label,match});};

  if(/status asthmaticus|akutes schweres asthma bronchiale/.test(s)) add('J46','Status asthmaticus / akutes schweres Asthma','Asthma');
  else if(/(?:allergisch|atopisch|extrinsisch).{0,30}asthma|asthma.{0,30}(?:allergisch|atopisch|extrinsisch)/.test(s)) add('J45.09','Vorwiegend allergisches Asthma bronchiale, Kontrollstatus/Schweregrad nicht angegeben','Asthma');
  else if(/(?:nichtallergisch|intrinsisch).{0,30}asthma|asthma.{0,30}(?:nichtallergisch|intrinsisch)/.test(s)) add('J45.19','Nichtallergisches Asthma bronchiale, Kontrollstatus/Schweregrad nicht angegeben','Asthma');
  else if(/asthma bronchiale|asthmatische bronchitis/.test(s)) add('J45.99','Asthma bronchiale, nicht näher bezeichnet; Kontrollstatus/Schweregrad nicht angegeben','Asthma');

  const rules=[
    {re:/grippaler infekt|akute infektion (?:der )?oberen atemwege/,code:'J06.9',label:'Akute Infektion der oberen Atemwege, nicht näher bezeichnet'},
    {re:/akute bronchitis/,code:'J20.9',label:'Akute Bronchitis, nicht näher bezeichnet'},
    {re:/akute infektion (?:der )?unteren atemwege/,code:'J22',label:'Akute Infektion der unteren Atemwege, nicht näher bezeichnet'},
    {re:/akute sinusitis|akute nasennebenhöhlenentzündung/,code:'J01.9',label:'Akute Sinusitis, nicht näher bezeichnet'},
    {re:/akute pharyngitis|akute rachenentzündung/,code:'J02.9',label:'Akute Pharyngitis, nicht näher bezeichnet'},
    {re:/akute tonsillitis|akute mandelentzündung/,code:'J03.9',label:'Akute Tonsillitis, nicht näher bezeichnet'},
    {re:/pollenallergie|heuschnupfen|pollinose/,code:'J30.1',label:'Allergische Rhinopathie durch Pollen'},
    {re:/allergische (?:rhinitis|rhinopathie)/,code:'J30.4',label:'Allergische Rhinopathie, nicht näher bezeichnet'},
    {re:/chronische rhinitis/,code:'J31.0',label:'Chronische Rhinitis'},
    {re:/chronische sinusitis/,code:'J32.9',label:'Chronische Sinusitis, nicht näher bezeichnet'}
  ];
  for(const r of rules){if(r.re.test(s))add(r.code,r.label,r.re.source);}
  if(/covid[- ]?19|sars[- ]?cov[- ]?2/.test(s) && /(?:virus\s*)?(?:nachgewiesen|positiv)/.test(s)) add('U07.1','COVID-19, Virus nachgewiesen','COVID-19');
  return found;
}
function parseAuText(text){
  const lower=String(text||'').toLowerCase();
  const kind=/folge|folgebescheinigung/.test(lower)?'Folgebescheinigung':'Erstbescheinigung';
  const dates=[...String(text||'').matchAll(/\b\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}\b/g)].map(m=>normalizeDate(m[0])).filter(Boolean);
  const unique=[...new Set(dates)];
  const printedCodes=extractPrintedIcdCodes(text);
  const inferred=printedCodes.length?[]:inferIcdFromDiagnosisText(text);
  const codes=printedCodes.length?printedCodes:inferred.map(x=>x.code);
  return {kind,from:unique[0]||'',to:unique[1]||unique[0]||'',codes:[...new Set(codes)],printedCodes,inferred};
}
function lungNumber(v){
  const n=parseFloat(String(v||'').replace(',','.'));
  return Number.isFinite(n)?n:null;
}
function lungFormat(v,decimals=2){
  if(v===null||v===undefined||!Number.isFinite(v))return '';
  return Number(v).toLocaleString('de-DE',{maximumFractionDigits:decimals,minimumFractionDigits:0});
}
function lungNumbers(line){
  return [...String(line||'').matchAll(/-?\d+(?:[.,]\d+)?/g)].map(m=>({raw:m[0],value:lungNumber(m[0]),index:m.index||0})).filter(x=>x.value!==null);
}
function lungMetricFromLine(line,kind='volume'){
  const nums=lungNumbers(line);
  if(!nums.length)return {value:'',percent:''};
  const explicitPct=[...String(line).matchAll(/(-?\d+(?:[.,]\d+)?)\s*%/g)].map(m=>lungNumber(m[1])).filter(x=>x!==null);
  let percent=explicitPct.length?explicitPct[explicitPct.length-1]:null;
  let actual=null;
  const values=nums.map(x=>x.value);

  if(kind==='ratio'){
    // Häufige Tabellenreihenfolge: Soll | Ist | %Soll. Dann ist der mittlere Wert der gemessene Quotient.
    if(values.length>=3 && values[values.length-1]>=10 && values[values.length-1]<=250) actual=values[values.length-2];
    else if(values.length>=2 && percent!==null) actual=values[values.length-2];
    else if(values.length>=2) actual=values[values.length-1];
    else actual=values[0];
    if(actual!==null && actual>0 && actual<=1.5)return {value:lungFormat(actual,2),percent:percent!==null?lungFormat(percent,0):''};
    return {value:actual!==null?lungFormat(actual,1)+(actual<=100?' %':''):'',percent:percent!==null?lungFormat(percent,0):''};
  }

  if(percent===null && values.length>=2){
    const last=values[values.length-1];
    const prev=values[values.length-2];
    // Prozentwerte stehen auf vielen Lufu-Ausdrucken in der letzten Spalte, auch ohne Prozentzeichen.
    if(last>=10 && last<=250 && prev>=0 && prev<20) percent=last;
  }
  if(percent!==null && values.length>=2){
    // Gemessener Wert ist typischerweise direkt vor der %-Soll-Spalte.
    actual=values[values.length-2];
  }else{
    const plausible=values.filter(v=>kind==='flow' ? v>=0 && v<=25 : v>=0 && v<=15);
    actual=plausible.length?plausible[plausible.length-1]:values[values.length-1];
  }
  return {value:actual!==null?lungFormat(actual,2):'',percent:percent!==null?lungFormat(percent,0):''};
}
function parseLungFunctionText(text){
  const raw=String(text||'');
  const lines=raw.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const lower=raw.toLowerCase();

  let date='';
  const dateLine=lines.find(l=>/(?:datum|untersuch|messung|test)/i.test(l) && /\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(l));
  const dateMatch=(dateLine||raw).match(/\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b/);
  if(dateMatch)date=normalizeDate(dateMatch[0]);

  let doctor='';
  const doctorLine=lines.find(l=>/(?:praxis|klinik|zentrum|ambulanz|dr\.?\s|pneumolog|lungenfach)/i.test(l) && l.length<=120);
  if(doctorLine)doctor=doctorLine;

  const types=[];
  if(/bodypleth|ganzkörperpleth/i.test(raw))types.push('Bodyplethysmographie');
  if(/spirometr/i.test(raw))types.push('Spirometrie');
  if(/diffusionskapaz|\bdlco\b|transferfaktor/i.test(raw))types.push('Diffusionsmessung');
  if(/broncholy|bronchodilat|salbutamol|reversibil/i.test(raw))types.push('Broncholyse/Provokation');
  const testType=[...new Set(types)].join(' + ');

  const findLine=(re,exclude)=>lines.find(l=>re.test(l) && !(exclude&&exclude.test(l)))||'';
  const fev1Line=findLine(/\bFEV\s*1\b|\bFEV1\b|sekundenkapaz/i,/FEV\s*1\s*[\/\\]\s*(?:FVC|VC)|tiff/i);
  const fvcLine=findLine(/\bFVC\b|forcierte\s+vitalkap/i);
  const ratioLine=findLine(/FEV\s*1\s*[\/\\]\s*(?:FVC|VC)|FEV1\s*%\s*(?:FVC|VC)|tiff(?:eneau)?/i);
  const fev1=lungMetricFromLine(fev1Line,'volume');
  const fvc=lungMetricFromLine(fvcLine,'volume');
  const ratio=lungMetricFromLine(ratioLine,'ratio');

  const metricDefs=[
    ['PEF',/\bPEF\b|peak\s*flow/i,'flow'],
    ['VC',/(?:^|\s)(?:VC|max\.?\s*VC|VCmax|IVC)(?:\s|$)/i,'volume'],
    ['MEF 75',/\bMEF\s*75\b|\bFEF\s*25\b/i,'flow'],
    ['MEF 50',/\bMEF\s*50\b|\bFEF\s*50\b/i,'flow'],
    ['MEF 25',/\bMEF\s*25\b|\bFEF\s*75\b/i,'flow'],
    ['TLC',/\bTLC\b/i,'volume'],
    ['RV',/(?:^|\s)RV(?:\s|$)/i,'volume'],
    ['DLCO',/\bDLCO\b|diffusionskapaz/i,'flow'],
    ['KCO',/\bKCO\b/i,'flow']
  ];
  const parsed={};
  const other=[];
  for(const [label,re,kind] of metricDefs){
    const line=findLine(re);
    if(!line)continue;
    const m=lungMetricFromLine(line,kind);
    if(!m.value&&!m.percent)continue;
    parsed[label]={...m,line};
    other.push(`${label}: ${m.value||'—'}${m.percent?` (${m.percent} % Soll)`:''}`);
  }

  // Falls Prä-/Post-Bronchodilatationszeilen separat vorkommen, bleiben sie als erkannte Zusatzwerte erhalten.
  const prePost=lines.filter(l=>/(?:pre|post|vor\s+bronch|nach\s+bronch|broncholy)/i.test(l) && /(?:FEV|FVC|PEF)/i.test(l)).slice(0,6);
  for(const l of prePost)other.push(`Messreihe: ${l}`);

  const coreFound=[fev1.value,fev1.percent,fvc.value,fvc.percent,ratio.value].filter(Boolean).length;
  return {
    date,doctor,testType,
    fev1Liters:fev1.value,fev1Percent:fev1.percent,
    fvcLiters:fvc.value,fvcPercent:fvc.percent,
    ratio:ratio.value,
    otherValues:other.join('\n'),
    parsedValues:parsed,
    matchedLines:{fev1:fev1Line,fvc:fvcLine,ratio:ratioLine},
    coreFound
  };
}

function parseShiftText(text){const emp=(state.company.employeeName||'').trim().toLowerCase();const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);let chosen=emp?lines.find(l=>l.toLowerCase().includes(emp)):'';if(!chosen&&emp){const parts=emp.split(/\s+/);chosen=lines.find(l=>parts.some(p=>p.length>3&&l.toLowerCase().includes(p)))||'';}chosen=chosen||lines.join(' ');const times=[...chosen.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map(m=>`${m[1].padStart(2,'0')}:${m[2]}`);const shifts=[];const dateMatches=[...text.matchAll(/\b\d{1,2}[.]\d{1,2}(?:[.]\d{2,4})?\b/g)].map(m=>m[0]);if(times.length>=2){shifts.push({date:'',shift:guessShift(times[0]),start:times[0],end:times[1],note:chosen});}else{const codes=[...chosen.matchAll(/\b(F|S|N|FRÜH|SPAET|SPÄT|NACHT)\b/gi)].map(m=>m[0]);if(codes.length)shifts.push({date:'',shift:codes[0],start:'',end:'',note:chosen});}return {row:chosen,dates:dateMatches,shifts};}
function guessShift(start){const h=parseInt(start.split(':')[0],10);if(h>=20||h<5)return 'Nacht';if(h<12)return 'Früh';return 'Spät';}

async function saveCompany(){state.company={...state.company,name:$('#companyName').value.trim(),employeeName:$('#employeeName').value.trim(),contractStart:$('#contractStart').value,employeeNo:$('#employeeNo').value.trim(),notes:$('#companyNotes').value.trim()};await save();}
async function saveMeeting(){state.meetings.push({id:id(),type:$('#meetingType').value,date:$('#meetingDate').value,time:$('#meetingTime').value,partner:$('#meetingPartner').value.trim(),place:$('#meetingPlace').value.trim(),note:$('#meetingNote').value.trim(),createdAt:now()});await save();['meetingDate','meetingTime','meetingPartner','meetingPlace','meetingNote'].forEach(i=>$('#'+i).value='');}
async function saveNotice(){const f=$('#noticeFile').files[0];let file=null;if(f)file={name:f.name,type:f.type,data:f.type.startsWith('image/')?await compressImage(f):await fileToDataURL(f)};state.notices.push({id:id(),type:$('#noticeType').value,date:$('#noticeDate').value,title:$('#noticeTitle').value.trim(),note:$('#noticeNote').value.trim(),file,createdAt:now()});await save();$('#noticeTitle').value='';$('#noticeNote').value='';$('#noticeFile').value='';}
async function saveChild(){state.childSick.push({id:id(),child:$('#childName').value.trim(),from:$('#childFrom').value,to:$('#childTo').value,note:$('#childNote').value.trim(),createdAt:now()});await save();}
async function saveRehab(){state.rehabs.push({id:id(),status:$('#rehabStatus').value,clinic:$('#rehabClinic').value.trim(),from:$('#rehabFrom').value,to:$('#rehabTo').value,note:$('#rehabNote').value.trim(),createdAt:now()});await save();}

async function selectedFileData(inputId){const f=$(inputId).files[0];if(!f)return {name:'',mime:'',data:''};const data=f.type.startsWith('image/')?await compressImage(f):await fileToDataURL(f);return {name:f.name,mime:f.type,data};}
function addLungTest(){modal(`<div class="sheet-head"><strong>Lungenfunktion manuell</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Datum<input id="mLungDate" type="date"></label><label>Arzt / Praxis<input id="mLungDoctor" placeholder="optional"></label><label>Testart<input id="mLungType" placeholder="z. B. Spirometrie"></label><label>FEV1 (Liter)<input id="mLungFev1L" inputmode="decimal"></label><label>FEV1 (% Soll)<input id="mLungFev1P" inputmode="decimal"></label><label>FVC (Liter)<input id="mLungFvcL" inputmode="decimal"></label><label>FVC (% Soll)<input id="mLungFvcP" inputmode="decimal"></label><label>FEV1/FVC<input id="mLungRatio"></label><label class="wide">Weitere Werte<textarea id="mLungOther" rows="4"></textarea></label><label class="wide">Originalbefund (Foto/PDF)<input id="mLungFile" type="file" accept="image/*,.pdf"><span class="media-source-hint">📷 Kamera · 🖼 Fotomediathek · 📁 Dateien</span></label><label class="wide">Notiz<textarea id="mLungNote" rows="3"></textarea></label><button class="primary wide" onclick="commitLungTest()">Speichern</button></div>`);}
window.commitLungTest=async()=>{const inp=$('#mLungFile');const file=inp.files[0];let f={name:'',mime:'',data:''};if(file)f={name:file.name,mime:file.type,data:await fileToDataURL(file)};state.health.lungTests.push({id:id(),date:$('#mLungDate').value,doctor:$('#mLungDoctor').value.trim(),testType:$('#mLungType').value.trim(),fev1Liters:$('#mLungFev1L').value.trim(),fev1Percent:$('#mLungFev1P').value.trim(),fvcLiters:$('#mLungFvcL').value.trim(),fvcPercent:$('#mLungFvcP').value.trim(),ratio:$('#mLungRatio').value.trim(),otherValues:$('#mLungOther').value.trim(),note:$('#mLungNote').value.trim(),...f,createdAt:now()});await save();closeModal();};

async function scanLungTest(){
  const f=$('#lungImage').files[0];
  const status=$('#lungOcrStatus');
  if(!f){status.textContent='Bitte zuerst den Lungenfunktionsbefund fotografieren oder ein Bild auswählen.';return;}
  try{
    pendingLungOriginal={name:f.name||'Lungenfunktion.jpg',mime:f.type||'image/jpeg',data:await fileToDataURL(f)};
    const r=await ocrFile(f,status);
    $('#lungOcrText').value=r.text;
    $('#lungOcrText').dataset.image=r.image;
    reviewLungTest();
  }catch(e){pendingLungOriginal=null;status.textContent=e.message;}
}
function reviewLungTest(){
  const p=parseLungFunctionText($('#lungOcrText').value);
  const detected=[];
  if(p.fev1Liters||p.fev1Percent)detected.push('FEV1');
  if(p.fvcLiters||p.fvcPercent)detected.push('FVC');
  if(p.ratio)detected.push('FEV1/FVC');
  if(p.otherValues)detected.push('weitere Parameter');
  const preview=pendingLungOriginal?.data?`<div class="wide"><strong>Originalbefund:</strong><br><img src="${pendingLungOriginal.data}" alt="Lungenfunktionsbefund" style="max-width:100%;max-height:260px;object-fit:contain;border-radius:12px;margin-top:8px"></div>`:'<div class="wide hint">Originalbild fehlt – bitte Befund erneut auswählen.</div>';
  $('#lungReview').classList.remove('hidden');
  $('#lungReview').innerHTML=`<h3>Automatisch erkannte Lungenfunktion prüfen</h3><div class="review-grid">
    <div class="wide hint"><strong>Erkannt:</strong> ${esc(detected.join(', ')||'keine eindeutigen Messwerte')}. Die App übernimmt Messwerte aus dem Befund, nimmt aber keine medizinische Bewertung vor.</div>
    <label>Datum<input id="rLungDate" type="date" value="${esc(p.date)}"></label>
    <label>Arzt / Praxis<input id="rLungDoctor" value="${esc(p.doctor)}"></label>
    <label>Testart<input id="rLungType" value="${esc(p.testType)}"></label>
    <label>FEV1 (Liter)<input id="rLungFev1L" inputmode="decimal" value="${esc(p.fev1Liters)}"></label>
    <label>FEV1 (% Soll)<input id="rLungFev1P" inputmode="decimal" value="${esc(p.fev1Percent)}"></label>
    <label>FVC (Liter)<input id="rLungFvcL" inputmode="decimal" value="${esc(p.fvcLiters)}"></label>
    <label>FVC (% Soll)<input id="rLungFvcP" inputmode="decimal" value="${esc(p.fvcPercent)}"></label>
    <label>FEV1/FVC<input id="rLungRatio" value="${esc(p.ratio)}"></label>
    <label class="wide">Weitere automatisch erkannte Werte<textarea id="rLungOther" rows="5">${esc(p.otherValues)}</textarea></label>
    ${preview}
    <label class="wide">Notiz<textarea id="rLungNote" rows="3"></textarea></label>
    <button class="primary wide" id="commitLungReview">Geprüfte Werte + Originalbefund speichern</button>
  </div>`;
  $('#commitLungReview').onclick=async()=>{
    if(!pendingLungOriginal?.data){alert('Das Originalbild des Lungenfunktionstests fehlt. Bitte den Befund erneut fotografieren oder auswählen.');return;}
    state.health.lungTests.push({
      id:id(),date:$('#rLungDate').value,doctor:$('#rLungDoctor').value.trim(),testType:$('#rLungType').value.trim(),
      fev1Liters:$('#rLungFev1L').value.trim(),fev1Percent:$('#rLungFev1P').value.trim(),
      fvcLiters:$('#rLungFvcL').value.trim(),fvcPercent:$('#rLungFvcP').value.trim(),ratio:$('#rLungRatio').value.trim(),
      otherValues:$('#rLungOther').value.trim(),note:$('#rLungNote').value.trim(),
      parsedValues:p.parsedValues,matchedLines:p.matchedLines,ocrText:$('#lungOcrText').value,
      data:pendingLungOriginal.data,name:pendingLungOriginal.name,mime:pendingLungOriginal.mime,
      image:$('#lungOcrText').dataset.image||'',createdAt:now()
    });
    await save();
    pendingLungOriginal=null;
    $('#lungImage').value='';$('#lungOcrText').value='';$('#lungOcrText').dataset.image='';$('#lungReview').classList.add('hidden');
    $('#lungOcrStatus').textContent='Lungenfunktion gespeichert.';
  };
}

function addLabResult(){modal(`<div class="sheet-head"><strong>Laborwerte</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Datum<input id="mLabDate" type="date"></label><label>Arzt / Labor<input id="mLabProvider" placeholder="optional"></label><label class="wide">Laborwerte<textarea id="mLabValues" rows="6" placeholder="z. B. CRP: 3 mg/l&#10;Leukozyten: 7,2 /nl&#10;... "></textarea></label><label class="wide">Laborbefund (Foto/PDF)<input id="mLabFile" type="file" accept="image/*,.pdf"><span class="media-source-hint">📷 Kamera · 🖼 Fotomediathek · 📁 Dateien</span></label><label class="wide">Notiz<textarea id="mLabNote" rows="3"></textarea></label><button class="primary wide" onclick="commitLabResult()">Speichern</button></div>`);}
window.commitLabResult=async()=>{const f=await selectedFileData('#mLabFile');state.health.labResults.push({id:id(),date:$('#mLabDate').value,provider:$('#mLabProvider').value.trim(),values:$('#mLabValues').value.trim(),note:$('#mLabNote').value.trim(),...f,createdAt:now()});await save();closeModal();};
function addDoctorLetter(){modal(`<div class="sheet-head"><strong>Arztbrief</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Datum<input id="mLetterDate" type="date"></label><label>Arzt / Praxis / Klinik<input id="mLetterDoctor"></label><label>Fachrichtung<input id="mLetterSpecialty" placeholder="z. B. Pneumologie"></label><label>Betreff<input id="mLetterSubject" placeholder="z. B. Befundbericht"></label><label class="wide">Arztbrief (Foto/PDF)<input id="mLetterFile" type="file" accept="image/*,.pdf"><span class="media-source-hint">📷 Kamera · 🖼 Fotomediathek · 📁 Dateien</span></label><label class="wide">Notiz<textarea id="mLetterNote" rows="3"></textarea></label><button class="primary wide" onclick="commitDoctorLetter()">Speichern</button></div>`);}
window.commitDoctorLetter=async()=>{const f=await selectedFileData('#mLetterFile');state.health.doctorLetters.push({id:id(),date:$('#mLetterDate').value,doctor:$('#mLetterDoctor').value.trim(),specialty:$('#mLetterSpecialty').value.trim(),subject:$('#mLetterSubject').value.trim(),note:$('#mLetterNote').value.trim(),...f,createdAt:now()});await save();closeModal();};
async function addManualShift(){modal(`<div class="sheet-head"><strong>Schicht hinzufügen</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Datum<input id="mShiftDate" type="date"></label><label>Schicht<input id="mShiftName" placeholder="Früh / Spät / Nacht"></label><label>Von<input id="mShiftStart" type="time"></label><label>Bis<input id="mShiftEnd" type="time"></label><label class="wide">Notiz<input id="mShiftNote"></label><button class="primary wide" onclick="commitManualShift()">Speichern</button></div>`);}
window.commitManualShift=async()=>{state.shifts.push({id:id(),date:$('#mShiftDate').value,shift:$('#mShiftName').value,start:$('#mShiftStart').value,end:$('#mShiftEnd').value,note:$('#mShiftNote').value,createdAt:now()});await save();closeModal();};
async function addManualAu(){modal(`<div class="sheet-head"><strong>AU hinzufügen</strong><button onclick="closeModal()">✕</button></div><div class="review-grid"><label>Art<select id="mAuKind"><option>Erstbescheinigung</option><option>Folgebescheinigung</option></select></label><label>ICD‑10-Code(s)<input id="mAuCodes" placeholder="z. B. J45.9, J20.9"></label><label>Von<input id="mAuFrom" type="date"></label><label>Bis<input id="mAuTo" type="date"></label><label class="wide">Notiz<textarea id="mAuNote"></textarea></label><button class="primary wide" onclick="commitManualAu()">Speichern</button></div>`);}
window.commitManualAu=async()=>{state.aus.push({id:id(),kind:$('#mAuKind').value,from:$('#mAuFrom').value,to:$('#mAuTo').value,codes:$('#mAuCodes').value.toUpperCase().split(/[,;\s]+/).filter(Boolean),note:$('#mAuNote').value.trim(),createdAt:now()});await save();closeModal();};

async function scanShift(){const f=$('#shiftImage').files[0];const status=$('#shiftOcrStatus');try{const r=await ocrFile(f,status);$('#shiftOcrText').value=r.text;$('#shiftOcrText').dataset.image=r.image;}catch(e){status.textContent=e.message;}}
function reviewShift(){const parsed=parseShiftText($('#shiftOcrText').value);const first=parsed.shifts[0]||{date:'',shift:'',start:'',end:'',note:parsed.row};$('#shiftReview').classList.remove('hidden');$('#shiftReview').innerHTML=`<h3>Erkennung prüfen</h3><div class="review-grid"><label>Datum<input id="rShiftDate" type="date" value="${esc(first.date)}"></label><label>Schicht<input id="rShiftName" value="${esc(first.shift)}"></label><label>Von<input id="rShiftStart" type="time" value="${esc(first.start)}"></label><label>Bis<input id="rShiftEnd" type="time" value="${esc(first.end)}"></label><label class="wide">Erkannte Zeile<textarea id="rShiftNote">${esc(first.note)}</textarea></label><div class="wide muted">Erkannte Datumsangaben im Plan: ${esc(parsed.dates.join(', ')||'keine')}</div><button class="primary wide" id="commitShiftReview">Geprüfte Schicht speichern</button></div>`;$('#commitShiftReview').onclick=async()=>{state.shifts.push({id:id(),date:$('#rShiftDate').value,shift:$('#rShiftName').value.trim(),start:$('#rShiftStart').value,end:$('#rShiftEnd').value,note:$('#rShiftNote').value.trim(),sourceImage:$('#shiftOcrText').dataset.image||'',createdAt:now()});await save();$('#shiftReview').classList.add('hidden');};}

async function scanAu(){
  const f=$('#auImage').files[0];
  const status=$('#auOcrStatus');
  if(!f){status.textContent='Bitte zuerst die AU fotografieren oder ein Bild auswählen.';return;}
  try{
    // Originaldatei unverändert sichern; die komprimierte Kopie wird nur für OCR/Kompatibilität genutzt.
    pendingAuOriginal={name:f.name||'AU.jpg',mime:f.type||'image/jpeg',data:await fileToDataURL(f)};
    const r=await ocrFile(f,status);
    $('#auOcrText').value=r.text;
    $('#auOcrText').dataset.image=r.image;
    reviewAu();
  }catch(e){pendingAuOriginal=null;status.textContent=e.message;}
}
function reviewAu(){
  const p=parseAuText($('#auOcrText').value);
  const sourceText=p.printedCodes.length
    ? `${p.printedCodes.length} ICD-10-Code${p.printedCodes.length===1?'':'s'} direkt auf der AU erkannt. Alle werden übernommen.`
    : p.inferred.length
      ? `${p.inferred.length} ICD-10-Vorschlag${p.inferred.length===1?'':'e'} aus dem erkannten Diagnosetext ermittelt. Bitte vor dem Speichern prüfen.`
      : 'Kein ICD-10-Code sicher ermittelt. Bitte den OCR-Text prüfen oder den Code manuell ergänzen.';
  const inferredText=p.inferred.length?p.inferred.map(x=>`${x.code} – ${x.label}`).join(' · '):'';
  const originalPreview=pendingAuOriginal?.data
    ? `<div class="wide"><strong>Original-AU:</strong><br><img src="${pendingAuOriginal.data}" alt="Original-AU" style="max-width:100%;max-height:260px;object-fit:contain;border-radius:12px;margin-top:8px"></div>`
    : '<div class="wide hint">Originalbild nicht verfügbar – bitte AU erneut auswählen.</div>';
  $('#auReview').classList.remove('hidden');
  $('#auReview').innerHTML=`<h3>AU-Daten prüfen</h3><div class="review-grid">
    <label>Art<select id="rAuKind"><option ${p.kind==='Erstbescheinigung'?'selected':''}>Erstbescheinigung</option><option ${p.kind==='Folgebescheinigung'?'selected':''}>Folgebescheinigung</option></select></label>
    <label>ICD‑10-Code(s)<input id="rAuCodes" value="${esc(p.codes.join(', '))}" placeholder="wird automatisch ermittelt"></label>
    <label>Von<input id="rAuFrom" type="date" value="${esc(p.from)}"></label>
    <label>Bis<input id="rAuTo" type="date" value="${esc(p.to)}"></label>
    <div class="wide hint"><strong>ICD-Erkennung:</strong> ${esc(sourceText)}${inferredText?'<br>'+esc(inferredText):''}</div>
    ${originalPreview}
    <label class="wide">Notiz<textarea id="rAuNote"></textarea></label>
    <button class="primary wide" id="commitAuReview">Geprüfte AU mit Originalbild speichern</button>
  </div>`;
  $('#commitAuReview').onclick=async()=>{
    const codes=extractPrintedIcdCodes($('#rAuCodes').value);
    if(!pendingAuOriginal?.data){alert('Das Originalbild der AU fehlt. Bitte die AU erneut fotografieren oder auswählen.');return;}
    state.aus.push({
      id:id(),kind:$('#rAuKind').value,from:$('#rAuFrom').value,to:$('#rAuTo').value,
      codes:[...new Set(codes)],note:$('#rAuNote').value.trim(),
      codeSource:p.printedCodes.length?'AU-OCR':(p.inferred.length?'Diagnosetext-Vorschlag':'manuell'),
      inferredIcd:p.inferred,ocrText:$('#auOcrText').value,
      data:pendingAuOriginal.data,name:pendingAuOriginal.name,mime:pendingAuOriginal.mime,
      image:$('#auOcrText').dataset.image||'',createdAt:now()
    });
    await save();
    pendingAuOriginal=null;
    $('#auImage').value='';
    $('#auOcrText').value='';
    $('#auOcrText').dataset.image='';
    $('#auReview').classList.add('hidden');
  };
}


function inferWorkplanMonth(text, selectedMonth=''){
  if(selectedMonth)return selectedMonth;
  const lower=String(text||'').toLowerCase();
  const months=['januar','februar','märz','maerz','april','mai','juni','juli','august','september','oktober','november','dezember'];
  const map={januar:1,februar:2,'märz':3,maerz:3,april:4,mai:5,juni:6,juli:7,august:8,september:9,oktober:10,november:11,dezember:12};
  for(const m of months){
    const re=new RegExp('\\b'+m+'\\b[^0-9]{0,10}(20\\d{2})','i');
    const hit=lower.match(re);
    if(hit)return `${hit[1]}-${String(map[m]).padStart(2,'0')}`;
    const justMonth=new RegExp('\\b'+m+'\\b','i');
    if(justMonth.test(lower))return `${new Date().getFullYear()}-${String(map[m]).padStart(2,'0')}`;
  }
  const mmY=String(text||'').match(/\b(0?[1-9]|1[0-2])[.\/\-](20\d{2})\b/);
  if(mmY)return `${mmY[2]}-${String(mmY[1]).padStart(2,'0')}`;
  const dates=[...String(text||'').matchAll(/\b\d{1,2}[.\/\-](\d{1,2})[.\/\-](20\d{2})\b/g)];
  if(dates.length)return `${dates[0][2]}-${String(dates[0][1]).padStart(2,'0')}`;
  return '';
}
function normalizeWorkplanTime(v){
  const m=String(v||'').trim().match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  return m?`${m[1].padStart(2,'0')}:${m[2]}`:'';
}
function workplanShiftFromToken(token){
  const t=String(token||'').trim().toUpperCase().replace('Ü','U').replace('Ä','A');
  const known={
    F:{shift:'Früh',start:'05:45',end:'13:45'},FRUH:{shift:'Früh',start:'05:45',end:'13:45'},FRUEH:{shift:'Früh',start:'05:45',end:'13:45'},
    S:{shift:'Spät',start:'13:45',end:'21:45'},SPAT:{shift:'Spät',start:'13:45',end:'21:45'},SPAET:{shift:'Spät',start:'13:45',end:'21:45'},
    N:{shift:'Nacht',start:'21:45',end:'05:45'},NACHT:{shift:'Nacht',start:'21:45',end:'05:45'}
  };
  return known[t]||null;
}
function dateFromDay(day,month){
  if(!month||!day)return '';
  const [y,m]=month.split('-');
  const d=String(parseInt(day,10)).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function parseWorkplanText(text,selectedMonth=''){
  const raw=String(text||'');
  const lines=raw.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const month=inferWorkplanMonth(raw,selectedMonth);
  const configured=(state.company.employeeName||'').trim();
  const lowerName=configured.toLowerCase();
  const nameParts=lowerName.split(/\s+/).filter(x=>x.length>=3);
  const employeeLines=lines.filter(l=>{
    const low=l.toLowerCase();
    return lowerName?low.includes(lowerName):false;
  });
  if(!employeeLines.length&&nameParts.length){
    employeeLines.push(...lines.filter(l=>nameParts.filter(p=>l.toLowerCase().includes(p)).length>=Math.min(2,nameParts.length)));
  }
  const employee=employeeLines.length?configured:'';
  const entries=[];
  const statuses=[];
  const addEntry=e=>{
    if(!e.date&&!e.day)return;
    const key=`${e.date||e.day}|${e.shift||''}|${e.start||''}|${e.end||''}`;
    if(entries.some(x=>x._key===key))return;
    entries.push({...e,_key:key});
  };

  // Strongest case: a line contains a date/day and explicit working times.
  for(const line of lines){
    const dateHit=line.match(/\b(\d{1,2})[.\/\-](\d{1,2})(?:[.\/\-](\d{2,4}))?\b/);
    const times=[...line.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map(m=>`${m[1].padStart(2,'0')}:${m[2]}`);
    const tokenHit=line.match(/(?:^|\s)(F|S|N|FRÜH|FRUEH|SPÄT|SPAET|NACHT)(?:\s|$)/i);
    if(dateHit&&(times.length>=2||tokenHit)){
      let date='';
      if(dateHit[3])date=normalizeDate(dateHit[0]);
      else if(month)date=dateFromDay(dateHit[1],month);
      let shift='',start=times[0]||'',end=times[1]||'';
      if(tokenHit){const k=workplanShiftFromToken(tokenHit[1]);if(k){shift=k.shift;start=start||k.start;end=end||k.end;}}
      if(!shift&&start)shift=guessShift(start);
      addEntry({date,day:dateHit[1],shift,start,end,source:line,confidence:times.length>=2?'hoch':'mittel'});
    }
    if(/\b(urlaub|frei|krank|feiertag|kurzarbeit)\b/i.test(line)){
      const found=line.match(/\b(urlaub|frei|krank|feiertag|kurzarbeit)\b/ig)||[];
      found.forEach(x=>{const v=x.charAt(0).toUpperCase()+x.slice(1).toLowerCase();if(!statuses.includes(v))statuses.push(v);});
    }
  }

  // Table OCR often separates the date header and the employee row. Pair a sequence of day numbers with F/S/N tokens.
  if(!entries.length&&employeeLines.length){
    const allDays=[];
    for(const line of lines){
      const nums=[...line.matchAll(/(?:^|\s)([1-9]|[12]\d|3[01])(?:[.]|\s|$)/g)].map(m=>parseInt(m[1],10));
      if(nums.length>=5){allDays.push(...nums);break;}
    }
    const row=employeeLines.join(' ');
    const tokens=[...row.matchAll(/(?:^|\s)(F|S|N|FRÜH|FRUEH|SPÄT|SPAET|NACHT)(?=\s|$)/ig)].map(m=>m[1]);
    if(allDays.length&&tokens.length){
      const count=Math.min(allDays.length,tokens.length);
      for(let i=0;i<count;i++){
        const k=workplanShiftFromToken(tokens[i]);
        if(k)addEntry({date:month?dateFromDay(allDays[i],month):'',day:String(allDays[i]),...k,source:row,confidence:'mittel'});
      }
    }
  }

  // Last fallback: collect explicit time pairs from employee line even without a clean date association.
  if(!entries.length&&employeeLines.length){
    for(const row of employeeLines){
      const pairs=[...row.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–]\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)];
      pairs.forEach((m,i)=>{const start=`${m[1].padStart(2,'0')}:${m[2]}`,end=`${m[3].padStart(2,'0')}:${m[4]}`;addEntry({date:'',day:'',shift:guessShift(start),start,end,source:row,confidence:'niedrig',sequence:i+1});});
    }
  }

  return {month,employee,employeeConfigured:configured,employeeLines,entries:entries.map(({_key,...e})=>e),statuses,rawLineCount:lines.length};
}
async function scanWorkplan(){
  const f=$('#workplanImage').files[0];
  const status=$('#workplanOcrStatus');
  if(!f){status.textContent='Bitte zuerst einen Arbeitsplan fotografieren oder auswählen.';return;}
  try{
    pendingWorkplanOriginal={name:f.name||'Arbeitsplan.jpg',mime:f.type||'image/jpeg',data:await fileToDataURL(f)};
    if(!f.type.startsWith('image/')){
      status.textContent='PDF wird als Original gespeichert. Automatische OCR funktioniert aktuell bei Bildern; für Analyse bitte eine Seite als Foto/Bild verwenden.';
      $('#workplanOcrText').value='';
      reviewWorkplan(parseWorkplanText('', $('#workplanMonth').value));
      return;
    }
    const r=await ocrFile(f,status);
    $('#workplanOcrText').value=r.text;
    $('#workplanOcrText').dataset.image=r.image;
    reviewWorkplan(parseWorkplanText(r.text,$('#workplanMonth').value));
  }catch(e){pendingWorkplanOriginal=null;status.textContent=e.message;}
}
function reviewWorkplan(p){
  const entries=p.entries||[];
  const employeeHint=p.employee?`Mitarbeiter erkannt: ${p.employee}`:(p.employeeConfigured?`Name „${p.employeeConfigured}“ im OCR-Text nicht sicher gefunden.`:'Bitte unter Firma & Vertrag zuerst deinen Mitarbeiternamen hinterlegen.');
  const rows=entries.length?entries.map((e,i)=>`<div class="workplan-entry" data-workplan-row="${i}" data-day="${esc(e.day||'')}">
      <label>Datum<input class="wp-date" type="date" value="${esc(e.date||'')}"></label>
      <label>Schicht<input class="wp-shift" value="${esc(e.shift||'')}"></label>
      <label>Von<input class="wp-start" type="time" value="${esc(e.start||'')}"></label>
      <label>Bis<input class="wp-end" type="time" value="${esc(e.end||'')}"></label>
      <label class="wp-include"><input class="wp-use" type="checkbox" checked> übernehmen</label>
    </div>`).join(''):'<div class="hint">Keine einzelnen Schichten sicher erkannt. Der Arbeitsplan kann trotzdem als Original gespeichert werden.</div>';
  $('#workplanReview').classList.remove('hidden');
  $('#workplanReview').innerHTML=`<div class="section-head"><h3>Arbeitsplan-Analyse prüfen</h3><span class="privacy-badge">${entries.length} Schicht${entries.length===1?'':'en'} erkannt</span></div>
    <div class="review-grid">
      <label>Monat<input id="rWorkplanMonth" type="month" value="${esc(p.month||'')}"></label>
      <div class="wide hint"><strong>Erkennung:</strong> ${esc(employeeHint)}${p.statuses.length?'<br>Weitere Angaben: '+esc(p.statuses.join(', ')):''}</div>
      <div class="wide"><strong>Erkannte Schichten</strong><div id="workplanRows">${rows}</div></div>
      <label class="wide">Notiz<textarea id="rWorkplanNote" rows="2" placeholder="optional"></textarea></label>
      <button class="primary wide" id="commitWorkplanReview">Arbeitsplan + erkannte Schichten speichern</button>
    </div>`;
  const monthInput=$('#rWorkplanMonth');
  if(monthInput){monthInput.onchange=()=>{
    $$('[data-workplan-row]').forEach(r=>{
      const date=r.querySelector('.wp-date');const day=r.dataset.day;
      if(date&&!date.value&&day&&monthInput.value)date.value=dateFromDay(day,monthInput.value);
    });
  };}
  $('#commitWorkplanReview').onclick=commitWorkplanReview;
}
async function commitWorkplanReview(){
  if(!pendingWorkplanOriginal?.data){alert('Das Original des Arbeitsplans fehlt. Bitte erneut auswählen.');return;}
  const rows=$$('[data-workplan-row]');
  const detected=[];
  rows.forEach(r=>{
    if(!r.querySelector('.wp-use')?.checked)return;
    detected.push({date:r.querySelector('.wp-date').value,shift:r.querySelector('.wp-shift').value.trim(),start:r.querySelector('.wp-start').value,end:r.querySelector('.wp-end').value});
  });
  let imported=0;
  for(const e of detected){
    if(!e.date&&!e.start&&!e.shift)continue;
    const duplicate=state.shifts.some(s=>s.date===e.date&&s.start===e.start&&s.end===e.end&&String(s.shift||'').toLowerCase()===String(e.shift||'').toLowerCase());
    if(!duplicate){state.shifts.push({id:id(),...e,note:'Automatisch aus Arbeitsplan übernommen',source:'workplan',createdAt:now()});imported++;}
  }
  const month=$('#rWorkplanMonth').value||$('#workplanMonth').value;
  const parsed=parseWorkplanText($('#workplanOcrText').value,month);
  state.documents.push({
    id:id(),type:'workplan',month,name:pendingWorkplanOriginal.name,mime:pendingWorkplanOriginal.mime,data:pendingWorkplanOriginal.data,
    ocrText:$('#workplanOcrText').value,image:$('#workplanOcrText').dataset.image||'',note:$('#rWorkplanNote').value.trim(),
    analysis:{employee:parsed.employee||parsed.employeeConfigured||'',detectedShiftCount:parsed.entries.length,importedShiftCount:imported,statuses:parsed.statuses,entries:detected},createdAt:now()
  });
  await save();
  pendingWorkplanOriginal=null;
  $('#workplanImage').value='';$('#workplanOcrText').value='';$('#workplanOcrText').dataset.image='';$('#workplanReview').classList.add('hidden');
  $('#workplanOcrStatus').textContent=`Arbeitsplan gespeichert. ${imported} neue Schicht${imported===1?'':'en'} übernommen.`;
}

async function saveScannedDoc(type){const fileEl=type==='payroll'?$('#payrollImage'):$('#stampImage');const monthEl=type==='payroll'?$('#payrollMonth'):$('#stampMonth');const f=fileEl.files[0];if(!f){alert('Bitte zuerst eine Datei auswählen.');return;}let data,ocrText='';if(f.type.startsWith('image/')){data=await compressImage(f);try{const status=document.createElement('div');const r=await ocrFile(f,status);ocrText=r.text;}catch{} }else{data=await fileToDataURL(f);}state.documents.push({id:id(),type,month:monthEl.value,name:f.name,mime:f.type,data,ocrText,createdAt:now()});fileEl.value='';await save();}

async function saveContractFile(){const f=$('#contractFile').files[0];if(!f)return alert('Bitte Datei auswählen.');const data=f.type.startsWith('image/')?await compressImage(f):await fileToDataURL(f);state.company.contracts.push({id:id(),name:f.name,type:f.type,data,createdAt:now()});$('#contractFile').value='';await save();}

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

async function exportBackup(){const payload=await dbGet('payload');const salt=await dbGet('salt');const blob=new Blob([JSON.stringify({app:'WorksManager',version:1,salt,payload,exportedAt:now()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`WorksManager-Backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function importBackup(file){try{const j=JSON.parse(await file.text());if(j.app!=='WorksManager'||!j.salt||!j.payload)throw new Error('Ungültiges Backup');await dbPut('salt',j.salt);await dbPut('payload',j.payload);alert('Backup importiert. Bitte erneut mit dem Backup-Passwort öffnen.');lock();}catch(e){alert('Backup konnte nicht importiert werden: '+e.message);}}

function bind(){
  $('#unlockBtn').onclick=unlock;$('#unlockPassword').addEventListener('keydown',e=>{if(e.key==='Enter')unlock();});$('#lockBtn').onclick=lock;
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));$('#moreBtn').onclick=()=>$('#moreMenu').classList.remove('hidden');$('#closeMore').onclick=()=>$('#moreMenu').classList.add('hidden');$('#moreMenu').addEventListener('click',e=>{if(e.target===$('#moreMenu'))$('#moreMenu').classList.add('hidden');});$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});
  $('#saveCompany').onclick=saveCompany;$('#saveContractFile').onclick=saveContractFile;$('#saveMeeting').onclick=saveMeeting;$('#saveNotice').onclick=saveNotice;$('#saveChild').onclick=saveChild;$('#saveRehab').onclick=saveRehab;$('#addLungTest').onclick=addLungTest;$('#addLabResult').onclick=addLabResult;$('#addDoctorLetter').onclick=addDoctorLetter;
  $('#scanLung').onclick=scanLungTest;$('#parseLung').onclick=reviewLungTest;
  $('#addShiftManual').onclick=addManualShift;$('#addAuManual').onclick=addManualAu;$('#scanShift').onclick=scanShift;$('#parseShift').onclick=reviewShift;$('#scanAu').onclick=scanAu;$('#parseAu').onclick=reviewAu;$('#scanWorkplan').onclick=scanWorkplan;
  $$('[data-docscan]').forEach(b=>b.onclick=()=>saveScannedDoc(b.dataset.docscan));
  $('#exportBackup').onclick=exportBackup;$('#importBackup').onchange=e=>e.target.files[0]&&importBackup(e.target.files[0]);
  $('#wipeData').onclick=async()=>{if(confirm('Wirklich ALLE lokalen WorksManager-Daten löschen?')){await dbClear();location.reload();}};
}

(async function init(){db=await openDB();bind();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});const has=await dbGet('payload');$('#unlockHint').textContent=has?'Daten vorhanden – mit deinem Passwort öffnen.':'Erster Start: Dieses Passwort verschlüsselt deine Daten. Merke es dir; es kann nicht wiederhergestellt werden.';})();
