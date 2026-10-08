/* WorksManager 1.9.4 – Stempeluhr mit Startseitenanzeige mit verschlüsselter Speicherung im state.wm20.
   7:30 normal = 7,50 Industrie-Stunden; Überstunden nach Tages-Soll.
   Automatische Übernahme ins 1.9-Zeitkonto nur, wenn kein fremder Eintrag existiert.
*/
(() => {
'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const uid=()=>crypto.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const pad=n=>String(n).padStart(2,'0');
const time=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const date=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const hhm=m=>{const sign=m<0?'-':'';m=Math.abs(Math.round(m));return `${sign}${pad(Math.floor(m/60))}:${pad(m%60)}`};
const industrial=m=>(m/60).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
const elapsedWithoutPauses=a=>{if(!a)return 0;const stopAt=a.pausedAt?new Date(a.pausedAt).getTime():Date.now();const startAt=new Date(a.startAt).getTime();const paused=Math.max(0,Number(a.totalPausedMs)||0);return Math.max(0,Math.floor((stopAt-startAt-paused)/60000));};
const isOpen=()=>!!$('app')&&!$('app').classList.contains('hidden');
const escapeNumber=(n,min,max)=>{const v=Number(n);if(!Number.isInteger(v)||v<min||v>max)throw Error(`Wert muss eine ganze Zahl zwischen ${min} und ${max} sein.`);return v};
const parseISOTime=(day,clock)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}$/.test(clock))throw Error('Datum oder Uhrzeit ungültig.');const [y,m,d]=day.split('-').map(Number),[h,mi]=clock.split(':').map(Number);if(h>23||mi>59)throw Error('Uhrzeit ungültig.');const dt=new Date(y,m-1,d,h,mi,0);if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d||dt.getHours()!==h||dt.getMinutes()!==mi)throw Error('Nicht existierende Uhrzeit (Zeitumstellung).');return dt};
function compute(a,b,pause){const span=Math.round((new Date(b).getTime()-new Date(a).getTime())/60000);if(!Number.isInteger(span)||span<=0||span>24*60)throw Error('Schichtdauer muss über 0 und höchstens 24 Stunden betragen.');const breaks=escapeNumber(pause,0,1440);if(breaks>=span)throw Error('Pause muss kürzer als die Schichtdauer sein.');return span-breaks}
function store(){if(!state.wm20||typeof state.wm20!=='object'||Array.isArray(state.wm20))state.wm20={};const x=state.wm20;if(!Array.isArray(x.entries))x.entries=[];if(!Number.isInteger(x.targetMinutes)||x.targetMinutes<0||x.targetMinutes>1440)x.targetMinutes=450;if(!x.active||typeof x.active!=='object')x.active=null;if(!Number.isFinite(Number(x.hourlyGrossRate))||Number(x.hourlyGrossRate)<0)x.hourlyGrossRate=Math.max(0,Number(state.wmPayroll?.profile?.hourlyRate)||0);if(typeof x.autoPayroll!=='boolean')x.autoPayroll=false;return x}
function slotTarget(x){const n=Number(x.targetMinutes);return Number.isInteger(n)&&n>=0&&n<=1440?n:store().targetMinutes}
function overtime(x){return Math.max(0,x.minutes-slotTarget(x))}
function daySummary(rows){const map=new Map();for(const x of rows){const key=x.workDate||date(new Date(x.startAt));if(!map.has(key))map.set(key,[]);map.get(key).push(x)}return [...map].map(([day,arr])=>{const total=arr.reduce((a,r)=>a+r.minutes,0),goal=arr.reduce((v,r)=>Math.max(v,slotTarget(r)),0);return {day,total,goal,overtime:Math.max(0,total-goal),difference:total-goal}}).sort((a,b)=>b.day.localeCompare(a.day))}
const euros=value=>(Number(value)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const roundMoney=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
const hourlyRate=s=>Math.max(0,Number(s?.hourlyGrossRate)||0);
const rateForRecord=(record,s=store())=>Number.isFinite(Number(record?.hourlyRate))&&Number(record.hourlyRate)>=0?Number(record.hourlyRate):hourlyRate(s);
function wageStats(rows,s=store()){
 const byDay=daySummary(rows);
 const regularMinutes=byDay.reduce((sum,d)=>sum+Math.min(d.total,d.goal),0);
 const overtimeMinutes=byDay.reduce((sum,d)=>sum+d.overtime,0);
 const totalMinutes=byDay.reduce((sum,d)=>sum+d.total,0);
 const gross=roundMoney(byDay.reduce((sum,d)=>{
  const items=rows.filter(r=>(r.workDate||date(new Date(r.startAt)))===d.day);
  return sum+roundMoney(items.reduce((v,r)=>v+(r.minutes*rateForRecord(r,s)/60),0));
 },0));
 return {days:byDay.length,regularMinutes,overtimeMinutes,totalMinutes,gross,byDay};
}
function payrollMonthTotals(month){
 const s=store(),rows=s.entries.filter(r=>String(r.workDate||date(new Date(r.startAt))).startsWith(month));
 const data=wageStats(rows,s);return {month,entries:rows.length,regularHours:Math.round(data.regularMinutes/60*100)/100,overtimeHours:Math.round(data.overtimeMinutes/60*100)/100,totalHours:Math.round(data.totalMinutes/60*100)/100,gross:data.gross};
}
function syncMonthToPayroll(month){
 if(window.WM195?.syncPayrollMonth)return window.WM195.syncPayrollMonth(month);
 // Sicherer Fallback: ohne geladenes Modul 1.9.5 nicht automatisch alte Lohndaten ersetzen.
 return false;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;
 const s=store();if(!s.autoPayroll)return;
 const totals=payrollMonthTotals(month);
 const pay=state.wmPayroll||(state.wmPayroll={});pay.months??={};pay.profile??={};
 const old=pay.months[month];if(!totals.entries&&!old?.wmClockSync)return;
 const profile={...pay.profile,...(old?.profileSnapshot||{}),salaryMode:old?.profileSnapshot?.salaryMode||pay.profile.salaryMode||'hourly',hourlyRate:hourlyRate(s)};
 pay.months[month]={...old,month,hours:totals.regularHours,overtimeHours:totals.overtimeHours,profileSnapshot:profile,wmClockSync:true,wmClockSyncedAt:new Date().toISOString()};
}
function alertPayrollSynced(months){if(typeof document==='undefined')return;for(const month of new Set(months))document.dispatchEvent(new CustomEvent('wm-clock-payroll-synced',{detail:{month}}));}
const saveSafe=async(message,change,months=[])=>{
 const prev=JSON.stringify(store()),prev19=JSON.stringify(state.wm19??null),prevPay=JSON.stringify(state.wmPayroll??null),prev195=JSON.stringify(state.wm195??null);
 try{change();if(store().autoPayroll)for(const month of new Set(months))syncMonthToPayroll(month);await save(message)}
 catch(e){state.wm20=JSON.parse(prev);state.wm19=JSON.parse(prev19);state.wmPayroll=JSON.parse(prevPay);state.wm195=JSON.parse(prev195);throw e}
 refresh();if(store().autoPayroll)alertPayrollSynced(months);
};
async function saveWageSettings(){
 const rate=Number(String($('wmClockRate').value).replace(',','.'));
 if(!Number.isFinite(rate)||rate<0||rate>10000)throw Error('Brutto-Stundenlohn zwischen 0 und 10.000 € eingeben.');
 await saveSafe('Brutto-Stundenlohn gespeichert',()=>{store().hourlyGrossRate=rate;},[]);
 $('wmClockStatus').textContent='Stundenlohn für neue Stempelzeiten gespeichert. Bereits abgeschlossene Tage behalten ihren gespeicherten Satz.';
}
async function toggleAutoPayroll(){
 const s=store(),enabled=$('wmClockAutoPayroll').checked;
 if(enabled&&!s.autoPayroll){
  if(!confirm('Automatische Lohnübernahme aktivieren? Für alle vorhandenen Stempelmonate werden die Felder Brutto-Stundenlohn, Arbeitsstunden und Überstunden in der Lohnberechnung ERSETZT. Alle anderen Angaben bleiben erhalten. Die Stunden werden NICHT doppelt hinzugefügt.')){$('wmClockAutoPayroll').checked=false;return;}
 }
 const months=[...new Set(s.entries.map(r=>String(r.workDate||date(new Date(r.startAt))).slice(0,7)))];
 if(!enabled){await saveSafe('Automatische Lohnübernahme deaktiviert',()=>{s.autoPayroll=false;});}
 else{await saveSafe('Automatische Lohnübernahme aktiviert',()=>{s.autoPayroll=true;},months);}
 $('wmClockStatus').textContent=enabled?`Automatische Lohnübernahme aktiv: ${months.length} Monat(e) abgeglichen.`:'Automatische Lohnübernahme deaktiviert. Bereits übertragene Stunden bleiben gespeichert.';
}

const err=e=>{console.error('Stempeluhr:',e);alert(e?.message||String(e))};
function linkedSync(record){ // Only sync a single session per day; never replace an unrelated manual entry.
 const w=state.wm19;if(!w||!Array.isArray(w.timeRows))return {ok:false,message:'Arbeitszeitkonto noch nicht verfügbar'};
 const day=record.workDate||date(new Date(record.startAt)),sessionRows=store().entries.filter(r=>(r.workDate||date(new Date(r.startAt)))===day);
 if(sessionRows.length!==1)return {ok:false,message:'Mehrere Stempelzeiten für diesen Tag. Übernahme bitte manuell prüfen.'};
 const clashes=w.timeRows.filter(r=>r.date===day&&r.wmClockId!==record.id);
 if(clashes.length)return {ok:false,message:'Für diesen Tag besteht bereits ein Arbeitszeiteintrag. Nichts überschrieben.'};
 const from=new Date(record.startAt),to=new Date(record.endAt);
 let linked=w.timeRows.find(r=>r.wmClockId===record.id);
 if(!linked){linked={id:uid(),date:day,wmClockId:record.id};w.timeRows.push(linked)}
 Object.assign(linked,{date:day,start:time(from),end:time(to),breakMinutes:record.pauseMinutes,note:`Stempeluhr: ${record.note||'automatisch erfasst'}`});
 delete linked.hours;return {ok:true,message:'Ins Arbeitszeitkonto übernommen'};
}
async function start(){if(!isOpen())return;const s=store();if(s.active)throw Error('Die Stempeluhr läuft bereits.');const at=new Date();await saveSafe('Stempeluhr gestartet',()=>{s.active={id:uid(),startAt:at.toISOString(),workDate:date(at),targetMinutes:s.targetMinutes,hourlyRate:hourlyRate(s)};});}
async function pauseActive(){if(!isOpen())throw Error('Bitte Profil entsperren.');const s=store();if(!s.active)throw Error('Die Stempeluhr läuft nicht.');if(s.active.pausedAt)throw Error('Stempeluhr ist bereits angehalten.');await saveSafe('Stempeluhr pausiert',()=>{s.active.pausedAt=new Date().toISOString()});}
async function resumeActive(){if(!isOpen())throw Error('Bitte Profil entsperren.');const s=store(),a=s.active;if(!a?.pausedAt)throw Error('Keine angehaltene Stempeluhr vorhanden.');const delta=Math.max(0,Date.now()-new Date(a.pausedAt).getTime());await saveSafe('Stempeluhr fortgesetzt',()=>{a.totalPausedMs=(Number(a.totalPausedMs)||0)+delta;a.pausedAt=null;});}
async function stop(source='detail'){if(!isOpen())throw Error('Bitte Profil entsperren.');const s=store(),a=s.active;if(!a)throw Error('Die Stempeluhr läuft nicht.');const at=new Date(),manualPause=escapeNumber($(source==='home'?'wmClockHomeExtraBreak':'wmClockPause')?.value||0,0,1440),autoPauseMs=(Number(a.totalPausedMs)||0)+(a.pausedAt?Math.max(0,at.getTime()-new Date(a.pausedAt).getTime()):0),autoPause=Math.round(autoPauseMs/60000),pause=autoPause+manualPause,note=$('wmClockNote')?.value.trim()||'';const minutes=compute(a.startAt,at.toISOString(),pause),record={id:a.id,startAt:a.startAt,endAt:at.toISOString(),workDate:a.workDate||date(new Date(a.startAt)),pauseMinutes:pause,autoPauseMinutes:autoPause,manualPauseMinutes:manualPause,minutes,targetMinutes:a.targetMinutes,hourlyRate:Number.isFinite(Number(a.hourlyRate))?Number(a.hourlyRate):hourlyRate(s),note,createdAt:new Date().toISOString()};
 let sync;
 await saveSafe('Stempeluhr gestoppt',()=>{s.active=null;s.entries.push(record);sync=linkedSync(record);window.WM195?.log('Stempelung abgeschlossen',record.id,null,record);},[record.workDate.slice(0,7)]);
 if($('wmClockNote'))$('wmClockNote').value='';
 if($('wmClockHomeExtraBreak'))$('wmClockHomeExtraBreak').value='0';
 $('wmClockStatus').textContent=`Gestoppt: ${hhm(minutes)} Std. / ${industrial(minutes)} Industriestunden. ${sync?.message||''}`;
}
async function cancelActive(){const s=store();if(!s.active)return;if(!confirm('Laufende Stempelung wirklich verwerfen? Bereits gespeicherte Zeiten bleiben erhalten.'))return;await saveSafe('Laufende Stempelung verworfen',()=>{s.active=null});}
async function saveTarget(){const h=escapeNumber($('wmClockTargetH').value,0,24),m=escapeNumber($('wmClockTargetM').value,0,59);if(h===24&&m)throw Error('Tages-Soll maximal 24 Stunden.');const s=store(),goal=h*60+m;await saveSafe('Tages-Soll gespeichert',()=>{s.targetMinutes=goal;});}
function manualForm(row=null){if(!isOpen())return;const r=row||{startAt:new Date().toISOString(),endAt:new Date().toISOString(),pauseMinutes:30,note:'',targetMinutes:store().targetMinutes},d1=new Date(r.startAt),d2=new Date(r.endAt);
 modal(`<div class="sheet-head"><strong>Stempelzeit ${row?'bearbeiten':'nachtragen'}</strong><button onclick="closeModal()">✕</button></div><form id="wmClockForm" class="wmc-form"><label>Arbeitstag<input name="day" type="date" value="${r.workDate||date(d1)}" required></label><label>Beginn<input name="begin" type="time" value="${time(d1)}" required></label><label>Ende<input name="end" type="time" value="${row?time(d2):time(new Date(d1.getTime()+8*3600000))}" required></label><label>Ende am Folgetag?<select name="next"><option value="auto">Automatisch bei Ende vor Beginn</option><option value="yes" ${row&&date(d1)!==date(d2)?'selected':''}>Ja</option><option value="no">Nein</option></select></label><label>Pause (Minuten)<input name="pause" type="number" min="0" max="1440" step="1" value="${Number(r.pauseMinutes)||0}" required></label><label>Brutto-Stundenlohn (€)<input name="rate" type="number" min="0" max="10000" step="0.01" value="${rateForRecord(r).toFixed(2)}" required></label><label>Tagessoll (Minuten)<input name="target" type="number" min="0" max="1440" step="1" value="${slotTarget(r)}" required></label><label>Notiz<input name="note" value="${esc(r.note||'')}"></label><button type="submit" class="primary">Speichern</button></form><p class="wmc-small">Nachtschichten werden dem Starttag zugeordnet. Berechnung über die tatsächliche Zeit einschließlich Zeitumstellung.</p>`);
 $('wmClockForm').onsubmit=event=>{event.preventDefault();const btn=event.target.querySelector('button[type=submit]');btn.disabled=true;(async()=>{const f=Object.fromEntries(new FormData(event.target)),startAt=parseISOTime(f.day,f.begin),endAt=parseISOTime(f.day,f.end),pause=escapeNumber(f.pause,0,1440),target=escapeNumber(f.target,0,1440),rate=Number(f.rate);if(!Number.isFinite(rate)||rate<0||rate>10000)throw Error('Ungültiger Stundenlohn.');if(f.next==='yes'||(f.next==='auto'&&endAt<startAt))endAt.setDate(endAt.getDate()+1);const minutes=compute(startAt.toISOString(),endAt.toISOString(),pause),obj={id:row?.id||uid(),startAt:startAt.toISOString(),endAt:endAt.toISOString(),pauseMinutes:pause,targetMinutes:target,hourlyRate:rate,workDate:f.day,minutes,note:String(f.note||'').trim(),createdAt:row?.createdAt||new Date().toISOString()};
 const data=store(),old=JSON.stringify(data),old19=JSON.stringify(state.wm19||null),oldPay=JSON.stringify(state.wmPayroll??null),old195=JSON.stringify(state.wm195??null);try{
 if(row){const ix=data.entries.findIndex(x=>x.id===row.id);if(ix<0)throw Error('Eintrag nicht mehr vorhanden.');data.entries[ix]=obj;
 // Editing the date clears old linked time row; do not silently leave old hours in summary.
 if(state.wm19?.timeRows){state.wm19.timeRows=state.wm19.timeRows.filter(x=>x.wmClockId!==row.id)}
 }else data.entries.push(obj);
 window.WM195?.log(row?'Stempelung geändert':'Stempelung nachgetragen',obj.id,row||null,obj);
 const synced=linkedSync(obj);if(store().autoPayroll){syncMonthToPayroll((row?.workDate||date(new Date(row?.startAt||obj.startAt))).slice(0,7));syncMonthToPayroll(f.day.slice(0,7));}await save('Stempelzeit gespeichert');refresh();if(store().autoPayroll)alertPayrollSynced([(row?.workDate||date(new Date(row?.startAt||obj.startAt))).slice(0,7),f.day.slice(0,7)]);closeModal();if($('wmClockStatus'))$('wmClockStatus').textContent=synced.message;
 }catch(e){state.wm20=JSON.parse(old);state.wm19=JSON.parse(old19);state.wmPayroll=JSON.parse(oldPay);state.wm195=JSON.parse(old195);throw e}
 })().catch(err).finally(()=>btn.disabled=false)};
}
async function remove(id){const s=store(),r=s.entries.find(x=>x.id===id);if(!r)return;if(!confirm('Stempelzeit löschen? Der Eintrag wird im Stempelzeit-Papierkorb aufgehoben.'))return;await saveSafe('Stempelzeit gelöscht',()=>{s.deleted??=[];s.deleted.push({...r,deletedAt:new Date().toISOString()});s.entries=s.entries.filter(x=>x.id!==id);window.WM195?.log('Stempelung im Papierkorb',id,r,null);if(state.wm19?.timeRows)state.wm19.timeRows=state.wm19.timeRows.filter(x=>x.wmClockId!==id)},[(r.workDate||date(new Date(r.startAt))).slice(0,7)])}
async function restore(id){const s=store(),r=(s.deleted||[]).find(x=>x.id===id);if(!r)return;await saveSafe('Stempelzeit wiederhergestellt',()=>{s.entries.push({...r});s.deleted=s.deleted.filter(x=>x.id!==id);linkedSync(r);window.WM195?.log('Stempelung wiederhergestellt',id,null,r)},[(r.workDate||date(new Date(r.startAt))).slice(0,7)])}
function fmtLong(s){return new Date(s).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})}
function renderEntries(){const s=store(),list=$('wmClockEntries');if(!list)return;const month=$('wmClockMonth')?.value||today().slice(0,7),rows=[...s.entries].filter(x=>(x.workDate||date(new Date(x.startAt))).startsWith(month)).sort((a,b)=>b.startAt.localeCompare(a.startAt));const days=daySummary(rows);const mins=rows.reduce((n,x)=>n+x.minutes,0),targets=days.reduce((n,x)=>n+x.goal,0);const extra=days.reduce((n,x)=>n+x.overtime,0),delta=mins-targets,wages=wageStats(rows,s);
 $('wmClockMonthSummary').innerHTML=`<div class="wmc-stats"><span><strong>${hhm(mins)}</strong><small>Ist (normal)</small></span><span><strong>${industrial(mins)}</strong><small>Ist (Industrie)</small></span><span><strong>${hhm(extra)}</strong><small>Überstunden</small></span><span><strong>${industrial(extra)}</strong><small>Überstunden Industrie</small></span><span><strong>${hhm(delta)}</strong><small>Saldo inkl. Minusstunden</small></span><span><strong>${euros(wages.gross)}</strong><small>Brutto-Grundlohn (Monat)</small></span><span><strong>${wages.days}</strong><small>Erfasste Arbeitstage</small></span></div><p class="wmc-small">Soll: ${hhm(targets)} (${industrial(targets)} Industriestunden) für ${days.length} erfasste Arbeitstage. Fehlende Tage werden hier nicht als Minusstunden gezählt.</p>`;
 if($('wmClockDayStats'))$('wmClockDayStats').innerHTML=wages.byDay.map(d=>{const daily=rows.filter(x=>(x.workDate||date(new Date(x.startAt)))===d.day);const gross=roundMoney(daily.reduce((n,x)=>n+x.minutes*rateForRecord(x,s)/60,0));return `<div class="wmc-entry"><strong>${esc(d.day)} · ${hhm(d.total)} Std. / ${industrial(d.total)} Industrie</strong><small>Soll ${hhm(d.goal)} · Überstunden ${hhm(d.overtime)} (${industrial(d.overtime)} Industrie) · Brutto ${euros(gross)}</small></div>`}).join('')||'<p>Keine erfassten Tage für diesen Monat.</p>';
 list.innerHTML=rows.length?rows.map(x=>{const diff=x.minutes-slotTarget(x);return `<div class="wmc-entry"><div><strong>${esc(fmtLong(x.startAt))} – ${esc(time(new Date(x.endAt)))}</strong><small>Ist ${hhm(x.minutes)} = ${industrial(x.minutes)} Industrie · Soll ${hhm(slotTarget(x))} · Differenz ${hhm(diff)} = ${industrial(diff)} Industrie · ${euros(roundMoney(x.minutes*rateForRecord(x,s)/60))} brutto bei ${euros(rateForRecord(x,s))}/Std.${x.note?' · '+esc(x.note):''}</small></div><div class="wmc-buttons"><button data-wmc-edit="${esc(x.id)}">Bearbeiten</button><button data-wmc-delete="${esc(x.id)}" class="secondary">Löschen</button></div></div>`}).join(''):'<p>Noch keine Stempelzeiten in diesem Monat.</p>';
 const deleted=$('wmClockDeleted');deleted.innerHTML=(s.deleted||[]).length?(s.deleted||[]).slice(-20).reverse().map(r=>`<div class="wmc-entry"><span>${esc(fmtLong(r.startAt))} · ${hhm(r.minutes)}</span><button data-wmc-restore="${esc(r.id)}">Wiederherstellen</button></div>`).join(''):'<p>Keine gelöschten Stempelzeiten.</p>';
}
function live(){if(!isOpen())return;const s=store(),a=s.active,paused=!!a?.pausedAt,running=!!a&&!paused,mode=running?'is-running':paused?'is-paused':'is-stopped',home=$('wmClockHome');
 const recent=[...s.entries].sort((a,b)=>String(b.endAt).localeCompare(String(a.endAt)))[0],elapsed=a?elapsedWithoutPauses(a):recent?.minutes||0;
 if(home){home.classList.remove('is-running','is-paused','is-stopped');home.classList.add(mode)}
 const status=running?'LÄUFT':paused?'PAUSIERT':'GESTOPPT';
 if($('wmClockHomeState'))$('wmClockHomeState').textContent=status;
 if($('wmClockHomeTimer'))$('wmClockHomeTimer').textContent=hhm(elapsed);
 if($('wmClockHomeIndustrie'))$('wmClockHomeIndustrie').textContent=industrial(elapsed)+' Industriestunden';const currentRate=a?rateForRecord(a,s):rateForRecord(recent,s);
 if($('wmClockHomeGross'))$('wmClockHomeGross').textContent=euros(roundMoney(elapsed*currentRate/60))+' brutto (diese Stempelung)';
 const day=a?(a.workDate||date(new Date(a.startAt))):today(),closedToday=s.entries.filter(r=>(r.workDate||date(new Date(r.startAt)))===day),todayMinutes=closedToday.reduce((sum,r)=>sum+r.minutes,0),todayGross=closedToday.reduce((sum,r)=>sum+r.minutes*rateForRecord(r,s)/60,0);
 const activeToday=!!a&&(a.workDate||date(new Date(a.startAt)))===day;
 if($('wmClockHomeToday'))$('wmClockHomeToday').textContent='Arbeitstag '+day.split('-').reverse().join('.')+': '+hhm(todayMinutes+(activeToday?elapsed:0))+' Std. · '+euros(roundMoney(todayGross+(activeToday?elapsed*currentRate/60:0)))+' brutto';
 if($('wmClockHomeHint'))$('wmClockHomeHint').textContent=a?(paused?'Angehalten seit '+time(new Date(a.pausedAt))+' · Pausenzeit zählt nicht':`Gestartet um ${time(new Date(a.startAt))} · zusätzliche Pause wird beim Stoppen abgezogen`):recent?`Letzter abgeschlossener Arbeitstag: ${date(new Date(recent.startAt))}`:'Bereit für deine nächste Schicht';
 const liveStatus=$('wmClockLive');if(liveStatus){liveStatus.textContent=a?(paused?`Pausiert · ${hhm(elapsed)} Arbeitszeit`:`Läuft seit ${time(new Date(a.startAt))} · ${hhm(elapsed)} bisher`):'Gestoppt / nicht eingestempelt';liveStatus.classList.toggle('wmc-live-running',running);liveStatus.classList.toggle('wmc-live-stopped',!running)}
 for(const prefix of ['wmClock','wmClockHome']){
  const startBtn=$(prefix+'Start'),stopBtn=$(prefix+'Stop'),pauseBtn=$(prefix==='wmClock'?'wmClockPauseButton':prefix+'Pause');
  if(startBtn)startBtn.disabled=!!a;
  if(stopBtn)stopBtn.disabled=!a;
  if(pauseBtn){pauseBtn.disabled=!a;pauseBtn.textContent=paused?'▶ Weiter':'Ⅱ Pause';}
 }
} 
function refresh(){if(!isOpen())return;const s=store();const wageInput=$('wmClockRate'),auto=$('wmClockAutoPayroll');if(wageInput&&document.activeElement!==wageInput)wageInput.value=hourlyRate(s).toFixed(2);if(auto)auto.checked=!!s.autoPayroll;const h=$('wmClockTargetH'),m=$('wmClockTargetM');if(h&&document.activeElement!==h)h.value=Math.floor(s.targetMinutes/60);if(m&&document.activeElement!==m)m.value=s.targetMinutes%60;live();renderEntries()}
function bind(){const call=f=>()=>Promise.resolve().then(f).catch(err);
 $('wmClockStart').onclick=call(start);$('wmClockStop').onclick=call(stop);$('wmClockPauseButton').onclick=call(()=>store().active?.pausedAt?resumeActive():pauseActive());$('wmClockHomeStart').onclick=call(start);$('wmClockHomeStop').onclick=call(()=>stop('home'));$('wmClockHomePause').onclick=call(()=>store().active?.pausedAt?resumeActive():pauseActive());$('wmClockHomeDetails').onclick=()=>{go('shift');$('wmClockRoot')?.scrollIntoView({block:'start',behavior:'smooth'})};$('wmClockSaveTarget').onclick=call(saveTarget);$('wmClockCancel').onclick=call(cancelActive);$('wmClockAdd').onclick=()=>manualForm();$('wmClockSaveRate').onclick=call(saveWageSettings);$('wmClockAutoPayroll').onchange=()=>Promise.resolve().then(toggleAutoPayroll).catch(e=>{if($('wmClockAutoPayroll'))$('wmClockAutoPayroll').checked=!!store().autoPayroll;err(e)});$('wmClockMonth').onchange=renderEntries;
 $('wmClockEntries').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.wmcEdit){const r=store().entries.find(x=>x.id===b.dataset.wmcEdit);if(r)manualForm(r)}else if(b.dataset.wmcDelete)call(()=>remove(b.dataset.wmcDelete))()};
 $('wmClockDeleted').onclick=e=>{const b=e.target.closest('[data-wmc-restore]');if(b)call(()=>restore(b.dataset.wmcRestore))()};
}
function mount(){if($('wmClockRoot'))return;const shift=$('shift');if(!shift)return;
 const css=document.createElement('style');css.textContent=`.wmc{margin:16px 0;padding:15px;background:var(--card,#fff);border:1px solid var(--line,#ddd);border-radius:16px;color:var(--ink,#082f4c)}.wmc h3{margin:0 0 10px}.wmc button{border:0;border-radius:8px;padding:10px 12px;background:var(--accent2,#087d79);color:white;font-weight:700;font-size:13px}.wmc button.secondary{background:#eef3f8;color:#1b4058}.wmc-buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px}.wmc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wmc label,.wmc-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700}.wmc input,.wmc-form input,.wmc-form select{width:100%;box-sizing:border-box;border:1px solid #b9c8d8;padding:10px;border-radius:8px;font:16px system-ui;color:#12334a;background:white}.wmc-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.wmc-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.wmc-stats span{padding:10px;background:#f0f5f8;border-radius:9px}.wmc-stats strong{display:block;font-size:18px}.wmc-stats small,.wmc-entry small{display:block;color:#536e82;font-size:12px;line-height:1.5}.wmc-entry{padding:10px 0;border-bottom:1px solid #dfe7ef}.wmc-small{font-size:12px;color:#596c78;line-height:1.55}.wmc-form{display:grid;gap:10px}.wmc-live{padding:11px 0;font-size:18px;font-weight:800}.wmc-live-running{color:#11743b}.wmc-live-stopped{color:#b42331}.wmc-status{font-size:13px;color:#1d6759}@media(max-width:520px){.wmc-grid{grid-template-columns:minmax(0,1fr)}.wmc-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
 css.textContent+=`
.wmc-home{padding:clamp(18px,4vw,28px);border:2px solid #efb4b8;border-radius:18px;margin:16px 0 20px;background:#fff7f7;color:#af2434;box-shadow:0 4px 16px #10294213;transition:background .2s,border-color .2s}
.wmc-home.is-running{background:#edfcf2;border-color:#85d5a2;color:#126b37}.wmc-home.is-paused,.wmc-home.is-stopped{background:#fff5f5;border-color:#e7aaaa;color:#aa2638}
.wmc-home-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.wmc-home-head h3{font-size:clamp(20px,4.5vw,26px);font-weight:850;margin:0;color:inherit}.wmc-home-status{font-size:14px;font-weight:900;letter-spacing:.09em;border:1px solid currentColor;padding:7px 12px;border-radius:100px}
.wmc-home-clock{font-size:clamp(48px,12vw,76px);font-weight:900;line-height:1.08;letter-spacing:-.04em;font-variant-numeric:tabular-nums;margin:16px 0 5px;color:inherit}
.wmc-home-industrie{font-size:clamp(18px,4vw,23px);font-weight:800;color:inherit}.wmc-home-today{font-weight:750;font-size:14px;margin:6px 0;color:inherit}.wmc-home-gross{font-size:clamp(18px,4vw,23px);font-weight:800;margin:8px 0;color:inherit}.wmc-autosync{display:flex!important;align-items:center;gap:10px;margin:12px 0}.wmc-autosync input{width:21px;height:21px;flex:0 0 21px}.wmc-home-hint{font-size:13px;margin:13px 0;color:inherit;line-height:1.4}
.wmc-home-break{display:flex;align-items:center;justify-content:space-between;gap:14px;color:inherit;font-size:13px;font-weight:700}.wmc-home-break input{max-width:86px;min-width:65px;padding:10px 8px;border:1px solid currentColor;border-radius:9px;background:white;font:16px system-ui;color:#172f45}.wmc-home-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:16px 0 9px}
.wmc-home-actions button{min-height:52px;font-size:16px;font-weight:850;border:1px solid currentColor;border-radius:10px;background:white;color:inherit;padding:9px 5px;cursor:pointer}
.wmc-home-actions button:disabled{opacity:.4;cursor:default}.wmc-home-actions button:not(:disabled):active{transform:scale(.98)}
.wmc-home-details{background:none;border:0;font-size:13px;font-weight:700;color:inherit;text-decoration:underline;padding:10px 0;cursor:pointer}
@media(max-width:380px){.wmc-home-actions button{font-size:14px}.wmc-home{padding:14px}}`;
 document.head.appendChild(css);
 const dashboard=$('dashboard');if(dashboard&&!$('wmClockHome')){const box=document.createElement('section');box.id='wmClockHome';box.className='wmc-home is-stopped';box.setAttribute('aria-label','Stempeluhr Startseite');box.innerHTML=`<div class="wmc-home-head"><h3>Stempeluhr</h3><span id="wmClockHomeState" class="wmc-home-status" role="status">GESTOPPT</span></div><div class="wmc-home-clock" id="wmClockHomeTimer">00:00</div><div id="wmClockHomeIndustrie" class="wmc-home-industrie">0,00 Industriestunden</div><p class="wmc-home-gross" id="wmClockHomeGross">0,00 € brutto (diese Stempelung)</p><p class="wmc-home-today" id="wmClockHomeToday">Heute gesamt: 00:00 Std. · 0,00 € brutto</p><p id="wmClockHomeHint" class="wmc-home-hint">Bereit für deine nächste Schicht</p><label class="wmc-home-break">Weitere unbezahlte Pausenminuten<input type="number" id="wmClockHomeExtraBreak" min="0" max="1440" step="1" value="0"></label><div class="wmc-home-actions"><button id="wmClockHomeStart" type="button">▶ Start</button><button id="wmClockHomePause" type="button">Ⅱ Pause</button><button id="wmClockHomeStop" type="button">■ Stopp</button></div><button id="wmClockHomeDetails" type="button" class="wmc-home-details">Stempelzeiten ansehen und nachbearbeiten →</button>`;const hero=dashboard.querySelector('.dashboard-hero');if(hero)hero.insertAdjacentElement('afterend',box);else dashboard.insertAdjacentElement('afterbegin',box);}
 const panel=document.createElement('section');panel.id='wmClockRoot';panel.className='wmc';panel.innerHTML=`<h3>Stempeluhr</h3><p class="wmc-small">Start/Stopp oder Zeiten nachtragen. Zeitangaben bleiben im aktiven verschlüsselten Profil.</p><div id="wmClockLive" class="wmc-live">Nicht eingestempelt</div><h3>Bruttolohn &amp; automatische Abrechnung</h3><div class="wmc-grid"><label>Brutto-Stundenlohn (€)<input id="wmClockRate" type="number" step="0.01" min="0" max="10000" value="0"></label><div class="wmc-toolbar"><button id="wmClockSaveRate" type="button">Stundenlohn speichern</button></div></div><label class="wmc-autosync"><input type="checkbox" id="wmClockAutoPayroll"> Abgeschlossene Stempelzeiten automatisch in die Lohnberechnung übernehmen</label><p class="wmc-small">Optional: Pro Monat werden Brutto-Stundenlohn, Normalstunden und Überstunden in die Lohnberechnung geschrieben. Bereits vorhandene Stundenzahlen werden ersetzt, nicht addiert. Sonstige Lohnangaben bleiben erhalten. Der Stundenlohn eines abgeschlossenen Tages wird für die Tagesstatistik gespeichert. Bei unterschiedlichen Stundensätzen muss die Lohnabrechnung separat geprüft werden. Zuschläge werden nur in der Lohnberechnung berücksichtigt.</p><div class="wmc-grid"><label>Pause beim Stoppen (Minuten)<input type="number" id="wmClockPause" min="0" max="1440" step="1" value="30"></label><label>Notiz<input id="wmClockNote" placeholder="z. B. Frühschicht"></label></div><div class="wmc-toolbar"><button type="button" id="wmClockStart">Start</button><button type="button" id="wmClockStop" class="secondary">Stopp</button><button type="button" id="wmClockPauseButton" class="secondary">Ⅱ Pause</button><button type="button" id="wmClockAdd" class="secondary">Zeit nachtragen</button><button type="button" id="wmClockCancel" class="secondary">Laufende Zeit verwerfen</button></div><p id="wmClockStatus" class="wmc-status" aria-live="polite"></p><h3>Täglich zu leistende Arbeitszeit</h3><div class="wmc-grid"><label>Stunden<input type="number" id="wmClockTargetH" min="0" max="24" value="7"></label><label>Minuten<input type="number" id="wmClockTargetM" min="0" max="59" value="30"></label></div><div class="wmc-toolbar"><button id="wmClockSaveTarget" type="button">Tages-Soll speichern</button></div><p class="wmc-small">Beispiel: 7:30 Uhr = 7,50 Industriestunden; 30 Minuten Überstunden = 0,50 Industriestunden. Der Monats-Saldo berücksichtigt auch Minusstunden.</p><label>Monat auswählen<input type="month" id="wmClockMonth" value="${today().slice(0,7)}"></label><div id="wmClockMonthSummary"></div><h3>Tagesstatistik – Stunden und Brutto</h3><div id="wmClockDayStats"></div><h3>Gestempelte Zeiten</h3><div id="wmClockEntries"></div><details><summary>Gelöschte Stempelzeiten</summary><div id="wmClockDeleted"></div></details>`;
 const anchor=$('wm19TimeCard');if(anchor)anchor.insertAdjacentElement('afterend',panel);else shift.appendChild(panel);bind();refresh();
 let ref=state;if(typeof window.renderAll==='function'){const previous=window.renderAll;window.renderAll=function(...args){const changed=state!==ref;const result=previous.apply(this,args);if(changed)ref=state;setTimeout(refresh,0);return result}}
 window.WMClockPayrollTotals=payrollMonthTotals;
 const updateTitle=$('wmplusQuickUpdateCheck')?.closest('#wmplusQuickUpdateBar')?.querySelector('strong');if(updateTitle)updateTitle.textContent='App-Updates · WorksManager 1.9.5';
 window.addEventListener('pageshow',()=>setTimeout(refresh,150));setInterval(live,15000);console.info('WorksManager Stempeluhr 1.9.5 geladen');
}
if(typeof module!=='undefined'&&module.exports)module.exports={compute,hhm,industrial,daySummary,parseISOTime,wageStats,payrollMonthTotals,syncMonthToPayroll};
else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
