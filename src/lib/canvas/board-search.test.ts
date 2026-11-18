import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardSearchText, boardSearchMatches } from './board-search';

test('searches table headers, labels, formatted cells and template values', () => {
 const text = boardSearchText({text:'stale summary', table:{labelHeader:'Person', columns:[{name:'Meaning'}], rows:[{label:'First', cells:['गुणत्वम्'], richCells:{c:'<p>Formatted&nbsp;answer</p>'}, templates:{c:{sections:[{values:{sutra:'३.४.७८'}}]}}}]}});
 for(const query of ['person','Meaning','First','गुणत्वम्','formatted answer','३.४.७८']) assert.ok(boardSearchMatches(text,query),query);
});
test('includes all semantic fields and tags alongside rich text',()=>{
 const text=boardSearchText({richText:'<p>Title</p>',translation:'Meaning',tags:['grammar'],cardSections:[{values:{answer:'Solution'}}],src:'secret-image-url'});
 for(const query of ['title','meaning','grammar','solution']) assert.ok(boardSearchMatches(text,query));
 assert.ok(!boardSearchMatches(text,'secret-image-url'));
});
test('normalizes Unicode and whitespace without matching blank queries',()=>{
 assert.ok(boardSearchMatches('śāstra\n  text','  s\u0301āstra text '));
 assert.ok(!boardSearchMatches('anything','  '));
});
