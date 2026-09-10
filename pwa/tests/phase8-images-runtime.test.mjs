import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const api=await vite.ssrLoadModule('/lib/phase8-images.ts');
const OWNER='00000000-0000-4000-8000-000000000002',OTHER='00000000-0000-4000-8000-000000000099',ARTICLE='10000000-0000-4000-8000-000000000001',ASSET='20000000-0000-4000-8000-000000000001';
function row(patch={}) {return {id:ASSET,user_id:OWNER,article_id:ARTICLE,asset_type:'inline',status:'ready',storage_bucket:'article-assets',storage_path:`${OWNER}/${ARTICLE}/${ASSET}.png`,mime_type:'image/png',original_filename:'image.png',size_bytes:8,width:1,height:1,checksum_sha256:'a'.repeat(64),sort_order:1,insertion_marker:'after-heading',alt_text:'original',created_at:'2026-09-08T00:00:00.000001+00:00',updated_at:'2026-09-08T00:00:00.000002+00:00',...patch};}
const parsed=(patch={})=>api.parseImageAsset(row(patch),OWNER,ARTICLE);
const info={assetType:'inline',sortOrder:1,insertionMarker:'after-heading',altText:'original'};
const file=new File([Uint8Array.from([137,80,78,71,13,10,26,10])],'image.png',{type:'image/png'});
const image={file,mimeType:'image/png',checksum:'a'.repeat(64),width:1,height:1};
function setup(options={}) {
 const calls=[];let rows=options.rows??[row()];
 const client={
  auth:{async getUser(){calls.push(['auth']);return {data:{user:{id:options.actor??OWNER}},error:null};}},
  from(table){const steps=[];return {select(v){steps.push(['select',v]);return this},eq(k,v){steps.push(['eq',k,v]);return this},order(k,v){steps.push(['order',k,v]);return this},limit(v){steps.push(['limit',v]);return this},then(resolve,reject){calls.push(['query',table,steps]);return Promise.resolve({data:rows,error:null}).then(resolve,reject)}};},
  async rpc(name,params){calls.push(['rpc',name,params]);
   if(name==='can_access_product')return {data:options.access!==false,error:null};
   if(options.rpc?.[name])return options.rpc[name](params);
   if(name==='prepare_article_asset_checked'){rows=[row({status:'pending_upload',width:null,height:null})];return {data:rows[0],error:null};}
   if(name==='transition_article_asset_checked'){
    if(params.p_action==='cancel_pending'||params.p_action==='finalize_delete')return {data:{deleted_asset_id:ASSET},error:null};
    return {data:{asset:row({status:params.p_action==='finalize'?'ready':'delete_pending',updated_at:'2026-09-08T00:00:00.000003+00:00'})},error:null};
   }
   if(name==='update_article_assets_metadata')return {data:rows,error:null};
   throw Error('unexpected RPC');
  },
  storage:{from(bucket){return {async upload(path,file,config){calls.push(['upload',bucket,path,file.size,config]);if(options.throwUpload)throw Error('network response lost');return {data:null,error:options.uploadError??null};},async remove(paths){calls.push(['remove',bucket,paths]);return {data:[],error:options.removeError??null};},async createSignedUrl(path,seconds){calls.push(['sign',bucket,path,seconds]);return {data:{signedUrl:options.signedUrl??`https://db.example.test/storage/v1/object/sign/${bucket}/${path}?token=private`},error:null};}}}}
 };
 return {ctx:{client,ownerId:OWNER,articleId:ARTICLE,revision:3},calls};
}

