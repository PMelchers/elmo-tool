/* Military Industrial Organizations: nation detection, base game + mod list, copying into the mod, editing, guides.
 * Run: node --test "tests/*.test.js" */
const test = require('node:test');
const assert = require('node:assert/strict');
const { FB, FB_MOCK, openMock } = require('./node_env.js');

const DIR = 'common/military_industrial_organization/organizations/';
const GAME = {
	[DIR + 'game_ger.txt']: 'GER_game_organization = {\n\tallowed = { original_tag = GER }\n\ttrait = { token = GG_t1 position = { x = 0 y = 0 } equipment_bonus = { armor_value = 0.05 } }\n}\nGER_test_organization = {\n\tallowed = { original_tag = GER }\n\ttrait = { token = OLD position = { x = 0 y = 0 } }\n}\n',
	[DIR + 'generic_mios.txt']: 'generic_old_organization = { trait = { token = old_t position = { x = 0 y = 0 } } }\n',
	[DIR + 'game_sov.txt']: 'SOV_game_organization = {\n\tallowed = { original_tag = SOV }\n\ttrait = { token = SG_t1 position = { x = 0 y = 0 } }\n}\n'
};
const modFiles = () => Object.fromEntries(Object.entries(FB.ws.files).filter(([p]) => p.startsWith(DIR)).map(([p, f]) => [p, f.text]));

test('organizations get their nations from allowed (also OR), else from the id, else they are generic', () => {
	const t = (src) => FB.importer.parseMioFile(src, 'x.txt').map((o) => o.id + ':' + o.tags.join('+'));
	assert.deepEqual(t(FB_MOCK.MIOS), ['GER_test_organization:GER', 'ITA_shared_organization:ITA+FRA']);
	assert.deepEqual(t('POL_x_organization = { trait = { token = a } }'), ['POL_x_organization:POL']);
	assert.deepEqual(t(FB_MOCK.GENERIC_MIOS), ['generic_test_organization:']);
});

test('opening a mod reads its organizations per nation, with names and included template traits', async () => {
	await openMock();
	const mioTrees = FB.ws.trees.filter((t) => t.kind === 'mio').map((t) => t.id + ':' + t.tag).sort();
	assert.deepEqual(mioTrees, ['GER_test_organization:GER', 'ITA_shared_organization:ITA FRA', 'generic_test_organization:']);
	await FB.mios.load(true);
	const ger = FB.mios.byId('GER_test_organization');
	assert.equal(ger.name, 'Test Works');
	assert.equal(ger.src, 'mod');
	assert.deepEqual(ger.equipment, ['armor']);
	assert.deepEqual(FB.mios.forNation('GER').map((o) => o.id), ['GER_test_organization', 'generic_test_organization']);
	assert.deepEqual(FB.mios.forNation('FRA').map((o) => o.id), ['ITA_shared_organization', 'generic_test_organization']);
	const traits = FB.mios.traitsOf(ger);
	assert.deepEqual(traits.map((t) => t.token).sort(), ['GER_t1', 'GER_t2', 'GER_test_organization_initial_1', 'gen_t1']);
	assert.equal(traits.find((t) => t.token === 'GER_t1').name, 'Better Guns');
	assert.deepEqual(traits.find((t) => t.token === 'GER_t2').parents, [['GER_t1']]);
	assert.equal(traits.find((t) => t.token === 'gen_t1').from, 'generic_test_organization');
	assert.ok(traits.find((t) => t.token === 'GER_test_organization_initial_1').initial);
	assert.equal(FB.mios.bonusText(traits.find((t) => t.token === 'GER_t2')), '-5% production cost factor');
});

test('base game and mod together: the mod replaces same-path files and same-id organizations', async () => {
	await openMock();
	FB.mios.build(GAME, {}, modFiles(), FB.ws.loc);
	const ids = FB.mios.list.map((o) => o.id + ':' + o.src).sort();
	assert.deepEqual(ids, ['GER_game_organization:game', 'GER_test_organization:mod', 'ITA_shared_organization:mod', 'SOV_game_organization:game', 'generic_test_organization:mod']);
	assert.ok(!FB.mios.byId('generic_old_organization'), 'game file with the same path as a mod file is replaced');
	assert.deepEqual(FB.mios.forNation('SOV').map((o) => o.id), ['SOV_game_organization', 'generic_test_organization']);
});

