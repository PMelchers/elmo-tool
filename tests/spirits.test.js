/* National spirits: parsing, linking to focuses, and writing edits back into the mod.  Run: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const { FB, FB_MOCK, openMock } = require('./node_env.js');

const IDEAS = 'common/ideas/ger_ideas.txt';
const S = () => FB.spirits;

test('parsing reads every spirit of common/ideas with its fields, skipping category flags', async () => {
	await openMock();
	assert.deepEqual([...FB.ws.spirits.keys()].sort(), ['GER_law_x', 'GER_spirit_one', 'GER_spirit_three', 'GER_spirit_two']);
	const one = S().get('GER_spirit_one');
	assert.equal(one.file, IDEAS);
	assert.equal(one.category, 'country');
	assert.equal(one.name, 'Spirit One');
	assert.equal(one.desc, 'The first spirit.');
	assert.equal(one.picture, 'generic_pp_bonus');
	assert.deepEqual(one.modifiers, [{ k: 'political_power_gain', v: '0.1' }, { k: 'stability_factor', v: '0.05' }]);
	assert.deepEqual(S().get('GER_spirit_two').modifiers, [{ k: 'war_support_factor', v: '0.1' }]);
	assert.equal(S().get('GER_spirit_three').hasModifier, false);
	assert.equal(S().get('GER_law_x').category, 'economy');
	assert.deepEqual(S().dirtyIds(), []);
	assert.deepEqual(FB.ws.pending(), []);
});

test('focuses are linked to the spirits they give, swap, remove or check (also inside raw code)', async () => {
	const m = await openMock();
	const refs = (id) => S().refsOfFocus(m.focus(id)).map((r) => r.id + ':' + r.roles.join('+'));
	assert.deepEqual(refs('GER_a'), ['GER_spirit_one:gives']);
	assert.deepEqual(refs('GER_b').sort(), ['GER_spirit_one:checks', 'GER_spirit_three:gives']);
	assert.deepEqual(refs('GER_c'), ['GER_spirit_one:removes', 'GER_spirit_two:gives']);
	const all = S().refsOfProject(FB.state.project).map((r) => r.id).sort();
	assert.deepEqual(all, ['GER_spirit_one', 'GER_spirit_three', 'GER_spirit_two']);
	all.forEach((id) => assert.equal(S().get(id).file, IDEAS, id + ' links to its definition'));
});

test('scanCode finds spirits in lists, timed ideas and nested blocks', () => {
	const r = FB.spirits.scanCode('if = { limit = { has_idea = A } add_ideas = { B C } } add_timed_idea = { idea = D days = 30 } remove_ideas = E');
	assert.deepEqual(r.map((x) => x.id), ['A', 'B', 'C', 'D', 'E']);
});

test('editing an existing spirit and saving rewrites only that spirit, keeps comments, updates the name', async () => {
	const m = await openMock();
	const gerBefore = m.file('common/national_focus/ger.txt');
	assert.ok(S().update('GER_spirit_one', {
		name: 'Spirit Uno', picture: 'generic_stability',
		modifiers: [{ k: 'stability_factor', v: '0.08' }, { k: 'war_support_factor', v: '0.02' }]
	}));
	const pend = FB.ws.pending();
	assert.equal(pend.length, 1);
	assert.equal(pend[0].tree, 'National spirits');
	assert.ok(pend[0].lines.some((l) => /renamed "Spirit One" → "Spirit Uno"/.test(l.text)));
	assert.ok(pend[0].lines.some((l) => /removed political_power_gain/.test(l.text)));
	assert.equal(FB.ws.dirtyCount(), 1);

	const r = await FB.ws.save('v1', '');
	assert.ok(r.files.includes(IDEAS));
	const expected = FB_MOCK.SPIRITS
		.replace('picture = generic_pp_bonus', 'picture = generic_stability')
		.replace('\t\t\t\tpolitical_power_gain = 0.1\n', '')
		.replace('stability_factor = 0.05 # keep stable', 'stability_factor = 0.08 # keep stable')
		.replace('# keep stable\n\t\t\t}', '# keep stable\n\t\t\t\twar_support_factor = 0.02\n\t\t\t}');
	assert.equal(m.file(IDEAS), expected);
	assert.equal(m.file('common/national_focus/ger.txt'), gerBefore, 'focus file untouched');
	assert.match(m.file('localisation/english/ger_l_english.yml'), /GER_spirit_one:0 "Spirit Uno"\r\n/);
	assert.match(m.file('localisation/english/ger_l_english.yml'), /GER_spirit_one_desc:0 "The first spirit."/);
	assert.ok(m.file('FocusBuilder_backups/' + r.backupDir.split('/').pop() + '/' + IDEAS) === FB_MOCK.SPIRITS, 'original backed up');
	assert.match(m.file('FocusBuilder_changelog.md'), /National spirits/);
	assert.deepEqual(FB.ws.pending(), [], 'nothing pending after save');

	// what was written reads back as the edited spirit
	const again = FB.spirits.index({ [IDEAS]: { text: m.file(IDEAS) } }, {}).get('GER_spirit_one');
	assert.equal(again.picture, 'generic_stability');
	assert.deepEqual(again.modifiers, [{ k: 'stability_factor', v: '0.08' }, { k: 'war_support_factor', v: '0.02' }]);
});

test('one-line modifier blocks, missing modifier blocks, removed pictures and new names', async () => {
	const m = await openMock();
	S().update('GER_spirit_two', { name: 'Spirit Two', modifiers: [{ k: 'war_support_factor', v: '0.15' }, { k: 'stability_factor', v: '-0.05' }] });
	S().update('GER_spirit_three', { picture: '', modifiers: [{ k: 'army_org_factor', v: '0.1' }] });
	await FB.ws.save('', '');
	const expected = FB_MOCK.SPIRITS
		.replace('modifier = { war_support_factor = 0.1 }', 'modifier = { war_support_factor = 0.15 stability_factor = -0.05 }')
		.replace('GER_spirit_three = {\n\t\t\tpicture = generic_morale\n', 'GER_spirit_three = {\n\t\t\tmodifier = {\n\t\t\t\tarmy_org_factor = 0.1\n\t\t\t}\n');
	assert.equal(m.file(IDEAS), expected);
	const loc = m.file('localisation/english/focusbuilder_spirits_l_english.yml');
	assert.ok(loc && /GER_spirit_two:0 "Spirit Two"/.test(loc), 'a spirit without a name gets one in a new localisation file');
	assert.ok(!/GER_spirit_three/.test(loc), 'unchanged names are not written');
});

test('removing every modifier removes the block; reverting leaves nothing to save', async () => {
	const m = await openMock();
	S().update('GER_spirit_one', { modifiers: [] });
	S().update('GER_spirit_two', { desc: 'temp' });
	S().revert('GER_spirit_two');
	assert.deepEqual(S().dirtyIds(), ['GER_spirit_one']);
	await FB.ws.save('', '');
	assert.equal(m.file(IDEAS), FB_MOCK.SPIRITS.replace('\t\t\tmodifier = {\n\t\t\t\tpolitical_power_gain = 0.1\n\t\t\t\tstability_factor = 0.05 # keep stable\n\t\t\t}\n', ''));
});

test('a focus edit and a spirit edit are saved together', async () => {
	const m = await openMock();
	const f = m.focus('GER_a');
	f.weeks = 7;
	S().update('GER_spirit_two', { modifiers: [{ k: 'war_support_factor', v: '0.2' }] });
	const r = await FB.ws.save('', '');
	assert.ok(r.files.includes('common/national_focus/ger.txt') && r.files.includes(IDEAS));
	assert.match(m.file('common/national_focus/ger.txt'), /id = GER_a[\s\S]*cost = 7/);
	assert.match(m.file('common/national_focus/ger.txt'), /# keep me/);
	assert.match(m.file(IDEAS), /modifier = \{ war_support_factor = 0\.2 \}/);
});

test('CRLF idea files keep their line endings', () => {
	const text = FB_MOCK.SPIRITS.replace(/\n/g, '\r\n');
	const sp = FB.spirits.index({ x: { text } }, {}).get('GER_spirit_three');
	const base = JSON.parse(JSON.stringify(sp));
	sp.modifiers = [{ k: 'army_org_factor', v: '0.1' }];
	const out = FB.spirits.patchText(text, sp, base);
	assert.ok(!/[^\r]\n/.test(out), 'no bare LF added');
	assert.match(out, /picture = generic_morale\r\n\t\t\tmodifier = \{\r\n\t\t\t\tarmy_org_factor = 0\.1\r\n\t\t\t\}\r\n/);
});
