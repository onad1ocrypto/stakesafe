// Read-only RPC gateway. The upstream URL and method list are fixed.
// No credentials, database, transaction submission, or request-body logging.
const UPSTREAM = 'https://rpc.nimiqwatch.com';
const ALLOWED = new Set(['getBlockNumber', 'getStakerByAddress', 'getValidatorByAddress', 'getAccountByAddress']);
function reply(res,status,body){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');res.statusCode=status;res.end(JSON.stringify(body));}
module.exports = async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(res,405,{error:'Read-only POST endpoint.'});}
 if(Number(req.headers['content-length']||0)>2048)return reply(res,413,{error:'Request too large.'});
 let input;try{input=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return reply(res,400,{error:'Invalid JSON.'});}
 if(!input||Array.isArray(input)||!ALLOWED.has(input.method))return reply(res,400,{error:'Only supported read-only methods are allowed.'});
 const {method,params,id}=input;
 if(!Array.isArray(params)||(method==='getBlockNumber'?params.length!==0:params.length!==1||typeof params[0]!=='string'||!/^NQ\d{2}(?:\s?[0-9A-HJ-NP-VXY]){32}$/.test(params[0])))return reply(res,400,{error:'Invalid read-only request parameters.'});
 const body=JSON.stringify({jsonrpc:'2.0',id:typeof id==='number'&&Number.isSafeInteger(id)?id:1,method,params});
 for(let attempt=0;attempt<2;attempt++){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);
  try{
   const response=await fetch(UPSTREAM,{method:'POST',headers:{'content-type':'application/json'},body,signal:controller.signal});
   if(!response.ok){if(attempt===0&&(response.status===429||response.status>=500))continue;return reply(res,502,{error:'The mainnet RPC is temporarily unavailable. No record was inferred.'});}
   const result=await response.json();
   if(!result||typeof result!=='object'||(!Object.hasOwn(result,'result')&&!Object.hasOwn(result,'error')))throw new Error('Invalid upstream response');
   // Preserve JSON-RPC errors, including explicit no-staker records, unchanged.
   return reply(res,200,result);
  }catch(e){if(attempt===1)return reply(res,e.name==='AbortError'?504:502,{error:e.name==='AbortError'?'The mainnet RPC timed out after a retry.':'The mainnet RPC could not be reached. No record was inferred.'});}
  finally{clearTimeout(timer);}
 }
 return reply(res,502,{error:'The mainnet RPC is unavailable.'});
};
