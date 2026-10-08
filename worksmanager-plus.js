/* WorksManager-Erweiterungen 1.0 — ergänzende Oberfläche, ohne Datenbankmigration.
   Einbindung nach app.js (über die Offline-Service-Worker-Navigation).
   Benötigt die bestehenden globalen Funktionen der WorksManager-App v1.8.4.
*/
(() => {
  'use strict';
  const PLUS_VERSION = '1.9.2';
  const RELEASE_BUILD = 2026100805;
  let advertisedBuild = RELEASE_BUILD;
  let availableRelease = null;
  let updateReady = false;
  const METADATA_KEY = 'worksmanager_plus_backup_export_1'; // Ausschließlich Export-Zeitpunkt, keine Dokumentdaten.
  const REQUIRED = ['renderAll','save','go','vacationDaysForRecords','vacationWorkdayDetails','nrwHolidays','isoDayNumber','monthBounds','yearBounds','dbGet','dbFileEntries','referencedFileKeys','lock','exportBackup'];
  const $p = id => document.getElementById(id);
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = n => Number(n||0).toLocaleString('de-DE');
  const formatDate = s => {const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleDateString('de-DE'):'—';};
  const todayIso = () => {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  const yearNow = () => new Date().getFullYear();
  const locked = () => {const app=$p('app');return !app || app.classList.contains('hidden');};
  const getPrefs = () => {
    const raw=(typeof state!=='undefined'&&state?.worksPlus&&typeof state.worksPlus==='object'&& !Array.isArray(state.worksPlus))?state.worksPlus:{};
    return raw;
  };
  const entitlements = year => getPrefs().vacation?.[String(year)] || null;
  const cyclePrefs = () => getPrefs().shiftCycle || null;
  const idleMinutes = () => {
    const n=Number(getPrefs().idleMinutes);
    return [0,5,15,30,60].includes(n)?n:15;
  };
  function prefsUpdate(patch) {
    // Die Erweiterungs-Einstellungen werden Teil des bereits verschlüsselten states.
    state.worksPlus={...getPrefs(),...patch};
    return save('Einstellung gespeichert');
  }
  const query = (selector,root=document) => root.querySelector(selector);
  const UI_STYLE = `
  .wmplus-card{margin-top:14px;border:1px solid var(--line,#dfe7ef);border-radius:16px;background:var(--card,#fff);padding:16px;box-shadow:var(--shadow,0 3px 12px #0001)}
  .wmplus-card h3{margin:0 0 10px;font-size:17px;color:var(--ink,#082f4c)}
  .wmplus-card p{font-size:13px;color:var(--muted,#6a7a8e);margin:7px 0}
  .wmplus-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .wmplus-field{display:block;font-size:12px;font-weight:700;color:var(--ink,#082f4c)}
  .wmplus-field input,.wmplus-field select{margin-top:5px;width:100%;min-width:0;padding:11px 9px;font:inherit;font-size:16px;border-radius:9px;border:1px solid var(--line,#dfe7ef);background:#fff;color:#082f4c}
  .wmplus-buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .wmplus-btn{padding:11px 13px;border-radius:10px;border:1px solid var(--line,#dfe7ef);background:var(--accent,#087d79);color:#fff;font:inherit;font-weight:700;cursor:pointer}
  .wmplus-btn.secondary{background:#fff;color:var(--ink,#082f4c)}
  .wmplus-summary{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
  .wmplus-metric{background:var(--bg,#f4f7fb);border-radius:10px;padding:10px;flex:1 1 90px;min-width:0}
  .wmplus-metric strong{display:block;font-size:21px;color:var(--ink,#082f4c)}
  .wmplus-metric small{display:block;color:var(--muted,#6a7a8e);font-size:11px}
  .wmplus-state{font-size:12px;white-space:normal;overflow-wrap:anywhere}
  .wmplus-list{max-height:320px;overflow:auto;margin-top:8px}
  .wmplus-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line,#dfe7ef)}
  .wmplus-row div{min-width:0;overflow-wrap:anywhere;font-size:13px}
  .wmplus-row small{display:block;color:var(--muted,#6a7a8e)}
  .wmplus-update-bar{border:1px solid var(--line,#dfe7ef);background:var(--card,#fff);border-radius:14px;padding:10px 12px;margin:12px 0;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;box-shadow:var(--shadow,0 3px 12px #0001)}
  .wmplus-update-bar strong{font-size:13px;color:var(--ink,#082f4c)}
  .wmplus-update-bar small{font-size:11px;color:var(--muted,#6a7a8e)}
  .wmplus-update-banner[hidden]{display:none!important}
  .wmplus-update-banner{position:sticky;top:0;z-index:70;border:2px solid #dc921c;border-radius:12px;background:#fff8e9;color:#5a3606;padding:12px;margin:10px 0}
  .wmplus-banner{border-left:4px solid var(--accent,#087d79);background:var(--bg,#f4f7fb);padding:10px;border-radius:8px;margin:8px 0;font-size:13px}
  .wmplus-alert{border-left-color:#b91c1c}
  @media(max-width:380px){.wmplus-grid{grid-template-columns:1fr}}
  `;
  function card(id,title,body){return `<div id="${id}" class="wmplus-card"><h3>${escapeHtml(title)}</h3>${body}</div>`;}
  function field(label,id,type,value='',extra=''){
    return `<label class="wmplus-field">${escapeHtml(label)}<input id="${id}" type="${type}" value="${escapeHtml(value)}" ${extra}></label>`;
  }
  function button(label,id,secondary=false){return `<button type="button" id="${id}" class="wmplus-btn${secondary?' secondary':''}">${escapeHtml(label)}</button>`;}
  function note(id){return `<p id="${id}" class="wmplus-state" aria-live="polite"></p>`;}
  function setNote(id,text){const el=$p(id);if(el)el.textContent=text;}
  function safeAction(fn){return async (...args)=>{try{await fn(...args);}catch(e){console.error('WorksManager-Erweiterung:',e);setNote('wmplusBackupInfo','Aktion fehlgeschlagen: '+(e?.message||e));alert('Aktion fehlgeschlagen: '+(e?.message||e));}};}
  function addCards(){
    const dash=$p('dashboard');
    if(dash && !$p('wmplusUpdateBar')){
      const bar=document.createElement('div');
      bar.id='wmplusUpdateBar';bar.className='wmplus-update-bar';
      bar.innerHTML='<div><strong>App-Updates</strong><br><small>WorksManager 1.9.2</small><div id="wmplusQuickUpdateState" class="wmplus-state" aria-live="polite"></div></div><button type="button" id="wmplusQuickUpdateCheck" class="wmplus-btn secondary">Updates suchen</button>';
      const hero=dash.querySelector('.dashboard-hero');
      if(hero)hero.insertAdjacentElement('afterend',bar);else dash.insertAdjacentElement('afterbegin',bar);
      const banner=document.createElement('div');banner.id='wmplusUpdateBanner';banner.className='wmplus-update-banner';banner.hidden=true;
      banner.innerHTML='<strong id="wmplusUpdateTitle">Update verfügbar</strong><p id="wmplusUpdateText"></p><button id="wmplusInstallUpdate" type="button" class="wmplus-btn">Jetzt aktualisieren</button>';
      bar.insertAdjacentElement('afterend',banner);
    }
    if(dash && !$p('wmplusSearch')) dash.insertAdjacentHTML('beforeend',card('wmplusSearch','Dokumente und Einträge suchen',
      `<p>Suche nach Namen, Zeitraum, Jahr, Titel und Dateinamen. Keine Texterkennung oder Cloud-Suche.</p><label class="wmplus-field">Suchbegriff<input id="wmplusSearchInput" type="search" placeholder="z. B. 2026, Krankschreibung, Abrechnung"></label><div id="wmplusSearchResults" class="wmplus-list"></div>`));
    if(dash && !$p('wmplusStatus')) dash.insertAdjacentHTML('beforeend',card('wmplusStatus','App-Status',
      `<div class="wmplus-summary"><div class="wmplus-metric"><strong id="wmplusConnection">—</strong><small>Verbindung</small></div><div class="wmplus-metric"><strong id="wmplusCached">—</strong><small>Offline-Vorbereitung</small></div></div>`+note('wmplusUpdateInfo')+
      `<div class="wmplus-buttons">${button('Updates suchen','wmplusCheckUpdate',true)}</div>`));
    const backup=$p('backup');const danger=backup?.querySelector('.danger-zone');
    if(backup && !$p('wmplusBackup')){
      const html=card('wmplusBackup','Datensicherung und Gerätespeicher',
        `<p>Das Backup bleibt verschlüsselt. Erstelle regelmäßig eine Datei und bewahre sie außerhalb des Browsers auf.</p><div class="wmplus-banner" id="wmplusReminder"></div>${note('wmplusBackupInfo')}`+
        `<div class="wmplus-buttons">${button('Backup prüfen','wmplusVerifyBackup')}${button('Speicher prüfen','wmplusCheckStorage',true)}${button('Dauerhaften Speicher anfragen','wmplusPersistStorage',true)}</div>`+
        `${note('wmplusStorageInfo')}<p>Browser-Speicherangaben können weitere Daten derselben Website enthalten. Dauerhafte Speicherung kann vom iPhone abgelehnt werden.</p>`+
        `<div class="wmplus-grid"><label class="wmplus-field">Automatische Sperre<select id="wmplusIdle"><option value="0">Aus</option><option value="5">Nach 5 Minuten</option><option value="15">Nach 15 Minuten</option><option value="30">Nach 30 Minuten</option><option value="60">Nach 60 Minuten</option></select></label></div><div class="wmplus-buttons">${button('Sperre speichern','wmplusSaveIdle',true)}</div>`);
      if(danger)danger.insertAdjacentHTML('beforebegin',html);else backup.insertAdjacentHTML('beforeend',html);
    }
    const vacation=$p('vacation');if(vacation && !$p('wmplusVacation'))vacation.insertAdjacentHTML('beforeend',card('wmplusVacation','Urlaubsanspruch und Resturlaub',
      `<p>Zusatzrechnung für Montag–Freitag ohne gesetzliche Feiertage NRW; die bisherige Urlaubserfassung bleibt unverändert.</p>`+
      `<div class="wmplus-grid">${field('Kalenderjahr','wmplusVacYear','number',yearNow(),'min="2000" max="2100"')}${field('Jahresanspruch in Tagen','wmplusVacAnnual','number','','min="0" max="365" step="1"')}${field('Übertrag aus Vorjahr','wmplusVacCarry','number','0','min="0" max="365" step="1"')}</div>`+
      `<div class="wmplus-buttons">${button('Anspruch speichern','wmplusSaveVacation')}</div><div id="wmplusVacationSummary" class="wmplus-summary"></div>`));
    const sickness=$p('sickness');if(sickness && !$p('wmplusSick'))sickness.insertAdjacentHTML('beforeend',card('wmplusSick','Zusätzliche AU-Arbeitstagsauswertung',
      `<p>Diese Berechnung zählt Mo–Fr ohne NRW-Feiertage, ohne doppelte Tage bei Überschneidungen. Schichtarbeit an Wochenenden ist hierbei nicht berücksichtigt.</p>`+
      `<div id="wmplusSickSummary" class="wmplus-summary"></div>`));
    const shift=$p('shift');if(shift && !$p('wmplusShift'))shift.insertAdjacentHTML('beforeend',card('wmplusShift','Optionaler 3-Schicht-Rhythmus',
      `<p>Annahme: wöchentlicher Wechsel Früh → Spät → Nacht, Montag–Freitag. Die vorhandenen Schichten bleiben erhalten und werden nicht überschrieben.</p>`+
      `<div class="wmplus-grid">${field('Referenz-Montag','wmplusShiftAnchor','date',thisMonday())}<label class="wmplus-field">Schicht dieser Woche<select id="wmplusShiftFirst"><option value="0">Früh</option><option value="1">Spät</option><option value="2">Nacht</option></select></label>${field('Planbeginn','wmplusShiftFrom','date',todayIso())}<label class="wmplus-field">Zeitraum<select id="wmplusShiftWeeks"><option value="4">4 Wochen</option><option value="8" selected>8 Wochen</option><option value="12">12 Wochen</option></select></label></div>`+
      `<div class="wmplus-buttons">${button('Vorschau anzeigen','wmplusPreviewShift',true)}${button('Schichten übernehmen','wmplusAddShift')}</div>`+
      `<div id="wmplusShiftPreview" class="wmplus-list"></div>${note('wmplusShiftNote')}`));
  }
  function thisMonday(){const d=new Date();const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
  const navSection={company:'company',shifts:'shift',meetings:'meetings',notices:'notices',documents:'payroll',aus:'sickness',vacations:'vacation',childSick:'family',rehabs:'rehab',stairs:'stairs'};
  const typeLabels={company:'Firma/Vertrag',shifts:'Schicht',meetings:'Gespräch',notices:'Aushang',documents:'Abrechnung',aus:'Krankschreibung',vacations:'Urlaub',childSick:'Kind krank',rehabs:'Reha',stairs:'Treppen'};
  function textContentOf(record){
    if(!record||typeof record!=='object')return '';
    const vals=[];
    for(const [key,value] of Object.entries(record)){
      if(key==='cipher'||key==='iv'||key==='data'||key==='blob')continue;
      if(typeof value==='string'||typeof value==='number')vals.push(String(value));
      if(key==='files'&&Array.isArray(value))for(const f of value)vals.push(String(f?.name||''));
    }
    return vals.join(' ');
  }
  function results(){
    const q=$p('wmplusSearchInput')?.value.trim().toLocaleLowerCase('de-DE')||'';
    const target=$p('wmplusSearchResults');if(!target)return;
    if(!q){target.innerHTML='<p>Suchbegriff eingeben.</p>';return;}
    const items=[];
    for(const [section,nav]of Object.entries(navSection)){
      const arr=section==='company'?[state.company]:state[section];
      for(const entry of Array.isArray(arr)?arr:[]){
        const str=textContentOf(entry);if(!str.toLocaleLowerCase('de-DE').includes(q))continue;
        const date=String(entry?.date||entry?.from||entry?.month||entry?.createdAt||'');
        const fileCount=Array.isArray(entry?.files)?entry.files.length:0;
        const title=(entry?.title||entry?.name||entry?.shift||entry?.clinic||entry?.child||entry?.type||typeLabels[section]);
        items.push({nav,date,label:typeLabels[section]||section,title:String(title),count:fileCount});
      }
    }
    const more=state.attachments||{};
    for(const [sec,arr]of Object.entries(more))for(const entry of Array.isArray(arr)?arr:[]){
      if(textContentOf(entry).toLocaleLowerCase('de-DE').includes(q))items.push({nav:({shift:'shift',family:'family',rehab:'rehab',company:'company',meetings:'meetings',notices:'notices'}[sec]||'company'),date:String(entry?.createdAt||''),label:'Anhang',title:String(entry?.title||entry?.name||sec),count:0});
    }
    items.sort((a,b)=>b.date.localeCompare(a.date));
    target.innerHTML=!items.length?'<p>Keine passenden Einträge gefunden.</p>':
      items.slice(0,75).map(x=>`<div class="wmplus-row"><div><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.label)} · ${escapeHtml(x.date.slice(0,10))}${x.count?' · '+x.count+' Datei(en)':''}</small></div><button type="button" class="wmplus-btn secondary" data-wmplus-nav="${escapeHtml(x.nav)}">Öffnen</button></div>`).join('')+(items.length>75?`<p>Weitere ${items.length-75} Treffer: Suche verfeinern.</p>`:'');
  }
  function metric(v,label){return `<div class="wmplus-metric"><strong>${escapeHtml(v)}</strong><small>${escapeHtml(label)}</small></div>`;}
  function refreshVacation(){
    const y=Number($p('wmplusVacYear')?.value||yearNow());if(y<2000||y>2100)return;
    const v=entitlements(y);const annual=$p('wmplusVacAnnual'),carry=$p('wmplusVacCarry');
    if(document.activeElement!==annual&&annual)annual.value=v?.annual??'';
    if(document.activeElement!==carry&&carry)carry.value=v?.carry??0;
    const taken=vacationDaysForRecords(state.vacations||[],`${y}-01-01`,`${y}-12-31`);
    const el=$p('wmplusVacationSummary');if(!el)return;
    el.innerHTML=metric(number(taken),'Erfasste Urlaubstage')+(v?metric(number(Number(v.annual)+Number(v.carry)-taken),'Restanspruch (berechnet)')+metric(number(Number(v.annual)+Number(v.carry)),'Anspruch inkl. Übertrag'):'<p>Bitte zunächst den Urlaubsanspruch eintragen.</p>');
  }
  async function saveVacationSettings(){
    const y=Number($p('wmplusVacYear').value),annual=Number($p('wmplusVacAnnual').value),carry=Number($p('wmplusVacCarry').value||0);
    if(!Number.isInteger(y)||y<2000||y>2100||!$p('wmplusVacAnnual').value||!Number.isInteger(annual)||annual<0||annual>365||!Number.isInteger(carry)||carry<0||carry>365)throw new Error('Bitte gültiges Jahr und Urlaubstage eintragen.');
    await prefsUpdate({vacation:{...(getPrefs().vacation||{}),[String(y)]:{annual,carry}}});refreshVacation();
  }
  function workdaysInRange(items,from,to){
    const days=new Set();for(const item of items||[]){
      const a=String(item?.from||item?.to||'').slice(0,10),b=String(item?.to||item?.from||'').slice(0,10);
      if(!a||!b)continue;for(const date of vacationWorkdayDetails(a,b,from,to).dates)days.add(date);
    }return days.size;
  }
  function refreshSick(){
    const m=$p('auStatsMonth')?.value || todayIso().slice(0,7),y=$p('auStatsYear')?.value||String(yearNow());
    const mb=monthBounds(m),yb=yearBounds(y),el=$p('wmplusSickSummary');if(!el)return;
    el.innerHTML=metric(mb?number(workdaysInRange(state.aus,mb.start,mb.end)):'—','Arbeitstage im gewählten Monat')+metric(yb?number(workdaysInRange(state.aus,yb.start,yb.end)):'—','Arbeitstage im gewählten Jahr');
  }
  const SHIFT_LABELS=['Früh','Spät','Nacht'];
  const TIMES=[['05:45','13:45'],['13:45','21:45'],['21:45','05:45']];
  function shiftPlan(){
    const anchor=$p('wmplusShiftAnchor').value,from=$p('wmplusShiftFrom').value,index=Number($p('wmplusShiftFirst').value),weeks=Number($p('wmplusShiftWeeks').value);
    const a=isoDayNumber(anchor),f=isoDayNumber(from);
    if(a===null||f===null||new Date(a*86400000).getUTCDay()!==1||![0,1,2].includes(index)||![4,8,12].includes(weeks))throw new Error('Referenzdatum muss ein Montag sein.');
    const entries=[];
    for(let day=f;day<f+weeks*7;day++){
      const dt=new Date(day*86400000),dow=dt.getUTCDay();if(dow===0||dow===6)continue;
      const week=Math.floor((day-a)/7);const shift=(index+((week%3)+3)%3)%3;
      const date=dt.toISOString().slice(0,10);
      entries.push({date,shift:SHIFT_LABELS[shift],start:TIMES[shift][0],end:TIMES[shift][1]});
    }return entries;
  }
  function previewShifts(){
    const plan=shiftPlan(),existing=new Set((state.shifts||[]).map(x=>x.date));
    const count=plan.filter(x=>!existing.has(x.date)).length,el=$p('wmplusShiftPreview');
    el.innerHTML=`<p>${count} neue Werktage, ${plan.length-count} bereits verplant. Vorschau der ersten 10:</p>`+
      plan.slice(0,10).map(x=>`<div class="wmplus-row"><div>${escapeHtml(x.date)} · ${escapeHtml(x.shift)} <small>${x.start}–${x.end}${existing.has(x.date)?' · schon vorhanden':''}</small></div></div>`).join('');
    return {plan,count};
  }
  async function addShifts(){
    const {plan,count}=previewShifts();if(!count){setNote('wmplusShiftNote','Keine neuen Schichten zu übernehmen.');return;}
    if(!confirm(`${count} neue Schichten hinzufügen? Bestehende Einträge werden nicht überschrieben.`))return;
    const prev=[...state.shifts],existing=new Set(prev.map(s=>s.date));
    const added=plan.filter(x=>!existing.has(x.date)).map(x=>({id:id(),...x,note:'Automatischer Drei-Wochen-Rhythmus (prüfen)',createdAt:now()}));
    state.shifts.push(...added);
    try{await save(`${added.length} Schichten gespeichert`);setNote('wmplusShiftNote',`${added.length} Schichten hinzugefügt. Wochenenden wurden ausgelassen.`);}
    catch(e){state.shifts=prev;throw e;}
  }
  function backupDate(){try{return localStorage.getItem(METADATA_KEY)||'';}catch{return '';}}
  function refreshBackup(){
    const last=backupDate(),el=$p('wmplusReminder');if(!el)return;
    if(!last){el.textContent='Seit Installation dieser Erweiterung wurde noch kein Backup-Export registriert. Bitte jetzt ein vollständiges Backup erstellen.';el.classList.add('wmplus-alert');return;}
    const days=Math.floor((Date.now()-new Date(last).getTime())/86400000);
    el.classList.toggle('wmplus-alert',days>=30);
    el.textContent=`Letzter gestarteter Backup-Export: ${formatDate(last)}. ${days>=30?'Ein neues Monatsbackup wird empfohlen.':'Nächste Erinnerung nach 30 Tagen.'} Bitte prüfen, ob die Datei wirklich in „Dateien“ gespeichert wurde.`;
  }
  async function backupCheck(){
    const payload=await dbGet('payload'),salt=await dbGet('salt'),files=await dbFileEntries();
    const required=referencedFileKeys(state),actual=new Set(files.map(([key])=>key));
    const missing=[...required].filter(k=>!actual.has(k));
    setNote('wmplusBackupInfo',!payload||!salt?'Verschlüsselte App-Daten fehlen. Bitte Datensicherung überprüfen.':
      missing.length?`Prüfung: ${missing.length} referenzierte Datei(en) fehlen. Backup kann unvollständig sein.`:
      `Lokale Datenbank erreichbar. ${required.size} referenzierte Dateien vorhanden. Kein vollständiger Wiederherstellungstest; ein externes Backup wird trotzdem benötigt.`);
  }
  async function storageCheck(){
    if(!navigator.storage?.estimate){setNote('wmplusStorageInfo','Dein Browser stellt keine Speicherschätzung bereit.');return;}
    const estimate=await navigator.storage.estimate(),mb=x=>(Number(x||0)/1048576).toLocaleString('de-DE',{maximumFractionDigits:1})+' MB';
    const persistent=navigator.storage.persisted?await navigator.storage.persisted().catch(()=>null):null;
    setNote('wmplusStorageInfo',`Browser-Speicher: ${mb(estimate.usage)} belegt${estimate.quota?' von ungefähr '+mb(estimate.quota):''}. Dauerhafter Speicher: ${persistent===true?'zugelassen':persistent===false?'nicht zugesichert':'unbekannt'}.`);
  }
  async function persistentStorage(){
    if(!navigator.storage?.persist){setNote('wmplusStorageInfo','Der Browser unterstützt diese Speicheranfrage nicht.');return;}
    const ok=await navigator.storage.persist();setNote('wmplusStorageInfo',ok?'Dauerhafte Speicherung wurde vom Browser zugesichert. Ein externes Backup bleibt notwendig.':'Dauerhafte Speicherung wurde nicht zugesichert. Daten bitte regelmäßig extern sichern.');
  }
  async function checkOffline(){
    const net=$p('wmplusConnection'),offline=$p('wmplusCached');if(net)net.textContent=navigator.onLine?'Online':'Offline';
    if(!offline)return;
    if(!('serviceWorker' in navigator)||!('caches' in window)){offline.textContent='Nicht verfügbar';return;}
    try{
      const names=(await caches.keys()).filter(k=>k.startsWith('worksmanager-v'));
      let ready=false;
      for(const key of names){
        const c=await caches.open(key),all=await Promise.all(['./index.html','./app.js?v=1.8.4','./styles.css?v=1.8.4','./worksmanager-plus.js?v=1.9.2','./worksmanager-19.js?v=1.9.1','./worksmanager-lohn.js?v=1.9.1','./worksmanager-profiles.js?v=1.9.2','./worksmanager-uhr.js?v=1.9.2','./worksmanager-release.json'].map(url=>c.match(url)));
        if(all.every(Boolean)){ready=true;break;}
      }
      offline.textContent=ready?'Bereit':'Noch nicht vollständig';
    }catch(e){offline.textContent='Unbekannt';}
  }
  function setUpdateMessage(msg){setNote('wmplusUpdateInfo',msg);setNote('wmplusQuickUpdateState',msg);}
  function offerUpdate(release,waiting=false){
    updateReady=true;
    if(release && release.build>advertisedBuild)advertisedBuild=release.build;
    if(release)availableRelease=release;
    const banner=$p('wmplusUpdateBanner');if(!banner)return;
    banner.hidden=false;
    setNote('wmplusUpdateTitle','Update verfügbar');
    setNote('wmplusUpdateText',release?.version?`Neue Version ${release.version} ist verfügbar. Deine gespeicherten Daten werden beim Aktualisieren nicht bewusst gelöscht.`:waiting?'Ein aktualisierter Offline-Dienst wartet auf Aktivierung.':'Neue Programmdateien sind verfügbar.');
    setUpdateMessage(release?.version?`Update verfügbar: ${release.version}`:'Offline-Update verfügbar');
  }
  async function checkUpdates(manual=true){
    if(!navigator.onLine){setUpdateMessage('Offline: Updates können nur mit Internet gesucht werden.');return;}
    setUpdateMessage('Suche nach Updates ...');
    let release=null,reg=null;
    try{
      const r=await fetch('./worksmanager-release.json?check='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error(`Versionsdatei nicht abrufbar (HTTP ${r.status})`);
      release=await r.json();
      if(release?.app!=='WorksManager'||!Number.isSafeInteger(release.build))throw new Error('Versionsdatei ungültig');
      if(release.build>RELEASE_BUILD){offerUpdate(release);return;}
      if('serviceWorker' in navigator){
        reg=await navigator.serviceWorker.getRegistration('./');
        if(reg){await reg.update();if(reg.waiting){offerUpdate(release,true);return;}}
      }
      if(!updateReady){
        const msg=`Aktuell: WorksManager 1.9.2 (Stand ${RELEASE_BUILD}). Kein neueres Update gemeldet.`;
        setUpdateMessage(msg);
        const banner=$p('wmplusUpdateBanner');if(banner)banner.hidden=true;
      }
    }catch(e){
      setUpdateMessage(`Updateprüfung fehlgeschlagen: ${e?.message||e}. Bitte Internetverbindung kontrollieren.`);
      if(manual)console.warn('WorksManager Updateprüfung:',e);
    }
    await checkOffline();
  }
  async function installUpdate(){
    if(!navigator.onLine){setUpdateMessage('Bitte zum Aktualisieren eine Internetverbindung herstellen.');return;}
    if(!updateReady){await checkUpdates(true);if(!updateReady)return;}
    setUpdateMessage('Update wird vorbereitet ...');
    try{
      let reg='serviceWorker' in navigator?await navigator.serviceWorker.getRegistration('./'):null;
      if(reg)await reg.update();
      let reloading=false;
      const reload=()=>{if(reloading)return;reloading=true;const url=new URL(location.href);url.searchParams.set('wm-update',String(availableRelease?.build||Date.now()));location.replace(url.toString());};
      if(reg?.waiting){
        navigator.serviceWorker?.addEventListener('controllerchange',reload,{once:true});
        reg.waiting.postMessage({type:'SKIP_WAITING'});
        setTimeout(reload,3000);
        return;
      }
      // Bei neuer Serverversion wird bei Navigation die geänderte HTML-Datei abgerufen.
      reload();
    }catch(e){setUpdateMessage(`Aktualisierung fehlgeschlagen: ${e?.message||e}`);}
  }
  let lastActivity=Date.now(),timer=null;
  function noteActivity(){lastActivity=Date.now();}
  function armIdle(){
    if(timer)clearInterval(timer);
    timer=setInterval(()=>{
      if(locked())return;
      const minutes=idleMinutes();if(minutes>0 && Date.now()-lastActivity>=minutes*60000){
        try{lock();}catch(e){console.warn('Automatische Sperre',e);}lastActivity=Date.now();
      }
    },15000);
  }
  function bindPlus(){
    $p('wmplusSearchInput')?.addEventListener('input',results);
    $p('wmplusSearchResults')?.addEventListener('click',e=>{const b=e.target.closest('[data-wmplus-nav]');if(b)go(b.dataset.wmplusNav);});
    $p('wmplusCheckUpdate')?.addEventListener('click',safeAction(()=>checkUpdates(true)));
    $p('wmplusQuickUpdateCheck')?.addEventListener('click',safeAction(()=>checkUpdates(true)));
    $p('wmplusInstallUpdate')?.addEventListener('click',safeAction(installUpdate));
    $p('wmplusVerifyBackup')?.addEventListener('click',safeAction(backupCheck));
    $p('wmplusCheckStorage')?.addEventListener('click',safeAction(storageCheck));
    $p('wmplusPersistStorage')?.addEventListener('click',safeAction(persistentStorage));
    $p('wmplusIdle')?.addEventListener('change',()=>{});
    $p('wmplusSaveIdle')?.addEventListener('click',safeAction(async()=>{await prefsUpdate({idleMinutes:Number($p('wmplusIdle').value)});lastActivity=Date.now();}));
    $p('wmplusVacYear')?.addEventListener('change',refreshVacation);
    $p('wmplusSaveVacation')?.addEventListener('click',safeAction(saveVacationSettings));
    $p('wmplusPreviewShift')?.addEventListener('click',safeAction(previewShifts));
    $p('wmplusAddShift')?.addEventListener('click',safeAction(addShifts));
    for(const id of ['auStatsMonth','auStatsYear'])$p(id)?.addEventListener('change',refreshSick);
    document.addEventListener('click',e=>{if(e.target.closest('[data-go],#unlockBtn'))setTimeout(refreshPlus,120);},{passive:true});
    for(const e of ['pointerdown','keydown','touchstart'])document.addEventListener(e,noteActivity,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden && !locked()&&idleMinutes()>0 && Date.now()-lastActivity>=idleMinutes()*60000){try{lock();}catch(e){console.warn(e);}lastActivity=Date.now();}});
    window.addEventListener('online',()=>{checkOffline();checkUpdates(false);});window.addEventListener('offline',checkOffline);
    navigator.serviceWorker?.addEventListener('controllerchange',()=>{checkOffline();setNote('wmplusUpdateInfo','Offline-Dienst aktualisiert. App bei Gelegenheit neu starten.');});
  }
  function refreshPlus(){
    if(locked())return;
    refreshVacation();refreshSick();refreshBackup();checkOffline();
    const idle=$p('wmplusIdle');if(idle)idle.value=String(idleMinutes());
    results();
  }
  function decorate(){
    if($p('wmplusSearch'))return;
    if(!REQUIRED.every(n=>typeof window[n]==='function')){console.warn('WorksManager-Erweiterung: Hauptprogramm nicht vollständig geladen.');return;}
    const css=document.createElement('style');css.id='wmplusStyles';css.textContent=UI_STYLE;document.head.appendChild(css);
    addCards();bindPlus();armIdle();
    // Bestehende Renderfunktionen erhalten, Zusatzfelder danach aktualisieren.
    const renderBase=window.renderAll;
    window.renderAll=function(...args){const result=renderBase.apply(this,args);setTimeout(refreshPlus,0);return result;};
    const originalDownload=window.downloadBlob;
    if(typeof originalDownload==='function')window.downloadBlob=function(blob,filename){
      const result=originalDownload.call(this,blob,filename);
      if(String(filename||'').startsWith('WorksManager-Backup-')){
        try{localStorage.setItem(METADATA_KEY,new Date().toISOString());}catch(e){console.warn('Backup-Metadatum',e);}
        refreshBackup();
      }
      return result;
    };
    setTimeout(refreshPlus,300);
    setTimeout(()=>checkUpdates(false),1200);
    setInterval(()=>{if(!locked()&&navigator.onLine)checkUpdates(false);},3600000);
    console.info(`WorksManager Erweiterungen ${PLUS_VERSION} geladen`);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
})();
