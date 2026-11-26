/* Focus Builder - import existing HOI4 focus trees (Paradox script) and localisation.
 * Anything the catalogue does not understand is kept as raw code, so nothing is lost. */
(function (FB) {
	'use strict';

	/* ---------- tokenizer + parser (Paradox script) ---------- */
	function tokenize(src) {
		const t = [];
		let i = 0;
		const n = src.length;
		const push = (o, st, en) => { o.s = st; o.e = en; t.push(o); };
		while (i < n) {
			const c = src[i];
			if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
			if (/\s/.test(c) || c.charCodeAt(0) === 0xFEFF) { i++; continue; }
			if (c === '{' || c === '}') { push({ t: c }, i, i + 1); i++; continue; }
			if (c === '"') {
				let j = i + 1, s = '';
				while (j < n && src[j] !== '"') { if (src.charCodeAt(j) === 92 && j + 1 < n) { s += src[j] + src[j + 1]; j += 2; } else s += src[j++]; }
				push({ t: 'w', v: s, q: true }, i, j + 1); i = j + 1; continue;
			}
			const op = /^(>=|<=|!=|\?=|=|>|<)/.exec(src.slice(i, i + 2));
			if (op) { push({ t: 'op', v: op[1] }, i, i + op[1].length); i += op[1].length; continue; }
			let j = i;
			while (j < n && !/[\s{}=<>!#"?]/.test(src[j])) j++;
			if (j === i) j = i + 1;
			push({ t: 'w', v: src.slice(i, j) }, i, j); i = j;
		}
		return t;
	}
	/** entries: [{k, q?, op, v}] where v is a string, an entries array (block) or undefined (bare word). */
	function parse(src) {
		const toks = tokenize(src);
		let p = 0;
		function block(top) {
			const out = [];
			while (p < toks.length) {
				const tk = toks[p];
				if (tk.t === '}') { if (top) { p++; continue; } p++; return out; }
				if (tk.t === '{') { p++; out.push({ k: '', op: null, v: block(false) }); continue; }
				if (tk.t !== 'w') { p++; continue; }
				p++;
				const e = { k: tk.v, kq: !!tk.q, op: null, v: undefined, s: tk.s };
				if (p < toks.length && toks[p].t === 'op') {
					e.op = toks[p].v; p++;
					const nx = toks[p];
					if (nx && nx.t === '{') { p++; e.v = block(false); }
					else if (nx && nx.t === 'w') { e.v = nx.v; e.q = !!nx.q; p++; }
				}
				e.e = toks[p - 1].e;
				out.push(e);
			}
			return out;
		}
		return block(true);
	}
	const isBlock = (e) => Array.isArray(e.v);
	const isScalar = (e) => typeof e.v === 'string';

	/** entries -> script lines (relative indent with tabs) */
	function serialize(entries, depth) {
		depth = depth || 0;
		const pad = '\t'.repeat(depth);
		const lines = [];
		const val = (e) => (e.q ? '"' + e.v + '"' : e.v);
		const key = (e) => (e.kq ? '"' + e.k + '"' : e.k);
		entries.forEach((e) => {
			if (e.v === undefined) { lines.push(pad + key(e)); return; }
			if (isBlock(e)) {
				const simple = e.v.length <= 3 && e.v.every((x) => x.v === undefined || isScalar(x));
				const head = e.k ? `${key(e)} ${e.op || '='} ` : '';
				if (!e.v.length) lines.push(`${pad}${head}{ }`);
				else if (simple) lines.push(`${pad}${head}{ ${e.v.map((x) => (x.v === undefined ? key(x) : `${key(x)} ${x.op || '='} ${val(x)}`)).join(' ')} }`);
				else { lines.push(`${pad}${head}{`); lines.push(...serialize(e.v, depth + 1)); lines.push(pad + '}'); }
			} else lines.push(`${pad}${key(e)} ${e.op || '='} ${val(e)}`);
		});
		return lines;
	}
	const text = (entries) => serialize(entries).join('\n');

	/* ---------- helpers ---------- */
	const find = (en, k) => en.find((e) => e.k === k);
	const findAll = (en, k) => en.filter((e) => e.k === k);
	const sval = (e) => (e && isScalar(e) ? e.v : null);
	const numv = (s) => { if (s == null || s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
	const pctv = (s) => { const n = numv(s); return n == null ? null : Math.round(n * 10000) / 100; };
	const isTag = (s) => /^[A-Z][A-Z0-9]{2}$/.test(s || '');
	const yn = (s) => (s === 'yes' || s === 'no' ? s : null);
	const IDEO = ['democratic', 'communism', 'fascism', 'neutrality'];
	/** block whose entries are all `key = scalar` with keys in `allowed`; returns {key:value} or null */
	function blk(e, allowed) {
		if (!isBlock(e)) return null;
		const m = {};
		for (const x of e.v) {
			if (!isScalar(x) || (x.op && x.op !== '=') || !allowed.includes(x.k) || x.k in m) return null;
			m[x.k] = x.v;
		}
		return m;
	}
	const ok = (type, p) => ({ type, p });

	/* ---------- map script entries to catalogue items (null = keep raw) ---------- */
	const EFFECT = {};
	const numFx = (k, key) => { EFFECT[k] = (e) => { const n = numv(sval(e)); return n == null ? null : ok(k, { [key || 'value']: n }); }; };
	['add_political_power', 'add_manpower', 'add_command_power', 'add_research_slot'].forEach((k) => numFx(k));
	['add_stability', 'add_war_support'].forEach((k) => { EFFECT[k] = (e) => { const n = pctv(sval(e)); return n == null ? null : ok(k, { value: n }); }; });
	['army_experience', 'navy_experience', 'air_experience'].forEach((k) => { EFFECT[k] = (e) => { const n = numv(sval(e)); return n == null ? null : ok('add_exp', { type: k, value: n }); }; });
	['add_state_core', 'add_state_claim', 'transfer_state'].forEach((k) => { EFFECT[k] = (e) => { const n = numv(sval(e)); return n == null ? null : ok(k, { state: n }); }; });
	[['add_ideas', 'idea'], ['remove_ideas', 'idea'], ['news_event', 'event'], ['clr_country_flag', 'flag'], ['set_global_flag', 'flag'],
		['custom_effect_tooltip', 'key'], ['load_focus_tree', 'tree'], ['set_cosmetic_tag', 'tag'], ['create_faction', 'name']].forEach(([k, pk]) => {
		EFFECT[k] = (e) => { const s = sval(e); return s ? ok(k, { [pk]: s }) : null; };
	});
	[['puppet', 'target'], ['release', 'target'], ['add_to_faction', 'target'], ['give_guarantee', 'target']].forEach(([k, pk]) => {
		EFFECT[k] = (e) => { const s = sval(e); return isTag(s) ? ok(k, { [pk]: s }) : null; };
	});
	EFFECT.country_event = (e) => {
		if (isScalar(e)) return ok('country_event', { event: e.v, days: '' });
		const m = blk(e, ['id', 'days']); return m && m.id ? ok('country_event', { event: m.id, days: m.days != null ? numv(m.days) : '' }) : null;
	};
	EFFECT.set_country_flag = (e) => {
		if (isScalar(e)) return ok('set_country_flag', { flag: e.v, days: '' });
		const m = blk(e, ['flag', 'days']); return m && m.flag ? ok('set_country_flag', { flag: m.flag, days: m.days != null ? numv(m.days) : '' }) : null;
	};
	EFFECT.add_timed_idea = (e) => { const m = blk(e, ['idea', 'days']); return m && m.idea && numv(m.days) != null ? ok('add_timed_idea', { idea: m.idea, days: numv(m.days) }) : null; };
	EFFECT.swap_ideas = (e) => { const m = blk(e, ['remove_idea', 'add_idea']); return m && m.remove_idea && m.add_idea ? ok('swap_ideas', { remove: m.remove_idea, add: m.add_idea }) : null; };
	EFFECT.add_popularity = (e) => { const m = blk(e, ['ideology', 'popularity']); return m && IDEO.includes(m.ideology) && pctv(m.popularity) != null ? ok('add_popularity', { ideology: m.ideology, value: pctv(m.popularity) }) : null; };
	EFFECT.set_politics = (e) => { const m = blk(e, ['ruling_party', 'elections_allowed']); return m && IDEO.includes(m.ruling_party) && yn(m.elections_allowed) ? ok('set_politics', { party: m.ruling_party, elections: m.elections_allowed }) : null; };
	EFFECT.annex_country = (e) => { const m = blk(e, ['target', 'transfer_troops']); return m && isTag(m.target) && yn(m.transfer_troops) ? ok('annex_country', { target: m.target, troops: m.transfer_troops }) : null; };
	const WG = ['annex_everything', 'puppet_wargoal_focus', 'take_state_focus', 'topple_government'];
	EFFECT.declare_war_on = (e) => { const m = blk(e, ['target', 'type']); return m && isTag(m.target) && WG.includes(m.type) ? ok('declare_war_on', { target: m.target, type: m.type }) : null; };
	EFFECT.create_wargoal = (e) => { const m = blk(e, ['target', 'type']); return m && isTag(m.target) && WG.includes(m.type) ? ok('create_wargoal', { target: m.target, type: m.type }) : null; };
	EFFECT.add_equipment_to_stockpile = (e) => { const m = blk(e, ['type', 'amount']); return m && m.type && numv(m.amount) != null ? ok('add_equipment_to_stockpile', { type: m.type, amount: numv(m.amount) }) : null; };
	EFFECT.add_tech_bonus = (e) => {
		const m = blk(e, ['name', 'bonus', 'uses', 'category']);
		return m && m.name && m.category && pctv(m.bonus) != null && numv(m.uses) != null ? ok('add_tech_bonus', { name: m.name, bonus: pctv(m.bonus), uses: numv(m.uses), category: m.category }) : null;
	};
	EFFECT.add_offsite_building = (e) => { const m = blk(e, ['type', 'level']); return m && ['industrial_complex', 'arms_factory', 'dockyard'].includes(m.type) && numv(m.level) != null ? ok('add_offsite_building', { type: m.type, level: numv(m.level) }) : null; };
	EFFECT.add_resource = (e) => { const m = blk(e, ['type', 'amount', 'state']); return m && numv(m.amount) != null && numv(m.state) != null ? ok('add_resource', { type: m.type, amount: numv(m.amount), state: numv(m.state) }) : null; };
	EFFECT.start_civil_war = (e) => { const m = blk(e, ['ideology', 'size']); return m && IDEO.includes(m.ideology) && pctv(m.size) != null ? ok('start_civil_war', { ideology: m.ideology, size: pctv(m.size) }) : null; };
	EFFECT.set_autonomy = (e) => { const m = blk(e, ['target', 'autonomy_state']); return m && isTag(m.target) && m.autonomy_state ? ok('set_autonomy', { target: m.target, state: m.autonomy_state }) : null; };
	['add_to_variable', 'set_variable'].forEach((k) => {
		EFFECT[k] = (e) => { if (!isBlock(e) || e.v.length !== 1 || !isScalar(e.v[0]) || numv(e.v[0].v) == null) return null; return ok(k, { var: e.v[0].k, value: numv(e.v[0].v) }); };
	});
	EFFECT.complete_national_focus = (e) => { const s = sval(e); return s ? { type: 'complete_national_focus', p: { focus: '@id:' + s } } : null; };
	/** `<state number> = { ... }` building / slots */
	function stateScope(e) {
		const st = numv(e.k);
		if (st == null || !isBlock(e) || e.v.length !== 1) return null;
		const c = e.v[0];
		if (c.k === 'add_extra_state_shared_building_slots' && numv(sval(c)) != null) return ok(c.k, { state: st, value: numv(sval(c)) });
		if (c.k === 'add_building_construction') {
			const m = blk(c, ['type', 'level', 'instant_build']);
			if (m && m.instant_build === 'yes' && numv(m.level) != null && ['industrial_complex', 'arms_factory', 'dockyard', 'infrastructure', 'air_base', 'anti_air_building', 'radar_station', 'synthetic_refinery', 'fuel_silo', 'rocket_site', 'nuclear_reactor'].includes(m.type)) return ok(c.k, { state: st, type: m.type, level: numv(m.level) });
		}
		return null;
	}

	const TRIG = {};
	const cmpOps = ['>', '<', '='];
	const cmp = (k, conv, field) => { TRIG[k] = (e) => { const v = conv(sval(e)); return v != null && cmpOps.includes(e.op || '=') ? ok(k, { op: e.op || '=', [field || 'value']: v }) : null; }; };
	cmp('has_political_power', numv); cmp('has_stability', pctv); cmp('has_war_support', pctv);
	cmp('num_of_factories', numv); cmp('num_of_military_factories', numv);
	['has_war', 'has_defensive_war', 'is_in_faction', 'has_capitulated', 'is_subject', 'is_ai', 'is_historical_focus_on'].forEach((k) => { TRIG[k] = (e) => (yn(sval(e)) ? ok(k, { v: e.v }) : null); });
	[['has_country_flag', 'flag'], ['has_global_flag', 'flag'], ['has_idea', 'idea'], ['has_tech', 'tech']].forEach(([k, pk]) => { TRIG[k] = (e) => (sval(e) ? ok(k, { [pk]: e.v }) : null); });
	[['has_war_with', 'tag'], ['is_in_faction_with', 'tag'], ['is_subject_of', 'tag'], ['exists', 'tag']].forEach(([k, pk]) => { TRIG[k] = (e) => (isTag(sval(e)) ? ok(k, { [pk]: e.v }) : null); });
	['owns_state', 'controls_state'].forEach((k) => { TRIG[k] = (e) => (numv(sval(e)) != null ? ok(k, { state: numv(e.v) }) : null); });
	TRIG.has_government = (e) => (IDEO.includes(sval(e)) ? ok('has_government', { ideology: e.v }) : null);
	TRIG.has_completed_focus = (e) => (sval(e) ? { type: 'has_completed_focus', p: { focus: '@id:' + e.v } } : null);
	TRIG.date = (e) => (sval(e) && /^\d{3,4}\.\d{1,2}\.\d{1,2}$/.test(e.v) && (e.op === '>' || e.op === '<') ? ok('date', { op: e.op, date: e.v }) : null);
	TRIG.check_variable = (e) => {
		if (!isBlock(e) || e.v.length !== 1 || !isScalar(e.v[0]) || numv(e.v[0].v) == null || !cmpOps.includes(e.v[0].op || '=')) return null;
		return ok('check_variable', { var: e.v[0].k, op: e.v[0].op || '=', value: numv(e.v[0].v) });
	};

	function conv(kind, e, stats) {
		let r = null;
		if (kind === 'effect') r = (EFFECT[e.k] && EFFECT[e.k](e)) || stateScope(e);
		else {
			if (e.k === 'NOT' && isBlock(e) && e.v.length === 1) { const inner = TRIG[e.v[0].k] && TRIG[e.v[0].k](e.v[0]); if (inner) { inner.not = true; r = inner; } }
			else if (TRIG[e.k]) r = TRIG[e.k](e);
		}
		if (r) { r._raw = text([e]); if (kind === 'trigger' && r.not === undefined) r.not = false; return r; }
		stats.raw++;
		return { type: '__raw', p: { text: text([e]) }, not: false };
	}
	function condBlock(kind, entries, stats) {
		const c = FB.blankCond();
		if (!entries) return c;
		if (entries.length === 1 && entries[0].k === 'OR' && isBlock(entries[0])) { c.mode = 'any'; entries = entries[0].v; }
		c.items = entries.map((e) => conv(kind, e, stats));
		return c;
	}

	/* ---------- localisation ---------- */
	FB.importer = FB.importer || {};
	FB.importer.parseLoc = function (src, into) {
		const map = into || {};
		src.split(/\r?\n/).forEach((l) => {
			const m = /^\s*([^\s:#]+):\d*\s+"(.*)"\s*(?:#.*)?$/.exec(l);
			if (m) map[m[1]] = m[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
		});
		return map;
	};

	/* ---------- file -> list of trees ---------- */
	FB.importer.parseFile = function (src, fileName) {
		const en = parse(src);
		const trees = [];
		const trs = findAll(en, 'focus_tree').filter(isBlock);
		const shared = findAll(en, 'shared_focus').filter(isBlock);
		const onlyOne = trs.length === 1 && !shared.length && en.every((e) => e.k === 'focus_tree');
		trs.forEach((t, i) => trees.push({ id: sval(find(t.v, 'id')) || '(no id)', entries: t.v, file: fileName, onlyTree: onlyOne, shared: false, span: [t.s, t.e], index: i }));
		if (shared.length) trees.push({ id: '(shared focuses)', entries: shared.map((s) => ({ k: 'focus', op: '=', v: s.v })), file: fileName, onlyTree: false, shared: true });
		if (!trees.length) {
			const loose = findAll(en, 'focus').filter(isBlock);
			if (loose.length) trees.push({ id: '(loose focuses)', entries: en, file: fileName, onlyTree: false, shared: true });
		}
		trees.forEach((t) => {
			t.count = findAll(t.entries, 'focus').filter(isBlock).length;
			t.tag = tagsOf(t.entries).join(' ');
		});
		return trees;
	};
	function tagsOf(entries) {
		const c = find(entries, 'country');
		const tags = [];
		if (c && isBlock(c)) findAll(c.v, 'modifier').forEach((m) => { if (isBlock(m)) findAll(m.v, 'tag').forEach((t) => { if (isTag(sval(t))) tags.push(t.v); }); });
		return tags;
	}

	/* ---------- tree -> project ---------- */
	FB.importer.buildProject = function (tree, loc) {
		loc = loc || {};
		const entries = tree.entries;
		const stats = { raw: 0, warnings: [] };
		const pr = FB.newProject();
		const m = pr.meta;
		m.treeId = tree.shared ? 'shared_focuses' : String(tree.id).replace(/[^A-Za-z0-9_.-]/g, '_');
		m.modName = '';
		const tags = tagsOf(entries);
		m.tag = tags.join(' ');
		const country = find(entries, 'country');
		if (country && !tags.length) m.countryRaw = text([country]);
		m.importedFrom = tree.file || '';
		if (tree.onlyTree && tree.file) m.sourceFile = tree.file;
		const treeKnown = ['id', 'country', 'focus'];
		m.treeExtra = text(entries.filter((e) => !treeKnown.includes(e.k)));

		const raw = findAll(entries, 'focus').filter(isBlock);
		const byId = new Map();
		const rel = new Map();
		raw.forEach((fe) => {
			const en = fe.v;
			const id = sval(find(en, 'id'));
			if (!id) { stats.warnings.push('A focus without an id was skipped.'); return; }
			const f = FB.newFocus({ id, idLocked: true });
			const nameLoc = loc[id];
			f.name = nameLoc != null ? nameLoc : id.replace(/^[A-Za-z0-9]{2,4}_/, '').replace(/_/g, ' ');
			f.desc = loc[id + '_desc'] || '';
			const iconE = find(en, 'icon');
			f.icon = iconE && isScalar(iconE) ? iconE.v : '';
			const x = numv(sval(find(en, 'x'))), y = numv(sval(find(en, 'y')));
			f.x = Math.round(x == null ? 0 : x); f.y = Math.round(y == null ? 0 : y);
			if (x == null && find(en, 'x')) stats.warnings.push(`${id}: x is not a plain number; set to 0.`);
			const cost = numv(sval(find(en, 'cost')));
			f.weeks = cost == null ? 10 : cost;
			f.prereqs = findAll(en, 'prerequisite').filter(isBlock).map((b) => findAll(b.v, 'focus').map(sval).filter(Boolean)).filter((g) => g.length);
			const ex = find(en, 'mutually_exclusive');
			f.excl = ex && isBlock(ex) ? findAll(ex.v, 'focus').map(sval).filter(Boolean) : [];
			const av = find(en, 'available'); f.available = condBlock('trigger', av && av.v, stats);
			const by = find(en, 'bypass'); f.bypass = condBlock('trigger', by && by.v, stats);
			const ab = find(en, 'allow_branch') || find(en, 'visible'); f.visible = condBlock('trigger', ab && ab.v, stats);
			const cr = find(en, 'completion_reward');
			f.rewards = cr && isBlock(cr) ? cr.v.map((e) => conv('effect', e, stats)) : [];
			const ai = find(en, 'ai_will_do');
			const aim = ai && blk(ai, ['factor']);
			f.ai = aim && numv(aim.factor) != null ? numv(aim.factor) : '';
			const sf = find(en, 'search_filters');
			f.filters = sf && isBlock(sf) ? sf.v.map((e) => e.k).filter(Boolean) : [];
			f.cancelInvalid = sval(find(en, 'cancel_if_invalid')) !== 'no';
			f.continueInvalid = sval(find(en, 'continue_if_invalid')) === 'yes';
			f.capitulated = sval(find(en, 'available_if_capitulated')) === 'yes';
			const known = ['id', 'icon', 'x', 'y', 'cost', 'prerequisite', 'mutually_exclusive', 'available', 'bypass', 'allow_branch', 'visible', 'completion_reward', 'search_filters', 'cancel_if_invalid', 'continue_if_invalid', 'available_if_capitulated', 'relative_position_id'];
			const extra = en.filter((e) => !known.includes(e.k) && !(e.k === 'ai_will_do' && aim) && !(e.k === 'icon' && isScalar(e)));
			if (iconE && !isScalar(iconE)) extra.push(iconE);
			f.extra = text(extra);
			const r = sval(find(en, 'relative_position_id'));
			if (r) rel.set(id, r);
			if (byId.has(id)) stats.warnings.push(`Duplicate focus id "${id}": the later one was skipped.`);
			else { byId.set(id, f); pr.focuses.push(f); }
		});

		/* relative positions -> absolute */
		const abs = new Map();
		const resolve = (id, seen) => {
			if (abs.has(id)) return abs.get(id);
			const f = byId.get(id);
			let ox = 0, oy = 0;
			if (rel.has(id) && byId.has(rel.get(id)) && !seen.has(id)) { seen.add(id); const b = resolve(rel.get(id), seen); ox = b.x; oy = b.y; }
			else if (rel.has(id)) stats.warnings.push(`${id}: relative_position_id points to a focus that is not in this tree.`);
			const v = { x: f.x + ox, y: f.y + oy };
			abs.set(id, v);
			return v;
		};
		byId.forEach((f, id) => { const a = resolve(id, new Set()); f.x = a.x; f.y = a.y; });
		if (rel.size) stats.warnings.push(`${rel.size} focus(es) used relative positions; they now have absolute positions in the export.`);

		/* ids -> uids */
		const uidOf = (id) => (byId.has(id) ? byId.get(id).uid : null);
		pr.focuses.forEach((f) => {
			f.prereqs = f.prereqs.map((g) => g.map((id) => { const u = uidOf(id); if (!u) stats.warnings.push(`${f.id}: prerequisite "${id}" is not in this tree (ignored).`); return u; }).filter(Boolean)).filter((g) => g.length);
			f.excl = f.excl.map((id) => { const u = uidOf(id); if (!u) stats.warnings.push(`${f.id}: mutually exclusive focus "${id}" is not in this tree (ignored).`); return u; }).filter(Boolean);
		});
		pr.focuses.forEach((f) => f.excl.forEach((u) => { const o = FB.getFocusIn(pr, u); if (o && !o.excl.includes(f.uid)) o.excl.push(f.uid); }));
		const fixRefs = (items) => items.forEach((it, i) => {
			if (it.p && typeof it.p.focus === 'string' && it.p.focus.startsWith('@id:')) {
				const u = uidOf(it.p.focus.slice(4));
				if (u) it.p.focus = u; else { items[i] = { type: '__raw', p: { text: it._raw }, not: false }; stats.raw++; }
			}
			delete it._raw;
		});
		pr.focuses.forEach((f) => { fixRefs(f.rewards); fixRefs(f.available.items); fixRefs(f.bypass.items); fixRefs(f.visible.items); });

		/* remember what the file said, so saving can leave untouched focuses exactly as they were */
		pr.focuses.forEach((f) => {
			f.srcId = f.id;
			if (rel.has(f.id) && byId.has(rel.get(f.id))) { f.srcRel = rel.get(f.id); const rf = byId.get(f.srcRel); f.srcRelPos = rf.x + ',' + rf.y; }
		});
		pr.focuses.forEach((f) => { f.srcSig = FB.gen.sigOf(pr, f); });
		if (!pr.focuses.length) stats.warnings.push('No focuses were found in that tree.');
		pr.view = { x: 80, y: 60, z: 1 };
		return { project: pr, stats };
	};
	FB.getFocusIn = (pr, u) => pr.focuses.find((f) => f.uid === u) || null;
	/* ---------- Military Industrial Organizations (common/military_industrial_organization/organizations) ---------- */
	const MIO_BONUS = ['equipment_bonus', 'production_bonus', 'organization_modifier'];
	FB.MIO_BONUS = MIO_BONUS;
	const bareTokens = (b) => (b && isBlock(b) && b.v.every((x) => x.v === undefined) ? b.v.map((x) => x.k) : null);

	FB.importer.parseMioFile = function (src, fileName) {
		const trees = [];
		const isOrg = (e) => isBlock(e) && e.k && e.v.some((x) => ['trait', 'initial_trait', 'include', 'equipment_type', 'research_categories'].includes(x.k));
		const add = (e) => {
			const traits = e.v.filter((x) => x.k === 'trait' || x.k === 'initial_trait').length;
			const m = /^([A-Z]{3})_/.exec(e.k);
			trees.push({ kind: 'mio', id: e.k, entries: e.v, file: fileName, onlyTree: false, shared: false, span: [e.s, e.e], index: trees.length, count: traits, tag: m ? m[1] : '' });
		};
		parse(src).forEach((top) => { if (isOrg(top)) add(top); else if (isBlock(top) && top.k) top.v.filter(isOrg).forEach(add); });
		return trees;
	};

	/** One organization -> an editable project of kind "mio" (traits are stored like focuses). */
	FB.importer.buildMioProject = function (tree, loc) {
		loc = loc || {};
		const stats = { raw: 0, warnings: [] };
		const pr = FB.newProject();
		pr.kind = 'mio';
		const m = pr.meta;
		m.treeId = tree.id; m.tag = tree.tag; m.modName = ''; m.importedFrom = tree.file;
		const en = tree.entries;
		const isTrait = (e) => (e.k === 'trait' || e.k === 'initial_trait') && isBlock(e);
		m.mioHeader = text(en.filter((e) => !isTrait(e)));
		const byToken = new Map(), rel = new Map(), parents = new Map();
		let initN = 0;
		en.filter(isTrait).forEach((te) => {
			const t = te.v, initial = te.k === 'initial_trait';
			const token = sval(find(t, 'token')) || (initial ? `${tree.id}_initial_${++initN}` : null);
			if (!token) { stats.warnings.push('A trait without a token was skipped.'); return; }
			if (byToken.has(token)) { stats.warnings.push(`Duplicate trait token "${token}" skipped.`); return; }
			const f = FB.newFocus({ id: token, idLocked: true, initial });
			f.nameKey = sval(find(t, 'name')) || token;
			f.name = loc[f.nameKey] != null ? loc[f.nameKey] : f.nameKey;
			f.desc = loc[f.nameKey + '_desc'] || '';
			f.icon = sval(find(t, 'icon')) || '';
			const pos = find(t, 'position');
			const px = pos && isBlock(pos) ? numv(sval(find(pos.v, 'x'))) : null, py = pos && isBlock(pos) ? numv(sval(find(pos.v, 'y'))) : null;
			f.x = px == null ? 0 : px; f.y = py == null ? 0 : py;
			if (initial) { f.x = -2; f.y = initN - 1; }
			const r = sval(find(t, 'relative_position_id')); if (r) rel.set(token, r);
			const pl = [];
			f.parentStyle = 'all_parents';
			['all_parents', 'parent'].forEach((k) => findAll(t, k).forEach((b) => { const tk = bareTokens(b); if (tk) { tk.forEach((x) => pl.push([x])); if (k === 'parent') f.parentStyle = 'parent'; } }));
			findAll(t, 'any_parent').forEach((b) => { const tk = bareTokens(b); if (tk && tk.length) pl.push(tk); });
			parents.set(token, pl);
			const ex = find(t, 'mutually_exclusive'); f.excl = (bareTokens(ex) || []).slice();
			f.bonuses = {};
			const extra = [];
			MIO_BONUS.forEach((k) => {
				const b = find(t, k);
				f.bonuses[k] = [];
				if (!b) return;
				if (isBlock(b) && b.v.every((x) => typeof x.v === 'string' && numv(x.v) != null)) f.bonuses[k] = b.v.map((x) => ({ k: x.k, v: numv(x.v) }));
				else { extra.push(b); stats.raw++; }
			});
			const lim = find(t, 'limit_to_equipment_type');
			if (lim) { const tk = bareTokens(lim); if (tk) f.limit = tk.join(' '); else extra.push(lim); }
			const known = ['token', 'name', 'icon', 'position', 'relative_position_id', 'all_parents', 'parent', 'any_parent', 'mutually_exclusive', 'limit_to_equipment_type', ...MIO_BONUS];
			t.filter((x) => !known.includes(x.k)).forEach((x) => extra.push(x));
			// parent blocks we could not read stay as raw text
			['all_parents', 'parent', 'any_parent'].forEach((k) => findAll(t, k).forEach((b) => { if (!bareTokens(b)) extra.push(b); }));
			f.extra = text(extra);
			byToken.set(token, f);
			pr.focuses.push(f);
		});
		const abs = new Map();
		const resolve = (token, seen) => {
			if (abs.has(token)) return abs.get(token);
			const f = byToken.get(token);
			let ox = 0, oy = 0;
			if (!f.initial && rel.has(token) && byToken.has(rel.get(token)) && !seen.has(token)) { seen.add(token); const b = resolve(rel.get(token), seen); ox = b.x; oy = b.y; }
			const v = { x: f.x + ox, y: f.y + oy };
			abs.set(token, v);
			return v;
		};
		byToken.forEach((f, token) => { if (f.initial) return; const a = resolve(token, new Set()); f.x = a.x; f.y = a.y; });
		if (rel.size) stats.warnings.push(`${rel.size} trait(s) used relative_position_id; they now have absolute positions.`);
		byToken.forEach((f, token) => {
			f.prereqs = (parents.get(token) || []).map((g) => g.map((x) => { const o = byToken.get(x); if (!o) stats.warnings.push(`${token}: parent "${x}" is not in this organization (ignored).`); return o ? o.uid : null; }).filter(Boolean)).filter((g) => g.length);
			f.excl = f.excl.map((x) => { const o = byToken.get(x); return o ? o.uid : null; }).filter(Boolean);
		});
		if (en.some((e) => e.k === 'include')) stats.warnings.push('This organization includes a template (include = …). Traits from the template are not shown; only traits written in this file can be edited.');
		byToken.forEach((f, token) => {
			f.srcId = f.id;
			if (rel.has(token) && byToken.has(rel.get(token)) && !f.initial) { f.srcRel = rel.get(token); const rf = byToken.get(f.srcRel); f.srcRelPos = rf.x + ',' + rf.y; }
		});
		pr.focuses.forEach((f) => { f.srcSig = FB.gen.sigOf(pr, f); });
		pr.view = { x: 80, y: 60, z: 1 };
		return { project: pr, stats };
	};

	/** The focus / trait entries of a parsed tree with their identity (focus id, or trait token), for in-place saving. */
	FB.importer.unitEntries = function (tree, kind) {
		const out = [];
		let initN = 0;
		tree.entries.forEach((e) => {
			if (!isBlock(e)) return;
			if (kind === 'mio') {
				if (e.k !== 'trait' && e.k !== 'initial_trait') return;
				const id = sval(find(e.v, 'token')) || (e.k === 'initial_trait' ? `${tree.id}_initial_${++initN}` : null);
				if (id) out.push({ id, e });
			} else if (e.k === 'focus') {
				const id = sval(find(e.v, 'id'));
				if (id) out.push({ id, e });
			}
		});
		return out;
	};

	FB.importer.parse = parse;
	FB.importer.tagsOf = tagsOf;
	FB.importer.serialize = text;
})(window.FB = window.FB || {});
