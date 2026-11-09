import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';
await build({entryPoints:['src/live.js'],bundle:true,format:'iife',platform:'browser',target:['es2020'],outfile:'live.bundle.js',minify:true,legalComments:'eof'});
await build({entryPoints:['analytics.js'],bundle:true,format:'iife',platform:'browser',target:['es2020'],outfile:'analytics.bundle.js',minify:true,legalComments:'eof'});
const files=['index.html','style.css','app.js','theme.js','validators.js','live.bundle.js','analytics.bundle.js','logo-symbol.svg','logo-light.svg','logo-dark.svg','privacy.html','LICENSE','THIRD_PARTY_NOTICES.txt','robots.txt','sitemap.xml'];
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const file of files) await copyFile(file,`dist/${file}`);
console.log(`Built ${files.length} allowlisted public assets. No research, tests, credentials or internal documents included.`);
