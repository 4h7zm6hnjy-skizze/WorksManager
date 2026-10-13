/* WorksManager 1.9.20 – geschätztes Netto auf der Startseite.
 * Verwendet ausschließlich die verschlüsselten lokalen Lohnprofilangaben;
 * keine externen Abfragen, keine personenbezogenen Konstanten.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id), eur=v=>(Number(v)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const month=()=>{const t=new Date();return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`};
function mount(){if($('wmNetRoot'))return true;const home=$('wmoToday')||$('dashboard');if(!home)return false;
 const st=document.createElement('style');st.id='wmNetStyle';st.textContent=`.wmnet{border:1px solid #b5d8c7;background:#f3fcf7;border-radius:15px;margin:12px 0;padding:14px;color:#183b2d}.wmnet-top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.wmnet-top h3{margin:0;color:#194d36;font-size:17px}.wmnet-pill{font-size:11px;font-weight:700;background:#d6ede0;border-radius:20px;padding:4px 8px}.wmnet-value{display:block;font-weight:850;font-size:27px;line-height:1.35;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.wmnet-caption,.wmnet-warning{font-size:12px;line-height:1.5;margin:5px 0;color:#436555}.wmnet-lines{display:flex;flex-wrap:wrap;gap:8px 15px;font-size:12px;margin:6px 0}.wmnet-button{background:white;color:#245e49;border:1px solid #9bbbab;border-radius:9px;padding:10px 12px;cursor:pointer;font-weight:750;min-height:44px}.wmnet-current{border-top:1px solid #d4e5da;margin-top:10px;padding-top:10px}.wmnet-current strong{font-variant-numeric:tabular-nums}.wmnet[hidden]{display:none!important}`;document.head.append(st);
 const el=document.createElement('section');el.id='wmNetRoot';el.className='wmnet';el.setAttribute('aria-label','Netto-Schätzung');el.innerHTML=`<div class="wmnet-top"><h3>Geschätztes Monatsnetto</h3><span class="wmnet-pill">Unverbindlich</span></div><strong class="wmnet-value" id="wmNetNumber">—</strong><p class="wmnet-caption" id="wmNetCaption">Lohndaten werden geladen.</p><div class="wmnet-lines" id="wmNetFamily"></div><div class="wmnet-current" id="wmNetCurrent" hidden></div><p class="wmnet-warning">Schätzung aus Vertragsstunden, Steuerklasse und Abgaben; ohne Sonderzahlungen, Schichtzuschläge und Kurzarbeitergeld. Nicht die tatsächliche Auszahlung.</p><button type="button" id="wmNetSettings" class="wmnet-button">Netto & Familienangaben bearbeiten →</button>`;
 const clock=$('wmClockHome');if(clock&&clock.parentElement===home)clock.insertAdjacentElement('afterend',el);else home.append(el);
 $('wmNetSettings').onclick=()=>{if(typeof go==='function')go('payroll');else document.querySelector('[data-go="payroll"]')?.click();const section=$('wmpayRoot')?.querySelector('details.wmpay-group');if(section){section.open=true;setTimeout(()=>section.scrollIntoView({block:'start',behavior:'smooth'}),50);}};
 return true;
}
function refresh(){if($('app')?.classList.contains('hidden'))return;if(!mount())return;
 const data=window.WMNettoEstimator?.(month());if(!data||!data.available){$('wmNetNumber').textContent='—';$('wmNetCaption').textContent=data?.message||'Lohnmodul noch nicht geladen.';$('wmNetFamily').textContent='';$('wmNetCurrent').hidden=true;return;}
 $('wmNetNumber').textContent=eur(data.net);$('wmNetCaption').textContent=`Prognose eines normalen Vertragsmonats · Brutto ${eur(data.gross)} · Steuerklasse ${data.taxClass}.`;
 const married=data.maritalStatus==='yes'?'Verheiratet: Ja':data.maritalStatus==='no'?'Verheiratet: Nein':'Verheiratet: noch nicht gewählt';
 $('wmNetFamily').textContent=`${married} · Kinder: ${Math.max(0,data.childrenCount)} · für PV unter 25: ${Math.max(0,data.childrenUnder25)}. Alles unter „Lohn & Abrechnung“ änderbar.`;
 const current=$('wmNetCurrent');if(data.current&&(data.current.gross>0||data.current.hours>0)){current.hidden=false;current.innerHTML='';const label=document.createElement('span');label.textContent=`Gespeicherter Lohnmonat ${data.month}: `;const bold=document.createElement('strong');bold.textContent=eur(data.current.net);current.append(label,bold);const note=document.createElement('p');note.className='wmnet-caption';note.textContent='Auf Grundlage der bisher gespeicherten Abrechnungsstunden und Zuschläge; kein hochgerechneter Monatsendwert.';current.append(note);}else current.hidden=true;
}
function init(){mount();refresh();if(typeof window.renderAll==='function'){const base=window.renderAll;window.renderAll=function(...args){const result=base.apply(this,args);queueMicrotask(refresh);return result;};}
 for(const evt of ['wm-netto-updated','wm-payroll-rate-updated','wm-clock-payroll-synced','wm-calendar-payroll-updated'])document.addEventListener(evt,()=>queueMicrotask(refresh));window.addEventListener('pageshow',()=>queueMicrotask(refresh));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
