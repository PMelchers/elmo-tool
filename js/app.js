/* Focus Builder - app shell: panels, inspector, project settings, export dialog */
(function (FB) {
	'use strict';
	const h = FB.h;
	const $ = (id) => document.getElementById(id);
	const openState = { basics: true, prereq: true, avail: false, rewards: true, advanced: false, code: false };
	let leftTab = 'focuses';
	let listFilter = '';

	/* ---------- helpers ---------- */
	const SEC_STYLE = { basics: ['sliders', '#6f9bef'], prereq: ['link', '#c58be8'], avail: ['check', '#e3a24a'], rewards: ['gift', '#6cc08b'], advanced: ['cog', '#8e98a3'], code: ['code', '#8e98a3'] };
	const section = (key, title, body, badge) => {
		const st = SEC_STYLE[key] || ['info', '#8e98a3'];
		const d = h('details', { class: 'sec', open: !!openState[key], style: { '--sc': st[1] } },
			h('summary', {}, h('span', { class: 'sec-ico' }, FB.icon(st[0], 17)), h('span', { class: 'sec-title' }, title), badge ? h('span', { class: 'badge' }, badge) : null, h('span', { class: 'sec-chev' }, FB.icon('chevron-down', 16))),
			h('div', { class: 'sec-body' }, body));
		d.addEventListener('toggle', () => { openState[key] = d.open; });
		return d;
	};
	const field = (label, control, hint, icon) => h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, icon ? FB.icon(icon, 13) : null, label), control, hint ? h('span', { class: 'fld-hint' }, hint) : null);
	const focusItems = (exclude) => FB.state.project.focuses.filter((f) => !exclude(f)).map((f) => ({ label: f.name || '(unnamed)', sub: f.id, key: f.id, uid: f.uid }));

	/* ---------- inspector ---------- */
	function renderInspector() {
		const root = $('inspector');
		const scroll = root.scrollTop;
		root.innerHTML = '';
		const f = FB.getSelected();
		if (!f) { root.appendChild(emptyInspector()); return; }
		if (FB.state.project.kind === 'mio') { FB.mio.renderInspector(root, f); root.scrollTop = scroll; return; }
		const key = (k) => k + f.uid;
		const touch = (k, opts) => { FB.commit(key(k), opts || {}); updateCode(); };
		let codeEl;
		const updateCode = () => { if (codeEl) codeEl.textContent = FB.gen.focusCode(f); };
		const redraw = () => { renderInspector(); };

		/* basics */
		const idInput = h('input', { type: 'text', class: 'mono', value: f.id, readonly: !f.idLocked, spellcheck: 'false',
			oninput: (e) => { f.id = e.target.value.trim().replace(/\s+/g, '_'); touch('id'); } });
		const nameInput = h('input', { type: 'text', value: f.name, placeholder: 'e.g. Industrial Push',
			oninput: (e) => { FB.setName(f, e.target.value); if (!f.idLocked) idInput.value = f.id; touch('name'); } });
		const iconInput = h('input', { type: 'text', value: f.icon || '', placeholder: FB.state.project.meta.defaultIcon || 'GFX_goal_unknown', autocomplete: 'off', spellcheck: 'false',
			oninput: (e) => { f.icon = e.target.value.trim(); touch('icon'); } });
		FB.attachCombo(iconInput, { items: () => FB.suggestItems('icon'), clear: false, browse: true, limit: 200, group: 'field:icon', onPick: (it) => { f.icon = it.value || it.key; iconInput.value = f.icon; touch('icon'); } });
		const pickIcon = () => FB.focusGfx.openPicker(f.icon, (name) => { f.icon = name; iconInput.value = name; touch('icon', { full: true }); redraw(); });
		const daysLbl = h('span', { class: 'fld-hint' }, FB.weeksToText(f.weeks));
		const weeks = h('input', { type: 'number', min: 0, step: 1, value: f.weeks, oninput: (e) => { f.weeks = e.target.value === '' ? 0 : Number(e.target.value); daysLbl.textContent = FB.weeksToText(f.weeks); touch('weeks'); } });
		const chips = h('div', { class: 'chips' }, [2, 5, 10, 15, 20, 30, 45].map((w) => h('button', { class: 'chip-btn', onclick: () => { f.weeks = w; weeks.value = w; daysLbl.textContent = FB.weeksToText(w); touch('weeks'); } }, w + ' wk')));
		const basics = h('div', { class: 'stack' },
			field('Name of the focus', nameInput, 'The title players see on the tree.', 'tag'),
			h('div', { class: 'row2' },
				field('Duration', h('div', {}, h('div', { class: 'affix' }, weeks, h('span', { class: 'unit' }, 'weeks')), daysLbl), null, 'clock'),
				field('Icon', h('div', { class: 'icon-pick' },
					h('span', { class: 'icon-prev', title: 'Choose a picture', onclick: () => { if (FB.dev.on) pickIcon(); } }, FB.gfx ? FB.gfx.picture(f.icon || FB.state.project.meta.defaultIcon || 'GFX_goal_unknown', 'icon-prev-img') : null),
					h('div', { class: 'icon-col' }, iconInput, h('button', { class: 'btn small', onclick: pickIcon }, FB.icon('image', 13), 'Choose picture…'))),
					'Pick from every icon of the game and your mod, or use your own picture.', 'star')),
			chips,
			field('Description shown in game', h('textarea', { rows: 4, placeholder: 'A short story or explanation, shown in the focus tooltip.', value: f.desc, oninput: (e) => { f.desc = e.target.value; touch('desc'); } }), null, 'scroll'),
			h('div', { class: 'row2 idrow' },
				field('Internal ID', idInput, 'Made from the name automatically. Used in code.', 'code'),
				h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.idLocked, onchange: (e) => { f.idLocked = e.target.checked; if (!f.idLocked) FB.setName(f, f.name); touch('lock', { full: true }); } }), 'Edit the ID by hand')),
			h('div', { class: 'row2' },
				field('Column (x)', h('input', { type: 'number', step: 1, value: f.x, oninput: (e) => { f.x = Math.round(Number(e.target.value) || 0); touch('x'); } }), 'Left / right on the tree', 'maximize'),
				field('Row (y)', h('input', { type: 'number', step: 1, value: f.y, oninput: (e) => { f.y = Math.round(Number(e.target.value) || 0); touch('y'); } }), 'Top / bottom on the tree', 'maximize')));

		/* prerequisites + exclusive */
		const prereq = h('div', { class: 'prereq' });
		const chip = (u, onRemove, cls) => {
			const x = FB.getFocus(u);
			return h('span', { class: 'chip ' + (cls || '') }, x ? x.name : '?', h('button', { title: 'Remove', onclick: onRemove }, '×'));
		};
		const groupCombo = (placeholder, gi) => FB.combo({ placeholder, items: () => focusItems((o) => o.uid === f.uid || f.prereqs.some((g) => g.includes(o.uid)) || FB.wouldCycle(f.uid, o.uid)),
			onPick: (it) => { if (FB.addPrereq(f.uid, it.uid, gi)) { touch('prereq', { full: true }); } } });
		if (!f.prereqs.length) prereq.appendChild(h('div', { class: 'empty-hint' }, 'No prerequisites: this is a starting focus. Add one below, or drag from the dot under another focus on the canvas.'));
		f.prereqs.forEach((g, gi) => {
			prereq.appendChild(h('div', { class: 'pg' },
				h('div', { class: 'pg-label' }, gi === 0 ? 'Requires' : 'AND also requires', g.length > 1 ? h('em', {}, ' (any one of)') : null),
				h('div', { class: 'chips' }, g.map((u) => chip(u, () => { g.splice(g.indexOf(u), 1); if (!g.length) f.prereqs.splice(gi, 1); touch('prereq', { full: true }); })), groupCombo('+ or another…', gi))));
		});
		prereq.appendChild(h('div', { class: 'add-row' }, groupCombo(f.prereqs.length ? 'Add another required focus…' : 'Add a required focus…', null)));
		prereq.appendChild(h('div', { class: 'sub-title' }, 'Cannot be taken together with'));
		prereq.appendChild(h('div', { class: 'chips' }, f.excl.map((u) => chip(u, () => { FB.toggleExclusive(f.uid, u, false); touch('excl', { full: true }); }, 'red')),
			FB.combo({ placeholder: '+ choose a focus…', items: () => focusItems((o) => o.uid === f.uid || f.excl.includes(o.uid)), onPick: (it) => { FB.toggleExclusive(f.uid, it.uid, true); touch('excl', { full: true }); } })));

		/* requirements, rewards, advanced */
		const cb = { changed: () => touch('items'), structural: () => { touch('items-s'); redraw(); } };
		const availHost = h('div'); FB.renderCondEditor(availHost, f.available, cb);
		const rewardHost = h('div'); FB.renderItemList(rewardHost, f.rewards, 'effect', cb);
		const bypassHost = h('div'); FB.renderCondEditor(bypassHost, f.bypass, cb);
		const visHost = h('div'); FB.renderCondEditor(visHost, f.visible, cb);
		const derived = FB.derivedFilters(f);
		const filterBox = h('div', { class: 'chips' }, FB.catalog.filters.map((fl) => {
			const isD = derived.includes(fl.id), on = isD || f.filters.includes(fl.id);
			return h('button', { class: 'chip-btn' + (on ? ' on' : ''), style: on ? { borderColor: fl.color, color: fl.color } : null, title: isD ? 'Added automatically from the rewards' : '',
				onclick: () => { if (isD) return; const i = f.filters.indexOf(fl.id); if (i < 0) f.filters.push(fl.id); else f.filters.splice(i, 1); touch('filters', { full: true }); } }, fl.label);
		}));
		const advanced = h('div', {},
			h('div', { class: 'sub-title' }, 'Only show this focus when…'), visHost,
			h('div', { class: 'sub-title' }, 'Complete automatically (skip) when…'), bypassHost,
			h('div', { class: 'row2' },
				field('AI priority', h('input', { type: 'number', min: 0, value: f.ai, oninput: (e) => { f.ai = e.target.value === '' ? '' : Number(e.target.value); touch('ai'); } }), 'How eagerly computer-controlled countries pick this. 10 is normal.')),
			h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !f.cancelInvalid, onchange: (e) => { f.cancelInvalid = !e.target.checked; touch('flags'); } }), 'Keep progress even if requirements become false'),
			h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.continueInvalid, onchange: (e) => { f.continueInvalid = e.target.checked; touch('flags'); } }), 'Continue even if the focus becomes invalid'),
			h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.capitulated, onchange: (e) => { f.capitulated = e.target.checked; touch('flags'); } }), 'Available even after capitulation'),
			h('div', { class: 'sub-title' }, 'Filter buttons (in-game search)'), filterBox);
		const extraBox = field('Other code kept from import', h('textarea', { rows: 4, class: 'mono', spellcheck: 'false', placeholder: 'Nothing. Original focus code Focus Builder does not understand is stored here and written back unchanged.', value: f.extra || '', oninput: (e) => { f.extra = e.target.value; touch('extra'); } }), 'Advanced: raw HOI4 lines added inside this focus.');
		const note = field('Notes for Claude', h('textarea', { rows: 3, placeholder: 'Anything Claude should know about this focus: balance, lore, what it should feel like…', value: f.note, oninput: (e) => { f.note = e.target.value; touch('note'); } }), 'Optional. Goes into the export and next to this focus in the code.');
		codeEl = h('pre', { class: 'code-prev tall' }, FB.gen.focusCode(f));

		const full = document.getElementById('app').classList.contains('insp-full');
		const head = h('div', { class: 'insp-head' },
			h('span', { class: 'insp-pic' }, FB.gfx ? FB.gfx.picture(f.icon || FB.state.project.meta.defaultIcon || 'GFX_goal_unknown', 'insp-pic-img') : null),
			h('div', { class: 'insp-tt' }, h('div', { class: 'insp-title' }, f.name || '(unnamed)'), h('code', {}, f.id),
				full ? h('div', { class: 'insp-sum' }, FB.icon('clock', 14), FB.weeksToText(f.weeks), ' · ', FB.icon('gift', 14), f.rewards.length + ' reward' + (f.rewards.length === 1 ? '' : 's')) : null),
			h('div', { class: 'insp-actions' },
				h('button', { class: 'btn small ro-keep', title: full ? 'Back to the tree (Esc)' : 'Show this focus on the whole screen', onclick: () => setFull(!full) }, FB.icon('maximize', 13), full ? 'Back to tree' : 'Full screen'),
				h('button', { class: 'btn small', onclick: () => { FB.addFocus({ from: f.uid }); FB.commit('add', { full: true }); } }, '+ Follow-up'),
				h('button', { class: 'btn small', onclick: () => { FB.duplicateFocus(f.uid); FB.commit('dup', { full: true }); } }, 'Duplicate'),
				h('button', { class: 'btn small danger', onclick: () => { FB.deleteFocus(f.uid); FB.commit('del', { full: true }); } }, 'Delete')));
		root.append(head,
			section('basics', 'Basics', basics),
			section('prereq', 'What it needs first', prereq),
			section('avail', 'Extra requirements', [availHost], f.available.items.length || null),
			section('rewards', 'Rewards', rewardHost, f.rewards.length || null),
			section('advanced', 'Advanced', [advanced, extraBox, note]),
			section('code', 'HOI4 code for this focus', codeEl));
		root.scrollTop = scroll;
	}

	/** The focus panel on the whole screen: bigger and easier to read. */
	function setFull(on) {
		const app = document.getElementById('app');
		if (on && !FB.getSelected()) return;
		if (app.classList.contains('insp-full') === !!on) return;
		app.classList.toggle('insp-full', !!on);
		renderInspector();
		$('inspector').scrollTop = 0;
		if (!on) setTimeout(() => FB.canvas.render(), 0);
	}
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal-root').children.length && document.getElementById('app').classList.contains('insp-full')) setFull(false); });

	function emptyInspector() {
		const P = FB.state.project, fs = P.focuses;
		const issues = FB.validate().filter((i) => i.level !== 'info').length;
		return h('div', { class: 'insp-empty' },
			h('h3', {}, 'Nothing selected'),
			h('p', {}, 'Click a focus on the canvas to edit it here.'),
			h('div', { class: 'stats' },
				h('div', {}, h('b', {}, fs.length), 'focuses'),
				h('div', {}, h('b', {}, fs.reduce((a, f) => a + f.rewards.length, 0)), 'rewards'),
				h('div', {}, h('b', {}, issues), 'things to fix')),
			h('div', { class: 'cheats' },
				h('h4', {}, 'Quick tips'),
				!FB.dev.on ? h('ul', {},
					h('li', {}, 'Pick the tree of a country at the top left, or search the focus list.'),
					h('li', {}, 'Click a focus to read its details. Scroll to zoom, drag the background to pan.'),
					h('li', {}, 'Pick a guide above the tree to see its focus order as numbers.'),
					h('li', {}, 'Switch to ', h('b', {}, 'Development'), ' (top bar) to edit.')) :
				h('ul', {},
					h('li', {}, h('b', {}, 'Double-click'), ' empty space to add a focus.'),
					h('li', {}, 'Drag a focus to move it. Drag the ', h('b', {}, 'dot underneath'), ' onto another focus to link them.'),
					h('li', {}, 'Right-click for more options. Scroll to zoom, drag the background to pan.'),
					h('li', {}, 'In ', h('b', {}, 'Rewards'), ', start typing what you want ("stability", "factory"…); the list autocompletes.'),
					h('li', {}, 'Can\'t find it? Choose ', h('b', {}, 'Describe it in plain words'), ' and Claude does the coding.'),
					h('li', {}, 'When done press ', h('b', {}, 'Export for Claude'), '.'))));
	}

	/* ---------- left: focus list ---------- */
	function renderList() {
		const body = $('pane-focuses');
		const keepSearch = body.querySelector('input.search');
		const hadFocus = keepSearch && document.activeElement === keepSearch;
		body.innerHTML = '';
		const search = h('input', { type: 'search', class: 'search', placeholder: 'Search focuses…', value: listFilter, oninput: (e) => { listFilter = e.target.value; renderList(); } });
		body.appendChild(search);
		const fs = FB.state.project.focuses.slice().sort((a, b) => a.y - b.y || a.x - b.x);
		const q = listFilter.toLowerCase();
		const issues = new Map(); FB.validate().forEach((i) => { if (i.uid && i.level !== 'info') issues.set(i.uid, true); });
		const list = h('div', { class: 'flist' });
		fs.filter((f) => !q || f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q)).forEach((f) => {
			list.appendChild(h('button', { class: 'frow' + (FB.state.selected === f.uid ? ' sel' : ''), onclick: () => { FB.select(f.uid); FB.canvas.centerOn(f.uid); } },
				h('span', { class: 'fr-ico', style: { '--nc': FB.nodeGlyph(f).color } }, FB.icon(FB.nodeGlyph(f).icon, 16)),
				h('span', { class: 'fr-name' }, f.name || '(unnamed)'),
				issues.get(f.uid) ? h('span', { class: 'fr-warn', title: 'Needs attention' }, '!') : null,
				h('span', { class: 'fr-meta' }, FB.state.project.kind === 'mio' ? (f.initial ? 'start' : `${Object.values(f.bonuses || {}).reduce((a, r) => a + r.length, 0)} bonus`) : `${f.weeks} wk`)));
		});
		if (!fs.length) list.appendChild(h('div', { class: 'empty-hint' }, 'No focuses yet.'));
		body.appendChild(list);
		if (hadFocus) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
	}

	/* ---------- left: project settings ---------- */
	function renderProject() {
		const m = FB.state.project.meta, body = $('pane-project');
		body.innerHTML = '';
		if (FB.state.project.kind === 'mio') { FB.mio.renderProject(body); return; }
		const t = (key, label, hint, opts) => field(label, h('input', Object.assign({ type: 'text', value: m[key], spellcheck: 'false', list: opts && opts.list },
			{ oninput: (e) => { m[key] = e.target.value; if (opts && opts.ids) FB.regenIds(); FB.commit('meta-' + key, { full: !!(opts && opts.ids) }); } })), hint);
		body.append(
			h('div', { class: 'pane-intro' }, 'These settings end up in the export. Claude uses them to put the tree in the right place.'),
			t('modName', 'Mod name', 'Just for the briefing.'),
			t('tag', 'Country tag *', 'Three letters, e.g. GER. Several allowed, separated by spaces.', { ids: true, list: 'dl-tag' }),
			t('treeId', 'Focus tree ID *', 'Letters, numbers and underscores. Also the file name.'),
			t('idPrefix', 'Focus ID prefix', 'Optional. Default is the country tag, e.g. GER_', { ids: true }),
			t('modFolder', 'Mod folder on your PC', 'Optional, helps Claude find your mod. e.g. C:\\Users\\you\\Documents\\Paradox Interactive\\Hearts of Iron IV\\mod\\my_mod'),
			t('hoi4Version', 'HOI4 version', 'e.g. 1.16. Claude adapts syntax to it.'),
			field('Default icon', FB.combo({ placeholder: 'GFX_goal_unknown', value: m.defaultIcon, clear: false, items: () => FB.catalog.icons,
				onPick: (it) => { m.defaultIcon = it.key; FB.commit('meta-icon', { full: true }); renderProject(); } }), 'Used for focuses without their own icon.'),
			field('General notes for Claude', h('textarea', { rows: 6, placeholder: 'Describe the mod, the country, the theme of this tree, balance goals…', value: m.notes, oninput: (e) => { m.notes = e.target.value; FB.commit('meta-notes'); } })));
	}

	/* ---------- left: things to create ---------- */
	function renderThings() {
		const pr = FB.state.project, body = $('pane-things');
		body.innerHTML = '';
		body.appendChild(h('div', { class: 'pane-intro' }, 'Ideas (national spirits), events and decisions your rewards use. Describe them in plain words; Claude writes the real code.'));
		const kinds = [['idea', 'National spirit / idea'], ['event', 'Event'], ['decision', 'Decision'], ['tooltip', 'Tooltip text'], ['other', 'Other']];
		const undef = FB.undefinedRefs();
		if (undef.length) {
			body.appendChild(h('div', { class: 'undef' }, h('div', { class: 'sub-title' }, 'Used but not described yet'),
				undef.map((r) => h('div', { class: 'undef-row' }, h('span', {}, h('b', {}, r.id), ' ', h('em', {}, FB.KIND_LABEL[r.kind] || r.kind)),
					h('button', { class: 'btn small', onclick: () => { pr.items.push({ uid: FB.uid(), kind: r.kind, id: r.id, name: '', desc: '', plain: '' }); FB.commit('item-add', { reload: true }); } }, 'Describe')))));
		}
		pr.items.forEach((it, i) => {
			const card = h('div', { class: 'ecard' },
				h('div', { class: 'ecard-h' },
					h('select', { value: it.kind, onchange: (e) => { it.kind = e.target.value; FB.commit('item-kind', { reload: true }); } }, kinds.map(([v, l]) => h('option', { value: v }, l))),
					h('button', { class: 'ibtn danger', title: 'Remove', onclick: () => { pr.items.splice(i, 1); FB.commit('item-del', { reload: true }); } }, '✕')),
				h('div', { class: 'pgrid' },
					field('ID (used in code)', h('input', { type: 'text', class: 'mono', value: it.id, spellcheck: 'false', placeholder: 'e.g. GER_unity_of_purpose', oninput: (e) => { it.id = e.target.value.trim().replace(/\s+/g, '_'); FB.commit('item-id' + i, {}); } })),
					field('Title shown in game', h('input', { type: 'text', value: it.name, oninput: (e) => { it.name = e.target.value; FB.commit('item-name' + i); } })),
					field('Text / story', h('textarea', { rows: 2, value: it.desc, placeholder: 'Description or event text players read.', oninput: (e) => { it.desc = e.target.value; FB.commit('item-desc' + i); } })),
					field('What should it do?', h('textarea', { rows: 3, value: it.plain, placeholder: 'e.g. +10% political power gain, +5% stability.', oninput: (e) => { it.plain = e.target.value; FB.commit('item-plain' + i); } }))));
			body.appendChild(card);
		});
		body.appendChild(h('div', { class: 'add-grid' }, kinds.slice(0, 3).map(([v, l]) => h('button', { class: 'btn', onclick: () => { pr.items.push({ uid: FB.uid(), kind: v, id: '', name: '', desc: '', plain: '' }); FB.commit('item-add', { reload: true }); } }, '+ ' + l))));
	}

	/* ---------- tabs / views ---------- */
	function setLeftTab(t) {
		leftTab = t;
		document.querySelectorAll('#left-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
		['focuses', 'project', 'things', 'changes'].forEach((k) => $('pane-' + k).hidden = k !== t);
		if (t === 'changes' && FB.ui.renderChanges) FB.ui.renderChanges();
	}
	function setView(v) {
		$('app').dataset.view = v;
		document.querySelectorAll('#mobile-nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
	}

	/* ---------- top bar ---------- */
	function updateTopbar() {
		const issues = FB.validate();
		const err = issues.filter((i) => i.level === 'error').length, warn = issues.filter((i) => i.level === 'warn').length;
		const b = $('btn-issues');
		b.className = 'pill ' + (err ? 'bad' : warn ? 'warn' : 'ok');
		b.textContent = err ? `${err} error${err > 1 ? 's' : ''}${warn ? ` · ${warn} warning${warn > 1 ? 's' : ''}` : ''}` : warn ? `${warn} warning${warn > 1 ? 's' : ''}` : 'All good';
		$('btn-undo').disabled = !FB.canUndo();
		$('btn-redo').disabled = !FB.canRedo();
	}
	function toggleIssues(force) {
		const pop = $('issues-pop');
		const show = force != null ? force : pop.hidden;
		pop.hidden = !show;
		if (!show) return;
		pop.innerHTML = '';
		const issues = FB.validate();
		pop.appendChild(h('div', { class: 'pop-h' }, issues.length ? 'Things to check' : 'No problems found'));
		const order = { error: 0, warn: 1, info: 2 };
		issues.sort((a, b) => order[a.level] - order[b.level]).forEach((i) => {
			pop.appendChild(h('button', { class: 'issue ' + i.level, onclick: () => { toggleIssues(false); if (i.uid) { FB.select(i.uid); FB.canvas.centerOn(i.uid); setView('tree'); } else if (/Project tab/.test(i.msg)) setLeftTab('project'); else if (/Things to create/.test(i.msg)) setLeftTab('things'); } },
				h('span', { class: 'dot' }), i.msg));
		});
	}

	/* ---------- modals ---------- */
	function modal(title, body, opts) {
		const root = $('modal-root');
		const close = () => { root.innerHTML = ''; };
		const box = h('div', { class: 'modal' + (opts && opts.wide ? ' wide' : '') },
			h('div', { class: 'modal-h' }, h('h2', {}, title), h('button', { class: 'ibtn', onclick: close, title: 'Close' }, '✕')),
			h('div', { class: 'modal-b' }, body));
		root.innerHTML = '';
		root.appendChild(h('div', { class: 'overlay', onmousedown: (e) => { if (e.target.classList.contains('overlay')) close(); } }, box));
		return close;
	}
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('modal-root').innerHTML = ''; toggleIssues(false); } });

	function helpBody(withStart) {
		return h('div', { class: 'help' },
			h('img', { class: 'help-logo', src: 'assets/logo.png?v=3', alt: '' }),
			h('p', { class: 'lead' }, 'Build a Hearts of Iron IV focus tree without writing code, or open your whole mod, edit any country\'s tree and save it back. Hand the result to Claude if you like.'),
			h('p', { class: 'muted' }, 'Have a mod already? Press ', h('b', {}, 'Open mod folder'), ' in the top-left: every focus tree in it appears in the tree switcher, edits are saved back with a backup, and every change is logged in a changelog.'),
			h('ol', {},
				h('li', {}, h('b', {}, 'Set up. '), 'Open the ', h('em', {}, 'Project'), ' tab and enter your country tag (e.g. GER) and a tree name.'),
				h('li', {}, h('b', {}, 'Place focuses. '), 'Double-click the canvas. Drag focuses around; drag the dot under one onto another to say "this needs that".'),
				h('li', {}, h('b', {}, 'Fill in details. '), 'Name, description, duration in weeks, icon. In ', h('em', {}, 'Rewards'), ' just type what you want: "stability", "factory", "research", "war"… and pick from the list. Missing something? Choose "Describe it in plain words".'),
				h('li', {}, h('b', {}, 'Describe extras. '), 'If a reward needs a national spirit or event, add it under ', h('em', {}, 'Things to create'), ' in plain words.'),
				h('li', {}, h('b', {}, 'Export. '), 'Press ', h('em', {}, 'Export for Claude'), '. Save straight into your mod folder, or copy everything into a chat. Claude gets the code, a full briefing and your notes.')),
			h('p', { class: 'muted' }, 'Shortcuts on the canvas: N new focus · Delete remove · arrows move · Ctrl+D duplicate · Ctrl+Z / Ctrl+Y undo / redo. Your work is saved in this browser automatically; use Save to keep a file.'),
			withStart ? h('div', { class: 'btn-row' },
				h('button', { class: 'btn primary', onclick: () => { FB.setProject(FB.makeSample()); setTimeout(() => FB.canvas.fit(), 30); $('modal-root').innerHTML = ''; } }, 'Open the example tree'),
				h('button', { class: 'btn', onclick: () => { $('modal-root').innerHTML = ''; } }, 'Start from scratch')) : null);
	}

	/* ---------- export dialog ---------- */
	function openExport() {
		const files = FB.gen.files();
		const issues = FB.validate().filter((i) => i.level === 'error');
		const paths = FB.gen.paths();
		let current = 0;
		const pre = h('pre', { class: 'code-prev tall file-prev' });
		const tabs = h('div', { class: 'file-tabs' });
		const drawTabs = () => {
			tabs.innerHTML = '';
			files.forEach((f, i) => tabs.appendChild(h('button', { class: i === current ? 'on' : '', onclick: () => { current = i; drawTabs(); } }, f.path.split('/').pop())));
			pre.textContent = files[current].content.replace('\uFEFF', '');
			pathLbl.textContent = files[current].path;
		};
		const pathLbl = h('div', { class: 'path-lbl mono' });
		const prompt = FB.gen.prompt();
		const canFs = typeof window.showDirectoryPicker === 'function';
		const saveFolder = async () => {
			try {
				const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
				const existing = [];
				for (const f of files) { try { await fileHandle(dir, f.path, false); existing.push(f.path); } catch (e) { /* new file */ } }
				if (existing.length && !confirm('These files already exist and will be replaced:\n\n' + existing.join('\n') + '\n\nContinue?')) return;
				for (const f of files) {
					const fh = await fileHandle(dir, f.path, true);
					const w = await fh.createWritable(); await w.write(new Blob([f.content])); await w.close();
				}
				FB.toast('Saved into ' + dir.name + '. Now tell Claude to read ' + paths.brief, 'ok');
			} catch (e) { if (e && e.name !== 'AbortError') FB.toast('Could not save: ' + (e.message || e), 'warn'); }
		};
		async function fileHandle(dir, path, create) {
			const parts = path.split('/'); let d = dir;
			for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create });
			return d.getFileHandle(parts[parts.length - 1], { create });
		}
		const body = h('div', { class: 'export' },
			issues.length ? h('div', { class: 'banner bad' }, `${issues.length} error${issues.length > 1 ? 's' : ''} found. You can still export, but fix these first for a clean result. `, h('button', { class: 'link', onclick: () => { $('modal-root').innerHTML = ''; toggleIssues(true); } }, 'Show them')) : h('div', { class: 'banner ok' }, 'Looks good. Pick how you want to give this to Claude:'),
			h('div', { class: 'opt-grid' },
				h('div', { class: 'opt' }, h('h3', {}, '1. Copy for a chat'), h('p', {}, 'One message with the briefing, the code and the localisation. Paste it into Claude.'),
					h('button', { class: 'btn primary', onclick: async () => { FB.toast(await FB.copyText(FB.gen.bundle()) ? 'Copied! Paste it into Claude.' : 'Copy failed. Use the ZIP instead.', 'ok'); } }, 'Copy everything')),
				h('div', { class: 'opt' }, h('h3', {}, '2. Save into your mod'), h('p', {}, canFs ? 'Pick your mod folder. The files go into the right places and Claude Code can read the briefing.' : 'Needs Chrome or Edge. Use the ZIP instead.'),
					h('button', { class: 'btn primary', disabled: !canFs, onclick: saveFolder }, 'Choose mod folder…')),
				h('div', { class: 'opt' }, h('h3', {}, '3. Download'), h('p', {}, 'A ZIP with the same folder structure, ready to unpack into your mod.'),
					h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => FB.download(`${FB.state.project.meta.treeId}_focus_export.zip`, FB.makeZip(files.map((f) => ({ name: f.path, data: f.content }))), 'application/zip') }, 'Download ZIP'),
						h('button', { class: 'btn', onclick: () => FB.download('FOCUS_FOR_CLAUDE.md', FB.gen.bundle(), 'text/markdown') }, '.md')))),
			h('div', { class: 'sub-title' }, 'Then tell Claude'),
			h('div', { class: 'prompt-box' }, h('div', { class: 'mono' }, prompt), h('button', { class: 'btn small', onclick: async () => FB.toast(await FB.copyText(prompt) ? 'Copied' : 'Copy failed', 'ok') }, 'Copy')),
			h('div', { class: 'sub-title' }, 'Preview of the files'), tabs, pathLbl, pre);
		drawTabs();
		modal('Export for Claude', body, { wide: true });
	}

	/* ---------- file open / save / new ---------- */
	function openFile() {
		const inp = h('input', { type: 'file', accept: '.json,application/json' });
		inp.onchange = async () => {
			const f = inp.files[0]; if (!f) return;
			try { const data = JSON.parse(await f.text()); if (FB.ws.active) FB.ws.close(); FB.setProject(data); setTimeout(() => FB.canvas.fit(), 30); FB.toast('Project opened.', 'ok'); }
			catch (e) { FB.toast('That file is not a Focus Builder project.', 'warn'); }
		};
		inp.click();
	}
	const saveFile = () => FB.download(`${FB.state.project.meta.treeId || 'focus_tree'}.focusbuilder.json`, FB.gen.projectJson(), 'application/json');
	const newProject = () => {
		if (FB.state.project.focuses.length && !confirm('Start a new empty project? Your current one stays saved only if you used Save.')) return;
		if (FB.ws.active) FB.ws.close();
		FB.setProject(FB.newProject()); setLeftTab('project');
	};

	/* ---------- wiring ---------- */
	function refreshAll(opts) {
		opts = opts || {};
		FB.refreshDatalists();
		FB.canvas.render();
		renderList();
		updateTopbar();
		if (opts.full || opts.reload) renderInspector();
		if (opts.reload) { renderProject(); renderThings(); }
		else if (opts.full) renderThings();
		if (!$('issues-pop').hidden) toggleIssues(true);
		if (FB.ui.refreshMod) FB.ui.refreshMod();
	}

	/* ---------- icons on the static buttons ---------- */
	function decorateStatic() {
		const put = (el, name, size) => { if (el && !el.querySelector('.ic')) el.prepend(FB.icon(name, size || 16)); };
		const byId = { 'btn-new': 'plus', 'btn-import': 'download', 'btn-open': 'folder', 'btn-save': 'save', 'btn-undo': 'undo', 'btn-redo': 'redo', 'btn-export': 'upload',
			'tool-add': 'plus', 'tool-tidy': 'layers', 'zoom-fit': 'maximize' };
		Object.entries(byId).forEach(([id, ic]) => put($(id), ic));
		const tabIcons = { focuses: 'list', project: 'sliders', things: 'bulb', changes: 'scale' };
		document.querySelectorAll('#left-tabs button').forEach((b) => put(b, tabIcons[b.dataset.tab] || 'info', 17));
		const viewIcons = { tree: 'tree', list: 'list', details: 'sliders' };
		document.querySelectorAll('#mobile-nav button').forEach((b) => put(b, viewIcons[b.dataset.view] || 'info', 18));
		$('btn-help').textContent = ''; $('btn-help').append(FB.icon('help', 17));
	}

	/* ---------- resizable, collapsible side panels ---------- */
	function initLayout() {
		const app = $('app');
		const LS = 'focusbuilder.layout.v1';
		let st = {};
		try { st = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { st = {}; }
		const save = () => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) { /* storage unavailable */ } };
		const apply = () => {
			if (st.left) app.style.setProperty('--left-w', st.left + 'px');
			if (st.right) app.style.setProperty('--right-w', st.right + 'px');
			app.classList.toggle('left-off', !!st.leftOff);
			app.classList.toggle('right-off', !!st.rightOff);
			placeBars();
			if (FB.canvas && FB.canvas.render) setTimeout(() => FB.canvas.render(), 0);
		};
		const rl = h('div', { class: 'resizer rl', title: 'Drag to resize' }), rr = h('div', { class: 'resizer rr', title: 'Drag to resize' });
		app.append(rl, rr);
		const placeBars = () => {
			const lw = st.leftOff ? 0 : $('left').getBoundingClientRect().width;
			const rw = st.rightOff ? 0 : $('right').getBoundingClientRect().width;
			rl.style.left = lw + 'px'; rr.style.left = (app.getBoundingClientRect().width - rw) + 'px';
		};
		const drag = (bar, side) => bar.addEventListener('pointerdown', (e) => {
			e.preventDefault(); bar.classList.add('drag'); bar.setPointerCapture(e.pointerId);
			const move = (ev) => {
				const r = app.getBoundingClientRect();
				if (side === 'left') st.left = FB.clamp(ev.clientX - r.left, 240, r.width * 0.5);
				else st.right = FB.clamp(r.right - ev.clientX, 320, r.width * 0.7);
				apply();
			};
			const up = () => { bar.classList.remove('drag'); bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); save(); };
			bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up);
		});
		drag(rl, 'left'); drag(rr, 'right');
		const tools = $('canvas-tools');
		const mk = (name, title, key) => h('button', { class: 'ibtn', title, onclick: () => { st[key] = !st[key]; save(); apply(); } }, FB.icon(name, 17));
		tools.prepend(mk('panel-left', 'Show / hide the left panel', 'leftOff'), mk('panel-right', 'Show / hide the right panel', 'rightOff'), h('span', { class: 'sep' }));
		window.addEventListener('resize', placeBars);
		new ResizeObserver(placeBars).observe(app);
		apply();
	}

	function init() {
		const saved = FB.loadSaved();
		FB.canvas.init();
		FB.state.project = saved || FB.newProject();
		FB.setProject(FB.state.project, { baseline: saved ? FB.loadBaseline() : null });
		if (FB.ui.initMod) FB.ui.initMod();
		if (FB.designer) FB.designer.init();
		if (FB.templates) FB.templates.init();
		if (FB.guides) FB.guides.init();
		FB.on('devmode', () => { if (FB.ui.refreshMod) FB.ui.refreshMod(true); });
		FB.on('ws', () => { if (FB.ui.refreshMod) FB.ui.refreshMod(true); renderList(); });
		window.addEventListener('beforeunload', (e) => { if (FB.ws.active && FB.ws.dirtyCount() > 0) { e.preventDefault(); e.returnValue = ''; } });
		FB.on('change', (opts) => { if (opts && opts.silent) return; refreshAll(opts); });
		FB.on('select', (u) => { FB.canvas.render(); renderList(); if (u && !FB.dev.on && FB.modes.current === 'trees') setFull(true); else if (!u) setFull(false); renderInspector(); });
		document.querySelectorAll('#left-tabs button').forEach((b) => { b.onclick = () => setLeftTab(b.dataset.tab); });
		document.querySelectorAll('#mobile-nav button').forEach((b) => { b.onclick = () => setView(b.dataset.view); });
		$('btn-import').onclick = () => FB.openImport(); $('btn-new').onclick = newProject; $('btn-open').onclick = openFile; $('btn-save').onclick = saveFile;
		$('btn-undo').onclick = () => FB.undo(); $('btn-redo').onclick = () => FB.redo();
		$('btn-issues').onclick = (e) => { e.stopPropagation(); toggleIssues(); };
		document.addEventListener('pointerdown', (e) => { const p = $('issues-pop'); if (!p.hidden && !p.contains(e.target) && e.target !== $('btn-issues')) p.hidden = true; });
		$('btn-help').onclick = () => modal('How Focus Builder works', helpBody(false));
		$('btn-export').onclick = openExport;
		$('tool-add').onclick = () => { const s = FB.getSelected(); FB.addFocus(s ? { from: s.uid } : { x: 0, y: 0 }); FB.commit('add', { full: true }); FB.canvas.centerOn(FB.state.selected); };
		$('tool-tidy').onclick = () => { FB.autoLayout(); FB.commit('layout', { full: true }); FB.canvas.fit(); FB.toast('Tidied up. Undo if you preferred it before.'); };
		document.addEventListener('keydown', (e) => {
			const tag = (e.target.tagName || '').toLowerCase();
			if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
			if (!FB.dev.on) { if ((e.ctrlKey || e.metaKey) && /^[zys]$/i.test(e.key)) e.preventDefault(); return; } // normal mode edits nothing
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? FB.redo() : FB.undo(); }
			else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); FB.redo(); }
			else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (FB.ws.active) FB.ui.openSaveVersion(); else saveFile(); }
		});
		/* legend */
		$('legend').append(
			h('span', { class: 'lg' }, h('i', { class: 'lg-line' }), 'requires'), h('span', { class: 'lg' }, h('i', { class: 'lg-line or' }), 'either one'),
			h('span', { class: 'lg' }, h('i', { class: 'lg-x' }, '✕'), 'cannot take both'));
		decorateStatic(); initLayout();
		setLeftTab('focuses'); setView('tree');
		FB.dev.init();
		if (FB.update) FB.update.init();
		renderProject(); renderThings();
		refreshAll({ full: true });
		setTimeout(() => FB.canvas.fit(), 30);
		if (!saved || !saved.focuses.length) modal('Welcome to Elmo tool', helpBody(true));
	}
	FB.ui = Object.assign(FB.ui || {}, { modal, setLeftTab, setView, renderInspector, setFull });
	window.addEventListener('DOMContentLoaded', init);
})(window.FB = window.FB || {});
