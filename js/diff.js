/* Focus Builder - change tracking: compares a project with its baseline and writes a human changelog */
(function (FB) {
	'use strict';

	const withProj = (p, fn) => {
		const old = FB.state.project;
		FB.state.project = p;
		try { return fn(); } finally { FB.state.project = old; }
	};
	FB.withProj = withProj;
	/** Stable string of everything that matters (not the pan/zoom or the version list). */
	FB.snapshot = (p) => {
		const c = JSON.parse(JSON.stringify(p));
		delete c.view; delete c.versions;
		return JSON.stringify(c);
	};
	FB.isChanged = (p, baseline) => !!baseline && FB.snapshot(p) !== baseline;

	const reqStr = (p, f) => {
		const map = new Map(p.focuses.map((x) => [x.uid, x.name]));
		if (!f.prereqs.length) return 'none';
		return f.prereqs.map((g) => { const n = g.map((u) => map.get(u) || '?'); return n.length > 1 ? '(' + n.join(' or ') + ')' : n[0]; }).join(' and ');
	};
	const exclStr = (p, f) => {
		const map = new Map(p.focuses.map((x) => [x.uid, x.name]));
		return f.excl.map((u) => map.get(u) || '?').sort().join(', ') || 'none';
	};

	/** Compares two lists of rewards/conditions; reports added, removed and edited entries. */
	function itemDiff(label, bItems, cItems, bProj, cProj, kind, name, add) {
		const bt = bItems.map((i) => withProj(bProj, () => FB.itemText(kind, i)));
		const ct = cItems.map((i) => withProj(cProj, () => FB.itemText(kind, i)));
		const cCount = {}; ct.forEach((t) => { cCount[t] = (cCount[t] || 0) + 1; });
		const bCount = {}; bt.forEach((t) => { bCount[t] = (bCount[t] || 0) + 1; });
		const remB = []; bt.forEach((t, i) => { if (cCount[t] > 0) cCount[t]--; else remB.push(i); });
		const addC = []; ct.forEach((t, i) => { if (bCount[t] > 0) bCount[t]--; else addC.push(i); });
		const taken = new Set();
		remB.forEach((bi) => {
			const k = addC.findIndex((ci) => !taken.has(ci) && cItems[ci].type === bItems[bi].type);
			if (k >= 0) { taken.add(addC[k]); add('~', `${label} changed: ${bt[bi]}  →  ${ct[addC[k]]}`, name); }
			else add('-', `${label} removed: ${bt[bi]}`, name);
		});
		addC.forEach((ci) => { if (!taken.has(ci)) add('+', `${label} added: ${ct[ci]}`, name); });
	}

	/** Returns [{sign: '+'|'-'|'~', text, focus}] describing how `cur` differs from the baseline snapshot. */
	FB.diff = function (baselineStr, cur) {
		if (!baselineStr) return [];
		const base = JSON.parse(baselineStr);
		const out = [];
		const add = (sign, text, focus) => out.push({ sign, text, focus: focus || '' });
		[['tag', 'Country tag'], ['treeId', 'Tree ID'], ['defaultIcon', 'Default icon']].forEach(([k, l]) => {
			if (base.meta[k] !== cur.meta[k]) add('~', `${l}: ${base.meta[k] || '(none)'} → ${cur.meta[k] || '(none)'}`, '');
		});
		const bm = new Map(base.focuses.map((f) => [f.uid, f]));
		const cm = new Map(cur.focuses.map((f) => [f.uid, f]));
		cur.focuses.forEach((f) => { if (!bm.has(f.uid)) add('+', `Added focus "${f.name}" (${f.id}) at ${f.x},${f.y}, ${f.weeks} weeks, ${f.rewards.length} reward(s)`, f.name); });
		base.focuses.forEach((f) => { if (!cm.has(f.uid)) add('-', `Removed focus "${f.name}" (${f.id})`, f.name); });
		const moves = [];
		cur.focuses.forEach((f) => {
			const b = bm.get(f.uid); if (!b) return;
			const n = f.name;
			if (b.name !== f.name) add('~', `Renamed "${b.name}" → "${f.name}"`, f.name);
			if (b.id !== f.id) add('~', `ID changed: ${b.id} → ${f.id}`, n);
			if ((b.desc || '') !== (f.desc || '')) add('~', 'Description changed', n);
			if (Number(b.weeks) !== Number(f.weeks)) add('~', `Duration: ${b.weeks} → ${f.weeks} weeks`, n);
			if ((b.icon || '') !== (f.icon || '')) add('~', `Icon: ${b.icon || '(default)'} → ${f.icon || '(default)'}`, n);
			if (b.x !== f.x || b.y !== f.y) moves.push({ n, text: `Moved from ${b.x},${b.y} to ${f.x},${f.y}` });
			const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
			if (!same(b.prereqs.map((g) => g.slice().sort()).sort(), f.prereqs.map((g) => g.slice().sort()).sort())) add('~', `Requires: ${reqStr(base, b)} → ${reqStr(cur, f)}`, n);
			if (!same(b.excl.slice().sort(), f.excl.slice().sort())) add('~', `Mutually exclusive with: ${exclStr(base, b)} → ${exclStr(cur, f)}`, n);
			itemDiff('Reward', b.rewards, f.rewards, base, cur, 'effect', n, add);
			itemDiff('Requirement', b.available.items, f.available.items, base, cur, 'trigger', n, add);
			itemDiff('Bypass condition', b.bypass.items, f.bypass.items, base, cur, 'trigger', n, add);
			itemDiff('Visibility condition', b.visible.items, f.visible.items, base, cur, 'trigger', n, add);
			if (b.available.items.length > 1 && b.available.mode !== f.available.mode) add('~', `Requirements now need ${f.available.mode === 'any' ? 'any one' : 'all'} of the conditions`, n);
			if (cur.kind === 'mio') {
				(FB.MIO_BONUS || []).forEach((blk) => {
					const bm = {}, cm2 = {};
					((b.bonuses || {})[blk] || []).forEach((r) => { bm[r.k] = r.v; });
					((f.bonuses || {})[blk] || []).forEach((r) => { cm2[r.k] = r.v; });
					Object.keys(cm2).forEach((k) => { if (!(k in bm)) add('+', `Bonus added (${blk.replace('_', ' ')}): ${k} ${cm2[k]}`, n); else if (bm[k] !== cm2[k]) add('~', `Bonus changed (${blk.replace('_', ' ')}): ${k} ${bm[k]} → ${cm2[k]}`, n); });
					Object.keys(bm).forEach((k) => { if (!(k in cm2)) add('-', `Bonus removed (${blk.replace('_', ' ')}): ${k} ${bm[k]}`, n); });
				});
				if ((b.limit || '') !== (f.limit || '')) add('~', `Limited to equipment: ${b.limit || '(all)'} → ${f.limit || '(all)'}`, n);
				if ((b.nameKey || '') !== (f.nameKey || '')) add('~', `Name key: ${b.nameKey} → ${f.nameKey}`, n);
			}
			if (String(b.ai) !== String(f.ai)) add('~', `AI priority: ${b.ai === '' ? '(none)' : b.ai} → ${f.ai === '' ? '(none)' : f.ai}`, n);
			if (b.cancelInvalid !== f.cancelInvalid || b.continueInvalid !== f.continueInvalid || b.capitulated !== f.capitulated) add('~', 'Validity options changed', n);
			if (JSON.stringify(b.filters) !== JSON.stringify(f.filters)) add('~', 'Filter tags changed', n);
			if ((b.extra || '') !== (f.extra || '')) add('~', 'Kept custom code edited', n);
			if ((b.note || '') !== (f.note || '')) add('~', 'Note for Claude changed', n);
		});
		if ((base.meta.mioHeader || '') !== (cur.meta.mioHeader || '')) add('~', 'Organization settings (header) edited', '');
		if (moves.length > 6) add('~', `Moved ${moves.length} focuses (layout changed)`, '');
		else moves.forEach((m) => add('~', m.text, m.n));
		const ib = JSON.stringify(base.items), ic = JSON.stringify(cur.items);
		if (ib !== ic) add('~', 'Things to create (ideas / events / decisions) edited', '');
		return out;
	};

	/** Pending changes of whatever is open: [{tree, tag, lines:[{sign,text,focus}]}] (only trees with changes). */
	FB.pendingGroups = function () {
		if (FB.ws && FB.ws.active) return FB.ws.pending();
		const p = FB.state.project;
		const lines = FB.diff(FB.state.baseline, p);
		return lines.length ? [{ tree: p.meta.treeId, tag: p.meta.tag, lines }] : [];
	};

	/* ---------- markdown ---------- */
	const SIGN = { '+': '**+**', '-': '**−**', '~': '**~**' };
	FB.gen = FB.gen || {};
	FB.gen.groupsMd = function (groups) {
		const L = [];
		groups.forEach((g) => {
			L.push(`### ${g.tree}${g.tag ? ' (' + g.tag + ')' : ''}`, '');
			g.lines.forEach((l) => L.push(`- ${SIGN[l.sign] || '•'} ${l.focus && !l.text.includes(l.focus) ? '[' + l.focus + '] ' : ''}${l.text}`));
			L.push('');
		});
		return L.join('\n');
	};
	FB.gen.versionMd = function (v) {
		const L = [`## ${v.label} — ${String(v.date).slice(0, 10)}`, ''];
		if ((v.notes || '').trim()) L.push(v.notes.trim(), '');
		L.push(v.groups.length ? FB.gen.groupsMd(v.groups) : '_No focus changes._', '');
		return L.join('\n');
	};
	FB.gen.changelogMd = function (versions) {
		return '# Changelog\n\nWritten by Focus Builder. Newest version first.\n\n' + versions.slice().reverse().map(FB.gen.versionMd).join('\n');
	};
	/** Next version label such as "v3" given existing labels / markdown. */
	FB.nextVersionLabel = function (existingText) {
		let max = 0;
		String(existingText || '').replace(/^## v(\d+)/gm, (m, n) => { max = Math.max(max, Number(n)); return m; });
		return 'v' + (max + 1);
	};

	/** Standalone (no mod folder): log a version and reset the baseline. */
	FB.recordVersion = function (label, notes) {
		const p = FB.state.project;
		const groups = FB.pendingGroups();
		p.versions.push({ label, date: new Date().toISOString(), notes: notes || '', groups });
		FB.state.baseline = FB.snapshot(p);
		FB.commit('version', { full: true });
		return p.versions[p.versions.length - 1];
	};
})(window.FB = window.FB || {});
