/* WorksManager 2.0.0 – sichere Lohnsynchronisation, Zuschläge, Zeitkonto,
   Stempelprüfung, Kalender, Abrechnungsabgleich und Profil-Backups.
   Zusatzdaten nur in AES-GCM-verschlüsseltem state.wm195.
   Die bestehende IndexedDB und die Kern-Anwendungsdateien bleiben unverändert.
*/
(() => {
'use strict';
const VERSION='2.0.0', BUILD=2026101401;
const $=id=>document.getElementById(id);
const E=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const nowDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const currentMonth=()=>nowDate().slice(0,7);
const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const EUR=n=>(Number(n)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const HM=min=>{const neg=min<0?'-':'';const n=Math.abs(Math.round(min));return `${neg}${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
const IND=min=>(Math.round(min)/60).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
const uuid=()=>crypto.randomUUID?.()||String(Date.now())+Math.random().toString(36).slice(2);
const deep=v=>JSON.parse(JSON.stringify(v));
const def={
 rates:{overtimePayAfterMinutes:null,late:0,lateStart:'13:45',lateEnd:'21:45',enableLate:true,night:25,nightHigh:35,nightHighStart:'00:00',nightHighEnd:'04:00',enableNightHigh:true,nightPauseStart:'02:30',nightPauseMinutes:30,sunday:50,holiday:125,overtime:25,nightStart:'22:00',nightEnd:'06:00',enableNight:true,enableSunday:true,enableHoliday:true,autoPremiums:false,paidLeave:false,minimumBreak6:30,minimumBreak9:45,warningLongHours:12},
 time:{openingMinutes:0,adjustments:[]},actuals:{},backupRequestedAt:'',audit:[],monthlyConfirmed:{},reportMonth:currentMonth(),calendarMonth:currentMonth()
};
function accessible(){return !!$('app')&&!$('app').classList.contains('hidden')&&typeof state!=='undefined';}
function db(){if(!state.wm195||typeof state.wm195!=='object'||Array.isArray(state.wm195))state.wm195={};const x=state.wm195;
 if(!x.rates||typeof x.rates!=='object')x.rates=deep(def.rates);
 else {
  if(x.rates.nightHigh===undefined&&x.rates.nightStart==='21:45'&&x.rates.nightEnd==='05:45'&&Number(x.rates.night)===25){x.rates.nightStart='22:00';x.rates.nightEnd='06:00';}
  for(const [k,v] of Object.entries(def.rates))if(x.rates[k]===undefined)x.rates[k]=v;
 }
 if(!x.time||typeof x.time!=='object')x.time=deep(def.time);if(!Array.isArray(x.time.adjustments))x.time.adjustments=[];
 if(!x.actuals||typeof x.actuals!=='object')x.actuals={};if(!Array.isArray(x.audit))x.audit=[];
 if(!x.monthlyConfirmed||typeof x.monthlyConfirmed!=='object')x.monthlyConfirmed={};
 if(!x.reportMonth)x.reportMonth=currentMonth();if(!x.calendarMonth)x.calendarMonth=currentMonth();return x;}
const rows=()=>Array.isArray(state.wm20?.entries)?state.wm20.entries:[];
function recDay(r){return r.workDate||new Date(r.startAt).toLocaleDateString('sv-SE');}
function target(r){return Number.isFinite(Number(r.targetMinutes))?Number(r.targetMinutes):Number(state.wm20?.targetMinutes)||450;}
function recordRate(r){const v=Number(r.hourlyRate);return Number.isFinite(v)&&v>=0?v:Math.max(0,Number(state.wm20?.hourlyGrossRate)||0);}
function dayGroups(source=rows()){const m=new Map();for(const r of source){const key=recDay(r);if(!m.has(key))m.set(key,[]);m.get(key).push(r);}return [...m.entries()].map(([day,items])=>({day,items:items.sort((a,b)=>a.startAt.localeCompare(b.startAt)),total:items.reduce((n,x)=>n+Number(x.minutes||0),0),goal:Math.max(...items.map(target),0)})).sort((a,b)=>a.day.localeCompare(b.day));}
// Optional personal overtime-payment threshold in worked minutes per day.
// null = retain the existing pay behaviour based on the day-specific Sollzeit.
function paidOvertimeThreshold(day,settings=db().rates){
 const raw=settings.overtimePayAfterMinutes;
 if(raw===null||raw===undefined||raw==='')return day.goal;
 const n=Number(raw);
 return Number.isInteger(n)&&n>=0&&n<=1440?n:day.goal;
}
function parsePayThreshold(value){
 const raw=String(value??'').trim();
 if(!raw)return null;
 const clock=/^(\d{1,2}):([0-5]\d)$/.exec(raw);
 if(clock){const hours=Number(clock[1]),minutes=Number(clock[2]);
  if(hours>24||(hours===24&&minutes!==0))throw Error('Überstundengrenze bitte zwischen 00:00 und 24:00 eintragen.');
  return hours*60+minutes;
 }
 const decimal=raw.replace(',','.');
 if(!/^\d{1,2}(?:\.\d{1,3})?$/.test(decimal)||Number(decimal)>24)throw Error('Überstundengrenze als 08:00 oder 8,5 Stunden eingeben.');
 return Math.round(Number(decimal)*60);
}
function payThresholdLabel(minutes){return minutes==null?'Tages-Sollzeit':HM(minutes)+' Std.';}
function holidayDates(year){try{return new Set((nrwHolidays(year)||[]).map(x=>x.date));}catch{return new Set();}}
const between=(s,e,t)=>{const f=x=>{const a=String(x).split(':').map(Number);return a[0]*60+a[1]};const start=f(s),end=f(e);return start===end?true:start<end?t>=start&&t<end:t>=start||t<end;};
function premiumUnits(r,settings=db().rates){
 const start=new Date(r.startAt).getTime(),end=new Date(r.endAt).getTime(),span=Math.round((end-start)/60000),paid=Number(r.minutes)||0;
 if(!Number.isFinite(start)||!Number.isFinite(end)||span<=0||span>1440||paid<=0)return {late:0,night:0,nightHigh:0,sunday:0,holiday:0,approx:true};
 // A break is already excluded from record.minutes. Locate it only for distributing
 // night premiums: never subtract it a second time from worked hours or gross wages.
 const unpaid=Math.min(span,Math.max(0,span-paid));
 const breakLength=Math.max(0,Math.min(240,Number(settings.nightPauseMinutes)||0));
 const breakStart=typeof settings.nightPauseStart==='string'?settings.nightPauseStart:'';
 const slots=[],holidayMap=new Map();
 for(let i=0;i<span;i++){
  const d=new Date(start+i*60000),year=d.getFullYear(),day=`${year}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if(!holidayMap.has(year))holidayMap.set(year,holidayDates(year));
  const clock=d.getHours()*60+d.getMinutes();
  let kind='';
  if(settings.enableNight&&settings.enableNightHigh===true&&between(settings.nightHighStart,settings.nightHighEnd,clock))kind='nightHigh';
  else if(settings.enableNight&&between(settings.nightStart,settings.nightEnd,clock))kind='night';
  else if(settings.enableLate&&between(settings.lateStart,settings.lateEnd,clock))kind='late';
  slots.push({kind,sunday:!!(settings.enableSunday&&d.getDay()===0&&!holidayMap.get(year).has(day)),holiday:!!(settings.enableHoliday&&holidayMap.get(year).has(day)),clock,at:start+i*60000,excluded:false});
 }
 let allocated=0;
 // Recorded pause segments take precedence whenever precise times are available.
 const segments=Array.isArray(r.pauseSegments)?r.pauseSegments:[];
 for(const seg of segments){
  if(allocated>=unpaid)break;
  const a=new Date(seg.startAt).getTime(),b=new Date(seg.endAt).getTime();
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)continue;
  for(const slot of slots){if(allocated>=unpaid)break;if(!slot.excluded&&slot.at>=a&&slot.at<b){slot.excluded=true;allocated++;}}
 }
 // For older/manual entries without exact pause timestamps, locate up to the
 // configured pause minutes at 02:30 (default). Other pauses remain estimates.
 const hasExact=segments.length>0;
 if(!hasExact&&breakLength&&/^([01]\d|2[0-3]):[0-5]\d$/.test(breakStart)){
  const baseClock=Number(breakStart.slice(0,2))*60+Number(breakStart.slice(3));
  for(const slot of slots){if(allocated>=Math.min(unpaid,breakLength))break;
   const dist=(slot.clock-baseClock+1440)%1440;
   if(dist<breakLength&&!slot.excluded){slot.excluded=true;allocated++;}
  }
 }
 const remaining=Math.max(0,unpaid-allocated),available=Math.max(0,span-allocated),ratio=available?Math.max(0,1-remaining/available):0;
 const totals={late:0,night:0,nightHigh:0,sunday:0,holiday:0};
 for(const slot of slots){if(slot.excluded)continue;
  if(slot.kind)totals[slot.kind]+=ratio;
  if(slot.sunday)totals.sunday+=ratio;
  if(slot.holiday)totals.holiday+=ratio;
 }
 for(const k of Object.keys(totals))totals[k]=Math.round(totals[k]*10000)/10000;
 // Scheduled pauses are only an assumption unless actual pause timestamps exist.
 return {...totals,approx:unpaid>0&&!hasExact,scheduledPauseUsed:allocated>0&&!hasExact,unpaidMinutes:unpaid};
}
function splitPay(month,options={}){const groups=dayGroups(rows().filter(r=>recDay(r).startsWith(month)));const items=[];let total=0,regular=0,overtime=0,paidOvertime=0,gross=0;
 const rateMap=new Map(),premMap=new Map();
 const settings=db().rates;
 function aggregate(map,category,rate,mins,pct){if(mins<=0)return;const key=`${category}:${rate}:${pct}`;if(!map.has(key))map.set(key,{category,rate,mins:0,pct});map.get(key).mins+=mins;}
 for(const g of groups){
  // The time-account Soll and the payment threshold are independent settings.
  let leftTime=g.goal,leftPaid=paidOvertimeThreshold(g,settings);
  for(const r of g.items){
   const mins=Number(r.minutes)||0,rate=recordRate(r);
   const timeRegular=Math.min(Math.max(0,leftTime),mins),timeExtra=Math.max(0,mins-timeRegular);
   const payRegular=Math.min(Math.max(0,leftPaid),mins),payExtra=Math.max(0,mins-payRegular);
   leftTime-=timeRegular;leftPaid-=payRegular;
   regular+=timeRegular;overtime+=timeExtra;paidOvertime+=payExtra;total+=mins;gross+=mins/60*rate;
   // All worked hours are paid at their normal hourly base rate; for fixed salary,
   // only the portion beyond the manually chosen payment threshold is added.
   aggregate(rateMap,'Regulär',rate,payRegular,0);
   aggregate(rateMap,'Überstunden-Grundlohn',rate,payExtra,0);
   aggregate(premMap,'Überstundenzuschlag',rate,payExtra,settings.overtime);
   if(settings.autoPremiums||options.previewPremiums){const ps=premiumUnits(r,settings);for(const kind of ['late','night','nightHigh','sunday','holiday'])aggregate(premMap,kind,rate,ps[kind],Number(settings[kind])||0);}
  }
 }
 const mapLabel={late:'Spätschicht',night:'Nachtschicht 25%-Stufe',nightHigh:'Nachtschicht 35%-Stufe',sunday:'Sonntag',holiday:'NRW-Feiertag'};
 for(const g of rateMap.values())items.push({id:`wm195:base:${g.category}:${g.rate}`,wm195Auto:true,name:`Stempeluhr ${g.category} (${g.rate.toFixed(2)} €/Std.)`,kind:'wage',hours:round(g.mins/60),rate:g.rate,pct:0,amount:0,taxable:true,sv:true});
 for(const g of premMap.values()){if(!g.pct||!g.mins)continue;const label=mapLabel[g.category]||g.category;
  items.push({id:`wm195:premium:${g.category}:${g.rate}`,wm195Auto:true,name:`Automatisch ${label} (${g.pct} %; Pause gemäß Einstellungen)`,kind:'premium',hours:Math.round(g.mins/60*10000)/10000,rate:g.rate,pct:g.pct,amount:0,taxable:true,sv:true});
 }
 return {month,entries:rows().filter(r=>recDay(r).startsWith(month)).length,total,regular,overtime,paidOvertime,gross:round(gross),items};
}
function ensureMonth(month,existing){const pay=state.wmPayroll||(state.wmPayroll={profile:{},months:{}});pay.months??={};pay.profile??={};const old=existing||pay.months[month];return {pay,old};}
function syncPayrollMonth(month,options={}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))return false;
 const auto=!!state.wm20?.autoPayroll, premiumsEnabled=!!db().rates.autoPremiums;
 const transferBase=auto||!!options.force;
 if(!transferBase&&!premiumsEnabled&&!options.premiumsOnly)return false;
 const s=splitPay(month),{pay,old}=ensureMonth(month,options.target);
 if(s.entries===0&&!old?.wm195Sync&&!old?.wmClockSync)return false;
 if(transferBase&&old&&!old.wm195Sync&&!old.wmClockSync&&(Number(old.hours)>0||Number(old.overtimeHours)>0)){
  if(!db().monthlyConfirmed[month]){
   const ask=typeof window.confirm==='function'&&window.confirm(`Im Lohnmonat ${month} sind bereits ${old.hours||0} Normal- und ${old.overtimeHours||0} Überstunden manuell erfasst. Die Stempeluhr würde diese beiden Felder durch eigene Positionen ersetzen. Andere Lohnarten bleiben unverändert. Fortfahren?`);
   if(!ask)throw Error('Lohnübernahme abgebrochen, bestehender Lohnmonat unverändert.');
   db().monthlyConfirmed[month]=true;
  }
 }
 if(db().rates.autoPremiums&&old&&!db().monthlyConfirmed[month+':premiums']){
  const overlap=(old.items||[]).some(x=>!x.wm195Auto&&x.kind==='premium'&&/spät|spaet|nacht|sonntag|feiertag|zuschlag/i.test(String(x.name||'')));
  if(overlap){if(!confirm(`Im Lohnmonat ${month} sind bereits manuelle Zuschläge vorhanden. Automatische Zuschläge können zusätzlich berechnet werden. Fortfahren?`))throw Error('Automatische Zuschläge abgebrochen.');db().monthlyConfirmed[month+':premiums']=true;}
 }
 const m={...(old||{}),month};
 // With premium-only sync, retain manually entered hours and existing automatic base wages.
 const other=(m.items||[]).filter(x=>!x.wm195Auto||(!transferBase&&x.kind!=='premium'));
 if(transferBase){m.hours=0;m.overtimeHours=0;}
 const salaryMode=old?.profileSnapshot?.salaryMode||pay.profile.salaryMode||'hourly';
 // Bei Festgehalt ist die reguläre Arbeitszeit bereits im Monatsgehalt enthalten.
 // Nur tatsächlich zusätzliche Überstunden und Zuschläge übertragen.
 const generated=(transferBase?(salaryMode==='fixed'?s.items.filter(x=>!x.name.startsWith('Stempeluhr Regulär')):s.items):s.items.filter(x=>x.kind==='premium'));
 m.items=[...other,...generated];
 // Historische Zuschläge und Stundenlöhne stehen in selbstständigen Positionen;
 // globale Gehaltseinstellungen und bezahlte Fehlzeiten werden nicht verändert.
 const profile={...pay.profile,...(m.profileSnapshot||{})};if(!m.profileSnapshot)profile.hourlyRate=Number(pay.profile.hourlyRate)||Number(state.wm20?.hourlyGrossRate)||0;
 m.profileSnapshot=profile;m.wmClockSync=true;m.wm195Sync=true;m.wm195UpdatedAt=new Date().toISOString();m.wm195SourceGross=s.gross;
 if(options.target){Object.assign(options.target,m);return true;}
 pay.months[month]=m;return true;
}
function prepareSavedPayroll(month,target){if(state.wm20?.autoPayroll||db().rates.autoPremiums)syncPayrollMonth(month,{target});return target;}
function log(action,recordId,from,to){const a=db().audit;a.push({id:uuid(),at:new Date().toISOString(),action,recordId:String(recordId),from:from?deep(from):null,to:to?deep(to):null});if(a.length>200)a.splice(0,a.length-200);}
// Die bestehenden Zeitfunktionen rufen dieses Objekt nach einer abgeschlossenen Stempelung auf.
function sessionPremium(record){
 if(!record||!Number.isFinite(Number(record.minutes))||Number(record.minutes)<=0)return {total:0,items:[],enabled:db().rates.autoPremiums};
 const pct=db().rates,units=premiumUnits(record,pct),rate=recordRate(record);let total=0;
 const items=[];for(const kind of ['late','night','nightHigh','sunday','holiday']){
  const minutes=Number(units[kind])||0,percentage=Number(pct[kind])||0;
  if(!minutes||!percentage)continue;
  const amount=round(minutes/60*rate*percentage/100);total+=amount;
  items.push({kind,minutes,percentage,amount});
 }
 // The per-day threshold also applies to individual live/closed sessions.
 // Older completed sessions on the same day count toward the threshold first.
 const day=recDay(record),start=new Date(record.startAt).getTime();
 const prior=rows().filter(r=>r.id!==record.id&&recDay(r)===day&&new Date(r.startAt).getTime()<=start);
 const workedBefore=prior.reduce((v,r)=>v+Math.max(0,Number(r.minutes)||0),0);
 const targets=[record,...prior].map(r=>r.targetMinutes).filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>=0).map(Number);
 const dayGoal=targets.length?Math.max(...targets):Number(state.wm20?.targetMinutes??450);
 const threshold=paidOvertimeThreshold({goal:dayGoal},pct);
 const paidMinutes=Math.max(0,workedBefore+Number(record.minutes)-threshold)-Math.max(0,workedBefore-threshold);
 if(paidMinutes>0&&Number(pct.overtime)>0){const percentage=Number(pct.overtime),amount=round(paidMinutes/60*rate*percentage/100);
  total+=amount;items.push({kind:'overtime',minutes:paidMinutes,percentage,amount});
 }
 return {total:round(total),items,enabled:!!pct.autoPremiums,approx:units.approx,paidOvertimeMinutes:paidMinutes};
}
window.WM195={syncPayrollMonth,prepareSavedPayroll,splitPay,sessionPremium,log,premiumUnits,dayGroups};
function anomalies(){const res=[],s=db().rates,entries=[...rows()].sort((a,b)=>a.startAt.localeCompare(b.startAt));
 if(state.wm20?.active){const a=state.wm20.active,duration=(Date.now()-new Date(a.startAt).getTime())/3600000;
 if(duration>(Number(s.warningLongHours)||12))res.push(`Die laufende Stempeluhr ist seit ${round(duration)} Stunden aktiv – Stopp vergessen?`);
 }
 for(let i=0;i<entries.length;i++){
  const r=entries[i],span=(new Date(r.endAt)-new Date(r.startAt))/60000,worked=Number(r.minutes)||0,rest=Number(r.pauseMinutes)||0;
  if(!Number.isFinite(span)||span<=0||span>1440||worked<=0)res.push(`Stempelzeit ${recDay(r)} hat ungültige Zeitwerte.`);
  if(span>Number(s.warningLongHours)*60)res.push(`${recDay(r)}: ungewöhnlich lange Anwesenheit (${HM(span)}).`);
  if(span>9*60&&rest<Number(s.minimumBreak9))res.push(`${recDay(r)}: Pause ${rest} Min., Prüfgrenze ${s.minimumBreak9} Min.`);
  else if(span>6*60&&rest<Number(s.minimumBreak6))res.push(`${recDay(r)}: Pause ${rest} Min., Prüfgrenze ${s.minimumBreak6} Min.`);
  if(i&&new Date(r.startAt)<new Date(entries[i-1].endAt))res.push(`${recDay(r)}: Stempelzeiten überschneiden sich.`);
 }
 return [...new Set(res)].slice(0,30);
}
function account(month){const matching=dayGroups(rows().filter(r=>recDay(r).startsWith(month)));let is=0,goal=0;for(const d of matching){is+=d.total;goal+=d.goal;}
 const settings=db().time,adjustments=settings.adjustments.filter(r=>r.date?.startsWith(month));
 const paid=adjustments.filter(x=>x.kind==='payout').reduce((s,x)=>s+x.minutes,0);
 const leave=adjustments.filter(x=>x.kind==='leave').reduce((s,x)=>s+x.minutes,0);
 const correction=adjustments.filter(x=>x.kind==='correction').reduce((s,x)=>s+x.minutes,0);
 const diff=is-goal,net=diff-paid-leave+correction;
 return {is,goal,diff,paid,leave,correction,net,days:matching.length};
}
function entireAccount(){const groups=dayGroups();const s=db().time;const diff=groups.reduce((n,d)=>n+d.total-d.goal,0),paid=s.adjustments.filter(x=>x.kind==='payout').reduce((n,x)=>n+x.minutes,0),leave=s.adjustments.filter(x=>x.kind==='leave').reduce((n,x)=>n+x.minutes,0),correction=s.adjustments.filter(x=>x.kind==='correction').reduce((n,x)=>n+x.minutes,0);return s.openingMinutes+diff-paid-leave+correction;}
function metrics(month){const s=splitPay(month),a=account(month);return {s,a};}
const TXT=`<div class="wm195-line"><span>Erfasste Istzeit</span><strong data-wm195-val="is"></strong></div><div class="wm195-line"><span>Soll für erfasste Tage</span><strong data-wm195-val="goal"></strong></div><div class="wm195-line"><span>Saldo vor Ausgleich</span><strong data-wm195-val="diff"></strong></div><div class="wm195-line"><span>Überstunden mit Vergütung</span><strong data-wm195-val="paidOvertime"></strong></div><div class="wm195-line"><span>Auszahlung / Freizeitausgleich</span><strong data-wm195-val="spent"></strong></div><div class="wm195-line"><span>Monatssaldo</span><strong data-wm195-val="net"></strong></div><div class="wm195-line"><span>Brutto-Grundlohn</span><strong data-wm195-val="gross"></strong></div>`;
const field=(label,id,val,type='number',step='1')=>`<label class="wm195-field">${E(label)}<input type="${type}" id="${id}" value="${E(val)}" ${type==='number'?`step="${step}"`:''}></label>`;
const check=(label,id,v)=>`<label class="wm195-checkbox"><input type="checkbox" id="${id}" ${v?'checked':''}> ${E(label)}</label>`;
const btn=(label,id)=>`<button type="button" id="${id}" class="wm195-btn">${E(label)}</button>`;
const section=(head,inner)=>`<details class="wm195-pane"><summary>${E(head)}</summary><div class="wm195-pad">${inner}</div></details>`;
function mount(){if($('wm195Root'))return;const dash=$('dashboard'),shift=$('shift'),pay=$('payroll'),backup=$('backup');if(!dash||!shift||!pay||!backup)return;
 const css=document.createElement('style');css.id='wm195CSS';css.textContent=`
 .wm195{margin:15px 0;padding:16px;background:var(--card,#fff);border:1px solid var(--line,#dfe7ef);border-radius:16px;color:var(--ink,#082f4c)}.wm195 h3{margin:0 0 8px}.wm195 h4{margin:10px 0}.wm195 p,.wm195 small{line-height:1.45}.wm195-muted{color:#5d7388;font-size:12px}.wm195-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}.wm195-flex{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.wm195-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wm195-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.wm195-stat{background:#eef5f8;padding:10px;border-radius:10px}.wm195-stat strong{display:block;font-size:21px;font-variant-numeric:tabular-nums}.wm195-stat small{font-size:11px;color:#60778a}.wm195-line{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #e3e8ee;padding:8px 0;font-size:13px}.wm195-line strong{font-variant-numeric:tabular-nums}.wm195-pane{border-top:1px solid #dfe7ef;margin-top:10px}.wm195-pane summary{padding:14px 0;font-weight:750;cursor:pointer}.wm195-pad{padding:4px 0 12px}.wm195-field{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;min-width:0}.wm195-field input,.wm195-field select,.wm195-field textarea,.wm195-select{width:100%;max-width:100%;box-sizing:border-box;padding:11px;border:1px solid #baccdb;border-radius:9px;color:#12364c;background:white;font-size:16px}.wm195-btn{padding:10px 13px;background:#087d79;color:white;border:0;border-radius:9px;cursor:pointer;font-size:13px;font-weight:700}.wm195-btn:disabled{opacity:.45}.wm195-msg{padding:10px;background:#eef6fa;border-radius:9px;font-size:12px;min-height:18px;white-space:pre-wrap}.wm195-checkbox{display:flex;gap:9px;align-items:center;font-size:13px}.wm195-checkbox input{width:21px;height:21px}.wm195-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:10px}.wm195-day{min-height:56px;background:#f0f4f6;border:1px solid #dfe7ef;border-radius:8px;color:#1e3449;padding:5px;font-size:12px;text-align:left;cursor:pointer}.wm195-day span{display:block;font-size:10px;overflow:hidden}.wm195-work{background:#d6f6e5;border-color:#88c99c}.wm195-au{background:#ffe3e5;border-color:#ea8b97}.wm195-vac{background:#e0ebff;border-color:#8eb2e7}.wm195-holiday{background:#fff0cf;border-color:#dabd78}.wm195-free{background:#f0f4f8}.wm195-legend{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0;font-size:11px;color:#5e7083}.wm195-pill{padding:6px 9px;border-radius:15px;background:#e9f0f7}.wm195-warning{color:#92400e}.wm195-warningline{border-left:3px solid #e6a23c;margin:7px 0;padding:8px 10px;background:#fff8e9;font-size:12px}.wm195-compare{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:12px}.wm195-compare>div{padding:8px;border-bottom:1px solid #dde8f0;overflow-wrap:anywhere}.wm195-diff{font-weight:800;color:#a63c2b}.wm195-safe{color:#177048}.wm195-status{font-size:12px}.wm195-sticky{position:relative}.wm195-subtitle{font-size:12px;color:#60778a}@media(max-width:520px){.wm195-grid{grid-template-columns:1fr}.wm195-day{min-height:49px;padding:4px;font-size:11px}.wm195-stat strong{font-size:17px}.wm195-calendar{gap:3px}}
 `;document.head.appendChild(css);
 const dashCard=document.createElement('section');dashCard.id='wm195Dashboard';dashCard.className='wm195';dashCard.innerHTML=`<div class="wm195-top"><div><h3>Arbeitsmonat und Brutto</h3><small class="wm195-muted">Stempeluhr · Arbeitszeitkonto · Lohnvorschau</small></div>${field('Monat','wm195HomeMonth',currentMonth(),'month')}</div><div id="wm195HomeStats" class="wm195-stats" style="margin-top:12px"></div><p id="wm195HomeHint" class="wm195-muted"></p>`;
 const clockHome=$('wmClockHome');if(clockHome)clockHome.insertAdjacentElement('afterend',dashCard);else dash.insertAdjacentElement('afterbegin',dashCard);
 const settings=db().rates;
 const clockPanel=document.createElement('section');clockPanel.id='wm195Root';clockPanel.className='wm195';clockPanel.innerHTML=`<h3>Arbeitszeit-Analyse 2.0.0</h3><div class="wm195-top">${field('Auswertungsmonat','wm195Month',currentMonth(),'month')}<span class="wm195-pill" id="wm195ClockSyncStatus"></span></div><div id="wm195Hours" style="margin-top:12px">${TXT}</div><p class="wm195-muted">Industriestunden = Minuten ÷ 60. Sollzeit und Saldo beziehen sich auf erfasste Tage, nicht auf zukünftige oder fehlende Arbeitstage.</p>
 ${section('Schichtzuschläge und Einstellungen',`<div class="wm195-grid">${field('Spätschichtzuschlag (%)','wm195Late',settings.late,'number','0.5')}${field('Spätschicht ab','wm195LateStart',settings.lateStart,'time')}${field('Spätschicht bis','wm195LateEnd',settings.lateEnd,'time')}${field('Nachtzuschlag Grundstufe (%)','wm195Night',settings.night,'number','0.5')}${field('Nachtzuschlag höhere Stufe (%)','wm195NightHigh',settings.nightHigh,'number','0.5')}${field('Höhere Nachtstufe ab','wm195NightHighStart',settings.nightHighStart,'time')}${field('Höhere Nachtstufe bis','wm195NightHighEnd',settings.nightHighEnd,'time')}${field('Nachtschicht-Pause ab','wm195NightPauseStart',settings.nightPauseStart,'time')}${field('Nachtschicht-Pause (Minuten)','wm195NightPauseMinutes',settings.nightPauseMinutes,'number','1')}${field('Sonntagszuschlag (%)','wm195Sun',settings.sunday,'number','0.5')}${field('Feiertagszuschlag (%)','wm195Holiday',settings.holiday,'number','0.5')}${field('Überstundenzuschlag (%)','wm195Over',settings.overtime,'number','0.5')}<label class="wm195-field">Überstundenvergütung ab (geleistete Stunden/Tag)<input id="wm195OvertimePayAfter" type="text" inputmode="decimal" placeholder="z. B. 08:00" value="${E(settings.overtimePayAfterMinutes==null?'':HM(settings.overtimePayAfterMinutes))}" maxlength="6"></label>${field('Nachtbeginn','wm195NightStart',settings.nightStart,'time')}${field('Nachtende','wm195NightEnd',settings.nightEnd,'time')}</div><div class="wm195-flex" style="margin:10px 0">${check('Spätschicht erkennen','wm195EnableLate',settings.enableLate)}${check('Nachtstunden erkennen','wm195EnableNight',settings.enableNight)}${check('Höhere Nachtstufe aktiv','wm195EnableNightHigh',settings.enableNightHigh)}${check('Sonntag erkennen','wm195EnableSun',settings.enableSunday)}${check('NRW-Feiertage erkennen','wm195EnableHol',settings.enableHoliday)}${check('Zuschläge automatisch in die Lohnberechnung übernehmen','wm195AutoPrem',settings.autoPremiums)}</div>${btn('Einstellungen speichern','wm195SaveRates')}<p class="wm195-muted">Überstundenvergütung: z. B. 08:00 = Zuschlag für Arbeitszeit nach 8 Stunden am selben Arbeitstag. Leer lassen = wie bisher ab individueller Tages-Sollzeit. Die Grenze verändert NICHT das Zeitkonto und ist keine gesetzliche Vergütungsregel. Bei Stundenlohn wird der Grundlohn für alle gearbeiteten Stunden nur einmal berechnet; bei Festgehalt sind zusätzliche Überstunden ab dieser Grenze extra. Änderungen gelten automatisch für den laufenden Monat bei eingeschaltetem Lohnabgleich; ältere Abrechnungen bleiben gespeichert. Nachtzuschläge: Grundstufe 25 % von 22:00 bis 06:00 Uhr; höhere Stufe 35 % von 00:00 bis 04:00 Uhr hat Vorrang. Die Standard-Nachtschichtpause 02:30 bis 03:00 Uhr wird NUR bei bereits erfassten unbezahlten Pausenminuten der höheren Stufe zugeordnet, nicht zusätzlich abgezogen. Ohne tatsächliche Pausenzeit kann die Aufteilung geschätzt sein. Spät/Nacht: alle Zeiten und Prozente bleiben änderbar. Bei zeitlicher Überschneidung hat Nacht Vorrang. Ohne exakte Pausenzeiten werden Pausen anteilig verteilt. Für automatische Übernahme der Zuschläge die Checkbox aktivieren; Stunden können unabhängig davon manuell bleiben. Steuer-/SV-Pflicht wird vorsichtig voreingestellt. Ob ein Zuschlag tatsächlich steuerfrei ist, hängt vom Arbeitsvertrag und gesetzlichen Voraussetzungen ab. Pausenzeiten bleiben geschätzt.</p><div id="wm195PremiumPreview" class="wm195-muted"></div>`)}
 ${section('Überstundenkonto und Ausgleich',`<div class="wm195-grid">${field('Anfangssaldo in Minuten (+/−)','wm195Opening',db().time.openingMinutes)}${field('Datum','wm195AdjustmentDate',nowDate(),'date')}</div><div class="wm195-grid"><label class="wm195-field">Art<select id="wm195AdjustKind"><option value="payout">Überstunden ausgezahlt</option><option value="leave">Freizeitausgleich</option><option value="correction">Manuelle Korrektur (+/−)</option></select></label>${field('Minuten (+/− bei Korrektur)','wm195AdjustMinutes',60)}</div>${field('Notiz','wm195AdjustNote','','text')}${btn('Anfangssaldo speichern','wm195SaveOpening')} ${btn('Ausgleich buchen','wm195AddAdjustment')}<div id="wm195AdjustList"></div><small class="wm195-muted">Auszahlung/Freizeitausgleich verändert nur das Zeitkonto, nicht automatisch das Bruttogehalt. Auszahlungsbetrag gegebenenfalls in der Lohnabrechnung erfassen.</small>`)}
 ${section('Stempelfehler und Änderungsverlauf',`<div class="wm195-grid">${field('Pausenprüfung ab 6 Std. (Min.)','wm195Break6',settings.minimumBreak6)}${field('Pausenprüfung ab 9 Std. (Min.)','wm195Break9',settings.minimumBreak9)}${field('Lange Schicht ab (Std.)','wm195Long',settings.warningLongHours)}</div>${btn('Prüfwerte speichern','wm195SaveWarnings')}<div id="wm195Warnings"></div><h4>Letzte Korrekturen</h4><div id="wm195Audit"></div>`)}
 ${section('Kalender',`<div class="wm195-top">${field('Monat','wm195CalendarMonth',currentMonth(),'month')}</div><div class="wm195-legend"><span>Grün: Arbeit</span><span>Rot: AU</span><span>Blau: Urlaub</span><span>Gelb: Feiertag</span></div><div id="wm195Calendar" class="wm195-calendar"></div><div class="wm195-msg" id="wm195DayDetails">Tag auswählen.</div>`)}
 <p id="wm195Error" class="wm195-msg"></p>`;
 const clockRoot=$('wmClockRoot');if(clockRoot)clockRoot.insertAdjacentElement('afterend',clockPanel);else shift.insertAdjacentElement('beforeend',clockPanel);
 const payCard=document.createElement('section');payCard.className='wm195';payCard.id='wm195Payslip';payCard.innerHTML=`<h3>Lohnabrechnung vergleichen</h3><p class="wm195-muted">Die geschätzte Abrechnung steht links. Tatsächliche Werte kannst du aus der Abrechnung manuell eintragen – sie bleiben im aktuellen Profil verschlüsselt.</p><div class="wm195-grid">${field('Monat','wm195PayMonth',currentMonth(),'month')}${field('Tatsächliches Brutto (€)','wm195PayslipGross','', 'number','0.01')}${field('Tatsächliches Netto (€)','wm195PayslipNet','', 'number','0.01')}${field('Tatsächliche Arbeitsstunden','wm195PayslipHours','', 'number','0.01')}${field('Tatsächliche Zuschläge (€)','wm195PayslipPremiums','', 'number','0.01')}${field('Tatsächliche SV-Abzüge (€)','wm195PayslipSocial','', 'number','0.01')}${field('Tatsächliche Steuern (€)','wm195PayslipTax','', 'number','0.01')}</div>${field('Notiz / Abweichungsgrund','wm195PayslipNote','','text')}<div class="wm195-flex" style="margin-top:10px">${btn('Ist-Abrechnung speichern','wm195SaveActual')}${btn('Stempeluhr neu abgleichen','wm195SyncNow')}</div><div id="wm195PayrollPreview" class="wm195-msg"></div><div id="wm195PayslipCompare"></div>`;
 pay.appendChild(payCard);
 const backupCard=document.createElement('section');backupCard.className='wm195';backupCard.id='wm195Backup';backupCard.innerHTML=`<h3>Profil-Backup und Wiederherstellung</h3><p class="wm195-muted">Exportiert ausschließlich das gerade entsperrte Profil samt verschlüsselten Dateien. Jede Sicherung braucht das dazugehörige Passwort. Nicht automatisch an einen Server übertragen.</p><p id="wm195BackupState" class="wm195-msg"></p><div class="wm195-flex">${btn('Profil-Backup erstellen','wm195Export')}${btn('Profil-Backup prüfen','wm195CheckBackup')}</div><label class="wm195-field" style="margin-top:10px">Vorhandenes Backup zur Prüfung auswählen<input type="file" id="wm195BackupFile" accept=".json,application/json"></label><p id="wm195BackupResult" class="wm195-muted"></p><small class="wm195-muted">Wiederherstellen: bestehende Funktion „Backup importieren“ unter Sicherheit & Backup. Sie überschreibt nach Prüfung das aktuell gewählte Profil. Vorher zusätzlich eine Sicherheitskopie erstellen.</small>`;
 const danger=backup.querySelector('.danger-zone');if(danger)danger.insertAdjacentElement('beforebegin',backupCard);else backup.appendChild(backupCard);
 wire();refresh();
}
function uiMessage(message){const el=$('wm195Error');if(el)el.textContent=message;}
async function commit(change,label){if(!accessible())return;const original=deep(db()),oldPay=state.wmPayroll===undefined?undefined:deep(state.wmPayroll);try{change();await save(label);refresh();}catch(e){state.wm195=original;if(oldPay===undefined)delete state.wmPayroll;else state.wmPayroll=oldPay;refresh();throw e;}}
const guard=f=>async()=>{try{await f();}catch(e){console.error('WorksManager 2.0.0:',e);uiMessage('Fehler: '+(e.message||e));alert(e.message||String(e));}};
function wire(){
 for(const id of ['wm195HomeMonth','wm195Month','wm195PayMonth','wm195CalendarMonth'])$(id)?.addEventListener('change',()=>{if(id==='wm195Month')db().reportMonth=$(id).value;if(id==='wm195CalendarMonth')db().calendarMonth=$(id).value;refresh();});
 $('wm195SaveRates')?.addEventListener('click',guard(async()=>{
  const values={late:'wm195Late',night:'wm195Night',nightHigh:'wm195NightHigh',sunday:'wm195Sun',holiday:'wm195Holiday',overtime:'wm195Over'};const next={...db().rates};
  next.overtimePayAfterMinutes=parsePayThreshold($('wm195OvertimePayAfter').value);
  for(const [k,id] of Object.entries(values)){const v=Number($(id).value);if(!Number.isFinite(v)||v<0||v>500)throw Error('Zuschläge müssen zwischen 0 und 500 % liegen.');next[k]=v;}
  for(const [prefix,startId,endId] of [['late','wm195LateStart','wm195LateEnd'],['night','wm195NightStart','wm195NightEnd'],['nightHigh','wm195NightHighStart','wm195NightHighEnd']]){
   const from=$(startId).value,to=$(endId).value;
   const valid=v=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
   if(!valid(from)||!valid(to)||from===to)throw Error('Ungültige Uhrzeiten für '+(prefix==='late'?'Spätschicht':'Nachtschicht')+'.');
   next[prefix+'Start']=from;next[prefix+'End']=to;
  }
  next.nightPauseStart=$('wm195NightPauseStart').value;next.nightPauseMinutes=Number($('wm195NightPauseMinutes').value);
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next.nightPauseStart)||!Number.isInteger(next.nightPauseMinutes)||next.nightPauseMinutes<0||next.nightPauseMinutes>240)throw Error('Nachtschichtpause prüfen (Uhrzeit und 0–240 Minuten).');
  next.enableNightHigh=$('wm195EnableNightHigh').checked;
  next.enableLate=$('wm195EnableLate').checked;next.enableNight=$('wm195EnableNight').checked;next.enableSunday=$('wm195EnableSun').checked;next.enableHoliday=$('wm195EnableHol').checked;next.autoPremiums=$('wm195AutoPrem').checked;
  await commit(()=>{db().rates=next;syncMonthsIfEnabled();},'Zuschläge gespeichert');uiMessage('Zuschlagsregeln gespeichert. Aktive automatische Lohnübernahme neu berechnet.');
 }));
 $('wm195SaveWarnings')?.addEventListener('click',guard(async()=>{const n6=Number($('wm195Break6').value),n9=Number($('wm195Break9').value),long=Number($('wm195Long').value);if(!Number.isInteger(n6)||!Number.isInteger(n9)||n6<0||n6>120||n9<0||n9>120||!Number.isFinite(long)||long<1||long>24)throw Error('Prüfwerte kontrollieren.');await commit(()=>{Object.assign(db().rates,{minimumBreak6:n6,minimumBreak9:n9,warningLongHours:long});},'Stempelprüfwerte gespeichert');}));
 $('wm195SaveOpening')?.addEventListener('click',guard(async()=>{const mins=Number($('wm195Opening').value);if(!Number.isInteger(mins)||Math.abs(mins)>1e6)throw Error('Anfangssaldo muss in ganzen Minuten angegeben werden.');await commit(()=>{db().time.openingMinutes=mins;},'Anfangssaldo gespeichert');}));
 $('wm195AddAdjustment')?.addEventListener('click',guard(async()=>{const kind=$('wm195AdjustKind').value,minutes=Number($('wm195AdjustMinutes').value),date=$('wm195AdjustmentDate').value,note=$('wm195AdjustNote').value.trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(minutes)||Math.abs(minutes)>100000||(!['payout','leave','correction'].includes(kind))||(kind!=='correction'&&minutes<=0))throw Error('Buchung prüfen. Auszahlungen/Freizeit brauchen positive Minuten.');await commit(()=>{db().time.adjustments.push({id:uuid(),date,kind,minutes,note});},'Überstunden-Ausgleich gespeichert');$('wm195AdjustNote').value='';}));
 $('wm195AdjustList')?.addEventListener('click',e=>{const id=e.target.closest('[data-wm195-del]')?.dataset.wm195Del;if(!id)return;guard(async()=>{if(!confirm('Zeitkonto-Buchung löschen?'))return;await commit(()=>{db().time.adjustments=db().time.adjustments.filter(x=>x.id!==id);},'Zeitkonto-Buchung gelöscht');})();});
 $('wm195Calendar')?.addEventListener('click',e=>{const day=e.target.closest('[data-wm195-day]')?.dataset.wm195Day;if(day)showDay(day);});
 $('wm195SaveActual')?.addEventListener('click',guard(async()=>{const month=$('wm195PayMonth').value;if(!/^\d{4}-\d{2}$/.test(month))throw Error('Monat fehlt.');const a={};for(const [k,id] of Object.entries({gross:'wm195PayslipGross',net:'wm195PayslipNet',hours:'wm195PayslipHours',premiums:'wm195PayslipPremiums',social:'wm195PayslipSocial',tax:'wm195PayslipTax'})){const v=$(id).value.trim().replace(',','.');if(v!==''&&(!Number.isFinite(Number(v))||Number(v)<0))throw Error('Ungültiger Ist-Betrag '+k);a[k]=v===''?'':Number(v);}a.note=$('wm195PayslipNote').value.trim();a.updatedAt=new Date().toISOString();await commit(()=>{db().actuals[month]=a;},'Ist-Lohnabrechnung gespeichert');}));
 $('wm195SyncNow')?.addEventListener('click',guard(async()=>{const month=$('wm195PayMonth').value;if(!confirm('Stempeluhrdaten für '+month+' erneut auf den Lohnmonat übertragen? Bestehende selbst erfasste Lohnarten bleiben unverändert.'))return;const old=deep(state.wmPayroll||{}),old195=deep(db());try{syncPayrollMonth(month,{force:true});await save('Stempeluhr-Lohnabgleich gespeichert');document.dispatchEvent(new CustomEvent('wm-clock-payroll-synced',{detail:{month}}));refresh();}catch(e){state.wmPayroll=old;state.wm195=old195;throw e}}));
 $('wm195Export')?.addEventListener('click',guard(async()=>{if(!accessible())throw Error('Profil entsperren.');const earlier=window.downloadBlob;let named=false;
 try{if(typeof earlier==='function')window.downloadBlob=function(blob,filename){const ident=String(window.WorksManagerProfiles?.current||'primary').replace(/[^A-Za-z0-9_-]/g,'').slice(0,22);named=true;return earlier(blob,String(filename).replace('WorksManager-Backup-',`WorksManager-${ident}-Backup-`));};await exportBackup();}
 finally{if(typeof earlier==='function')window.downloadBlob=earlier;}
 await commit(()=>{db().backupRequestedAt=new Date().toISOString()},'Backup-Zeitpunkt vermerkt');$('wm195BackupResult').textContent='Backup-Download ausgelöst. Prüfe anschließend die Datei in der Dateien-App; das Herunterladen selbst kann die App nicht bestätigen.';}));
 $('wm195CheckBackup')?.addEventListener('click',guard(async()=>{const file=$('wm195BackupFile')?.files?.[0];if(!file)throw Error('Zuerst eine Backup-JSON-Datei auswählen.');const pass=prompt('Backup-Passwort des zu prüfenden Profils eingeben (wird nicht gespeichert):');if(pass===null)return;if(!pass)throw Error('Kein Passwort eingegeben.');await checkBackup(file,pass);}));
}
function syncMonthsIfEnabled(){
 // Recalculate the CURRENT month automatically. Older months retain original rules
 // unless explicitly resynchronized by the user via the existing button.
 const month=currentMonth();
 if(state.wm20?.autoPayroll||db().rates.autoPremiums){
  if(rows().some(r=>recDay(r).startsWith(month)))syncPayrollMonth(month);
 }else{
  const old=state.wmPayroll?.months?.[month];
  if(old?.items)old.items=old.items.filter(x=>!(x.wm195Auto&&x.kind==='premium'));
 }
}
async function checkBackup(file,password){const status=$('wm195BackupResult');status.textContent='Verschlüsselte Sicherung wird kontrolliert …';
 const backup=JSON.parse(await file.text());if(backup.app!=='WorksManager'||!backup.payload?.iv||!backup.payload?.cipher||!backup.salt||!Array.isArray(backup.files))throw Error('Ungültige oder unvollständige Backup-JSON-Datei.');
 const key=await deriveKey(password,new Uint8Array(unb64(backup.salt)));let decoded;
 try{decoded=await decryptPayload(backup.payload,key);}catch{throw Error('Passwort falsch oder Backup beschädigt.');}
 const found=new Set();let count=0;
 for(const entry of backup.files){if(!entry?.key||!entry.iv||!entry.cipher||found.has(String(entry.key)))throw Error('Backup enthält unvollständige oder doppelte Dateieinträge.');found.add(String(entry.key));
  try{await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(unb64(entry.iv))},key,unb64(entry.cipher));}catch{throw Error('Verschlüsselte Datei beschädigt: '+String(entry.key));}
  count++;if(count%8===0){status.textContent=`${count} Datei(en) geprüft …`;await new Promise(done=>setTimeout(done,0));}
 }
 const needed=referencedFileKeys(decoded),missing=[...needed].filter(k=>!found.has(String(k)));if(missing.length)throw Error(`${missing.length} referenzierte Dateien fehlen im Backup.`);
 status.textContent=`Backup erfolgreich geprüft: verschlüsselter Profil-Datensatz und ${count} Datei(en) entschlüsselt. Keine Wiederherstellung ausgeführt. Diese Prüfung ersetzt keinen Test auf einem zweiten Gerät.`;
}
function updateVersionLabel(){for(const el of document.querySelectorAll('.version-badge,.app-version,.unlock-version-text')){if(el.classList.contains('version-badge')){el.textContent='v'+VERSION;el.setAttribute('aria-label','Version '+VERSION);}else el.textContent='Version '+VERSION;}
 const sr=document.querySelector('#unlock .sr-only');if(sr)sr.textContent='WorksManager v'+VERSION;
 document.title='WorksManager v'+VERSION;
 const title=$('wmplusQuickUpdateCheck')?.closest('#wmplusQuickUpdateBar')?.querySelector('strong');if(title)title.textContent='App-Updates · WorksManager '+VERSION;
}
function monthGrossSummary(month){
 const finished=rows().filter(r=>recDay(r).startsWith(month)),active=state.wm20?.active;
 const profile=state.wmPayroll?.months?.[month]?.profileSnapshot||state.wmPayroll?.profile||{};
 const currentProfile=state.wmPayroll?.profile||{},fixed=profile.salaryMode==='fixed',monthly=Number(profile.monthlySalary)||0;
 const globalRate=Number(state.wm20?.hourlyGrossRate)||Number(currentProfile.hourlyRate)||0;
 let unknown=0,estimate=false;
 let gross=finished.reduce((acc,r)=>{
  const own=Number(r.hourlyRate)||0;if(own>0)return acc+(Number(r.minutes)||0)*own/60;
  unknown++;if(globalRate>0){estimate=true;return acc+(Number(r.minutes)||0)*globalRate/60;}return acc;
 },0);
 if(active&&recDay(active).startsWith(month)){
  const at=active.pausedAt?new Date(active.pausedAt).getTime():Date.now();
  const ms=Math.max(0,at-new Date(active.startAt).getTime()-(Number(active.totalPausedMs)||0));
  let aRate=Number(active.hourlyRate)||0;if(aRate<=0)aRate=globalRate;
  if(aRate>0){gross+=ms/3600000*aRate;if(!(Number(active.hourlyRate)>0))estimate=true;}
  else unknown++;
 }
 if(fixed&&monthly>0)return {value:monthly,label:'Monatliches Festgehalt',detail:'Fixes Brutto laut Lohnprofil, ohne zusätzliche Zuschläge. Uhrzeit wird separat als rechnerischer Stundenwert angezeigt.'};
 if(unknown&&!(globalRate>0))return {value:null,label:'Stundenlohn fehlt',detail:unknown+' Stempelung(en) ohne gespeicherten Stundenlohn. In der Stempeluhr den Satz eingeben und alte Einträge nach Bestätigung korrigieren.'};
 return {value:Math.round((gross+Number.EPSILON)*100)/100,label:estimate?'Brutto-Hochrechnung (vorläufig)':'Brutto aus Stempelzeiten',detail:estimate?unknown+' Eintrag/Einträge mit fehlendem Stundenlohn: hier vorläufig der aktuell eingetragene Satz. Die gespeicherten Zeiten bleiben unverändert.':'Berechnet aus den gespeicherten Stundenlöhnen; ohne Zuschläge.'};
}
function refreshHomeGross(){
 if(!accessible())return;const box=$('wm195HomeGrossValue');if(!box)return;
 const month=$('wm195HomeMonth')?.value||currentMonth(),r=monthGrossSummary(month);
 box.textContent=r.value===null?'—':(r.value.toLocaleString('de-DE',{style:'currency',currency:'EUR'}));
 const label=$('wm195HomeGrossLabel');if(label)label.textContent=r.label;
 const details=$('wm195HomeGrossInfo');if(details)details.textContent=r.detail;
}
function report(){if(!accessible()||!$('wm195Root'))return;
 const home=$('wm195HomeMonth')?.value||currentMonth(),month=$('wm195Month')?.value||currentMonth(),pm=$('wm195PayMonth')?.value||currentMonth(),cMonth=$('wm195CalendarMonth')?.value||currentMonth();
 const hm=metrics(home),out=$('wm195HomeStats');if(out)out.innerHTML=[['Iststunden',HM(hm.a.is)+' Std.'],['Industriestunden',IND(hm.a.is)+' h'],['Überstunden-Saldo',HM(hm.a.diff)]].map(([l,v])=>`<div class="wm195-stat"><strong>${E(v)}</strong><small>${E(l)}</small></div>`).join('')+'<div class="wm195-stat"><strong id="wm195HomeGrossValue" style="font-variant-numeric:tabular-nums">—</strong><small id="wm195HomeGrossLabel">Brutto</small></div>';refreshHomeGross();
 if($('wm195HomeHint'))$('wm195HomeHint').textContent=`Erfasste Tage: ${hm.a.days} · Gesamtsaldo seit Beginn (mit Ausgleich): ${HM(entireAccount())} / ${IND(entireAccount())} Industrie-Stunden.`;
 const h=$('wm195HomeHint');if(h&&!$('wm195HomeGrossInfo'))h.insertAdjacentHTML('afterend','<p id="wm195HomeGrossInfo" class="wm195-muted"></p>');refreshHomeGross();
 const {a,s}=metrics(month),o=$('wm195Hours');if(o){const val={is:HM(a.is)+' / '+IND(a.is)+' h',goal:HM(a.goal),diff:HM(a.diff)+' / '+IND(a.diff)+' h',paidOvertime:HM(s.paidOvertime)+' / '+IND(s.paidOvertime)+' h',spent:HM(a.paid+a.leave),net:HM(a.net)+' / '+IND(a.net)+' h',gross:EUR(s.gross)};for(const el of o.querySelectorAll('[data-wm195-val]'))el.textContent=val[el.dataset.wm195Val]||'—';}
 if($('wm195ClockSyncStatus'))$('wm195ClockSyncStatus').textContent=state.wm20?.autoPayroll?'Lohnabgleich aktiviert':'Lohnabgleich aus';
 if($('wm195Opening')&&document.activeElement!==$('wm195Opening'))$('wm195Opening').value=db().time.openingMinutes;
 const adjusts=$('wm195AdjustList');if(adjusts)adjusts.innerHTML=db().time.adjustments.slice(-30).reverse().map(x=>`<div class="wm195-line"><span>${E(x.date)} · ${E({payout:'Auszahlung',leave:'Freizeitausgleich',correction:'Korrektur'}[x.kind]||x.kind)} · ${HM(x.minutes)} · ${E(x.note)}</span><button type="button" class="wm195-btn" data-wm195-del="${E(x.id)}">Löschen</button></div>`).join('');
 const msg=anomalies(),warnings=$('wm195Warnings');if(warnings)warnings.innerHTML=msg.length?msg.map(x=>`<div class="wm195-warningline">${E(x)}</div>`).join(''):'<p class="wm195-safe">Keine auffälligen Stempelzeiten nach den eingestellten Prüfregeln.</p>';
 const audit=$('wm195Audit');if(audit)audit.innerHTML=db().audit.slice(-12).reverse().map(x=>`<div class="wm195-line"><span>${E(x.at.slice(0,16).replace('T',' '))} · ${E(x.action)} · ${E(x.recordId)}</span></div>`).join('')||'<p class="wm195-muted">Noch keine Änderungen protokolliert.</p>';
 const prev=$('wm195PremiumPreview');if(prev){
  const s=splitPay(month,{previewPremiums:true});const items=s.items.filter(x=>x.wm195Auto&&x.kind==='premium');
  prev.textContent=`Vorschau ${month}: `+(items.length?items.map(x=>`${x.name.replace(/ \(.*$/,'')}: ${x.hours.toLocaleString('de-DE')} Std. / ${EUR(x.hours*x.rate*x.pct/100)}`).join(' · '):'keine zuschlagspflichtigen Zeiten') + (db().rates.autoPremiums?' · Übernahme aktiv':' · Übernahme deaktiviert');
 }
 showCalendar(cMonth);drawPayslip(pm);const last=db().backupRequestedAt,t=$('wm195BackupState');if(t){const days=last?Math.floor((Date.now()-new Date(last).getTime())/86400000):null;t.textContent=days===null?'Für dieses Profil wurde noch kein Backup-Export dokumentiert. Bitte regelmäßig ein externes Backup erstellen.':days>30?`Letzter Backup-Export vor ${days} Tagen – neue Sicherung empfohlen.`:`Letzter Backup-Export vor ${days} Tagen. Bitte die tatsächlich heruntergeladene Datei zusätzlich prüfen.`;}
}
function calendarDayStatus(day){const s=state,a=rows().filter(r=>recDay(r)===day),out=[];let color='wm195-free';
 if(a.length){out.push(`${a.length} Stempelung(en): ${HM(a.reduce((n,r)=>n+Number(r.minutes||0),0))}`);color='wm195-work';}
 for(const x of s.shifts||[])if(x.date===day)out.push(`Schicht ${x.shift||''} ${x.start||''}`);
 const own=s.wmCalendar?.days?.[day];if(own){if(own.shift)out.push(({early:'Frühschicht',late:'Spätschicht',night:'Nachtschicht'}[own.shift]||own.shift));if(own.shortEnabled)out.push('Kurzarbeit '+own.shortLoss+' %');if(own.note)out.push('Notiz: '+own.note.slice(0,80));}
 for(const x of s.vacations||[])if(x.from<=day&&x.to>=day){out.push('Urlaub');color='wm195-vac';}
 for(const x of s.aus||[])if(x.from<=day&&x.to>=day){out.push('Krankmeldung');color='wm195-au';}
 const holidays=holidayDates(Number(day.slice(0,4)));if(holidays.has(day)){out.push('NRW-Feiertag');if(color==='wm195-free')color='wm195-holiday';}
 return {color,out};}
