/* Focus Builder - mod workspace UI: tree switcher, changes tab, save-version dialog */
(function (FB) {
	'use strict';
	const h = FB.h;
	const $ = (id) => document.getElementById(id);
	FB.ui = FB.ui || {};
	let status = '';
	const SIGN_CLASS = { '+': 'add', '-': 'del', '~': 'chg' };
	const SIGN_GLYPH = { '+': '+', '-': '−', '~': '~' };

	function setStatus(m) { status = m; const el = $('ws-status'); if (el) el.textContent = m; }

	/* recently opened folders (helper mode) */
	const RECENT_KEY = 'focusbuilder.recentMods';
	const recents = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; } };
	const remember = (name, path) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([{ name, path }].concat(recents().filter((r) => r.path !== path)).slice(0, 5))); } catch (e) { /* storage unavailable */ } };

	/* ---------- running without the helper (Python missing): say so and explain how to fix it ---------- */
	const PY_URL = 'https://www.python.org/downloads/windows/';
	function pythonHelp() {
		const step = (n, ...k) => h('li', {}, ...k);
		const close = FB.ui.modal('Install Python to unlock everything', h('div', { class: 'explain' },
			h('p', {}, 'Elmo tool is running ', h('b', {}, 'without its helper'), ', because Python is not installed (or not found) on this PC. That limits it:'),
			h('ul', {},
				h('li', {}, 'Steam workshop mods (like BFFU 2) cannot be opened: the browser blocks those folders.'),
				h('li', {}, 'No game pictures in the Designer, Templates and focus trees.'),
				h('li', {}, 'No automatic updates.')),
			h('p', {}, h('b', {}, 'Fix it in 2 minutes (free):')),
			h('ol', {},
				step(1, 'Click ', h('b', {}, 'Download Python'), ' below and run the installer.'),
				step(2, h('b', {}, 'Important: '), 'tick ', h('b', {}, '"Add python.exe to PATH"'), ' at the bottom of the first screen, then click ', h('b', {}, 'Install Now'), '.'),
				step(3, 'Close Elmo tool and start it again with ', h('code', {}, 'Elmo tool.bat'), ' (not by opening index.html).')),
			h('p', { class: 'muted small' }, 'Already installed? Then it was installed without "Add python.exe to PATH". Run the installer again, choose Modify → Next, tick "Add Python to environment variables", and finish.'),
			h('div', { class: 'btn-row' },
				h('button', { class: 'btn primary', onclick: () => window.open(PY_URL, '_blank', 'noopener') }, FB.icon('download', 14), 'Download Python'),
				h('button', { class: 'btn', onclick: () => close() }, 'Continue in limited mode'))));
	}
	function noHelper() {
		const help = $('btn-help');
		if (help && !$('btn-nohelper')) help.parentNode.insertBefore(h('button', { id: 'btn-nohelper', class: 'tb nohelper-pill', title: 'Python is missing: some features are off. Click for the fix.', onclick: pythonHelp }, FB.icon('alert', 14), 'Limited mode: install Python'), help);
		let shown = false;
		try { shown = sessionStorage.getItem('focusbuilder.pyhelp') === '1'; sessionStorage.setItem('focusbuilder.pyhelp', '1'); } catch (e) { shown = false; }
		// show it once per session, after the welcome window (if any) has been closed
		if (!shown) { let tries = 0; const t = setInterval(() => { if (!$('modal-root').children.length || ++tries > 600) { clearInterval(t); pythonHelp(); } }, 700); }
	}
	FB.ui.pythonHelp = pythonHelp;

	/* ---------- clear explanations when a folder cannot be opened ---------- */
	const WORKSHOP_HINT = 'Steam workshop mods are in Steam\\steamapps\\workshop\\content\\394360\\<number of the mod>.';
	function copyBtn(text) {
		return h('button', { class: 'btn small', onclick: () => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => FB.toast('Details copied. Paste them to whoever helps you.', 'ok'), () => FB.toast(text)) }, FB.icon('copy', 13), 'Copy details');
	}
	function modButton(c, close) {
		return h('button', { class: 'mod-row', onclick: () => { close(); loadPath(c.path, c.name); } },
			h('span', { class: 'mr-name' }, c.name), c.trees ? h('span', { class: 'badge' }, c.trees + ' focus files') : h('span', { class: 'badge' }, 'no focus trees'), h('span', { class: 'mr-path' }, c.path));
	}
	/** Asks the helper what is in the folder and says in plain words what is wrong and what to do. */
	async function explainFailure(path, err) {
		const msg = String((err && err.message) || err || '');
		let d = null;
		try { d = await FB.server.post('diagnose', { path }); } catch (e) { d = null; }
		let title = 'This folder cannot be opened';
		const body = [];
		const p = (...k) => body.push(h('p', {}, ...k));
		let close = () => {};
		const list = (items) => body.push(h('div', { class: 'mod-list' }, items.map((c) => modButton(c, () => close()))));
		if (!d) {
			p(msg || 'The helper did not answer.');
			p('The helper (the small program that reads mod folders) may have stopped. Close Elmo tool and start it again with "Elmo tool.bat".');
		} else if (!d.exists) {
			title = 'Folder not found';
			p('There is no folder at ', h('code', {}, path || '(empty)'), '.');
			p(d.parentExists ? 'The folder above it exists, so the last part of the path is probably misspelled.' : 'Check the path: copy it from the address bar of Windows Explorer.');
			p(h('span', { class: 'muted' }, WORKSHOP_HINT));
		} else if (d.kind === 'file' && /\.(zip|rar|7z)$/.test(d.ext || '')) {
			title = 'This is a zip file, not a folder';
			p('Unzip it first: right-click the file → ', h('b', {}, 'Extract All…'), ', then open the folder that comes out (the one with ', h('code', {}, 'descriptor.mod'), ' in it).');
		} else if (d.kind === 'file' && d.ext === '.mod') {
			title = 'This is a launcher file (.mod)';
			if (d.modTargetExists) { p('It points to the mod folder below. Open that one:'); list([{ name: path.split(/[\\/]/).pop().replace(/\.mod$/i, ''), path: d.modTarget, trees: 0 }]); }
			else p('It points to ', h('code', {}, d.modTarget || '(nothing)'), ', which does not exist. The mod may not be downloaded (Steam: subscribe and let it finish) or was moved.');
		} else if (d.kind === 'file') {
			title = 'This is a file, not a folder';
			p('Choose the mod folder itself: the folder that holds ', h('code', {}, 'descriptor.mod'), ' and ', h('code', {}, 'common'), '.');
		} else if (d.denied) {
			title = 'Windows does not allow reading this folder';
			p('Your Windows account has no permission to open ', h('code', {}, path), '.');
			p('Copy the mod folder to Documents and open the copy, or start Elmo tool once as administrator.');
		} else if (d.insideMod) {
			title = 'You picked a folder inside the mod';
			p('Open the mod itself instead, not one of its sub folders:');
			list([d.insideMod]);
		} else if (d.candidates && d.candidates.length) {
			title = d.candidates.length === 1 ? 'The mod is one folder deeper' : 'This folder holds ' + d.candidates.length + ' mods';
			p(d.candidates.length === 1 ? 'Open this one:' : 'Pick the mod you want:');
			list(d.candidates);
		} else if (d.hasDescriptor && !d.focusFiles && !d.hasMio) {
			title = 'This mod has no focus trees';
			p('The mod is there, but it has no ', h('code', {}, 'common\\national_focus'), ' (and no MIOs), so Elmo tool has nothing to edit in it.');
			p('Is it a submod or a small patch? Then open the main mod it builds on.');
		} else if (d.zips && d.zips.length) {
			title = 'The mod is still zipped';
			p('This folder only has ', h('code', {}, d.zips.join(', ')), '. Unzip it (right-click → Extract All…) and open the extracted folder.');
		} else {
			title = 'No mod found in this folder';
			p('A mod folder has a ', h('code', {}, 'descriptor.mod'), ' file and a ', h('code', {}, 'common'), ' folder with ', h('code', {}, 'national_focus'), ' in it. This folder has neither.');
			p(h('span', { class: 'muted' }, WORKSHOP_HINT));
		}
		const details = 'Elmo tool could not open a mod folder\nPath: ' + path + '\nError: ' + msg + '\nFound: ' + JSON.stringify(d || {}, null, 1);
		body.push(h('div', { class: 'btn-row' }, copyBtn(details), h('button', { class: 'btn', onclick: () => { close(); openChooser(); } }, 'Choose another folder')));
		close = FB.ui.modal(title, h('div', { class: 'explain' }, body));
	}

	/** Opens a mod folder by path through the helper. */
	async function loadPath(path, label) {
		try {
			setStatus('Reading the mod…');
			const n = await FB.ws.openPath(path, setStatus, label);
			setStatus('');
			if (n != null) {
				remember(label || FB.ws.name, path);
				const tags = new Set(FB.ws.trees.map((t) => t.tag || '-'));
				FB.toast(`Loaded ${n} focus tree${n === 1 ? '' : 's'} from ${tags.size} countr${tags.size === 1 ? 'y' : 'ies'}.`, 'ok');
				if (/workshop[\\/]content/i.test(path)) FB.toast('Steam workshop folder: Steam may overwrite your changes when the mod updates.', 'warn');
				FB.ui.setLeftTab('focuses');
			}
		} catch (e) { setStatus(''); explainFailure(path, e); }
		renderWsBar();
	}

	/** Mod chooser (helper mode): detected mods, a folder dialog, or a pasted path. */
	function openChooser() {
		const list = h('div', { class: 'mod-list' }, h('div', { class: 'muted' }, 'Looking for your HOI4 mods…'));
		const search = h('input', { type: 'search', placeholder: 'Search mods…', oninput: () => draw() });
		const pathIn = h('input', { type: 'text', placeholder: 'Or paste a folder path here…', spellcheck: 'false' });
		let mods = [];
		let close = () => {};
		const go = (path, label) => { close(); loadPath(path, label); };
		function draw() {
			const q = search.value.toLowerCase();
			list.innerHTML = '';
			const rec = recents().filter((r) => !q || r.name.toLowerCase().includes(q));
			const groups = [['Recent', rec.map((r) => ({ name: r.name, path: r.path, trees: null, source: 'recent' }))],
				['Your mods', mods.filter((m) => m.source === 'local')], ['Steam workshop', mods.filter((m) => m.source === 'workshop')], ['Base game', mods.filter((m) => m.source === 'game')]];
			let any = false;
			groups.forEach(([title, items]) => {
				items = items.filter((m) => !q || m.name.toLowerCase().includes(q) || m.path.toLowerCase().includes(q));
				if (!items.length) return;
				any = true;
				list.appendChild(h('div', { class: 'combo-cat' }, title));
				items.forEach((m) => list.appendChild(h('button', { class: 'mod-row', onclick: () => go(m.path, m.name) },
					h('span', { class: 'mr-name' }, m.name), m.trees ? h('span', { class: 'badge' }, m.trees + ' files') : null, h('span', { class: 'mr-path' }, m.path))));
			});
			if (!any) list.appendChild(h('div', { class: 'muted' }, mods.length || rec.length ? 'No mod matches your search.' : 'No HOI4 mods with focus trees were found automatically. Use the buttons below.'));
		}
		const browse = h('button', { class: 'btn', onclick: async () => {
			browse.disabled = true; browse.textContent = 'Waiting for the folder dialog…';
			try { const r = await FB.server.json('browse', { method: 'POST' }); if (r.path) go(r.path); } catch (e) { FB.toast(e.message, 'warn'); }
			browse.disabled = false; browse.textContent = 'Browse for a folder…';
		} }, 'Browse for a folder…');
		close = FB.ui.modal('Open a mod', h('div', { class: 'chooser' },
			h('p', { class: 'muted' }, 'Pick the mod you want to edit. Mods in the Steam workshop folder work too.'),
			search, list,
			h('div', { class: 'sub-title' }, 'Somewhere else'),
			h('div', { class: 'btn-row' }, browse),
			h('div', { class: 'ws-pick' }, pathIn, h('button', { class: 'btn', onclick: () => { if (pathIn.value.trim()) go(pathIn.value.trim().replace(/^"|"$/g, '')); } }, 'Open')),
			h('p', { class: 'muted small' }, 'Not in the list? Use Browse or paste the path of the folder that has descriptor.mod in it. If it still fails, Elmo tool tells you why.')), { wide: true });
		draw();
		FB.server.json('mods').then((r) => { mods = r.mods; draw(); }).catch((e) => { list.innerHTML = ''; list.appendChild(h('div', { class: 'muted' }, /fetch/i.test(e.message) ? 'The helper is no longer running. Close this window and start Focus Builder again from its shortcut.' : 'Could not look for mods: ' + e.message)); });
	}

	async function openMod(reopen) {
		if (FB.server.active && !reopen) { openChooser(); return; }
		try {
			setStatus('Reading the mod…');
			const n = reopen ? await FB.ws.reopen(setStatus) : await FB.ws.open(setStatus);
			setStatus('');
			if (n != null) {
				const tags = new Set(FB.ws.trees.map((t) => t.tag || '-'));
				FB.toast(`Loaded ${n} focus tree${n === 1 ? '' : 's'} from ${tags.size} countr${tags.size === 1 ? 'y' : 'ies'}.`, 'ok');
				FB.ui.setLeftTab('focuses');
			}
		} catch (e) {
			setStatus('');
			if (e && e.name !== 'AbortError') {
				const msg = String((e && e.message) || e);
				const helperTip = h('p', {}, h('b', {}, 'Easiest fix: '), 'install Python from python.org (tick "Add python.exe to PATH") and start Elmo tool with ', h('code', {}, 'Elmo tool.bat'), '. Its helper can open every folder, also the Steam workshop, and finds your mods by itself.');
				if (/system files|SecurityError/i.test(msg + (e.name || ''))) FB.ui.modal('This folder is blocked by the browser', h('div', { class: 'explain' }, h('p', {}, 'Elmo tool is running without its helper, and Chrome / Edge do not allow folders under Program Files (such as the Steam workshop folder) to be opened.'), helperTip, h('p', {}, h('b', {}, 'Or: '), 'copy the mod folder to Documents and open the copy.')));
				else if (/national_focus|descriptor\.mod|military_industrial/i.test(msg)) FB.ui.modal('No mod found in this folder', h('div', { class: 'explain' }, h('p', {}, 'Choose the mod folder itself: the one with ', h('code', {}, 'descriptor.mod'), ' and a ', h('code', {}, 'common'), ' folder in it. Not a folder above it (like the workshop folder full of numbers) and not one inside it (like common).'), helperTip));
				else FB.toast(msg, 'warn');
			}
		}
		renderWsBar();
	}
	FB.ui.openMod = openMod;

	/* ---------- the bar above the left tabs ---------- */
	function renderWsBar() {
		const bar = $('ws-bar'), ws = FB.ws;
		if (!bar) return;
		bar.innerHTML = '';
		const put = (...kids) => bar.append(...kids.filter(Boolean)); // append(null) would print the word "null"
		if (!ws.active) {
			put(
				h('div', { class: 'ws-empty' }, h('b', {}, 'Working on a mod?'), h('span', {}, 'Open its folder to edit every country\'s focus tree.')),
				h('div', { class: 'btn-row tight' },
					h('button', { class: 'btn primary small', disabled: !ws.supported() && !FB.server.active, onclick: () => openMod(false) }, FB.icon('folder', 15), FB.server.active ? 'Open a mod…' : 'Open mod folder…'),
					FB.server.active ? recents().slice(0, 2).map((r) => h('button', { class: 'btn small', title: r.path, onclick: () => loadPath(r.path, r.name) }, r.name)) : null,
					!FB.server.active && ws.lastHandle ? h('button', { class: 'btn small', onclick: () => openMod(true), title: 'Ask for access to the last folder again' }, 'Reopen ' + ws.lastHandle.name) : null),
				ws.supported() || FB.server.active ? null : h('div', { class: 'muted small' }, 'Folder access needs Chrome or Edge.'),
				h('div', { id: 'ws-status', class: 'muted small' }, status));
			return;
		}
		const cur = ws.treeOf(ws.current);
		const idx = ws.trees.findIndex((t) => t.key === ws.current);
		const dirty = ws.dirtyCount();
		const combo = FB.combo({
			placeholder: 'Search focus trees…', value: cur ? cur.id : '', clear: false, browse: true, limit: 800,
			items: () => ws.trees.map((t) => ({ label: (ws.isDirty(t.key) ? '● ' : '') + t.id, key: t.id + ' ' + (t.tag || ''), sub: `${t.count} ${t.kind === 'mio' ? 'traits' : 'focuses'}`, cat: t.kind === 'mio' ? 'MIO · ' + (t.tag || 'generic') : (t.tag || 'No country tag'), desc: t.file.replace('common/national_focus/', ''), kw: t.file, treeKey: t.key, pic: t.kind === 'mio' ? mioIcon(t) : undefined })),
			onPick: (it) => { ws.switchTo(it.treeKey); }
		});
		const step = (d) => { const n = ws.trees[idx + d]; if (n) ws.switchTo(n.key); };
		const countries = new Set(ws.trees.map((t) => t.tag || '-')).size;
		put(
			h('div', { class: 'ws-head' },
				h('div', { class: 'ws-name', title: 'Mod folder' }, h('span', { class: 'ws-dot' }), ws.name),
				h('button', { class: 'link small', onclick: () => openMod(false) }, 'change')),
			h('div', { class: 'ws-pick' },
				h('button', { class: 'ibtn', title: 'Previous tree', disabled: idx <= 0, onclick: () => step(-1) }, '‹'),
				combo,
				h('button', { class: 'ibtn', title: 'Next tree', disabled: idx >= ws.trees.length - 1, onclick: () => step(1) }, '›')),
			h('div', { class: 'ws-foot' },
				h('span', { class: 'muted small' }, `${ws.trees.length} trees · ${countries} countr${countries === 1 ? 'y' : 'ies'}${ws.sharedBlocks ? ' · ' + ws.sharedBlocks + ' shared focuses not shown' : ''}`),
				h('button', { class: 'btn small' + (dirty ? ' primary' : ''), disabled: !dirty, onclick: openSaveVersion, title: 'Write your edits into the mod files (Ctrl+S)' }, dirty ? `Save to mod (${dirty})` : 'Saved')),
			h('div', { id: 'ws-status', class: 'muted small' }, status));
	}

	/* ---------- changes tab ---------- */
	function lineEl(l, onClick) {
		return h('div', { class: 'chg ' + SIGN_CLASS[l.sign] + (onClick ? ' click' : ''), onclick: onClick }, h('span', { class: 'chg-s' }, SIGN_GLYPH[l.sign] || '•'), h('span', {}, l.text));
	}
	/** The company logo of an organization tree (its own icon, or the one of the template it includes). */
	function mioIcon(t) {
		const own = (t.entries || []).find((e) => e.k === 'icon' && typeof e.v === 'string');
		if (own) return own.v;
		const o = FB.mios && FB.mios.byId(t.id);
		return (o && FB.mios.iconOf(o)) || undefined;
	}
	function renderChanges() {
		const pane = $('pane-changes');
		if (!pane) return;
		pane.innerHTML = '';
		const ws = FB.ws;
		const groups = FB.pendingGroups();
		const total = groups.reduce((a, g) => a + g.lines.length, 0);
		pane.appendChild(h('div', { class: 'pane-intro' }, ws.active ? 'Everything you changed since the mod was opened or last saved. Saving writes it to the mod and logs this version.' : 'Everything you changed since this project was opened or its last logged version.'));
		if (!groups.length) pane.appendChild(h('div', { class: 'empty-hint' }, 'No changes yet. Edit a focus and it shows up here.'));
		groups.forEach((g) => {
			const cur = !ws.active || g.spirits || g.key === ws.current;
			pane.appendChild(h('div', { class: 'chg-group' },
				h('div', { class: 'chg-title' }, h('b', {}, g.tree), g.tag ? h('em', {}, g.tag) : null, cur ? null : h('button', { class: 'link small', onclick: () => ws.switchTo(g.key) }, 'open')),
				g.lines.map((l) => lineEl(l, l.spirit ? () => FB.spirits.openEditor(l.spirit) : l.focus && cur ? () => { const f = FB.state.project.focuses.find((x) => x.name === l.focus); if (f) { FB.select(f.uid); FB.canvas.centerOn(f.uid); } } : null))));
		});
		pane.appendChild(h('div', { class: 'btn-row' },
			h('button', { class: 'btn primary small', disabled: !total, onclick: openSaveVersion }, ws.active ? 'Save to mod…' : 'Log this version…'),
			h('button', { class: 'btn small', disabled: !total, onclick: async () => FB.toast(await FB.copyText(FB.gen.groupsMd(groups)) ? 'Copied as Markdown' : 'Copy failed', 'ok') }, 'Copy')));
		const versions = (ws.active ? ws.versions : FB.state.project.versions).slice().reverse();
		pane.appendChild(h('div', { class: 'sub-title' }, ws.active ? 'Saved this session' : 'Logged versions'));
		if (!versions.length) pane.appendChild(h('div', { class: 'empty-hint' }, ws.active ? 'Nothing saved yet. The full history lives in FocusBuilder_changelog.md in your mod folder.' : 'No versions logged yet.'));
		versions.forEach((v) => {
			const n = v.groups.reduce((a, g) => a + g.lines.length, 0);
			pane.appendChild(h('details', { class: 'ver' }, h('summary', {}, h('b', {}, v.label), h('span', { class: 'muted' }, ` ${String(v.date).slice(0, 10)} · ${n} change${n === 1 ? '' : 's'}`)),
				v.notes ? h('p', { class: 'muted' }, v.notes) : null,
				v.groups.map((g) => h('div', {}, h('div', { class: 'chg-title' }, h('b', {}, g.tree)), g.lines.map((l) => lineEl(l))))));
		});
		if (!ws.active && FB.state.project.versions.length) pane.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: () => FB.download('CHANGELOG.md', FB.gen.changelogMd(FB.state.project.versions), 'text/markdown') }, 'Download CHANGELOG.md')));
	}
	FB.ui.renderChanges = renderChanges;

	const updateBadge = FB.debounce(() => {
		const tab = $('tab-changes');
		if (!tab) return;
		const n = FB.pendingGroups().reduce((a, g) => a + g.lines.length, 0);
		tab.innerHTML = '';
		tab.append('Changes');
		if (n) tab.append(h('span', { class: 'badge' }, n));
		if (!$('pane-changes').hidden) renderChanges();
	}, 250);

	/* ---------- save / log a version ---------- */
	function openSaveVersion() {
		const ws = FB.ws;
		const groups = FB.pendingGroups();
		if (!groups.length) { FB.toast('There are no changes to save.'); return; }
		const nextLabel = ws.active ? '' : FB.nextVersionLabel(FB.state.project.versions.map((v) => '## ' + v.label).join('\n'));
		const label = h('input', { type: 'text', placeholder: ws.active ? 'auto: v1, v2, v3…' : nextLabel });
		const notes = h('textarea', { rows: 3, placeholder: 'What is this version about? (optional)' });
		const total = groups.reduce((a, g) => a + g.lines.length, 0);
		const go = h('button', { class: 'btn primary' }, ws.active ? 'Save to mod folder' : 'Log version');
		let close = () => {};
		go.onclick = async () => {
			go.disabled = true;
			try {
				if (ws.active) {
					const r = await ws.save(label.value, notes.value);
					close();
					FB.ui.modal('Saved to your mod', h('div', {},
						h('p', {}, `Version ${r.version.label} is saved. Files written:`),
						h('ul', {}, r.files.map((f) => h('li', {}, h('code', {}, f)))),
						h('p', { class: 'muted' }, 'The originals were copied to ', h('code', {}, r.backupDir), ' first, so you can always go back.')));
				} else {
					const v = FB.recordVersion(label.value.trim() || nextLabel, notes.value);
					close();
					FB.download('CHANGELOG.md', FB.gen.changelogMd(FB.state.project.versions), 'text/markdown');
					FB.toast(`Logged ${v.label} and downloaded CHANGELOG.md`, 'ok');
				}
			} catch (e) { go.disabled = false; FB.toast('Could not save: ' + (e.message || e), 'warn'); }
		};
		close = FB.ui.modal(ws.active ? 'Save changes to the mod' : 'Log a version', h('div', { class: 'savev' },
			h('p', { class: 'muted' }, `${total} change${total === 1 ? '' : 's'} in ${groups.length} tree${groups.length === 1 ? '' : 's'}: ${groups.map((g) => g.tree).join(', ')}.`),
			h('div', { class: 'chg-preview' }, groups.map((g) => h('div', {}, h('div', { class: 'chg-title' }, h('b', {}, g.tree)), g.lines.slice(0, 12).map((l) => lineEl(l)), g.lines.length > 12 ? h('div', { class: 'muted small' }, `…and ${g.lines.length - 12} more`) : null))),
			h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Version name'), label),
			h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Notes'), notes),
			ws.active ? h('p', { class: 'muted small' }, 'Only the edited focus_tree blocks, the picture/modifiers of edited national spirits and changed names/descriptions are written. Everything else in your files stays untouched, and the originals are backed up first.') : null,
			h('div', { class: 'btn-row' }, go)));
	}
	FB.ui.openSaveVersion = openSaveVersion;

	FB.ui.refreshMod = function (barOnly) { renderWsBar(); updateBadge(); };
	FB.ui.initMod = function () {
		renderWsBar();
		if (FB.ws.supported()) FB.ws.remembered().then(() => renderWsBar());
		FB.server.init().then((ok) => { if (ok) { renderWsBar(); FB.gd.load(false); FB.gfx.loadIcons(); if (FB.update) FB.update.check(false); } else noHelper(); });
		updateBadge();
	};
})(window.FB = window.FB || {});
