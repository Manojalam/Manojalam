import assert from "node:assert/strict";
import test from "node:test";
import { appendSutra } from "./append-sutra";
const first = {text:"१.३.१ भुवादयो धातवः",href:"https://ashtadhyayi.com/sutraani/1/3/1"};
const second = {text:"३.२.१२३ वर्तमाने लट्",href:"https://ashtadhyayi.com/sutraani/3/2/123"};
test("empty value receives first result without a comma",()=>assert.deepEqual(appendSutra(undefined,first),{...first,richText:`<a href="${first.href}" target="_blank" rel="noopener noreferrer">${first.text}</a>`}));
test("multiple choices append text and retain distinct links",()=>{
 const result=appendSutra(first,second);
 assert.equal(result.text,first.text+", "+second.text);
 assert.equal(result.href,undefined);
 assert.ok(result.richText?.includes(first.href));assert.ok(result.richText?.includes(second.href));
 const third=appendSutra(result,first);assert.equal(third.text,result.text+", "+first.text);
});
test("manual edits are authoritative and formatting survives appending",()=>{
 const result=appendSutra({text:"edited",richText:"<strong>edited</strong>",paragraphStyle:"text-align: center"},second);
 assert.ok(result.richText?.startsWith("<strong>edited</strong>, "));
 assert.equal(result.paragraphStyle,"text-align: center");
 assert.equal(appendSutra({text:""},second).text,second.text);
});

test("legacy first result retains its source when editor has created unlinked rich text",()=>{
 const current={...first,richText:`<strong>${first.text}</strong>`};
 const result=appendSutra(current,second);
 assert.ok(result.richText?.includes(`href="${first.href}"`));
 assert.ok(result.richText?.includes(`<strong>${first.text}</strong></a>, `));
});
