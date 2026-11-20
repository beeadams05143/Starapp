import test from 'node:test';
import assert from 'node:assert/strict';
import './star-individual-isa-matcher.js';

const outcomeCards=[
 {id:'phone',status:'active',version:1,title:'Practice making a supported phone call',category:'Communication',measurements:[{kind:'count',unit:'steps',label:'Phone call steps completed'}]},
 {id:'community',status:'active',version:1,title:'Choose a community activity',category:'Community Participation',measurements:[{kind:'duration',unit:'minutes',label:'Minutes participating'}]},
 {id:'leisure',status:'active',version:1,title:'Select a preferred leisure activity',category:'Self-Direction',measurements:[{kind:'choice',label:'Participation choice'}]},
];
const cases=[
 ['FICTIONAL: I practiced calling the library with a helper.',['phone']],
 ['FICTIONAL: I went to the park with my group.',['community']],
 ['FICTIONAL: I chose coloring instead of music.',['leisure']],
 ['FICTIONAL: I helped wash the dishes.',[]],
 ['FICTIONAL: I called someone and picked a game.',['phone','leisure']],
 ['FICTIONAL: I got a star!',[]],
 ['FICTIONAL: I want to go to the park someday.',[]],
];
for(const [original_words,expected] of cases){
 test('Propose without credit: '+original_words,()=>{
  const actual=globalThis.StarIsaMatcher.evaluate({original_words},outcomeCards);
  assert.deepEqual(actual.map(x=>x.outcome_id),expected);
  assert.ok(actual.every(x=>typeof x.reason==='string'&&!Object.hasOwn(x,'progress_awarded')&&!Object.hasOwn(x,'value')));
 });
}
test('Never match archived or missing cards',()=>{
 const archived=structuredClone(outcomeCards);
 archived.forEach(card=>card.status='archived');
 assert.deepEqual(globalThis.StarIsaMatcher.evaluate({original_words:'I called my friend.'},archived),[]);
});
test('Do not treat short acknowledgements as proof',()=>{
 for(const response of ['I did it!','Someone helped me','Yes','Not now','']){
  assert.deepEqual(globalThis.StarIsaMatcher.evaluate({original_words:response},outcomeCards),[]);
 }
});
