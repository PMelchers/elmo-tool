/* Focus Builder - Guides: a written guide for one nation with five tabs
 * (focus order, tank designs, ship designs, division templates, explanation text).
 * Designs and templates are copied into the guide as snapshots, so a guide still reads fine without the game data. */
(function (FB) {
	'use strict';
	const h = FB.h;
	const LS_KEY = 'focusbuilder.guides.v1';
	const TABS = [['focus', 'Focus order', 'tree'], ['tank', 'Tank design', 'tank'], ['ship', 'Ship design', 'anchor'], ['templates', 'Templates', 'users'], ['text', 'Explanation', 'scroll'], ['images', 'Images', 'image']];
	const G = { list: [], cur: null, tab: 'focus', treeKey: '', status: '', view: 'mine' };
	let root, body, overlaySel = null, overlayId = '';

	/* ---------- storage ---------- */
	const load = () => { try { G.list = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { G.list = []; } G.list.forEach((g) => { if (!Array.isArray(g.images)) g.images = []; }); };
	const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(G.list)); } catch (e) { /* storage unavailable */ } };
	const newGuide = (title) => ({ id: FB.uid(), title: title || 'New guide', tag: '', summary: '', focus: [], tanks: [], ships: [], templates: [], text: [], images: [], created: new Date().toISOString(), updated: new Date().toISOString() });
	const cur = () => G.list.find((g) => g.id === G.cur) || null;
	const save = (g) => { g.updated = new Date().toISOString(); persist(); if (g.id === overlayId) applyOverlay(); };

	/* ---------- the guide's focus order as numbers on the Trees canvas ---------- */
	const orderIds = (g) => g.focus.filter((s) => s.type === 'focus' && s.id).map((s) => s.id);
	function applyOverlay() {
		const g = G.list.find((x) => x.id === overlayId);
		if (!g) overlayId = '';
		if (FB.canvas && FB.canvas.setOrder) FB.canvas.setOrder(g ? orderIds(g) : null);
	}
	function refreshOverlay() {
		if (!overlaySel) return;
		overlaySel.innerHTML = '';
		overlaySel.appendChild(FB.h('option', { value: '' }, 'No guide order'));
		G.list.forEach((g) => overlaySel.appendChild(FB.h('option', { value: g.id, selected: g.id === overlayId }, 'Order: ' + (g.tag ? g.tag + ' · ' : '') + (g.title || '(untitled)'))));
		overlaySel.value = overlayId;
	}
	function showOnTree(g) {
		overlayId = g.id; refreshOverlay();
		if (G.treeKey && G.treeKey !== '__current' && FB.ws.active && FB.ws.current !== G.treeKey) FB.ws.switchTo(G.treeKey);
		FB.modes.set('trees');
		applyOverlay();
		setTimeout(() => FB.canvas.fit(), 40);
	}
	const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; };
	const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	/** Country name from the open mod's localisation, else the game data, else the tag itself. */
	const natLabel = (tag) => {
		if (!tag) return '';
		const loc = FB.ws.active && FB.ws.loc ? FB.ws.loc[tag] || FB.ws.loc[tag + '_DEF'] : '';
		if (loc && !/\$/.test(loc)) return loc;
		const gd = FB.gd && FB.gd.lists && FB.gd.lists.tag; const e = gd && gd.find((x) => x.id === tag);
		return e && e.name && e.name !== tag ? e.name : tag;
	};

	/* ---------- nations ---------- */
	/** Nations to choose from: the countries with a focus tree in the open mod, else every country the game knows. */
	function nationItems() {
		const m = new Map();
		if (FB.ws.active) FB.ws.trees.forEach((t) => {
			if (t.kind === 'mio' || !t.tag || !t.count) return;
			const k = t.tag.toUpperCase(), e = m.get(k) || { tag: k, focuses: 0 };
			e.focuses += t.count; m.set(k, e);
		});
		if (!m.size && FB.gd && FB.gd.lists && FB.gd.lists.tag) FB.gd.lists.tag.forEach((x) => { const k = String(x.id).toUpperCase(); if (/^[A-Z0-9]{3}$/.test(k)) m.set(k, { tag: k, focuses: 0 }); });
		return [...m.values()].map((e) => ({ tag: e.tag, name: natLabel(e.tag), focuses: e.focuses })).sort((a, b) => a.name.localeCompare(b.name));
	}
	/** A searchable list of nations in a dialog. onPick(tag) gets '' for "no nation". */
	function pickNation(current, onPick, creating) {
		const items = nationItems();
		let q = '';
		const list = h('div', { class: 'gd-natlist' });
		const done = (tag) => { close(); onPick(tag); };
		const draw = () => {
			list.innerHTML = '';
			const f = items.filter((n) => !q || n.name.toLowerCase().includes(q) || n.tag.toLowerCase().includes(q));
			f.slice(0, 400).forEach((n) => list.appendChild(h('button', { class: 'gd-nat' + (n.tag === current ? ' on' : ''), onclick: () => done(n.tag) },
				h('b', {}, n.name), h('span', { class: 'gd-nattag' }, n.tag), n.focuses ? h('small', {}, n.focuses + ' focuses') : null)));
			if (!f.length) list.appendChild(h('div', { class: 'tp-empty' }, items.length ? 'No nation matches.' : 'No nations found. Open your mod in the Trees tab first, or type a tag below.'));
		};
		const search = h('input', { type: 'search', placeholder: 'Search a nation or tag…', oninput: (e) => { q = e.target.value.toLowerCase().trim(); draw(); },
			onkeydown: (e) => { if (e.key === 'Enter') { const first = list.querySelector('.gd-nat'); if (first) first.click(); else if (/^[a-z0-9]{3}$/i.test(q)) done(q.toUpperCase()); } } });
		draw();
		const close = FB.ui.modal(creating ? 'New guide: choose a nation' : 'Choose the nation', h('div', { class: 'gd-natpick' },
			h('p', { class: 'muted' }, FB.ws.active ? 'Countries with a focus tree in ' + FB.ws.name + '.' : 'Open your mod in the Trees tab to see only the countries it has focus trees for.'),
			search, list,
			creating ? h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: () => done('') }, 'Make a guide without a nation')) : null));
		setTimeout(() => search.focus(), 30);
	}

	/* ---------- focus sources: only the trees of the guide's nation ---------- */
	function treesFor(g) {
		const tag = (g.tag || '').toUpperCase();
		if (FB.ws.active) {
			if (!tag) return [];
			return FB.ws.trees.filter((t) => t.kind !== 'mio' && t.count > 0 && (t.tag || '').toUpperCase() === tag).sort((a, b) => b.count - a.count)
				.map((t) => ({ key: t.key, label: t.id, count: t.count }));
		}
		const P = FB.state.project;
		if (P && P.focuses.length && (!tag || !P.meta.tag || P.meta.tag.toUpperCase() === tag)) return [{ key: '__current', label: P.meta.treeId, count: P.focuses.length }];
		return [];
	}
	function projectFor(key) {
		if (key === '__current') return FB.state.project;
		const p = FB.ws.projectOf(key);
		if (p) return p;
		const t = FB.ws.treeOf(key);
		if (!t) return null;
		return FB.migrate(FB.importer.buildProject(t, FB.ws.loc).project);
	}
	/** Order by prerequisites, then by row and column (how you would play the tree). */
	function suggestOrder(p) {
		const left = p.focuses.slice().sort((a, b) => a.y - b.y || a.x - b.x), done = new Set(), out = [];
		let guard = 0;
		while (left.length && guard++ < 5000) {
			const i = left.findIndex((f) => (f.prereqs || []).every((grp) => grp.some((u) => done.has(u)) || !p.focuses.some((o) => grp.includes(o.uid))));
			const f = left.splice(i < 0 ? 0 : i, 1)[0];
			done.add(f.uid); out.push(f);
		}
		return out;
	}
	/** The focus's own picture when the game icons are loaded, else a plus. */
	function pickIcon(f, proj) {
		const el = FB.h('span', { class: 'gd-fico' }, FB.icon('plus', 13));
		if (FB.gfx && FB.gfx.ready) FB.gfx.attach(el, [f.icon || (proj && proj.meta.defaultIcon) || 'GFX_goal_unknown']);
		return el;
	}
	const stepOf = (f, tree) => { const icon = f.icon || 'GFX_goal_unknown'; if (FB.gfx) FB.gfx.keep(icon); return { type: 'focus', id: f.id, name: f.name, weeks: f.weeks, tree, note: '', icon }; };
	/** Sprite of a focus step: stored with the step, else looked up in the guide's tree. */
	function stepIcon(s) {
		if (s.icon) return s.icon;
		const p = G.treeKey ? projectFor(G.treeKey) : null;
		const f = p && p.focuses.find((x) => x.id === s.id);
		return f ? f.icon || p.meta.defaultIcon || 'GFX_goal_unknown' : null;
	}
	/** Every sprite a guide shows (to bundle with exports and shared files). */
	function iconNames(g) {
		const out = [];
		g.focus.forEach((s) => { if (s.type === 'focus') out.push(stepIcon(s)); });
		g.tanks.concat(g.ships).forEach((d) => (d.modules || []).forEach((m) => out.push(m.icon)));
		g.templates.forEach((t) => (t.rows || []).flat().concat(t.support || []).forEach((c) => c && out.push(c.icon)));
		return out.filter(Boolean);
	}

	/* ---------- rendering ---------- */
	function render() {
		if (!body) return;
		body.innerHTML = '';
		const frame = h('div', { class: 'dzf-frame' });
		body.appendChild(frame);
		const view = (k, icon, label) => h('button', { class: G.view === k ? 'on' : '', onclick: () => { if (G.view !== k) { G.view = k; render(); } } }, FB.icon(icon, 15), label);
		frame.appendChild(h('div', { class: 'dzf-title gd-title' },
			h('h2', {}, 'Nation Guides'),
			h('div', { class: 'gd-views' }, view('mine', 'scroll', 'My guides'), view('market', 'globe', 'Marketplace')),
			h('div', { class: 'dzf-status' }, h('span', {}, G.status))));
		if (G.view === 'market' && FB.market) { frame.appendChild(FB.market.view(marketHost)); refreshOverlay(); return; }
		if (!cur()) G.cur = G.list.length ? G.list[0].id : null;
		frame.appendChild(h('div', { class: 'tp-main' }, listCol(), editor()));
		refreshOverlay();
	}

	/* ---------- what the marketplace needs from the guides ---------- */
	const slugOf = (g) => (g.title || 'guide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guide';
	const marketHost = {
		myGuides: () => G.list.slice(),
		nationName: (tag) => natLabel(tag),
		async importGuide(x) {
			const g = Object.assign(newGuide(x.title), x, { id: FB.uid() });
			['focus', 'tanks', 'ships', 'templates', 'text', 'images'].forEach((k) => { if (!Array.isArray(g[k])) g[k] = []; });
			await storeImported(g);
			G.list.push(g); persist();
			return g;
		},
		async exportFile(g) {
			const full = await withImageData(g);
			delete full.market;
			return { name: (g.tag ? g.tag.toLowerCase() + '-' : '') + slugOf(g) + '.guide.json', text: JSON.stringify(full, null, 2) };
		}
	};

	/** Accepts one or more .json files: a single guide, or a list of guides (from "Export all"). */
	function importFile() {
		const i = h('input', { type: 'file', accept: '.json,application/json', multiple: true });
		i.onchange = async () => {
			const add = []; let bad = 0;
			for (const f of [...i.files]) {
				try {
					const a = JSON.parse(await f.text());
					for (const x of (Array.isArray(a) ? a : [a])) {
						if (!x || typeof x !== 'object' || !Array.isArray(x.focus)) { bad++; continue; }
						const g = Object.assign(newGuide(x.title), x, { id: FB.uid() });
						['tanks', 'ships', 'templates', 'text', 'images'].forEach((k) => { if (!Array.isArray(g[k])) g[k] = []; });
						await storeImported(g);
						add.push(g);
					}
				} catch (e) { bad++; }
			}
			if (add.length) { G.list = G.list.concat(add); G.cur = add[0].id; persist(); render(); }
			FB.toast(add.length ? `Imported ${add.length} guide${add.length === 1 ? '' : 's'}` + (bad ? ` (${bad} file${bad === 1 ? '' : 's'} skipped)` : '') : 'That is not a guide file.', add.length ? 'ok' : 'warn');
		};
		i.click();
	}
	const exportAll = async () => { if (!G.list.length) { FB.toast('There are no guides to export yet.', 'warn'); return; } const all = []; for (const g of G.list) all.push(await withImageData(g)); FB.download('elmo-guides.json', JSON.stringify(all, null, 2), 'application/json'); };

	/* ---------- images: stored in IndexedDB, because pictures are too big for localStorage ---------- */
	let imgDbP = null;
	function imgDb() {
		if (!imgDbP) imgDbP = new Promise((res, rej) => { const q = indexedDB.open('focusbuilder-guide-images', 1); q.onupgradeneeded = () => q.result.createObjectStore('img'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
		return imgDbP;
	}
	async function imgPut(id, blob) { const db = await imgDb(); return new Promise((res, rej) => { const t = db.transaction('img', 'readwrite'); t.objectStore('img').put(blob, id); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
	async function imgGet(id) { try { const db = await imgDb(); return await new Promise((res) => { const r = db.transaction('img').objectStore('img').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; } }
	async function imgDel(id) { try { const db = await imgDb(); await new Promise((res) => { const t = db.transaction('img', 'readwrite'); t.objectStore('img').delete(id); t.oncomplete = res; t.onerror = res; }); } catch (e) { /* nothing to delete */ } }
	const urls = new Map();
	function imgUrl(id) { if (!urls.has(id)) urls.set(id, imgGet(id).then((b) => (b ? URL.createObjectURL(b) : null))); return urls.get(id); }
	const usedElsewhere = (id, except) => G.list.some((x) => x !== except && (x.images || []).some((im) => im.id === id));
	/** Removes pictures from storage unless another guide (a duplicate) still shows them. */
	function dropImages(g, list) { list.forEach((im) => { if (!usedElsewhere(im.id, g)) { imgDel(im.id); urls.delete(im.id); } }); }

	/** Big screenshots are scaled down to 1920 px so the browser storage does not fill up. */
	async function shrink(file) {
		try {
			if (/gif|svg/.test(file.type)) return { blob: file, w: 0, h: 0 };
			const bmp = await createImageBitmap(file);
			const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
			if (k === 1 && file.size < 1.5e6) return { blob: file, w: bmp.width, h: bmp.height };
			const c = document.createElement('canvas');
			c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
			c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
			const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.88));
			return { blob: blob || file, w: c.width, h: c.height };
		} catch (e) { return { blob: file, w: 0, h: 0 }; }
	}
	async function addImages(g, files) {
		const list = [...files].filter((f) => /^image\//.test(f.type));
		if (!list.length) { FB.toast('Those files are not pictures.', 'warn'); return; }
		for (const f of list) {
			const r = await shrink(f), id = 'img' + FB.uid();
			try { await imgPut(id, r.blob); } catch (e) { FB.toast('Could not store ' + f.name + ': ' + (e.message || e), 'warn'); continue; }
			g.images.push({ id, title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(), caption: '', w: r.w, h: r.h });
		}
		save(g); render();
		FB.toast(`Added ${list.length} picture${list.length === 1 ? '' : 's'}`, 'ok');
	}
	const blobToData = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
	async function imagesData(g) { const out = {}; for (const im of g.images || []) { const b = await imgGet(im.id); if (b) out[im.id] = await blobToData(b); } return out; }
	/** A copy of the guide with every picture inside it, for the .json file. */
	async function withImageData(g) {
		const d = await imagesData(g);
		const icons = FB.gfx ? await FB.gfx.collect(iconNames(g)) : {};
		return Object.assign({}, g, { images: (g.images || []).map((im) => Object.assign({}, im, { data: d[im.id] || null })), icons });
	}
	async function storeImported(g) {
		if (g.icons && FB.gfx) await FB.gfx.store(g.icons);   // the game pictures that came with the guide
		delete g.icons;
		for (const im of g.images) {
			if (im && im.data) { try { const b = await (await fetch(im.data)).blob(); im.id = 'img' + FB.uid(); await imgPut(im.id, b); } catch (e) { /* keep the title, the picture is lost */ } }
			if (im) delete im.data;
		}
		g.images = g.images.filter((im) => im && im.id);
	}

	function listCol() {
		const col = h('aside', { class: 'tp-list' });
		col.appendChild(h('div', { class: 'gd-io' },
			h('button', { class: 'dzf-btn', onclick: importFile, title: 'Import one or more guide files (.json)' }, FB.icon('upload', 14), 'Import'),
			h('button', { class: 'dzf-btn', onclick: exportAll, title: 'Save every guide in one file' }, FB.icon('download', 14), 'Export all')));
		col.appendChild(h('button', { class: 'dzf-btn gold', onclick: () => pickNation('', (tag) => { const g = newGuide(tag ? natLabel(tag) + ' guide' : 'Guide ' + (G.list.length + 1)); g.tag = tag; G.list.push(g); G.cur = g.id; G.tab = 'focus'; G.treeKey = ''; persist(); render(); }, true) }, FB.icon('plus', 15), 'New guide'));
		if (!G.list.length) col.appendChild(h('div', { class: 'tp-empty' }, 'No guides yet. A guide collects a focus order, your tank and ship designs, division templates and your own text for one nation.'));
		G.list.forEach((g) => col.appendChild(h('button', { class: 'tp-item' + (g.id === G.cur ? ' on' : ''), onclick: () => { G.cur = g.id; render(); } },
			h('b', {}, g.title || '(untitled)'), h('small', {}, (g.tag ? g.tag + ' · ' : '') + g.focus.filter((s) => s.type === 'focus').length + ' focuses · ' + g.tanks.length + ' tanks · ' + g.ships.length + ' ships · ' + g.templates.length + ' templates'))));
		return col;
	}

	function editor() {
		const g = cur();
		const sec = h('section', { class: 'tp-edit' });
		if (!g) { sec.appendChild(h('div', { class: 'dz-empty' }, h('h3', {}, 'Nation guides'), h('p', {}, 'Create a guide, then fill the five tabs. Export it as a web page, Markdown or Steam BBCode.'))); return sec; }
		const tagBox = h('button', { class: 'dzf-btn gd-nation' + (g.tag ? '' : ' empty'), title: 'The nation this guide is for', onclick: () => pickNation(g.tag, (tag) => { g.tag = tag; G.treeKey = ''; save(g); render(); }) },
			FB.icon('flag', 14), g.tag ? h('span', {}, natLabel(g.tag)) : 'Choose nation', g.tag ? h('span', { class: 'gd-nattag' }, g.tag) : null);
		sec.appendChild(h('div', { class: 'tp-head' },
			h('input', { type: 'text', class: 'dzf-name', value: g.title, placeholder: 'Guide title, e.g. Germany: the Reich path', oninput: (e) => { g.title = e.target.value; save(g); const it = document.querySelector('.tp-item.on b'); if (it) it.textContent = g.title || '(untitled)'; } }),
			tagBox,
			h('button', { class: 'dzf-btn gold', onclick: (e) => exportMenu(e.currentTarget, g) }, FB.icon('download', 14), 'Export'),
			h('button', { class: 'dzf-btn', onclick: () => { const c = JSON.parse(JSON.stringify(g)); c.id = FB.uid(); c.title += ' (copy)'; G.list.push(c); G.cur = c.id; persist(); render(); } }, FB.icon('copy', 14), 'Duplicate'),
			h('button', { class: 'dzf-btn', onclick: () => { if (confirm('Delete the guide "' + g.title + '"?')) { G.list = G.list.filter((x) => x.id !== g.id); dropImages(g, g.images || []); G.cur = null; persist(); render(); } } }, FB.icon('trash', 14), 'Delete')));
		sec.appendChild(h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Short summary'), h('input', { type: 'text', value: g.summary, placeholder: 'One line that tells the reader what this guide is about', oninput: (e) => { g.summary = e.target.value; save(g); } })));
		const counts = { focus: g.focus.filter((s) => s.type === 'focus').length, tank: g.tanks.length, ship: g.ships.length, templates: g.templates.length, text: g.text.length, images: g.images.length };
		sec.appendChild(h('div', { class: 'gd-tabs' }, TABS.map(([k, label, icon]) => h('button', { class: G.tab === k ? 'on' : '', onclick: () => { G.tab = k; render(); } }, FB.icon(icon, 15), label, h('span', { class: 'dzf-count' }, counts[k])))));
		const pane = h('div', { class: 'gd-pane' });
		({ focus: focusTab, tank: (p, x) => designTab(p, x, 'tank'), ship: (p, x) => designTab(p, x, 'ship'), templates: templatesTab, text: textTab, images: imagesTab })[G.tab](pane, g);
		sec.appendChild(pane);
		return sec;
	}

	/* ---------- small shared pieces ---------- */
	const rowTools = (arr, i, g) => h('span', { class: 'gd-tools' },
		h('button', { class: 'ibtn', title: 'Move up', onclick: () => { move(arr, i, -1); save(g); render(); } }, FB.icon('arrowUp', 14)),
		h('button', { class: 'ibtn', title: 'Move down', onclick: () => { move(arr, i, 1); save(g); render(); } }, FB.icon('arrowDown', 14)),
		h('button', { class: 'ibtn', title: 'Remove', onclick: () => { arr.splice(i, 1); save(g); render(); } }, FB.icon('trash', 14)));
	const noteBox = (obj, g, ph) => h('textarea', { rows: 2, class: 'gd-note', value: obj.note || '', placeholder: ph, oninput: (e) => { obj.note = e.target.value; save(g); } });

	/* ---------- tab: focus order ---------- */
	function focusTab(pane, g) {
		const choices = treesFor(g);
		if (!choices.some((c) => c.key === G.treeKey)) G.treeKey = choices.length ? choices[0].key : '';
		const proj = G.treeKey ? projectFor(G.treeKey) : null;
		const curTree = choices.find((c) => c.key === G.treeKey);
		const treeLabel = curTree ? curTree.label : '';
		// the nation's tree is picked automatically; a nation with several trees gets small tabs instead of a dropdown
		const sel = h('span', { class: 'gd-tree' }, h('b', {}, g.tag ? natLabel(g.tag) : 'No nation'),
			curTree ? h('small', {}, curTree.label + ' · ' + curTree.count + ' focuses') : null,
			choices.length > 1 ? choices.map((c) => h('button', { class: 'gd-treechip' + (c.key === G.treeKey ? ' on' : ''), title: c.count + ' focuses', onclick: () => { G.treeKey = c.key; render(); } }, c.label)) : null);
		const bar = h('div', { class: 'gd-bar' }, FB.icon('tree', 15), sel,
			h('button', { class: 'dzf-btn', disabled: !proj, onclick: () => { suggestOrder(proj).forEach((f) => g.focus.push(stepOf(f, treeLabel))); save(g); render(); } }, FB.icon('sparkles', 14), 'Add whole tree in suggested order'),
			h('button', { class: 'dzf-btn gold', disabled: !g.focus.some((s) => s.type === 'focus'), title: 'Open the tree with the order shown as numbers on the focuses', onclick: () => showOnTree(g) }, FB.icon('tree', 14), 'Show order on the tree'),
			h('button', { class: 'dzf-btn', onclick: () => { g.focus.push({ type: 'heading', name: 'Phase ' + (g.focus.filter((s) => s.type === 'heading').length + 1), note: '' }); save(g); render(); } }, FB.icon('plus', 14), 'Add heading'),
			h('button', { class: 'dzf-btn', disabled: !g.focus.length, onclick: () => { if (confirm('Remove every step from this guide?')) { g.focus = []; save(g); render(); } } }, FB.icon('trash', 14), 'Clear'));
		pane.appendChild(bar);
		if (!choices.length) pane.appendChild(h('p', { class: 'muted' }, !g.tag ? 'Choose the nation of this guide (button next to the title) to see its focus tree.'
			: FB.ws.active ? FB.ws.name + ' has no focus tree for ' + natLabel(g.tag) + ' (' + g.tag + '). You can still add headings and write steps by hand below.'
			: 'Open your mod in the Trees tab to pick the focuses of ' + natLabel(g.tag) + '. You can still add headings and write steps by hand below.'));

		const split = h('div', { class: 'gd-split' });
		const pick = h('div', { class: 'gd-pickcol' });
		let q = '';
		const lst = h('div', { class: 'gd-pickl' });
		const draw = () => {
			lst.innerHTML = '';
			if (!proj) return;
			const used = new Set(g.focus.filter((s) => s.type === 'focus').map((s) => s.id));
			proj.focuses.filter((f) => !q || (f.name + ' ' + f.id).toLowerCase().includes(q)).sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 300).forEach((f) => lst.appendChild(
				h('button', { class: 'gd-pickrow' + (used.has(f.id) ? ' used' : ''), title: 'Add to the order', onclick: () => { g.focus.push(stepOf(f, treeLabel)); save(g); render(); } },
					pickIcon(f, proj), h('span', {}, f.name), h('small', {}, f.id))));
		};
		pick.append(h('div', { class: 'dzf-phd' }, 'Pick focuses'), h('input', { type: 'search', placeholder: 'Search focuses…', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } }), lst);
		draw();

		const order = h('div', { class: 'gd-order' }, h('div', { class: 'dzf-phd' }, 'Order in the guide'));
		if (!g.focus.length) order.appendChild(h('div', { class: 'tp-empty' }, 'Nothing yet. Click focuses on the left to add them in the order a player should take them.'));
		let n = 0;
		g.focus.forEach((s, i) => {
			if (s.type === 'heading') {
				order.appendChild(h('div', { class: 'gd-step head' }, FB.icon('flag', 15), h('input', { type: 'text', value: s.name, placeholder: 'Heading', oninput: (e) => { s.name = e.target.value; save(g); } }), rowTools(g.focus, i, g)));
				return;
			}
			n++;
			order.appendChild(h('div', { class: 'gd-step' }, h('span', { class: 'gd-num' }, n), h('span', { class: 'gd-stepic' }, FB.gfx ? FB.gfx.picture(stepIcon(s)) : null),
				h('div', { class: 'gd-stepb' },
					h('div', { class: 'gd-steph' }, h('input', { type: 'text', value: s.name, oninput: (e) => { s.name = e.target.value; save(g); } }), h('span', { class: 'gd-weeks' }, FB.icon('clock', 13), (s.weeks || 0) + ' wk'), rowTools(g.focus, i, g)),
					noteBox(s, g, 'Why this focus now? (optional)'))));
		});
		split.append(pick, order);
		pane.appendChild(split);
	}

	/* ---------- tabs: tank and ship designs ---------- */
	function designTab(pane, g, kind) {
		const arr = kind === 'tank' ? g.tanks : g.ships;
		const saved = FB.designer ? FB.designer.saved().filter((d) => (d.domain === 'naval') === (kind === 'ship')) : [];
		const bar = h('div', { class: 'gd-bar' }, FB.icon(kind === 'tank' ? 'tank' : 'anchor', 15));
		const sel = h('select', { class: 'dzf-pick wide' }, saved.length ? saved.map((d) => h('option', { value: d.id }, d.name)) : h('option', { value: '' }, 'No saved ' + kind + ' designs'));
		bar.append(sel, h('button', { class: 'dzf-btn gold', disabled: !saved.length, onclick: async () => {
			const d = saved.find((x) => x.id === sel.value);
			if (!d) return;
			try { if (!FB.designer.hasData()) await FB.designer.ensure(); } catch (e) { /* snapshot falls back to plain names */ }
			arr.push(Object.assign(FB.designer.snapshot(d), { note: '' })); save(g); render();
		} }, FB.icon('plus', 14), 'Add design to guide'),
		h('button', { class: 'dzf-btn', onclick: () => FB.modes.set('designer') }, FB.icon('wrench', 14), 'Open Designer'));
		pane.appendChild(bar);
		pane.appendChild(h('p', { class: 'muted small' }, 'Designs come from the Designer tab. Save a design there with the save button, then add it here. The guide keeps its own copy, so changing the design later does not change the guide.'));
		if (!arr.length) pane.appendChild(h('div', { class: 'tp-empty' }, 'No ' + kind + ' designs in this guide yet.'));
		if (fillDesignIcons(arr)) save(g);
		else if (missingDesignIcons(arr)) backfill(g, 'design');
		arr.forEach((s, i) => {
			const live = saved.find((d) => d.id === s.id);
			const refresh = live ? h('button', { class: 'ibtn', title: 'Update from the Designer (pictures, stats and modules as they are now)', onclick: async () => {
				try { if (!FB.designer.hasData()) await FB.designer.ensure(); } catch (e) { /* keep what we can */ }
				arr[i] = Object.assign(FB.designer.snapshot(live), { note: s.note || '', name: s.name }); save(g); render();
			} }, FB.icon('undo', 14)) : null;
			pane.appendChild(h('div', { class: 'gd-card gd-dcard' },
				h('div', { class: 'gd-cardh' }, h('input', { type: 'text', value: s.name, oninput: (e) => { s.name = e.target.value; save(g); } }), h('small', {}, [s.family, s.variantLabel].filter(Boolean).join(' · ')), refresh, rowTools(arr, i, g)),
				designView(s),
				noteBox(s, g, 'When and why to use this design…')));
		});
	}

	/* ---------- tab: templates ---------- */
	/** A design as in the Designer: blueprint, module tiles with the game's pictures, clicks and the main stats. */
	/* Designs and templates added to a guide before the pictures existed (or while the game data was not loaded)
	   get their pictures here, as soon as the game data and icons are available. */
	let filling = false;
	function fillDesignIcons(list) {
		const d = FB.equip && FB.equip.data;
		if (!d || !FB.gfx || !FB.gfx.ready) return false;
		let changed = false;
		list.forEach((sn) => (sn.modules || []).forEach((m) => {
			if (m.icon || !m.name) return;
			let mod = m.key && d.modules[m.key];
			if (!mod) { const nm = m.name.replace(/^★ /, ''); mod = Object.values(d.modules).find((x) => !x.custom && d.name(x.key) === nm); }
			if (!mod || mod.custom) return;
			const ic = FB.gfx.find(FB.gfx.moduleNames(mod, d.modules));
			if (ic) { m.icon = ic; m.key = mod.key; FB.gfx.keep(ic); changed = true; }
		}));
		return changed;
	}
	function fillUnitIcons(list) {
		if (!FB.gfx || !FB.gfx.ready) return false;
		let changed = false;
		list.forEach((t) => (t.rows || []).flat().concat(t.support || []).forEach((c) => {
			if (!c || c.icon || !c.key) return;
			const ic = FB.gfx.find(['GFX_unit_' + c.key + '_icon_medium', 'GFX_unit_' + c.key.replace(/_brigade$/, '') + '_icon_medium']);
			if (ic) { c.icon = ic; FB.gfx.keep(ic); changed = true; }
		}));
		return changed;
	}
	const missingDesignIcons = (list) => list.some((sn) => (sn.modules || []).some((m) => m.name && !m.icon && !/^★/.test(m.name)));
	const missingUnitIcons = (list) => list.some((t) => (t.rows || []).flat().concat(t.support || []).some((c) => c && !c.icon));
	/** Loads the game data and icons in the background (needs the helper), then fills in and redraws. */
	function backfill(g, kind) {
		if (filling || !FB.server.active) return;
		filling = true;
		const jobs = [FB.gfx ? FB.gfx.load() : Promise.resolve()];
		if (kind === 'design' && FB.designer && !FB.designer.hasData()) jobs.push(FB.designer.ensure());
		Promise.all(jobs).catch(() => null).then(() => {
			filling = false;
			const ch = kind === 'design' ? fillDesignIcons(g.tanks.concat(g.ships)) : fillUnitIcons(g.templates);
			if (ch) { save(g); if (FB.modes.current === 'guides') render(); }
		});
	}

	function designView(s) {
		const mods = (s.modules || []).map((m) => h('div', { class: 'gd-mod' + (m.name ? '' : ' empty'), title: m.slot + ': ' + (m.name || 'empty') },
			h('div', { class: 'gd-modpic' }, m.icon && FB.gfx ? FB.gfx.picture(m.icon) : null, h('span', { class: 'gd-modalt' }, m.name ? (m.tier || '•') : '')),
			h('b', {}, m.name || 'Empty'), h('small', {}, m.slot)));
		const dials = s.dials ? Object.entries(s.dials).filter((x) => typeof x[1] === 'number') : [];
		return h('div', { class: 'gd-dz' },
			h('div', { class: 'gd-dzl' },
				s.svg ? h('div', { class: 'gd-bp', html: s.svg }) : null,
				dials.length ? h('div', { class: 'gd-clicks' }, dials.map(([k, v]) => h('span', {}, k + ' ', h('b', {}, v), ' clicks'))) : null,
				s.cost ? h('div', { class: 'gd-cost' }, 'Production cost ', h('b', {}, s.cost + ' IC')) : null),
			h('div', { class: 'gd-dzr' },
				h('div', { class: 'gd-mods2' }, mods),
				s.stats && s.stats.length ? h('div', { class: 'gd-stats' }, s.stats.map((x) => h('div', {}, h('span', {}, x.label), h('b', {}, x.value)))) : null));
	}
	function templateGrid(snap) {
		const cell = (c) => h('span', { class: 'gd-tc' + (c ? ' on' : ''), style: c ? { '--gc': FB.templates.unitColor(c.group) } : {}, title: c ? c.name : '' },
			c && c.icon && FB.gfx ? FB.gfx.picture(c.icon) : null, h('i', {}, c ? c.abbr : ''));
		return h('div', { class: 'gd-tgrid' },
			h('div', { class: 'gd-trows' }, snap.rows.map((r) => h('div', { class: 'gd-trow' }, r.map(cell)))),
			h('div', { class: 'gd-tsup' }, h('small', {}, 'Support'), h('div', { class: 'gd-trow' }, snap.support.map(cell))));
	}
	function templatesTab(pane, g) {
		const all = FB.templates.list();
		const sel = h('select', { class: 'dzf-pick wide' }, all.length ? all.map((t) => h('option', { value: t.id }, t.name)) : h('option', { value: '' }, 'No templates saved yet'));
		pane.appendChild(h('div', { class: 'gd-bar' }, FB.icon('users', 15), sel,
			h('button', { class: 'dzf-btn gold', disabled: !all.length, onclick: () => { const t = FB.templates.byId(sel.value); if (!t) return; g.templates.push(FB.templates.snapshot(t)); save(g); render(); } }, FB.icon('plus', 14), 'Add template to guide'),
			h('button', { class: 'dzf-btn', onclick: () => FB.modes.set('templates') }, FB.icon('users', 14), 'Open Templates')));
		if (!g.templates.length) pane.appendChild(h('div', { class: 'tp-empty' }, 'No division templates in this guide yet.'));
		if (fillUnitIcons(g.templates)) save(g);
		else if (missingUnitIcons(g.templates)) backfill(g, 'units');
		g.templates.forEach((s, i) => pane.appendChild(h('div', { class: 'gd-card' },
			h('div', { class: 'gd-cardh' }, h('input', { type: 'text', value: s.name, oninput: (e) => { s.name = e.target.value; save(g); } }), h('small', {}, s.battalions + ' battalions · ' + s.supportCount + ' support'),
				FB.templates.byId(s.id) ? h('button', { class: 'ibtn', title: 'Update from Templates (pictures and layout as they are now)', onclick: () => { g.templates[i] = Object.assign(FB.templates.snapshot(FB.templates.byId(s.id)), { note: s.note || '', name: s.name }); save(g); render(); } }, FB.icon('undo', 14)) : null,
				rowTools(g.templates, i, g)),
			templateGrid(s), h('p', { class: 'muted small' }, s.summary),
			noteBox(s, g, 'When to use this template…'))));
	}

	/* ---------- tab: explanation text ---------- */
	function textTab(pane, g) {
		pane.appendChild(h('div', { class: 'gd-bar' }, FB.icon('scroll', 15),
			h('button', { class: 'dzf-btn gold', onclick: () => { g.text.push({ title: 'Section ' + (g.text.length + 1), body: '' }); save(g); render(); } }, FB.icon('plus', 14), 'Add section'),
			h('span', { class: 'muted small' }, 'Formatting: # Heading, ## Subheading, - list item, **bold**, blank line = new paragraph.')));
		if (!g.text.length) pane.appendChild(h('div', { class: 'tp-empty' }, 'No text yet. Add a section such as “Overview”, “Strategy” or “Tips”.'));
		g.text.forEach((s, i) => pane.appendChild(h('div', { class: 'gd-card' },
			h('div', { class: 'gd-cardh' }, h('input', { type: 'text', value: s.title, placeholder: 'Section title', oninput: (e) => { s.title = e.target.value; save(g); } }), rowTools(g.text, i, g)),
			h('textarea', { rows: 8, class: 'gd-body', value: s.body, placeholder: 'Write the explanation here…', oninput: (e) => { s.body = e.target.value; save(g); } }))));
	}

	/* ---------- tab: images ---------- */
	function imagesTab(pane, g) {
		const pick = () => { const i = h('input', { type: 'file', accept: 'image/*', multiple: true }); i.onchange = () => addImages(g, i.files); i.click(); };
		pane.appendChild(h('div', { class: 'gd-bar' }, FB.icon('image', 15),
			h('button', { class: 'dzf-btn gold', onclick: pick }, FB.icon('upload', 14), 'Add pictures'),
			h('span', { class: 'muted small' }, 'Or drop picture files here. Drag a picture to move it.')));
		// dropping files from the computer anywhere on this tab adds them
		pane.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); pane.classList.add('gd-dropping'); } });
		pane.addEventListener('dragleave', (e) => { if (e.target === pane) pane.classList.remove('gd-dropping'); });
		pane.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); pane.classList.remove('gd-dropping'); addImages(g, e.dataTransfer.files); } });
		if (!g.images.length) {
			pane.appendChild(h('button', { class: 'gd-drop', onclick: pick }, FB.icon('image', 30), h('b', {}, 'Add screenshots or pictures'), h('span', {}, 'Click, or drop PNG, JPG, WebP or GIF files here')));
			return;
		}
		const grid = h('div', { class: 'gd-imgs' });
		let from = -1;
		g.images.forEach((im, i) => {
			const pic = h('img', { alt: im.title || '', draggable: false });
			imgUrl(im.id).then((u) => { if (u) pic.src = u; else pic.replaceWith(h('div', { class: 'gd-imgmiss' }, FB.icon('alert', 18), 'Picture missing')); });
			const card = h('figure', { class: 'gd-img',
				ondragover: (e) => { if (from < 0) return; e.preventDefault(); card.classList.add('over'); },
				ondragleave: () => card.classList.remove('over'),
				ondrop: (e) => { if (from < 0) return; e.preventDefault(); e.stopPropagation(); const x = g.images.splice(from, 1)[0]; g.images.splice(i, 0, x); from = -1; save(g); render(); } },
				h('div', { class: 'gd-imgbox', draggable: true, title: 'Drag to move',
					ondragstart: (e) => { from = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'img' + i); card.classList.add('dragging'); },
					ondragend: () => { card.classList.remove('dragging'); from = -1; } }, pic, h('span', { class: 'gd-imgnum' }, i + 1)),
				h('input', { type: 'text', class: 'gd-imgtitle', value: im.title || '', placeholder: 'Title', oninput: (e) => { im.title = e.target.value; save(g); } }),
				h('textarea', { rows: 1, class: 'gd-note', value: im.caption || '', placeholder: 'Caption (optional)', oninput: (e) => { im.caption = e.target.value; save(g); } }),
				h('div', { class: 'gd-imgtools' },
					h('button', { class: 'ibtn', title: 'Move left', disabled: i === 0, onclick: () => { move(g.images, i, -1); save(g); render(); } }, FB.icon('arrowLeft', 14)),
					h('button', { class: 'ibtn', title: 'Move right', disabled: i === g.images.length - 1, onclick: () => { move(g.images, i, 1); save(g); render(); } }, FB.icon('arrowRight', 14)),
					h('span', { class: 'gd-imgsize' }, im.w ? im.w + ' × ' + im.h : ''),
					h('button', { class: 'ibtn danger', title: 'Remove picture', onclick: () => { const x = g.images.splice(i, 1)[0]; save(g); dropImages(g, [x]); render(); } }, FB.icon('trash', 14))));
			grid.appendChild(card);
		});
		pane.appendChild(grid);
	}

	/* ---------- export ---------- */
	const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
	function mdToHtml(src) {
		const out = []; let list = false;
		const close = () => { if (list) { out.push('</ul>'); list = false; } };
		String(src || '').split(/\r?\n/).forEach((l) => {
			let m;
			if ((m = /^\s*[-*]\s+(.*)$/.exec(l))) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + bold(m[1]) + '</li>'); return; }
			close();
			if ((m = /^##\s+(.*)$/.exec(l))) out.push('<h4>' + bold(m[1]) + '</h4>');
			else if ((m = /^#\s+(.*)$/.exec(l))) out.push('<h3>' + bold(m[1]) + '</h3>');
			else if (l.trim()) out.push('<p>' + bold(l) + '</p>');
		});
		close();
		return out.join('\n');
	}
	function mdToBB(src) {
		const out = []; let list = false;
		const close = () => { if (list) { out.push('[/list]'); list = false; } };
		const b = (s) => s.replace(/\*\*(.+?)\*\*/g, '[b]$1[/b]');
		String(src || '').split(/\r?\n/).forEach((l) => {
			let m;
			if ((m = /^\s*[-*]\s+(.*)$/.exec(l))) { if (!list) { out.push('[list]'); list = true; } out.push('[*]' + b(m[1])); return; }
			close();
			if ((m = /^##\s+(.*)$/.exec(l))) out.push('[h3]' + b(m[1]) + '[/h3]');
			else if ((m = /^#\s+(.*)$/.exec(l))) out.push('[h2]' + b(m[1]) + '[/h2]');
			else out.push(b(l));
		});
		close();
		return out.join('\n');
	}
	const tplLines = (s) => s.rows.map((r) => r.map((c) => (c ? c.abbr : '··').padEnd(4)).join('')).join('\n') + '\nSupport: ' + (s.support.map((c) => (c ? c.name : '-')).join(', '));

	function toMarkdown(g) {
		const L = [];
		L.push('# ' + g.title, g.tag ? '*' + natLabel(g.tag) + ' (' + g.tag + ')*' : '', g.summary ? '\n' + g.summary : '', '');
		g.text.filter((t) => t.body || t.title).forEach((t) => L.push('## ' + t.title, '', t.body, ''));
		if (g.focus.length) {
			L.push('## Focus order', ''); let n = 0;
			g.focus.forEach((s) => { if (s.type === 'heading') L.push('', '### ' + s.name, ''); else L.push(++n + '. **' + s.name + '** (' + s.weeks + ' weeks)' + (s.note ? ' - ' + s.note.replace(/\n+/g, ' ') : '')); });
			L.push('');
		}
		[['Tank designs', g.tanks], ['Ship designs', g.ships]].forEach(([t, arr]) => {
			if (!arr.length) return;
			L.push('## ' + t, '');
			arr.forEach((s) => { L.push('### ' + s.name, '', [s.family, s.variantLabel].filter(Boolean).join(' - '), ''); s.modules.filter((m) => m.name).forEach((m) => L.push('- ' + m.slot + ': ' + m.name + (m.tier ? ' ' + m.tier : ''))); if (s.note) L.push('', s.note); L.push(''); });
		});
		if (g.templates.length) {
			L.push('## Division templates', '');
			g.templates.forEach((s) => { L.push('### ' + s.name, '', '```', tplLines(s), '```', '', s.summary); if (s.note) L.push('', s.note); L.push(''); });
		}
		if (g.images.length) { L.push('## Images', ''); g.images.forEach((im) => L.push('- **' + (im.title || 'Picture') + '**' + (im.caption ? ' - ' + im.caption : ''))); L.push('', '*The pictures are in the web page export.*', ''); }
		return L.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
	}

	function toBBCode(g) {
		const L = ['[h1]' + g.title + '[/h1]'];
		if (g.summary) L.push('[i]' + g.summary + '[/i]');
		g.text.filter((t) => t.body || t.title).forEach((t) => L.push('', '[h2]' + t.title + '[/h2]', mdToBB(t.body)));
		if (g.focus.length) {
			L.push('', '[h2]Focus order[/h2]'); let n = 0;
			g.focus.forEach((s) => { if (s.type === 'heading') L.push('[h3]' + s.name + '[/h3]'); else L.push(++n + '. [b]' + s.name + '[/b] (' + s.weeks + ' weeks)' + (s.note ? ' - ' + s.note.replace(/\n+/g, ' ') : '')); });
		}
		[['Tank designs', g.tanks], ['Ship designs', g.ships]].forEach(([t, arr]) => {
			if (!arr.length) return;
			L.push('', '[h2]' + t + '[/h2]');
			arr.forEach((s) => { L.push('[h3]' + s.name + '[/h3]', '[i]' + [s.family, s.variantLabel].filter(Boolean).join(' - ') + '[/i]', '[list]'); s.modules.filter((m) => m.name).forEach((m) => L.push('[*][b]' + m.slot + ':[/b] ' + m.name + (m.tier ? ' ' + m.tier : ''))); L.push('[/list]'); if (s.note) L.push(s.note); });
		});
		if (g.templates.length) {
			L.push('', '[h2]Division templates[/h2]');
			g.templates.forEach((s) => { L.push('[h3]' + s.name + '[/h3]', '[code]' + tplLines(s) + '[/code]', s.summary); if (s.note) L.push(s.note); });
		}
		if (g.images.length) { L.push('', '[h2]Images[/h2]', '[list]'); g.images.forEach((im) => L.push('[*][b]' + (im.title || 'Picture') + '[/b]' + (im.caption ? ' - ' + im.caption : ''))); L.push('[/list]'); }
		return L.join('\n');
	}

	/** data: picture id -> data URL, so the page carries its own pictures. */
	function toHtml(g, data, icons) {
		icons = icons || {};
		const pic = (n, cls) => (n && icons[String(n).toLowerCase()] ? '<img class="' + (cls || 'pic') + '" src="' + icons[String(n).toLowerCase()] + '" alt="">' : '');
		data = data || {};
		const cell = (c) => '<span class="c' + (c ? ' on' : '') + (c && pic(c.icon) ? ' img' : '') + '"' + (c ? ' style="--gc:' + FB.templates.unitColor(c.group) + '" title="' + esc(c.name) + '"' : '') + '>' + (c ? (pic(c.icon) || esc(c.abbr)) : '') + '</span>';
		let n = 0;
		const focus = g.focus.map((s) => s.type === 'heading' ? '<h3>' + esc(s.name) + '</h3>' : '<div class="step"><span class="n">' + (++n) + '</span>' + pic(stepIcon(s), 'fi') + '<div><b>' + esc(s.name) + '</b> <small>' + s.weeks + ' weeks</small>' + (s.note ? '<p>' + esc(s.note) + '</p>' : '') + '</div></div>').join('\n');
		const design = (s) => '<div class="card"><h3>' + esc(s.name) + '</h3><small>' + esc([s.family, s.variantLabel].filter(Boolean).join(' · ')) + '</small><div class="dz">' + (s.svg ? '<div class="svg">' + s.svg + '</div>' : '') +
			'<div class="mods">' + s.modules.map((m) => '<div class="mod' + (m.name ? '' : ' empty') + '"><div class="mp">' + (pic(m.icon) || (m.name ? '<span>' + esc(m.tier || '•') + '</span>' : '')) + '</div><b>' + esc(m.name || 'Empty') + '</b><small>' + esc(m.slot) + '</small></div>').join('') + '</div></div>' +
			(s.dials && Object.keys(s.dials).length ? '<p class="clk">' + Object.entries(s.dials).filter((x) => typeof x[1] === 'number').map(([k, v]) => esc(k) + ' <b>' + v + '</b> clicks').join(' · ') + (s.cost ? ' · cost <b>' + s.cost + ' IC</b>' : '') + '</p>' : '') +
			(s.stats && s.stats.length ? '<div class="st">' + s.stats.map((x) => '<div><span>' + esc(x.label) + '</span><b>' + esc(x.value) + '</b></div>').join('') + '</div>' : '') +
			(s.note ? '<p>' + esc(s.note) + '</p>' : '') + '</div>';
		const tpl = (s) => '<div class="card"><h3>' + esc(s.name) + '</h3><div class="tg">' + s.rows.map((r) => '<div>' + r.map(cell).join('') + '</div>').join('') + '<div class="sup">Support ' + s.support.map(cell).join('') + '</div></div><small>' + esc(s.summary) + '</small>' + (s.note ? '<p>' + esc(s.note) + '</p>' : '') + '</div>';
		const css = 'body{background:#14181c;color:#dde5ec;font:16px/1.55 Segoe UI,Arial,sans-serif;margin:0}main{max-width:900px;margin:0 auto;padding:30px 20px}h1{font:600 32px Georgia,serif;color:#eadfc2;margin:0}h2{font:600 22px Georgia,serif;color:#d8c27a;border-bottom:1px solid #3a444e;padding-bottom:4px;margin-top:34px}h3{color:#eadfc2;margin:.8em 0 .3em}.lead{color:#98a5b1}.card{background:#1d2329;border:1px solid #3a444e;border-radius:6px;padding:12px 16px;margin:12px 0}.step{display:flex;gap:12px;margin:8px 0}.n{flex:none;width:28px;height:28px;border-radius:50%;background:#d8c27a;color:#1a1608;font-weight:700;display:flex;align-items:center;justify-content:center}.step p,.card p{margin:.3em 0;color:#b5c0ca}small{color:#8d99a5}.dz{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}.svg{width:260px;max-width:100%;background:linear-gradient(#1d4d7a,#163d62);border-radius:6px;padding:6px}.svg svg{width:100%;height:auto}table{border-collapse:collapse}td{padding:2px 12px 2px 0;border-bottom:1px solid #2c353d}td:first-child{color:#98a5b1}.tg div{display:flex;gap:4px;margin:4px 0}.c{width:44px;height:30px;border:1px solid #3a444e;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:#6d7a86}.c.on{background:color-mix(in srgb,var(--gc) 35%,#1d2329);border-color:var(--gc);color:#fff}.sup{margin-top:10px;align-items:center;color:#98a5b1}ul{padding-left:22px}.mods{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;flex:1;min-width:260px}.mod{background:#14181c;border:1px solid #2c353d;border-radius:6px;padding:6px;text-align:center;display:flex;flex-direction:column;gap:2px}.mod.empty{opacity:.45}.mp{height:46px;display:flex;align-items:center;justify-content:center}.mp img{max-width:100%;max-height:46px}.mp span{color:#d8c27a;font-weight:700}.mod b{font-size:12.5px;font-weight:600}.mod small{font-size:11px}.clk{color:#b5c0ca}.st{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:2px 16px;margin-top:8px;font-size:13.5px}.st div{display:flex;justify-content:space-between;border-bottom:1px solid #2c353d;padding:2px 0}.st span{color:#98a5b1}.c.img{width:84px;height:36px;background:#14181c}.c img{max-width:92%;max-height:30px}.fi{width:44px;height:40px;object-fit:contain;flex:none}figure{margin:18px 0}figure img{display:block;max-width:100%;height:auto;border-radius:6px;border:1px solid #3a444e}figcaption{margin-top:6px;color:#98a5b1;font-size:14px}figcaption b{color:#dde5ec}';
		return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(g.title) + '</title><style>' + css + '</style></head><body><main><h1>' + esc(g.title) + '</h1>' +
			(g.tag ? '<div class="lead">' + esc(natLabel(g.tag)) + ' (' + esc(g.tag) + ')</div>' : '') + (g.summary ? '<p class="lead">' + esc(g.summary) + '</p>' : '') +
			g.text.map((t) => '<h2>' + esc(t.title) + '</h2>' + mdToHtml(t.body)).join('\n') +
			(g.images.length ? '<h2>Images</h2>' + g.images.map((im) => '<figure>' + (data[im.id] ? '<img src="' + data[im.id] + '" alt="' + esc(im.title) + '">' : '') + '<figcaption><b>' + esc(im.title || '') + '</b>' + (im.caption ? ' · ' + esc(im.caption) : '') + '</figcaption></figure>').join('') : '') +
			(g.focus.length ? '<h2>Focus order</h2>' + focus : '') + (g.tanks.length ? '<h2>Tank designs</h2>' + g.tanks.map(design).join('') : '') + (g.ships.length ? '<h2>Ship designs</h2>' + g.ships.map(design).join('') : '') +
			(g.templates.length ? '<h2>Division templates</h2>' + g.templates.map(tpl).join('') : '') + '</main></body></html>';
	}

	function exportMenu(anchor, g) {
		const slug = (g.title || 'guide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guide';
		const items = [['Web page (.html)', 'globe', async () => FB.download(slug + '.html', toHtml(g, await imagesData(g), FB.gfx ? await FB.gfx.collect(iconNames(g)) : {}), 'text/html')], ['Markdown (.md)', 'scroll', () => FB.download(slug + '.md', toMarkdown(g), 'text/markdown')],
			['Steam / forum BBCode', 'copy', () => { const t = toBBCode(g); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => FB.toast('BBCode copied. Paste it into the Steam guide editor.', 'ok'), () => FB.download(slug + '.bbcode.txt', t, 'text/plain')); }],
			['Guide file (.json, to share or back up)', 'download', async () => FB.download(slug + '.guide.json', JSON.stringify(await withImageData(g), null, 2), 'application/json')]];
		const m = h('div', { class: 'dzf-pop gd-menu' }, items.map(([label, icon, fn]) => h('button', { class: 'dzf-btn', onclick: () => { m.remove(); fn(); } }, FB.icon(icon, 14), label)));
		document.body.appendChild(m);
		const r = anchor.getBoundingClientRect();
		m.style.top = (r.bottom + 6) + 'px'; m.style.left = Math.max(8, r.right - 280) + 'px'; m.style.width = '280px';
		setTimeout(() => document.addEventListener('mousedown', function f(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', f, true); } }, true), 0);
	}

	FB.guides = {
		init() {
			load();
			root = h('section', { id: 'guides' }, h('div', { id: 'gd-body' }));
			body = root.firstChild;
			FB.modes.register('guides', 'Guides', 'scroll', root, { open() { render(); }, close() {} });
			FB.on('ws', () => { if (FB.modes.current === 'guides') render(); });
			overlaySel = FB.h('select', { id: 'guide-overlay', title: 'Show the focus order of a guide as numbers on this tree', onchange: (e) => { overlayId = e.target.value; applyOverlay(); } });
			const tools = document.getElementById('canvas-tools');
			if (tools) tools.insertBefore(overlaySel, tools.firstChild);
			refreshOverlay();
		},
		list: () => G.list.slice(),
		toMarkdown, toBBCode, toHtml
	};
})(window.FB = window.FB || {});
