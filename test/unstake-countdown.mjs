// Mocked mainnet RPC only. No wallet connection, signing or real transaction.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({args:['--no-sandbox']});
const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const A='NQ07 0000 0000 0000 0000 0000 0000 0000 0000',V='NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7';
let head=66203000,fail=false,policyFail=false,jailedFrom=null,retired=false,calls=0;
await p.route('**/api/rpc',async r=>{
 calls++;const {method,id}=r.request().postDataJSON();
 if(fail||(policyFail&&method==='getPolicyConstants'))return r.fulfill({status:503});
 let data,metadata=null;
 if(method==='getBlockNumber')data=head;
 else if(method==='getStakerByAddress'){data={address:A,balance:0,inactiveBalance:retired?0:10000000,retiredBalance:retired?10000000:0,inactiveFrom:retired?null:66225600,delegation:V};metadata={blockNumber:head};}
 else if(method==='getValidatorByAddress'){data={address:V,retired:false,inactivityFlag:null,jailedFrom};metadata={blockNumber:head};}
 else if(method==='getAccountByAddress')data={address:A,balance:0};
 else if(method==='getPolicyConstants')data={blocksPerEpoch:43200,jailEpochs:8,blockSeparationTime:1000,genesisBlockNumber:3456000};
 else throw new Error('Unexpected RPC: '+method);
 await r.fulfill({json:{jsonrpc:'2.0',id,result:{data,metadata}}});
});
await p.goto(process.env.BASE_URL||'http://127.0.0.1:3000');
await p.click('#watch-address');await p.fill('#public-address',A);await p.check('#rpc-consent');await p.check('#mainnet-consent');await p.click('#confirm-connect');
await p.waitForFunction(()=>document.querySelector('#unstake-timer [data-timing-state]')?.dataset.timingState==='waiting',{},{timeout:6000}).catch(async e=>{console.error('DEBUG',errors,await p.evaluate(()=>({position:window.StakeSafe?.getPosition(),html:document.querySelector('#unstake-timer')?.outerHTML})));throw e});
assert.match(await p.locator('#unstake-timer').textContent(),/66,268,801/);
const before=await p.locator('#unstake-timer .timing-countdown').textContent(),c=calls;
await p.waitForFunction(before=>document.querySelector('#unstake-timer .timing-countdown')?.textContent!==before,before,{timeout:5000});assert.notEqual(await p.locator('#unstake-timer .timing-countdown').textContent(),before);assert.equal(calls,c);
await p.setViewportSize({width:1440,height:1000});await p.click('[data-page="profile"]');await p.waitForFunction(()=>document.querySelector('#profile-unstake-timer .timing-countdown'));assert.match(await p.locator('#profile-unstake-timer').textContent(),/66,268,801/);
head=66268800;await p.click('#profile-refresh');await p.waitForFunction(()=>window.StakeSafe.getPosition().snapshot?.head===66268800&&!window.StakeSafe.getPosition().busy);await p.waitForTimeout(2300);
assert.equal(await p.locator('#profile-unstake-timer [data-timing-state]').getAttribute('data-timing-state'),'awaiting-block');
head=66268801;await p.click('#profile-refresh');await p.waitForFunction(()=>document.querySelector('#profile-unstake-timer [data-timing-state]')?.dataset.timingState==='eligible');
fail=true;await p.click('#profile-refresh');await p.waitForFunction(()=>!!window.StakeSafe.getPosition().errorText);assert.equal(await p.locator('#profile-unstake-timer [data-timing-state]').getAttribute('data-timing-state'),'stale');assert.equal(await p.locator('#inactive-balance').textContent(),'100 NIM');
fail=false;policyFail=true;await p.click('#profile-refresh');await p.waitForFunction(()=>!window.StakeSafe.getPosition().errorText&&!window.StakeSafe.getPosition().busy);assert.equal(await p.locator('#profile-unstake-timer [data-timing-state]').getAttribute('data-timing-state'),'unknown');
policyFail=false;jailedFrom=66200000;await p.click('#profile-refresh');await p.waitForFunction(()=>document.querySelector('#profile-unstake-timer')?.textContent.includes('Validator jail'));assert.match(await p.locator('#profile-unstake-timer').textContent(),/66,545,601/);
retired=true;await p.click('#profile-refresh');await p.waitForFunction(()=>document.querySelector('#profile-unstake-timer [data-timing-state]')?.dataset.timingState==='retired');assert.equal(await p.locator('#profile-unstake-timer .timing-countdown').count(),0);
retired=false;jailedFrom=null;head=66203000;await p.click('#profile-refresh');await p.waitForFunction(()=>document.querySelector('#profile-unstake-timer [data-timing-state]')?.dataset.timingState==='waiting');
for(const theme of ['light','dark']){await p.click(`[data-theme-choice="${theme}"]`);for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:1000});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}}
await p.click('[data-page="overview"]');await p.setViewportSize({width:1440,height:1050});
if(process.env.EVIDENCE_DIR)await p.screenshot({path:process.env.EVIDENCE_DIR+'/countdown-mocked-desktop.png',fullPage:true});
await p.setViewportSize({width:390,height:844});if(process.env.EVIDENCE_DIR)await p.screenshot({path:process.env.EVIDENCE_DIR+'/countdown-mocked-mobile.png',fullPage:true});
await p.evaluate(()=>{const el=document.createElement('div');el.id='mismatch-timer';el.dataset.unstakeTimer='';el.dataset.owner='NQ00 DIFFERENT ACCOUNT';document.body.append(el);window.renderStakeSafeUnstakeTimers()});assert.match(await p.locator('#mismatch-timer').textContent(),/differs from this transaction preview/);
await p.locator('#mismatch-timer').evaluate(el=>el.remove());
await p.click('#disconnect-wallet');assert.equal(await p.locator('#unstake-timer').textContent(),'');assert.equal(await p.locator('#profile-unstake-timer').count(),0);
assert.deepEqual(errors,[]);await browser.close();console.log('PASS: ticking without RPC fan-out, overview/profile, release-block boundary, no clock-only readiness, failure/stale/unknown, jail extension, retired, both themes/mobile widths and disconnect. Mocked data, no chain writes.');
