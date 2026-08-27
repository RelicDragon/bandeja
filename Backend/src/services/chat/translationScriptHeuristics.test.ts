import assert from 'node:assert/strict';
import {
  scriptFallbackPasses,
  targetScriptRatioForLocale,
  targetScriptRatios,
} from './translationScriptHeuristics';

function testAsiaScriptDetection(): void {
  assert.ok(targetScriptRatios('नमस्ते').devanagari > 0.9);
  assert.ok(targetScriptRatios('สวัสดี').thai > 0.9);
  assert.ok(targetScriptRatioForLocale('नमस्ते दोस्त', 'hi') > 0.8);
  assert.ok(targetScriptRatioForLocale('สวัสดีครับ', 'th') > 0.8);
  assert.ok(targetScriptRatioForLocale('板式网球', 'zh') > 0.8);
  assert.ok(targetScriptRatioForLocale('パデル', 'ja') > 0.8);
  assert.ok(targetScriptRatioForLocale('Halo padel', 'id') > 0.8);
  assert.equal(scriptFallbackPasses('नमस्ते दोस्त', 'hi'), true);
  assert.equal(scriptFallbackPasses('สวัสดีครับ', 'th'), true);
  assert.equal(scriptFallbackPasses('hello', 'hi'), false);
}

testAsiaScriptDetection();
console.log('translationScriptHeuristics.test: ok');