test('image list uses owned metadata only and rejects incomplete or mismatched responses',async()=>{
 const {ctx,calls}=setup();const assets=await api.listArticleImages(ctx);assert.equal(assets[0].updatedAt,'2026-09-08T00:00:00.000002+00:00');
 assert.ok(calls.find(c=>c[0]==='query')[2].some(s=>s[0]==='eq'&&s[1]==='user_id'&&s[2]===OWNER));assert.ok(!api.IMAGE_COLUMNS.includes('body'));
 for(const rows of [[row({user_id:OTHER})],[row({storage_path:'wrong/path.png'})],[row(),row()],Array.from({length:1000},()=>row())]) await assert.rejects(()=>api.listArticleImages(setup({rows}).ctx));
});
test('auth and entitlement refusal occurs before metadata or Storage access',async()=>{
 for(const options of [{actor:OTHER},{access:false}]){const {ctx,calls}=setup(options);await assert.rejects(()=>api.listArticleImages(ctx));await assert.rejects(()=>api.uploadArticleImage(ctx,image,info));assert.ok(!calls.some(c=>['query','upload','remove','sign'].includes(c[0])));}
});
test('file signature and 10 MiB limit reject unsupported or oversized inputs',()=>{
 assert.equal(api.detectImageMime(Uint8Array.from([137,80,78,71,13,10,26,10])),'image/png');assert.equal(api.detectImageMime(Uint8Array.from([255,216,255,0])),'image/jpeg');
 assert.throws(()=>api.detectImageMime(new TextEncoder().encode('<svg>unsafe</svg>')));assert.throws(()=>api.detectImageMime(new Uint8Array(10*1024*1024+1)));
});
test('metadata validation preserves cover/inline and size contracts',()=>{
 assert.throws(()=>api.validateImageMetadata({...info,insertionMarker:''}));assert.throws(()=>api.validateImageMetadata({...info,assetType:'cover'}));assert.throws(()=>api.validateImageMetadata({...info,altText:'x'.repeat(2001)}));assert.throws(()=>api.validateImageMetadata({...info,sortOrder:-1}));assert.equal(api.validateImageMetadata({...info,insertionMarker:'  heading  '}).insertionMarker,'heading');
});
test('atomic metadata update sends original microsecond versions and no storage fields',async()=>{
 const {ctx,calls}=setup();const original=parsed();await api.saveImageMetadata(ctx,[{asset:original,sortOrder:2,insertionMarker:'next',altText:'new'}]);const params=calls.find(c=>c[1]==='update_article_assets_metadata')[2];assert.deepEqual(params.p_changes,[{id:ASSET,expected_updated_at:original.updatedAt,sort_order:2,insertion_marker:'next',alt_text:'new'}]);assert.ok(!calls.some(c=>['upload','remove'].includes(c[0])));
});
test('metadata conflict leaves caller draft unchanged',async()=>{
 const {ctx}=setup({rpc:{update_article_assets_metadata:()=>({data:null,error:{code:'40001',status:409}})}});const draft={asset:parsed(),sortOrder:2,insertionMarker:'next',altText:'unsaved'};const before=structuredClone(draft);await assert.rejects(()=>api.saveImageMetadata(ctx,[draft]),e=>e.category==='conflict');assert.deepEqual(draft,before);
});
test('upload prepares a new identity and never uses upsert',async()=>{
 const {ctx,calls}=setup();const result=await api.uploadArticleImage(ctx,image,info);assert.equal(result.status,'ready');const upload=calls.find(c=>c[0]==='upload');assert.equal(upload[4].upsert,false);assert.equal(upload[4].contentType,'image/png');const prepare=calls.find(c=>c[1]==='prepare_article_asset_checked');assert.equal(prepare[2].p_expected_article_revision,3);assert.equal(prepare[2].p_checksum_sha256,image.checksum);
});
test('lost upload responses finalize the existing object instead of uploading again',async()=>{
 for(const option of [{uploadError:{status:409,message:'already exists'}},{throwUpload:true}]) {const {ctx,calls}=setup(option);assert.equal((await api.uploadArticleImage(ctx,image,info)).status,'ready');assert.equal(calls.filter(c=>c[0]==='upload').length,1);assert.equal(calls.filter(c=>c[1]==='prepare_article_asset_checked').length,1);}
});
test('retry requires the exact pending checksum and retains its immutable path',async()=>{
 const {ctx,calls}=setup();const pending=parsed({status:'pending_upload'});await api.uploadArticleImage(ctx,image,info,pending);assert.ok(!calls.some(c=>c[1]==='prepare_article_asset_checked'));await assert.rejects(()=>api.uploadArticleImage(ctx,{...image,checksum:'b'.repeat(64)},info,pending));await assert.rejects(()=>api.uploadArticleImage(ctx,image,info,{...pending,checksumSha256:null}));assert.equal(calls.filter(c=>c[0]==='upload').length,1);
});
test('stale image deletion is rejected before any Storage removal',async()=>{
 const {ctx,calls}=setup({rpc:{transition_article_asset_checked:()=>({data:null,error:{code:'40001'}})}});await assert.rejects(()=>api.removeArticleImage(ctx,parsed()),e=>e.category==='conflict');assert.ok(!calls.some(c=>c[0]==='remove'));
});
test('image deletion respects checked begin, object removal, checked finalize order',async()=>{
 const {ctx,calls}=setup();await api.removeArticleImage(ctx,parsed());const operations=calls.filter(c=>c[1]==='transition_article_asset_checked'||c[0]==='remove').map(c=>c[0]==='remove'?'remove':c[2].p_action);assert.deepEqual(operations,['begin_delete','remove','finalize_delete']);
});
test('Storage removal failure leaves deletion pending without premature finalization',async()=>{
 const {ctx,calls}=setup({removeError:{message:'network offline'}});await assert.rejects(()=>api.removeArticleImage(ctx,parsed()));assert.ok(!calls.some(c=>c[2]?.p_action==='finalize_delete'));
});
test('pending cancellation never accesses Storage and verifies the returned asset id',async()=>{
 const {ctx,calls}=setup();await api.removeArticleImage(ctx,parsed({status:'pending_upload'}));assert.ok(!calls.some(c=>c[0]==='remove'));const bad=setup({rpc:{transition_article_asset_checked:()=>({data:{deleted_asset_id:OTHER},error:null})}});await assert.rejects(()=>api.removeArticleImage(bad.ctx,parsed({status:'pending_upload'})));
});
test('foreign asset and invalid transition responses cannot reach Storage',async()=>{
 const {ctx,calls}=setup({rpc:{transition_article_asset_checked:()=>({data:{asset:row({id:OTHER})},error:null})}});await assert.rejects(()=>api.removeArticleImage(ctx,parsed()));await assert.rejects(()=>api.createImageSignedUrl(ctx,{...parsed(),userId:OTHER},'https://db.example.test'));assert.ok(!calls.some(c=>['sign','remove'].includes(c[0])));
});
test('signed images expire promptly and are restricted to the configured origin and exact object',async()=>{
 const {ctx,calls}=setup();const url=await api.createImageSignedUrl(ctx,parsed(),'https://db.example.test');assert.match(url,/token=private/);assert.equal(calls.find(c=>c[0]==='sign')[3],90);for(const signedUrl of ['https://evil.example.test/storage/v1/object/sign/x?token=y','https://db.example.test/storage/v1/object/sign/article-assets/another.png?token=y','javascript:alert(1)']) await assert.rejects(()=>api.createImageSignedUrl(setup({signedUrl}).ctx,parsed(),'https://db.example.test'));
});
