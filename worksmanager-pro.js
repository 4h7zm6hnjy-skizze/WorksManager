/* WorksManager 2.0.2 - offline professional dashboard: a non-destructive presentation layer.
 * Private records are read from the currently unlocked encrypted profile. No telemetry or remote upload.
 * Manual backups, data migrations, and payroll transactions remain in their existing tested modules.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const VERSION='2.0.2';
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>{const x=Number(String(v??'').replace(',','.'));return Number.isFinite(x)?x:0;};
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
const euro=x=>round(n(x)).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const monthNow=()=>day(new Date()).slice(0,7);
const asDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return null;const d=new Date(v+'T12:00:00');return Number.isFinite(d.valueOf())&&day(d)===v?d:null;};
const unlocked=()=>Boolean($('app')&&!$('app').classList.contains('hidden'));
let selectedMonth=monthNow(),renderPending=false;
function schedule(){if(renderPending)return;renderPending=true;queueMicrotask(()=>{renderPending=false;try{render();}catch(e){console.error('WorksManager 2.0 Anzeige:',e);}});}
function goTo(name){if(typeof go==='function')go(name);else document.querySelector(`[data-go="${name}"]`)?.click();}
function openMainCalendar(date){if(window.WMCalendar?.openDate){window.WMCalendar.openDate(date);return;}if(typeof go==='function')go('dashboard');$('wmCalRoot')?.scrollIntoView({block:'start',behavior:'smooth'});}
function monthly(){if(!unlocked()||!window.WMQuality?.inspectMonth)return null;return window.WMQuality.inspectMonth(selectedMonth);}
function workdaysInMonth(m){if(!/^\d{4}-\d{2}$/.test(m))return 0;const [y,mo]=m.split('-').map(Number),last=new Date(y,mo,0).getDate();let count=0;for(let d=1;d<=last;d++){const w=new Date(y,mo-1,d).getDay();if(w!==0&&w!==6)count++;}return count;}
function reminders(){const out=[];if(!unlocked())return out;const today=day(new Date());
 const latest=state.wmQuality?.lastBackupExportAt||state.wm195?.backupRequestedAt||'';
 const daysSince=latest?Math.floor((Date.now()-new Date(latest).getTime())/86400000):null;
 if(daysSince===null||!Number.isFinite(daysSince))out.push({kind:'backup',level:'warn',label:'Noch kein Backup-Export vermerkt',detail:'Eine verschlüsselte Sicherung auf dem Gerät prüfen und außerhalb des Browsers aufbewahren.',target:'backup'});
 else if(daysSince>=30)out.push({kind:'backup',level:'warn',label:'Backup älter als 30 Tage',detail:'Letzter angeforderter Export: '+Math.max(0,daysSince)+' Tage. Die App kann nicht kontrollieren, ob die Datei wirklich abgelegt wurde.',target:'backup'});
 const recent=(state.aus||[]).filter(a=>a&&a.to&&/^\d{4}-\d{2}-\d{2}$/.test(String(a.to)));let upcoming=0;
 for(const au of recent){const date=String(au.to);const diff=(Date.parse(date+'T12:00:00')-Date.parse(today+'T12:00:00'))/86400000;if(diff>=0&&diff<=3)upcoming++;}
 if(upcoming)out.push({kind:'au',level:'info',label:upcoming+' Krankschreibung(en) enden in den nächsten drei Tagen',detail:'Zeiträume unter Krankheit & AU prüfen. Aus medizinischen Bescheinigungen folgt nicht automatisch ein Anspruch auf Entgeltfortzahlung.',target:'sickness'});
 const q=monthly();if(q?.warnings?.length)out.push({kind:'quality',level:'warn',label:q.warnings.length+' Hinweise zu Arbeitszeiten und Fehlzeiten',detail:'Doppelte, überlappende oder ungeklärte Buchungen in der Monatsprüfung ansehen.',target:'quality'});
 const mp=state.wmPayroll?.months?.[selectedMonth],rate=n(state.wmPayroll?.profile?.hourlyRate);if(rate<=0)out.push({kind:'wage',level:'info',label:'Stundenlohn fehlt',detail:'Unter Lohn & Abrechnung aktuellen Stundenlohn festlegen.',target:'payroll'});
 if(mp?.shortEnabled&&(mp.shortNetSoll===''||mp.shortNetIst==='')&&mp.shortPaymentOverride==='')out.push({kind:'kug',level:'info',label:'Kurzarbeitergeld noch nicht amtlich beziffert',detail:'Pauschaliertes Soll-/Ist-Netto oder amtliche Auszahlung eingeben. Netto-Näherungen sind nicht die tatsächliche Leistung.',target:'payroll'});
 return out.slice(0,6);
}
function render(){if(!unlocked())return;const root=$('wmProRoot');if(!root)return;
 const q=monthly(),warn=q?.warnings?.length||0;const stamps=(state.wm20?.entries||[]).filter(x=>String(x.workDate||x.startAt||'').slice(0,7)===selectedMonth);
 const au=(state.aus||[]).filter(x=>String(x.from||x.to||'').slice(0,7)<=selectedMonth&&String(x.to||x.from||'').slice(0,7)>=selectedMonth);
 const plan=q?.plan??0,worked=q?.stamped??0,loss=q?.loss??0,paid=q?.paid??0;
 $('wmProMonth').value=selectedMonth;
 $('wmProMetrics').innerHTML=`<div><small>Geplant (erfasste Tage)</small><strong>${E(round(plan))} Std.</strong></div><div><small>Gestempelt</small><strong>${E(round(worked))} Std.</strong></div><div><small>Kurzarbeit-Ausfall</small><strong>${E(round(loss))} Std.</strong></div><div><small>Bezahlte Fehlzeit</small><strong>${E(round(paid))} Std.</strong></div>`;
 const msg=$('wmProStatus');msg.textContent=q?`${stamps.length} Stempelungen · ${au.length} AU-Belege · ${q.days.length} erfasste Kalendertage · ${warn} Prüfhinweis(e).`:'Tagesdaten nach dem Entsperren verfügbar.';
 const box=$('wmProReminders'),list=reminders();
 if(!list.length){box.innerHTML='<p class="wmpro-success">Keine aktuell erkannten Auffälligkeiten. Das ersetzt keine vollständige Prüfung.</p>';}else{
  box.innerHTML=list.map((it,i)=>`<div class="wmpro-reminder ${it.level}"><div><strong>${E(it.label)}</strong><p>${E(it.detail)}</p></div><button type="button" data-wmpro-target="${E(it.target)}" aria-label="${E(it.label)} öffnen">Prüfen</button></div>`).join('');
 }
 const year=Number(selectedMonth.slice(0,4));$('wmProTaxNote').textContent=year!==2026?`Wichtig: Die hinterlegten deutschen Steuer- und SV-Werte beziehen sich auf 2026, nicht auf ${year}. Netto- und KUG-Vorschauen für andere Jahre nicht als amtlich ansehen.`:'Lohnsteuer bleibt eine Netto-Schätzung ohne vollständigen BMF-PAP. KUG: nur mit offizieller 2026er BA-Tabelle und pauschalierten Nettoentgelten verbindlich abgleichen.';
 const footer=$('wmoUpdateFooter');if(footer){const dash=$('dashboard');if(dash&&dash.lastElementChild!==footer)dash.append(footer);}
}
function csvDownload(name,rows){const str='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');const link=document.createElement('a');const url=URL.createObjectURL(new Blob([str],{type:'text/csv;charset=utf-8'}));link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function report(){const result=monthly();if(!result)throw Error('Monatsübersicht nicht verfügbar. Profil entsperren.');
 const monthRecord=state.wmPayroll?.months?.[selectedMonth]||{},profile=state.wmPayroll?.profile||{},grossRate=window.WMCalendar?.currentRate?.()||n(profile.hourlyRate);
 const rows=[['WORKSMANAGER 2.0 – PRIVATER MONATSBERICHT'],['Monat',selectedMonth],['Wochenstunden',profile.weeklyHours||''],['Aktueller Stundenlohn',grossRate],['Kalendertage im Bericht',result.days.length],['Geplante Stunden',result.plan],['Gestempelte Stunden',result.stamped],['Kurzarbeit-Ausfallstunden',result.loss],['Bezahlte Fehlzeit-Stunden',result.paid],['Anzahl Hinweise',result.warnings.length],['Kurzarbeitergeld in der App',monthRecord.shortPaymentOverride||'Nur Schätzung, siehe Abrechnung'],[],['Datum','Schicht','Geplant Std.','Gestempelt Std.','Kurzarbeit Std.','Bezahlte Fehlzeit Std.','AU-Belege','Warnungen']];
 for(const d of result.days)rows.push([d.date,d.row?.shift||'',round(d.plan),round(d.stamped),round(d.loss),round(d.paid),d.au,d.alerts.join(' | ')]);
 rows.push([],['Hinweis','Der Export enthält private Arbeits- und ggf. Gesundheitsdaten. Nicht öffentlich auf GitHub hochladen.']);
 csvDownload(`WorksManager-2.0-Monatsbericht-${selectedMonth}-PRIVAT.csv`,rows);
 $('wmProFeedback').textContent='Privaten Monatsbericht als CSV-Download angestoßen. Bitte die Datei im Gerät sichern.';
}
async function validateFiles(){const status=$('wmProFeedback');status.textContent='Dateiintegrität wird online geprüft …';
 if(!navigator.onLine){status.textContent='Offline: Dateiintegrität kann erst wieder online mit der veröffentlichten Version verglichen werden.';return;}
 try{
  const result=await fetch('./worksmanager-integrity.json?check='+Date.now(),{cache:'no-store'});if(!result.ok)throw Error('Integritätsmanifest nicht gefunden');const info=await result.json();if(info.version!==VERSION||!info.files)throw Error('Release-Metadaten passen nicht zur App');
  const bad=[];let checked=0;
  for(const [name,expected] of Object.entries(info.files)){
   const res=await fetch('./'+name+(name.includes('?')?'&':'?')+'integrity='+Date.now(),{cache:'no-store'});
   if(!res.ok){bad.push(name+' (HTTP '+res.status+')');continue;}
   if(!crypto.subtle?.digest){throw Error('SHA-256 ist auf diesem Gerät nicht verfügbar');}
   const buf=await res.arrayBuffer(),bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',buf));const hash=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
   if(hash!==expected)bad.push(name+' (abweichender Hash)');checked++;
  }
  status.textContent=bad.length?`Vorsicht: ${bad.length} Datei(en) abweichend: ${bad.slice(0,4).join(', ')}. Bitte GitHub-Upload prüfen.`:`Integritätsprüfung erfolgreich: ${checked} veröffentlichte Dateien stimmen mit Version ${VERSION} überein.`;
 }catch(e){status.textContent='Prüfung nicht möglich: '+String(e?.message||e);}
}
function mount(){if($('wmProRoot')||!$('wmoLayout'))return;
 const st=document.createElement('style');st.id='wmProStyle';st.textContent=`
 #wmProRoot,#wmProRoot *{box-sizing:border-box}#wmProRoot{border:1px solid #c6dae2;background:#fff;border-radius:16px;padding:15px;margin:14px 0;color:#173b51;font:14px system-ui}
 #wmProRoot h3{margin:0;font-size:19px}#wmProRoot p{line-height:1.45}#wmProRoot label{font-size:13px;font-weight:700}#wmProRoot input{width:100%;min-width:0;min-height:44px;font:16px system-ui;padding:9px;border:1px solid #c2d0db;border-radius:9px;color:#173b51;background:#fff}
 .wmpro-head{display:flex;align-items:flex-start;gap:10px;justify-content:space-between;flex-wrap:wrap}.wmpro-head label{min-width:154px}
 .wmpro-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}.wmpro-metrics>div{padding:12px 9px;background:#eff7fa;border-radius:11px;min-width:0}.wmpro-metrics small{display:block;color:#456378;font-size:11px}.wmpro-metrics strong{font-size:19px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
 .wmpro-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}.wmpro-actions button{width:100%;min-height:46px;background:#eff7fa;border:1px solid #b7d3dd;border-radius:10px;color:#11475b;font-weight:750;font-size:13px;padding:8px;cursor:pointer}
 .wmpro-reminders{display:grid;gap:7px;margin:12px 0}.wmpro-reminder{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:11px;border-radius:10px;background:#fbf6ed;border:1px solid #ecd3a7}.wmpro-reminder.info{background:#eff7fd;border-color:#c1d6e9}.wmpro-reminder strong{font-size:13px}.wmpro-reminder p{margin:3px 0 0;font-size:12px;color:#4a5b6a}.wmpro-reminder button{flex-shrink:0;min-height:43px;background:#fff;border:1px solid #a8c3d3;color:#14485f;border-radius:8px;font-weight:750;padding:7px 10px}
 .wmpro-success{background:#e9f8f1;border-radius:10px;padding:12px}.wmpro-footnote{font-size:12px;color:#526b7c}.wmpro-feedback{min-height:18px;font-size:12px;line-height:1.5;color:#215771}
 #wmProRoot button:focus-visible{outline:3px solid #ed9a1a;outline-offset:2px}@media(max-width:390px){#wmProRoot{padding:11px}.wmpro-reminder{flex-wrap:wrap}.wmpro-reminder button{width:100%}}
 `;document.head.append(st);
 const box=document.createElement('section');box.id='wmProRoot';box.setAttribute('aria-label','Monatszentrale');box.innerHTML=`
 <div class="wmpro-head"><div><h3>Monatszentrale</h3><p class="wmpro-footnote">Planung, Stempeluhr und Fehlzeiten – dieselben lokalen Daten, keine zusätzliche Buchung.</p></div><label>Monat<input id="wmProMonth" type="month" aria-label="Auswertungsmonat"></label></div>
 <div class="wmpro-metrics" id="wmProMetrics" aria-live="polite"></div><p class="wmpro-footnote" id="wmProStatus"></p>
 <div class="wmpro-actions"><button id="wmProGoCalendar" type="button">Kalendertag öffnen</button><button id="wmProGoPay" type="button">Lohnabrechnung</button><button id="wmProExport" type="button">Monatsbericht CSV</button><button id="wmProVerify" type="button">Dateien online prüfen</button></div>
 <h4>Hinweise & Fristen</h4><div class="wmpro-reminders" id="wmProReminders" aria-live="polite"></div>
 <p class="wmpro-footnote" id="wmProTaxNote"></p><p id="wmProFeedback" class="wmpro-feedback" role="status"></p>`;
 const layout=$('wmoLayout'),cal=$('wmoCalendar');if(cal)cal.insertAdjacentElement('afterend',box);else layout.append(box);
 $('wmProMonth').value=selectedMonth;$('wmProMonth').onchange=e=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))return;selectedMonth=e.target.value;schedule();};
 $('wmProGoCalendar').onclick=()=>openMainCalendar(selectedMonth+'-01');$('wmProGoPay').onclick=()=>goTo('payroll');
 $('wmProExport').onclick=()=>{try{report();}catch(e){$('wmProFeedback').textContent=String(e.message||e);}};
 $('wmProVerify').onclick=()=>validateFiles();
 $('wmProReminders').onclick=e=>{const target=e.target.closest('[data-wmpro-target]')?.dataset.wmproTarget;if(!target)return;
  if(target==='quality'){$('wmoQuality').open=true;$('wmqRoot')?.scrollIntoView({block:'start',behavior:'smooth'});}else goTo(target);
 };
 schedule();
}
function init(){mount();
 if(typeof window.renderAll==='function'){const original=window.renderAll;window.renderAll=function(...args){const ret=original.apply(this,args);schedule();return ret;};}
 for(const name of ['wm-calendar-payroll-updated','wm-clock-payroll-synced','wm-payroll-rate-updated','wm-netto-updated'])document.addEventListener(name,schedule);
 window.addEventListener('pageshow',schedule);
 window.WMProfessional={refresh:schedule,reminders,month:()=>selectedMonth};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
