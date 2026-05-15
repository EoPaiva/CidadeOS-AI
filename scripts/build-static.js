import fs from 'node:fs';
import path from 'node:path';
const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  console.error('Pasta public não encontrada.');
  process.exit(1);
}
const indexFile = path.join(publicDir, 'index.html');
if (!fs.existsSync(indexFile)) {
  console.error('public/index.html não encontrado.');
  process.exit(1);
}
console.log('CidadeOS AI: build estático validado para Vercel. Output: public/');
