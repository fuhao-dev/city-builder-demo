const assert=require('node:assert/strict'), S=require('./saves.js'), C=require('./cloud-save.js');
let passed=0;
function eq(a,b){assert.deepEqual(a,b);passed++;}
function ok(v){assert.ok(v);passed++;}
async function bad(p,re){await assert.rejects(p,re);passed++;}
function fixture(promiseMode=false){
  let time=0, serial=0, rows=[], files=new Map(), calls=[], failure=null, hold=null;
  const values=new Map(), storage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  function invoke(name,fn){return args=>{
    calls.push({name,args});
    const run=()=>{if(failure&&failure.name===name){const e=failure.error;failure=null;throw e;}return fn(args);};
    if(hold===name) return;
    if(promiseMode&&name!=='writeFile'&&name!=='readFile')return Promise.resolve().then(run);
    queueMicrotask(()=>{try{args.success(run());}catch(e){args.fail(e);}});
  };}
  const manager={
    getArchiveList:invoke('list',()=>({saves:structuredClone(rows)})),
    createArchive:invoke('create',a=>{const row={...a.archiveMetaData,uuid:'uuid-1',fileId:'file-'+(++serial),modifiedTime:Math.floor(time/1000),saveSize:Buffer.byteLength(files.get(a.archiveFilePath))};rows=[row];files.set(row.fileId,files.get(a.archiveFilePath));return{uuid:row.uuid,fileId:row.fileId};}),
    updateArchive:invoke('update',a=>{eq(a.archiveUUID,'uuid-1'); const row={...a.archiveMetaData,uuid:a.archiveUUID,fileId:'file-'+(++serial),modifiedTime:Math.floor(time/1000)};rows=[row];files.set(row.fileId,files.get(a.archiveFilePath));return{uuid:row.uuid,fileId:row.fileId};}),
    getArchiveData:invoke('download',a=>{eq(a.archiveUUID,'uuid-1');eq(a.archiveFileId,rows[0].fileId);files.set(a.targetFilePath,files.get(a.archiveFileId));return{filePath:a.targetFilePath};})
  };
  const fs={writeFile:invoke('writeFile',a=>{eq(a.encoding,'utf8');ok(a.filePath.startsWith('tapfile://usr/'));files.set(a.filePath,a.data);return{};}),readFile:invoke('readFile',a=>{eq(a.encoding,'utf8');return{data:files.get(a.filePath)};})};
  const env={localStorage:storage,tap:{env:{USER_DATA_PATH:'tapfile://usr'},getCloudSaveManager:()=>manager,getFileSystemManager:()=>fs}};
  return{env,storage,manager,calls,files,now:()=>time,tick:ms=>{time+=ms;},setRows:r=>{rows=r;},rows:()=>structuredClone(rows),fail:(name,error)=>{failure={name,error};},hold:name=>{hold=name;}};
}
(async()=>{
  const blank=fixture(), bundle=S.capture(blank.storage,undefined,1234);
  for(const promiseMode of [false,true]){
    const f=fixture(promiseMode), c=C.create(f.env,{now:f.now});
    eq(c.getState().cooldown,0);eq(f.calls.length,0);eq(c.getState().supported,true);
    eq(await c.refresh(),[]);await c.refresh();eq(f.calls.filter(v=>v.name==='list').length,1);
    await c.upload(bundle,null);eq(c.getState().cooldown,60);eq(f.calls.filter(v=>v.name==='create').length,1);
    const create=f.calls.find(v=>v.name==='create').args;
    eq(create.archiveMetaData.name,C.archiveName);ok(/^[A-Za-z0-9_]+$/.test(create.archiveMetaData.name));
    ok(S.bytes(create.archiveMetaData.name)<=60);ok(S.bytes(create.archiveMetaData.summary)<=500);ok(S.bytes(create.archiveMetaData.extra)<=1000);
    ok(!('playtime' in create.archiveMetaData));ok(!('archiveCoverPath' in create));
    eq(await c.download(c.getState().archives[0]),bundle); // Reads do not consume upload cooldown.
    await bad(c.upload(bundle,c.getState().archives[0]),/60 秒/);
    const reloaded=C.create(f.env,{now:f.now});eq(reloaded.getState().cooldown,60);
    f.tick(59999);eq(reloaded.getState().cooldown,1);f.tick(1);
    await reloaded.upload(bundle,f.rows()[0]);eq(f.calls.filter(v=>v.name==='create').length,1);eq(f.calls.filter(v=>v.name==='update').length,1);
    eq(reloaded.getState().archives[0].uuid,'uuid-1');eq(reloaded.getState().archives[0].fileId,'file-2');
    f.tick(60000);let expected=f.rows()[0];f.setRows([{...expected,fileId:'other-device'}]);
    await bad(reloaded.upload(bundle,expected),/其他设备/);eq(reloaded.getState().cooldown,0);
    await bad(reloaded.download(expected),/变化/);
    expected=f.rows()[0];f.setRows([expected,{...expected,uuid:'duplicate'}]);await bad(reloaded.upload(bundle,expected),/多个同名/);
    f.setRows([{...expected,saveSize:S.maxBytes+1}]);await bad(reloaded.download(f.rows()[0]),/10 MB/);
  }
  // Failed/uncertain upload attempts still consume the shared persisted quota.
  for(const code of [400000,400001,400002,400003,400005,400006,400007,400008,400009,400100,400101,1300202]){
    const f=fixture(),c=C.create(f.env,{now:f.now});f.fail('create',{errno:code,errMsg:'platform error'});
    await bad(c.upload(bundle,null),/./);eq(c.getState().cooldown,60);eq(C.create(f.env,{now:f.now}).getState().cooldown,60);
    eq(c.getState().busy,false);eq(f.calls.filter(v=>v.name==='create').length,1);
  }
  // Result unknown: the next upload checks the list and refuses accidental duplicate creation.
  const uncertain=fixture(),u=C.create(uncertain.env,{now:uncertain.now});uncertain.fail('create',{errno:400006});
  await bad(u.upload(bundle,null),/待确认/);eq(u.getState().uncertain,true);
  uncertain.tick(60000);uncertain.setRows([{name:C.archiveName,uuid:'uuid-1',fileId:'uploaded-after-timeout',modifiedTime:12}]);
  await bad(u.upload(bundle,null),/其他设备/);eq(uncertain.calls.filter(v=>v.name==='create').length,1);eq(u.getState().uncertain,false);
  // FS errors do not spend the cloud quota; upload metadata must persist before a network upload.
  const fs=fixture(),fsCloud=C.create(fs.env,{now:fs.now});fs.fail('writeFile',{errno:1300202});await bad(fsCloud.upload(bundle,null),/空间不足/);
  eq(fsCloud.getState().cooldown,0);eq(fs.calls.some(v=>v.name==='create'),false);
  const denied=fixture();denied.storage.setItem=()=>{throw new Error('quota');};await bad(C.create(denied.env,{now:denied.now}).upload(bundle,null),/quota/);eq(denied.calls.some(v=>v.name==='create'),false);
  // A delayed SDK call cannot overlap another operation on the adapter.
  const busy=fixture();busy.hold('list');const b=C.create(busy.env,{now:busy.now});void b.refresh();eq(b.getState().busy,true);await bad(b.refresh(),/等待/);await bad(b.upload(bundle,null),/等待/);eq(busy.calls.length,1);
  // Web Locks prevent distinct tabs/adapter instances from overlapping.
  const locked=fixture();locked.env.navigator={locks:{request:async(n,o,fn)=>{eq(n,'loop-town-cloud-save');eq(o.ifAvailable,true);return fn(null);}}};
  await bad(C.create(locked.env,{now:locked.now}).refresh(),/另一窗口/);eq(locked.calls.length,0);
  const available=fixture();available.env.navigator={locks:{request:async(n,o,fn)=>fn({name:n})}};eq(await C.create(available.env,{now:available.now}).refresh(),[]);
  const unsupported=C.create({localStorage:blank.storage});eq(unsupported.getState().supported,false);await bad(unsupported.refresh(),/TapTap/);
  const init=fixture();init.env.tap.getCloudSaveManager=()=>({});const initCloud=C.create(init.env);await bad(initCloud.refresh(),/完整/);await bad(initCloud.refresh(),/完整/);
  const invalid=fixture();invalid.manager.getArchiveList=a=>a.success({saves:null});await bad(C.create(invalid.env).refresh(),/无效/);
  const download=fixture(),dc=C.create(download.env,{now:download.now});await dc.upload(bundle,null);
  const archive=dc.getState().archives[0];download.setRows([{...download.rows()[0],modifiedTime:999999}]);
  eq(await dc.download(archive),bundle); // Provider revision, not client/server clock equality.
  download.files.set(archive.fileId,'corrupt');await bad(dc.download(download.rows()[0]),/JSON/);
  download.fail('readFile',{errno:400101});await bad(dc.download(download.rows()[0]),/文件/);
  download.tick(60000);download.fail('update',{errno:400005});await bad(dc.upload(bundle,download.rows()[0]),/空间/);eq(dc.getState().cooldown,60);
  eq(download.calls.filter(v=>v.name==='create').length,1);
  console.log('TapTap cloud-save contract: '+passed+' assertions passed (mock SDK, not a live account)');
})().catch(e=>{console.error(e);process.exitCode=1;});
