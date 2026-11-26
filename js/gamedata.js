/* Focus Builder - index of game and mod data for autocomplete: country tags, states, technologies, ideas,
 * decisions, events, and the real focus / MIO icon names. Read in the background from the base game (helper)
 * and from the open mod. Everything degrades gracefully when a source is missing. */
(function (FB) {
	'use strict';
	const GD = FB.gd = { ready: false, loading: false, status: '', sig: '', lists: {}, names: {} };
	const pretty = (k) => { const s = String(k).replace(/^[A-Z]{3}_/, '').replace(/_/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
	const isBlock = (e) => Array.isArray(e.v);
	const sig = () => (FB.server.active ? 'g' : '') + '|' + (FB.ws.active ? FB.ws.name + '|' + (FB.ws.path || '') : '');

	async function dirAt(root, parts) {
		let d = root;
		for (const p of parts) d = await d.getDirectoryHandle(p);
		return d;
	}
	async function files(root, rel, re) {
		const out = [];
		try { await FB.fsutil.walk(await dirAt(root, rel.split('/')), '', out, 0, (n) => re.test(n)); } catch (e) { /* folder missing */ }
		return out;
	}
	const text = (f) => FB.fsutil.readText(f.handle);

	GD.load = async function (force) {
		if (GD.loading) return;
		if (GD.ready && !force && GD.sig === sig()) return;
		const sources = [];
		try {
			if (FB.server.active && FB.server.info && FB.server.info.game) {
				await FB.server.post('open', { path: FB.server.info.game });
				sources.push({ label: 'game', dir: FB.server.dir(FB.server.info.game, 'game'), game: true });
			}
		} catch (e) { /* game folder not available */ }
		if (FB.ws.active) sources.push({ label: 'mod', dir: FB.ws.dir, game: false });
		if (!sources.length) { GD.ready = false; GD.sig = sig(); return; }
		GD.loading = true;
		const say = (m) => { GD.status = m; FB.emit('gd-status', m); };
		const L = { tag: new Map(), state: new Map(), tech: new Map(), idea: new Map(), decision: new Map(), event: new Map(), goalIcon: new Map(), mioIcon: new Map() };
		const loc = {};
		const add = (type, id, src, extra) => { if (id && !L[type].has(id)) L[type].set(id, Object.assign({ id, src }, extra || {})); };
		for (const s of sources) {
			const where = s.game ? 'base game' : 'your mod';
			try {
				say(`Reading ${where}: countries…`);
				for (const f of await files(s.dir, 'common/country_tags', /\.txt$/i)) (await text(f)).replace(/^\s*([A-Z][A-Z0-9]{2})\s*=\s*"/gm, (m, t) => { add('tag', t, s.label); return m; });
				say(`Reading ${where}: states…`);
				for (const f of await files(s.dir, 'history/states', /^\d+\s*-.*\.txt$/i)) { const m = /^(\d+)\s*-\s*(.*)\.txt$/i.exec(f.path); if (m) add('state', m[1], s.label, { fileName: m[2].replace(/_/g, ' ') }); }
				say(`Reading ${where}: technologies…`);
				for (const f of await files(s.dir, 'common/technologies', /\.txt$/i)) FB.importer.parse(await text(f)).forEach((t) => { if (t.k === 'technologies' && isBlock(t)) t.v.forEach((e) => { if (isBlock(e)) add('tech', e.k, s.label); }); });
				say(`Reading ${where}: ideas…`);
				for (const f of await files(s.dir, 'common/ideas', /\.txt$/i)) FB.importer.parse(await text(f)).forEach((t) => { if ((t.k === 'ideas' || t.k === 'hidden_ideas') && isBlock(t)) t.v.forEach((c) => { if (isBlock(c)) c.v.forEach((e) => { if (isBlock(e) && !['use_list_view', 'designer', 'law'].includes(e.k)) add('idea', e.k, s.label); }); }); });
				say(`Reading ${where}: decisions…`);
				const NOT_DECISION = new Set(['allowed', 'visible', 'available', 'icon', 'priority', 'cost', 'modifier', 'target_trigger', 'ai_will_do', 'custom_cost_trigger', 'cancel_trigger', 'remove_trigger', 'complete_effect', 'timeout_effect', 'fire_only_once', 'days_remove', 'days_re_enable']);
				for (const f of await files(s.dir, 'common/decisions', /\.txt$/i)) FB.importer.parse(await text(f)).forEach((c) => { if (isBlock(c)) c.v.forEach((e) => { if (isBlock(e) && !NOT_DECISION.has(e.k)) add('decision', e.k, s.label); }); });
				say(`Reading ${where}: icons…`);
				for (const f of await files(s.dir, 'interface', /\.gfx$/i)) (await text(f)).replace(/name\s*=\s*"(GFX_[^"]+)"/g, (m, n) => { if (/^GFX_goal_/.test(n)) add('goalIcon', n, s.label); else if (/mio/i.test(n)) add('mioIcon', n, s.label); return m; });
				if (!s.game) {
					say('Reading your mod: events…');
					for (const f of await files(s.dir, 'events', /\.txt$/i)) (await text(f)).replace(/(?:country_event|news_event|state_event|unit_leader_event|operative_leader_event)\s*=\s*\{[^}]*?\bid\s*=\s*([\w.]+)/g, (m, id) => { add('event', id, s.label); return m; });
				}
				if (s.game) {
					say('Reading base game: names…');
					const ld = await dirAt(s.dir, ['localisation', 'english']);
					const lf = [];
					await FB.fsutil.walk(ld, '', lf, 0, (n) => /^(countries|state_names|technologies|ideas)[a-z_]*l_english\.ya?ml$/i.test(n) || /^ideas_.*l_english\.ya?ml$/i.test(n));
					for (const f of lf.slice(0, 40)) FB.importer.parseLoc(await text(f), loc);
				}
			} catch (e) { /* keep what we have */ }
		}
		if (FB.ws.active) Object.assign(loc, FB.ws.loc);
		const lists = {};
		const nameOf = { tag: (i) => loc[i.id] || i.id, state: (i) => loc['STATE_' + i.id] || i.fileName || '', tech: (i) => loc[i.id] || pretty(i.id), idea: (i) => loc[i.id] || pretty(i.id), decision: (i) => loc[i.id] || pretty(i.id), event: () => '', goalIcon: (i) => pretty(i.id.replace(/^GFX_goal_/, '')), mioIcon: (i) => pretty(i.id.replace(/^GFX_/, '')) };
		Object.keys(L).forEach((t) => {
			lists[t] = [...L[t].values()].map((i) => ({ id: i.id, name: nameOf[t](i), src: i.src }));
			if (t === 'state') lists[t].sort((a, b) => Number(a.id) - Number(b.id)); else lists[t].sort((a, b) => a.id.localeCompare(b.id));
		});
		GD.lists = lists;
		GD.names = {};
		Object.keys(lists).forEach((t) => { GD.names[t] = new Map(lists[t].map((i) => [i.id, i.name])); });
		GD.ready = true; GD.loading = false; GD.sig = sig();
		GD.status = `${lists.tag.length} countries · ${lists.state.length} states · ${lists.tech.length} techs · ${lists.idea.length} ideas`;
		FB.emit('gd');
	};

	/** Name for an id (e.g. tag GER -> Germany, state 64 -> Brandenburg); '' if unknown. */
	GD.label = (type, id) => {
		if (id == null || id === '') return '';
		const m = GD.names[type];
		return (m && m.get(String(id).trim())) || '';
	};

	const KIND_OF = { idea: 'idea', event: 'event', decision: 'decision', tooltip: 'tooltip', other: 'other' };
	/** Autocomplete items for a field type. Items you defined under "Things to create" come first. */
	GD.items = (type) => {
		const out = [];
		const defined = KIND_OF[type] ? FB.state.project.items.filter((i) => i.kind === KIND_OF[type] && i.id) : [];
		defined.forEach((i) => out.push({ label: i.name ? `${i.name}` : i.id, key: i.id, value: i.id, sub: i.id, cat: 'Defined in Things to create', icon: 'star', color: '#c8a951', desc: (i.plain || i.desc || '').slice(0, 90) }));
		const list = GD.lists[type] || [];
		const icon = { tag: 'flag', state: 'map', tech: 'flask', idea: 'bulb', decision: 'scroll', event: 'scroll', goalIcon: 'star', mioIcon: 'factory' }[type] || 'tag';
		const cat = { tag: 'Countries', state: 'States', tech: 'Technologies', idea: 'Ideas / national spirits', decision: 'Decisions', event: 'Events in your mod', goalIcon: 'Focus icons', mioIcon: 'MIO icons' }[type] || '';
		list.forEach((i) => { if (!defined.some((d) => d.key === i.id)) out.push({ label: i.name && i.name !== i.id ? i.name : i.id, key: i.id + ' ' + i.name, value: i.id, sub: i.id, cat: i.src === 'mod' ? cat + ' · your mod' : cat, icon }); });
		return out;
	};

	FB.on('ws', () => { setTimeout(() => GD.load(false), 50); });
})(window.FB = window.FB || {});
