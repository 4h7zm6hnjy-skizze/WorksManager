/* WorksManager 1.9.13 – Privater Schicht-/Kurzarbeitskalender.
 * Alle Einträge leben ausschließlich im verschlüsselten Benutzer-state.wmCalendar.
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
const DAYTARGET=450;
let viewMonth=mm(new Date()), selected=iso(new Date()), currentState=null;
function open(){return typeof state!=='undefined'&&!!$('app')&&!$('app').classList.contains('hidden');}
function db(){if(!state.wmCalendar||typeof state.wmCalendar!=='object'||Array.isArray(state.wmCalendar))state.wmCalendar={};const x=state.wmCalendar;if(!x.days||typeof x.days!=='object'||Array.isArray(x.days))x.days={};return x;}
function days(){return db().days;}
function targetMinutes(){const n=Number(state.wm20?.targetMinutes);return Number.isFinite(n)&&n>0&&n<=1440?n:DAYTARGET;}
function payMonth(month){return state.wmPayroll?.months?.[month]||{};}
function daysInMonth(month,values=days()){return Object.entries(values).filter(([k])=>k.startsWith(month)).sort(([a],[b])=>a.localeCompare(b));}
function monthKug(month,values=days()){
 const chosen=daysInMonth(month,values).filter(([,x])=>x.shortEnabled&&Number(x.shortLoss)>0);
 const childTypes=new Set(chosen.map(([,x])=>String(x.withChild)));
 if(childTypes.size>1)throw Error('Im selben Monat sind unterschiedliche KUG-Kinderstatus gespeichert. Bitte einheitlich festlegen.');
 const child=chosen.length?!!chosen[0][1].withChild:null;
 const quotes=new Set(chosen.map(([,x])=>Number(x.kugRate)));
 if(quotes.size>1)throw Error('Im selben Monat sind unterschiedliche KUG-Prozentsätze gespeichert. Bitte vereinheitlichen.');
 return {days:chosen.length,shortMinutes:R(chosen.reduce((n,[,x])=>n+(Number(x.targetMinutes)||DAYTARGET)*Number(x.shortLoss)/100,0)),withChild:child,rate:chosen.length?Number(chosen[0][1].kugRate):null};
}
function syncPayroll(month){
 const info=monthKug(month),pay=state.wmPayroll??={},months=pay.months??{},old=months[month]||{};
 if(!info.days&&!old.wmCalendarKug)return false;
 if(info.days){
  if(old.shortEnabled&&!old.wmCalendarKug){if(!confirm(`Im Lohnmonat ${month} wurde bereits Kurzarbeit manuell erfasst. Kalenderdaten für KUG-Satz und Tage übernehmen? Vorhandene Nettoangaben bleiben erhalten.`))throw Error('Vorhandene Kurzarbeitseinstellungen wurden nicht verändert.');}
  const update={...old,month,shortEnabled:true,shortWithChild:info.withChild,shortCalendarDays:info.days,
   shortCalendarLostHours:R(info.shortMinutes/60),wmCalendarKug:true,wmCalendarUpdatedAt:new Date().toISOString()};
  // Keep manually entered replacement quote if previously set. Otherwise apply the calendar's editable 60/67% rate.
  if(update.shortRateOverride===''||update.shortRateOverride==null){
   if(info.withChild)update.shortRateWithChild=info.rate;
   else update.shortRateWithoutChild=info.rate;
  }
  months[month]=update;
 }else{
  months[month]={...old,shortEnabled:false,shortCalendarDays:0,shortCalendarLostHours:0,wmCalendarKug:false,wmCalendarUpdatedAt:new Date().toISOString()};
 }
 pay.months=months;state.wmPayroll=pay;return true;
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
 const kind=$('wmCalShift').value,note=$('wmCalNote').value.trim(),shortEnabled=$('wmCalKug').checked,
 shortLoss=Number($('wmCalLoss').value),kugRate=Number($('wmCalKugRate').value),withChild=$('wmCalChild').value==='yes';
 const target=Number($('wmCalTarget').value);
 if(note.length>400)throw Error('Notiz maximal 400 Zeichen.');
 if(shortEnabled&&(!Number.isFinite(shortLoss)||shortLoss<=0||shortLoss>100))throw Error('Arbeitsausfall für Kurzarbeit zwischen 1 % und 100 % angeben.');
 if(shortEnabled&&(!Number.isFinite(kugRate)||kugRate<0||kugRate>100))throw Error('Kurzarbeitergeld-Leistungssatz muss 0–100 % betragen.');
 if(shortEnabled&&(!Number.isInteger(target)||target<1||target>1440))throw Error('Tägliche Sollzeit zwischen 1 und 1440 Minuten eingeben.');
 return {shift:kind,note,shortEnabled,shortLoss:shortEnabled?shortLoss:0,withChild,kugRate, targetMinutes:target,updatedAt:new Date().toISOString()};
}
function scopeDates(){return dateSelection($('wmCalScope').value,$('wmCalFrom').value,$('wmCalTo').value,selectedWeekdays());}
function showMessage(msg,error=false){const el=$('wmCalMessage');if(el){el.textContent=msg;el.style.color=error?'#ad252f':'#246b4b';}}
async function modify(mode){if(!open())throw Error('Profil bitte entsperren.');const dates=scopeDates();if(!dates.length)throw Error('Keine Wochentage ausgewählt.');
 if(dates.length>300)throw Error('Maximal 300 Tage auf einmal bearbeiten.');
 const row=mode==='save'?values():null;
 if(dates.length>1&&dates.some(day=>days()[day])&&!confirm(`${dates.length} Kalendertage bearbeiten? Vorhandene Schicht-, Notiz- und Kurzarbeitsangaben auf den ausgewählten Tagen werden ${mode==='save'?'ersetzt':'entfernt'}.`))return;
 if(mode==='delete'&&!confirm(`${dates.length} ausgewählte(n) Kalendertag(e) löschen? Stempelzeiten und bestehende Lohnabrechnungen bleiben erhalten.`))return;
 const oldCalendar=state.wmCalendar===undefined?undefined:cp(state.wmCalendar),oldPay=state.wmPayroll===undefined?undefined:cp(state.wmPayroll),months=[...new Set(dates.map(d=>d.slice(0,7)))];
 try{
  const dest=days();for(const date of dates){if(row&&(row.shift||row.note||row.shortEnabled))dest[date]={...row};else delete dest[date];}
  // Validate all affected months before writing any payroll changes.
  for(const month of months)monthKug(month);
  for(const month of months)syncPayroll(month);
  await save('Startseitenkalender gespeichert');
  const summary=dates.length===1?dates[0]:`${dates.length} Tage`;
  showMessage(`${summary}: ${mode==='save'?'gespeichert':'gelöscht'}. ${months.join(', ')} mit der Lohnberechnung abgeglichen.`);
  render();
  document.dispatchEvent(new CustomEvent('wm-calendar-payroll-updated',{detail:{months}}));
 }catch(e){if(oldCalendar===undefined)delete state.wmCalendar;else state.wmCalendar=oldCalendar;if(oldPay===undefined)delete state.wmPayroll;else state.wmPayroll=oldPay;throw e;}
}
function setFormDate(date){if(!validDate(date))return;selected=date;viewMonth=date.slice(0,7);$('wmCalFrom').value=date;$('wmCalTo').value=date;$('wmCalScope').value='one';const item=days()[date]||{};
 $('wmCalShift').value=item.shift||'';$('wmCalNote').value=item.note||'';$('wmCalKug').checked=!!item.shortEnabled;
 $('wmCalLoss').value=item.shortLoss||100;
 const recent=payMonth(viewMonth);const fallback=recent.shortWithChild===undefined?true:recent.shortWithChild===true||recent.shortWithChild==='true';
 $('wmCalChild').value=String(item.withChild===undefined?fallback:!!item.withChild)==='true'?'yes':'no';
 $('wmCalKugRate').value=item.kugRate??($('wmCalChild').value==='yes'?67:60);
 $('wmCalTarget').value=item.targetMinutes||targetMinutes();toggleForm();render();
}
function toggleForm(){const mode=$('wmCalScope')?.value;const range=$('wmCalToBox'),weekdays=$('wmCalWeekdays'),kug=$('wmCalKugFields');if(range)range.hidden=mode!=='range';if(weekdays)weekdays.hidden=mode==='one';if(kug)kug.hidden=!$('wmCalKug').checked;
 $('wmCalFromLabel').textContent=mode==='week'?'Eine Woche auswählen (Datum innerhalb der Woche)':mode==='range'?'Zeitraum von':'Datum';
}
function render(){if(!open()||!$('wmCalGrid'))return;const month=viewMonth,y=Number(month.slice(0,4)),m=Number(month.slice(5,7));$('wmCalMonth').textContent=new Date(y,m-1,1).toLocaleDateString('de-DE',{month:'long',year:'numeric'});
 let html='';const first=new Date(y,m-1,1),offset=(first.getDay()+6)%7,num=new Date(y,m,0).getDate();for(const w of ['Mo','Di','Mi','Do','Fr','Sa','So'])html+=`<span class="wmcal-weeklabel">${w}</span>`;for(let i=0;i<offset;i++)html+='<span></span>';
 const entries=days(),today=iso(new Date());for(let n=1;n<=num;n++){
  const day=`${month}-${String(n).padStart(2,'0')}`,r=entries[day],shift=r?.shift||'',cls=shift?`wmcal-${shift}`:'',kug=r?.shortEnabled&&r?.shortLoss>0;
  html+=`<button type="button" data-cal-date="${day}" aria-label="${day} ${E(shortLabels[shift]||'')} ${kug?'Kurzarbeit '+E(r.shortLoss)+' Prozent':''}" class="wmcal-day ${cls} ${day===selected?'selected':''} ${day===today?'today':''}"><strong>${n}</strong>${shift?`<span class="wmcal-shift">${E(shortLabels[shift])}</span>`:''}${kug?`<span class="wmcal-kug">KA ${E(r.shortLoss)} %</span>`:''}${r?.note?'<span class="wmcal-note">Notiz</span>':''}</button>`;
 }
 $('wmCalGrid').innerHTML=html;
 const all=daysInMonth(month),counts={early:0,late:0,night:0};for(const [,x]of all)if(Object.hasOwn(counts,x.shift))counts[x.shift]++;
 const k=monthKug(month),p=payMonth(month),rates=k.days?`${k.rate} % (${k.withChild?'mit Kind':'ohne Kind'})`:'';
 const hasNet=p.shortNetSoll!==''&&p.shortNetSoll!=null&&p.shortNetIst!==''&&p.shortNetIst!=null;
 const reported=hasNet&&k.days?R(Math.max(0,Number(p.shortNetSoll)-Number(p.shortNetIst))*Number(p.shortRateOverride!==''&&p.shortRateOverride!=null?p.shortRateOverride:k.rate)/100):null;
 $('wmCalSummary').textContent=`Früh ${counts.early} · Spät ${counts.late} · Nacht ${counts.night} · Kurzarbeit ${k.days} Tag(e) (${R(k.shortMinutes/60).toLocaleString('de-DE')} geplante Ausfallstunden). ${k.days?`KUG-Satz ${rates}. ${reported===null?'Für einen Eurobetrag bitte in Abrechnung das pauschalierte Soll- und Ist-Netto eintragen.':`KUG-Vorschau ${reported.toLocaleString('de-DE',{style:'currency',currency:'EUR'})} nach hinterlegtem Netto.`}`:''}`;
}
function navMonths(dir){const d=new Date(Number(viewMonth.slice(0,4)),Number(viewMonth.slice(5,7))-1+dir,1);viewMonth=mm(d);if(!selected.startsWith(viewMonth))selected=`${viewMonth}-01`;render();}
function mount(){if($('wmCalRoot'))return;const dash=$('dashboard');if(!dash||!$('app'))return;
 const st=document.createElement('style');st.id='wmCalStyles';st.textContent=`
.wmcal{background:#fff;color:#14324a;border:1px solid #d9e3ec;border-radius:16px;margin:16px 0;padding:16px;box-shadow:0 3px 15px #0000000a}.wmcal *{box-sizing:border-box}.wmcal-head{display:flex;justify-content:space-between;align-items:center;gap:9px;flex-wrap:wrap}.wmcal-head h3{margin:0;font-size:20px}.wmcal-monthnav{display:flex;align-items:center;gap:8px}.wmcal-monthnav button{min-width:34px}.wmcal button.wmcal-control{border:1px solid #b7ccdb;background:white;border-radius:9px;min-height:38px;padding:6px 11px;color:#15384b;font-weight:800}.wmcal-monthnav strong{min-width:128px;text-align:center;text-transform:capitalize}.wmcal-legend{display:flex;gap:13px;flex-wrap:wrap;margin:12px 0;font-size:12px}.wmcal-mark{width:12px;height:12px;display:inline-block;border-radius:4px;margin-right:4px;vertical-align:middle}.wmcal-mark.early{background:#bceccf}.wmcal-mark.late{background:#bfdafa}.wmcal-mark.night{background:#ffeba2}.wmcal-mark.kug{background:#fff;border:2px solid #b56c21}.wmcal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin:10px 0}.wmcal-weeklabel{text-align:center;font-size:12px;font-weight:800;color:#60748a;padding:5px 0}.wmcal-day{background:#f2f6f9;border:1px solid #dfe6ee;border-radius:9px;min-height:66px;padding:5px 3px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:2px;color:#18334a;cursor:pointer;overflow:hidden;font-size:11px}.wmcal-day strong{font-size:15px}.wmcal-day.wmcal-early{background:#cbf2d9;border-color:#86c79f}.wmcal-day.wmcal-late{background:#cde2ff;border-color:#92b9ec}.wmcal-day.wmcal-night{background:#fff0b9;border-color:#ead17b}.wmcal-day.selected{outline:3px solid #174d64;outline-offset:-2px}.wmcal-day.today strong{text-decoration:underline}.wmcal-shift{font-weight:850}.wmcal-kug{font-weight:800;font-size:10px;color:#8b3e06}.wmcal-note{font-size:9px;white-space:nowrap;color:#4d6071}.wmcal-summary{font-size:12px;color:#31536a;line-height:1.6;margin:10px 0 5px}.wmcal details{border-top:1px solid #e0e8ee;margin-top:14px}.wmcal details summary{cursor:pointer;font-weight:800;padding:14px 0}.wmcal-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wmcal-form label{font-weight:700;font-size:13px;display:flex;flex-direction:column;gap:5px}.wmcal-form input,.wmcal-form select,.wmcal-form textarea{width:100%;padding:10px;font:16px system-ui;background:#fff;color:#163649;border:1px solid #becbd6;border-radius:8px;min-width:0}.wmcal-form .full{grid-column:1/-1}.wmcal-form label.wmcal-check{display:flex;flex-direction:row;align-items:center;gap:8px}.wmcal-form input[type=checkbox]{width:19px;height:19px;flex:0 0 19px}.wmcal-weekdays{display:flex;flex-wrap:wrap;gap:10px;padding:6px 0}.wmcal-weekdays label{display:flex;align-items:center;flex-direction:row}.wmcal-weekdays input{width:19px;height:19px}.wmcal-actions{display:flex;flex-wrap:wrap;gap:9px;grid-column:1/-1}.wmcal-actions button{padding:12px 16px;border:0;border-radius:9px;background:#087d79;color:white;font-weight:800;min-height:46px}.wmcal-actions button.danger{background:#fff4f4;border:1px solid #be7b7b;color:#9a2634}.wmcal-help{font-size:12px;color:#546f84;line-height:1.6;margin:7px 0}.wmcal-message{font-size:13px;min-height:16px;font-weight:750}.wmcal-form [hidden]{display:none!important}@media(max-width:470px){.wmcal{padding:11px}.wmcal-grid{gap:3px}.wmcal-day{min-height:61px;font-size:10px;padding:4px 1px}.wmcal-day strong{font-size:13px}.wmcal-kug{font-size:9px}.wmcal-note{font-size:8px}.wmcal-form{grid-template-columns:1fr}.wmcal-form .full{grid-column:1}.wmcal-monthnav strong{min-width:110px}}
 `;document.head.appendChild(st);
 const section=document.createElement('section');section.id='wmCalRoot';section.className='wmcal';section.innerHTML=`<div class="wmcal-head"><h3>Schicht- und Kurzarbeitskalender</h3><div class="wmcal-monthnav"><button class="wmcal-control" type="button" id="wmCalPrev" aria-label="Vorheriger Monat">‹</button><strong id="wmCalMonth"></strong><button class="wmcal-control" type="button" id="wmCalNext" aria-label="Nächster Monat">›</button></div></div><div class="wmcal-legend"><span><i class="wmcal-mark early"></i>Frühschicht</span><span><i class="wmcal-mark late"></i>Spätschicht</span><span><i class="wmcal-mark night"></i>Nachtschicht</span><span><i class="wmcal-mark kug"></i>Kurzarbeit</span></div><div id="wmCalGrid" class="wmcal-grid" aria-label="Schichtkalender"></div><p id="wmCalSummary" class="wmcal-summary"></p>
<details id="wmCalEditor"><summary>Schichten, Kurzarbeit und Notizen eintragen</summary><div class="wmcal-form">
<label class="full">Eintragen für<select id="wmCalScope"><option value="one">Einzelnen Tag</option><option value="week">Ganze Woche (gewählte Wochentage)</option><option value="range">Zeitraum mit Wochentagen</option></select></label>
<label><span id="wmCalFromLabel">Datum</span><input type="date" id="wmCalFrom"></label><label id="wmCalToBox" hidden>Zeitraum bis<input type="date" id="wmCalTo"></label>
<div id="wmCalWeekdays" class="full" hidden><strong style="font-size:13px">Wochentage auswählen</strong><div class="wmcal-weekdays">${['Mo','Di','Mi','Do','Fr','Sa','So'].map((name,i)=>`<label><input type="checkbox" value="${i}" ${i<5?'checked':''}>${name}</label>`).join('')}</div></div>
<label>Schicht<select id="wmCalShift"><option value="">Keine Schicht / nur Notiz</option><option value="early">Frühschicht · grün</option><option value="late">Spätschicht · blau</option><option value="night">Nachtschicht · gelb</option></select></label>
<label class="full">Notiz<textarea id="wmCalNote" rows="2" maxlength="400" placeholder="z. B. Schichtwechsel, Arzttermin"></textarea></label>
<label class="full wmcal-check"><input id="wmCalKug" type="checkbox">Kurzarbeit an diesem Tag berücksichtigen</label>
<div class="full wmcal-form" id="wmCalKugFields" hidden><label>Arbeitsausfall (% der Sollzeit)<input id="wmCalLoss" type="number" min="1" max="100" step="1" value="100"></label><label>Geplante tägliche Sollzeit (Minuten)<input id="wmCalTarget" type="number" min="1" max="1440" step="1"></label><label>KUG-Leistungssatz<select id="wmCalChild"><option value="yes">Mit Kind (67 %)</option><option value="no">Ohne Kind (60 %)</option></select></label><label>Leistungssatz (%) · änderbar<input id="wmCalKugRate" type="number" min="0" max="100" step="0.1" value="67"></label>
<p class="wmcal-help full">100 % Arbeitsausfall = an diesem Tag keine Arbeitsleistung. 50 % = die Hälfte der geplanten Arbeitszeit fällt aus. Für die Euro-Berechnung benötigt die Lohnabrechnung das pauschalierte Soll- und Ist-Netto (oder den tatsächlichen KUG-Bescheid). Ausfallstunden sind Planung, keine automatisch erfassten Arbeitsstunden.</p></div>
<div class="wmcal-actions"><button id="wmCalSave" type="button">Eintrag speichern</button><button id="wmCalDelete" type="button" class="danger">Ausgewählte Tage löschen</button></div><div class="wmcal-message full" id="wmCalMessage" role="status" aria-live="polite"></div></div></details><p class="wmcal-help">Tippe auf ein Datum, um es zu bearbeiten. Einträge werden nur in deinem verschlüsselten Profil gespeichert. Schichtplanung erzeugt keine Stempelung und zahlt keine Stunden doppelt aus.</p>`;
 const anchor=$('wmClockHome')||dash.querySelector('.dashboard-hero');if(anchor)anchor.insertAdjacentElement('afterend',section);else dash.insertAdjacentElement('afterbegin',section);
 $('wmCalGrid').addEventListener('click',e=>{const el=e.target.closest('[data-cal-date]');if(!el)return;setFormDate(el.dataset.calDate);$('wmCalEditor').open=true;});
 $('wmCalPrev').onclick=()=>navMonths(-1);$('wmCalNext').onclick=()=>navMonths(1);
 $('wmCalScope').onchange=toggleForm;$('wmCalKug').onchange=toggleForm;
 $('wmCalChild').onchange=()=>{$('wmCalKugRate').value=$('wmCalChild').value==='yes'?'67':'60';};
 $('wmCalSave').onclick=()=>modify('save').catch(e=>showMessage('Fehler: '+e.message,true));
 $('wmCalDelete').onclick=()=>modify('delete').catch(e=>showMessage('Fehler: '+e.message,true));
 setFormDate(selected);
}
function init(){if(typeof save!=='function'||typeof state==='undefined')return;mount();currentState=state;
 if(typeof window.renderAll==='function'){const prev=window.renderAll;window.renderAll=function(...a){const r=prev.apply(this,a);if(state!==currentState){currentState=state;setTimeout(()=>{if(open()){try{render();}catch(e){console.error('WorksManager Kalender:',e);}}},0);}return r;};}
 window.addEventListener('pageshow',()=>{if(open())render();});console.info('WorksManager Schichtkalender 1.9.13 geladen');
}
if(typeof module!=='undefined'&&module.exports)module.exports={monthKug,dateSelection,addDays,validDate};
else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