function showCalendar(month){const el=$('wm195Calendar');if(!el||!/^(?:19|20)\d\d-(0[1-9]|1[0-2])$/.test(month))return;const [y,m]=month.split('-').map(Number),first=new Date(y,m-1,1).getDay(),offset=(first+6)%7,last=new Date(y,m,0).getDate();let html='';for(const w of ['Mo','Di','Mi','Do','Fr','Sa','So'])html+=`<div class="wm195-muted" style="text-align:center">${w}</div>`;for(let n=0;n<offset;n++)html+='<div></div>';
 for(let d=1;d<=last;d++){const day=`${month}-${String(d).padStart(2,'0')}`,info=calendarDayStatus(day);html+=`<button type="button" class="wm195-day ${info.color}" data-wm195-day="${day}" aria-label="${day}"><strong>${d}</strong><span>${info.out.length?E(info.out[0]):'—'}</span></button>`;}
 el.innerHTML=html;
}
function showDay(day){const x=calendarDayStatus(day),d=dayGroups(rows().filter(r=>recDay(r)===day))[0],rate=rows().filter(r=>recDay(r)===day).reduce((n,r)=>n+Number(r.minutes||0)*recordRate(r)/60,0);
 const info=$('wm195DayDetails');if(info)info.textContent=`${day}: ${d?'Ist '+HM(d.total)+', Soll '+HM(d.goal)+', Saldo '+HM(d.total-d.goal)+', Grundbrutto '+EUR(rate)+'. ':'Keine Stempelzeit. '}${x.out.join(' · ')||'Kein Eintrag.'}`;
}
function drawPayslip(month){const data=db().actuals[month],el=$('wm195PayslipCompare');if(!el)return;
 let r=null;try{if(typeof window.WM195PayrollCalc==='function')r=window.WM195PayrollCalc(month);}catch(e){console.warn('Payroll-Simulation',e);}
 const m=state.wmPayroll?.months?.[month],hours=Number(m?.hours||0)+Number(m?.overtimeHours||0)+(m?.items||[]).filter(x=>x.wm195Auto&&x.kind==='wage').reduce((sum,x)=>sum+Number(x.hours||0),0);
 const autoPremiums=(m?.items||[]).filter(x=>x.wm195Auto&&x.kind==='premium').reduce((s,x)=>s+Number(x.hours||0)*Number(x.rate||0)*Number(x.pct||0)/100,0);
 const estimates={gross:r?.gross,net:r?.netEmployer,hours:round(hours),premiums:round(autoPremiums),social:r?.sv?.total,tax:r?round(r.lst+r.soli+r.church):undefined};
 let html='<div class="wm195-compare"><div><strong>Position</strong></div><div><strong>Berechnet</strong></div><div><strong>Ist / Differenz</strong></div>';
 for(const [k,title] of Object.entries({gross:'Brutto (€)',net:'Netto (€)',hours:'Stunden',premiums:'Automatische Zuschläge (€)',social:'SV-Abzüge (€)',tax:'Steuern (€)'})){const est=estimates[k],act=data?.[k],known=typeof est==='number'&&Number.isFinite(est),actual=typeof act==='number'&&Number.isFinite(act),delta=actual&&known?round(act-est):null;
 html+=`<div>${E(title)}</div><div>${known?(k==='hours'?E(est):EUR(est)):'—'}</div><div>${actual?(k==='hours'?E(act):EUR(act)):'—'}${delta!==null?`<span class="${Math.abs(delta)>0.02?'wm195-diff':'wm195-safe'}"> (${delta>0?'+':''}${k==='hours'?E(delta):EUR(delta)})</span>`:''}</div>`;}
 el.innerHTML=html+'</div><p class="wm195-muted">Vergleich der gespeicherten Monatsdaten. Lohnsteuer, Steuerfreiheit von Zuschlägen und Ersatzleistungen bleiben Modellwerte.</p>';
 const inputMonth=$('wm195PayMonth'),inputFocused=document.activeElement;
 if(inputMonth&&inputMonth.dataset.loaded!==month){inputMonth.dataset.loaded=month;for(const [key,id] of Object.entries({gross:'wm195PayslipGross',net:'wm195PayslipNet',hours:'wm195PayslipHours',premiums:'wm195PayslipPremiums',social:'wm195PayslipSocial',tax:'wm195PayslipTax'}))$(id).value=data?.[key]??'';$('wm195PayslipNote').value=data?.note||'';}
 const prev=$('wm195PayrollPreview');if(prev){const s=splitPay(month),estimate=splitPay(month,{previewPremiums:true});
  const premium=estimate.items.filter(x=>x.wm195Auto&&x.kind==='premium'&&/Spätschicht|Nachtschicht/.test(x.name));
  const parts=premium.map(x=>`${x.name.replace(/ \(.*$/,'')}: ${EUR(Number(x.hours)*Number(x.rate)*Number(x.pct)/100)} (${x.hours.toLocaleString('de-DE')} Std. × ${x.pct} %)`).join(' · ');
  prev.textContent=`Stempeluhr ${month}: ${HM(s.total)} erfasst, ${HM(s.regular)} Normalzeit, ${HM(s.overtime)} Zeitkonto-Überstunden, ${HM(s.paidOvertime)} vergütungsrelevante Überstunden (Grenze: ${payThresholdLabel(db().rates.overtimePayAfterMinutes)}), ${EUR(s.gross)} Grundlohn. Spät-/Nacht-Zuschläge laut Zeitfenstern und hinterlegter Pausenlage: ${parts||'keine'} (ohne tatsächlich erfasste Pausenlage ggf. Schätzung). ${db().rates.autoPremiums?'Zuschlagseinstellung an.':'Zuschläge nicht zur Lohnabrechnung übernommen.'} ${state.wm20?.autoPayroll?'Automatische Lohnübernahme an.':'Automatische Lohnübernahme aus.'}`;
 }
}
let renderInit=false,lastState=null;
function resetProfileControls(){const rates=db().rates;for(const [id,key] of Object.entries({wm195Late:'late',wm195LateStart:'lateStart',wm195LateEnd:'lateEnd',wm195Night:'night',wm195NightHigh:'nightHigh',wm195NightHighStart:'nightHighStart',wm195NightHighEnd:'nightHighEnd',wm195NightPauseStart:'nightPauseStart',wm195NightPauseMinutes:'nightPauseMinutes',wm195Sun:'sunday',wm195Holiday:'holiday',wm195Over:'overtime',wm195NightStart:'nightStart',wm195NightEnd:'nightEnd',wm195Break6:'minimumBreak6',wm195Break9:'minimumBreak9',wm195Long:'warningLongHours'}))if($(id))$(id).value=rates[key];
 for(const [id,key] of Object.entries({wm195EnableLate:'enableLate',wm195EnableNight:'enableNight',wm195EnableNightHigh:'enableNightHigh',wm195EnableSun:'enableSunday',wm195EnableHol:'enableHoliday',wm195AutoPrem:'autoPremiums'}))if($(id))$(id).checked=!!rates[key];
 if($('wm195OvertimePayAfter'))$('wm195OvertimePayAfter').value=rates.overtimePayAfterMinutes==null?'':HM(rates.overtimePayAfterMinutes);
 if($('wm195Opening'))$('wm195Opening').value=db().time.openingMinutes;
 if($('wm195PayMonth'))delete $('wm195PayMonth').dataset.loaded;
}
function init(){if($('wm195Root'))return;const required=['save','renderAll','exportBackup','deriveKey','decryptPayload','unb64','referencedFileKeys','nrwHolidays'];if(!required.every(x=>typeof window[x]==='function')){console.error('WorksManager 2.0.0: Kernfunktionen fehlen',required.filter(x=>typeof window[x]!=='function'));return;}
 mount();updateVersionLabel();let prior=window.renderAll;window.renderAll=function(...args){const changed=state!==lastState;const r=prior.apply(this,args);if(changed){lastState=state;resetProfileControls();}setTimeout(()=>{if(accessible())refresh();},60);return r;};
 window.addEventListener('pageshow',()=>setTimeout(()=>{if(accessible())refresh();},100));
 document.addEventListener('wm-clock-payroll-synced',()=>setTimeout(()=>{if(accessible())refresh();},100));
 setInterval(()=>{if(accessible())refresh();},30000);
 setInterval(refreshHomeGross,1000);
 // Nur bei übereinstimmender Buildnummer als installierte Version übernehmen.
 fetch('./worksmanager-release.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(x=>{if(x?.build===BUILD&&x?.version===VERSION)updateVersionLabel();}).catch(()=>{});
 console.info('WorksManager '+VERSION+' Erweiterungen geladen');
}
function refresh(){if(!accessible())return;try{report();}catch(e){console.error('WorksManager 2.0.0 Ansicht:',e);}}
if(typeof module!=='undefined'&&module.exports)module.exports={splitPay,premiumUnits,dayGroups,account,anomalies,HM,IND,calendarDayStatus,parsePayThreshold,paidOvertimeThreshold,sessionPremium};
else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
