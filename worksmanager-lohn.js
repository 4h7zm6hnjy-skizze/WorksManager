/* WorksManager 1.9.4 – Lohnmodul (Deutschland 2026). Ergänzung zum verschlüsselten WorksManager-State.
 * KEINE Lohnabrechnungssoftware für amtliche Abrechnung. Lohnsteuer nur Näherung,
 * Ersatzleistungen nur Orientierung; alle kritischen Werte manuell überschreibbar.
 */
(() => {
 'use strict';
 const VERSION='1.9.4',BUILD=2026100807;
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const round=x=>Math.round((Number(x)+Number.EPSILON)*100)/100;
 const n=(v,d=0)=>{const x=Number(String(v??'').replace(',','.'));return Number.isFinite(x)?x:d};
 const euro=x=>(Number(x)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 const clone=x=>JSON.parse(JSON.stringify(x));
 const nowMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
 const ID=()=>crypto.randomUUID?.()||String(Date.now())+Math.random().toString(36).slice(2);
 const PROFILE={hourlyRate:0,monthlySalary:0,salaryMode:'hourly',weeklyHours:37,insuranceName:'',insuranceType:'public',taxClass:'1',childAllowance:0,childrenUnder25:0,hasChildren:true,careSaxony:false,careChildlessExtra:false,churchTaxPct:0,monthlyTaxMode:'estimate',taxFactor:1,
  healthRate:14.6,additionalHealthRate:2.9,healthEmployeeRate:'',pensionEmployeeRate:9.3,unemploymentEmployeeRate:1.3,careEmployeeRate:'',careBase:1.8,careChildless:0.6,careChildReduction:0.25,
  healthCap:5812.50,pensionCap:8450,annualWorkAllowance:1230,annualSpecialAllowance:36,monthlyTaxAllowance:0,
  monthlyDeductionFixed:0,notes:''};
 const MONTH={month:nowMonth(),hours:0,paidSickHours:0,vacationHours:0,holidayHours:0,overtimeHours:0,overtimePct:25,oneOffGross:0,oneOffTaxable:true,oneOffSV:true,
  shortEnabled:false,shortSollGross:0,shortIstGross:'',shortNetSoll:'',shortNetIst:'',shortWithChild:true,shortRateOverride:'',shortPaymentOverride:'',
  sickDays:0,sickGrossDaily:0,sickNetDaily:0,sickPercentGross:70,sickMaxNetPercent:90,sickMaxDaily:135.63,sickActualPaid:'',sickBenefitDeductions:12.4,
  childSickDays:0,childSickNetDaily:0,childSickOneOff:false,childSickMaxDaily:135.63,childSickActualPaid:'',childSickDeductions:12.4,
  incomeTaxManual:'',soliManual:'',churchManual:'',actualPayslipNet:'',taxFreeReimbursement:0,advancePaid:0,otherNetDeduction:0,privateKVEmployee:0,
  note:'',items:[]};
 const pkeys=Object.keys(PROFILE),mkeys=Object.keys(MONTH).filter(k=>k!=='items');
 const categoryNames={wage:'Steuer- und SV-pflichtiger Bezug',premium:'Zuschlag nach Stunden',custom:'Zusatzbetrag',reimbursement:'Steuerfreie Erstattung / Auszahlung',deduction:'Abzug vom Netto'};
 const helpLinks=[['Lohnsteuer/PAP 2026','https://www.bundesfinanzministerium.de/Content/DE/Downloads/Steuern/Steuerarten/Lohnsteuer/Programmablaufplan/2025-11-12-PAP-2026.html'],['Krankengeld (BMG)','https://www.bundesgesundheitsministerium.de/krankengeld/'],['Kinderkrankengeld (BMG)','https://www.bundesgesundheitsministerium.de/themen/praevention/kindergesundheit/faq-kinderkrankengeld'],['Kurzarbeitergeld (BA)','https://www.arbeitsagentur.de/arbeitslos-arbeit-finden/arbeitslosengeld/finanzielle-hilfen/kurzarbeitergeld-arbeitnehmer']];
 function store(){if(!state.wmPayroll||typeof state.wmPayroll!=='object'||Array.isArray(state.wmPayroll))state.wmPayroll={};const x=state.wmPayroll; if(!x.profile)x.profile={};if(!x.months||typeof x.months!=='object')x.months={};return x;}
 const mergedProfile=()=>({...PROFILE,...store().profile});
 const mergedMonth=k=>({...MONTH,month:k, ...(store().months[k]||{}),items:clone(store().months[k]?.items||[])});
 let draftP=null,draftM=null,curMonth=nowMonth(),results=null,dirty=false;
 function input(k,label,sec=(Object.prototype.hasOwnProperty.call(MONTH,k)?'m':'p'),type='number',step='0.01',hint=''){
  const value=sec==='p'?(draftP?.[k]??PROFILE[k]):(draftM?.[k]??MONTH[k]);
  const typ=type==='number'?'number':type==='month'?'month':'text';
  return `<label class="wmpay-field">${esc(label)}<input data-wmpay="${sec}:${k}" type="${typ}" ${typ==='number'?`step="${esc(step)}"`:''} value="${esc(value)}" ${hint?`title="${esc(hint)}"`:''}></label>`;
 }
 function select(k,label,sec,values){const value=(sec==='p'?draftP:draftM)?.[k];return `<label class="wmpay-field">${esc(label)}<select data-wmpay="${sec}:${k}">${values.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;}
 function check(k,label,sec='m'){const v=(sec==='p'?draftP:draftM)?.[k];return `<label class="wmpay-check"><input data-wmpay="${sec}:${k}" type="checkbox" ${v?'checked':''}>${esc(label)}</label>`;}
 const fig=(txt,body)=>`<details class="wmpay-group"><summary>${txt}</summary><div class="wmpay-grid">${body}</div></details>`;
 const row=(label,value,cls='')=>`<div class="wmpay-result-row ${cls}"><span>${esc(label)}</span><strong>${euro(value)}</strong></div>`;
 function draw(){
  const target=$('wmpayRoot');if(!target)return;
  target.innerHTML=`<div class="wmpay-head"><div><h3>Lohnberechnung · Deutschland 2026</h3><p>Monatliche Musterrechnung. Alles manuell anpassbar; Änderungen erst mit „Monat speichern“ übernehmen.</p></div><label class="wmpay-field">Monat<input type="month" id="wmpayMonth" value="${esc(curMonth)}"></label></div>
  <div id="wmpayClockSync" class="wmpay-warning"></div><div class="wmpay-actions"><button id="wmpayCalc">Berechnen</button><button id="wmpaySave">Monat speichern</button><button id="wmpayLoad" class="secondary">Monat laden</button><button id="wmpayImportTime" class="secondary">Arbeitsstunden übernehmen</button></div>
  <p class="wmpay-warning">Hinweis: Keine verbindliche Entgeltabrechnung. Lohnsteuer I–IV wird näherungsweise anhand des Einkommensteuertarifs modelliert, nicht nach dem vollständigen BMF-Programmablaufplan. Für Steuerklasse V/VI oder Faktorverfahren die tatsächlichen Steuerabzüge eintragen. Bei Lohnersatzleistungen die Werte deiner Krankenkasse/Arbeitsagentur eintragen.</p>
  ${fig('1 · Grunddaten, Krankenkasse und Steuern',
    input('hourlyRate','Stundenlohn (€/Std.)')+input('weeklyHours','Wochenstunden','p','number','0.1')+input('monthlySalary','Festgehalt (€)')+
    select('salaryMode','Lohnart','p',[['hourly','Stundenlohn'],['fixed','Monatsgehalt']])+input('insuranceName','Krankenkasse','p','text')+
    select('insuranceType','Versicherung','p',[['public','Gesetzlich'],['private','Privat (AN-Beitrag separat)'],['other','Anders / beitragsfrei']])+
    select('taxClass','Steuerklasse','p',[['1','I'],['2','II'],['3','III'],['4','IV'],['5','V'],['6','VI']])+
    input('childAllowance','Kinderfreibeträge (ELStAM, z. B. 1,0)','p','number','0.5')+
    input('childrenUnder25','Berücksichtigungsfähige Kinder unter 25 (PV)','p','number','1')+
    check('hasChildren','Elterneigenschaft (Pflegeversicherung)','p')+check('careChildlessExtra','Kinderlosenzuschlag anwenden','p')+
    check('careSaxony','Arbeitsort Sachsen (Pflegeversicherungsanteil)','p')+
    select('monthlyTaxMode','Lohnsteuer','p',[['estimate','Unverbindliche Näherung für I–IV'],['manual','Nur manuelle Lohnsteuer']])+
    input('taxFactor','Faktor Steuerklasse IV (nur Näherung)','p','number','0.001')+input('churchTaxPct','Kirchensteuer (% von Lohnsteuer)','p','number','0.1')+
    input('monthlyDeductionFixed','Sonstiger fester Nettoabzug (€)','p')+
    `<label class="wmpay-field wide">Allgemeine Notiz<textarea data-wmpay="p:notes" rows="2">${esc(draftP.notes)}</textarea></label>`)}
  ${fig('2 · Individuelle Sozialversicherungssätze und Grenzen',
    input('healthRate','KV allgemeiner Satz (%)')+input('additionalHealthRate','KV-Zusatzbeitrag (%) – frei einstellbar')+
    input('healthEmployeeRate','KV Arbeitnehmer-Anteil (%) – alternativ manuell','p','text')+
    input('pensionEmployeeRate','Rentenversicherung AN (%)')+input('unemploymentEmployeeRate','Arbeitslosenversicherung AN (%)')+
    input('careBase','Pflegeversicherung AN-Basis (%)')+input('careChildless','Zuschlag kinderlos AN (%)')+
    input('careChildReduction','Abschlag je weiteres Kind unter 25 (%)')+input('careEmployeeRate','Pflegeversicherung AN (%) – alternativ manuell','p','text')+
    input('healthCap','KV/PV Beitragsgrenze monatlich (€)')+input('pensionCap','RV/AV Beitragsgrenze monatlich (€)')+
    input('annualWorkAllowance','Werbungskostenpauschale jährlich (€)')+input('annualSpecialAllowance','Sonderausgabenpauschale jährlich (€)')+input('monthlyTaxAllowance','ELStAM-Freibetrag monatlich (€) – vereinfachte Näherung'))}
  ${fig('3 · Gehalt, Fehlzeiten, Überstunden und Zusatzlohn',
    input('hours','Bezahlte Arbeitsstunden')+input('paidSickHours','Lohnfortzahlung bei Krankheit (Std.)','m')+
    input('vacationHours','Bezahlte Urlaubsstunden')+input('holidayHours','Bezahlte Feiertagsstunden')+
    input('overtimeHours','Überstunden (zusätzlich vergütet)')+input('overtimePct','Überstundenzuschlag (%)','m','number','0.5')+
    input('oneOffGross','Einmalzahlung (€/Monat)')+check('oneOffTaxable','Einmalzahlung lohnsteuerpflichtig')+check('oneOffSV','Einmalzahlung SV-pflichtig')+
    input('taxFreeReimbursement','Steuerfreie Kostenerstattung (€)')+input('advancePaid','Bereits erhaltener Vorschuss (€)')+
    input('otherNetDeduction','Weitere Nettoabzüge (€)')+input('privateKVEmployee','Privater KV/PV-Eigenanteil (€), sofern hier abzuziehen')+
    `<div class="wide"><p>Die Stunden müssen zur tatsächlichen Abrechnung passen. Bei Kurzarbeit oder unbezahlter Krankheit den regulären Stundenlohn nicht zusätzlich für ausgefallene Stunden ansetzen.</p></div>`)}
  ${fig('4 · Kurzarbeit / Kurzarbeitergeld',
    check('shortEnabled','Kurzarbeit in diesem Monat berücksichtigen')+
    input('shortSollGross','Soll-Brutto ohne Kurzarbeit (€) – Referenz')+
    input('shortIstGross','Tatsächliches Ist-Brutto bei Festgehalt (€) – alternativ','m','text')+
    input('shortNetSoll','Pauschaliertes Soll-Netto (€) aus offizieller Tabelle','m','text')+
    input('shortNetIst','Pauschaliertes Ist-Netto (€) aus offizieller Tabelle','m','text')+
    check('shortWithChild','Kurzarbeitergeld mit Kind (67 % statt 60 %)')+
    input('shortRateOverride','KUG-Ersatzquote (%) – alternativ manuell','m','text')+
    input('shortPaymentOverride','Tatsächlich bewilligtes Kurzarbeitergeld (€) – alternativ manuell','m','text')+
    `<p class="wide">Kurzarbeitergeld = 60 % bzw. 67 % der Differenz der <strong>pauschalierten</strong> Soll-/Ist-Nettoentgelte, nicht einfach der Bruttodifferenz. Ohne diese oder den KUG-Betrag wird kein KUG angenommen. Sozialbeiträge für Ausfallstunden werden nicht als Arbeitnehmerabzug berücksichtigt.</p>`)}
  ${fig('5 · Krankengeld (eigene Krankheit, nach Entgeltfortzahlung)',
    input('sickDays','Krankengeld-Kalendertage')+input('sickGrossDaily','Regel-Brutto kalendertäglich (€)')+
    input('sickNetDaily','Regel-Netto kalendertäglich (€)')+input('sickPercentGross','Quote Brutto (%)','m')+
    input('sickMaxNetPercent','Maximalquote Netto (%)','m')+input('sickMaxDaily','Tageshöchstbetrag (€)')+
    input('sickBenefitDeductions','Abzug RV/AV/PV zusammen (%) – schätzweise')+
    input('sickActualPaid','Tatsächlich ausgezahltes Krankengeld (€) – alternativ','m','text')+
    `<p class="wide">Standard 70 % Brutto, höchstens 90 % Netto. Die Zahlung erfolgt typischerweise über die Krankenkasse und erscheint getrennt vom Arbeitgebernetto. Lohnfortzahlung in den ersten Wochen als regulären Bezug erfassen.</p>`)}
  ${fig('6 · Kinderkrankengeld',
    input('childSickDays','Kinderkrankentage (Leistungstage)')+input('childSickNetDaily','Entgangenes Netto je Tag (€)')+
    check('childSickOneOff','Einmalzahlungen im Vorjahr (grundsätzlich 100 % statt 90 %)')+
    input('childSickMaxDaily','Tageshöchstbetrag (€)')+input('childSickDeductions','Abzug RV/AV/PV zusammen (%) – schätzweise')+
    input('childSickActualPaid','Tatsächlich ausgezahltes Kinderkrankengeld (€) – alternativ','m','text')+
    `<p class="wide">Die Krankenkasse zahlt separat. Keine Doppelerfassung von Arbeitgeberlohn und Kinderkrankengeld für dieselben Ausfallstunden. Nicht gleichzeitig mit Kurzarbeitergeld für denselben Zeitraum anrechnen.</p>`)}
  ${fig('7 · Lohnsteuer, Solidaritätszuschlag und manuelle Abzüge',
    input('incomeTaxManual','Lohnsteuer (€) – manuell (leer = Näherung)','m','text')+
    input('soliManual','Solidaritätszuschlag (€) – manuell (leer = 0)','m','text')+
    input('churchManual','Kirchensteuer (€) – manuell (leer = %-Schätzung)','m','text')+
    input('actualPayslipNet','Netto laut echter Lohnabrechnung (€) – optional','m','text')+
    `<p class="wide">Der Kinderfreibetrag beeinflusst beim laufenden Lohnsteuerabzug normalerweise Solidaritätszuschlag/Kirchensteuer, <strong>nicht</strong> die laufende Lohnsteuer. Diese Sonderberechnung wird hier nicht amtlich nachgebildet; tatsächliche Abzüge bitte eintragen.</p>`)}
  ${fig('8 · Eigene Lohnarten und Zuschläge (beliebig viele)',`<div class="wide" id="wmpayItems"></div><div class="wide wmpay-actions"><button type="button" id="wmpayAddItem">Lohnart hinzufügen</button></div><p class="wide">Beispiele: Nachtarbeit, Sonntag, Feiertag, Sonderprämie, Fahrtkostenerstattung, Vorschuss, VWL, Sachbezug, tarifliche Zulage. Ob Zuschläge steuer-/SV-frei sind, musst du selbst je Lohnart festlegen – keine automatische rechtliche Einstufung.</p>`)}
  <div class="wmpay-notebox"><label>Monatsnotizen<textarea data-wmpay="m:note" rows="3" placeholder="Abweichungen, Tarifvertrag, besondere Schichten, Zahlungseingang …">${esc(draftM.note)}</textarea></label></div>
  <div class="wmpay-summary"><h3>Berechnung und nachvollziehbare Einzelpositionen</h3><div id="wmpayResult" aria-live="polite"></div><div class="wmpay-actions"><button id="wmpayCsv" class="secondary">Monatsabrechnung als CSV</button><button id="wmpayPrint" class="secondary">Druckansicht / PDF</button></div><p id="wmpayStatus" aria-live="polite"></p></div>
  <div class="wmpay-saved"><h3>Gespeicherte Monate</h3><div id="wmpaySavedList"></div></div>
  <p class="wmpay-note">Richtwerte beziehen sich auf Deutschland 2026. Für Tarifvereinbarungen, atypische Beschäftigungen, Einmalzahlungen, Midijobs, steuerfreie SFN-Zuschläge und Progressionsvorbehalt kann eine verbindliche Abrechnung deutlich abweichen.</p>`;
  renderItems();bindFields();refresh();renderSaved();
 }
 function bindFields(){
  $('wmpayRoot').querySelectorAll('[data-wmpay]').forEach(el=>{const [sec,key]=el.dataset.wmpay.split(':');el.addEventListener(el.type==='checkbox'?'change':'input',()=>{const dest=sec==='p'?draftP:draftM;dest[key]=el.type==='checkbox'?el.checked:el.value;dirty=true;refresh();});});
  $('wmpayCalc').onclick=()=>refresh();
  $('wmpaySave').onclick=()=>safe(saveMonth);
  $('wmpayLoad').onclick=()=>{if(dirty&&!confirm('Ungespeicherte Eingaben verwerfen und den Monat neu laden?'))return;load(curMonth);};
  $('wmpayImportTime').onclick=()=>{if(state.wm20?.autoPayroll){alert('Automatische Stempeluhr-Übernahme ist aktiv. Sie überschreibt die Lohnstunden beim Speichern. Für eine manuelle Übernahme bitte zuerst die Automatik unter Schichtplan deaktivieren.');return;}if(dirty&&!confirm('Arbeitsstunden aus dem Zeitkonto übernehmen? Die übrigen Eingaben bleiben erhalten.'))return;const rows=state.wm19?.timeRows||[],eligible=rows.filter(x=>String(x.date||'').startsWith(curMonth)); const h=eligible.reduce((total,r)=>{if(Number.isFinite(Number(r.hours)))return total+Number(r.hours);if(!r.start||!r.end)return total;const [sh,sm]=r.start.split(':').map(Number),[eh,em]=r.end.split(':').map(Number);let t=eh*60+em-sh*60-sm;if(t<0)t+=1440;return total+Math.max(0,t-Number(r.breakMinutes||0))/60;},0);draftM.hours=round(h);dirty=true;draw();notify(`${eligible.length} Arbeitszeiteinträge → ${draftM.hours} Stunden übernommen. Bitte bezahlte Fehlzeiten ergänzen.`);};
  $('wmpayMonth').onchange=e=>{const next=e.target.value;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(next))return;if(dirty&&!confirm('Ungespeicherte Eingaben verwerfen und Monat wechseln?')){e.target.value=curMonth;return;}load(next);};
  $('wmpayAddItem').onclick=()=>{draftM.items.push({id:ID(),name:'',kind:'premium',hours:0,rate:'',pct:25,amount:0,taxable:true,sv:true});dirty=true;renderItems();};
  $('wmpayCsv').onclick=()=>safe(exportCSV);
  $('wmpayPrint').onclick=()=>safe(printView);
  $('wmpaySavedList').onclick=e=>{const b=e.target.closest('[data-month]');if(!b)return; if(dirty&&!confirm('Ungespeicherte Eingaben verwerfen?'))return;load(b.dataset.month);};
 }
 function renderItems(){const el=$('wmpayItems');if(!el)return;
  el.innerHTML=draftM.items.length?draftM.items.map((it,i)=>`<div class="wmpay-line" data-line="${esc(it.id)}"><div class="wmpay-line-head"><strong>${i+1}. ${esc(it.name||'Eigene Lohnart')}</strong><button type="button" data-del="${esc(it.id)}" class="secondary">Entfernen</button></div><div class="wmpay-grid">
   <label class="wmpay-field">Beschreibung<input data-linefield="name" value="${esc(it.name)}"></label>
   <label class="wmpay-field">Art<select data-linefield="kind">${Object.entries(categoryNames).map(([k,title])=>`<option value="${k}" ${it.kind===k?'selected':''}>${esc(title)}</option>`).join('')}</select></label>
   <label class="wmpay-field">Stunden<input type="number" step="0.01" data-linefield="hours" value="${esc(it.hours)}"></label>
   <label class="wmpay-field">Stundenlohn-Basis (€; leer = Grundlohn)<input type="text" data-linefield="rate" value="${esc(it.rate)}"></label>
   <label class="wmpay-field">Zuschlag (%)<input type="number" step="0.1" data-linefield="pct" value="${esc(it.pct)}"></label>
   <label class="wmpay-field">Fester Betrag (€; falls verwendet)<input type="number" step="0.01" data-linefield="amount" value="${esc(it.amount)}"></label>
   <label class="wmpay-check"><input type="checkbox" data-linefield="taxable" ${it.taxable?'checked':''}>Lohnsteuerpflichtig</label>
   <label class="wmpay-check"><input type="checkbox" data-linefield="sv" ${it.sv?'checked':''}>SV-pflichtig</label></div></div>`).join(''):'<p>Noch keine eigenen Lohnarten. Beispiele: Nacht-, Sonn- und Feiertagszuschlag.</p>';
  el.querySelectorAll('.wmpay-line').forEach(line=>{const it=draftM.items.find(x=>x.id===line.dataset.line);line.querySelectorAll('[data-linefield]').forEach(inp=>{inp.addEventListener(inp.type==='checkbox'?'change':'input',()=>{it[inp.dataset.linefield]=inp.type==='checkbox'?inp.checked:inp.value;dirty=true;refresh();});});line.querySelector('[data-del]').onclick=()=>{draftM.items=draftM.items.filter(x=>x.id!==it.id);dirty=true;renderItems();refresh();};});
 }
 const money=x=>round(Math.max(0,Number(x)||0));
 function getCarePercent(p){if(p.careEmployeeRate!==''&&p.careEmployeeRate!=null)return n(p.careEmployeeRate);
  const under=Math.max(0,Math.floor(n(p.childrenUnder25))), base=n(p.careBase)+ (p.careSaxony?0.5:0);const surcharge=p.careChildlessExtra&&!p.hasChildren?n(p.careChildless):0;
  const reduction=p.hasChildren?Math.min(4,Math.max(0,under-1))*n(p.careChildReduction):0;
  return Math.max(0,base+surcharge-reduction);
 }
 function taxTariff2026(x){const z=Math.floor(Math.max(0,x));if(z<=12348)return 0;if(z<=17799){const y=(z-12348)/10000;return Math.floor((914.51*y+1400)*y);}if(z<=69878){const y=(z-17799)/10000;return Math.floor((173.1*y+2397)*y+1034.87);}if(z<=277825)return Math.floor(0.42*z-11135.63);return Math.floor(0.45*z-19470.38);}
 function social(p,taxBase,svBase){const s=Math.max(0,svBase),kvBase=Math.min(s,Math.max(0,n(p.healthCap))),rvBase=Math.min(s,Math.max(0,n(p.pensionCap)));
  const gkv=p.insuranceType==='public';const kvPct=gkv?(p.healthEmployeeRate===''? (n(p.healthRate)+n(p.additionalHealthRate))/2:n(p.healthEmployeeRate)):0;
  const carePct=gkv?getCarePercent(p):0;
  const rv=round(rvBase*n(p.pensionEmployeeRate)/100),av=round(rvBase*n(p.unemploymentEmployeeRate)/100),kv=round(kvBase*kvPct/100),care=round(kvBase*carePct/100);
  return {rv,av,kv,care,kvPct,carePct,total:round(rv+av+kv+care),rvBase,kvBase};
 }
 function incomeTax(p,taxable,sv){const m=String(p.taxClass);if(m==='5'||m==='6')return {value:0,manualNeeded:true};
  const annualGross=Math.max(0,(taxable-Math.max(0,n(p.monthlyTaxAllowance)))*12), annualSv=sv.total*12;
  const relief=m==='2'?4260:0;const deduction=n(p.annualWorkAllowance)+n(p.annualSpecialAllowance)+annualSv+relief;
  const annualTaxable=Math.max(0,annualGross-deduction);let annualTax=m==='3'?2*taxTariff2026(annualTaxable/2):taxTariff2026(annualTaxable);
  if(m==='4')annualTax*=Math.max(0,n(p.taxFactor,1));return {value:round(annualTax/12),annualTaxable,manualNeeded:false};
 }
 function calc(p,m){const warnings=[],lines=[];
  const rate=Math.max(0,n(p.hourlyRate)),paidHours=n(m.hours)+n(m.paidSickHours)+n(m.vacationHours)+n(m.holidayHours);
  const basic=p.salaryMode==='fixed'?(m.shortEnabled&&m.shortIstGross!==''?money(m.shortIstGross):money(p.monthlySalary)):round(rate*paidHours);
  const overtimeBase=round(rate*Math.max(0,n(m.overtimeHours))),overtimeBonus=round(overtimeBase*Math.max(0,n(m.overtimePct))/100);
  const oneOff=money(m.oneOffGross);
  lines.push({label:p.salaryMode==='fixed'?'Festgehalt':'Grundlohn / Lohnfortzahlung ('+round(paidHours)+' Std.)',amount:basic,taxable:true,sv:true});
  if(overtimeBase)lines.push({label:'Überstunden Grundlohn',amount:overtimeBase,taxable:true,sv:true});
  if(overtimeBonus)lines.push({label:`Überstundenzuschlag (${n(m.overtimePct)} %)`,amount:overtimeBonus,taxable:true,sv:true});
  if(oneOff)lines.push({label:'Einmalzahlung / Sonderzahlung',amount:oneOff,taxable:!!m.oneOffTaxable,sv:!!m.oneOffSV});
  let payouts=0,netDeduct=0;
  for(const it of m.items||[]){const kind=it.kind||'custom';const count=Math.max(0,n(it.hours));const r=it.rate===''||it.rate==null?rate:Math.max(0,n(it.rate));const amount=kind==='premium'?round(count*r*n(it.pct)/100):kind==='wage'?round(count*r):money(it.amount);if(!amount)continue;
   const label=it.name||categoryNames[kind]||'Lohnart';
   if(kind==='deduction'){netDeduct+=amount;lines.push({label,amount:-amount,payoutDeduct:true});}
   else if(kind==='reimbursement'){payouts+=amount;lines.push({label,amount,taxable:false,sv:false,reimbursement:true});}
   else lines.push({label,amount,taxable:!!it.taxable,sv:!!it.sv});
  }
  let gross=0,taxBase=0,svBase=0;
  for(const l of lines){if(l.payoutDeduct||l.reimbursement)continue;gross+=l.amount;if(l.taxable)taxBase+=l.amount;if(l.sv)svBase+=l.amount;}
  gross=round(gross);taxBase=round(taxBase);svBase=round(svBase);
  const sv=social(p,taxBase,svBase), tax=incomeTax(p,taxBase,sv);
  const manualTax=m.incomeTaxManual!==''&&m.incomeTaxManual!=null;
  let lst=manualTax?money(n(m.incomeTaxManual)):(p.monthlyTaxMode==='estimate'&&!tax.manualNeeded?tax.value:0);
  if(!manualTax&&(tax.manualNeeded||p.monthlyTaxMode==='manual'))warnings.push('Lohnsteuer nicht ermittelt: bitte den tatsächlichen Lohnsteuerbetrag eintragen. Das Ergebnis wäre sonst zu hoch.');
  if(!manualTax&&!tax.manualNeeded&&p.monthlyTaxMode==='estimate')warnings.push('Lohnsteuer lediglich grob geschätzt – kein BMF-PAP, Kinderfreibetrags- oder sonstiges ELStAM-Verfahren.');
  const soli=m.soliManual!==''?money(m.soliManual):0;
  const church=m.churchManual!==''?money(m.churchManual):round(lst*n(p.churchTaxPct)/100);
  if(m.soliManual===''&&lst>0)warnings.push('Solidaritätszuschlag standardmäßig 0 €: bei Bedarf manuellen Wert einsetzen.');
  const extraNet=money(m.taxFreeReimbursement)+payouts;
  const fixedDeduction=money(p.monthlyDeductionFixed)+money(m.otherNetDeduction)+money(m.advancePaid)+netDeduct;
  const privateKV=p.insuranceType==='private'?money(m.privateKVEmployee):0;
  if(p.insuranceType!=='public')warnings.push('Abweichende Krankenversicherung: Beiträge und Sonderregeln bitte individuell berücksichtigen.');
  const netEmployer=round(gross-sv.total-lst-soli-church+extraNet-fixedDeduction-privateKV);
  let kug=0;
  if(m.shortEnabled){if(p.salaryMode==='fixed'&&m.shortIstGross==='')warnings.push('Bei Festgehalt: tatsächliches gekürztes Ist-Brutto eintragen, sonst bleibt der volle Monatslohn stehen.');const rawQuote=m.shortRateOverride!==''?n(m.shortRateOverride):(m.shortWithChild?67:60);
   if(m.shortPaymentOverride!==''&&m.shortPaymentOverride!=null)kug=money(m.shortPaymentOverride);
   else if(m.shortNetSoll!==''&&m.shortNetIst!=='')kug=round(Math.max(0,n(m.shortNetSoll)-n(m.shortNetIst))*rawQuote/100);
   else warnings.push('Kurzarbeitergeld nicht berechnet: bitte pauschaliertes Soll-/Ist-Netto oder KUG-Betrag eintragen.');
   if(!Number.isFinite(rawQuote)||rawQuote<0||rawQuote>100)warnings.push('KUG-Quote prüfen – ungewöhnlicher Wert.');
   if(n(m.shortSollGross)>0&&n(m.shortSollGross)<gross)warnings.push('Soll-Brutto ist kleiner als berechnetes Brutto – Kurzarbeitseingaben prüfen.');
  }
  const dailyMax=money(m.sickMaxDaily),sickGrossDaily=money(m.sickGrossDaily),sickNetDaily=money(m.sickNetDaily);
  const sickGross=round(Math.min(sickGrossDaily*n(m.sickPercentGross)/100,sickNetDaily*n(m.sickMaxNetPercent)/100,dailyMax)*Math.max(0,n(m.sickDays)));
  const sickPaid=m.sickActualPaid!==''?money(m.sickActualPaid):round(sickGross*(1-n(m.sickBenefitDeductions)/100));
  const childPct=m.childSickOneOff?100:90;
  const childGross=round(Math.min(money(m.childSickNetDaily)*childPct/100,money(m.childSickMaxDaily))*Math.max(0,n(m.childSickDays)));
  const childPaid=m.childSickActualPaid!==''?money(m.childSickActualPaid):round(childGross*(1-n(m.childSickDeductions)/100));
  if(n(m.sickDays)>0&&(!sickGrossDaily||!sickNetDaily)&&m.sickActualPaid==='')warnings.push('Krankengeld ohne Tages-Brutto/-Netto: Betrag nicht aussagekräftig.');
  if(n(m.childSickDays)>0&&!n(m.childSickNetDaily)&&m.childSickActualPaid==='')warnings.push('Kinderkrankengeld ohne ausgefallenes Tages-Netto: Betrag nicht aussagekräftig.');
  if((n(m.sickDays)>0||n(m.childSickDays)>0)&&paidHours>0)warnings.push('Doppelzählung vermeiden: bezahlte Arbeits-/Entgeltfortzahlungsstunden und Kassenleistungen müssen verschiedene Zeiträume betreffen.');
  if(m.shortEnabled&&n(m.childSickDays)>0)warnings.push('Kurzarbeitergeld und Kinderkrankengeld nicht für dieselben Stunden gleichzeitig beanspruchen.');
  if(m.items?.some(x=>(x.kind==='premium'||x.kind==='custom')&&(!x.taxable||!x.sv)))warnings.push('Steuer- oder SV-freie Zuschläge sind individuell zu prüfen (§ 3b EStG / SV-Regeln).');
  const benefits=round(kug+sickPaid+childPaid),combined=round(netEmployer+benefits);
  return {lines,basic,gross,taxBase,svBase,sv,lst,soli,church,extraNet,fixedDeduction,privateKV,netEmployer,kug,sickGross,sickPaid,childGross,childPaid,benefits,combined,warnings,tax};
 }
 function refresh(){if(!$('wmpayResult')||!draftP||!draftM)return;
  results=calc(draftP,draftM);
  const r=results;
  const rows=r.lines.map(l=>row(l.label+(l.payoutDeduct?' (netto)':l.reimbursement?' (Erstattung)':` ${l.taxable?'· LSt':''}${l.sv?' · SV':''}`),l.amount)).join('');
  $('wmpayResult').innerHTML=`<div class="wmpay-breakdown">${rows}</div><hr>${row('Gesamtbrutto',r.gross,'major')}${row('Lohnsteuerpflichtiger Bezug',r.taxBase)}${row('SV-pflichtiger Bezug',r.svBase)}<hr>
  ${row(`Krankenversicherung AN (${round(r.sv.kvPct)} %)`, -r.sv.kv)}${row(`Pflegeversicherung AN (${round(r.sv.carePct)} %)`, -r.sv.care)}${row('Rentenversicherung AN',-r.sv.rv)}${row('Arbeitslosenversicherung AN',-r.sv.av)}
  ${row('Lohnsteuer',-r.lst)}${row('Solidaritätszuschlag',-r.soli)}${row('Kirchensteuer',-r.church)}
  ${r.extraNet?row('Steuerfreie Erstattungen / Auszahlungen',r.extraNet):''}${r.fixedDeduction?row('Vorschüsse und sonstige Nettoabzüge',-r.fixedDeduction):''}${r.privateKV?row('Privat-KV/PV Eigenanteil',-r.privateKV):''}
  ${row('Nettoauszahlung Arbeitgeber (Schätzung)',r.netEmployer,'net')}
  ${draftM.actualPayslipNet!==''?row('Abweichung zur echten Nettoabrechnung (Schätzung minus Ist)',round(r.netEmployer-n(draftM.actualPayslipNet))):''}
  <hr>${draftM.shortEnabled?row('Kurzarbeitergeld (gesonderte Leistung)',r.kug):''}${n(draftM.sickDays)>0||draftM.sickActualPaid!==''?row('Krankengeld / Krankenkasse (geschätzt)',r.sickPaid):''}${n(draftM.childSickDays)>0||draftM.childSickActualPaid!==''?row('Kinderkrankengeld / Krankenkasse (geschätzt)',r.childPaid):''}
  ${row('Summe Arbeitgeber + sonstige Leistungen (nur Vergleich)',r.combined,'major')}
  <p class="wmpay-warning">${r.warnings.length?r.warnings.map(x=>`• ${esc(x)}`).join('<br>'):'Näherung – mit tatsächlicher Abrechnung abgleichen.'}</p>`;
  const autoClock=!!state.wm20?.autoPayroll,clock=$('wmpayClockSync');if(clock){clock.textContent=autoClock?'Stempeluhr-Synchronisierung aktiv: Normale Stunden und Überstunden werden aus abgeschlossenen Stempelzeiten übernommen; bereits vorhandene Werte werden nicht addiert. Falls du abweichende Stunden manuell eintragen möchtest, deaktiviere die Automatik unter Schichtplan.':'Stempeluhr-Synchronisierung aus: Stunden können manuell aus dem Zeitkonto übernommen werden.';}
  const status=$('wmpayStatus');if(status)status.textContent=dirty?'Noch nicht gespeicherte Eingaben.':'Berechnung geladen; keine ausstehenden Änderungen.';
 }
 async function saveMonth(){const month=curMonth,existing=store(),before=clone(existing);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Ungültiger Monat.');
  const newP=clone(draftP),newM=clone({...draftM,month,editedAt:new Date().toISOString(),profileSnapshot:clone(draftP)});
  if(state.wm20?.autoPayroll&&typeof window.WMClockPayrollTotals==='function'){const totals=window.WMClockPayrollTotals(month);newM.hours=totals.regularHours;newM.overtimeHours=totals.overtimeHours;newM.profileSnapshot.hourlyRate=Math.max(0,Number(state.wm20.hourlyGrossRate)||0);newM.wmClockSync=true;newM.wmClockSyncedAt=new Date().toISOString();}
  for(const key of [...pkeys.map(k=>[newP,k]),...mkeys.map(k=>[newM,k])]){const [obj,k]=key;const v=obj[k];if(typeof PROFILE[k]==='number'||typeof MONTH[k]==='number'){if(!Number.isFinite(n(v)))throw Error('Ungültiger Wert: '+k);}}
  for(const it of newM.items){if(!it.id)it.id=ID();if(['reimbursement','deduction'].includes(it.kind)&&n(it.amount)<0)throw Error('Betrag darf nicht negativ sein.');}
  try{const dbstore=store();const latest=Object.keys(dbstore.months).sort().slice(-1)[0];if(!latest||month>=latest)dbstore.profile=newP;dbstore.months[month]=newM;await save('Lohnmonat und Einstellungen gespeichert');dirty=false;draftP={...PROFILE,...clone(newP)};draftM=mergedMonth(month);draw();notify('Lohnmonat '+month+' verschlüsselt gespeichert.');}
  catch(e){state.wmPayroll=before;throw e;}
 }
 function renderSaved(){const target=$('wmpaySavedList');if(!target)return;const saved=store().months;
  const keys=Object.keys(saved).filter(k=>/^\d{4}-\d{2}$/.test(k)).sort().reverse();
  if(!keys.length){target.innerHTML='<p>Noch keine Lohnmonate gespeichert.</p>';return;}
  const byYear={};for(const k of keys){const m={...MONTH,...saved[k]},p=saved[k].profileSnapshot?{...PROFILE,...saved[k].profileSnapshot}:mergedProfile(),r=calc(p,m);
    const y=k.slice(0,4),s=byYear[y]??={months:0,gross:0,net:0,kug:0,sick:0,child:0};s.months++;s.gross+=r.gross;s.net+=r.netEmployer;s.kug+=r.kug;s.sick+=r.sickPaid;s.child+=r.childPaid;}
  target.innerHTML=Object.entries(byYear).sort((a,b)=>b[0].localeCompare(a[0])).map(([y,s])=>`<p><strong>${esc(y)}:</strong> ${s.months} gespeicherte Monate · Brutto ${euro(s.gross)} · AG-Netto ${euro(s.net)} · KUG ${euro(s.kug)} · Krankengeld ${euro(s.sick)} · Kinderkrankengeld ${euro(s.child)}</p>`).join('')+
    keys.map(k=>`<button type="button" data-month="${esc(k)}" class="secondary">${esc(k)} · ${esc(saved[k]?.editedAt?.slice(0,10)||'gespeichert')}</button>`).join('');
 }
 function load(month){curMonth=month;const record=store().months[month];draftP=record?.profileSnapshot?{...PROFILE,...clone(record.profileSnapshot)}:mergedProfile();draftM=mergedMonth(month);dirty=false;draw();}
 function notify(msg){const e=$('wmpayStatus');if(e)e.textContent=msg;}
 function safe(fn){Promise.resolve().then(fn).catch(e=>{console.error('WorksManager Lohnmodul:',e);notify('Fehler: '+(e.message||e));alert('Lohnmodul: '+(e.message||e));});}
 function csvEscape(v){let x=String(v??'');return '"'+x.replace(/"/g,'""')+'"';}
 function summaryLines(){const r=results||calc(draftP,draftM);return [
  ['WorksManager',VERSION],['Monat',curMonth],['Krankenkasse',draftP.insuranceName],['Steuerklasse',draftP.taxClass],['Kinderfreibetrag',draftP.childAllowance],['Notiz',draftM.note],
  ...r.lines.map(x=>[x.label,x.amount]),['Gesamtbrutto',r.gross],['Steuerbrutto',r.taxBase],['SV-Brutto',r.svBase],['KV Arbeitnehmer',r.sv.kv],['PV Arbeitnehmer',r.sv.care],['RV Arbeitnehmer',r.sv.rv],['AV Arbeitnehmer',r.sv.av],['Lohnsteuer',r.lst],['Soli',r.soli],['Kirchensteuer',r.church],['Netto vom Arbeitgeber',r.netEmployer],['Kurzarbeitergeld',r.kug],['Krankengeld',r.sickPaid],['Kinderkrankengeld',r.childPaid],['Summe zum Vergleich',r.combined],['Warnungen',r.warnings.join(' | ')]
 ];}
 function exportCSV(){const csv='\uFEFFPosition;Wert\r\n'+summaryLines().map(([a,b])=>`${csvEscape(a)};${csvEscape(typeof b==='number'?String(b).replace('.',','):b)}`).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='WorksManager-Lohn-'+curMonth+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('CSV mit aktuellen Berechnungswerten exportiert (unverschlüsselt!).');}
 function printView(){const win=window.open('','_blank');if(!win){alert('Druckansicht blockiert. Bitte Pop-ups für diese Website zulassen oder CSV exportieren.');return;}
  const table=summaryLines().map(([a,b])=>`<tr><th>${esc(a)}</th><td>${esc(typeof b==='number'?euro(b):b)}</td></tr>`).join('');
  win.document.open();win.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>WorksManager Lohn ${esc(curMonth)}</title><style>body{font:14px Arial,sans-serif;color:#142b40;padding:25px}h1{font-size:22px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;text-align:left;padding:6px;vertical-align:top}th{width:55%}td{overflow-wrap:anywhere}p{color:#52677a;font-size:12px}</style></head><body><h1>WorksManager · Lohnübersicht ${esc(curMonth)}</h1><p>Unverbindliche Modellrechnung, keine rechtliche Entgeltabrechnung. Leistungen der Krankenkasse getrennt beachten.</p><table>${table}</table><p>Erstellt ${esc(new Date().toLocaleString('de-DE'))}. Gespeicherte Dokumente sind nicht enthalten.</p></body></html>`);win.document.close();win.focus();setTimeout(()=>win.print(),450);}
 function mount(){if($('wmpayRoot'))return;const payroll=$('payroll');if(!payroll)return;
  const style=document.createElement('style');style.id='wmpayStyle';style.textContent=`
  .wmpay{margin:18px 0 20px;padding:16px;border:1px solid var(--line,#dfe7ef);background:var(--card,#fff);border-radius:17px;color:var(--ink,#082f4c);box-shadow:0 3px 14px #00000009}
  .wmpay h3{margin:0 0 8px}.wmpay p{line-height:1.5}.wmpay-head{display:flex;gap:10px;align-items:start;justify-content:space-between;flex-wrap:wrap}.wmpay-head>.wmpay-field{min-width:150px}
  .wmpay-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:14px 0}.wmpay-field{display:flex;flex-direction:column;font-size:12px;font-weight:650;gap:5px;min-width:0}
  .wmpay input,.wmpay select,.wmpay textarea{box-sizing:border-box;border:1px solid var(--line,#dfe7ef);border-radius:9px;padding:10px 9px;max-width:100%;width:100%;background:white;color:#15344a;font:inherit;font-size:16px}
  .wmpay textarea{resize:vertical}.wmpay-check{display:flex;align-items:center;gap:10px;font-size:13px;line-height:1.3}.wmpay-check input{width:20px;height:20px;flex-shrink:0}
  .wmpay .wide{grid-column:1/-1}.wmpay-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.wmpay button{background:var(--accent2,#087d79);color:white;border:none;border-radius:9px;padding:10px 12px;font:inherit;font-weight:700;font-size:13px;cursor:pointer}
  .wmpay button.secondary{background:var(--bg,#f4f7fb);color:var(--ink,#082f4c);border:1px solid var(--line,#dfe7ef)}
  .wmpay-group{border-top:1px solid var(--line,#dfe7ef);margin-top:8px}.wmpay-group>summary{cursor:pointer;font-weight:750;padding:16px 0;list-style:revert}
  .wmpay-warning{font-size:12px;color:#874808;background:#fff8e8;border-left:3px solid #dda233;padding:11px;border-radius:7px}.wmpay-group p,.wmpay-note{font-size:12px;color:var(--muted,#6a7a8e)}
  .wmpay-notebox{padding:18px 0}.wmpay-notebox label{display:flex;flex-direction:column;gap:6px;font-weight:700}.wmpay-summary{margin-top:12px;border-top:2px solid var(--accent,#0ba39c);padding-top:16px}
  .wmpay-result-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line,#dfe7ef);padding:7px 0;font-size:13px}.wmpay-result-row span{min-width:0}.wmpay-result-row strong{flex-shrink:0;text-align:right;font-variant-numeric:tabular-nums}
  .wmpay-result-row.major,.wmpay-result-row.net{font-size:16px;font-weight:800}.wmpay-result-row.net{background:#e3f8f1;padding:12px;border-radius:8px}.wmpay-line{border:1px solid var(--line,#dfe7ef);border-radius:11px;padding:10px;margin:9px 0}.wmpay-line-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
  .wmpay-saved button{margin:4px}.wmpay hr{border:0;border-top:1px solid var(--line,#dfe7ef);margin:8px 0}
  @media(max-width:540px){.wmpay{padding:12px}.wmpay-grid{grid-template-columns:minmax(0,1fr)}.wmpay .wide{grid-column:auto}.wmpay-result-row{font-size:12px}.wmpay-head{flex-direction:column}.wmpay-actions button{flex:1 1 130px}}
  `;document.head.appendChild(style);
  const container=document.createElement('section');container.id='wmpayRoot';container.className='wmpay';payroll.appendChild(container);
  load(nowMonth());
 }
 function init(){if($('wmpayRoot'))return;if(typeof save!=='function'||typeof state==='undefined')return;
  mount();
  document.addEventListener('wm-clock-payroll-synced',ev=>{if(ev.detail?.month!==curMonth||!$('wmpayRoot'))return;if(dirty){notify('Stempeluhr wurde synchronisiert. Ungespeicherte Lohnänderungen erst speichern oder Monat erneut laden.');return;}load(curMonth);});
  // Beim Entsperren ersetzt WorksManager den globalen State durch den entschlüsselten Inhalt.
  // Ohne Reload würden alte/leere Entwürfe beim ersten Speichern vorhandene Monatsdaten überschreiben.
  let stateRef=state;
  if(typeof window.renderAll==='function'){
    const renderBase=window.renderAll;
    window.renderAll=function(...args){
      const changed=state!==stateRef;const outcome=renderBase.apply(this,args);
      if(changed){stateRef=state;setTimeout(()=>{if($('wmpayRoot'))load(curMonth);},0);}
      return outcome;
    };
  }
  window.addEventListener('pageshow',()=>{if(!$('wmpayRoot')&&$('payroll'))mount();});
  console.info('WorksManager Lohnmodul '+VERSION+' geladen');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 // Nur für automatisierte Regressionstests, keine UI-Funktion.
 if(typeof module!=='undefined'&&module.exports)module.exports={calc,taxTariff2026,social,getCarePercent,PROFILE,MONTH};
})();
