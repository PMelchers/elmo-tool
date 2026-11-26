/* Focus Builder - Division templates: build the 5x5 battalion grid + 5 support companies and save it.
 * Units come from the base game and the open mod (common/units); a built-in list is used when none is loaded.
 * Only the layout is saved (no stats), so a template can be dropped into a country guide. */
(function (FB) {
	'use strict';
	const h = FB.h;
	const LS_KEY = 'focusbuilder.templates.v1';
	const T = { list: [], cur: null, loading: false, status: '', sig: '', units: { ready: false, battalions: [], support: [], byKey: {} } };
	let root, body, pop = null;

	/* ---------- storage ---------- */
	const load = () => { try { T.list = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { T.list = []; } };
	const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(T.list)); } catch (e) { /* storage unavailable */ } };
	const blankGrid = () => [0, 1, 2, 3, 4].map(() => [null, null, null, null, null]);
	const newTemplate = (name) => ({ id: FB.uid(), name: name || 'New template', notes: '', grid: blankGrid(), support: [null, null, null, null, null], created: new Date().toISOString(), updated: new Date().toISOString() });
	const current = () => T.list.find((t) => t.id === T.cur) || null;
	const touch = (t) => { t.updated = new Date().toISOString(); persist(); };
	const pretty = (k) => { const s = String(k).replace(/_/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };

	/* ---------- units ---------- */
	const GROUP_COLOR = { infantry: '#8fb06a', mobile: '#e3a24a', armor: '#c8664a', armor_combat_support: '#c8664a', combat_support: '#6f9bef', mobile_combat_support: '#6f9bef', support: '#47c9d8' };
	const GROUP_LABEL = { infantry: 'Infantry', mobile: 'Mobile', armor: 'Armor', armor_combat_support: 'Armored support brigades', combat_support: 'Support brigades', mobile_combat_support: 'Motorized support brigades', support: 'Support companies' };
	const BATTALION_GROUPS = new Set(['infantry', 'mobile', 'armor', 'armor_combat_support', 'combat_support', 'mobile_combat_support']);
	const FALLBACK_BAT = [['infantry', 'Infantry', 'infantry'], ['motorized', 'Motorized', 'mobile'], ['mechanized', 'Mechanized', 'mobile'], ['cavalry', 'Cavalry', 'mobile'], ['armored_car', 'Armored Car', 'mobile'],
		['light_armor', 'Light Tank', 'armor'], ['medium_armor', 'Medium Tank', 'armor'], ['heavy_armor', 'Heavy Tank', 'armor'], ['modern_armor', 'Modern Tank', 'armor'],
		['marine', 'Marines', 'infantry'], ['paratrooper', 'Paratroopers', 'infantry'], ['mountaineers', 'Mountaineers', 'infantry'],
		['artillery_brigade', 'Artillery', 'combat_support'], ['anti_air_brigade', 'Anti-Air', 'combat_support'], ['anti_tank_brigade', 'Anti-Tank', 'combat_support'], ['rocket_artillery_brigade', 'Rocket Artillery', 'combat_support']];
	const FALLBACK_SUP = [['recon', 'Recon', 'support'], ['engineer', 'Engineer', 'support'], ['field_hospital', 'Field Hospital', 'support'], ['logistics_company', 'Logistics', 'support'],
		['maintenance_company', 'Maintenance', 'support'], ['military_police', 'Military Police', 'support'], ['signal_company', 'Signal', 'support'], ['artillery', 'Artillery (support)', 'support'],
		['anti_air', 'Anti-Air (support)', 'support'], ['anti_tank', 'Anti-Tank (support)', 'support'], ['rocket_artillery', 'Rocket Artillery (support)', 'support'], ['light_flame_tank', 'Flame Tank', 'support']];

	function useFallback() {
		const U = T.units;
		U.battalions = FALLBACK_BAT.map(([key, name, group]) => ({ key, name, group, abbr: key.slice(0, 3).toUpperCase() }));
		U.support = FALLBACK_SUP.map(([key, name, group]) => ({ key, name, group, abbr: key.slice(0, 3).toUpperCase() }));
		U.byKey = {};
		U.battalions.concat(U.support).forEach((u) => { U.byKey[u.key] = u; });
	}
	const unitOf = (key) => (key ? T.units.byKey[key] || { key, name: pretty(key), group: 'infantry', abbr: String(key).slice(0, 3).toUpperCase() } : null);
	const unitIcon = (u) => {
		const k = u ? u.key : '';
		if (/anti_air|_aa/.test(k)) return 'plane';
		if (/anti_tank/.test(k)) return 'shield';
		if (/armor|tank|flame/.test(k) && !/destroyer/.test(k)) return 'tank';
		if (/destroyer/.test(k)) return 'shield';
		if (/artillery|rocket|fire_support/.test(k)) return 'crosshair';
		if (/recon|armored_car/.test(k)) return 'eye';
		if (/engineer|pioneer/.test(k)) return 'wrench';
		if (/hospital/.test(k)) return 'scale';
		if (/logistic/.test(k)) return 'factory';
		if (/maintenance/.test(k)) return 'cog';
		if (/signal/.test(k)) return 'globe';
		if (/police/.test(k)) return 'shield';
		if (/marine/.test(k)) return 'anchor';
		if (/para/.test(k)) return 'plane';
		if (/mountain/.test(k)) return 'map';
		if (/motor|mechan|cavalry|bicycle/.test(k)) return 'arrowRight';
		return 'users';
	};
	const sig = () => (FB.server.active ? 'g' : '') + '|' + (FB.ws.active ? FB.ws.name + '|' + (FB.ws.path || '') : '');

	async function loadUnits(force) {
		if (T.loading) return;
		if (T.units.ready && !force && T.sig === sig()) return;
		const sources = [];
		try {
			if (FB.server.active && FB.server.info && FB.server.info.game) { await FB.server.post('open', { path: FB.server.info.game }); sources.push({ label: 'game', dir: FB.server.dir(FB.server.info.game, 'game'), game: true }); }
		} catch (e) { /* game folder not available */ }
		if (FB.ws.active) sources.push({ label: 'mod', dir: FB.ws.dir, game: false });
		if (!sources.length) { useFallback(); T.units.ready = false; T.sig = sig(); return; }
		T.loading = true; T.status = 'Reading units…'; render();
		const found = new Map(), loc = {};
		try {
			for (const s of sources) {
				try {
					const dir = await (await s.dir.getDirectoryHandle('common')).getDirectoryHandle('units');
					const files = [];
					await FB.fsutil.walk(dir, '', files, 0, (n, base) => /\.txt$/i.test(n) && base === '');
					for (const f of files) {
						FB.importer.parse(await FB.fsutil.readText(f.handle)).forEach((top) => {
							if (top.k !== 'sub_units' || !Array.isArray(top.v)) return;
							top.v.forEach((e) => {
								if (!Array.isArray(e.v)) return;
								const g = e.v.find((x) => x.k === 'group'), ab = e.v.find((x) => x.k === 'abbreviation');
								found.set(e.k, { key: e.k, group: g && typeof g.v === 'string' ? g.v : '', abbr: ab && typeof ab.v === 'string' ? ab.v : e.k.slice(0, 3).toUpperCase() });
							});
						});
					}
				} catch (e) { /* no units folder in this source */ }
				if (s.game) {
					try {
						const ld = await (await (await s.dir.getDirectoryHandle('localisation')).getDirectoryHandle('english'));
						const lf = [];
						await FB.fsutil.walk(ld, '', lf, 0, (n) => /^unit_l_english\.ya?ml$/i.test(n));
						for (const f of lf) FB.importer.parseLoc(await FB.fsutil.readText(f.handle), loc);
					} catch (e) { /* no unit names */ }
				}
			}
		} finally { T.loading = false; T.status = ''; }
		if (FB.ws.active) Object.assign(loc, FB.ws.loc);
		const U = T.units;
		U.battalions = []; U.support = []; U.byKey = {};
		found.forEach((u) => {
			if (/^(fake_|hq_)/.test(u.key)) return;
			const item = { key: u.key, name: loc[u.key] || pretty(u.key), group: u.group, abbr: u.abbr };
			if (u.group === 'support') U.support.push(item); else if (BATTALION_GROUPS.has(u.group)) U.battalions.push(item); else return;
			U.byKey[u.key] = item;
		});
		const order = ['infantry', 'mobile', 'armor', 'combat_support', 'mobile_combat_support', 'armor_combat_support'];
		U.battalions.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name));
		U.support.sort((a, b) => a.name.localeCompare(b.name));
		U.ready = U.battalions.length > 0;
		if (!U.ready) useFallback();
		T.sig = sig();
		render();
	}

	/* ---------- popup ---------- */
	const outside = (e) => { if (pop && !pop.contains(e.target)) closePop(); };
	function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', outside, true); } }
	function showPop(anchor, el, width) {
		closePop();
		pop = el; el.style.width = width + 'px';
		document.body.appendChild(el);
		const r = anchor.getBoundingClientRect();
		el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + 'px';
		const below = window.innerHeight - r.bottom - 10;
		if (below >= 300 || below > r.top) { el.style.top = (r.bottom + 6) + 'px'; el.style.maxHeight = Math.max(220, below) + 'px'; }
		else { el.style.bottom = (window.innerHeight - r.top + 6) + 'px'; el.style.maxHeight = Math.max(220, r.top - 14) + 'px'; }
		setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
	}

	const tile = (u, size) => h('span', { class: 'dzf-tile tp-tile' + (u ? '' : ' empty'), style: Object.assign({}, size ? { width: size + 'px', height: size + 'px' } : {}, u ? { '--gc': GROUP_COLOR[u.group] || '#8e98a3' } : {}) },
		u ? FB.icon(unitIcon(u), size ? Math.round(size * 0.5) : 22) : FB.icon('plus', 18), u ? h('i', { class: 'tp-abbr' }, u.abbr) : null);

	function pickUnit(anchor, kind, onPick) {
		const list = (kind === 'support' ? T.units.support : T.units.battalions);
		let q = '';
		const box = h('div', { class: 'dzf-pop' });
		const listEl = h('div', { class: 'dzf-plist' });
		const choose = (key) => { closePop(); onPick(key); };
		function draw() {
			listEl.innerHTML = '';
			listEl.appendChild(h('div', { class: 'dzf-prow' }, h('button', { class: 'dzf-pbtn', onclick: () => choose(null) }, h('span', { class: 'dzf-tile empty' }, FB.icon('x', 16)), h('span', { class: 'dzf-ptxt' }, h('b', {}, 'Empty')))));
			const f = list.filter((u) => !q || u.name.toLowerCase().includes(q) || u.key.toLowerCase().includes(q));
			[...new Set(f.map((u) => u.group))].forEach((g) => {
				listEl.appendChild(h('div', { class: 'dzf-pcat' }, GROUP_LABEL[g] || pretty(g)));
				f.filter((u) => u.group === g).forEach((u) => listEl.appendChild(h('div', { class: 'dzf-prow' }, h('button', { class: 'dzf-pbtn', onclick: () => choose(u.key) }, tile(u, 38), h('span', { class: 'dzf-ptxt' }, h('b', {}, u.name), h('small', {}, u.key))))));
			});
			if (!f.length) listEl.appendChild(h('div', { class: 'muted', style: { padding: '10px' } }, 'Nothing matches.'));
		}
		const search = h('input', { type: 'search', class: 'dzf-psearch', placeholder: 'Search units…', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
		draw();
		box.append(h('div', { class: 'dzf-phead' }, FB.icon('users', 16), h('b', {}, kind === 'support' ? 'Support company' : 'Battalion')), search, listEl);
		showPop(anchor, box, 380);
		search.focus();
	}

	/* ---------- summary ---------- */
	function summary(t) {
		const count = {};
		let bat = 0, sup = 0;
		t.grid.forEach((row) => row.forEach((k) => { if (k) { bat++; count[k] = (count[k] || 0) + 1; } }));
		t.support.forEach((k) => { if (k) sup++; });
		const parts = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, n]) => n + '× ' + unitOf(k).name);
		return { bat, sup, text: parts.join(', ') || 'Empty template' };
	}

	/** Everything a guide needs to show the template without the game data. */
	function snapshot(t) {
		const cell = (k) => { const u = unitOf(k); return u ? { name: u.name, abbr: u.abbr, group: u.group, key: u.key } : null; };
		const s = summary(t);
		return { id: t.id, name: t.name, notes: t.notes || '', rows: t.grid.map((row) => row.map(cell)), support: t.support.map(cell), summary: s.text, battalions: s.bat, supportCount: s.sup };
	}

	/* ---------- presets ---------- */
	const PRESETS = [
		['Infantry 7/2 with recon + engineer', [['infantry', 'infantry', 'infantry', 'infantry', 'infantry'], ['infantry', 'infantry'], ['artillery_brigade', 'artillery_brigade']], ['recon', 'engineer']],
		['Infantry 10/0 with support', [['infantry', 'infantry', 'infantry', 'infantry', 'infantry'], ['infantry', 'infantry', 'infantry', 'infantry', 'infantry']], ['engineer', 'field_hospital', 'logistics_company']],
		['Motorized 6/2', [['motorized', 'motorized', 'motorized', 'motorized', 'motorized'], ['motorized'], ['mot_artillery_brigade', 'mot_artillery_brigade']], ['recon', 'maintenance_company']],
		['Medium tanks 8/2', [['medium_armor', 'medium_armor', 'medium_armor', 'medium_armor', 'medium_armor'], ['medium_armor', 'medium_armor', 'medium_armor'], ['motorized', 'motorized']], ['recon', 'maintenance_company', 'engineer']]
	];
	function applyPreset(t, idx) {
		const p = PRESETS[idx];
		t.grid = blankGrid();
		p[1].forEach((col, c) => col.forEach((k, r) => { t.grid[r][c] = k; }));
		t.support = [null, null, null, null, null];
		p[2].forEach((k, i) => { t.support[i] = k; });
		touch(t);
	}

	/* ---------- rendering ---------- */
	function render() {
		if (!body) return;
		closePop();
		body.innerHTML = '';
		const frame = h('div', { class: 'dzf-frame' });
		body.appendChild(frame);
		frame.appendChild(h('div', { class: 'dzf-title' },
			h('div', { class: 'dzf-tabs' }, h('button', { class: 'on' }, FB.icon('users', 16), 'Templates', h('span', { class: 'dzf-count' }, T.list.length))),
			h('h2', {}, 'Division Templates'),
			h('div', { class: 'dzf-status' }, h('span', {}, T.status || (T.units.ready ? 'Units: ' + T.units.battalions.length + ' battalions · ' + T.units.support.length + ' support' : 'Built-in unit list (open a mod or use the helper for the real units)')),
				h('button', { class: 'dzf-btn', onclick: () => FB.download('division-templates.json', JSON.stringify(T.list, null, 2), 'application/json') }, FB.icon('download', 14), 'Export'),
				h('button', { class: 'dzf-btn', onclick: importFile }, FB.icon('upload', 14), 'Import'))));
		if (!T.cur || !current()) T.cur = T.list.length ? T.list[0].id : null;
		frame.appendChild(h('div', { class: 'tp-main' }, listCol(), editor()));
	}

	function importFile() {
		const i = h('input', { type: 'file', accept: '.json' });
		i.onchange = async () => {
			try {
				const a = JSON.parse(await i.files[0].text());
				const add = (Array.isArray(a) ? a : [a]).filter((x) => x && Array.isArray(x.grid)).map((x) => Object.assign(newTemplate(x.name), x, { id: FB.uid() }));
				T.list = T.list.concat(add); persist(); if (add.length) T.cur = add[0].id; render(); FB.toast(`Imported ${add.length} template${add.length === 1 ? '' : 's'}`, 'ok');
			} catch (e) { FB.toast('That is not a templates file.', 'warn'); }
		};
		i.click();
	}

	function listCol() {
		const col = h('aside', { class: 'tp-list' });
		col.appendChild(h('button', { class: 'dzf-btn gold', onclick: () => { const t = newTemplate('Template ' + (T.list.length + 1)); T.list.push(t); T.cur = t.id; persist(); render(); } }, FB.icon('plus', 15), 'New template'));
		if (!T.list.length) col.appendChild(h('div', { class: 'tp-empty' }, 'No templates yet. Make one, then add it to a guide in the Guides tab.'));
		T.list.forEach((t) => {
			const s = summary(t);
			col.appendChild(h('button', { class: 'tp-item' + (t.id === T.cur ? ' on' : ''), onclick: () => { T.cur = t.id; render(); } }, h('b', {}, t.name || '(unnamed)'), h('small', {}, s.bat + ' battalions · ' + s.sup + ' support'), h('small', { class: 'tp-sum' }, s.text)));
		});
		return col;
	}

	function editor() {
		const t = current();
		const sec = h('section', { class: 'tp-edit' });
		if (!t) { sec.appendChild(h('div', { class: 'dz-empty' }, h('h3', {}, 'Division templates'), h('p', {}, 'Build the layout of a division: up to 25 battalions and 5 support companies. Templates are saved here and can be added to a country guide.'))); return sec; }
		sec.appendChild(h('div', { class: 'tp-head' },
			h('input', { type: 'text', class: 'dzf-name', value: t.name, placeholder: 'Template name', oninput: (e) => { t.name = e.target.value; touch(t); const it = document.querySelector('.tp-item.on b'); if (it) it.textContent = t.name || '(unnamed)'; } }),
			h('select', { class: 'dzf-pick', onchange: (e) => { if (e.target.value !== '') { applyPreset(t, Number(e.target.value)); render(); } } }, h('option', { value: '' }, 'Start from a preset…'), PRESETS.map((p, i) => h('option', { value: i }, p[0]))),
			h('button', { class: 'dzf-btn', onclick: () => { t.grid = blankGrid(); t.support = [null, null, null, null, null]; touch(t); render(); } }, FB.icon('undo', 14), 'Clear'),
			h('button', { class: 'dzf-btn', onclick: () => { const c = JSON.parse(JSON.stringify(t)); c.id = FB.uid(); c.name = t.name + ' (copy)'; T.list.push(c); T.cur = c.id; persist(); render(); } }, FB.icon('copy', 14), 'Duplicate'),
			h('button', { class: 'dzf-btn', onclick: () => { if (confirm('Delete the template "' + t.name + '"?')) { T.list = T.list.filter((x) => x.id !== t.id); T.cur = null; persist(); render(); } } }, FB.icon('trash', 14), 'Delete')));

		const cell = (kind, get, set) => {
			const key = get(), u = unitOf(key);
			return h('button', { class: 'tp-cell' + (u ? ' filled' : ''), title: u ? u.name + ' (right-click to clear)' : 'Click to choose a unit',
				onclick: (e) => pickUnit(e.currentTarget, kind, (k) => { set(k); touch(t); render(); }),
				oncontextmenu: (e) => { e.preventDefault(); set(null); touch(t); render(); } }, tile(u, 52), h('span', { class: 'tp-cap' }, u ? u.name : ''));
		};
		const fillBtn = (title, onFill) => h('button', { class: 'ibtn tp-fill', title, onclick: (e) => pickUnit(e.currentTarget, 'battalion', (k) => { onFill(k); touch(t); render(); }) }, FB.icon('plus', 14));
		const grid = h('div', { class: 'tp-grid' });
		grid.appendChild(h('span'));
		for (let c = 0; c < 5; c++) grid.appendChild(h('div', { class: 'tp-colh' }, 'Column ' + (c + 1), fillBtn('Fill this column', (k) => { for (let r = 0; r < 5; r++) t.grid[r][c] = k; })));
		for (let r = 0; r < 5; r++) {
			grid.appendChild(h('div', { class: 'tp-rowh' }, 'Row ' + (r + 1), fillBtn('Fill this row', (k) => { for (let c = 0; c < 5; c++) t.grid[r][c] = k; })));
			for (let c = 0; c < 5; c++) grid.appendChild(cell('battalion', () => t.grid[r][c], (k) => { t.grid[r][c] = k; }));
		}
		const sup = h('div', { class: 'tp-support' }, [0, 1, 2, 3, 4].map((i) => cell('support', () => t.support[i], (k) => { t.support[i] = k; })));
		const s = summary(t);
		sec.append(
			h('div', { class: 'tp-box' }, h('div', { class: 'dzf-phd' }, 'Combat battalions'), grid),
			h('div', { class: 'tp-box' }, h('div', { class: 'dzf-phd' }, 'Support companies'), sup),
			h('div', { class: 'tp-summary' }, h('b', {}, s.bat + ' battalions · ' + s.sup + ' support companies'), h('span', {}, s.text)),
			h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, FB.icon('scroll', 13), 'Notes (how and when to use this template)'), h('textarea', { rows: 3, value: t.notes || '', placeholder: 'e.g. Standard line division for the early war. Swap artillery for anti-tank against heavy tanks.', oninput: (e) => { t.notes = e.target.value; touch(t); } })),
			h('p', { class: 'muted small' }, 'Saved automatically in this browser. Left-click a cell to choose a unit, right-click to clear it. Stats are not shown here: this is only the layout.'));
		return sec;
	}

	FB.templates = {
		init() {
			load();
			useFallback();
			root = h('section', { id: 'templates' }, h('div', { id: 'tp-body' }));
			body = root.firstChild;
			document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
			FB.modes.register('templates', 'Templates', 'users', root, { open() { render(); loadUnits(false); }, close() { closePop(); } });
			FB.on('ws', () => { if (FB.modes.current === 'templates') loadUnits(false); });
		},
		list: () => T.list.slice(),
		snapshot,
		byId: (id) => T.list.find((t) => t.id === id) || null,
		ensureUnits: () => loadUnits(false),
		unitColor: (group) => GROUP_COLOR[group] || '#8e98a3'
	};
})(window.FB = window.FB || {});
