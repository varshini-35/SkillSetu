import {translationCoverage} from '../apps/web/src/i18n';
const missing=translationCoverage();
for(const [language,keys] of Object.entries(missing))if(keys.length)console.error(`${language}: missing ${keys.join(', ')}`);
if(Object.values(missing).some(keys=>keys.length))process.exitCode=1;
else console.log('Translation key coverage passed for English, Kannada, and Hindi. (Does not check hardcoded component text.)');
