/* WorksManager 1.9.16 – Privater Schicht-/Kurzarbeitskalender.
 * Manuelle Einträge liegen verschlüsselt in state.wmCalendar; gespeicherte AUs werden direkt aus state.aus angezeigt.
 * Keine Personen-/Gehaltsdaten im öffentlich bereitgestellten Quellcode.
 */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const E=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]));
const R=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const mm=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const iso=d=>`${mm(d)}-${String(d.getDate()).padStart(2,'0')}`;
const validDate=s=>/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(s)&&iso(new Date(Number(s.slice(0,4)),Number(s.slice(5,7))-1,Number(s.slice(8,10))))===s;
const toDate=s=>new Date(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10),12);
const addDays=(s,n)=>{const d=toDate(s);d.setDate(d.getDate()+n);return iso(d)};
const cp=o=>JSON.parse(JSON.stringify(o));
const shortLabels={early:'Früh',late:'Spät',night:'Nacht'};
const absenceLabels={vacationFull:'Urlaub',vacationHalf:'½ Urlaub',sickPaid:'Krank (EFZ)',sickBenefit:'Krankengeld',rehaPaid:'Reha (EFZ)',rehaBenefit:'Reha (Übergangsgeld)'};
const SHIFT_TIMES={early:['05:45','13:45'],late:['13:45','21:45'],night:['21:45','05:45']};

// AUs are mirrored from the encrypted primary source (state.aus); never duplicate
// AU documents or create phantom payroll records in wmCalendar.days.
function auRecords(){
 return (Array.isArray(state?.aus)?state.aus:[]).filter(rec=>rec&&typeof rec==='object').map(rec=>{
  const rawFrom=String(rec.from||rec.to||'').slice(0,10);
  const rawTo=String(rec.to||rec.from||'').slice(0,10);
  if(!validDate(rawFrom)||!validDate(rawTo))return null;
  // Match core AU date handling even for legacy reverse order and ISO timestamps.
  const from=rawFrom<=rawTo?rawFrom:rawTo,to=rawFrom<=rawTo?rawTo:rawFrom;
  return {id:String(rec.id||''),from,to};
 }).filter(Boolean);
}
function auFingerprint(){return auRecords().map(r=>`${r.id}:${r.from}:${r.to}`).sort().join('|');}
function auIndex(month){
 const start=month+'-01',end=month+'-'+String(new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()).padStart(2,'0');
 const result=new Map();let cases=0;
 for(const rec of auRecords()){
  if(rec.to<start||rec.from>end)continue;
  cases++;
  const from=rec.from<start?start:rec.from,to=rec.to>end?end:rec.to;
  for(let d=from;d<=to;d=addDays(d,1)){
   if(!result.has(d))result.set(d,[]);
   result.get(d).push(rec);
  }
 }
 return {days:result,cases};
}
function auMonths(){
 const found=new Set();
 for(const rec of auRecords()){
  let d=rec.from.slice(0,7),end=rec.to.slice(0,7),max=0;
  while(d<=end&&max++<480){found.add(d);const v=new Date(Number(d.slice(0,4)),Number(d.slice(5,7)),1);d=mm(v);}
 }
 return [...found].sort().reverse();
}
function auInfo(date){
 const info=$('wmCalAuInfo');if(!info)return;
 const index=auIndex(date.slice(0,7));const cases=index.days.get(date)||[];
 info.hidden=!cases.length;
 if(cases.length){
  const ranges=cases.map(r=>`${r.from} bis ${r.to}`).join(' · ');
  info.textContent=`${cases.length} gespeicherte Krankschreibung(en) für ${date}: ${ranges}. Diese AU-Dokumente stammen aus „Krankheit & AU“. Für die Lohnabrechnung hier unten „Krank · Entgeltfortzahlung“ oder „Krank · Krankengeld“ auswählen und speichern. Die AU selbst wird nicht verändert.`;
 }
}

