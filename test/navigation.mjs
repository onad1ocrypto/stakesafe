import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const b=await chromium.launch({args:['--no-sandbox']});const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.BASE_URL||'http://127.0.0.1:3000');
for(const theme of ['light','dark']){
 await p.click(`[data-theme-choice=${theme}]`);
 for(const width of [320,390,640]){
  await p.setViewportSize({width,height:844});assert.equal(await p.locator('#primary-navigation').isVisible(),false);assert.equal(await p.locator('#mobile-menu-toggle').isVisible(),true);
  await p.click('#mobile-menu-toggle');assert.equal(await p.locator('#mobile-menu-toggle').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('#primary-navigation').isVisible(),true);
  await p.keyboard.press('Escape');assert.equal(await p.locator('#primary-navigation').isVisible(),false);assert.equal(await p.locator('#mobile-menu-toggle').evaluate(el=>el===document.activeElement),true);
  await p.click('#mobile-menu-toggle');await p.click('[data-page=settings]');assert.equal(await p.locator('#primary-navigation').isVisible(),false);assert.equal(await p.locator('#page-settings').isVisible(),true);assert.equal(await p.locator('#mobile-menu-toggle').getAttribute('aria-expanded'),'false');
  await p.click('#mobile-menu-toggle');await p.mouse.click(5,400);assert.equal(await p.locator('#primary-navigation').isVisible(),false);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
}
await p.setViewportSize({width:390,height:844});await p.click('#mobile-menu-toggle');await p.screenshot({path:'test/mobile-menu.png',fullPage:false});
await p.setViewportSize({width:1440,height:1000});assert.equal(await p.locator('#mobile-menu-toggle').isVisible(),false);assert.equal(await p.locator('#primary-navigation').isVisible(),true);assert.equal(await p.locator('body').evaluate(el=>el.classList.contains('mobile-menu-open')),false);await p.click('[data-page=overview]');assert.equal(await p.locator('#page-overview').isVisible(),true);assert.deepEqual(errors,[]);await b.close();console.log('PASS: hamburger replaces bottom nav at 320/390/640px in both themes; page selection, outside click, Escape/focus, responsive resize and desktop sidebar.');
