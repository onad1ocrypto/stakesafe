import { mkdir, copyFile, rm } from 'node:fs/promises';
const files=['index.html','style.css','app.js','theme.js','validators.js','logo-symbol.svg','logo-light.svg','logo-dark.svg','privacy.html','LICENSE'];
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const file of files) await copyFile(file,`dist/${file}`);
console.log(`Built ${files.length} allowlisted public assets. No research, tests, credentials or internal documents included.`);
