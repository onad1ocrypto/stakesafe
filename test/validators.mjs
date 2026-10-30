import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import fs from 'node:fs';
const b=await chromium.launch({args:['--no-sandbox']});const p=await b.newPage({viewport:{width:1440,height:1000}});let errors=[];p.on('pageerror',e=>errors.push(e.message));
const api='https://validators-api-main.je-cf9.workers.dev/api/v1/validators';
// Deterministic API fixture captured from Nimiq, not used by the app as fallback.
const data=fs.existsSync('test/validators-source.json')?JSON.parse(fs.readFileSync('test/validators-source.json')):await (await fetch(api)).json();
await p.route(api,r=>r.fulfill({json:data,headers:{'access-control-allow-origin':'*'}}));
await p.goto('http://127.0.0.1:3000/#validators');await p.waitForSelector('.validator-card');assert.equal(await p.locator('.validator-card').count(),data.filter(v=>v.isListed===true).length);
await p.fill('#validator-search','Garuda');assert.equal(await p.locator('.validator-card').count(),1);await p.click('[data-validator-detail]');
assert.match(await p.locator('#modal-body').textContent(),/5%/);assert.equal(await p.locator('.wallet-handoff a').getAttribute('href'),'https://wallet.nimiq.com/staking?page=validators');assert.match(await p.locator('#modal-body').textContent(),/watched address is not assumed/);assert.equal(await p.locator('[data-native-stake]').count(),1);await p.keyboard.press('Escape');
await p.fill('#validator-search','no such validator');assert.equal(await p.locator('.validator-card').count(),0);await p.click('[data-clear-validators]');
await p.selectOption('#validator-payout','none');assert.equal(await p.locator('.validator-card').count(),data.filter(v=>v.isListed===true&&v.payoutType==='none').length);assert.equal(await p.locator('.no-rewards').count(),data.filter(v=>v.isListed===true&&v.payoutType==='none').length);
await p.selectOption('#validator-payout','all');await p.selectOption('#validator-sort','fee');
for(const theme of ['light','dark']){await p.click(`[data-theme-choice=${theme}]`);for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}await p.screenshot({path:`test/validators-${theme}.png`,fullPage:true})}
await p.unroute(api);await p.route(api,r=>r.fulfill({status:503,body:'Unavailable'}));await p.click('#reload-validators');await p.waitForSelector('[data-validator-retry]');assert.equal(await p.locator('.validator-card').count(),0);
await p.unroute(api);await p.route(api,r=>r.fulfill({json:[]}));await p.click('[data-validator-retry]');await p.waitForSelector('[data-clear-validators]');
assert.deepEqual(errors,[]);await b.close();console.log('PASS: real-source entries, search, filters, fee, native staking entry + optional official handoff, empty/error/retry, both themes, 4 widths.');
