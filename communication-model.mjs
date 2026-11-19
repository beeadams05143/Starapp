// Prompts are generic. Nothing is an individual's answer until they choose it.
export const questions=[
 {id:'express',title:'How do you like to tell people what you need?',choices:['🗣 Talk','🖼 Use pictures','👉 Point or gesture','⌨️ Type']},
 {id:'talk',title:'How would you like people to talk with you?',choices:['💬 Short sentences','🤫 A quiet voice','☝️ One question at a time','✍️ Another way']},
 {id:'choose',title:'What helps you make a choice?',choices:['🖼 Pictures','✌️ Two choices','🧸 Show me the things','✍️ Another way']},
 {id:'time',title:'What helps when you need more time?',choices:['⏳ Wait for me','🕒 Ask me later','🖼 Show me pictures','✍️ Another way']},
 {id:'busy',title:'What helps when things feel too busy?',choices:['🌿 A quiet place','🤫 Less talking','🚶 A movement break','✍️ Something else']},
 {id:'break',title:'How do you tell someone you need a break?',choices:['🗣 Say it','🖼 Show a picture','👉 Point or gesture','✍️ My own way']},
 {id:'activity',title:'What helps you do an activity?',choices:['🪑 Sit near me','🤝 Do it with me','📋 Show me the steps','✍️ Something else']},
 {id:'hurt',title:'How do you tell someone you hurt or feel sick?',choices:['🗣 Say the words','👉 Point to my body','🖼 Use a picture','✍️ My own way']},
 {id:'new',title:'What should a new person know about you?',choices:['🤫 Use a calm voice','⏳ Give me time','💬 Help me say what I mean','✍️ Something else']}
];
export const guideFields=[['quick','Start here'],['expression','How I express myself'],['choices','Help me make a choice'],['harder','When communication is harder'],['engagement','Help me stay engaged'],['first_contact','For new staff, medical & public-safety workers'],['tools','Communication tools & how to use them'],['settings','Supports in different settings'],['detail','Full communication information'],['source','Source document title / where the team can find it'],['review','When to review this guide']];
export function blankAnswers(){return Object.fromEntries(questions.map(q=>[q.id,{choices:[],words:'',unsure:false}]))}
export function individualContent(answers,assistance){const selected={};for(const q of questions){const a=answers[q.id];if(!a)continue;const choices=(a.choices||[]).filter(c=>q.choices.includes(c));const words=String(a.words||'').trim();if(choices.length||words||a.unsure)selected[q.id]={question:q.title,choices:a.unsure?[]:choices,words,unsure:!!a.unsure};}return {answers:selected,assistance};}
export function validateEntry(kind,content){if(kind==='individual'&&!Object.keys(content.answers||{}).length)throw Error('Choose an answer or add your words. You can also come back another time.');if(kind==='observation'&&['noticed','support','result'].some(k=>!content[k]?.trim()))throw Error('Add what you noticed, the support offered, and what happened next.');if(kind==='suggestion'&&!content.suggestion?.trim())throw Error('Add your suggestion first.');return content;}
export function personScope(group,person){const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;if(!uuid.test(group)||!uuid.test(person))throw Error('Choose a valid individual.');return 'group_id=eq.'+group+'&individual_id=eq.'+person;}
