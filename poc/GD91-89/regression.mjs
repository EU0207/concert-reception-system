import {hashes,rules,cleanup,finish} from './support.mjs';
import {authorizationTests} from '../GD91-84/authorization-tests.mjs';
import {generationTests} from '../GD91-84/generation-tests.mjs';
import {sharedTests} from '../GD91-84/shared-tests.mjs';
import {reports} from '../GD91-84/transport.mjs';
const before=hashes(['regression.mjs','../GD91-84/authorization-tests.mjs','../GD91-84/shared-tests.mjs']);let clean;
try{await rules();const actors=await authorizationTests();await generationTests(actors);await sharedTests(actors);}finally{clean=await cleanup();}
finish('regression',before,reports,clean,{scope:'authorization-generation-sharing',eventBusinessCasesCoveredBySeparateSuite:true});
