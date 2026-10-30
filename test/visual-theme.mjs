// Visual-only regression fixtures: no native provider or transaction submission.
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const A='NQ07 0000 0000 0000 0000 0000 0000 0000 0000',V='NQ15 HNAH YRVH DFVM YHAG BSXG 0QHK KA0Q XDR7';
const b=await chromium.launch({args:['--no-sandbox']}),p=await b.newPage({viewport:{width:390,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(A=>{localStorage.setItem('stakesafe.theme','light');localStorage.setItem('stakesafe.remembered-address.v1',JSON.stringify({version:1,network:'mainnet',rpc:'https://rpc.nimiqwatch.com',consent:'rpc-mainnet-v1',address:A}));},A);
await p.route('https://validators-api-main.je-cf9.workers.dev/api/v1/validators',r=>r.fulfill({json:[{address:V,name:'Example validator (test)',isListed:true,fee:.05,payoutType:'direct'}],headers:{'access-control-allow-origin':'*'}}));
await p.route('**/api/rpc',r=>{const {method,id}=r.request().postDataJSON();const data=method==='getBlockNumber'?65590000:method==='getStakerByAddress'?{address:A,balance:10000000,inactiveBalance:5000000,retiredBalance:0,delegation:V,inactiveFrom:null}:method==='getValidatorByAddress'?{address:V,retired:false,inactivityFlag:null,jailedFrom:null}:{address:A,balance:0,type:'basic'};return r.fulfill({json:{id,jsonrpc:'2.0',result:{data}}});});
await p.goto((process.env.BASE_URL||'http://127.0.0.1:3000')+'/#profile');await p.waitForFunction(()=>document.querySelector('#profile-total')?.textContent==='150 NIM');
for(const theme of ['light','dark']){
 await p.click(`[data-theme-choice=${theme}]`);
 for(const width of [320,390,640,1440]){
  await p.setViewportSize({width,height:1000});
  for(const page of ['overview','profile','validators','activity','settings']){
   await p.evaluate(page=>navigate(page),page);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${theme} ${width} ${page} horizontal overflow`);
  }
  await p.evaluate(()=>navigate('profile'));
  const styles=await p.evaluate(()=>({hero:getComputedStyle(document.querySelector('.profile-total')).backgroundImage,total:getComputedStyle(document.querySelector('#profile-total')).color,cardColours:[...document.querySelectorAll('.profile-balances>div')].map(el=>getComputedStyle(el).backgroundColor),body:getComputedStyle(document.body).backgroundImage}));
  if(theme==='light'){assert.match(styles.hero,/gradient/);assert.equal(styles.total,'rgb(255, 255, 255)');assert.equal(new Set(styles.cardColours).size,3);assert.match(styles.body,/gradient/);}else{assert.equal(styles.hero,'none');assert.equal(styles.body,'none');}
  if(width<=640)assert.equal(await p.locator('.mobile-brand').isVisible(),true);
  if(width===390||width===1440)await p.screenshot({path:`test/profile-palette-${theme}-${width}.png`,fullPage:true});
 }
}
assert.deepEqual(errors,[]);await b.close();console.log('PASS: light blue/teal layered backgrounds, navy total card, three balance tints; dark palette unchanged; 5 pages at 320/390/640/1440px. No native requests.');
