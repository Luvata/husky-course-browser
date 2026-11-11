// Run with jsdom installed: node --test tests/test-app.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {Script} = require('node:vm');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'terms.json')));
const snapshots = Object.fromEntries(manifest.terms.map(t => [t.id, JSON.parse(fs.readFileSync(path.join(root, t.file)))]));
const regular = id => snapshots[id].courses.find(c => c.meetings.some(m => m.start && m.days && m.dateStart.startsWith(id === '202730' ? '2027-01' : '2026-09')));

async function waitFor(condition){
  for(let i=0;i<200;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,5));}
  throw Error('Timed out waiting for app');
}
async function boot(query='', {fallback=false, saved={}}={}){
  const dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'), {url:'https://example.test/husky-course-browser/'+query, runScripts:'outside-only'});
  const w=dom.window;
  for(const [key,value] of Object.entries(saved))w.localStorage.setItem(key,JSON.stringify(value));
  w.fetch=async filename=>fallback && filename.endsWith('.bin') ? new Response('',{status:503}) : new Response(fs.readFileSync(path.join(root,filename)));
  w.DecompressionStream=DecompressionStream;w.Response=Response;w.Blob=Blob;
  w.URL.createObjectURL=blob=>{w.exportedBlob=blob;return 'blob:test'};
  w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){w.downloadName=this.download};
  new Script(fs.readFileSync(path.join(root,'app.js'),'utf8')).runInContext(dom.getInternalVMContext());
  await waitFor(()=>w.eval('listingReady'));
  return {dom,w};
}

function switchTo(w,id){return w.eval(`selectTerm(terms.find(t=>t.id==='${id}'))`)}

test('legacy Fall selections survive switching; Spring selections stay separate',async()=>{
  const fall=regular('202710'),spring=regular('202730');
  const {dom,w}=await boot('',{saved:{'husky-fall26':[fall.crn]}});
  try{
    assert.equal(w.document.querySelector('#savedCount').textContent,'1');
    await switchTo(w,'202730');
    assert.equal(w.document.querySelector('#savedCount').textContent,'0');
    w.toggle(spring.crn);
    assert.deepEqual(JSON.parse(w.localStorage.getItem('husky-202730')),[spring.crn]);
    await switchTo(w,'202710');
    assert.deepEqual([...w.eval('saved')],[fall.crn]);
    await switchTo(w,'202730');
    assert.deepEqual([...w.eval('saved')],[spring.crn]);
    assert.equal(new URL(w.location.href).searchParams.get('term'),'202730');
  }finally{dom.window.close()}
});

test('Spring deep link, search, calendar and ICS use Spring data, including JSON fallback',async()=>{
  const {dom,w}=await boot('?term=202730',{fallback:true});
  try{
    assert.equal(w.document.title,'Husky Courses · Spring 2027');
    assert.match(w.document.querySelector('#officialSchedule').href,/STU_TERM_IN=202730/);
    w.document.querySelector('#search').value='EECE';w.render();
    assert.ok(w.eval('filtered.length')>0);
    assert.ok([...w.eval('filtered')].every(c=>c.search.includes('eece')));
    const section=regular('202730');w.toggle(section.crn);w.tab(true);
    assert.match(w.document.querySelector('.caltoolbar').textContent,/2027/);
    assert.ok(w.document.querySelector('.event'));
    w.exportCalendar();
    const ics=await w.exportedBlob.text();
    assert.equal(w.downloadName,'husky-courses-spring-2027.ics');
    assert.match(ics,/X-WR-CALNAME:Husky Courses Spring 2027/);
    assert.match(ics,/UID:\d+-\d+-202730@huskycourses/);
    assert.match(ics,/DTSTART;TZID=America\/New_York:202701/);
    assert.ok(ics.includes(snapshots['202730'].checkedAt.replace(/,/g,'\\,')));
    assert.doesNotMatch(ics,/Fall 2026|September 10 2026|202710@/);
  }finally{dom.window.close()}
});

test('a slow earlier term response cannot overwrite the most recently selected term',async()=>{
  const {dom,w}=await boot();
  try{
    const originalFetch=w.fetch;let release;
    const springFile=manifest.terms.find(t=>t.id==='202730').compressed;
    w.fetch=filename=>filename===springFile ? new Promise(resolve=>{release=()=>resolve(originalFetch(filename))}) : originalFetch(filename);
    const pendingSpring=switchTo(w,'202730');
    await switchTo(w,'202710');
    release();await pendingSpring;
    assert.equal(w.eval('currentTerm.id'),'202710');
    assert.equal(w.eval('snapshot.term'),'202710');
    assert.equal(w.eval('data.length'),snapshots['202710'].courses.length);
  }finally{dom.window.close()}
});

test('failed term loading clears old courses and preserves stored selections',async()=>{
  const fall=regular('202710');
  const {dom,w}=await boot('',{saved:{'husky-fall26':[fall.crn]}});
  try{
    w.tab(true);w.fetch=async()=>new Response('',{status:503});
    await switchTo(w,'202730');
    assert.equal(w.eval('data.length'),0);
    assert.equal(w.eval('listingReady'),false);
    assert.match(w.document.querySelector('#calendar').textContent,/could not load/);
    assert.deepEqual(JSON.parse(w.localStorage.getItem('husky-fall26')),[fall.crn]);
  }finally{dom.window.close()}
});
