let currentTerm, snapshot, terms=[], loadVersion=0, listingReady=false;
function readSaved(key){try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function persistSaved(){try{localStorage.setItem(currentTerm.storageKey,JSON.stringify([...saved]))}catch{}}

const $=id=>document.getElementById(id);let dataByCrn=new Map(),data=[],filtered=[],page=1,selectedDays=new Set(),saved=new Set();const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const daysText=s=>String(s||'').split('').map(k=>({M:'Mon',T:'Tue',W:'Wed',R:'Thu',F:'Fri',S:'Sat',U:'Sun'}[k]||k)).join(' ');
const BATCH_SIZE=60;let visibleCount=0,moreObserver;
function rowMarkup(c){return `<tr><td data-label="Course"><strong class="code">${esc(c.subject)} ${esc(c.number)}</strong><div class="course-title">${esc(c.title)}</div><small>Section ${esc(c.section)} · <a href="${esc(c.url)}" target="_blank" rel="noopener">CRN ${esc(c.crn)} ↗</a></small></td><td data-label="Instructor">${esc(c.meetings[0]?.instructor||'Unassigned')}</td><td data-label="Days & time">${c.meetings.map(m=>`<div class="meeting-cell"><strong>${esc(daysText(m.days)||'TBA')}</strong><br>${esc(m.time||'TBA')}</div>`).join('')}</td><td data-label="Room">${c.meetings.map(m=>`<div class="meeting-cell">${esc(m.room||'Unassigned')}</div>`).join('')}</td><td data-label="Dates">${c.meetings.map(m=>`<div class="meeting-cell">${esc(m.dates||'Unassigned')}</div>`).join('')}</td><td data-label="Credits / type">${esc(c.credits)} credits<small>${esc(c.type)}</small><small>${esc(c.level)}</small></td><td data-label="Seats">${c.meetings[0]?.seats!=null?`<strong>${esc(c.meetings[0].seats)} left</strong><small>${esc(c.meetings[0].actual)} / ${esc(c.meetings[0].capacity)} enrolled</small><small>${esc(c.meetings[0].waitlist)} waitlisted</small>`:'Unlisted'}</td><td data-label="Calendar"><button class="add ${saved.has(c.crn)?'saved':''}" data-add="${c.crn}" aria-label="${saved.has(c.crn)?'Remove':'Add'} ${esc(c.subject+' '+c.number+' section '+c.section)}">${saved.has(c.crn)?'✓ Added':'+ Add'}</button></td></tr>`;}
function filterCourses(){
 const q=$('search').value.toLowerCase().trim(), compact=q.replace(/ /g,''),subject=$('subject').value,level=$('level').value,type=$('type').value,after=$('after').value,days=[...selectedDays];
 return data.filter(c=>(!q||c.search.includes(q)||c.compactSearch.includes(compact))&&(!subject||c.subject===subject)&&(!level||c.levels.includes(level))&&(!type||c.type===type)&&(!days.length||c.meetings.some(m=>days.some(d=>m.days.includes(d))))&&(!after||c.meetings.some(m=>m.start&&m.start>=after)));
}
function render(){
 moreObserver?.disconnect();filtered=filterCourses();visibleCount=0;
 $('count').textContent=filtered.length.toLocaleString()+' sections · '+new Set(filtered.map(c=>c.subject+c.number)).size.toLocaleString()+' courses';$('savedCount').textContent=saved.size;
 if(!filtered.length){$('results').innerHTML='<div class="empty">No classes match these filters. Try another search or reset the filters.</div>';return;}
 $('results').innerHTML='<div class="tablewrap" id="courseScroll"><table class="courses"><caption class="sr-only">Matching Boston course sections. Scroll to load more sections.</caption><thead><tr><th>Course / section</th><th>Instructor</th><th>Days & time</th><th>Room</th><th>Dates</th><th>Credits / type</th><th>Seats</th><th>Calendar</th></tr></thead><tbody id="courseRows"></tbody></table><button id="loadMore" class="load-more">Show more sections</button></div>';
 appendRows();$('loadMore').onclick=appendRows;
 if(typeof IntersectionObserver!=='undefined'){moreObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))appendRows()},{root:$('courseScroll'),rootMargin:'600px'});moreObserver.observe($('loadMore'));}
}
function appendRows(){
 const end=Math.min(visibleCount+BATCH_SIZE,filtered.length);if(end===visibleCount)return;
 $('courseRows').insertAdjacentHTML('beforeend',filtered.slice(visibleCount,end).map(rowMarkup).join(''));visibleCount=end;
 $('loadMore').hidden=visibleCount===filtered.length;$('loadMore').textContent=`Show more sections (${visibleCount.toLocaleString()} of ${filtered.length.toLocaleString()})`;
 if(visibleCount===filtered.length)moreObserver?.disconnect();
}
function updateSavedButtons(){
 $('savedCount').textContent=saved.size;
 document.querySelectorAll('[data-add]').forEach(button=>{const selected=saved.has(button.dataset.add);button.classList.toggle('saved',selected);button.textContent=selected?'✓ Added':'+ Add';const c=dataByCrn.get(button.dataset.add);button.setAttribute('aria-label',`${selected?'Remove':'Add'} ${c.subject} ${c.number} section ${c.section}`)});
}