test('a base-game organization can be copied into the mod, edited in the tree editor and saved', async () => {
	const m = await openMock();
	FB.mios.build(GAME, {}, modFiles(), FB.ws.loc);
	const sov = FB.mios.byId('SOV_game_organization');
	const key = await FB.mios.copyToMod(sov);
	assert.equal(key, DIR + 'game_sov.txt#0');
	assert.equal(m.file(DIR + 'game_sov.txt'), GAME[DIR + 'game_sov.txt'], 'copied unchanged');
	assert.equal(FB.mios.byId('SOV_game_organization').src, 'mod');
	FB.ws.switchTo(key);
	assert.equal(FB.state.project.kind, 'mio');
	const t = FB.state.project.focuses.find((f) => f.id === 'SG_t1');
	t.bonuses.equipment_bonus = [{ k: 'reliability', v: 0.1 }];
	const r = await FB.ws.save('', '');
	assert.ok(r.files.includes(DIR + 'game_sov.txt'));
	assert.match(m.file(DIR + 'game_sov.txt'), /token = SG_t1[\s\S]*equipment_bonus = \{[\s\S]*reliability = 0\.1/);
	assert.match(m.file(DIR + 'game_sov.txt'), /allowed = \{ original_tag = SOV \}/, 'the rest of the organization is kept');
});

test('guides keep an MIO click order with reasons and export it', async () => {
	await openMock();
	await FB.mios.load(true);
	const ger = FB.mios.byId('GER_test_organization');
	FB.guides.addMio('', ger);
	const g = FB.guides.list().find((x) => x.mio && x.mio.some((p) => p.id === 'GER_test_organization'));
	assert.ok(g, 'a new guide was made');
	assert.equal(g.tag, 'GER');
	const plan = g.mio[0];
	assert.deepEqual(plan.steps, []);
	['GER_t1', 'GER_t2'].map((k) => FB.mios.traitsOf(ger).find((t) => t.token === k)).forEach((t) => plan.steps.push({ token: t.token, name: t.name, icon: t.icon, bonus: FB.mios.bonusText(t), note: '' }));
	plan.steps[0].note = 'Cheap early boost.';
	plan.note = 'Best tank company.';
	const md = FB.guides.toMarkdown(g);
	assert.match(md, /## Military industrial organizations\n\n### Test Works\n\nBest tank company\.\n\n1\. \*\*Better Guns\*\* \(\+5% soft attack\) - Cheap early boost\.\n2\. \*\*T2\*\* \(-5% production cost factor\)/);
	assert.match(FB.guides.toBBCode(g), /\[h3\]Test Works\[\/h3\][\s\S]*\[olist\]\n\[\*\]\[b\]Better Guns\[\/b\]/);
	assert.match(FB.guides.toHtml(g, {}, {}), /<h2>Military industrial organizations<\/h2><div class="card"><h3>Test Works<\/h3>/);
});

/* how the game's own files are written: @variables, a template with headers, add / override / remove trait, $name$ */
const REAL = [
	'@hoesch_X = 3',
	'@hoesch_Y = 2',
	'generic_heavy_tank_organization = {',
	'\ticon = GFX_idea_generic_tank_manufacturer_3',
	'\tallowed = { always = no }',
	'\ttree_header_text = { text = mio_header_chassis x = 1 }',
	'\tinitial_trait = { name = gen_init equipment_bonus = { armor_value = 0.05 reliability = -0.1 } }',
	'\ttrait = { token = wide_tracks name = wide_tracks icon = GFX_generic_mio_trait_icon_reliability position = { x=1 y=0 } equipment_bonus = { reliability = 0.05 } }',
	'\ttrait = { token = extinguishers position = { x=0 y=2 } relative_position_id = wide_tracks all_parents = { wide_tracks } }',
	'\ttrait = { token = old_guns position = { x=2 y=0 } }',
	'}',
	'GER_porsche_organization = {',
	'\tinclude = generic_heavy_tank_organization',
	'\ticon = GFX_idea_porsche',
	'\tallowed = { OR = { original_tag = GER AND = { original_tag = MEX has_dlc = "Man the Guns" } } }',
	'\toverride_trait = { token = wide_tracks position = { x=0 y=0 } }',
	'\tremove_trait = { old_guns }',
	'\tadd_trait = { token = GER_hoesch name = GER_hoesch special_trait_background = yes position = { x=@hoesch_X y=@hoesch_Y } any_parent = { wide_tracks extinguishers } }',
	'}',
	''].join('\n');
const REAL_LOC = { GER_porsche_organization: '$porsche$', porsche: 'Porsche', wide_tracks: 'Wide Tracks', mio_header_chassis: 'Chassis' };

test('game-style organizations: template, overrides, removed and added traits, @variables, headers, $name$', () => {
	FB.mios.build({ [DIR + 'GER_organization.txt']: REAL }, REAL_LOC, {}, {});
	const p = FB.mios.byId('GER_porsche_organization');
	assert.equal(p.name, 'Porsche');
	assert.deepEqual(p.tags, ['GER', 'MEX']);
	assert.equal(FB.mios.iconOf(p), 'GFX_idea_porsche');
	assert.ok(FB.mios.byId('generic_heavy_tank_organization').archetype);
	assert.deepEqual(FB.mios.forNation('GER').map((o) => o.id), ['GER_porsche_organization'], 'templates are not offered to nations');
	const t = Object.fromEntries(FB.mios.traitsOf(p).map((x) => [x.token, x]));
	assert.ok(!t.old_guns, 'remove_trait');
	assert.deepEqual([t.wide_tracks.x, t.wide_tracks.y], [0, 0], 'override_trait moved it');
	assert.equal(t.wide_tracks.name, 'Wide Tracks');
	assert.equal(t.wide_tracks.icon, 'GFX_generic_mio_trait_icon_reliability', 'override keeps what it does not change');
	assert.deepEqual([t.extinguishers.x, t.extinguishers.y], [0, 2], 'relative to the moved trait');
	assert.deepEqual([t.GER_hoesch.x, t.GER_hoesch.y], [3, 2], '@variables');
	assert.ok(t.GER_hoesch.special);
	assert.deepEqual(t.GER_hoesch.parents, [['wide_tracks', 'extinguishers']]);
	assert.deepEqual(FB.mios.headersOf(p), [{ text: 'Chassis', x: 1 }]);
	assert.equal(FB.mios.bonusText(Object.values(t).find((x) => x.initial)), '+5% armor value, -10% reliability');
});

test('the editor reads add_trait with @variable positions and writes it back as add_trait', () => {
	const tree = FB.importer.parseMioFile(REAL, 'x.txt').find((x) => x.id === 'GER_porsche_organization');
	const pr = FB.migrate(FB.importer.buildMioProject(tree, {}).project);
	const f = pr.focuses.find((x) => x.id === 'GER_hoesch');
	assert.deepEqual([f.x, f.y], [3, 2]);
	assert.match(FB.gen.mioBlock(pr), /\tadd_trait = \{\n\t\ttoken = GER_hoesch/);
});
