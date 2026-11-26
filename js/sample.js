/* Focus Builder - small example project so first-time users can see how things fit together */
(function (FB) {
	'use strict';
	FB.makeSample = function () {
		const p = FB.newProject();
		p.meta.modName = 'Example Mod';
		p.meta.treeId = 'example_industrial_revival';
		p.meta.tag = 'GER';
		p.meta.notes = 'This is just an example tree to show how Focus Builder works. Delete it or edit freely.';
		const mk = (name, x, y, weeks, extra) => {
			const f = FB.newFocus(Object.assign({ name, x, y, weeks }, extra || {}));
			f.id = FB.uniqueIdIn(p, FB.slug(name), f.uid);
			p.focuses.push(f);
			return f;
		};
		FB.uniqueIdIn = (proj, slug, u) => {
			let id = `GER_${slug}`, n = 2;
			while (proj.focuses.some((f) => f.uid !== u && f.id === id)) id = `GER_${slug}_${n++}`;
			return id;
		};
		const fx = (type, pr) => ({ type, p: Object.assign(FB.catalog.defaults(FB.catalog.effectMap[type]), pr || {}) });
		const tg = (type, pr) => ({ type, p: Object.assign(FB.catalog.defaults(FB.catalog.triggerMap[type]), pr || {}), not: false });

		const rally = mk('Rally the Nation', 2, 0, 5, { desc: 'A call for unity brings the people together.', icon: 'GFX_goal_generic_national_unity',
			rewards: [fx('add_stability', { value: 5 }), fx('add_war_support', { value: 5 }), fx('add_political_power', { value: 25 })] });
		const civ = mk('Civilian Economy', 1, 1, 10, { desc: 'Focus on consumer goods and growth.', icon: 'GFX_goal_generic_construction', prereqs: [[rally.uid]],
			rewards: [fx('add_building_construction', { state: 64, type: 'industrial_complex', level: 2 }), fx('add_political_power', { value: 25 })] });
		const war = mk('War Economy', 3, 1, 10, { desc: 'Turn the factories toward armaments.', icon: 'GFX_goal_generic_production', prereqs: [[rally.uid]],
			rewards: [fx('add_building_construction', { state: 64, type: 'arms_factory', level: 2 }), fx('add_equipment_to_stockpile', { type: 'infantry_equipment_1', amount: 500 })] });
		civ.excl = [war.uid]; war.excl = [civ.uid];
		const research = mk('Research Council', 1, 2, 8, { desc: 'Gather the best minds of the nation.', icon: 'GFX_goal_generic_scientific_exchange', prereqs: [[civ.uid]],
			rewards: [fx('add_research_slot', { value: 1 }), fx('add_tech_bonus', { name: 'example_industry_bonus', bonus: 50, uses: 1, category: 'industry' })] });
		const reserves = mk('Mobilize Reserves', 3, 2, 8, { desc: 'Call up the reserves.', icon: 'GFX_goal_generic_army_doctrines', prereqs: [[war.uid]],
			rewards: [fx('add_manpower', { value: 50000 }), fx('add_exp', { type: 'army_experience', value: 25 }), fx('set_country_flag', { flag: 'example_mobilized' })] });
		const unity = mk('Unity of Purpose', 2, 3, 12, { desc: 'Industry and army work as one.', icon: 'GFX_goal_generic_allies', prereqs: [[research.uid, reserves.uid]],
			note: 'Make this the big payoff of the tree. A strong but balanced spirit.',
			rewards: [fx('add_ideas', { idea: 'GER_unity_of_purpose' }), fx('country_event', { event: 'example_mod.1' }),
				{ type: '__plain', p: { text: 'Unlock a decision that lets the player buy oil from a neighbouring country once per year.' } }] });
		unity.available.mode = 'all';
		unity.available.items = [tg('date', { op: '>', date: '1937.1.1' }), tg('has_stability', { op: '>', value: 50 })];

		p.items = [
			{ uid: FB.uid(), kind: 'idea', id: 'GER_unity_of_purpose', name: 'Unity of Purpose', desc: 'Every hand in the nation works toward one goal.', plain: '+10% political power gain, +5% stability, +5% factory output. Balanced, not overpowered.' },
			{ uid: FB.uid(), kind: 'event', id: 'example_mod.1', name: 'A New Dawn', desc: 'The government announces its plan to the people.', plain: 'Two options: celebrate (+5% stability) or stay modest (+25 political power).' }
		];
		p.view = { x: 80, y: 60, z: 1 };
		return p;
	};
})(window.FB = window.FB || {});