function planMinutes(row){
 const start=row?.begin, end=row?.end, pause=Number(row?.pauseMinutes??0);
 if(!start&&!end)return Number(row?.targetMinutes)||DAYTARGET;
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end))throw Error('Beginn und Ende bitte vollständig als Uhrzeit eingeben.');
 const minutes=x=>Number(x.slice(0,2))*60+Number(x.slice(3));
 let span=(minutes(end)-minutes(start)+1440)%1440;
 if(span===0)throw Error('Beginn und Ende dürfen nicht gleich sein.');
 if(!Number.isInteger(pause)||pause<0||pause>=span)throw Error('Pausenminuten müssen kleiner als die Schichtdauer sein.');
 return span-pause;
}
function stampedMinutes(day){return (state.wm20?.entries||[]).filter(x=>{const actual=x.workDate|| (x.startAt?iso(new Date(x.startAt)):'');return actual===day;}).reduce((n,r)=>n+Math.max(0,Number(r.minutes)||0),0);}
function monthAbsence(month,values=days()){
 const result={vacationDays:0,halfDays:0,sickPaidDays:0,sickBenefitDays:0,rehaPaidDays:0,rehaBenefitDays:0,vacationMinutes:0,sickPaidMinutes:0,rehaPaidMinutes:0,collisions:0};
 for(const [date,r] of daysInMonth(month,values)){
  const absent=r?.absence||'';if(!absent)continue;
  const minutes=planMinutes(r),worked=stampedMinutes(date),free=Math.max(0,minutes-worked);
  if(worked>0)result.collisions++;
  if(absent==='vacationFull'){result.vacationDays++;result.vacationMinutes+=free;}
  else if(absent==='vacationHalf'){result.halfDays++;result.vacationMinutes+=Math.min(minutes/2,free);}
  else if(absent==='sickPaid'){result.sickPaidDays++;result.sickPaidMinutes+=free;}
  else if(absent==='sickBenefit')result.sickBenefitDays++;
  else if(absent==='rehaPaid'){result.rehaPaidDays++;result.rehaPaidMinutes+=free;}
  else if(absent==='rehaBenefit')result.rehaBenefitDays++;
 }
 return result;
}
const DAYTARGET=450;
let viewMonth=mm(new Date()), selected=iso(new Date()), currentState=null, lastAuFingerprint="";
function open(){return typeof state!=='undefined'&&!!$('app')&&!$('app').classList.contains('hidden');}
function db(){if(!state.wmCalendar||typeof state.wmCalendar!=='object'||Array.isArray(state.wmCalendar))state.wmCalendar={};const x=state.wmCalendar;if(!x.days||typeof x.days!=='object'||Array.isArray(x.days))x.days={};return x;}
function days(){return db().days;}
function targetMinutes(){const n=Number(state.wm20?.targetMinutes);return Number.isFinite(n)&&n>0&&n<=1440?n:DAYTARGET;}
function payMonth(month){return state.wmPayroll?.months?.[month]||{};}
function daysInMonth(month,values=days()){return Object.entries(values).filter(([k])=>k.startsWith(month)).sort(([a],[b])=>a.localeCompare(b));}
function monthKug(month,values=days(),strict=true){
 const chosen=daysInMonth(month,values).filter(([,x])=>x.shortEnabled&&Number(x.shortLoss)>0);
 const childTypes=new Set(chosen.map(([,x])=>String(x.withChild)));
 const quotes=new Set(chosen.map(([,x])=>Number(x.kugRate)));
 const conflictingChild=childTypes.size>1,conflictingRate=quotes.size>1;
 if(strict&&conflictingChild)throw Error('Im selben Monat sind unterschiedliche KUG-Kinderstatus gespeichert. Bitte einheitlich festlegen.');
 if(strict&&conflictingRate)throw Error('Im selben Monat sind unterschiedliche KUG-Prozentsätze gespeichert. Bitte vereinheitlichen.');
 const inconsistent=conflictingChild||conflictingRate;
 const child=chosen.length&&!inconsistent?!!chosen[0][1].withChild:null;
 return {days:chosen.length,shortMinutes:R(chosen.reduce((n,[,x])=>n+planMinutes(x)*Number(x.shortLoss)/100,0)),withChild:child,rate:chosen.length&&!inconsistent?Number(chosen[0][1].kugRate):null,...(inconsistent?{conflict:true}:{})};
}
function syncPayroll(month){
 const info=monthKug(month,days(),false),leave=monthAbsence(month),pay=state.wmPayroll??{},months=pay.months??{},old=months[month]||{};
 const hadLeave=!!old.wmCalendarAbsence;
 if(!info.days&&!old.wmCalendarKug&&!hadLeave&&!leave.vacationDays&&!leave.halfDays&&!leave.sickPaidDays&&!leave.sickBenefitDays&&!leave.rehaPaidDays&&!leave.rehaBenefitDays)return false;
 if(info.conflict){
  // Broken / legacy Kurzarbeit choices must not block saving a separate sick or vacation day.
  // Do not touch any existing KUG payroll settings until inconsistent child/rate entries are corrected.
  months[month]={...old};
 }else if(info.days){
  if(old.shortEnabled&&!old.wmCalendarKug){if(!confirm(`Im Lohnmonat ${month} wurde bereits Kurzarbeit manuell erfasst. Kalenderdaten für KUG-Satz und Tage übernehmen? Vorhandene Nettoangaben bleiben erhalten.`))throw Error('Vorhandene Kurzarbeitseinstellungen wurden nicht verändert.');}
  const update={...old,month,shortEnabled:true,shortWithChild:info.withChild,shortCalendarDays:info.days,
   shortCalendarLostHours:R(info.shortMinutes/60),wmCalendarKug:true,wmCalendarUpdatedAt:new Date().toISOString()};
  // Keep manually entered replacement quote if previously set. Otherwise apply the calendar's editable 60/67% rate.
  if(update.shortRateOverride===''||update.shortRateOverride==null){
   if(info.withChild)update.shortRateWithChild=info.rate;
   else update.shortRateWithoutChild=info.rate;
  }
  months[month]=update;
 }else if(old.wmCalendarKug){
  // Only clear Kurzarbeit that originally came from this calendar.
  months[month]={...old,shortEnabled:false,shortCalendarDays:0,shortCalendarLostHours:0,wmCalendarKug:false,wmCalendarUpdatedAt:new Date().toISOString()};
 }else{
  // Existing manually entered Kurzarbeit must survive a vacation/sickness update.
  months[month]={...old};
 }
 // Separate source fields protect manually maintained vacation/sickness hours.
 // The payroll calculator uses the higher of the manual and calendar total, never their sum.
 const target=months[month]||{...old,month};
 target.calendarVacationHours=R(leave.vacationMinutes/60);
 target.calendarPaidSickHours=R(leave.sickPaidMinutes/60);
 target.calendarVacationDays=leave.vacationDays;
 target.calendarHalfDays=leave.halfDays;
 target.calendarSickPaidDays=leave.sickPaidDays;
 target.calendarSickBenefitDays=leave.sickBenefitDays;
 target.calendarRehaPaidHours=R(leave.rehaPaidMinutes/60);
 target.calendarRehaPaidDays=leave.rehaPaidDays;
 target.calendarRehaBenefitDays=leave.rehaBenefitDays;
 target.calendarTimeCollisions=leave.collisions;
 target.wmCalendarAbsence=!!(leave.vacationDays||leave.halfDays||leave.sickPaidDays||leave.sickBenefitDays||leave.rehaPaidDays||leave.rehaBenefitDays);
 target.wmCalendarAbsenceUpdatedAt=new Date().toISOString();
 months[month]=target;pay.months=months;state.wmPayroll=pay;return true;
}
function refreshAbsenceForMonths(months){
 for(const month of new Set(months||[])){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))continue;
  const pay=state.wmPayroll, old=pay?.months?.[month];
  const leave=monthAbsence(month);
  if(!old?.wmCalendarAbsence&&!leave.vacationDays&&!leave.halfDays&&!leave.sickPaidDays&&!leave.sickBenefitDays&&!leave.rehaPaidDays&&!leave.rehaBenefitDays)continue;
  pay.months[month]={...old, calendarVacationHours:R(leave.vacationMinutes/60),
   calendarPaidSickHours:R(leave.sickPaidMinutes/60),calendarVacationDays:leave.vacationDays,
   calendarHalfDays:leave.halfDays,calendarSickPaidDays:leave.sickPaidDays,
   calendarSickBenefitDays:leave.sickBenefitDays,calendarRehaPaidDays:leave.rehaPaidDays,
   calendarRehaBenefitDays:leave.rehaBenefitDays,calendarRehaPaidHours:R(leave.rehaPaidMinutes/60),calendarTimeCollisions:leave.collisions,
   wmCalendarAbsence:!!(leave.vacationDays||leave.halfDays||leave.sickPaidDays||leave.sickBenefitDays||leave.rehaPaidDays||leave.rehaBenefitDays),
   wmCalendarAbsenceUpdatedAt:new Date().toISOString()};
 }
}
function dateSelection(mode,from,to,weekdaySet){
 if(!validDate(from)||!validDate(to))throw Error('Bitte gültige Datumsangaben auswählen.');
 if(mode==='one')return [from];
 if(mode==='week'){
  const d=toDate(from),back=(d.getDay()+6)%7;d.setDate(d.getDate()-back);
  const mon=iso(d);return Array.from({length:7},(_,i)=>addDays(mon,i)).filter(x=>weekdaySet.has((toDate(x).getDay()+6)%7));
 }
 const span=Math.round((toDate(to)-toDate(from))/86400000);
 if(span<0||span>366)throw Error('Der Zeitraum muss zwischen 1 und 367 Tagen liegen.');
 return Array.from({length:span+1},(_,i)=>addDays(from,i)).filter(x=>weekdaySet.has((toDate(x).getDay()+6)%7));
}
function selectedWeekdays(){return new Set([...document.querySelectorAll('#wmCalWeekdays input:checked')].map(el=>+el.value));}
function values(){
 const kind=$('wmCalShift').value,note=$('wmCalNote').value.trim(),absence=$('wmCalAbsence').value,shortEnabled=$('wmCalKug').checked,
 shortLoss=Number($('wmCalLoss').value),kugRate=Number($('wmCalKugRate').value),withChild=$('wmCalChild').value==='yes';
 const rawTarget=$('wmCalTarget').value.trim(),target=rawTarget===''?targetMinutes():Number(rawTarget);
 let begin=$('wmCalBegin').value,end=$('wmCalEnd').value;const pauseMinutes=Number($('wmCalPause').value);
 if(note.length>400)throw Error('Notiz maximal 400 Zeichen.');
 if(!['','early','late','night'].includes(kind))throw Error('Ungültige Schicht.');
 if(!['',...Object.keys(absenceLabels)].includes(absence))throw Error('Ungültige Abwesenheit.');
 if(absence&&shortEnabled)throw Error('Urlaub, Krankheit oder Reha und Kurzarbeit nicht am selben Tag buchen. Bitte nur eine Fehlzeit auswählen.');
 if(shortEnabled&&(!Number.isFinite(shortLoss)||shortLoss<=0||shortLoss>100))throw Error('Arbeitsausfall für Kurzarbeit zwischen 1 % und 100 % angeben.');
 if(shortEnabled&&(!Number.isFinite(kugRate)||kugRate<0||kugRate>100))throw Error('Kurzarbeitergeld-Leistungssatz muss 0–100 % betragen.');
 if(!Number.isInteger(target)||target<1||target>1440)throw Error('Tägliche Sollzeit zwischen 1 und 1440 Minuten eingeben.');
 const row={shift:kind,note,absence,shortEnabled,shortLoss:shortEnabled?shortLoss:0,withChild,kugRate,targetMinutes:target,begin,end,pauseMinutes,updatedAt:new Date().toISOString()};
 row.plannedMinutes=planMinutes(row);
 return row;
}
function scopeDates(){return dateSelection($('wmCalScope').value,$('wmCalFrom').value,$('wmCalTo').value,selectedWeekdays());}
function showMessage(msg,error=false){const el=$('wmCalMessage');if(el){el.textContent=msg;el.style.color=error?'#ad252f':'#246b4b';}}
async function modify(mode){if(!open())throw Error('Profil bitte entsperren.');const dates=scopeDates();if(!dates.length)throw Error('Keine Wochentage ausgewählt.');
 if(dates.length>300)throw Error('Maximal 300 Tage auf einmal bearbeiten.');
 const row=mode==='save'?values():null;
 if(dates.length>1&&dates.some(day=>days()[day])&&!confirm(`${dates.length} Kalendertage bearbeiten? Vorhandene Schicht-, Abwesenheits-, Zeit-, Notiz- und Kurzarbeitsangaben auf den ausgewählten Tagen werden ${mode==='save'?'ersetzt':'entfernt'}.`))return;
 if(mode==='delete'&&!confirm(`${dates.length} ausgewählte(n) Kalendertag(e) löschen? Stempelzeiten und bestehende Lohnabrechnungen bleiben erhalten.`))return;
 const oldCalendar=state.wmCalendar===undefined?undefined:cp(state.wmCalendar),oldPay=state.wmPayroll===undefined?undefined:cp(state.wmPayroll),months=[...new Set(dates.map(d=>d.slice(0,7)))];
 try{
  const dest=days();for(const date of dates){if(row&&(row.shift||row.note||row.shortEnabled||row.absence||(row.begin&&row.end)))dest[date]={...row};else delete dest[date];}
  // Validate all affected months before writing any payroll changes.
  if(row?.shortEnabled)for(const month of months)monthKug(month);
  for(const month of months)syncPayroll(month);
  await save('Startseitenkalender gespeichert');
  const summary=dates.length===1?dates[0]:`${dates.length} Tage`;
  showMessage(`${summary}: ${mode==='save'?'gespeichert':'gelöscht'}. ${months.join(', ')} mit der Lohnberechnung abgeglichen.`);
  render();
  document.dispatchEvent(new CustomEvent('wm-calendar-payroll-updated',{detail:{months}}));
 }catch(e){if(oldCalendar===undefined)delete state.wmCalendar;else state.wmCalendar=oldCalendar;if(oldPay===undefined)delete state.wmPayroll;else state.wmPayroll=oldPay;throw e;}
}
function setFormDate(date){if(!validDate(date))return;selected=date;viewMonth=date.slice(0,7);$('wmCalFrom').value=date;$('wmCalTo').value=date;$('wmCalScope').value='one';const item=days()[date]||{};
 $('wmCalShift').value=item.shift||'';$('wmCalAbsence').value=item.absence||'';$('wmCalNote').value=item.note||'';$('wmCalKug').checked=!!item.shortEnabled;
 $('wmCalLoss').value=item.shortLoss||100;
 const recent=payMonth(viewMonth);const fallback=recent.shortWithChild===undefined?true:recent.shortWithChild===true||recent.shortWithChild==='true';
 $('wmCalChild').value=String(item.withChild===undefined?fallback:!!item.withChild)==='true'?'yes':'no';
 $('wmCalKugRate').value=item.kugRate??($('wmCalChild').value==='yes'?67:60);
 const shiftTimes=SHIFT_TIMES[item.shift]||['',''];
 $('wmCalBegin').value=item.begin??shiftTimes[0];$('wmCalEnd').value=item.end??shiftTimes[1];$('wmCalPause').value=item.pauseMinutes??30;
 $('wmCalTarget').value=item.targetMinutes||targetMinutes();toggleForm();render();auInfo(date);
}
function reflectQuickSelection(){
 const selectedAbsence=$('wmCalAbsence')?.value||'';
 document.querySelectorAll('#wmCalEditor [data-cal-absence]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.calAbsence===selectedAbsence)));
 const info=$('wmCalSelectedInfo');if(info){
  const d=$('wmCalFrom')?.value||selected;
  const suffix=selectedAbsence?(absenceLabels[selectedAbsence]||selectedAbsence):($('wmCalShift')?.selectedOptions?.[0]?.textContent||'Schicht/Notiz');
  info.textContent=`Ausgewählt: ${d} · ${suffix}. Zum Übernehmen unten „Eintrag speichern“ wählen.`;
 }
}
function toggleForm(){const mode=$('wmCalScope')?.value;const range=$('wmCalToBox'),weekdays=$('wmCalWeekdays'),kug=$('wmCalKugFields');if(range)range.hidden=mode!=='range';if(weekdays)weekdays.hidden=mode==='one';if(kug)kug.hidden=!$('wmCalKug').checked;
 $('wmCalFromLabel').textContent=mode==='week'?'Eine Woche auswählen (Datum innerhalb der Woche)':mode==='range'?'Zeitraum von':'Datum';
 reflectQuickSelection();
}
function render(){if(!open()||!$('wmCalGrid'))return;const month=viewMonth,y=Number(month.slice(0,4)),m=Number(month.slice(5,7));$('wmCalMonth').textContent=new Date(y,m-1,1).toLocaleDateString('de-DE',{month:'long',year:'numeric'});
 let html='';const first=new Date(y,m-1,1),offset=(first.getDay()+6)%7,num=new Date(y,m,0).getDate();for(const w of ['Mo','Di','Mi','Do','Fr','Sa','So'])html+=`<span class="wmcal-weeklabel">${w}</span>`;for(let i=0;i<offset;i++)html+='<span></span>';

const entries=days(),today=iso(new Date()),savedAU=auIndex(month);for(let n=1;n<=num;n++){
 const day=`${month}-${String(n).padStart(2,'0')}`,r=entries[day],shift=r?.shift||'',absence=r?.absence||'',kug=r?.shortEnabled&&r?.shortLoss>0;
 const cases=savedAU.days.get(day)||[],fromAU=cases.length>0;
 const cls=absence?`wmcal-${absence}`:kug?'wmcal-kug-day':fromAU?'wmcal-auSaved':shift?`wmcal-${shift}`:r?.note?'wmcal-note-day':'';
 const time=r?.begin&&r?.end?`${r.begin}–${r.end}`:'';
 const caption=[shortLabels[shift]||'',absenceLabels[absence]||'',fromAU?`${cases.length} gespeicherte AU`:'' ,kug?`Kurzarbeit ${r.shortLoss} %`:'',time,r?.note?'Notiz':''].filter(Boolean).join(' · ');
 html+=`<button type="button" data-cal-date="${day}" aria-label="${day} ${E(caption)}" class="wmcal-day ${cls} ${fromAU?'wmcal-has-au':''} ${kug?'wmcal-has-kug':''} ${day===selected?'selected':''} ${day===today?'today':''}"><strong>${n}</strong>${shift?`<span class="wmcal-shift">${E(shortLabels[shift])}</span>`:''}${absence?`<span class="wmcal-absence wmcal-chip-${absence}">${E(absenceLabels[absence])}</span>`:''}${fromAU?`<span class="wmcal-au-badge">AU${cases.length>1?' ×'+cases.length:''}</span>`:''}${kug?`<span class="wmcal-kug">KA ${E(r.shortLoss)} %</span>`:''}${time?`<span class="wmcal-time">${E(time)}</span>`:''}${r?.note?'<span class="wmcal-note">Notiz</span>':''}</button>`;
}

$('wmCalGrid').innerHTML=html;
const auJump=$('wmCalAuJump');if(auJump){
 const options=auMonths();
 auJump.innerHTML='<option value="">AU-Monat auswählen …</option>'+options.map(month=>`<option value="${month}">${month}</option>`).join('');
 auJump.value=options.includes(viewMonth)?viewMonth:'';
}
auInfo(selected);

 const all=daysInMonth(month),counts={early:0,late:0,night:0};for(const [,x]of all)if(Object.hasOwn(counts,x.shift))counts[x.shift]++;
 const k=monthKug(month,days(),false),a=monthAbsence(month),p=payMonth(month),rates=k.conflict?'unterschiedliche KUG-Sätze: bitte korrigieren':k.days?`${k.rate} % (${k.withChild?'mit Kind':'ohne Kind'})`:'';
 const hasNet=p.shortNetSoll!==''&&p.shortNetSoll!=null&&p.shortNetIst!==''&&p.shortNetIst!=null;
 const reported=hasNet&&k.days&&!k.conflict?R(Math.max(0,Number(p.shortNetSoll)-Number(p.shortNetIst))*Number(p.shortRateOverride!==''&&p.shortRateOverride!=null?p.shortRateOverride:k.rate)/100):null;
 const absentInfo=`Urlaub ${a.vacationDays} ganze / ${a.halfDays} halbe Tage (${R(a.vacationMinutes/60).toLocaleString('de-DE')} Std.) · Krank mit Entgeltfortzahlung ${a.sickPaidDays} Tage (${R(a.sickPaidMinutes/60).toLocaleString('de-DE')} Std.) · Krankengeld-Fälle ${a.sickBenefitDays} · Reha mit Entgeltfortzahlung ${a.rehaPaidDays} Tage (${R(a.rehaPaidMinutes/60).toLocaleString('de-DE')} Std.) · Reha mit Übergangsgeld ${a.rehaBenefitDays} Tage (nicht im Arbeitgeberbrutto).`;
 $('wmCalSummary').textContent=`Gespeicherte AU: ${savedAU.days.size} Kalendertage (${savedAU.cases} Krankschreibung(en) mit Überschneidung in diesem Monat) – automatisch aus „Krankheit & AU“ angezeigt, ohne automatische Annahme zur Lohnfortzahlung. · Früh ${counts.early} · Spät ${counts.late} · Nacht ${counts.night} · ${absentInfo} Kurzarbeit ${k.days} Tag(e) (${R(k.shortMinutes/60).toLocaleString('de-DE')} geplante Ausfallstunden). ${a.collisions?`Achtung: An ${a.collisions} Abwesenheitstag(en) existieren Stempelzeiten; nur die verbleibende Sollzeit wird für Lohnfortzahlung angesetzt. `:''}${k.days?`KUG-Satz ${rates}. ${k.conflict?'Urlaub und Krankheit können dennoch gespeichert werden; KUG-Abrechnung bleibt unverändert.':reported===null?'Für einen Eurobetrag bitte in Abrechnung das pauschalierte Soll- und Ist-Netto eintragen.':`KUG-Vorschau ${reported.toLocaleString('de-DE',{style:'currency',currency:'EUR'})} nach hinterlegtem Netto.`}`:''}`;
}
function navMonths(dir){const d=new Date(Number(viewMonth.slice(0,4)),Number(viewMonth.slice(5,7))-1+dir,1);viewMonth=mm(d);if(!selected.startsWith(viewMonth))selected=`${viewMonth}-01`;render();}
function mount(){if($('wmCalRoot'))return;const dash=$('dashboard');if(!dash||!$('app'))return;
 const st=document.createElement('style');st.id='wmCalStyles';st.textContent=`
.wmcal{background:#fff;color:#14324a;border:1px solid #d9e3ec;border-radius:16px;margin:16px 0;padding:16px;box-shadow:0 3px 15px #0000000a}.wmcal *{box-sizing:border-box}.wmcal-head{display:flex;justify-content:space-between;align-items:center;gap:9px;flex-wrap:wrap}.wmcal-head h3{margin:0;font-size:20px}.wmcal-monthnav{display:flex;align-items:center;gap:8px}.wmcal-monthnav button{min-width:34px}.wmcal button.wmcal-control{border:1px solid #b7ccdb;background:white;border-radius:9px;min-height:38px;padding:6px 11px;color:#15384b;font-weight:800}.wmcal-monthnav strong{min-width:128px;text-align:center;text-transform:capitalize}.wmcal-legend{display:flex;gap:13px;flex-wrap:wrap;margin:12px 0;font-size:12px}.wmcal-mark{width:12px;height:12px;display:inline-block;border-radius:4px;margin-right:4px;vertical-align:middle}.wmcal-mark.early{background:#bceccf}.wmcal-mark.late{background:#bfdafa}.wmcal-mark.night{background:#ffeba2}.wmcal-mark.kug{background:#fff;border:2px solid #b56c21}.wmcal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin:10px 0}.wmcal-weeklabel{text-align:center;font-size:12px;font-weight:800;color:#60748a;padding:5px 0}.wmcal-day{background:#f2f6f9;border:1px solid #dfe6ee;border-radius:9px;min-height:66px;padding:5px 3px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:2px;color:#18334a;cursor:pointer;overflow:hidden;font-size:11px}.wmcal-day strong{font-size:15px}.wmcal-day.wmcal-early{background:#cbf2d9;border-color:#86c79f}.wmcal-day.wmcal-late{background:#cde2ff;border-color:#92b9ec}.wmcal-day.wmcal-night{background:#fff0b9;border-color:#ead17b}.wmcal-day.selected{outline:3px solid #174d64;outline-offset:-2px}.wmcal-day.today strong{text-decoration:underline}.wmcal-shift{font-weight:850}.wmcal-kug{font-weight:800;font-size:10px;color:#8b3e06}.wmcal-note{font-size:9px;white-space:nowrap;color:#4d6071}.wmcal-summary{font-size:12px;color:#31536a;line-height:1.6;margin:10px 0 5px}.wmcal details{border-top:1px solid #e0e8ee;margin-top:14px}.wmcal details summary{cursor:pointer;font-weight:800;padding:14px 0}.wmcal-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wmcal-form label{font-weight:700;font-size:13px;display:flex;flex-direction:column;gap:5px}.wmcal-form input,.wmcal-form select,.wmcal-form textarea{width:100%;padding:10px;font:16px system-ui;background:#fff;color:#163649;border:1px solid #becbd6;border-radius:8px;min-width:0}.wmcal-form .full{grid-column:1/-1}.wmcal-form label.wmcal-check{display:flex;flex-direction:row;align-items:center;gap:8px}.wmcal-form input[type=checkbox]{width:19px;height:19px;flex:0 0 19px}.wmcal-weekdays{display:flex;flex-wrap:wrap;gap:10px;padding:6px 0}.wmcal-weekdays label{display:flex;align-items:center;flex-direction:row}.wmcal-weekdays input{width:19px;height:19px}.wmcal-actions{display:flex;flex-wrap:wrap;gap:9px;grid-column:1/-1}.wmcal-actions button{padding:12px 16px;border:0;border-radius:9px;background:#087d79;color:white;font-weight:800;min-height:46px}.wmcal-actions button.danger{background:#fff4f4;border:1px solid #be7b7b;color:#9a2634}.wmcal-help{font-size:12px;color:#546f84;line-height:1.6;margin:7px 0}.wmcal-message{font-size:13px;min-height:16px;font-weight:750}.wmcal-form [hidden]{display:none!important}@media(max-width:470px){.wmcal{padding:11px}.wmcal-grid{gap:3px}.wmcal-day{min-height:61px;font-size:10px;padding:4px 1px}.wmcal-day strong{font-size:13px}.wmcal-kug{font-size:9px}.wmcal-note{font-size:8px}.wmcal-form{grid-template-columns:1fr}.wmcal-form .full{grid-column:1}.wmcal-monthnav strong{min-width:110px}}


.wmcal-day.wmcal-auSaved{background:#ffe4e6;border-color:#d85d6b;color:#76212c}
.wmcal-day.wmcal-has-au:not(.wmcal-auSaved){border:2px solid #d44959}
.wmcal-au-badge{font-weight:850;font-size:10px;color:#8f1326;background:#ffd0d5;border:1px solid #db7680;border-radius:5px;padding:2px 4px;max-width:100%}
.wmcal-mark.auSaved{background:#ffd0d5;border:1px solid #d44959}
.wmcal-au-info{background:#fff3f4;color:#7b2732;border:1px solid #dca3a8;padding:9px;border-radius:9px;font-size:12px;line-height:1.5;margin:8px 0}
.wmcal-au-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:5px 0 10px}
.wmcal-au-toolbar label{font-size:12px;font-weight:700;color:#31536a;display:flex;gap:6px;align-items:center}
.wmcal-au-toolbar select{min-height:40px;max-width:240px;background:white;color:#163649;border:1px solid #baccdb;border-radius:8px;padding:8px;font:14px system-ui}
@media(max-width:470px){.wmcal-au-badge{font-size:9px;padding:1px 2px}}
.wmcal-mark.vacationFull{background:#b99ae9}.wmcal-mark.vacationHalf{background:#e3d2ff;border:1px solid #8f6ab4}.wmcal-mark.sickPaid{background:#f8a4a8}.wmcal-mark.sickBenefit{background:#edb7c0}.wmcal-mark.rehaPaid{background:#5bd5c0}.wmcal-mark.rehaBenefit{background:#a3dfe8}.wmcal-mark.kug{background:#ffc384;border:1px solid #b56c21}.wmcal-mark.note{background:#e5e8ed;border:1px solid #95a4b1}
.wmcal-day.wmcal-vacationFull{background:#e8ddfa;border-color:#b39add}.wmcal-day.wmcal-vacationHalf{background:#f2eaff;border-color:#c1a9e9}.wmcal-day.wmcal-sickPaid{background:#ffe1e2;border-color:#ea999e}.wmcal-day.wmcal-sickBenefit{background:#fbe7eb;border-color:#d6a1b3}.wmcal-day.wmcal-rehaPaid{background:#cef7ed;border-color:#62bca7}.wmcal-day.wmcal-rehaBenefit{background:#dff4f9;border-color:#86c3d2}.wmcal-day.wmcal-kug-day{background:#ffebd4;border-color:#e9ad6b}.wmcal-day.wmcal-note-day{background:#e5e8ed;border-color:#9cadbe}.wmcal-absence,.wmcal-kug{padding:2px 3px;border-radius:4px;font-weight:850;line-height:1.2;text-align:center}.wmcal-kug{color:#823b09;background:#ffcf9b}.wmcal-absence{color:#57327a}.wmcal-chip-sickPaid,.wmcal-chip-sickBenefit{color:#982333}.wmcal-chip-rehaPaid{color:#126459}.wmcal-chip-rehaBenefit{color:#175b6a}.wmcal-time{font-size:9px;color:#385469;letter-spacing:-.4px;white-space:nowrap}.wmcal-quick{border:1px solid #d7e3ec;border-radius:12px;padding:10px;margin-bottom:10px;background:#f7fafc}.wmcal-quick>strong{display:block;font-size:13px;margin-bottom:8px}.wmcal-quick p{font-size:12px;line-height:1.4;margin:9px 0 0;color:#536b7e}.wmcal-quickgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.wmcal-quickgrid button{border:1px solid #9cb1c2;border-radius:9px;min-height:46px;padding:7px 8px;color:#1a3448;font-size:12px;font-weight:750;cursor:pointer;text-align:center}.wmcal-quickgrid button.vacationFull{background:#e8ddfa}.wmcal-quickgrid button.vacationHalf{background:#f2eaff}.wmcal-quickgrid button.sickPaid{background:#ffe1e2}.wmcal-quickgrid button.sickBenefit{background:#fbe7eb}.wmcal-quickgrid button.rehaPaid{background:#cef7ed}.wmcal-quickgrid button.rehaBenefit{background:#dff4f9}.wmcal-quickgrid button.noAbsence{background:#e5e8ed}.wmcal-quickgrid button[aria-pressed="true"]{outline:3px solid #184d62;outline-offset:-3px}.wmcal-selected{font-size:14px;font-weight:800;color:#1b5362;border-left:3px solid #149b8d;padding:7px 9px;margin:6px 0 12px;background:#f1f9fb}.wmcal-legend{border-top:1px solid #dee6ed;border-bottom:1px solid #dee6ed;padding:10px 0;margin:10px 0 12px;gap:9px 13px}.wmcal-legend span{display:inline-flex;align-items:center;gap:3px}.wmcal-legend-caption{font-weight:750;font-size:12px;flex-basis:100%;color:#314e64}.wmcal-day.wmcal-has-kug{box-shadow:inset 0 -5px 0 #efa65e}.wmcal-note{padding:1px 3px;border-radius:3px;background:#e5e8ed;border:1px solid #bac4ce;color:#48576a}
@media(max-width:470px){.wmcal-day{min-height:75px}.wmcal-time{font-size:8px;letter-spacing:-.5px}.wmcal-absence,.wmcal-kug{font-size:8px;max-width:100%;overflow-wrap:anywhere}}
 `;document.head.appendChild(st);
 const section=document.createElement('section');section.id='wmCalRoot';section.className='wmcal';section.innerHTML=`<div class="wmcal-head"><h3>Schicht-, Urlaubs-, Krankheits- und Rehakalender</h3><div class="wmcal-monthnav"><button class="wmcal-control" type="button" id="wmCalPrev" aria-label="Vorheriger Monat">‹</button><strong id="wmCalMonth"></strong><button class="wmcal-control" type="button" id="wmCalNext" aria-label="Nächster Monat">›</button></div></div><div class="wmcal-au-toolbar"><label>Gespeicherte Krankschreibungen <select id="wmCalAuJump" aria-label="Monat mit Krankschreibung auswählen"><option value="">AU-Monat auswählen …</option></select></label><button class="wmcal-control" type="button" id="wmCalOpenAUs">Krankschreibungen öffnen →</button></div><div id="wmCalGrid" class="wmcal-grid" aria-label="Schichtkalender"></div><div class="wmcal-legend" aria-label="Bedeutung der Kalenderfarben"><span class="wmcal-legend-caption">Farben im Kalender</span><span><i class="wmcal-mark early"></i>Grün · Frühschicht</span><span><i class="wmcal-mark late"></i>Blau · Spätschicht</span><span><i class="wmcal-mark night"></i>Gelb · Nachtschicht</span><span><i class="wmcal-mark vacationFull"></i>Lila · Urlaub ganzer Tag</span><span><i class="wmcal-mark vacationHalf"></i>Helllila · Urlaub halber Tag</span><span><i class="wmcal-mark auSaved"></i>Rot · gespeicherte AU (automatisch)</span><span><i class="wmcal-mark sickPaid"></i>Rot · Krank / Entgeltfortzahlung</span><span><i class="wmcal-mark sickBenefit"></i>Rosa · Krankengeld</span><span><i class="wmcal-mark rehaPaid"></i>Türkis · Reha mit Entgeltfortzahlung</span><span><i class="wmcal-mark rehaBenefit"></i>Hellblau · Reha mit Übergangsgeld</span><span><i class="wmcal-mark kug"></i>Orange · Kurzarbeit</span><span><i class="wmcal-mark note"></i>Grau · Notiz</span></div><p id="wmCalSummary" class="wmcal-summary"></p>
<details id="wmCalEditor"><summary>Schichten, Urlaub, Krankheit, Reha und Kurzarbeit eintragen</summary><div class="wmcal-quick"><strong>Eintragsart direkt auswählen</strong><div class="wmcal-quickgrid"><button type="button" data-cal-absence="vacationFull" class="vacationFull">Urlaub · ganzer Tag</button><button type="button" data-cal-absence="vacationHalf" class="vacationHalf">Urlaub · halber Tag</button><button type="button" data-cal-absence="sickPaid" class="sickPaid">Krank · Entgeltfortzahlung</button><button type="button" data-cal-absence="sickBenefit" class="sickBenefit">Krank · Krankengeld</button><button type="button" data-cal-absence="rehaPaid" class="rehaPaid">Reha · Entgeltfortzahlung</button><button type="button" data-cal-absence="rehaBenefit" class="rehaBenefit">Reha · Übergangsgeld</button><button type="button" data-cal-absence="" class="noAbsence">Nur Schicht / Notiz</button></div><p>Eintrag auswählen, Datum und Stunden prüfen, anschließend unten <b>„Eintrag speichern“</b> tippen. Ohne Schicht gelten die täglichen Sollstunden.</p></div><p class="wmcal-selected" id="wmCalSelectedInfo" role="status"></p><p class="wmcal-au-info" id="wmCalAuInfo" hidden></p><div class="wmcal-form">
<label class="full">Eintragen für<select id="wmCalScope"><option value="one">Einzelnen Tag</option><option value="week">Ganze Woche (gewählte Wochentage)</option><option value="range">Zeitraum mit Wochentagen</option></select></label>
<label><span id="wmCalFromLabel">Datum</span><input type="date" id="wmCalFrom"></label><label id="wmCalToBox" hidden>Zeitraum bis<input type="date" id="wmCalTo"></label>
<div id="wmCalWeekdays" class="full" hidden><strong style="font-size:13px">Wochentage auswählen</strong><div class="wmcal-weekdays">${['Mo','Di','Mi','Do','Fr','Sa','So'].map((name,i)=>`<label><input type="checkbox" value="${i}" ${i<5?'checked':''}>${name}</label>`).join('')}</div></div>
<label>Schicht<select id="wmCalShift"><option value="">Keine Schicht / nur Notiz</option><option value="early">Frühschicht · grün</option><option value="late">Spätschicht · blau</option><option value="night">Nachtschicht · gelb</option></select></label>
<label>Geplante Arbeitszeit von<input id="wmCalBegin" type="time"></label><label>Bis (bei Nachtschicht am Folgetag)<input id="wmCalEnd" type="time"></label><label>Unbezahlte Pause (Minuten)<input id="wmCalPause" type="number" min="0" max="1439" step="1" value="30"></label><label>Tagessoll (Minuten, falls keine Uhrzeit)<input id="wmCalTarget" type="number" min="1" max="1440" step="1"></label><label class="full">Abwesenheit<select id="wmCalAbsence"><option value="">Keine Abwesenheit</option><option value="vacationFull">Urlaub · ganzer Tag (lila)</option><option value="vacationHalf">Urlaub · halber Tag (helllila)</option><option value="sickPaid">Krank · Entgeltfortzahlung (rot)</option><option value="sickBenefit">Krank · nach Ende der Entgeltfortzahlung / Krankengeld (rosa)</option><option value="rehaPaid">Reha · mit Entgeltfortzahlung des Arbeitgebers (türkis)</option><option value="rehaBenefit">Reha · Übergangsgeld / keine Entgeltfortzahlung (hellblau)</option></select></label><label class="full">Notiz<textarea id="wmCalNote" rows="2" maxlength="400" placeholder="z. B. Schichtwechsel, Arzttermin"></textarea></label>
<label class="full wmcal-check"><input id="wmCalKug" type="checkbox">Kurzarbeit an diesem Tag berücksichtigen</label>
<div class="full wmcal-form" id="wmCalKugFields" hidden><label>Arbeitsausfall (% der Sollzeit)<input id="wmCalLoss" type="number" min="1" max="100" step="1" value="100"></label><label>KUG-Leistungssatz<select id="wmCalChild"><option value="yes">Mit Kind (67 %)</option><option value="no">Ohne Kind (60 %)</option></select></label><label>Leistungssatz (%) · änderbar<input id="wmCalKugRate" type="number" min="0" max="100" step="0.1" value="67"></label>
<p class="wmcal-help full">Für die Kurzarbeitsstunden gilt die geplante Arbeitsdauer (Beginn bis Ende minus Pause). 100 % Arbeitsausfall = an diesem Tag keine Arbeitsleistung. 50 % = die Hälfte der geplanten Arbeitszeit fällt aus. Für die Euro-Berechnung benötigt die Lohnabrechnung das pauschalierte Soll- und Ist-Netto (oder den tatsächlichen KUG-Bescheid). Ausfallstunden sind Planung, keine automatisch erfassten Arbeitsstunden.</p></div>
<div class="wmcal-actions"><button id="wmCalSave" type="button">Eintrag speichern</button><button id="wmCalDelete" type="button" class="danger">Ausgewählte Tage löschen</button></div><div class="wmcal-message full" id="wmCalMessage" role="status" aria-live="polite"></div></div></details><p class="wmcal-help">Tippe auf ein Datum, um es zu bearbeiten. Farben und Kürzel sind direkt unter dem Kalender erklärt. Beginn, Ende und Pause ergeben die geplanten Stunden, auch bei Nachtschichten über Mitternacht. Schichtplanung erzeugt keine Stempelung. Urlaub (ganz/halb), Krankheit und Reha mit Entgeltfortzahlung fließen als bezahlte Fehlzeiten in die Lohnberechnung ein; bereits gestempelte Zeit wird beim selben Tag gegengerechnet. Krankengeld sowie Reha mit Übergangsgeld werden nicht als Arbeitgeberbrutto berechnet: Die tatsächliche Leistung ist separat anhand des Bescheids zu erfassen. Den Reha-Status (Entgeltfortzahlung oder Übergangsgeld) bitte anhand Arbeitgeber/Leistungsträger wählen. Manuelle und automatisch berechnete Abwesenheitsstunden werden je Art nicht addiert, sondern der höhere Wert wird verwendet.</p>`;
 const anchor=$('wmClockHome')||dash.querySelector('.dashboard-hero');if(anchor)anchor.insertAdjacentElement('afterend',section);else dash.insertAdjacentElement('afterbegin',section);
 $('wmCalGrid').addEventListener('click',e=>{const el=e.target.closest('[data-cal-date]');if(!el)return;setFormDate(el.dataset.calDate);$('wmCalEditor').open=true;
  requestAnimationFrame(()=>$('wmCalEditor')?.scrollIntoView({block:'start',behavior:'smooth'}));
 });
 $('wmCalPrev').onclick=()=>navMonths(-1);$('wmCalNext').onclick=()=>navMonths(1);
 $('wmCalAuJump').onchange=()=>{const value=$('wmCalAuJump').value;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return;viewMonth=value;selected=value+'-01';setFormDate(selected);};
 $('wmCalOpenAUs').onclick=()=>{if(typeof go==='function')go('sickness');};
 $('wmCalScope').onchange=toggleForm;$('wmCalKug').onchange=toggleForm;
 $('wmCalFrom').addEventListener('change',reflectQuickSelection);
 $('wmCalEditor').addEventListener('click',e=>{const button=e.target.closest('button[data-cal-absence]');if(!button)return;
  $('wmCalAbsence').value=button.dataset.calAbsence;
  if(button.dataset.calAbsence){$('wmCalKug').checked=false;}
  toggleForm();
  $('wmCalSave').scrollIntoView({block:'nearest',behavior:'smooth'});
 });
 $('wmCalShift').onchange=()=>{const pair=SHIFT_TIMES[$('wmCalShift').value];if(pair){$('wmCalBegin').value=pair[0];$('wmCalEnd').value=pair[1];}else{$('wmCalBegin').value='';$('wmCalEnd').value='';}reflectQuickSelection();};
 $('wmCalAbsence').onchange=()=>{if($('wmCalAbsence').value){$('wmCalKug').checked=false;toggleForm();}};
 $('wmCalKug').addEventListener('change',()=>{if($('wmCalKug').checked)$('wmCalAbsence').value='';toggleForm();});
 $('wmCalChild').onchange=()=>{$('wmCalKugRate').value=$('wmCalChild').value==='yes'?'67':'60';};
 $('wmCalSave').onclick=()=>modify('save').catch(e=>showMessage('Fehler: '+e.message,true));
 $('wmCalDelete').onclick=()=>modify('delete').catch(e=>showMessage('Fehler: '+e.message,true));
 setFormDate(selected);
}
function init(){window.WMCalendar={refreshAbsenceForMonths,monthAbsence};if(typeof save!=='function'||typeof state==='undefined')return;mount();currentState=state;lastAuFingerprint=auFingerprint();
 if(typeof window.renderAll==='function'){const prev=window.renderAll;window.renderAll=function(...a){const r=prev.apply(this,a);const nextFingerprint=auFingerprint();if(state!==currentState||nextFingerprint!==lastAuFingerprint){currentState=state;lastAuFingerprint=nextFingerprint;setTimeout(()=>{if(open()){try{render();}catch(e){console.error('WorksManager Kalender:',e);}}},0);}return r;};}
 document.addEventListener('wm-clock-payroll-synced',ev=>{const month=ev.detail?.month;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||!state.wmCalendar?.days)return;
  if(!daysInMonth(month).some(([,r])=>r.absence))return;
  // Reconcile new or corrected clock records before calculating paid absences.
  const previous=state.wmPayroll===undefined?undefined:cp(state.wmPayroll);
  Promise.resolve().then(async()=>{try{syncPayroll(month);await save('Abwesenheitszeiten mit Stempeluhr abgeglichen');
   render();document.dispatchEvent(new CustomEvent('wm-calendar-payroll-updated',{detail:{months:[month]}}));
  }catch(e){if(previous===undefined)delete state.wmPayroll;else state.wmPayroll=previous;
   console.error('WorksManager Kalender-Lohnabgleich:',e);showMessage('Abwesenheitsabgleich: '+e.message,true);}});
 });
 window.addEventListener('pageshow',()=>{if(open())render();});console.info('WorksManager Schichtkalender 1.9.16 geladen');
}
if(typeof module!=='undefined'&&module.exports)module.exports={monthKug,monthAbsence,planMinutes,dateSelection,addDays,validDate,auRecords,auIndex,auMonths,auFingerprint};
else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
