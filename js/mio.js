/* Focus Builder - Military Industrial Organization editor: inspector and project panel.
 * An organization is stored like a focus tree (project.kind === 'mio'); each trait is a node on the canvas. */
(function (FB) {
	'use strict';
	const h = FB.h;
	const M = FB.mio = {};

	const SUGGEST = {
		equipment_bonus: ['soft_attack', 'hard_attack', 'ap_attack', 'air_attack', 'armor_value', 'hardness', 'defense', 'breakthrough', 'maximum_speed', 'reliability',
			'build_cost_ic', 'fuel_consumption', 'lg_attack', 'hg_attack', 'torpedo_attack', 'anti_air_attack', 'naval_speed', 'naval_range', 'surface_detection', 'sub_detection',
			'surface_visibility', 'sub_visibility', 'max_strength', 'air_agility', 'air_range', 'air_defence', 'air_ground_attack', 'air_bombing'],
		production_bonus: ['production_cost_factor', 'production_efficiency_gain_factor', 'production_efficiency_cap_factor', 'production_capacity_factor',
			'production_resource_need_factor', 'production_factory_max_efficiency_factor', 'production_factory_efficiency_gain_factor', 'production_factory_start_efficiency_factor'],
		organization_modifier: ['military_industrial_organization_research_bonus', 'military_industrial_organization_task_capacity',
			'military_industrial_organization_size_up_requirement', 'military_industrial_organization_industrial_manufacturer_assign_cost',
			'military_industrial_organization_design_team_assign_cost', 'military_industrial_organization_policy_cost']
	};
	const TITLE = { equipment_bonus: 'Equipment bonuses', production_bonus: 'Production bonuses', organization_modifier: 'Organization modifiers' };
	const HINT = { equipment_bonus: 'Changes the stats of the equipment this organization makes (0.05 = +5%).', production_bonus: 'Changes how the factories produce (negative cost factor = cheaper).', organization_modifier: 'Changes the organization itself: research speed, size, task capacity.' };
	const open = { basics: true, parents: true, bonuses: true, more: false, code: false };

	/** Suggestion lists (datalists), extended with names already used in the loaded organizations. */
	function refreshLists() {
		const used = { equipment_bonus: new Set(SUGGEST.equipment_bonus), production_bonus: new Set(SUGGEST.production_bonus), organization_modifier: new Set(SUGGEST.organization_modifier) };
		if (FB.equip && FB.equip.data) Object.values(FB.equip.data.modules).forEach((m) => { Object.keys(m.add).concat(Object.keys(m.mult)).forEach((k) => used.equipment_bonus.add(k)); });
		const projs = [FB.state.project].concat(FB.ws && FB.ws.active ? Object.values(FB.ws.projects) : []);
		projs.forEach((p) => { if (p && p.kind === 'mio') p.focuses.forEach((f) => FB.MIO_BONUS.forEach((k) => ((f.bonuses || {})[k] || []).forEach((r) => used[k].add(r.k)))); });
		FB.MIO_BONUS.forEach((k) => {
			let dl = document.getElementById('dl-mio-' + k);
			if (!dl) { dl = h('datalist', { id: 'dl-mio-' + k }); document.body.appendChild(dl); }
			dl.innerHTML = '';
			[...used[k]].sort().forEach((v) => dl.appendChild(h('option', { value: v })));
		});
	}

	const SEC = { basics: ['sliders', '#6f9bef'], parents: ['link', '#c58be8'], bonuses: ['bolt', '#6cc08b'], more: ['cog', '#8e98a3'], code: ['code', '#8e98a3'] };
	const section = (key, title, body, badge) => {
		const st = SEC[key] || ['info', '#8e98a3'];
		const d = h('details', { class: 'sec', open: !!open[key], style: { '--sc': st[1] } },
			h('summary', {}, h('span', { class: 'sec-ico' }, FB.icon(st[0], 17)), h('span', { class: 'sec-title' }, title), badge ? h('span', { class: 'badge' }, badge) : null, h('span', { class: 'sec-chev' }, FB.icon('chevron-down', 16))),
			h('div', { class: 'sec-body' }, body));
		d.addEventListener('toggle', () => { open[key] = d.open; });
		return d;
	};
	const field = (label, control, hint) => h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, label), control, hint ? h('span', { class: 'fld-hint' }, hint) : null);
	const others = (f) => FB.state.project.focuses.filter((o) => o.uid !== f.uid).map((o) => ({ label: o.name || o.id, sub: o.id, key: o.id, uid: o.uid }));

	M.renderInspector = function (root, f) {
		refreshLists();
		const redraw = () => FB.ui.renderInspector();
		let codeEl;
		const updateCode = () => { if (codeEl) codeEl.textContent = FB.gen.mioTraitCode(f); };
		const touch = (k, o) => { FB.commit(k + f.uid, o || {}); updateCode(); };
		f.bonuses = f.bonuses || {};
		FB.MIO_BONUS.forEach((k) => { f.bonuses[k] = f.bonuses[k] || []; });

		const basics = h('div', {},
			field('Name shown in game', h('input', { type: 'text', value: f.name, oninput: (e) => { f.name = e.target.value; touch('name'); } }), 'Saved to the localisation file under the name key below.'),
			h('div', { class: 'row2' },
				field('Token (id)', h('input', { type: 'text', class: 'mono', value: f.id, readonly: !!f.initial, oninput: (e) => { f.id = e.target.value.trim().replace(/\s+/g, '_'); touch('token'); } })),
				field('Name key', h('input', { type: 'text', class: 'mono', value: f.nameKey || '', oninput: (e) => { f.nameKey = e.target.value.trim().replace(/\s+/g, '_'); touch('key'); } }))),
			field('Icon', h('input', { type: 'text', class: 'mono', value: f.icon || '', placeholder: 'GFX_generic_mio_trait_icon_reliability', oninput: (e) => { f.icon = e.target.value.trim(); touch('icon'); } })),
			f.initial ? h('div', { class: 'empty-hint' }, 'Starting trait: its bonuses are always active and it has no position in the tree.')
				: h('div', { class: 'row2' },
					field('Column (x)', h('input', { type: 'number', step: 1, value: f.x, oninput: (e) => { f.x = Math.round(Number(e.target.value) || 0); touch('x'); } })),
					field('Row (y)', h('input', { type: 'number', step: 1, value: f.y, oninput: (e) => { f.y = Math.round(Number(e.target.value) || 0); touch('y'); } }))));

		const chip = (u, onRemove, cls) => { const x = FB.getFocus(u); return h('span', { class: 'chip ' + (cls || '') }, x ? (x.name || x.id) : '?', h('button', { title: 'Remove', onclick: onRemove }, '×')); };
		const parentCombo = (ph, gi) => FB.combo({ placeholder: ph, items: () => others(f).filter((o) => !f.prereqs.some((g) => g.includes(o.uid)) && !FB.wouldCycle(f.uid, o.uid)), onPick: (it) => { if (FB.addPrereq(f.uid, it.uid, gi)) { touch('parents', { full: true }); } } });
		const parents = h('div', { class: 'prereq' });
		if (!f.prereqs.length) parents.appendChild(h('div', { class: 'empty-hint' }, 'No parents: available from the start. Add one below, or drag from the dot under another trait.'));
		f.prereqs.forEach((g, gi) => parents.appendChild(h('div', { class: 'pg' },
			h('div', { class: 'pg-label' }, gi === 0 ? 'Needs' : 'AND needs', g.length > 1 ? h('em', {}, ' (any one of)') : null),
			h('div', { class: 'chips' }, g.map((u) => chip(u, () => { g.splice(g.indexOf(u), 1); if (!g.length) f.prereqs.splice(gi, 1); touch('parents', { full: true }); })), parentCombo('+ or another…', gi)))));
		parents.appendChild(h('div', { class: 'add-row' }, parentCombo(f.prereqs.length ? 'Add another required trait…' : 'Add a parent trait…', null)));
		parents.appendChild(h('div', { class: 'sub-title' }, 'Cannot be taken together with'));
		parents.appendChild(h('div', { class: 'chips' }, f.excl.map((u) => chip(u, () => { FB.toggleExclusive(f.uid, u, false); touch('excl', { full: true }); }, 'red')),
			FB.combo({ placeholder: '+ choose a trait…', items: () => others(f).filter((o) => !f.excl.includes(o.uid)), onPick: (it) => { FB.toggleExclusive(f.uid, it.uid, true); touch('excl', { full: true }); } })));

		const bonuses = h('div', {});
		FB.MIO_BONUS.forEach((k) => {
			const rows = f.bonuses[k];
			const box = h('div', { class: 'bonus-box' }, h('div', { class: 'sub-title' }, FB.icon({ equipment_bonus: 'shield', production_bonus: 'factory', organization_modifier: 'cog' }[k], 15), TITLE[k]), h('div', { class: 'muted small' }, HINT[k]));
			rows.forEach((r, i) => {
				const pctHint = h('span', { class: 'muted small bonus-pct' }, Math.abs(Number(r.v)) < 5 ? (Math.round(Number(r.v) * 1000) / 10) + '%' : '');
				box.appendChild(h('div', { class: 'bonus-row' },
					h('input', { type: 'text', class: 'mono', list: 'dl-mio-' + k, value: r.k, placeholder: 'stat name', spellcheck: 'false', oninput: (e) => { r.k = e.target.value.trim(); touch('bonus'); } }),
					h('input', { type: 'number', step: 'any', value: r.v, oninput: (e) => { r.v = e.target.value === '' ? 0 : Number(e.target.value); pctHint.textContent = Math.abs(r.v) < 5 ? (Math.round(r.v * 1000) / 10) + '%' : ''; touch('bonus'); } }),
					pctHint,
					h('button', { class: 'ibtn danger', title: 'Remove', onclick: () => { rows.splice(i, 1); touch('bonus', { full: true }); } }, '✕')));
			});
			box.appendChild(h('div', { class: 'add-row' }, FB.combo({
				placeholder: `+ Add to ${TITLE[k].toLowerCase()}: type a stat…`, clear: true,
				items: () => [...document.getElementById('dl-mio-' + k).options].map((o) => ({ label: o.value, key: o.value })),
				always: () => [],
				onPick: (it) => { rows.push({ k: it.key, v: 0.05 }); touch('bonus', { full: true }); }
			})));
			bonuses.appendChild(box);
		});

		const more = h('div', {},
			field('Limited to equipment types', h('input', { type: 'text', class: 'mono', value: f.limit || '', placeholder: 'e.g. armor  (space separated, empty = all)', oninput: (e) => { f.limit = e.target.value; touch('limit'); } }), 'limit_to_equipment_type'),
			field('Other code kept as written', h('textarea', { rows: 5, class: 'mono', spellcheck: 'false', value: f.extra || '', placeholder: 'available, visible, on_complete, special_trait_background, …', oninput: (e) => { f.extra = e.target.value; touch('extra'); } }), 'Raw lines inside this trait that Focus Builder does not edit.'));
		codeEl = h('pre', { class: 'code-prev tall' }, FB.gen.mioTraitCode(f));
		const total = FB.MIO_BONUS.reduce((a, k) => a + f.bonuses[k].length, 0);

		root.append(
			h('div', { class: 'insp-head' },
				h('div', {}, h('div', { class: 'insp-title' }, f.name || f.id), h('code', {}, f.id)),
				h('div', { class: 'insp-actions' },
					h('button', { class: 'btn small', onclick: () => { FB.addFocus({ from: f.uid }); FB.commit('add', { full: true }); } }, '+ Follow-up'),
					h('button', { class: 'btn small', onclick: () => { FB.duplicateFocus(f.uid); FB.commit('dup', { full: true }); } }, 'Duplicate'),
					h('button', { class: 'btn small danger', onclick: () => { FB.deleteFocus(f.uid); FB.commit('del', { full: true }); } }, 'Delete'))),
			section('basics', 'Basics', basics),
			f.initial ? h('span') : section('parents', 'Unlocked after', parents),
			section('bonuses', 'Bonuses', bonuses, total || null),
			section('more', 'More', more),
			section('code', 'Code for this trait', codeEl));
		return redraw;
	};

	/** Left "Project" tab for an organization. */
	M.renderProject = function (body) {
		const m = FB.state.project.meta;
		body.innerHTML = '';
		body.append(
			h('div', { class: 'pane-intro' }, 'You are editing a Military Industrial Organization. Each box on the canvas is one trait; drag from the dot under a trait to make another trait depend on it.'),
			h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Organization id'), h('input', { type: 'text', class: 'mono', value: m.treeId, readonly: true })),
			h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Organization settings (kept as written)'),
				h('textarea', { rows: 14, class: 'mono', spellcheck: 'false', value: m.mioHeader || '', oninput: (e) => { m.mioHeader = e.target.value; FB.commit('mio-header'); } }),
				h('span', { class: 'fld-hint' }, 'include, icon, allowed, available, equipment_type, research_categories, headers… Edit with care.')));
	};

	FB.gen.mioTraitCode = (f) => FB.gen.mioBlock({ meta: { treeId: '_', mioHeader: '' }, focuses: [f] }).split('\n').slice(1, -1).map((l) => l.replace(/^\t/, '')).join('\n');
})(window.FB = window.FB || {});
