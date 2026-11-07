import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync('star-moments-test.js','utf8');
const compressSource=source.slice(source.indexOf('async function compress(file)'),source.indexOf('\nconst post='));
test('photo preparation uses CSP-permitted data URLs and resizes before saving',async()=>{
  const file={name:'iphone.jpeg'};
  const canvas={getContext:()=>({drawImage(...args){assert.deepEqual(args.slice(1),[0,0,1000,750]);}}),toDataURL:(type,quality)=>{assert.equal(type,'image/jpeg');assert.equal(quality,.78);return 'data:image/jpeg;base64,compressed';}};
  const context=vm.createContext({FileReader:class{readAsDataURL(input){assert.equal(input,file);this.result='data:image/jpeg;base64,original';this.onload();}},Image:class{width=4000;height=3000;set src(value){assert.match(value,/^data:image\//);this.onload();}},document:{createElement:()=>canvas}});
  vm.runInContext(compressSource,context);
  assert.equal(await context.compress(file),'data:image/jpeg;base64,compressed');
  assert.equal(canvas.width,1000);assert.equal(canvas.height,750);
});
test('unreadable photos report a useful error',async()=>{
 const context=vm.createContext({FileReader:class{readAsDataURL(){this.onerror();}}});
 vm.runInContext(compressSource,context);
 await assert.rejects(context.compress({}),/Could not read this photo/);
});
