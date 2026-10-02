const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
fs.copyFileSync(path.join(root,'functions/core.js'),path.join(root,'public/core.js'));
