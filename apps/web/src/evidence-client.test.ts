import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceBytesBase64,evidenceFileError} from './evidence-client';

test('accepts an allowed non-empty evidence file within the size limit',()=>{
  assert.equal(evidenceFileError({type:'image/jpeg',size:32}),null);
});

test('rejects unsupported, empty, and oversized evidence files',()=>{
  assert.match(evidenceFileError({type:'application/x-msdownload',size:32})||'',/supported file/i);
  assert.match(evidenceFileError({type:'image/png',size:0})||'',/supported file/i);
  assert.match(evidenceFileError({type:'video/mp4',size:8*1024*1024+1})||'',/8 MB/i);
});

test('encodes the selected file bytes exactly for the upload payload',async()=>{
  const file={arrayBuffer:async()=>Uint8Array.from([0,1,127,128,255]).buffer};
  assert.equal(await evidenceBytesBase64(file),'AAF/gP8=');
});
