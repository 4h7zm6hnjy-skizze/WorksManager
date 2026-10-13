/* WorksManager 1.9.20 – Präsentation und Navigation. Keine Datenmigration.
 * Die bestehenden Module und deren Event-Handler werden nur umsortiert.
 * Vertrauliche Daten verbleiben im bestehenden verschlüsselten Profil.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const categories=[
 {label:'Arbeitszeit & Planung',sub:'Schichten, Stempeluhr und Tätigkeiten',icon:'◷',pages:['shift','stairs']},
 {label:'Fehlzeiten & Familie',sub:'Urlaub, Krankschreibung, Reha, Kind krank',icon:'✚',pages:['sickness','vacation','rehab','family']},
 {label:'Lohn & Dokumente',sub:'Abrechnungen, Gespräche und Aushänge',icon:'▤',pages:['payroll','meetings','notices','annual']},
 {label:'Profil & Sicherheit',sub:'Firmendaten und verschlüsselte Sicherungen',icon:'⚙',pages:['company','backup']}
];
const pageTitles={dashboard:'Übersicht',shift:'Arbeitszeit & Schichten',sickness:'Krankheit & AU',vacation:'Urlaub',rehab:'Reha',family:'Kind krank',stairs:'Treppenzähler',payroll:'Lohn & Abrechnung',meetings:'Gespräche',notices:'Aushänge',annual:'Jahresstatistik',company:'Firma & Vertrag',backup:'Sicherheit & Backup'};
function navigate(page){if(typeof go==='function')go(page);else document.querySelector(`[data-go="${page}"]`)?.click();}
function bring(id){if($('app')?.classList.contains('hidden'))return;navigate('dashboard');const el=$(id);if(!el)return;for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;requestAnimationFrame(()=>el.scrollIntoView({block:'start',behavior:'smooth'}));}
function style(){if($('wmoStyle'))return;const st=document.createElement('style');st.id='wmoStyle';st.textContent=`
#wmoLayout{width:100%;min-width:0;color:#19394e}#wmoLayout *{box-sizing:border-box}
.wmo-shortcuts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:14px 0}
.wmo-shortcuts button{min-width:0;min-height:61px;border-radius:12px;border:1px solid #c5d7e4;background:#f5fafc;color:#1e4d60;font:700 12px system-ui;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px;padding:7px 3px;text-align:center;cursor:pointer}
.wmo-shortcuts button span{font-size:20px;line-height:1.1}.wmo-shortcuts button:focus-visible,.wmo-link:focus-visible{outline:3px solid #158b86;outline-offset:2px}
.wmo-title{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:18px 2px 6px}.wmo-title h3{margin:0;color:#18344c;font-size:20px}.wmo-title p{font-size:12px;color:#627789;margin:3px 0 0}.wmo-section{min-width:0}
.wmo-detail{background:#fff;border:1px solid #d3e0e8;border-radius:14px;margin:12px 0;overflow:visible;min-width:0}
.wmo-detail>summary{display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none;font:750 15px system-ui;padding:17px;color:#1b425a;min-height:52px}
.wmo-detail>summary::-webkit-details-marker{display:none}.wmo-detail>summary:after{content:'⌄';margin-left:auto;font-size:22px;font-weight:500;color:#497186}.wmo-detail[open]>summary:after{content:'⌃'}
.wmo-detail-content{padding:0 11px 12px;min-width:0}.wmo-detail-content>#wmqRoot{margin:2px 0}
.wmo-module-title{font-size:14px;margin:15px 2px 7px;color:#244c63;font-weight:780}.wmo-module-sub{font:12px system-ui;color:#607585;margin:0 2px 8px}
.wmo-area-group{padding-bottom:5px}.wmo-area-group .module-grid{margin:0 0 5px;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.wmo-area-group .module-card{text-align:left;min-width:0}
.wmo-crumb{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:12px;padding:0 0 11px;border-bottom:1px solid #dbe6ee}
.wmo-link{border-radius:9px;padding:10px 12px;border:1px solid #bfcfdb;background:#f4f9fc;color:#1a4b64;font-weight:700;font-size:13px;cursor:pointer;min-height:42px}
.wmo-crumb-label{font:700 12px system-ui;color:#617a8a;text-align:right}
.wmo-menu-group{padding:10px 0;border-bottom:1px solid #e0e9ee}.wmo-menu-group strong{display:block;color:#17364b;font-size:14px;margin:1px 0 7px}.wmo-menu-group>button{display:block;width:100%;min-height:43px;text-align:left;background:#f5f9fc;border:1px solid #e1eaf0;border-radius:9px;margin:4px 0;padding:11px 12px;color:#173b53;font-weight:700}
.wmo-menu-group>button:active{background:#dceef1}.wmo-kug-quick{background:#fff8ef!important;border-color:#e4bc88!important}
.wmo-kug-count{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin:10px 0}.wmo-kug-count button{min-width:0;font-size:12px!important;padding:9px 1px!important}
.wmo-daypicks{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin:10px 0}
.wmo-daypicks button{min-width:0;min-height:43px;padding:7px!important}
.wmo-daypicks button[aria-pressed=true],.wmo-kug-count button[aria-pressed=true]{border-color:#168176!important;background:#d0f2e8!important;color:#0d594e!important;box-shadow:inset 0 0 0 1px #2c9e91}
.wmo-tip,.wmo-kug-selected{font-size:12px!important;line-height:1.5;color:#47647a}
.wmo-kug-selected{margin:7px 0 0;font-weight:750!important}
@media(max-width:390px){.wmo-shortcuts{gap:5px}.wmo-shortcuts button{font-size:11px;padding:7px 1px}.wmo-area-group .module-grid{grid-template-columns:1fr}}
@media(min-width:680px){.wmo-shortcuts{max-width:700px}.wmo-shortcuts button{font-size:14px}}
`;document.head.appendChild(st);}
function pageBacks(){document.querySelectorAll('main .page:not(#dashboard)').forEach(page=>{
 if(page.querySelector('.wmo-crumb'))return;
 const header=document.createElement('div');header.className='wmo-crumb';
 const b=document.createElement('button');b.type='button';b.className='wmo-link';b.textContent='← Zur Übersicht';b.addEventListener('click',()=>navigate('dashboard'));
 const title=document.createElement('span');title.className='wmo-crumb-label';title.textContent=pageTitles[page.id]||page.id;
 header.append(b,title);page.insertBefore(header,page.firstChild);
 });}
function reorderMenu(){const sheet=$('moreMenu')?.querySelector('.sheet-card');if(!sheet||sheet.querySelector('.wmo-menu-group'))return;
 const head=sheet.querySelector('.sheet-head');if(head?.querySelector('strong'))head.querySelector('strong').textContent='Alle Bereiche';
 const buttons=[...sheet.querySelectorAll(':scope > button[data-go]')];const byPage=new Map(buttons.map(b=>[b.dataset.go,b]));
 for(const cat of categories){const group=document.createElement('div');group.className='wmo-menu-group';const label=document.createElement('strong');label.textContent=cat.icon+' '+cat.label;group.append(label);
 for(const name of cat.pages){let b=byPage.get(name);if(b)group.append(b);}sheet.append(group);}
 const nav=$('app')?.querySelector('.bottom-nav');if(nav){for(const [name,label] of [['shift','Zeit'],['sickness','AU'],['payroll','Lohn']]){const b=nav.querySelector(`[data-go="${name}"] span`);if(b)b.textContent=label;}}
}
function moveNamedButtons(moduleGrid,host){const source=[...moduleGrid.querySelectorAll(':scope > button[data-go]')];const byName=new Map(source.map(b=>[b.dataset.go,b]));for(const cat of categories){
 const group=document.createElement('section');group.className='wmo-area-group';const h=document.createElement('h4');h.className='wmo-module-title';h.textContent=cat.icon+' '+cat.label;
 const sub=document.createElement('p');sub.className='wmo-module-sub';sub.textContent=cat.sub;
 const grid=document.createElement('div');grid.className='module-grid';
 for(const name of cat.pages){const b=byName.get(name);if(b)grid.append(b);}group.append(h,sub,grid);host.append(group);
 }moduleGrid.remove();}
function arrange(){const dash=$('dashboard');if(!dash||$('wmoLayout')||!$('wmCalRoot')||!$('wmClockHome'))return;
 const hero=dash.querySelector('.dashboard-hero');if(!hero)return;
 const layout=document.createElement('div');layout.id='wmoLayout';
 layout.innerHTML=`
 <nav class="wmo-shortcuts" aria-label="Schnellzugriff auf wichtige Bereiche">
 <button type="button" data-wmo-jump="wmClockHome"><span>◷</span>Stempeluhr</button>
 <button type="button" data-wmo-jump="wmCalRoot"><span>▦</span>Kalender</button>
 <button type="button" data-wmo-jump="wmCalKugQuick"><span>％</span>Kurzarbeit</button>
 <button type="button" data-wmo-jump="wmqRoot"><span>✓</span>Prüfung</button>
 </nav>
 <section id="wmoToday" class="wmo-section"><div class="wmo-title"><div><h3>Arbeitszeit</h3><p>Ein- und ausstempeln, Zeiten nachtragen</p></div></div></section>
 <section id="wmoCalendar" class="wmo-section"><div class="wmo-title"><div><h3>Planung & Fehlzeiten</h3><p>Schichten, Kurzarbeit, Urlaub, AU und Reha</p></div></div></section>
 <details id="wmoQuality" class="wmo-detail"><summary>✓ Arbeitszeit- und Lohnprüfung</summary><div class="wmo-detail-content"></div></details>
 <details id="wmoNumbers" class="wmo-detail"><summary>▤ Vertrag und Kennzahlen</summary><div class="wmo-detail-content"></div></details>
 <details id="wmoMore" class="wmo-detail"><summary>☰ Alle weiteren Bereiche</summary><div class="wmo-detail-content" id="wmoModules"></div></details>
 `;
 hero.insertAdjacentElement('afterend',layout);
 $('wmoToday').append($('wmClockHome'));
 if($('wm195Dashboard'))$('wmoToday').append($('wm195Dashboard'));
 $('wmoCalendar').append($('wmCalRoot'));
 if($('wmqRoot'))$('wmoQuality').querySelector('.wmo-detail-content').append($('wmqRoot'));
 const numbers=$('wmoNumbers').querySelector('.wmo-detail-content');
 for(const selector of ['#employmentCounter','.dashboard-stats','#wmplusUpdateBar','#wmplusUpdateBanner','#wmplusStatus','.privacy-card']){const el=dash.querySelector(selector);if(el)numbers.append(el);}
 const areas=$('wmoModules');if($('wmplusSearch'))areas.append($('wmplusSearch'));const title=dash.querySelector('.dashboard-section-head');if(title)title.remove();
 const grid=dash.querySelector('.module-grid');if(grid)moveNamedButtons(grid,areas);
 layout.querySelectorAll('[data-wmo-jump]').forEach(btn=>btn.addEventListener('click',()=>{
  const id=btn.dataset.wmoJump;if(id==='wmCalKugQuick')$('wmCalEditor').open=true;
  bring(id);
 }));
 // Calendar and quality panels are still mounted; their DOM nodes/handlers were moved, not cloned.
}
function init(){style();reorderMenu();pageBacks();arrange();if(!$('wmoLayout'))console.warn('WorksManager 1.9.20: Kalender/Stempeluhr werden erst nach dem Laden geordnet.');}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
