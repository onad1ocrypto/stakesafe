const assert=require('node:assert/strict');const handler=require('../api/rpc.js');
const A='NQ07 0000 0000 0000 0000 0000 0000 0000 0000';
async function run(body,method='POST'){const res={headers:{},setHeader(k,v){this.headers[k]=v},end(data){this.body=JSON.parse(data)}};await handler({method,body,headers:{}},res);return res;}
(async()=>{let calls=0;global.fetch=async()=>{calls++;return {ok:true,json:async()=>({result:{data:65589316},id:1,jsonrpc:'2.0'})}};
assert.equal((await run({method:'sendBasicTransaction',params:[]})).statusCode,400);assert.equal((await run({method:'getAccountByAddress',params:['bad']})).statusCode,400);assert.equal((await run({},'GET')).statusCode,405);assert.equal(calls,0);
let response=await run({method:'getBlockNumber',params:[],id:1});assert.equal(response.statusCode,200);assert.equal(response.headers['Cache-Control'],'no-store');
calls=0;global.fetch=async(url,opts)=>{calls++;assert.equal(url,'https://rpc.nimiqwatch.com');assert.equal(opts.method,'POST');if(calls===1)throw new Error('Transient network failure');return {ok:true,json:async()=>({result:{data:65589317},id:2,jsonrpc:'2.0'})}};assert.equal((await run({method:'getBlockNumber',params:[]})).statusCode,200);assert.equal(calls,2);
global.fetch=async()=>({ok:true,json:async()=>({error:{code:-32603,data:'No staker with address: '+A}})});response=await run({method:'getStakerByAddress',params:[A]});assert.equal(response.statusCode,200);assert.match(response.body.error.data,/No staker/);
calls=0;global.fetch=async()=>{calls++;throw new Error('Unavailable')};response=await run({method:'getBlockNumber',params:[]});assert.equal(response.statusCode,502);assert.equal(calls,2);
calls=0;global.fetch=async()=>{calls++;let e=new Error('timeout');e.name='AbortError';throw e};assert.equal((await run({method:'getBlockNumber',params:[]})).statusCode,504);assert.equal(calls,2);
console.log('PASS: gateway whitelist, parameter validation, fixed upstream, no-store, one bounded retry, no-staker passthrough, network error and timeout status.');})().catch(e=>{console.error(e);process.exit(1)});
