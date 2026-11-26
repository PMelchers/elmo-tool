/* Focus Builder - project model, history (undo/redo), validation, auto-layout */
(function (FB) {
	'use strict';
	const { uid, clone, slug } = FB;
	const LS_KEY = 'focusbuilder.project.v1';

	/* ---------- tiny event bus ---------- */
	const listeners = {};
	FB.on = (e, fn) => { (listeners[e] = listeners[e] || []).push(fn); };
	FB.emit = (e, a) => { (listeners[e] || []).forEach((fn) => fn(a)); };

	FB.state = { project: null, selected: null };

	/* ---------- constructors ---------- */
	FB.newMeta = () => ({
		modName: 'My HOI4 Mod', treeId: 'my_focus_tree', tag: '', idPrefix: '', modFolder: '',
		hoi4Version: '1.16', defaultIcon: 'GFX_goal_unknown', notes: '',
		treeExtra: '', countryRaw: '', importedFrom: '', sourceFile: '', mioHeader: ''
	});
	FB.blankCond = () => ({ mode: 'all', items: [] });
	FB.newFocus = (o) => Object.assign({
		uid: uid(), id: '', idLocked: false, name: 'New focus', desc: '', icon: '', weeks: 10, x: 0, y: 0,
		prereqs: [], excl: [], available: FB.blankCond(), bypass: FB.blankCond(), visible: FB.blankCond(),
		rewards: [], ai: 10, cancelInvalid: true, continueInvalid: false, capitulated: false, filters: [], note: '', extra: ''
	}, o || {});
	FB.newProject = () => ({ v: 1, kind: 'focus', meta: FB.newMeta(), focuses: [], items: [], versions: [], view: { x: 80, y: 60, z: 1 } });

	/** Fill in missing fields (older saves, hand-edited JSON). */
	FB.migrate = function (p) {
		const out = Object.assign(FB.newProject(), p || {});
		out.meta = Object.assign(FB.newMeta(), out.meta || {});
		out.view = Object.assign({ x: 80, y: 60, z: 1 }, out.view || {});
		out.items = Array.isArray(out.items) ? out.items : [];
		out.versions = Array.isArray(out.versions) ? out.versions : [];
		out.items = out.items.map((i) => Object.assign({ uid: uid(), kind: 'idea', id: '', name: '', desc: '', plain: '' }, i));
		out.focuses = (Array.isArray(out.focuses) ? out.focuses : []).map((f) => {
			const n = Object.assign(FB.newFocus(), f);
			['available', 'bypass', 'visible'].forEach((k) => { n[k] = Object.assign(FB.blankCond(), n[k] || {}); n[k].items = n[k].items || []; });
			n.prereqs = (n.prereqs || []).filter(Array.isArray);
			n.excl = n.excl || [];
			n.rewards = n.rewards || [];
			n.filters = n.filters || [];
			return n;
		});
		return out;
	};

	/* ---------- lookups ---------- */
	const P = () => FB.state.project;
	FB.getFocus = (u) => P().focuses.find((f) => f.uid === u) || null;
	FB.getSelected = () => FB.getFocus(FB.state.selected);
	FB.prefix = () => {
		const m = P().meta;
		return (m.idPrefix || '').trim() || (m.tag || '').trim().split(/\s+/)[0].toUpperCase() || FB.slug(m.treeId) || 'focus';
	};
	FB.autoId = (f) => `${FB.prefix()}_${slug(f.name) || 'focus'}`;
	FB.uniqueId = (base, exceptUid) => {
		let id = base, n = 2;
		while (P().focuses.some((f) => f.uid !== exceptUid && f.id === id)) id = `${base}_${n++}`;
		return id;
	};
	FB.setName = (f, name) => {
		f.name = name;
		if (!f.idLocked) f.id = FB.uniqueId(FB.autoId(f), f.uid);
	};
	FB.regenIds = () => P().focuses.forEach((f) => { if (!f.idLocked) f.id = FB.uniqueId(FB.autoId(f), f.uid); });
	FB.ctx = () => {
		const map = new Map(P().focuses.map((f) => [f.uid, f.id]));
		return { focusId: (u) => map.get(u) || 'UNKNOWN_FOCUS' };
	};
	FB.ancestors = (u) => {
		const seen = new Set(), stack = [u];
		while (stack.length) {
			const f = FB.getFocus(stack.pop());
			if (!f) continue;
			f.prereqs.forEach((g) => g.forEach((p) => { if (!seen.has(p)) { seen.add(p); stack.push(p); } }));
		}
		return seen;
	};
	FB.weeksToText = (w) => `${w} week${Number(w) === 1 ? '' : 's'} (${Math.round(Number(w) * 7)} days)`;

	/* ---------- edits ---------- */
	FB.freeCellNear = (x, y) => {
		const taken = new Set(P().focuses.map((f) => f.x + ',' + f.y));
		let r = 0;
		for (;;) {
			for (let dy = 0; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r && r !== 0) continue;
				if (!taken.has((x + dx) + ',' + (y + dy))) return { x: x + dx, y: y + dy };
			}
			if (++r > 50) return { x, y };
		}
	};
	/** Add a focus; opts {x,y, from: uid (becomes its prerequisite), name} */
	FB.addFocus = (opts) => {
		opts = opts || {};
		const f = FB.newFocus({ name: opts.name || 'New focus' });
		const from = opts.from ? FB.getFocus(opts.from) : null;
		let x = opts.x, y = opts.y;
		if (x == null) { x = from ? from.x : 0; y = from ? from.y + 1 : 0; }
		const c = FB.freeCellNear(x, y);
		f.x = c.x; f.y = c.y;
		if (from) f.prereqs = [[from.uid]];
		f.id = FB.uniqueId(FB.autoId(f), f.uid);
		if (P().kind === 'mio') {
			const style = (P().focuses.find((x) => x.parentStyle) || {}).parentStyle || 'all_parents';
			f.id = FB.uniqueId(`${P().meta.treeId}_trait`, f.uid); f.idLocked = true;
			Object.assign(f, { name: 'New trait', nameKey: f.id, parentStyle: style, limit: '', initial: false, bonuses: { equipment_bonus: [], production_bonus: [], organization_modifier: [] } });
		}
		P().focuses.push(f);
		FB.state.selected = f.uid;
		return f;
	};
	FB.deleteFocus = (u) => {
		const pr = P();
		pr.focuses = pr.focuses.filter((f) => f.uid !== u);
		pr.focuses.forEach((f) => {
			f.prereqs = f.prereqs.map((g) => g.filter((x) => x !== u)).filter((g) => g.length);
			f.excl = f.excl.filter((x) => x !== u);
			f.rewards.forEach((r) => { if (r.p) for (const k in r.p) if (r.p[k] === u) r.p[k] = ''; });
			['available', 'bypass', 'visible'].forEach((k) => f[k].items.forEach((r) => { if (r.p) for (const q in r.p) if (r.p[q] === u) r.p[q] = ''; }));
		});
		if (FB.state.selected === u) FB.state.selected = null;
	};
	FB.duplicateFocus = (u) => {
		const src = FB.getFocus(u);
		if (!src) return null;
		const f = FB.migrate({ focuses: [clone(src)] }).focuses[0];
		f.uid = uid();
		delete f.srcId; delete f.srcSig; delete f.srcRel; delete f.srcRelPos; // a copy is a new focus, not the original entry
		f.excl = [];
		f.name = src.name + ' (copy)';
		f.idLocked = false;
		const c = FB.freeCellNear(src.x + 1, src.y);
		f.x = c.x; f.y = c.y;
		f.id = FB.uniqueId(FB.autoId(f), f.uid);
		P().focuses.push(f);
		FB.state.selected = f.uid;
		return f;
	};
	FB.wouldCycle = (target, newPrereq) => target === newPrereq || FB.ancestors(newPrereq).has(target);
	FB.addPrereq = (targetUid, prereqUid, groupIndex) => {
		const t = FB.getFocus(targetUid);
		if (!t || targetUid === prereqUid) return false;
		if (FB.wouldCycle(targetUid, prereqUid)) { FB.toast('That would make the focuses depend on each other in a circle.', 'warn'); return false; }
		if (t.prereqs.some((g) => g.includes(prereqUid))) return false;
		if (groupIndex == null) t.prereqs.push([prereqUid]); else t.prereqs[groupIndex].push(prereqUid);
		return true;
	};
	FB.toggleExclusive = (a, b, on) => {
		const fa = FB.getFocus(a), fb = FB.getFocus(b);
		if (!fa || !fb || a === b) return;
		fa.excl = fa.excl.filter((x) => x !== b); fb.excl = fb.excl.filter((x) => x !== a);
		if (on) { fa.excl.push(b); fb.excl.push(a); }
	};

	/* ---------- items the mod must define ---------- */
	FB.itemsOfKind = (kind) => P().items.filter((i) => i.kind === kind && i.id);
	function forEachItem(fn) {
		P().focuses.forEach((f) => {
			f.rewards.forEach((it, i) => fn(f, 'effect', 'Reward', it, i));
			['available', 'bypass', 'visible'].forEach((k) => f[k].items.forEach((it, i) => fn(f, 'trigger', k, it, i)));
		});
	}
	FB.collectRefs = () => {
		const map = new Map();
		forEachItem((f, kind, where, it) => {
			const def = FB.catalog.def(kind, it.type);
			if (!def || !def.refs) return;
			def.refs(it.p || {}).forEach((r) => {
				if (!r.id) return;
				const key = r.kind + ':' + r.id;
				if (!map.has(key)) map.set(key, { kind: r.kind, id: r.id, note: r.note || '', focuses: [] });
				const e = map.get(key);
				if (!e.focuses.includes(f.name)) e.focuses.push(f.name);
			});
		});
		return [...map.values()];
	};
	const DEFINABLE = new Set(['idea', 'event', 'decision', 'tooltip', 'other']);
	FB.undefinedRefs = () => {
		const defined = new Set(P().items.map((i) => i.kind + ':' + i.id));
		return FB.collectRefs().filter((r) => DEFINABLE.has(r.kind) && !defined.has(r.kind + ':' + r.id));
	};
	/** Filters that follow from the rewards (so the in-game filter buttons work). */
	FB.derivedFilters = (f) => {
		const s = new Set();
		f.rewards.forEach((it) => { const d = FB.catalog.def('effect', it.type); if (d && d.filters) d.filters.forEach((x) => s.add(x)); });
		return [...s];
	};
	FB.allFilters = (f) => [...new Set([...(f.filters || []), ...FB.derivedFilters(f)])];

	/* ---------- validation ---------- */
	FB.validate = function () {
		const pr = P(), out = [];
		const add = (level, msg, u) => out.push({ level, msg, uid: u || null });
		const m = pr.meta;
		if (pr.kind === 'mio') {
			const idCount = {}, posCount = {};
			pr.focuses.forEach((f) => { idCount[f.id] = (idCount[f.id] || 0) + 1; if (!f.initial) (posCount[f.x + ',' + f.y] = posCount[f.x + ',' + f.y] || []).push(f); });
			pr.focuses.forEach((f) => {
				const n = `"${f.name || f.id}"`;
				if (!f.id || !/^[A-Za-z0-9_.-]+$/.test(f.id)) add('error', `${n}: the token "${f.id}" is not valid (letters, numbers, underscores).`, f.uid);
				else if (idCount[f.id] > 1) add('error', `${n}: another trait uses the same token "${f.id}".`, f.uid);
				if (!f.initial && posCount[f.x + ',' + f.y].length > 1) add('warn', `${n}: sits on top of another trait.`, f.uid);
				if (FB.ancestors(f.uid).has(f.uid)) add('error', `${n}: requires itself through a loop of parents.`, f.uid);
				if (f.bonuses && Object.values(f.bonuses).flat().some((r) => !String(r.k).trim())) add('warn', `${n}: a bonus has no name.`, f.uid);
			});
			return out;
		}
		if (!pr.focuses.length) add('info', 'There are no focuses yet. Double-click the canvas or press "Add focus".');
		if (!m.tag.trim() && !m.countryRaw) add('error', 'Project tab: enter the country tag this tree is for (e.g. GER). Without it the tree will not show up in game.');
		if (!/^[A-Za-z0-9_.-]+$/.test(m.treeId || '')) add('error', 'Project tab: the tree ID may only contain letters, numbers and underscores.');
		const idCount = {};
		const posCount = {};
		pr.focuses.forEach((f) => { idCount[f.id] = (idCount[f.id] || 0) + 1; const k = f.x + ',' + f.y; (posCount[k] = posCount[k] || []).push(f); });
		pr.focuses.forEach((f) => {
			const n = `"${f.name || f.id}"`;
			if (!f.id || !/^[A-Za-z0-9_.-]+$/.test(f.id)) add('error', `${n}: the ID "${f.id}" is not valid (letters, numbers and underscores only).`, f.uid);
			else if (idCount[f.id] > 1) add('error', `${n}: another focus uses the same ID "${f.id}".`, f.uid);
			if (!f.name.trim()) add('warn', `${n}: has no name.`, f.uid);
			if (!(Number(f.weeks) > 0)) add('warn', `${n}: duration must be above 0 weeks.`, f.uid);
			if (posCount[f.x + ',' + f.y].length > 1) add('warn', `${n}: sits on top of another focus. Drag one away.`, f.uid);
			if (!f.rewards.length) add('warn', `${n}: has no reward.`, f.uid);
			if (FB.ancestors(f.uid).has(f.uid)) add('error', `${n}: requires itself through a loop of prerequisites.`, f.uid);
			f.prereqs.forEach((g) => g.forEach((u) => { if (!FB.getFocus(u)) add('error', `${n}: requires a focus that no longer exists.`, f.uid); }));
			const check = (kind, label, items) => items.forEach((it) => {
				const def = FB.catalog.def(kind, it.type);
				if (!def) { add('error', `${n}: unknown ${label} type "${it.type}".`, f.uid); return; }
				const miss = FB.catalog.missing(def, it.p || {});
				if (miss.length) add('warn', `${n}: ${label} "${def.label}" is missing: ${miss.map((q) => q.label).join(', ')}.`, f.uid);
				if (it.type === '__plain') add('info', `${n}: ${label} written in plain words. Claude will turn it into code.`, f.uid);
			});
			check('effect', 'reward', f.rewards);
			check('trigger', 'requirement', f.available.items);
			check('trigger', 'bypass condition', f.bypass.items);
			check('trigger', 'visibility condition', f.visible.items);
		});
		FB.undefinedRefs().forEach((r) => add('info', `${r.kind} "${r.id}" is used (${r.focuses.join(', ')}) but not described under "Things to create". Claude will have to invent it.`));
		return out;
	};

	/* ---------- auto layout ---------- */
	FB.autoLayout = function () {
		const fs = P().focuses;
		if (!fs.length) return;
		const depth = new Map();
		const getDepth = (f, stack) => {
			if (depth.has(f.uid)) return depth.get(f.uid);
			if (stack.has(f.uid)) return 0;
			stack.add(f.uid);
			let d = 0;
			f.prereqs.forEach((g) => g.forEach((u) => { const pf = FB.getFocus(u); if (pf) d = Math.max(d, getDepth(pf, stack) + 1); }));
			stack.delete(f.uid);
			depth.set(f.uid, d);
			return d;
		};
		fs.forEach((f) => getDepth(f, new Set()));
		const rows = new Map();
		fs.forEach((f) => { const d = depth.get(f.uid); if (!rows.has(d)) rows.set(d, []); rows.get(d).push(f); });
		const posX = new Map();
		let nextRoot = 0;
		[...rows.keys()].sort((a, b) => a - b).forEach((d) => {
			const row = rows.get(d);
			const ideal = (f) => {
				const xs = [];
				f.prereqs.forEach((g) => g.forEach((u) => { if (posX.has(u)) xs.push(posX.get(u)); }));
				return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
			};
			row.forEach((f) => { f._ideal = ideal(f); });
			row.sort((a, b) => (a._ideal == null ? 1e9 : a._ideal) - (b._ideal == null ? 1e9 : b._ideal) || a.x - b.x);
			let last = -Infinity;
			row.forEach((f) => {
				let x = f._ideal == null ? Math.max(nextRoot, last + 1) : Math.max(Math.round(f._ideal), last + 1);
				if (f._ideal == null) nextRoot = x + 1;
				f.x = x; f.y = d; last = x; posX.set(f.uid, x);
				delete f._ideal;
			});
		});
		const minX = Math.min(...fs.map((f) => f.x));
		if (minX < 0) fs.forEach((f) => { f.x -= minX; });
	};

	/* ---------- persistence + history ---------- */
	const hist = { stack: [], idx: -1, key: null, t: 0 };
	const save = FB.debounce(() => {
		try {
			localStorage.setItem(LS_KEY, JSON.stringify(FB.state.project));
			localStorage.setItem(LS_KEY + '.baseline', FB.state.baseline || '');
		} catch (e) { /* storage unavailable */ }
	}, 400);
	FB.loadBaseline = () => { try { return localStorage.getItem(LS_KEY + '.baseline') || null; } catch (e) { return null; } };

	FB.loadSaved = () => {
		try { const s = localStorage.getItem(LS_KEY); return s ? FB.migrate(JSON.parse(s)) : null; } catch (e) { return null; }
	};
	FB.setProject = (p, opts) => {
		FB.state.project = FB.migrate(p);
		FB.state.baseline = opts && opts.baseline ? opts.baseline : FB.snapshot(FB.state.project);
		FB.state.selected = (opts && opts.keepSelection && FB.getFocus(FB.state.selected)) ? FB.state.selected : null;
		hist.stack = [JSON.stringify(FB.state.project)]; hist.idx = 0; hist.key = null;
		save();
		FB.emit('change', { full: true, reload: true });
	};
	/** Call after mutating the project. `key` merges rapid edits of the same field into one undo step. */
	FB.commit = (key, opts) => {
		opts = opts || {};
		if (opts.silent) { save(); return; } // view-only changes (pan/zoom) are saved but not undoable
		const snap = JSON.stringify(FB.state.project);
		const now = Date.now();
		if (hist.stack[hist.idx] !== snap) {
			if (key && key === hist.key && now - hist.t < 1200 && hist.idx === hist.stack.length - 1) hist.stack[hist.idx] = snap;
			else { hist.stack.length = hist.idx + 1; hist.stack.push(snap); hist.idx++; if (hist.stack.length > 200) { hist.stack.shift(); hist.idx--; } }
			hist.key = key || null; hist.t = now;
		}
		save();
		FB.emit('change', opts);
	};
	const restore = (i) => {
		hist.idx = i;
		FB.state.project = JSON.parse(hist.stack[i]);
		if (!FB.getFocus(FB.state.selected)) FB.state.selected = null;
		hist.key = null;
		save();
		FB.emit('change', { full: true, reload: true });
	};
	/** After saving into files, older undo states would point at stale file positions, so history starts over. */
	FB.resetHistory = () => { hist.stack = [JSON.stringify(FB.state.project)]; hist.idx = 0; hist.key = null; };
	FB.undo = () => { if (hist.idx > 0) restore(hist.idx - 1); };
	FB.redo = () => { if (hist.idx < hist.stack.length - 1) restore(hist.idx + 1); };
	FB.canUndo = () => hist.idx > 0;
	FB.canRedo = () => hist.idx < hist.stack.length - 1;
	FB.select = (u) => { FB.state.selected = u; FB.emit('select', u); };
})(window.FB = window.FB || {});