$('results').onclick=e=>{const b=e.target.closest('[data-add]');if(b)toggle(b.dataset.add)};
function toggle(id){saved.has(id)?saved.delete(id):saved.add(id);persistSaved();updateSavedButtons();if(!$('calendar').hidden)renderCalendar()}

let searchTimer;$('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;render()},60)};['subject','level','type','after'].forEach(id=>$(id).onchange=()=>{page=1;render()});$('days').innerHTML=[['M','M'],['T','T'],['W','W'],['R','Th'],['F','F'],['S','Sa'],['U','Su']].map(([d,t])=>`<button data-day="${d}" aria-pressed="false">${t}</button>`).join('');document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{selectedDays.has(b.dataset.day)?selectedDays.delete(b.dataset.day):selectedDays.add(b.dataset.day);b.classList.toggle('selected');b.setAttribute('aria-pressed',selectedDays.has(b.dataset.day));page=1;render()});function resetFilters(){['search','subject','level','type','after'].forEach(id=>$(id).value='');selectedDays.clear();document.querySelectorAll('[data-day]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false')});page=1;}$('reset').onclick=()=>{resetFilters();render()};function tab(cal){$('browse').hidden=cal;$('calendar').hidden=!cal;$('browseTab').classList.toggle('active',!cal);$('calendarTab').classList.toggle('active',cal);if(cal)renderCalendar()}$('browseTab').onclick=()=>tab(false);$('calendarTab').onclick=()=>tab(true);document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();tab(false);$('search').focus()}});
async function selectTerm(term, updateUrl=true){
 const version=++loadVersion;
 currentTerm=term;listingReady=false;snapshot=null;
 data=[];filtered=[];dataByCrn=new Map();saved=new Set();
 moreObserver?.disconnect();clearTimeout(searchTimer);resetFilters();
 $('term').value=term.id;
 $('termLabel').textContent=term.label;
 document.title='Husky Courses · '+term.label;
 document.querySelector('meta[name="description"]').content=`Browse Northeastern Boston ${term.label} classes, instructors, rooms and meeting times. Build a personal weekly course calendar.`;
 $('officialSchedule').href=`https://bnrordsp.neu.edu/ssb-prod/NEUCLSS.p_class_select?STU_TERM_IN=${term.id}`;
 if(updateUrl){const url=new URL(location.href);url.searchParams.set('term',term.id);history.replaceState(null,'',url)}
 $('savedCount').textContent='0';
 $('coverage').textContent=`Loading the ${term.label} snapshot…`;
 $('count').textContent='Loading classes…';
 $('results').innerHTML='<div class="empty">Loading the semester…</div>';
 $('verification').textContent='Loading source information…';
 for(const [id,label] of [['subject','All subjects'],['level','All levels'],['type','All class types']])$(id).replaceChildren(new Option(label,''));
 if(!$('calendar').hidden)renderCalendar();
 try{
  const d=await loadCourses(term);
  if(version!==loadVersion)return;
  if(d.term!==term.id||!Array.isArray(d.courses)||!d.courses.length)throw Error('Unexpected term snapshot');
  snapshot=d;
  data=d.courses.map(c=>{const search=(c.subject+' '+c.number+' '+JSON.stringify(c)).toLowerCase();return {...c,search,compactSearch:search.replace(/ /g,''),levels:c.level.split(', ')}});
  dataByCrn=new Map(data.map(c=>[c.crn,c]));
  saved=new Set(readSaved(term.storageKey).filter(crn=>dataByCrn.has(crn)));
  weekStart=d.calendarStart;
  for(const [id,key] of [['subject','subject'],['level','level'],['type','type']]){
   [...new Set(data.flatMap(c=>key==='level'?c.level.split(', '):[c[key]]))].filter(Boolean).sort().forEach(v=>$(id).add(new Option(id==='subject'?(d.subjects[v]||v):v,v)));
  }
  $('coverage').textContent=`${data.length.toLocaleString()} Boston sections · Official Banner snapshot · Checked ${d.checkedAt||d.retrieved}`;
  $('verification').innerHTML=`<p>${esc(d.verification?.summary||'Source: Northeastern Banner.')}</p><p>${esc(d.verification?.detailSummary||'')}</p><p>Scope: all ${Object.keys(d.subjects).length} subject options, Boston campus, ${esc(term.label)} Semester (${term.id}). Dates, instructors, rooms, and meeting times are taken from Banner. TBA means Banner has not assigned that information.</p>`;
  listingReady=true;render();if(!$('calendar').hidden)renderCalendar();
 }catch(error){
  if(version!==loadVersion)return;
  $('coverage').textContent=`${term.label} snapshot unavailable`;
  $('count').textContent='Listing unavailable';
  $('verification').textContent='Source information unavailable.';
  $('results').innerHTML='<div class="empty">The course listing could not load. Please reload or use the official schedule above.</div>';
  if(!$('calendar').hidden)$('calendar').innerHTML=$('results').innerHTML;
 }
}
async function initialize(){
 try{
  const response=await fetch('terms.json');if(!response.ok)throw Error('Terms unavailable');
  const manifest=await response.json();terms=manifest.terms;
  $('term').replaceChildren(...terms.map(term=>new Option(term.label,term.id)));
  $('term').disabled=false;
  $('term').onchange=()=>selectTerm(terms.find(term=>term.id===$('term').value));
  const requested=new URLSearchParams(location.search).get('term');
  await selectTerm(terms.find(term=>term.id===requested)||terms.find(term=>term.id===manifest.defaultTerm)||terms[0],false);
 }catch{
  $('count').textContent='Listing unavailable';$('coverage').textContent='Course snapshots unavailable';
  $('results').innerHTML='<div class="empty">The course listing could not load. Please reload or use the official schedule above.</div>';
 }
}

let weekStart='';const dayKeys=['M','T','W','R','F','S','U'];const datePlus=(s,n)=>{let d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};const mins=t=>Number(t.split(':')[0])*60+Number(t.split(':')[1]);const chosen=()=>[...saved].map(id=>dataByCrn.get(id)).filter(Boolean);
function renderCalendar(){if(!listingReady){$('calendar').innerHTML='<div class="empty">The semester listing is not loaded yet. Browse classes to check its status.</div>';return}let list=chosen(),events=[];for(let c of list)for(let m of c.meetings)if(m.start&&m.end)for(let d=0;d<7;d++){let date=datePlus(weekStart,d);if(m.days.includes(dayKeys[d])&&date>=m.dateStart&&date<=m.dateEnd)events.push({c,m,d,start:mins(m.start),end:mins(m.end)})}const low=Math.min(8,...events.map(e=>Math.floor(e.start/60))),high=Math.max(22,...events.map(e=>Math.ceil(e.end/60))),height=(high-low)*60;let conflicts=new Set();for(let a of events)for(let b of events)if(a!==b&&a.d===b.d&&a.start<b.end&&b.start<a.end){a.conflict=true;conflicts.add(a.c.crn)}
for(let d=0;d<7;d++){let sorted=events.filter(e=>e.d===d).sort((a,b)=>a.start-b.start),group=[],end=0;const place=()=>{let lanes=[];for(let e of group){let lane=lanes.findIndex(x=>x<=e.start);if(lane<0)lane=lanes.length;lanes[lane]=e.end;e.lane=lane}group.forEach(e=>e.lanes=lanes.length)};for(let e of sorted){if(e.start>=end){place();group=[];end=0}group.push(e);end=Math.max(end,e.end)}place()}
const fmt=s=>new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});$('calendar').innerHTML=`<div class="caltoolbar"><div><strong>${fmt(weekStart)} – ${fmt(datePlus(weekStart,6))}</strong><small>${list.length} selected sections · America/New_York</small></div><div><button class="control" id="weekPrev" aria-label="Previous week">←</button> <button class="control" id="weekNext" aria-label="Next week">→</button> <button class="control" id="export" ${!list.length?'disabled':''}>Export .ics ↓</button></div></div>${conflicts.size?`<p class="calnote" style="color:#986000">⚠ ${conflicts.size} sections have overlapping meeting times this week.</p>`:''}${!list.length?'<div class="empty"><strong>Your week starts here.</strong><p>Add classes from Browse classes to compare their schedules.</p><button class="control" id="findClasses">Browse classes →</button></div>':''}<div class="calwrap"><div class="week"><div class="dayhead">ET</div>${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((n,d)=>`<div class="dayhead">${n}<small>${fmt(datePlus(weekStart,d))}</small></div>`).join('')}<div class="timecol" style="height:${height}px">${Array.from({length:high-low},(_,i)=>`<span style="top:${i*60}px">${(i+low)%12||12}${i+low>=12?'p':'a'}</span>`).join('')}</div>${dayKeys.map((k,d)=>`<div class="daycol" style="height:${height}px">${events.filter(e=>e.d===d).map(e=>`<div class="event ${e.conflict?'conflict':''}" style="top:${e.start-low*60}px;height:${e.end-e.start}px;left:calc(${e.lane/e.lanes*100}% + 2px);width:calc(${100/e.lanes}% - 4px)" tabindex="0" title="${esc(e.c.title+' · '+e.m.time+' · '+e.m.room)}"><strong>${esc(e.c.subject+' '+e.c.number)}</strong>${esc(e.m.time)}<br>${esc(e.m.room)}</div>`).join('')}</div>`).join('')}</div></div><p class="calnote">Regular meeting schedule. University holidays, cancellations, and exam schedules are not applied. Verify dates with the <a href="https://registrar.northeastern.edu/article/academic-calendar/" target="_blank" rel="noopener">academic calendar</a>. Selections are saved on this device; adding a class does not register you.</p>${list.map(c=>`<div class="savedrow"><div><strong>${esc(c.subject+' '+c.number)}</strong> · ${esc(c.title)}<small>Section ${esc(c.section)} · ${c.crn}${c.meetings.every(m=>!m.start)?' · Meeting time unassigned':''}${!events.some(e=>e.c.crn===c.crn)&&c.meetings.some(m=>m.start)?' · No meetings scheduled this week':''}</small></div><button class="textbutton" data-remove="${c.crn}">Remove</button></div>`).join('')}`;$('weekPrev').onclick=()=>{weekStart=datePlus(weekStart,-7);renderCalendar()};$('weekNext').onclick=()=>{weekStart=datePlus(weekStart,7);renderCalendar()};$('export').onclick=exportCalendar;if($('findClasses'))$('findClasses').onclick=()=>tab(false);document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>toggle(b.dataset.remove));}
function exportCalendar(){const escapeIcs=s=>String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');let lines=['BEGIN:VCALENDAR','VERSION:2.0',`PRODID:-//Husky Courses//${currentTerm.label}//EN`,'CALSCALE:GREGORIAN',`X-WR-CALNAME:Husky Courses ${currentTerm.label}`,'X-WR-TIMEZONE:America/New_York','BEGIN:VTIMEZONE','TZID:America/New_York','BEGIN:DAYLIGHT','DTSTART:20070311T020000','TZOFFSETFROM:-0500','TZOFFSETTO:-0400','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU','END:DAYLIGHT','BEGIN:STANDARD','DTSTART:20071104T020000','TZOFFSETFROM:-0400','TZOFFSETTO:-0500','RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU','END:STANDARD','END:VTIMEZONE'];let n=0;for(let c of chosen())for(let [i,m] of c.meetings.entries()){if(!m.start||!m.dateStart)continue;let days=dayKeys.filter(k=>m.days.includes(k));if(!days.length)continue;let first=m.dateStart;while(!days.includes(dayKeys[(new Date(first+'T12:00:00Z').getUTCDay()+6)%7]))first=datePlus(first,1);if(first>m.dateEnd)continue;let date=first.replaceAll('-','');lines.push('BEGIN:VEVENT',`UID:${c.crn}-${i}-${currentTerm.id}@huskycourses`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;TZID=America/New_York:${date}T${m.start.replace(':','')}00`,`DTEND;TZID=America/New_York:${date}T${m.end.replace(':','')}00`,`RRULE:FREQ=WEEKLY;BYDAY=${days.map(d=>['MO','TU','WE','TH','FR','SA','SU'][dayKeys.indexOf(d)]).join(',')};UNTIL=${datePlus(m.dateEnd,1).replaceAll('-','')}T045959Z`,'SUMMARY:'+escapeIcs(c.subject+' '+c.number+' · '+c.title),'LOCATION:'+escapeIcs(m.room),'DESCRIPTION:'+escapeIcs('Instructor: '+m.instructor+'. CRN '+c.crn+'. Banner snapshot '+(snapshot.checkedAt||snapshot.retrieved)+'. Regular meetings only: holidays and cancellations are not excluded. Confirm with the official schedule.'),'END:VEVENT');n++}if(!n){$('toast').textContent='Selected classes have no assigned meeting times to export.';$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',4500);return}lines.push('END:VCALENDAR');let url=URL.createObjectURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='husky-courses-'+currentTerm.label.toLowerCase().replaceAll(' ','-')+'.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
if(document.modelContext?.registerTool){const lifecycle=new AbortController();for(const tool of [{name:'search_courses',description:'Search the currently selected Boston semester course listing and update visible results.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:false},execute:({query})=>{if(typeof query!=='string')throw Error('query must be text');$('search').value=query;page=1;tab(false);render();return {count:filtered.length,sections:filtered.slice(0,20).map(c=>({crn:c.crn,course:c.subject+' '+c.number,title:c.title,meetings:c.meetings}))}}},{name:'set_calendar_sections',description:'Replace this device’s selected calendar sections with the supplied CRNs.',inputSchema:{type:'object',properties:{crns:{type:'array',items:{type:'string'}}},required:['crns'],additionalProperties:false},annotations:{readOnlyHint:false},execute:({crns})=>{if(!listingReady)throw Error('Wait for the semester listing to load');if(!Array.isArray(crns)||crns.some(id=>!data.some(c=>c.crn===id)))throw Error('Every CRN must exist in the loaded listing');saved=new Set(crns);persistSaved();updateSavedButtons();tab(true);return {selected:[...saved]}}}]){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true})}

async function loadCourses(term){
 if(typeof DecompressionStream!=='undefined'){
  try{const response=await fetch(term.compressed);if(!response.ok||!response.body)throw Error('Compressed listing unavailable');return await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();}catch{}
 }
 const response=await fetch(term.file);if(!response.ok)throw Error('Listing unavailable');return response.json();
}

initialize();
