import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceDescriptionError,evidenceSha256} from './evidence-validation';

test('video evidence requires a useful description; images may omit it',()=>{
  assert.match(evidenceDescriptionError('video/mp4','  ')||'',/Describe what/);
  assert.equal(evidenceDescriptionError('image/png',''),null);
});
test('evidence descriptions retain original Unicode exactly',()=>{
  const description='ಕೌಶಲ್ಯ ತೋರಿಸುತ್ತಿದ್ದೇನೆ — हिन्दी, English 🔧';
  assert.equal(evidenceDescriptionError('video/webm',description),null);
  assert.equal(description,'ಕೌಶಲ್ಯ ತೋರಿಸುತ್ತಿದ್ದೇನೆ — हिन्दी, English 🔧');
});
test('SHA-256 is calculated from file bytes',()=>{
  assert.equal(evidenceSha256(Buffer.from('SkillSetu evidence')), 'ebd1bd5588beae50959843c62cc130adb9c3c0175c3474606b0d07a6dfe7354d');
});
