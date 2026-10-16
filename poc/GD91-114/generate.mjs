import fs from 'node:fs';
import {generated} from '../GD91-113/generate.mjs';
export {generated};
if(process.argv[1]?.replaceAll('\\','/').endsWith('/GD91-114/generate.mjs')){
 fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(generated(),null,2)+'\n');
}
