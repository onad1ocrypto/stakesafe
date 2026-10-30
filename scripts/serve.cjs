const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const handler=require('../api/rpc.js');
const root=path.resolve(__dirname,'../dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/rpc'){
  let body='';try{for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048){res.writeHead(413);res.end();return;}}req.body=body;return await handler(req,res);}catch{res.writeHead(500);res.end('Server error');return;}
 }
 try{const name=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error();const data=await fs.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
}).listen(process.env.PORT||3000,'0.0.0.0',()=>console.log(`StakeSafe: http://0.0.0.0:${process.env.PORT||3000}`));
