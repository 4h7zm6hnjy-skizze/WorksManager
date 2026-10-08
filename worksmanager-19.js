/* WorksManager 1.9.0 – additive Funktionen für WorksManager Kern 1.8.4.
   Keine Migration: alle Zusatzdaten liegen im verschlüsselten state.wm19.
   Bestehende Einträge, Dateischlüssel und das Backup-Format bleiben erhalten. */
(() => {
  'use strict';
  const VERSION='1.9.0', SECTIONS={
    shifts:{name:'Schicht',page:'shift',fields:['date','shift','start','end','note']},
    meetings:{name:'Gespräch',page:'meetings',fields:['type','date','time','partner','place','note']},
    notices:{name:'Aushang',page:'notices',fields:['type','date','title','note']},
    documents:{name:'Abrechnung/Dokument',page:'payroll',fields:['month','name']},
    aus:{name:'Krankschreibung',page:'sickness',fields:['from','to','name']},
    vacations:{name:'Urlaub',page:'vacation',fields:['from','to']},
    childSick:{name:'Kind krank',page:'family',fields:['child','from','to','note']},
    rehabs:{name:'Reha',page:'rehab',fields:['status','clinic','from','to','note']},
    stairs:{name:'Treppeneintrag',page:'stairs',fields:['date','time','count','reason']},
    contracts:{name:'Arbeitsvertrag',page:'company',fields:['name']},
    attachments:{name:'Foto/Dokument',page:'company',fields:['name']},
    timeRows:{name:'Arbeitszeit',page:'shift',fields:['date','start','end','breakMinutes','note']}
  };
  const LIST_IDS={shifts:'shiftList',meetings:'meetingList',notices:'noticeList',documents:'payrollList',aus:'auList',vacations:'vacationList',childSick:'childList',rehabs:'rehabList',stairs:'stairEntryList',contracts:'contractList'};
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const clone=obj=>JSON.parse(JSON.stringify(obj));
  const isoToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const dtNow=()=>new Date().toISOString();
  const num=(n,dp=1)=>Number(n||0).toLocaleString('de-DE',{minimumFractionDigits:dp,maximumFractionDigits:dp});
  const formatDate=s=>s?new Date(String(s).slice(0,10)+'T12:00:00').toLocaleDateString('de-DE'):'—';
  const isUnlocked=()=>!!$('app')&&!$('app').classList.contains('hidden');
  const dateOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&isoDayNumber(s)!==null;
  const ensure=()=>{if(!state.wm19||typeof state.wm19!=='object'||Array.isArray(state.wm19))state.wm19={};const s=state.wm19;
    for(const key of ['trash','history','timeRows','reminders'])if(!Array.isArray(s[key]))s[key]=[];
    if(!s.timeSettings||typeof s.timeSettings!=='object')s.timeSettings={weeklyHours:37,breakMinutes:30};
    return s;
  };
  const group=(section,sub='')=>section==='timeRows'?ensure().timeRows:section==='contracts'?(state.company.contracts||[]):section==='attachments'?(state.attachments?.[sub]||[]):state[section]||[];
  const setGroup=(section,sub,rows)=>{if(section==='timeRows')ensure().timeRows=rows;else if(section==='contracts')state.company.contracts=rows;else if(section==='attachments')state.attachments[sub]=rows;else state[section]=rows;};
  const getRecord=(section,ident,sub='')=>group(section,sub).find(x=>String(x.id)===String(ident));
  const itemTitle=(section,item)=>String(item?.title||item?.name||item?.shift||item?.clinic||item?.child||item?.reason||item?.date||item?.from||SECTIONS[section]?.name||'Eintrag');
  const toast=s=>typeof showToast==='function'?showToast(s):console.info(s);
  const card=(title,inner,id)=>`<div class="wm19-card" id="${id}"><h3>${esc(title)}</h3>${inner}</div>`;
  const inp=(name,label,type='text',value='',extra='')=>`<label class="wm19-field">${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const action=(id,label,extra='')=>`<button type="button" class="wm19-btn ${extra}" id="${id}">${esc(label)}</button>`;
  function log(action,section,item,before=null){
    const w=ensure();w.history.push({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),at:dtNow(),action,section,recordId:String(item?.id||''),label:itemTitle(section,item),before});
    if(w.history.length>160)w.history.splice(0,w.history.length-160);
  }
  async function transaction(update,rollback,message){try{update();await save(message);refresh();}catch(e){rollback();try{renderAll();}catch{}throw e;}}
  const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){console.error('WorksManager 1.9:',e);alert('Aktion fehlgeschlagen: '+(e?.message||e));}};
  const fieldsLabels={date:'Datum',from:'Von',to:'Bis',month:'Monat',shift:'Schicht',start:'Beginn',end:'Ende',time:'Uhrzeit',note:'Notiz',title:'Titel',type:'Art',name:'Name / Beschreibung',partner:'Gesprächspartner',place:'Ort',child:'Kind',clinic:'Einrichtung',status:'Status',count:'Anzahl',reason:'Grund',breakMinutes:'Pause (Minuten)'};
  function openEdit(section,ident,sub=''){
    const obj=getRecord(section,ident,sub);if(!obj)return alert('Eintrag nicht gefunden.');
    const schema=SECTIONS[section];const choice=schema.fields.map(f=>{
      const t=['date','from','to'].includes(f)?'date':f==='month'?'month':['count','breakMinutes'].includes(f)?'number':['time','start','end'].includes(f)?'time':'text';
      return inp(f,fieldsLabels[f]||f,t,obj[f]??'',t==='number'?`min="${f==='breakMinutes'?0:1}" step="1"`:'');
    }).join('');
    modal(`<div class="sheet-head"><strong>${esc(schema.name)} bearbeiten</strong><button type="button" onclick="closeModal()">✕</button></div><form id="wm19EditForm"><p>Vorhandene Fotos und Dokumente bleiben unverändert.</p><div class="wm19-form-grid">${choice}</div><div class="wm19-actions"><button class="wm19-btn" type="submit">Änderungen speichern</button>${action('wm19CancelEdit','Abbrechen','secondary')}</div></form>`);
    $('wm19CancelEdit').onclick=closeModal;
    $('wm19EditForm').onsubmit=e=>{e.preventDefault();safe(async()=>{
      const form=e.currentTarget,changes=Object.fromEntries(new FormData(form));
      for(const k of ['date','from','to'])if(changes[k]&&!dateOK(changes[k]))throw new Error('Ungültiges Datum: '+k);
      if(schema.fields.includes('date')&&!dateOK(changes.date))throw new Error('Ein gültiges Datum ist erforderlich.');
      if(schema.fields.includes('from')&&(!dateOK(changes.from)||!dateOK(changes.to)))throw new Error('Von- und Bis-Datum müssen gültig sein.');
      if(changes.from&&changes.to&&changes.to<changes.from)throw new Error('Bis-Datum liegt vor dem Von-Datum.');
      if(changes.count!==undefined){changes.count=Number(changes.count);if(!Number.isInteger(changes.count)||changes.count<1)throw new Error('Anzahl muss mindestens 1 sein.');}
      if(changes.breakMinutes!==undefined){changes.breakMinutes=Number(changes.breakMinutes);const minutes=minutesBetween(changes.start,changes.end);if(!Number.isInteger(changes.breakMinutes)||changes.breakMinutes<0||minutes===null||changes.breakMinutes>=minutes)throw Error('Arbeitszeit/Pause ungültig.');}
      if('month'in changes&&changes.month&&!/^\d{4}-\d{2}$/.test(changes.month))throw new Error('Ungültiger Monat.');
      const prior=clone(obj),previousHistory=ensure().history.slice();
      await transaction(()=>{Object.assign(obj,changes);log('Bearbeitet',section,obj,prior)},()=>{Object.keys(obj).forEach(k=>delete obj[k]);Object.assign(obj,prior);ensure().history=previousHistory},'Eintrag aktualisiert');
      closeModal();
    })();};
  }
  async function toTrash(section,ident,sub=''){
    const obj=getRecord(section,ident,sub);if(!obj)throw Error('Eintrag nicht gefunden.');
    if(!confirm(`${SECTIONS[section].name} in den Papierkorb verschieben? Wiederherstellen bleibt möglich.`))return;
    const w=ensure(),before=group(section,sub).slice(),trashBefore=w.trash.slice(),histBefore=w.history.slice();
    const item={trashId:crypto.randomUUID?.()||String(Date.now()+Math.random()),section,sub,removedAt:dtNow(),record:clone(obj)};
    await transaction(()=>{setGroup(section,sub,before.filter(x=>String(x.id)!==String(ident)));w.trash.push(item);log('In Papierkorb',section,obj)},()=>{setGroup(section,sub,before);w.trash=trashBefore;w.history=histBefore},'In Papierkorb verschoben');
  }
  async function restore(trashId){
    const w=ensure(),item=w.trash.find(x=>x.trashId===trashId);if(!item)return;
    const before=group(item.section,item.sub).slice(),previous=w.trash.slice(),hist=w.history.slice(),record=clone(item.record);
    if(item.section==='timeRows' && before.some(x=>x.date===record.date))throw Error('Für diesen Tag ist bereits eine Arbeitszeit erfasst. Bitte zuerst den vorhandenen Eintrag bearbeiten.');
    if(before.some(x=>x.id===record.id)){record.id=crypto.randomUUID?.()||String(Date.now());}
    await transaction(()=>{setGroup(item.section,item.sub,[...before,record]);w.trash=w.trash.filter(x=>x.trashId!==trashId);log('Wiederhergestellt',item.section,record)},()=>{setGroup(item.section,item.sub,before);w.trash=previous;w.history=hist},'Eintrag wiederhergestellt');
  }
  function keysInRecord(record){const out=[];for(const x of typeof recordFileMetas==='function'?recordFileMetas(record):record?.files||[])if(x?.fileKey)out.push(String(x.fileKey));return out;}
  async function destroy(trashId){
    const w=ensure(),item=w.trash.find(x=>x.trashId===trashId);if(!item)return;
    if(!confirm('Diesen Eintrag endgültig löschen? Daten und zugehörige Dateien können danach nicht mehr wiederhergestellt werden.'))return;
    const before=w.trash.slice(),hist=w.history.slice();
    await transaction(()=>{w.trash=w.trash.filter(x=>x.trashId!==trashId);log('Endgültig gelöscht',item.section,item.record)},()=>{w.trash=before;w.history=hist},'Endgültig gelöscht');
    // Datei nur entfernen, falls sonst kein aktiver oder archivierter Datensatz auf sie verweist.
    const stillReferenced=referencedFileKeys(state);let errors=0;
    for(const key of keysInRecord(item.record))if(!stillReferenced.has(key))try{await dbFileDelete(key)}catch(e){errors++;console.warn('Datei nicht gelöscht',key,e)}
    if(errors)alert(`${errors} Dateien konnten nicht bereinigt werden; die Dokumentdatenbank bleibt unverändert.`);
  }
  function protectTrashFiles(){
    const original=window.referencedFileKeys;
    if(typeof original!=='function'||original._wm19)return;
    const extra=function(source=state){
      const refs=original(source);
      for(const item of source?.wm19?.trash||[])for(const key of keysInRecord(item.record))refs.add(key);
      return refs;
    };extra._wm19=true;window.referencedFileKeys=extra;
  }
  const originalDelete={delContract:['contracts'],delShift:['shifts'],delMeeting:['meetings'],delNotice:['notices'],delDoc:['documents'],delVacation:['vacations'],delAu:['aus'],delChild:['childSick'],delRehab:['rehabs'],delStairEntry:['stairs']};
  function protectDeletions(){
    for(const [fn,[section]] of Object.entries(originalDelete)){
      if(typeof window[fn]==='function')window[fn]=ident=>safe(()=>toTrash(section,ident))();
    }
    window.delAuAt=index=>{const obj=state.aus?.[Number(index)];if(obj)safe(()=>toTrash('aus',obj.id))();};
    if(typeof window.delAttachment==='function')window.delAttachment=(sub,ident)=>safe(()=>toTrash('attachments',ident,sub))();
    // Alte AU-Liste nutzt direkte addEventListener-Handler statt globale delAu-Funktionen.
    $('auList')?.addEventListener('click',e=>{
      const b=e.target.closest('[data-au-delete]');if(!b)return;
      e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();
      const ident=b.dataset.auDelete||state.aus?.[Number(b.dataset.auIndex)]?.id;
      if(ident)safe(()=>toTrash('aus',ident))();
    },true);
  }
  function addEditButtons(){
    for(const [section,listId] of Object.entries(LIST_IDS)){
      const list=$(listId);if(!list)continue;
      const records=section==='contracts'?group('contracts'):section==='aus'?[...group(section)].sort((a,b)=>(b.from||b.to||'').localeCompare(a.from||a.to||'')):section==='documents'?[...group(section)].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')):section==='stairs'?[...group(section)].sort((a,b)=>`${b.date||''} ${b.time||''}`.localeCompare(`${a.date||''} ${a.time||''}`)):[...group(section)].sort((a,b)=>(b.date||b.from||b.createdAt||'').localeCompare(a.date||a.from||a.createdAt||''));
      const els=list.querySelectorAll('.item');els.forEach((el,index)=>{
        if(el.querySelector('.wm19-edit'))return;
        const rec=records[index],actions=el.querySelector('.item-actions');if(!rec||!actions)return;
        const b=document.createElement('button');b.type='button';b.className='wm19-edit';b.textContent='Bearbeiten';b.addEventListener('click',()=>openEdit(section,rec.id));actions.prepend(b);
      });
    }
    const mapping={company:'companyPhotoList',shift:'shiftPhotoList',meetings:'meetingPhotoList',notices:'noticePhotoList',family:'familyPhotoList',rehab:'rehabPhotoList'};
    for(const [sub,elid]of Object.entries(mapping)){
      const list=$(elid);if(!list)continue;
      const rows=[...group('attachments',sub)].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      list.querySelectorAll('.item').forEach((el,i)=>{if(el.querySelector('.wm19-edit'))return;const act=el.querySelector('.item-actions');if(!act||!rows[i])return;
        const b=document.createElement('button');b.type='button';b.className='wm19-edit';b.textContent='Bearbeiten';b.onclick=()=>openEdit('attachments',rows[i].id,sub);act.prepend(b);
      });
    }
  }
  function safeSearchStr(obj){
    if(!obj||typeof obj!=='object')return String(obj??'');
    const vals=[];for(const [k,v] of Object.entries(obj)){
      if(['cipher','data','image','iv','blob','fileKey'].includes(k))continue;
      if(typeof v==='string'||typeof v==='number')vals.push(String(v));
      else if(k==='files'&&Array.isArray(v))for(const f of v)vals.push(f.name||'');
    }return vals.join(' ').toLocaleLowerCase('de-DE');
  }
  function searchEntries(){const out=[];
    for(const [section,meta]of Object.entries(SECTIONS)){
      if(section==='attachments'){for(const [sub,rows]of Object.entries(state.attachments||{}))for(const r of rows)out.push({section,sub,meta,record:r});}
      else for(const r of group(section))out.push({section,sub:'',meta,record:r});
    }return out;
  }
  function openSearchHit(section,ident,sub=''){
    const rec=getRecord(section,ident,sub);if(!rec)return alert('Eintrag nicht gefunden.');
    if(section==='documents')return viewDoc(ident,'doc');
    if(section==='notices'&&keysInRecord(rec).length)return viewDoc(ident,'notice');
    if(section==='contracts')return viewDoc(ident,'contract');
    if(section==='aus'&&keysInRecord(rec).length)return viewDoc(ident,'au');
    if(section==='vacations'&&keysInRecord(rec).length)return viewVacation(ident);
    if(section==='attachments')return viewAttachment(sub,ident);
    go(SECTIONS[section].page);openEdit(section,ident,sub);
  }
  function refreshSearch(){
    const results=$('wm19SearchResults');if(!results)return;
    if(!isUnlocked()){results.replaceChildren();return;}
    const q=($('wm19Query')?.value||'').trim().toLocaleLowerCase('de-DE'),section=$('wm19Filter')?.value||'',from=$('wm19From')?.value||'',to=$('wm19To')?.value||'';
    if(!q&&!section&&!from&&!to){results.innerHTML='<p>Suchbegriff oder Filter auswählen.</p>';return;}
    const matches=searchEntries().filter(x=>{
      if(section&&x.section!==section)return false;
      if(q&&!`${x.meta.name} ${safeSearchStr(x.record)}`.toLocaleLowerCase('de-DE').includes(q))return false;
      const raw=String(x.record.date||x.record.from||x.record.month||x.record.createdAt||'').slice(0,10);
      const dateStart=raw.length===7?raw+'-01':raw,dateEnd=raw.length===7?raw+'-31':raw;
      if(from&&(!dateEnd||dateEnd<from))return false;
      if(to&&(!dateStart||dateStart>to))return false;
      return true;
    }).sort((a,b)=>String(b.record.date||b.record.from||b.record.createdAt||'').localeCompare(String(a.record.date||a.record.from||a.record.createdAt||'')));
    results.innerHTML=`<p>${matches.length} Treffer${matches.length>100?' (erste 100 angezeigt)':''}</p>`+matches.slice(0,100).map(x=>
      `<div class="wm19-entry"><div><strong>${esc(itemTitle(x.section,x.record))}</strong><small>${esc(x.meta.name)} · ${esc(x.record.date||x.record.from||x.record.month||'')}</small></div><button type="button" class="wm19-btn secondary" data-section="${esc(x.section)}" data-sub="${esc(x.sub)}" data-id="${esc(x.record.id)}">Öffnen</button></div>`).join('');
  }
  function timeSettings(){return ensure().timeSettings;}
  function minutesBetween(start,end){if(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end))return null;
    const [h1,m1]=start.split(':').map(Number),[h2,m2]=end.split(':').map(Number);if(h1>23||h2>23||m1>59||m2>59)return null;
    let diff=(h2*60+m2)-(h1*60+m1);if(diff<0)diff+=1440;return diff;
  }
  function workTargetDay(iso){if(!dateOK(iso))return 0;const day=new Date(iso+'T12:00:00').getDay();
    if(day===0||day===6)return 0;
    if(nrwHolidays(Number(iso.slice(0,4))).some(h=>h.date===iso))return 0;
    return Number(timeSettings().weeklyHours||0)/5;
  }
  function calcHours(row){if(Number.isFinite(Number(row.hours)))return Number(row.hours);
    const worked=minutesBetween(row.start,row.end);return worked===null?0:Math.max(0,(worked-Number(row.breakMinutes||0))/60);
  }
  function monthTimeStats(month){let actual=0,scheduled=0,days=0;
    for(const r of ensure().timeRows)if(r.date?.startsWith(month)){actual+=calcHours(r);scheduled+=workTargetDay(r.date);days++;}
    return {actual,scheduled,days,diff:actual-scheduled};
  }
  function renderTime(){const el=$('wm19TimeStats');if(!el)return;
    const month=$('wm19TimeMonth').value||isoToday().slice(0,7),s=monthTimeStats(month);
    const hoursPerWeek=timeSettings().weeklyHours;
    const allDays=[];let selectedDate=new Date(month+'-01T12:00:00');for(let x=0;x<32&&selectedDate.getMonth()+1===Number(month.slice(5));x++){
      allDays.push(`${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`);selectedDate.setDate(selectedDate.getDate()+1);
    }
    const fullTarget=allDays.reduce((n,d)=>n+workTargetDay(d),0);
    el.innerHTML=`<div class="wm19-stats"><span><strong>${num(s.actual)}</strong> Ist-Stunden</span><span><strong>${num(fullTarget)}</strong> Soll im Monat</span><span><strong>${num(s.actual-fullTarget)}</strong> Differenz (erfasster Stand)</span><span><strong>${s.days}</strong> Tage erfasst</span></div><p>Sollannahme: ${num(hoursPerWeek)} Stunden/Woche, gleichmäßig Mo–Fr, ohne NRW-Feiertage. Nicht erfasste Ist-Tage zählen als 0; Teilmonate sind daher nicht aussagekräftig.</p>`;
    const list=$('wm19TimeList');if(list)list.innerHTML=[...ensure().timeRows].filter(r=>r.date?.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date)).map(r=>
      `<div class="wm19-entry"><div><strong>${formatDate(r.date)} · ${num(calcHours(r))} Std.</strong><small>${esc(r.start||'—')} bis ${esc(r.end||'—')} · Pause ${Number(r.breakMinutes)||0} Min. · ${esc(r.note||'')}</small></div><div class="wm19-actions"><button class="wm19-btn secondary" data-time-edit="${esc(r.id)}">Bearbeiten</button><button class="wm19-btn secondary" data-time-trash="${esc(r.id)}">Löschen</button></div></div>`).join('')||'<p>Für diesen Monat noch keine Arbeitszeiten erfasst.</p>';
  }
  function openTimeEditor(record=null){const r=record||{date:isoToday(),start:'05:45',end:'13:45',breakMinutes:30,note:''};
    modal(`<div class="sheet-head"><strong>Arbeitszeit ${record?'bearbeiten':'erfassen'}</strong><button type="button" onclick="closeModal()">✕</button></div><form id="wm19TimeForm" class="wm19-form-grid">${inp('date','Datum','date',r.date,'required')}${inp('start','Beginn','time',r.start,'required')}${inp('end','Ende','time',r.end,'required')}${inp('breakMinutes','Pause in Minuten','number',r.breakMinutes,'min="0" max="600" step="1"')}${inp('note','Notiz','text',r.note)}<button class="wm19-btn" type="submit">Speichern</button></form>`);
    $('wm19TimeForm').onsubmit=e=>{e.preventDefault();safe(async()=>{
      const f=Object.fromEntries(new FormData(e.currentTarget)),minutes=minutesBetween(f.start,f.end);f.breakMinutes=Number(f.breakMinutes);
      if(!dateOK(f.date)||minutes===null||!Number.isInteger(f.breakMinutes)||f.breakMinutes<0||f.breakMinutes>=minutes)throw Error('Datum, Uhrzeiten oder Pause sind ungültig.');
      const current=ensure().timeRows.find(x=>x.id===record?.id);
      if(ensure().timeRows.some(x=>x.date===f.date&&x.id!==record?.id))throw Error('Für diesen Tag existiert bereits ein Arbeitszeiteintrag. Bitte bearbeiten.');
      const previous=clone(ensure().timeRows),history=ensure().history.slice();
      await transaction(()=>{if(current){const before=clone(current);Object.assign(current,f);log('Arbeitszeit bearbeitet','timeRows',current,before);}else{const obj={id:crypto.randomUUID?.()||String(Date.now()),...f};ensure().timeRows.push(obj);log('Arbeitszeit erstellt','timeRows',obj)}},()=>{ensure().timeRows=previous;ensure().history=history},'Arbeitszeit gespeichert');closeModal();
    })();};
  }
  async function deleteTime(ident){const w=ensure(),r=w.timeRows.find(x=>x.id===ident);if(!r)return;
    if(!confirm('Arbeitszeit löschen und in den Papierkorb verschieben?'))return;
    const before=w.timeRows.slice(),trash=w.trash.slice(),hist=w.history.slice();
    await transaction(()=>{w.timeRows=w.timeRows.filter(x=>x.id!==ident);w.trash.push({trashId:crypto.randomUUID?.()||String(Date.now()),section:'timeRows',sub:'',removedAt:dtNow(),record:clone(r)});log('In Papierkorb','timeRows',r)},()=>{w.timeRows=before;w.trash=trash;w.history=hist},'Arbeitszeit in Papierkorb verschoben');
  }
  function collectReminders(){const d=isoToday(),tomorrow=new Date(d+'T12:00:00');tomorrow.setDate(tomorrow.getDate()+1);
    const maxDate=new Date(d+'T12:00:00');maxDate.setDate(maxDate.getDate()+14);const last=maxDate.toISOString().slice(0,10),rows=[];
    for(const m of state.meetings||[])if(m.date>=d&&m.date<=last)rows.push({id:'meeting:'+m.id,date:m.date,title:`Gespräch: ${m.type||'Termin'}${m.time?' · '+m.time:''}`});
    for(const a of state.aus||[])if(a.to>=d&&a.to<=last)rows.push({id:'au:'+a.id,date:a.to,title:'AU-Zeitraum endet'});
    for(const s of state.shifts||[])if(s.date>=d&&s.date<=last)rows.push({id:'shift:'+s.id,date:s.date,title:`Schicht: ${s.shift||'Arbeit'}${s.start?' · '+s.start:''}`});
    for(const r of ensure().reminders)if(r.date>=d&&r.date<=last)rows.push({...r,title:r.title||'Erinnerung'});
    return rows.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,70);
  }
  function renderReminders(){const el=$('wm19ReminderList');if(!el||!isUnlocked())return;
    const w=ensure(),dismissed=w.dismissed||{},rows=collectReminders().filter(r=>!dismissed[r.id] || dismissed[r.id]!==r.date);
    el.innerHTML=rows.length?rows.map(r=>`<div class="wm19-entry"><div><strong>${formatDate(r.date)}</strong><small>${esc(r.title)}</small></div><button class="wm19-btn secondary" data-remind-dismiss="${esc(r.id)}" data-date="${esc(r.date)}">Erledigt</button></div>`).join(''):'<p>Keine offenen Erinnerungen in den nächsten 14 Tagen.</p>';
    const counter=$('wm19ReminderCount');if(counter)counter.textContent=rows.length?`${rows.length} anstehende Termine`:'Keine Termine';
  }
  async function addReminder(){const title=$('wm19ReminderTitle')?.value.trim(),date=$('wm19ReminderDate')?.value;
    if(!title||!dateOK(date))throw Error('Titel und gültiges Datum eingeben.');const w=ensure(),before=w.reminders.slice(),hist=w.history.slice();
    await transaction(()=>{const r={id:'custom:'+String(crypto.randomUUID?.()||Date.now()),title,date};w.reminders.push(r);log('Erinnerung erstellt','Erinnerung',r)},()=>{w.reminders=before;w.history=hist},'Erinnerung gespeichert');$('wm19ReminderTitle').value='';
  }
  async function dismissReminder(id,date){const w=ensure(),prior=clone(w.dismissed||{});await transaction(()=>{w.dismissed={...prior,[id]:date};},()=>{w.dismissed=prior},'Erinnerung erledigt');}
  async function verifyEncryptedDatabase(){const s=$('wm19BackupStatus');s.textContent='Prüfung läuft …';
    const payload=await dbGet('payload'),salt=await dbGet('salt'),rows=await dbFileEntries();
    if(!payload?.cipher||!payload?.iv||!salt||!cryptoKey)throw Error('Keine entsperrte, verschlüsselte Datenbank gefunden.');
    await decryptPayload(payload,cryptoKey);
    const needed=referencedFileKeys(state),actual=new Set(rows.map(([k])=>String(k))),missing=[...needed].filter(k=>!actual.has(k));
    if(missing.length)throw Error(`${missing.length} referenzierte Dokumente fehlen. Bitte sofort externes Backup prüfen.`);
    let good=0;for(const [,r]of rows){await decryptFileBlob(r);good++;if(good%5===0){s.textContent=`Verschlüsselung geprüft: ${good}/${rows.length} Dateien …`;await new Promise(done=>setTimeout(done,0));}}
    s.textContent=`Lokale verschlüsselte Datenbank geprüft. Datensatz lesbar, ${good} Dateien erfolgreich entschlüsselt, keine fehlenden Referenzen. Dies prüft NICHT die externe Backup-Datei.`;
  }
  async function verifyBackupFile(file,password){
    const box=$('wm19BackupStatus');box.textContent='Externe Datei wird geprüft …';
    const obj=JSON.parse(await file.text());if(obj.app!=='WorksManager'||!obj.salt||!obj.payload?.cipher||!obj.payload?.iv||!Array.isArray(obj.files))throw Error('Ungültige oder nicht vollständige WorksManager-Backupdatei.');
    const key=await deriveKey(password,new Uint8Array(unb64(obj.salt)));
    const restored=await decryptPayload(obj.payload,key);
    const refs=referencedFileKeys(restored),found=new Map();
    for(const f of obj.files){if(!f.key||!f.iv||!f.cipher||found.has(f.key))throw Error('Fehlerhafte oder doppelte Dateieinträge im Backup.');found.set(f.key,f);}
    const missing=[...refs].filter(k=>!found.has(k));if(missing.length)throw Error(`${missing.length} Dokumente fehlen im externen Backup.`);
    let checked=0;for(const f of obj.files){await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(unb64(f.iv))},key,unb64(f.cipher));checked++;if(checked%5===0){box.textContent=`Backup geprüft: ${checked}/${obj.files.length} Dateien …`;await new Promise(done=>setTimeout(done,0));}}
    box.textContent=`Backup-Datei vollständig geprüft: Daten lesbar, ${checked} verschlüsselte Dateien entschlüsselt. Die lokale Datenbank wurde NICHT verändert.`;
  }
  function report(year){const rows=ensure().timeRows.filter(x=>x.date?.startsWith(year)),actual=rows.reduce((n,r)=>n+calcHours(r),0);
    const byMonth=Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`);
    const lines=[`WORKSMANAGER 1.9.0 | Erweiterter Jahresbericht ${year}`,`Erstellt: ${dtNow()}`,`Firma: ${state.company?.name||'—'}`,`Mitarbeiter: ${state.company?.employeeName||'—'}`,'',
      `Erfasste Arbeitstage: ${rows.length}`,`Erfasste Ist-Stunden: ${num(actual)}`,`Soll-Modell: ${num(timeSettings().weeklyHours)} Stunden/Woche; Mo-Fr ohne NRW-Feiertage`,
      `Schichten: ${state.shifts.filter(x=>x.date?.startsWith(year)).length}`,`AU-Kalendertage (einzigartig): ${countUniqueRangeDays(state.aus,year+'-01-01',year+'-12-31')}`,
      `Urlaubstage: ${vacationDaysForRecords(state.vacations,year+'-01-01',year+'-12-31')}`,`Kind krank: ${state.childSick.filter(x=>x.from?.startsWith(year)).length} Einträge`,
      `Treppen: ${state.stairs.filter(x=>x.date?.startsWith(year)).reduce((n,x)=>n+Number(x.count||0),0)}`,'',
      'MONAT | ARBEITSZEIT (NUR ERFASSTE TAGE) | AU-TAGE | URLAUB'];
    for(const m of byMonth){const bounds=monthBounds(m),time=monthTimeStats(m);lines.push(`${m} | ${num(time.actual)} Std. | ${countUniqueRangeDays(state.aus,bounds.start,bounds.end)} Tage | ${vacationDaysForRecords(state.vacations,bounds.start,bounds.end)} Tage`);}
    lines.push('',`Änderungsvorgänge im Jahr: ${ensure().history.filter(x=>x.at?.startsWith(year)).length}`,`Einträge im Papierkorb (alle Jahre): ${ensure().trash.length}`,
      'Hinweis: Jahres-PDF ohne eingebettete persönliche Dokumente/Fotos; diese bleiben ausschließlich im verschlüsselten Backup.');
    return lines;
  }
  function exportReport(){const year=$('wm19ReportYear').value;
    if(!/^\d{4}$/.test(year))throw Error('Jahr auswählen.');
    const pdf=makeAnnualPdfBlob(year,report(year));downloadBlob(pdf,`WorksManager-Jahresstatistik-Erweitert-${year}.pdf`);toast('Erweiterte Jahresstatistik erstellt');
  }
  function renderTrash(){const el=$('wm19TrashList');if(!el||!isUnlocked())return;
    el.innerHTML=[...ensure().trash].reverse().map(t=>`<div class="wm19-entry"><div><strong>${esc(t.section==='timeRows'?'Arbeitszeit':SECTIONS[t.section]?.name||t.section)}: ${esc(itemTitle(t.section,t.record))}</strong><small>Gelöscht: ${esc(String(t.removedAt).slice(0,16).replace('T',' '))} · ${keysInRecord(t.record).length} Datei(en)</small></div><div class="wm19-actions"><button class="wm19-btn secondary" data-restore="${esc(t.trashId)}">Wiederherstellen</button><button class="wm19-btn danger" data-destroy="${esc(t.trashId)}">Endgültig löschen</button></div></div>`).join('')||'<p>Der Papierkorb ist leer.</p>';
    $('wm19TrashCount').textContent=String(ensure().trash.length);
    const h=$('wm19HistoryList');if(h)h.innerHTML=[...ensure().history].reverse().slice(0,40).map(x=>`<div class="wm19-entry"><div><strong>${esc(x.action)} · ${esc(x.section)}</strong><small>${esc(x.label||'')} · ${esc(String(x.at||'').slice(0,16).replace('T',' '))}</small></div>${x.before?`<button class="wm19-btn secondary" data-undo="${esc(x.id)}">Vorherigen Stand</button>`:''}</div>`).join('')||'<p>Noch keine protokollierten Änderungen.</p>';
  }
  async function undoEdit(histId){const w=ensure(),h=w.history.find(x=>x.id===histId);if(!h?.before)return;
    const current=getRecord(h.section,h.recordId);if(!current)throw Error('Eintrag nicht mehr vorhanden.');
    if(!confirm('Vorherigen Text- und Datumsstand wiederherstellen? Bestehende Dokumente bleiben unverändert.'))return;
    const prev=clone(current),hist=w.history.slice(),preserveKeys=['id','files','file','fileKey','createdAt'];
    await transaction(()=>{for(const [k,v]of Object.entries(h.before))if(!preserveKeys.includes(k))current[k]=v;log('Änderung rückgängig',h.section,current,prev)},()=>{Object.assign(current,prev);w.history=hist},'Vorheriger Stand wiederhergestellt');
  }
  function mountUI(){
    const css=document.createElement('style');css.id='wm19Style';css.textContent=`
      .wm19-card{margin-top:14px;border:1px solid var(--line,#dfe7ef);border-radius:16px;background:var(--card,#fff);padding:16px;box-shadow:var(--shadow,0 3px 12px #0001)}
      .wm19-card h3{margin:0 0 10px;font-size:17px;color:var(--ink,#082f4c)}
      .wm19-card p{font-size:13px;color:var(--muted,#6a7a8e);line-height:1.5}
      .wm19-grid,.wm19-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wm19-field{display:block;font-size:12px;font-weight:600;color:var(--ink,#082f4c)}
      .wm19-field input,.wm19-field select{display:block;margin-top:5px;width:100%;min-width:0;padding:10px;border:1px solid var(--line,#dfe7ef);border-radius:10px;background:#fff;color:var(--ink,#082f4c);font-size:16px}
      .wm19-actions{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.wm19-btn,.wm19-edit{border:1px solid var(--line,#dfe7ef);border-radius:10px;padding:10px 12px;background:var(--accent,#0ba39c);color:#fff;font-weight:600;cursor:pointer;font-size:13px}
      .wm19-btn.secondary,.wm19-edit{color:var(--ink,#082f4c);background:#fff}.wm19-btn.danger{background:#b91c1c;color:#fff}
      .wm19-entry{display:flex;gap:8px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line,#dfe7ef);padding:10px 0}.wm19-entry>div:first-child{min-width:0;overflow-wrap:anywhere}
      .wm19-entry strong{display:block;font-size:13px}.wm19-entry small{display:block;color:var(--muted,#6a7a8e);margin-top:4px}.wm19-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .wm19-stats span{background:var(--bg,#f4f7fb);padding:11px;border-radius:9px;font-size:12px}.wm19-stats strong{display:block;font-size:19px}
      .wm19-list{max-height:400px;overflow-y:auto;margin-top:12px}.wm19-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:12px 0}
      @media(max-width:440px){.wm19-grid,.wm19-form-grid{grid-template-columns:1fr}.wm19-entry{align-items:flex-start;flex-wrap:wrap}}
    `;document.head.appendChild(css);
    const search=$('wmplusSearch');if(search){
      search.innerHTML='<h3>Verbesserte Suche</h3><p>Direkt öffnen oder bearbeiten, Filter nach Bereich und Zeitraum. Keine Fotoanalyse.</p>'+`<div class="wm19-grid">${inp('q','Suchbegriff','search','','id="wm19Query"')}<label class="wm19-field">Bereich<select id="wm19Filter"><option value="">Alle Bereiche</option>${Object.entries(SECTIONS).map(([k,v])=>`<option value="${k}">${esc(v.name)}</option>`).join('')}</select></label>${inp('from','Ab Datum','date','','id="wm19From"')}${inp('to','Bis Datum','date','','id="wm19To"')}</div><div id="wm19SearchResults" class="wm19-list"></div>`;
      // Die alte Erweiterung findet ihre Eingabeelemente nicht mehr und bleibt damit inaktiv; eigene Suche reagiert auf die neuen Felder.
    }
    const shift=$('shift');if(shift)shift.insertAdjacentHTML('beforeend',card('Arbeitszeitkonto',`<p>Zusätzlich zu deinen Schichtfotos und Schichteinträgen. Beginn, Ende und Pause werden erfasst; Nachtwechsel wird berücksichtigt.</p><div class="wm19-grid">${inp('month','Monat','month',isoToday().slice(0,7),'id="wm19TimeMonth"')}${inp('weekly','Vertragliche Wochenstunden','number','37','id="wm19WeeklyHours" min="0" max="80" step="0.5"')}</div><div class="wm19-toolbar">${action('wm19TimeNew','Arbeitszeit erfassen')}${action('wm19SaveWeekly','Sollstunden speichern','secondary')}</div><div id="wm19TimeStats"></div><div id="wm19TimeList" class="wm19-list"></div>`,'wm19TimeCard'));
    const dashboard=$('dashboard');if(dashboard)dashboard.insertAdjacentHTML('beforeend',card('Termine und Erinnerungen',`<p>Interne Anzeige beim Öffnen der App – keine iPhone-Pushmitteilungen. Automatisch berücksichtigt werden Schichten, Gesprächstermine und AU-Enden in den nächsten 14 Tagen.</p><div class="wm19-grid">${inp('title','Neue Erinnerung','text','','id="wm19ReminderTitle" placeholder="z. B. Termin"')}${inp('date','Datum','date',isoToday(),'id="wm19ReminderDate"')}</div><div class="wm19-toolbar">${action('wm19AddReminder','Erinnerung speichern')}</div><p id="wm19ReminderCount"></p><div class="wm19-list" id="wm19ReminderList"></div>`,'wm19ReminderCard'));
    const backup=$('backup');if(backup){const danger=backup.querySelector('.danger-zone');const html=card('Backup-Sicherheitsprüfung',`<p>Prüft die verschlüsselten Datensätze und die AES-GCM-Authentizität der Dokumente. Eine externe Datei wird nur gelesen, niemals importiert oder zurückgespielt.</p><div class="wm19-toolbar">${action('wm19CheckDB','Lokale Datenbank prüfen')}<label class="wm19-field">Externes Backup auswählen<input type="file" accept=".json,application/json" id="wm19BackupFile"></label>${action('wm19CheckBackupFile','Backupdatei prüfen','secondary')}</div><p id="wm19BackupStatus" aria-live="polite"></p>`,'wm19BackupCard')+card('Papierkorb und Änderungsverlauf',`<p>Gelöschte Einträge und zugehörige Dokumente bleiben verschlüsselt gespeichert, bis du sie endgültig löschst. Bei Änderungen kannst du den früheren Textstand wiederherstellen.</p><p>Im Papierkorb: <strong id="wm19TrashCount">0</strong></p><div class="wm19-list" id="wm19TrashList"></div><h3>Letzte Änderungen</h3><div class="wm19-list" id="wm19HistoryList"></div>`,'wm19TrashCard');if(danger)danger.insertAdjacentHTML('beforebegin',html);else backup.insertAdjacentHTML('beforeend',html);}
    const annual=$('annual');if(annual)annual.insertAdjacentHTML('beforeend',card('Erweiterte Jahresstatistik 1.9.0',`<p>Arbeit, Schichten, AU, Urlaub, Treppen und Monatsübersicht als zusätzliche PDF. Deine bestehende Jahres-PDF bleibt unverändert.</p><div class="wm19-toolbar">${inp('year','Jahr','number',new Date().getFullYear(),'id="wm19ReportYear" min="2000" max="2100"')}${action('wm19ExportReport','Erweiterte PDF erstellen')}</div>`,'wm19AnnualCard'));
    const update=$('wmplusQuickUpdateState');if(update){const title=$('wmplusQuickUpdateCheck')?.closest('#wmplusQuickUpdateBar')?.querySelector('strong');if(title)title.textContent='App-Updates · WorksManager 1.9.0';}
  }
  function bind(){
    for(const id of ['wm19Query','wm19Filter','wm19From','wm19To'])$(id)?.addEventListener(id==='wm19Query'?'input':'change',refreshSearch);
    $('wm19SearchResults')?.addEventListener('click',e=>{const btn=e.target.closest('button[data-id]');if(btn)openSearchHit(btn.dataset.section,btn.dataset.id,btn.dataset.sub);});
    $('wm19TimeMonth')?.addEventListener('change',renderTime);
    $('wm19TimeNew')?.addEventListener('click',()=>openTimeEditor());
    $('wm19SaveWeekly')?.addEventListener('click',safe(async()=>{const weeklyHours=Number($('wm19WeeklyHours').value);if(!Number.isFinite(weeklyHours)||weeklyHours<0||weeklyHours>80)throw Error('Wochenstunden müssen zwischen 0 und 80 liegen.');
      const w=ensure(),old=clone(w.timeSettings);await transaction(()=>{w.timeSettings={...old,weeklyHours};},()=>{w.timeSettings=old},'Sollstunden gespeichert');}));
    $('wm19TimeList')?.addEventListener('click',e=>{const edit=e.target.closest('[data-time-edit]'),del=e.target.closest('[data-time-trash]');if(edit)openTimeEditor(ensure().timeRows.find(x=>x.id===edit.dataset.timeEdit));if(del)safe(()=>deleteTime(del.dataset.timeTrash))();});
    $('wm19AddReminder')?.addEventListener('click',safe(addReminder));
    $('wm19ReminderList')?.addEventListener('click',e=>{const b=e.target.closest('[data-remind-dismiss]');if(b)safe(()=>dismissReminder(b.dataset.remindDismiss,b.dataset.date))();});
    $('wm19CheckDB')?.addEventListener('click',safe(verifyEncryptedDatabase));
    $('wm19CheckBackupFile')?.addEventListener('click',safe(async()=>{const f=$('wm19BackupFile')?.files?.[0];if(!f)throw Error('Bitte die Backup-JSON-Datei auswählen.');const pass=prompt('Passwort der externen Sicherung eingeben (nicht gespeichert):');if(pass===null)return;if(!pass)throw Error('Kein Passwort eingegeben.');await verifyBackupFile(f,pass);}));
    $('wm19TrashList')?.addEventListener('click',e=>{const r=e.target.closest('[data-restore]'),d=e.target.closest('[data-destroy]');if(r)safe(()=>restore(r.dataset.restore))();if(d)safe(()=>destroy(d.dataset.destroy))();});
    $('wm19HistoryList')?.addEventListener('click',e=>{const b=e.target.closest('[data-undo]');if(b)safe(()=>undoEdit(b.dataset.undo))();});
    $('wm19ExportReport')?.addEventListener('click',safe(exportReport));
    document.addEventListener('click',e=>{if(e.target.closest('[data-go]'))setTimeout(refresh,110);},{passive:true});
  }
  function refresh(){if(!isUnlocked())return;
    addEditButtons();refreshSearch();renderTime();renderReminders();renderTrash();
    if($('wm19WeeklyHours')&&document.activeElement!==$('wm19WeeklyHours'))$('wm19WeeklyHours').value=timeSettings().weeklyHours;
  }
  function start(){
    if($('wm19TimeCard'))return;
    const required=['renderAll','save','modal','closeModal','referencedFileKeys','dbFileEntries','decryptFileBlob','makeAnnualPdfBlob'];
    if(!required.every(x=>typeof window[x]==='function')){console.error('WorksManager 1.9: Unvollständiger Programmkern.',required.filter(x=>typeof window[x]!=='function'));return;}
    mountUI();protectTrashFiles();protectDeletions();bind();
    const originalRender=window.renderAll;window.renderAll=function(...args){const result=originalRender.apply(this,args);setTimeout(refresh,0);return result;};
    // Schutz vor nachträglichen Dateibereinigungen: refs des Papierkorbs berücksichtigen.
    setTimeout(refresh,400);window.addEventListener('pageshow',()=>setTimeout(refresh,100));
    console.info('WorksManager Erweiterungen 1.9.0 geladen');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
