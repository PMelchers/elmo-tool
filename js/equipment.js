/* Focus Builder - equipment data (tank chassis, ship hulls, aircraft airframes + modules) and the stat calculator.
 * Reads the real definitions from the base game and the open mod, so mods with changed numbers just work.
 *
 * How stats are combined (reconstructed from the game's data files, see common/units/equipment):
 *   value = (chassis base + sum(module add_stats) * (1 + chassis module_add_stats_multiplier)
 *            + average(module add_average_stats)) * (1 + sum(module multiply_stats))
 * It is an estimate: the game may round or clamp some values differently. */
(function (FB) {
	'use strict';
	const E = FB.equip = { data: null, status: '' };
	const isBlock = (e) => Array.isArray(e.v);
	const sv = (e) => (e && typeof e.v === 'string' ? e.v : null);
	const numv = (s) => { if (s == null || s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
	const find = (en, k) => en.find((e) => e.k === k);
	const prettyKey = (k) => { const s = String(k).replace(/_/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
	function statMap(block) {
		const m = {};
		(block || []).forEach((e) => { const n = typeof e.v === 'string' ? numv(e.v) : null; if (n != null) m[e.k] = (m[e.k] || 0) + n; });
		return m;
	}

	/** Display names, units and whether lower is better. Unknown stats are shown with a prettified name. */
	E.STAT = {
		soft_attack: ['Soft attack'], hard_attack: ['Hard attack'], ap_attack: ['Piercing'], air_attack: ['Air attack'],
		armor_value: ['Armor'], hardness: ['Hardness', { pct: true }], defense: ['Defense'], breakthrough: ['Breakthrough'],
		maximum_speed: ['Max Speed', { unit: 'km/h' }], reliability: ['Reliability', { pct: true }],
		build_cost_ic: ['IC cost', { low: true }], fuel_consumption: ['Fuel Usage', { low: true }], lend_lease_cost: ['Convoy cost', { low: true }],
		supply_consumption: ['Supply use', { low: true }], manpower: ['Manpower', { low: true }],
		naval_speed: ['Speed', { unit: 'kn' }], naval_range: ['Max Range', { unit: 'nmi' }], max_strength: ['HP'],
		lg_attack: ['Light Attack'], hg_attack: ['Heavy Attack'], torpedo_attack: ['Torpedo attack'], anti_air_attack: ['Anti-air'],
		shore_bombardment: ['Shore bombardment'], lg_armor_piercing: ['Light Piercing'], hg_armor_piercing: ['Heavy Piercing'],
		surface_detection: ['Surface detection'], sub_detection: ['Sub detection'], surface_visibility: ['Surface Visibility', { low: true }],
		sub_visibility: ['Sub Visibility', { low: true }], depth_charge_attack: ['Depth charges'], sub_attack: ['Depth charges'],
		recon: ['Reconnaissance'], fuel_capacity: ['Fuel Capacity'], entrenchment: ['Entrenchment'], suppression: ['Suppression'], mines_planting: ['Minelaying'], mines_sweeping: ['Minesweeping'],
		naval_weather_penalty_factor: ['Weather Penalty', { pct: true }], naval_supremacy_factor: ['Naval supremacy'],
		air_range: ['Air range', { unit: 'km' }], air_agility: ['Agility'], air_defence: ['Air defence'], air_ground_attack: ['Ground attack'],
		air_bombing: ['Bombing'], air_vision: ['Air vision'], weight: ['Weight', { low: true }], carrier_size: ['Carrier size', { low: true }],
		engine_power: ['Engine power'], max_organisation: ['Organization']
	};
	E.statName = (k) => (E.STAT[k] ? E.STAT[k][0] : prettyKey(k));
	E.statOpt = (k) => (E.STAT[k] && E.STAT[k][1]) || {};
	const ORDER = ['soft_attack', 'hard_attack', 'ap_attack', 'armor_value', 'hardness', 'defense', 'breakthrough', 'maximum_speed', 'reliability',
		'lg_attack', 'hg_attack', 'torpedo_attack', 'anti_air_attack', 'shore_bombardment', 'lg_armor_piercing', 'hg_armor_piercing', 'armor_value',
		'naval_speed', 'naval_range', 'surface_detection', 'sub_detection', 'surface_visibility', 'sub_visibility', 'max_strength',
		'air_attack', 'air_defence', 'air_agility', 'air_range', 'air_bombing', 'air_ground_attack', 'build_cost_ic', 'fuel_consumption', 'supply_consumption'];

	/* ---------- reading the files ---------- */
	async function readSource(src, eq, mods, loc, say) {
		const U = FB.fsutil;
		let base;
		try { base = await (await (await src.dir.getDirectoryHandle('common')).getDirectoryHandle('units')).getDirectoryHandle('equipment'); }
		catch (e) { base = null; }
		if (base) {
			const files = [];
			await U.walk(base, '', files, 0, (n) => /\.txt$/i.test(n));
			let i = 0;
			for (const f of files) {
				say(`Reading ${src.label}: equipment ${++i}/${files.length}`);
				const entries = FB.importer.parse(await U.readText(f.handle));
				entries.forEach((top) => {
					if (!isBlock(top)) return;
					if (top.k === 'equipments') top.v.forEach((e) => { if (isBlock(e)) eq.set(e.k, { key: e.k, entries: e.v, source: src.label }); });
					else if (top.k === 'equipment_modules') top.v.forEach((e) => { if (e.k !== 'limit' && isBlock(e)) mods.set(e.k, { key: e.k, entries: e.v, source: src.label }); });
					else if (top.k === 'upgrades') top.v.forEach((e) => { if (isBlock(e)) UPS.set(e.k, { key: e.k, entries: e.v, source: src.label }); });
				});
			}
		}
		if (src.loc) Object.assign(loc, src.loc);
		else {
			try {
				const ld = await (await src.dir.getDirectoryHandle('localisation')).getDirectoryHandle('english');
				const lf = [];
				await U.walk(ld, '', lf, 0, (n) => /\.ya?ml$/i.test(n) && /module|equipment|unit|ship|tank|plane|air|naval/i.test(n));
				for (const f of lf.slice(0, 60)) FB.importer.parseLoc(await U.readText(f.handle), loc);
			} catch (e) { /* no localisation */ }
		}
	}

	/** sources: [{label, dir, loc?}] in load order; later ones override earlier ones (mods override the base game). */
	const UPS = new Map();
	/** Equipment upgrades (the engine / armor "clicks" of tanks): max level, flat stats per level and percentages per level. */
	function buildUpgrades() {
		const out = {}, skip = new Set(['max_level', 'cost', 'abbreviation', 'linear_cost', 'level_requirements', 'resource_cost_thresholds', 'add_stats', 'multiply_stats']);
		UPS.forEach((u, k) => {
			const en = u.entries, g = (x) => find(en, x);
			const mult = {};
			en.forEach((e) => { if (!skip.has(e.k) && typeof e.v === 'string') { const n = numv(e.v); if (n != null) mult[e.k] = n; } });
			const ms = g('multiply_stats'); if (ms && isBlock(ms)) Object.assign(mult, statMap(ms.v));
			const req = {}; const lr = g('level_requirements');
			const techs = (list, acc) => { list.forEach((x) => { if (x.k === 'has_tech' && typeof x.v === 'string') acc.push(x.v); else if (isBlock(x)) techs(x.v, acc); }); return acc; };
			if (lr && isBlock(lr)) lr.v.forEach((e) => { if (isBlock(e)) { const t = techs(e.v, []); if (t.length) req[e.k] = t.join(' or '); } });
			out[k] = { key: k, abbr: sv(g('abbreviation')) || '', max: numv(sv(g('max_level'))) || 0, add: statMap(g('add_stats') && g('add_stats').v), mult, req, source: u.source };
		});
		return out;
	}

	E.load = async function (sources, onProgress) {
		const say = onProgress || (() => {});
		UPS.clear();
		const eq = new Map(), mods = new Map(), loc = {};
		for (const s of sources) await readSource(s, eq, mods, loc, say);
		E.data = build(eq, mods, loc, sources.map((s) => s.label));
		E.data.upgrades = buildUpgrades();
		E.loadCustom(); E.applyCustom();
		E.status = '';
		return E.data;
	};

	function parseEq(e) {
		const en = e.entries;
		const o = { key: e.key, source: e.source, archetype: sv(find(en, 'archetype')), parent: sv(find(en, 'parent')), stats: {}, slots: null, defaults: null, limits: [], moduleMult: null, resources: {} };
		const t = find(en, 'type');
		o.type = t ? (sv(t) || (isBlock(t) && t.v[0] ? t.v[0].k : '')) : '';
		o.isArchetype = sv(find(en, 'is_archetype')) === 'yes';
		const upl = find(en, 'upgrades');
		o.upgrades = upl && isBlock(upl) ? upl.v.map((x) => x.k) : null;
		o.year = numv(sv(find(en, 'year')));
		o.abbr = sv(find(en, 'abbreviation'));
		const NON_STAT = new Set(['year', 'priority', 'visual_level', 'group_by', 'max_stack']);
		en.forEach((x) => { if (typeof x.v === 'string' && !NON_STAT.has(x.k)) { const n = numv(x.v); if (n != null) o.stats[x.k] = n; } });
		const ms = find(en, 'module_slots');
		if (ms && isBlock(ms)) {
			o.slots = ms.v.filter((s) => s.k).map((s) => {
				if (isBlock(s)) {
					const cats = find(s.v, 'allowed_module_categories');
					return { name: s.k, required: sv(find(s.v, 'required')) === 'yes', cats: cats && isBlock(cats) ? cats.v.map((c) => c.k) : [] };
				}
				return { name: s.k, alias: s.v };
			});
		} else if (sv(ms) === 'inherit') o.slots = 'inherit';
		const dm = find(en, 'default_modules');
		if (dm && isBlock(dm)) { o.defaults = {}; dm.v.forEach((d) => { if (typeof d.v === 'string') o.defaults[d.k] = d.v; }); }
		en.filter((x) => x.k === 'module_count_limit' && isBlock(x)).forEach((l) => {
			const lim = { modules: [], categories: [], op: '<', n: 99 };
			l.v.forEach((x) => {
				if (x.k === 'module') lim.modules.push(x.v);
				else if (x.k === 'category') lim.categories.push(x.v);
				else if (x.k === 'count' && numv(x.v) != null) { lim.op = x.op || '='; lim.n = numv(x.v); }
			});
			o.limits.push(lim);
		});
		const mm = find(en, 'module_add_stats_multiplier');
		if (mm && isBlock(mm)) o.moduleMult = statMap(mm.v);
		const rs = find(en, 'resources');
		if (rs && isBlock(rs)) o.resources = statMap(rs.v);
		return o;
	}

	function domainOf(arch) {
		const k = arch.key, t = arch.type || '';
		if (/airframe|plane/i.test(k)) return null; // aircraft are not supported
		if (/ship_hull|^ship_|submarine|carrier/i.test(k) || /ship|submarine|carrier/.test(t)) return 'naval';
		if (t === 'armor' || /tank/.test(k)) return 'land';
		return null;
	}

	function build(eq, mods, loc, sources) {
		const M = {};
		mods.forEach((m, k) => {
			const en = m.entries, g = (x) => find(en, x);
			M[k] = { key: k, category: sv(g('category')), gfx: sv(g('gfx')), abbr: sv(g('abbreviation')), add: statMap(g('add_stats') && g('add_stats').v), mult: statMap(g('multiply_stats') && g('multiply_stats').v),
				avg: statMap(g('add_average_stats') && g('add_average_stats').v), xp: numv(sv(g('xp_cost'))), parent: sv(g('parent')), source: m.source,
				grants: (() => { const a = g('allowed_module_categories'), o = {}; if (a && isBlock(a)) a.v.forEach((e) => { if (isBlock(e)) o[e.k] = e.v.map((x) => x.k); }); return o; })() };
		});
		const raw = {};
		eq.forEach((e, k) => { raw[k] = parseEq(e); });
		const name = (k) => loc[k] || prettyKey(k);
		/* A slot can say `inherit` (take the definition of that slot from the parent / archetype) or point at another slot. */
		const memo = {};
		const resolveSlots = (slots, fromParent) => {
			const byName = {};
			slots.forEach((s) => { if (!s.alias) byName[s.name] = s; });
			return slots.map((s) => {
				if (!s.alias) return s;
				if (s.alias === 'inherit') { const src = (fromParent || []).find((x) => x.name === s.name); return { name: s.name, required: src ? src.required : false, cats: src ? src.cats.slice() : [] }; }
				const t = byName[s.alias];
				return { name: s.name, required: t ? t.required : false, cats: t ? t.cats.slice() : [] };
			});
		};
		const slotsFor = (o) => {
			if (memo[o.key]) return memo[o.key];
			memo[o.key] = [];
			const par = o.parent && raw[o.parent] && raw[o.parent] !== o ? raw[o.parent] : null;
			const arch = o.archetype && raw[o.archetype] && raw[o.archetype] !== o ? raw[o.archetype] : null;
			const up = par ? slotsFor(par) : arch ? slotsFor(arch) : [];
			if (Array.isArray(o.slots)) memo[o.key] = resolveSlots(o.slots, up.length ? up : arch ? slotsFor(arch) : []);
			else if (o.slots === 'inherit') memo[o.key] = up.length ? up : arch ? slotsFor(arch) : [];
			return memo[o.key];
		};
		const variants = {}, groups = { land: [], naval: [] };
		const hasBlock = (o) => Array.isArray(o.slots);
		const archs = Object.values(raw).filter((o) => hasBlock(o) && (!o.archetype || o.isArchetype));
		const fam = new Map(); // archetype key -> { dom, variants }
		const family = (key, dom) => { if (!fam.has(key)) fam.set(key, { dom, variants: [] }); return fam.get(key); };
		const nationOf = (k) => { const m = /^([A-Za-z]{3})_/.exec(k); return m ? m[1].toUpperCase() : ''; };
		const mkVariant = (v, a, slots, limits, dom) => {
			const chain = []; let cur = v, guard = 0;
			while (cur && guard++ < 20) { chain.unshift(cur); cur = cur.parent ? raw[cur.parent] : null; }
			const stats = Object.assign({}, a ? a.stats : {});
			chain.forEach((c) => Object.assign(stats, c.stats));
			let mm = null;
			for (let i = chain.length - 1; i >= 0 && !mm; i--) if (chain[i].moduleMult) mm = chain[i].moduleMult;
			let upgrades = null;
			for (let i = chain.length - 1; i >= 0 && !upgrades; i--) if (chain[i].upgrades) upgrades = chain[i].upgrades;
			if (!upgrades && a && a.upgrades) upgrades = a.upgrades;
			const defaults = Object.assign({}, a ? a.defaults : {});
			chain.forEach((c) => { if (c.defaults) Object.assign(defaults, c.defaults); });
			return { key: v.key, name: name(v.key), year: v.year || (a && a.year) || 0, archetype: v.archetype || (a && a.key) || v.key, domain: dom, slots, stats,
				moduleMult: mm || (a && a.moduleMult) || {}, defaults, limits, resources: Object.assign({}, a ? a.resources : {}, v.resources), source: v.source, nation: nationOf(v.key), upgrades: upgrades || [] };
		};
		// generic chassis: variants that inherit the slots of their archetype
		archs.forEach((a) => {
			const dom = domainOf(a);
			if (!dom) return;
			Object.values(raw).filter((o) => o.archetype === a.key && o.slots === 'inherit').forEach((v) => family(a.key, dom).variants.push(mkVariant(v, a, slotsFor(v), a.limits, dom)));
		});
		// nation-specific (and other) chassis that bring their own module slots
		Object.values(raw).filter((o) => hasBlock(o) && o.archetype && !o.isArchetype).forEach((v) => {
			const a = raw[v.archetype] || null;
			const dom = domainOf(a || v);
			if (!dom) return;
			family(v.archetype, dom).variants.push(mkVariant(v, a, slotsFor(v), v.limits.concat(a ? a.limits : []), dom));
		});
		fam.forEach((f, key) => {
			if (!f.variants.length) return;
			f.variants.sort((x, y) => x.year - y.year || x.key.localeCompare(y.key));
			f.variants.forEach((v) => { variants[v.key] = v; });
			groups[f.dom].push({ key, name: name(key), type: raw[key] ? raw[key].type : '', variants: f.variants });
		});
		Object.values(groups).forEach((g) => g.sort((x, y) => x.name.localeCompare(y.name)));
		Object.values(M).forEach((m) => { m.orig = { add: Object.assign({}, m.add), mult: Object.assign({}, m.mult), avg: Object.assign({}, m.avg) }; });
		return { groups, variants, modules: M, loc, name, sources, count: { land: groups.land.length, naval: groups.naval.length, modules: Object.keys(M).length } };
	}

	/* ---------- queries ---------- */
	/** Categories a slot accepts: its own, plus the ones unlocked by modules in other slots (a turret unlocks bigger guns). */
	E.effectiveCats = (variant, slot, sel) => {
		const d = E.data, set = new Set(slot.cats);
		if (!d || !sel) return set;
		variant.slots.forEach((s) => {
			if (s.name === slot.name) return;
			const m = sel[s.name] && d.modules[sel[s.name]];
			if (m && m.grants && m.grants[slot.name]) m.grants[slot.name].forEach((c) => set.add(c));
		});
		return set;
	};
	/** Clears modules that no longer fit after another slot changed (e.g. a big gun after swapping the turret). */
	E.normalize = (variant, sel) => {
		const d = E.data;
		if (!d) return sel;
		for (let pass = 0; pass < 6; pass++) {
			let changed = false;
			variant.slots.forEach((s) => {
				const m = sel[s.name] && d.modules[sel[s.name]];
				if (m && !E.effectiveCats(variant, s, sel).has(m.category)) { sel[s.name] = null; changed = true; }
			});
			if (!changed) break;
		}
		return sel;
	};
	E.modulesFor = (variant, slot, sel) => {
		const d = E.data; if (!d) return [];
		const cats = E.effectiveCats(variant, slot, sel);
		return Object.values(d.modules).filter((m) => cats.has(m.category)).sort((a, b) => d.name(a.key).localeCompare(d.name(b.key)));
	};
	/** Modules that would fit a slot if another slot held the right module (e.g. a heavy gun needs a heavy turret).
	 *  Returns [{ module, via: { slot, module } }]: `via` is the module to put in the other slot to unlock it. */
	E.lockedModules = (variant, slot, sel) => {
		const d = E.data;
		if (!d) return [];
		const eff = E.effectiveCats(variant, slot, sel);
		const all = Object.values(d.modules).sort((a, b) => a.key.localeCompare(b.key));
		const out = [], seen = new Set();
		variant.slots.forEach((s2) => {
			if (s2.name === slot.name) return;
			const cats2 = E.effectiveCats(variant, s2, sel);
			all.forEach((m2) => {
				if (!cats2.has(m2.category) || !m2.grants || !m2.grants[slot.name]) return;
				m2.grants[slot.name].forEach((c) => {
					if (eff.has(c)) return;
					all.forEach((m) => { if (m.category === c && !seen.has(m.key)) { seen.add(m.key); out.push({ module: m, via: { slot: s2.name, module: m2.key } }); } });
				});
			});
		});
		return out;
	};
	E.defaultSelection = (variant) => {
		const sel = {};
		variant.slots.forEach((s) => { const d = variant.defaults[s.name]; sel[s.name] = d && d !== 'empty' ? d : null; });
		return sel;
	};
	E.moduleSummary = (m) => {
		const parts = [];
		Object.entries(m.add).forEach(([k, v]) => { if (k !== 'build_cost_ic') parts.push(`${v > 0 ? '+' : ''}${+v.toFixed(2)} ${E.statName(k)}`); });
		Object.entries(m.mult).forEach(([k, v]) => { parts.push(`${v > 0 ? '+' : ''}${Math.round(v * 100)}% ${E.statName(k)}`); });
		return parts.slice(0, 5).join(', ');
	};

	/** Rule checks: required slots, count limits, module in an allowed category. */
	E.problems = (variant, sel) => {
		const d = E.data, out = [];
		variant.slots.forEach((s) => {
			const m = sel[s.name] && d.modules[sel[s.name]];
			if (s.required && !m) out.push({ slot: s.name, text: `${prettyKey(s.name)} is required` });
			if (m && !E.effectiveCats(variant, s, sel).has(m.category)) out.push({ slot: s.name, text: `${d.name(m.key)} does not fit ${prettyKey(s.name)}` });
		});
		variant.limits.forEach((l) => {
			let n = 0;
			variant.slots.forEach((s) => {
				const k = sel[s.name], m = k && d.modules[k];
				const hit = (l.modules.includes('any') || l.categories.includes('any')) ? true
					: m ? (l.modules.includes(m.key) || l.categories.includes(m.category)) : l.modules.includes('empty');
				if (hit) n++;
			});
			const bad = l.op === '<' ? n >= l.n : l.op === '<=' ? n > l.n : l.op === '>' ? n <= l.n : l.op === '>=' ? n < l.n : n !== l.n;
			if (bad) out.push({ slot: null, text: `Too many/few ${(l.modules.concat(l.categories)).map((x) => d.name(x)).join(' / ') || 'modules'} (${n}; allowed ${l.op} ${l.n})` });
		});
		return out;
	};

	/** Combines chassis and modules. Returns {stats: {key: {value, base, add, avg, mult}}, keys: [...]}. */
	E.calc = (variant, sel, ups) => {
		const d = E.data;
		const adds = {}, mult = {}, avgS = {}, avgN = {}, upAdd = {};
		const bump = (o, k, v) => { o[k] = (o[k] || 0) + v; };
		// equipment upgrades: [{up, level}]; flat stats per level are added to the base, percentages per level to the multiplier
		(ups || []).forEach(({ up, level }) => {
			if (!up || !level) return;
			Object.entries(up.add).forEach(([k, v]) => bump(upAdd, k, v * level));
			Object.entries(up.mult).forEach(([k, v]) => bump(mult, k, v * level));
		});
		variant.slots.forEach((s) => {
			const m = sel[s.name] && d.modules[sel[s.name]];
			if (!m) return;
			Object.entries(m.add).forEach(([k, v]) => bump(adds, k, v));
			Object.entries(m.mult).forEach(([k, v]) => bump(mult, k, v));
			Object.entries(m.avg).forEach(([k, v]) => { bump(avgS, k, v); bump(avgN, k, 1); });
		});
		const keys = new Set([...Object.keys(variant.stats), ...Object.keys(adds), ...Object.keys(mult), ...Object.keys(avgS), ...Object.keys(upAdd)]);
		const stats = {};
		keys.forEach((k) => {
			const base = variant.stats[k] || 0;
			const add = (adds[k] || 0) * (1 + (variant.moduleMult[k] || 0)) + (upAdd[k] || 0);
			const avg = avgN[k] ? avgS[k] / avgN[k] : 0;
			const mu = mult[k] || 0;
			stats[k] = { base, add, avg, mult: mu, value: (base + add + avg) * (1 + mu) };
		});
		const ordered = [...ORDER.filter((k, i) => ORDER.indexOf(k) === i && stats[k]), ...[...keys].filter((k) => !ORDER.includes(k)).sort()];
		const shown = (k) => E.STAT[k] || adds[k] !== undefined || mult[k] !== undefined || avgS[k] !== undefined;
		return { stats, keys: ordered.filter((k) => shown(k) && (Math.abs(stats[k].value) > 1e-9 || stats[k].base !== 0)) };
	};
	E.fmt = (k, v) => {
		const o = E.statOpt(k);
		if (o.pct) return Math.round(v * 100) + '%';
		const r = Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(2);
		return String(r) + (o.unit ? ' ' + o.unit : '');
	};

	/* ---------- your own module tweaks and named test modules ---------- */
	const CK = 'focusbuilder.custommods.v1';
	E.custom = {};
	E.loadCustom = () => { try { E.custom = JSON.parse(localStorage.getItem(CK) || '{}'); } catch (e) { E.custom = {}; } };
	E.saveCustom = () => { try { localStorage.setItem(CK, JSON.stringify(E.custom)); } catch (e) { /* storage unavailable */ } };
	/** Puts your tweaks (changed stats of real modules) and test modules on top of the loaded game data. */
	E.applyCustom = () => {
		const d = E.data;
		if (!d) return;
		Object.keys(d.modules).forEach((k) => {
			const m = d.modules[k];
			if (m.custom && !E.custom[k]) { delete d.modules[k]; return; }
			if (m.orig) { m.add = Object.assign({}, m.orig.add); m.mult = Object.assign({}, m.orig.mult); m.avg = Object.assign({}, m.orig.avg); delete m.modified; }
		});
		Object.values(E.custom).forEach((c) => {
			const ex = d.modules[c.key];
			if (c.override) {
				if (ex && !ex.custom) { ex.add = Object.assign({}, c.add); ex.mult = Object.assign({}, c.mult); ex.avg = Object.assign({}, c.avg); ex.modified = true; }
			} else {
				d.modules[c.key] = { key: c.key, category: c.category, abbr: c.abbr || 'tst', add: Object.assign({}, c.add), mult: Object.assign({}, c.mult), avg: Object.assign({}, c.avg), custom: true, source: 'Test module' };
				d.loc[c.key] = c.name;
			}
		});
	};
	E.saveModule = (c) => { E.custom[c.key] = c; E.saveCustom(); E.applyCustom(); };
	E.removeModule = (key) => { delete E.custom[key]; E.saveCustom(); E.applyCustom(); };
	E.newTestKey = (name) => {
		const base = 'fb_test_' + (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'module');
		let k = base, n = 2;
		while ((E.data && E.data.modules[k]) || E.custom[k]) k = base + '_' + n++;
		return k;
	};
	/** HOI4 script for a module (for copying into a mod). */
	E.moduleCode = (m, name) => {
		const L = ['equipment_modules = {', `	${m.key} = {`, `		category = ${m.category}`, `		abbreviation = "${m.abbr || 'tst'}"`];
		const block = (n, o) => { const e = Object.entries(o).filter(([, v]) => Number(v) !== 0); if (!e.length) return; L.push(`		${n} = {`); e.forEach(([k, v]) => L.push(`			${k} = ${+Number(v).toFixed(4)}`)); L.push('		}'); };
		block('add_stats', m.add); block('multiply_stats', m.mult); block('add_average_stats', m.avg);
		L.push('	}', '}');
		const text = L.join('\n');
		if (!name) return text;
		return text + '\n\n# localisation (put in a .yml file)\n ' + m.key + ':0 "' + String(name).split('"').join("'") + '"';
	};
})(window.FB = window.FB || {});
