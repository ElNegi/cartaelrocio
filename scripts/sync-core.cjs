const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
fs.copyFileSync(path.join(root,'shared/core.js'),path.join(root,'public/core.js'));
