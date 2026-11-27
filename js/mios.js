/* Focus Builder - MIOs tab: every Military Industrial Organization of the base game and the open mod, grouped by
 * nation (an organization is for the nations in its `allowed` block; without one it is generic), drawn like the
 * game's own organization screen. From here you open a mod's organization in the editor, copy a base-game one into
 * your mod to change it, or add it to a guide. */
(function (FB) {
	'use strict';
	const h = FB.h;
	const ORG_DIR = 'common/military_industrial_organization/organizations/';
	const M = FB.mios = { list: [], ready: false, loading: false, status: '', sig: '', gameTexts: {} };
	const UI = { cur: '', q: '', sel: '' };
	let root, body;

	const pretty = (k) => { const s = String(k).replace(/^[A-Z][A-Z0-9]{2}_/, '').replace(/_organi[sz]ation$/, '').replace(/^generic_mio_(initial_)?trait_/, '').replace(/_/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
	const natName = (tag) => (FB.gd && FB.gd.label('tag', tag)) || tag;
	const isBlock = (e) => e && Array.isArray(e.v);
	const sval = (e) => (e && typeof e.v === 'string' ? e.v : '');
	const bare = (e) => (isBlock(e) ? e.v.filter((x) => x.v === undefined).map((x) => x.k) : []);
	const find = (en, k) => en.find((x) => x.k === k);
	const BONUS = ['equipment_bonus', 'production_bonus', 'organization_modifier'];

	/* ---------- reading ---------- */

	/** Localised text: resolves $other_key$ references like the game does. */
	function locText(loc, key, fallback) {
		let v = loc[key];
		if (v == null) return fallback;
		for (let i = 0; i < 4 && /\$[\w.]+\$/.test(v); i++) v = v.replace(/\$([\w.]+)\$/g, (m, k) => (loc[k] != null ? loc[k] : m));
		v = v.replace(/§./g, '').replace(/\$[\w.]+\$/g, '').trim();
		return v || fallback;
	}

	/** "+5% soft attack" style text for a trait's bonuses. */
	M.bonusText = function (t) {
		const out = [];
		BONUS.forEach((k) => ((t.bonuses || {})[k] || []).forEach((r) => {
			const n = Number(r.v), pct = Math.abs(n) < 5;
			out.push((n > 0 ? '+' : '') + (pct ? Math.round(n * 1000) / 10 + '%' : n) + ' ' + String(r.k).replace(/^military_industrial_organization_/, '').replace(/_/g, ' '));
		}));
		return out.join(', ');
	};

	/** One trait block (trait, add_trait, override_trait or initial_trait) as plain data. Only fields written in it are set. */
	function traitOf(e, num, loc, initialToken) {
		const en = e.v, t = { kind: e.k };
		t.token = sval(find(en, 'token')) || initialToken || '';
		const nm = sval(find(en, 'name'));
		if (nm || e.k !== 'override_trait') t.name = locText(loc, nm || t.token, pretty(nm || t.token));
		if (find(en, 'icon')) t.icon = sval(find(en, 'icon'));
		if (find(en, 'special_trait_background')) t.special = sval(find(en, 'special_trait_background')) === 'yes';
		const pos = find(en, 'position');
		if (isBlock(pos)) t.pos = { x: num(sval(find(pos.v, 'x'))) || 0, y: num(sval(find(pos.v, 'y'))) || 0 };
		if (find(en, 'relative_position_id')) t.rel = sval(find(en, 'relative_position_id'));
		const groups = [];
		let hasParents = false;
		en.forEach((x) => {
			if (x.k === 'all_parents' || x.k === 'parent') { hasParents = true; bare(x).forEach((p) => groups.push([p])); }
			else if (x.k === 'any_parent') { hasParents = true; const g = bare(x); if (g.length) groups.push(g); }
		});
		if (hasParents) t.parents = groups;
		if (find(en, 'mutually_exclusive')) t.excl = bare(find(en, 'mutually_exclusive'));
		BONUS.forEach((k) => {
			const b = find(en, k);
			if (!isBlock(b)) return;
			t.bonuses = t.bonuses || {};
			t.bonuses[k] = b.v.filter((x) => typeof x.v === 'string' && num(x.v) != null).map((x) => ({ k: x.k, v: num(x.v) }));
		});
		if (find(en, 'limit_to_equipment_type')) t.limit = bare(find(en, 'limit_to_equipment_type')).join(' ');
		return t;
	}

	/** Organizations in one file. src: 'game' | 'mod'. */
	M.parseFile = function (text, path, src, loc) {
		loc = loc || {};
		return FB.importer.parseMioFile(text, path).map((t) => {
			const vars = t.vars || {};
			const num = (v) => { if (typeof v === 'string' && v[0] === '@' && vars[v.slice(1)] != null) v = vars[v.slice(1)]; const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? null : n; };
			const en = t.entries;
			let initN = 0;
			const traits = [], overrides = [], removes = [], headers = [];
			en.forEach((e) => {
				if (!isBlock(e)) return;
				if (e.k === 'trait' || e.k === 'add_trait') traits.push(traitOf(e, num, loc));
				else if (e.k === 'initial_trait') traits.push(Object.assign(traitOf(e, num, loc, `${t.id}_initial_${++initN}`), { initial: true }));
				else if (e.k === 'override_trait') overrides.push(traitOf(e, num, loc));
				else if (e.k === 'remove_trait') removes.push(...bare(e));
				else if (e.k === 'tree_header_text') { const k = sval(find(e.v, 'text')); headers.push({ text: locText(loc, k, pretty(k)), x: num(sval(find(e.v, 'x'))) || 0 }); }
			});
			const al = find(en, 'allowed');
			const archetype = isBlock(al) && al.v.some((x) => x.k === 'always' && x.v === 'no');
			return {
				key: src + ':' + path + '#' + t.index, treeKey: path + '#' + t.index, id: t.id, src, file: path, index: t.index,
				tags: t.tags || [], archetype, name: locText(loc, sval(find(en, 'name')) || t.id, pretty(t.id)),
				include: sval(find(en, 'include')), icon: sval(find(en, 'icon')), equipment: bare(find(en, 'equipment_type')),
				traits, overrides, removes, headers
			};
		});
	};

	/**
	 * Builds the list from file texts. game/mod: {path: text}. A mod file with the same path as a game file replaces
	 * it (that is how HOI4 loads mods), and a mod organization with the same id hides the game one.
	 */
	M.build = function (game, gameLoc, mod, modLoc) {
		const loc = Object.assign({}, gameLoc || {}, modLoc || {});
		const list = [];
		Object.keys(mod || {}).sort().forEach((p) => list.push(...M.parseFile(mod[p], p, 'mod', loc)));
		const modIds = new Set(list.map((o) => o.id));
		Object.keys(game || {}).sort().forEach((p) => { if (!(mod && p in mod)) M.parseFile(game[p], p, 'game', loc).forEach((o) => { if (!modIds.has(o.id)) list.push(o); }); });
		list.sort((a, b) => (a.tags[0] || '~~~').localeCompare(b.tags[0] || '~~~') || a.name.localeCompare(b.name));
		M.list = list;
		M.gameTexts = Object.assign({}, game || {});
		M.ready = true;
		resolved.clear();
		return list;
	};

	M.byId = (id) => M.list.find((o) => o.id === id) || null;
	/** Organizations a nation can get: its own ones first, then the generic ones (templates marked always = no are left out). */
	M.forNation = (tag) => { tag = String(tag || '').toUpperCase(); return M.list.filter((o) => o.tags.includes(tag)).concat(M.list.filter((o) => !o.tags.length && !o.archetype)); };

	/** Unresolved traits after include / remove_trait / override_trait / add_trait, like the game builds them. */
	function rawTraits(org, seen) {
		if (!org || seen.has(org.id)) return [];
		seen.add(org.id);
		const inc = org.include ? M.byId(org.include) : null;
		let list = rawTraits(inc, seen).map((t) => Object.assign({}, t, { from: t.from || inc.id }));
		if (org.removes.length) list = list.filter((t) => !org.removes.includes(t.token));
		org.overrides.forEach((o) => { const i = list.findIndex((t) => t.token === o.token); if (i >= 0) { const c = Object.assign({}, o); delete c.kind; list[i] = Object.assign({}, list[i], c); } });
		org.traits.forEach((t) => { const i = list.findIndex((x) => x.token === t.token); const c = Object.assign({}, t); if (i >= 0) list[i] = c; else list.push(c); });
		return list;
	}
	const resolved = new Map();
	/** Every trait of an organization with its place on the grid (relative positions resolved). */
	M.traitsOf = function (org) {
		if (!org) return [];
		if (resolved.has(org.key)) return resolved.get(org.key);
		const raw = rawTraits(org, new Set());
		const by = new Map(raw.map((t) => [t.token, t]));
		const abs = new Map();
		const place = (t, seen) => {
			if (abs.has(t.token)) return abs.get(t.token);
			const p = t.pos || { x: 0, y: 0 };
			let v = { x: p.x, y: p.y };
			const r = t.rel && by.get(t.rel);
			if (r && !seen.has(t.token)) { seen.add(t.token); const b = place(r, seen); v = { x: b.x + p.x, y: b.y + p.y }; }
			abs.set(t.token, v);
			return v;
		};
		const out = raw.map((t) => Object.assign({ name: pretty(t.token), icon: '', parents: [], excl: [], bonuses: {}, limit: '', special: false }, t,
			t.initial ? { x: 0, y: 0 } : place(t, new Set())));
		resolved.set(org.key, out);
		return out;
	};
	/** Column headers (from the organization or the template it includes). */
	M.headersOf = (org, seen) => { seen = seen || new Set(); if (!org || seen.has(org.id)) return []; seen.add(org.id); return org.headers.length ? org.headers : M.headersOf(org.include ? M.byId(org.include) : null, seen); };
	M.iconOf = (org, seen) => { seen = seen || new Set(); if (!org || seen.has(org.id)) return ''; seen.add(org.id); return org.icon || M.iconOf(org.include ? M.byId(org.include) : null, seen); };

	/** The company logo (sprite), with a factory icon until the picture is known. */
	M.logo = function (icon, size) {
		const box = h('span', { class: 'mio-logo', style: { width: size + 'px', height: size + 'px' } }, FB.icon('factory', Math.round(size * 0.55)));
		if (icon && FB.gfx) box.appendChild(FB.gfx.picture(icon, 'mio-logo-img'));
		return box;
	};

	const LOC_RE = /(mio|industrial|organi[sz]ation)[a-z_]*l_english\.ya?ml$|^ideas[a-z_]*l_english\.ya?ml$/i;
	const sig = () => (FB.server && FB.server.active ? 'g' : '') + '|' + (FB.ws.active ? FB.ws.name + '|' + Object.entries(FB.ws.files).filter(([p]) => p.startsWith(ORG_DIR)).map(([p, f]) => p + ':' + f.text.length).join(',') : '');
	/** Reads the base game (through the helper; kept until force === 'game') and the open mod. */
	let gameCache = null;
	M.load = async function (force) {
		if (M.loading || (M.ready && !force && M.sig === sig())) return;
		M.loading = true;
		if (force === 'game') gameCache = null;
		const game = gameCache ? gameCache.game : {}, gameLoc = gameCache ? gameCache.loc : {};
		try {
			if (!gameCache && FB.server && FB.server.active && FB.server.info && FB.server.info.game) {
				M.status = 'Reading the base game’s organizations…'; redraw();
				await FB.server.post('open', { path: FB.server.info.game });
				const dir = FB.server.dir(FB.server.info.game, 'game');
				const files = [];
				try { let d = dir; for (const p of ORG_DIR.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p); await FB.fsutil.walk(d, ORG_DIR, files, 0, (n) => /\.txt$/i.test(n)); } catch (e) { /* no folder */ }
				for (const f of files) game[f.path] = await FB.fsutil.readText(f.handle);
				const lf = [];
				try { let d = dir; for (const p of ['localisation', 'english']) d = await d.getDirectoryHandle(p); await FB.fsutil.walk(d, '', lf, 0, (n) => LOC_RE.test(n)); } catch (e) { /* no loc */ }
				for (const f of lf.slice(0, 80)) FB.importer.parseLoc(await FB.fsutil.readText(f.handle), gameLoc);
				gameCache = { game, loc: gameLoc };
			}
		} catch (e) { /* game not available: mod only */ }
		const mod = {};
		if (FB.ws.active) Object.entries(FB.ws.files).forEach(([p, f]) => { if (p.startsWith(ORG_DIR)) mod[p] = f.text; });
		M.build(game, gameLoc, mod, FB.ws.active ? FB.ws.loc : {});
		M.sig = sig(); M.loading = false;
		const nGame = M.list.filter((o) => o.src === 'game').length, nMod = M.list.length - nGame;
		M.status = `${M.list.length} organizations · ${nMod} from your mod · ${nGame} from the base game` + (FB.server && FB.server.active ? '' : ' (start Elmo tool with the helper to see the base game too)');
		FB.emit('mios');
		redraw();
	};

	/** Copies a base-game organization's file into the mod (same path, so it replaces the game file) to edit it. */
	M.copyToMod = async function (org) {
		const ws = FB.ws;
		if (!ws.active || org.src !== 'game' || M.gameTexts[org.file] == null) return null;
		const text = M.gameTexts[org.file];
		const others = M.parseFile(text, org.file, 'game', {}).length - 1;
		if (FB.dev && !confirm(`Copy ${org.file.replace(ORG_DIR, '')} into ${ws.name}?\n\nThe mod's copy replaces the game's file, so ${others ? 'its ' + others + ' other organization' + (others === 1 ? '' : 's') + ' come along unchanged and ' : ''}your edits to ${org.name} apply in game.`)) return null;
		await FB.fsutil.writeText(ws.dir, org.file, text);
		ws.files[org.file] = { handle: null, text };
		FB.importer.parseMioFile(text, org.file).forEach((t) => { t.key = org.file + '#' + t.index; if (!ws.treeOf(t.key)) ws.trees.push(t); });
		FB.emit('ws');
		await M.load(true);
		return org.file + '#' + org.index;
	};

	/* ---------- the organization screen, drawn like the game's ---------- */

	const CW = 84, CH = 84, R = 27, HEAD = 34;
	/**
	 * The trait tree of an organization. opts: { order: Map(token -> number), selected: token, onClick(trait) }.
	 * Circles with the trait icons on the game's grid, the parent lines between them, the column headers on top.
	 */
	M.treeView = function (org, opts) {
		opts = opts || {};
		const traits = M.traitsOf(org).filter((t) => !t.initial);
		const wrap = h('div', { class: 'mio-tree' });
		if (!traits.length) { wrap.appendChild(h('div', { class: 'tp-empty' }, 'No traits in this organization.')); return wrap; }
		const minX = Math.min(...traits.map((t) => t.x)), minY = Math.min(...traits.map((t) => t.y));
		const maxX = Math.max(...traits.map((t) => t.x)), maxY = Math.max(...traits.map((t) => t.y));
		const W = (maxX - minX + 1) * CW, H = (maxY - minY + 1) * CH + HEAD;
		const cx = (t) => (t.x - minX) * CW + CW / 2, cy = (t) => (t.y - minY) * CH + CH / 2 + HEAD;
		const by = new Map(traits.map((t) => [t.token, t]));
		const NS = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'mio-lines');
		const line = (d, cls) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', cls); svg.appendChild(p); };
		traits.forEach((t) => t.parents.forEach((g) => g.forEach((pt) => {
			const p = by.get(pt);
			if (!p) return;
			const x1 = cx(p), y1 = cy(p) + R, x2 = cx(t), y2 = cy(t) - R, my = y1 + Math.max(8, (y2 - y1) / 2);
			line(y2 > y1 ? `M${x1},${y1} V${my} H${x2} V${y2}` : `M${x1},${cy(p)} H${x2}`, 'mio-ln' + (g.length > 1 ? ' any' : '') + (opts.order && opts.order.has(pt) && opts.order.has(t.token) ? ' on' : ''));
		})));
		const seenEx = new Set();
		traits.forEach((t) => t.excl.forEach((o) => {
			const p = by.get(o), k = [t.token, o].sort().join('|');
			if (!p || seenEx.has(k)) return;
			seenEx.add(k);
			line(`M${cx(t)},${cy(t)} L${cx(p)},${cy(p)}`, 'mio-ln ex');
		}));
		const area = h('div', { class: 'mio-area', style: { width: W + 'px', height: H + 'px' } }, svg);
		const head = h('div', { class: 'mio-headbar', style: { width: W + 'px' } });
		M.headersOf(org).forEach((hd) => head.appendChild(h('span', { style: { left: ((hd.x - minX) * CW + CW / 2) + 'px' } }, hd.text)));
		area.appendChild(head);
		traits.forEach((t) => {
			const n = opts.order ? opts.order.get(t.token) : null;
			const b = h('button', { class: 'mio-node' + (t.special ? ' special' : '') + (n ? ' taken' : '') + (opts.selected === t.token ? ' sel' : ''), style: { left: (cx(t) - R) + 'px', top: (cy(t) - R) + 'px' },
				title: t.name + (M.bonusText(t) ? '\n' + M.bonusText(t) : '') + (t.parents.length ? '\nNeeds: ' + t.parents.map((g) => g.map((x) => (by.get(x) || {}).name || x).join(' or ')).join(' and ') : '') + (t.excl.length ? '\nNot together with: ' + t.excl.map((x) => (by.get(x) || {}).name || x).join(', ') : ''),
				onclick: () => { if (opts.onClick) opts.onClick(t); } },
			t.icon && FB.gfx ? FB.gfx.picture(t.icon, 'mio-node-img') : h('span', { class: 'mio-node-txt' }, t.name.slice(0, 2)),
			n ? h('span', { class: 'mio-badge' }, n) : null);
			area.appendChild(b);
		});
		wrap.appendChild(area);
		return wrap;
	};

	const srcBadge = (o) => h('span', { class: 'mio-src ' + o.src, title: o.src === 'mod' ? 'In your mod: ' + o.file : 'Base game: ' + o.file }, o.src === 'mod' ? 'mod' : 'game');
	/** Bonus lines like the game's "Trait bonuses" list. */
	const bonusList = (t) => h('ul', { class: 'mio-bonus' }, M.bonusText(t).split(', ').filter(Boolean).map((b) => h('li', { class: /^-/.test(b) === /cost|time|consumption|weight|requirement|visibility/.test(b) ? 'good' : 'bad' }, b)));   // less cost is good, less attack is bad

	function orgScreen(o) {
		const dev = FB.dev && FB.dev.on, ws = FB.ws;
		const all = M.traitsOf(o), init = all.filter((t) => t.initial);
		const sel = all.find((t) => t.token === UI.sel && !t.initial) || null;
		const act = [];
		if (o.src === 'mod' && ws.treeOf(o.treeKey)) act.push(h('button', { class: 'mio-btn gold', onclick: () => { ws.switchTo(o.treeKey); FB.modes.set('trees'); } }, FB.icon(dev ? 'wrench' : 'eye', 14), dev ? 'Edit in the editor' : 'Open in the editor'));
		if (o.src === 'game') act.push(h('button', { class: 'mio-btn gold', disabled: !dev || !ws.active, title: !ws.active ? 'Open your mod first (Trees tab)' : !dev ? 'Switch to Development mode to change the mod' : 'Copies the game file into your mod so you can change it',
			onclick: async () => { try { const k = await M.copyToMod(o); if (k) { FB.toast(`${o.name} is now in your mod. Edit it, then Save to mod.`, 'ok'); ws.switchTo(k); FB.modes.set('trees'); } } catch (e) { FB.toast('Could not copy: ' + (e.message || e), 'warn'); } } },
		FB.icon('copy', 14), 'Copy into my mod to edit'));
		if (FB.guides && FB.guides.addMio) act.push(h('button', { class: 'mio-btn', onclick: () => chooseGuide(o) }, FB.icon('scroll', 14), 'Add to a guide…'));
		const side = h('aside', { class: 'mio-side' },
			h('div', { class: 'mio-title' }, M.logo(M.iconOf(o), 72), h('div', {}, h('h3', {}, o.name), h('div', { class: 'mio-sub' }, o.tags.length ? o.tags.map((t) => natName(t)).join(', ') : o.archetype ? 'Template for other organizations' : 'Any nation'), srcBadge(o))),
			o.equipment.length ? h('div', { class: 'mio-eq' }, FB.icon('shield', 13), o.equipment.map((e) => e.replace(/^mio_cat_eq_(all_)?/, '').replace(/_/g, ' ')).join(', ')) : null,
			h('div', { class: 'mio-sec' }, 'Initial traits'),
			init.length ? init.map((t) => h('div', { class: 'mio-init' }, h('b', {}, t.name), bonusList(t))) : h('div', { class: 'mio-none' }, 'None'),
			h('div', { class: 'mio-sec' }, sel ? 'Selected trait' : 'Trait'),
			sel ? h('div', { class: 'mio-init' }, h('div', { class: 'mio-selh' }, h('span', { class: 'mio-node small' + (sel.special ? ' special' : '') }, sel.icon && FB.gfx ? FB.gfx.picture(sel.icon, 'mio-node-img') : null), h('b', {}, sel.name)),
				bonusList(sel), sel.limit ? h('div', { class: 'mio-none' }, 'Only for ' + sel.limit.replace(/_/g, ' ')) : null,
				sel.parents.length ? h('div', { class: 'mio-none' }, 'Needs ' + sel.parents.map((g) => g.map((x) => (all.find((y) => y.token === x) || {}).name || x).join(' or ')).join(' and ')) : null,
				h('code', { class: 'mio-tok' }, sel.token + (sel.from ? ' · from ' + sel.from : ''))) : h('div', { class: 'mio-none' }, 'Click a trait to see what it gives.'),
			h('div', { class: 'mio-acts' }, act),
			h('div', { class: 'mio-file' }, o.file.replace(ORG_DIR, ''), o.include ? ' · includes ' + o.include + (M.byId(o.include) ? '' : ' (not found)') : ''));
		const tree = M.treeView(o, { selected: UI.sel, onClick: (t) => { UI.sel = UI.sel === t.token ? '' : t.token; render(); } });
		return h('div', { class: 'mio-screen' }, side,
			h('div', { class: 'mio-main' }, h('div', { class: 'mio-tabs' }, h('span', { class: 'on' }, 'Traits'), h('span', { class: 'mio-count' }, all.filter((t) => !t.initial).length + ' traits')), tree));
	}

	/* ---------- list ---------- */

	function listCol() {
		const col = h('aside', { class: 'tp-list mio-list' });
		const lst = h('div');
		const draw = () => {
			lst.innerHTML = '';
			const q = UI.q;
			const hit = (o) => !q || (o.name + ' ' + o.id + ' ' + o.tags.join(' ') + ' ' + o.tags.map(natName).join(' ') + ' ' + o.equipment.join(' ')).toLowerCase().includes(q);
			const groups = new Map();
			M.list.filter(hit).forEach((o) => { const k = o.tags.length ? o.tags[0] : o.archetype ? '~arch' : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); });
			const rank = (k) => (k === '~arch' ? 2 : k ? 0 : 1);
			const keys = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || natName(a).localeCompare(natName(b)));
			keys.forEach((k) => {
				lst.appendChild(h('div', { class: 'mio-nat' }, k === '~arch' ? h('b', {}, 'Templates (not given to a nation)') : k ? h('b', {}, natName(k)) : h('b', {}, 'Generic (any nation)'), k && k !== '~arch' ? h('span', { class: 'gd-nattag' }, k) : null));
				groups.get(k).forEach((o) => lst.appendChild(h('button', { class: 'tp-item mio-item' + (o.key === UI.cur ? ' on' : ''), onclick: () => { UI.cur = o.key; UI.sel = ''; render(); } },
					M.logo(M.iconOf(o), 36),
					h('span', { class: 'mio-item-t' }, h('b', {}, o.name), h('small', {}, [M.traitsOf(o).filter((t) => !t.initial).length + ' traits', o.equipment[0] ? o.equipment[0].replace(/^mio_cat_eq_(all_)?/, '').replace(/_/g, ' ') : '', o.tags.length > 1 ? 'also ' + o.tags.slice(1).join(', ') : ''].filter(Boolean).join(' · '))),
					srcBadge(o))));
			});
			if (!M.list.length) lst.appendChild(h('div', { class: 'tp-empty' }, M.loading ? 'Reading organizations…' : 'No organizations yet. Open your mod in the Trees tab; with the helper running the base game’s organizations are shown too.'));
			else if (!keys.length) lst.appendChild(h('div', { class: 'tp-empty' }, 'Nothing matches.'));
		};
		col.append(h('input', { type: 'search', value: UI.q, placeholder: 'Search a nation, company or equipment…', oninput: (e) => { UI.q = e.target.value.toLowerCase().trim(); draw(); } }), lst);
		draw();
		return col;
	}

	function chooseGuide(o) {
		const list = FB.guides.list();
		const close = FB.ui.modal('Add ' + o.name + ' to a guide', h('div', { class: 'gd-natpick' },
			h('p', { class: 'muted' }, 'The guide gets a MIO section where you click the traits in the order to take them and write why.'),
			h('div', { class: 'gd-natlist' },
				list.map((g) => h('button', { class: 'gd-nat', onclick: () => { close(); FB.guides.addMio(g.id, o); } }, h('b', {}, g.title || '(untitled)'), g.tag ? h('span', { class: 'gd-nattag' }, g.tag) : null,
					g.tag && o.tags.length && !o.tags.includes(g.tag) ? h('small', {}, 'other nation') : null)),
				h('button', { class: 'gd-nat', onclick: () => { close(); FB.guides.addMio('', o); } }, h('b', {}, '+ New guide for ' + (o.tags[0] ? natName(o.tags[0]) : 'this company'))))));
	}

	function redraw() { if (body && FB.modes.current === 'mios') render(); }
	function render() {
		if (!body) return;
		const keepScroll = body.querySelector('.mio-list > div');
		const st = keepScroll ? keepScroll.parentNode.scrollTop : 0;
		body.innerHTML = '';
		const frame = h('div', { class: 'dzf-frame' });
		frame.appendChild(h('div', { class: 'dzf-title' },
			h('h2', {}, 'MIO Companies'),
			h('div', { class: 'dzf-status' }, h('span', {}, M.status), h('button', { class: 'dzf-btn', onclick: () => M.load('game') }, FB.icon('undo', 14), 'Reload'))));
		const o = M.list.find((x) => x.key === UI.cur) || null;
		const list = listCol();
		frame.appendChild(h('div', { class: 'tp-main mio-wrap' }, list,
			o ? orgScreen(o) : h('section', { class: 'tp-edit' }, h('div', { class: 'dz-empty' }, h('h3', {}, 'Military Industrial Organizations'), h('p', {}, 'Pick a company on the left to see its traits like in the game, change it, or add the order to click its traits to a guide.')))));
		body.appendChild(frame);
		list.scrollTop = st;
	}

	M.init = function () {
		root = h('section', { id: 'mios' }, h('div', { id: 'mio-body' }));
		body = root.firstChild;
		FB.modes.register('mios', 'MIOs', 'factory', root, { open() { render(); M.load(false); if (FB.gfx && !FB.gfx.ready && FB.server.active && FB.gfx.load) FB.gfx.load().then((ok) => { if (ok) redraw(); }); }, close() {} });
		FB.on('ws', () => { if (FB.modes.current === 'mios' || FB.modes.current === 'guides') M.load(false); });
		FB.on('devmode', redraw);
	};
	M.render = redraw;
})(window.FB = window.FB || {});
