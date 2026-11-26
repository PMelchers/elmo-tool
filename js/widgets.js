/* Focus Builder - reusable UI widgets: autocomplete combo, suggestion fields, reward/condition editors */
(function (FB) {
	'use strict';
	const h = FB.h;

	/* ---------- how often you picked things (so favourites come first) ---------- */
	const USAGE_KEY = 'focusbuilder.usage.v1';
	const usage = {
		all() { try { return JSON.parse(localStorage.getItem(USAGE_KEY) || '{}'); } catch (e) { return {}; } },
		bump(group, id) { try { const u = usage.all(); u[group] = u[group] || {}; u[group][id] = (u[group][id] || 0) + 1; localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch (e) { /* storage unavailable */ } },
		count(group, id) { const u = usage.all(); return (u[group] && u[group][id]) || 0; }
	};
	FB.usage = usage;

	/* ---------- search ranking ---------- */
	const subseq = (q, s) => { let i = 0; for (const c of s) if (c === q[i]) i++; return i === q.length; };
	FB.rank = function (items, query, limit, group) {
		const q = (query || '').toLowerCase().trim();
		const boost = (it) => (group ? Math.min(6, usage.count(group, it.key || it.label)) * 0.6 : 0);
		if (!q) return items.slice(0, limit || 400);
		const toks = q.split(/\s+/);
		const scored = [];
		for (const it of items) {
			const label = (it.label || '').toLowerCase(), key = (it.key || '').toLowerCase(), kw = (it.kw || '').toLowerCase();
			const desc = (it.desc || '').toLowerCase(), cat = (it.cat || '').toLowerCase(), sub = (it.sub || '').toLowerCase();
			let score = 0, ok = true;
			for (const t of toks) {
				let s = 0;
				if (label === t || sub === t) s += 14;
				if (label.startsWith(t)) s += 10; else if (label.includes(' ' + t)) s += 8; else if (label.includes(t)) s += 6;
				if (sub.startsWith(t)) s += 8; else if (sub.includes(t)) s += 5;
				if (key.includes(t)) s += 5;
				if (kw.includes(t)) s += 4;
				if (cat.includes(t)) s += 2;
				if (desc.includes(t)) s += 1;
				if (!s) { ok = false; break; }
				score += s;
			}
			if (ok) scored.push([score + boost(it), it]);
		}
		scored.sort((a, b) => b[0] - a[0]);
		let res = scored.map((x) => x[1]);
		if (!res.length) {
			const q2 = q.replace(/\s+/g, '');
			res = items.filter((it) => subseq(q2, (it.label || '').toLowerCase().replace(/\s+/g, '')));
		}
		return res.slice(0, limit || 60);
	};
	/** Bold the part of `text` that matches the query. */
	function highlight(text, q) {
		q = (q || '').trim().toLowerCase();
		if (!q) return text;
		const first = q.split(/\s+/)[0];
		const i = String(text).toLowerCase().indexOf(first);
		if (i < 0 || !first) return text;
		return [String(text).slice(0, i), h('mark', {}, String(text).slice(i, i + first.length)), String(text).slice(i + first.length)];
	}

	/* ---------- autocomplete attached to any input ----------
	 * opts: items(), onPick(item), group (usage key), clear (default true), browse, limit, always(), recent (show "recently used" first) */
	function attach(input, opts) {
		let menu = null, list = [], active = 0, typed = false;
		const onScroll = (e) => { if (menu && !menu.contains(e.target)) close(); };
		function close() { if (menu) { menu.remove(); menu = null; window.removeEventListener('scroll', onScroll, true); } }
		function pick(it) {
			close();
			if (opts.group) usage.bump(opts.group, it.key || it.label);
			if (opts.clear === false) input.value = it.value != null ? it.value : it.label; else input.value = '';
			opts.onPick(it);
		}
		function place() {
			const r = input.getBoundingClientRect();
			const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
			const flip = below < 240 && above > below;
			const w = Math.max(r.width, 380);
			menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - w)) + 'px';
			menu.style.width = w + 'px';
			menu.style.maxHeight = Math.max(180, Math.min(440, flip ? above : below)) + 'px';
			if (flip) { menu.style.top = ''; menu.style.bottom = (window.innerHeight - r.top + 4) + 'px'; }
			else { menu.style.bottom = ''; menu.style.top = (r.bottom + 4) + 'px'; }
		}
		function build(q) {
			let items = opts.items();
			let res = FB.rank(items, q, opts.limit || 80, opts.group);
			if (!q.trim() && opts.group) {
				const rec = items.filter((i) => usage.count(opts.group, i.key || i.label) > 0).sort((a, b) => usage.count(opts.group, b.key || b.label) - usage.count(opts.group, a.key || a.label)).slice(0, 5)
					.map((i) => Object.assign({}, i, { cat: 'Recently used' }));
				res = rec.concat(res);
			}
			if (opts.always) opts.always().forEach((a) => { if (!res.includes(a)) res.push(a); });
			return res;
		}
		function draw() {
			const q = opts.browse && !typed ? '' : input.value;
			list = build(q);
			if (!list.length && !opts.always) { close(); return; }
			if (!menu) { menu = h('div', { class: 'combo-menu' }); document.body.appendChild(menu); window.addEventListener('scroll', onScroll, true); }
			if (active >= list.length) active = 0;
			menu.innerHTML = '';
			if (!list.length) menu.appendChild(h('div', { class: 'combo-empty' }, 'No matches. Keep typing to use your own value.'));
			let lastCat = null;
			list.forEach((it, i) => {
				if (!q.trim() && it.cat && it.cat !== lastCat) { menu.appendChild(h('div', { class: 'combo-cat' }, it.cat)); lastCat = it.cat; }
				const bubble = it.icon ? h('span', { class: 'ci-ico', style: it.color ? { color: it.color, background: it.color + '22' } : null }, FB.icon(it.icon, 15)) : null;
				menu.appendChild(h('div', { class: 'combo-item' + (i === active ? ' active' : ''),
					onmousedown: (e) => { e.preventDefault(); pick(it); },
					onmousemove: () => { if (active !== i) { active = i; menu.querySelectorAll('.combo-item').forEach((r, j) => r.classList.toggle('active', j === i)); } } },
				bubble,
				h('div', { class: 'ci-main' },
					h('div', { class: 'ci-top' }, h('span', { class: 'ci-label' }, highlight(it.label, q)), q.trim() && it.cat ? h('span', { class: 'ci-cat' }, it.cat) : null, it.sub && it.sub !== it.label ? h('code', { class: 'ci-sub' }, it.sub) : null),
					it.desc ? h('div', { class: 'ci-desc' }, it.desc) : null)));
			});
			menu.appendChild(h('div', { class: 'combo-foot' }, h('span', {}, '↑↓ move'), h('span', {}, 'Enter / Tab choose'), h('span', {}, 'Esc close')));
			place();
			const a = menu.querySelector('.combo-item.active');
			if (a) a.scrollIntoView({ block: 'nearest' });
		}
		input.addEventListener('focus', () => { typed = false; active = 0; if (opts.browse) input.select(); draw(); });
		input.addEventListener('input', () => { typed = true; active = 0; draw(); });
		input.addEventListener('blur', () => setTimeout(close, 0));
		input.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowDown') { e.preventDefault(); if (!menu) draw(); active = Math.min(list.length - 1, active + 1); draw(); }
			else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
			else if (e.key === 'Enter' || (e.key === 'Tab' && typed && input.value.trim())) { if (menu && list[active]) { e.preventDefault(); pick(list[active]); } }
			else if (e.key === 'Escape') { if (menu) { e.stopPropagation(); close(); } }
		});
		return { close, refresh: draw };
	}
	FB.attachCombo = attach;
	FB.combo = function (opts) {
		const input = h('input', { type: 'text', class: 'combo', placeholder: opts.placeholder || '', autocomplete: 'off', spellcheck: 'false' });
		if (opts.value != null) input.value = opts.value;
		attach(input, opts);
		return input;
	};

	/* ---------- suggestions for typed fields ---------- */
	function suggestItems(type) {
		const gd = FB.gd, cat = FB.catalog;
		const real = (t) => (gd.lists[t] && gd.lists[t].length ? gd.items(t) : null);
		switch (type) {
			case 'tag': return real('tag') || cat.tags.map(([id, name]) => ({ label: name, key: id + ' ' + name, value: id, sub: id, cat: 'Countries', icon: 'flag' }));
			case 'state': return real('state') || [];
			case 'tech': return real('tech') || cat.presets.tech.map((t) => ({ label: t, key: t, value: t, icon: 'flask', cat: 'Technologies' }));
			case 'icon': return real('goalIcon') || cat.icons.map((i) => ({ label: i.label, key: i.key + ' ' + i.kw, value: i.key, sub: i.key, icon: 'star', cat: 'Focus icons' }));
			case 'techcat': return cat.presets.techcat.map((t) => ({ label: t, key: t, value: t, icon: 'flask' }));
			case 'equipment': return cat.presets.equipment.map((t) => ({ label: t, key: t, value: t, icon: 'shield' }));
			case 'flag': case 'variable': {
				const u = FB.collectRefs().filter((r) => r.kind === type);
				return u.map((r) => ({ label: r.id, key: r.id, value: r.id, icon: type === 'flag' ? 'flag' : 'hash', desc: 'Used in: ' + r.focuses.slice(0, 3).join(', '), cat: 'Already used in this project' }));
			}
			default: return gd.items(type);
		}
	}
	FB.suggestItems = suggestItems;
	const SUG_TYPES = new Set(['tag', 'state', 'tech', 'techcat', 'equipment', 'idea', 'event', 'decision', 'flag', 'variable', 'tooltip', 'other', 'icon']);
	const TYPE_ICON = { tag: 'flag', state: 'map', tech: 'flask', idea: 'bulb', event: 'scroll', decision: 'scroll', flag: 'flag', variable: 'hash', icon: 'star', equipment: 'shield', techcat: 'flask', tooltip: 'info', other: 'tag' };

	/* ---------- one parameter field ---------- */
	FB.paramField = function (par, p, onInput) {
		const missing = () => par.req && (p[par.key] === '' || p[par.key] == null || (typeof p[par.key] === 'string' && !p[par.key].trim()));
		let ctl, nameHint = null;
		const wrap = h('label', { class: 'pf pf-' + par.type + (missing() ? ' missing' : '') });
		const set = (v) => { p[par.key] = v; wrap.classList.toggle('missing', !!missing()); onInput(); };
		const showName = () => { if (nameHint) { const n = FB.gd.label(par.type, p[par.key]); nameHint.textContent = n && n !== String(p[par.key]) ? '→ ' + n : ''; } };
		const label = h('span', { class: 'pf-l' }, TYPE_ICON[par.type] ? FB.icon(TYPE_ICON[par.type], 13) : null, par.label, par.req ? h('i', { class: 'req', title: 'required' }, ' *') : null);
		switch (par.type) {
			case 'number':
			case 'percent':
				ctl = h('input', { type: 'number', step: par.step || 'any', min: par.min, max: par.max, value: p[par.key], placeholder: par.ph || '', oninput: (e) => set(e.target.value === '' ? '' : Number(e.target.value)) });
				break;
			case 'select':
				ctl = h('select', { value: p[par.key], onchange: (e) => set(e.target.value) }, par.options.map(([v, l]) => h('option', { value: v }, l)));
				break;
			case 'focus':
				ctl = h('select', { value: p[par.key] || '', onchange: (e) => set(e.target.value) }, h('option', { value: '' }, '— choose a focus —'), FB.state.project.focuses.map((f) => h('option', { value: f.uid }, `${f.name}  (${f.id})`)));
				break;
			case 'longtext':
				ctl = h('textarea', { rows: 4, placeholder: par.ph || '', value: p[par.key] || '', oninput: (e) => set(e.target.value) });
				break;
			case 'code':
				ctl = h('textarea', { rows: 5, class: 'mono', spellcheck: 'false', placeholder: par.ph || '', value: p[par.key] || '', oninput: (e) => set(e.target.value) });
				break;
			default: {
				const numeric = par.type === 'state';
				const input = h('input', { type: 'text', value: p[par.key] == null ? '' : p[par.key], placeholder: par.ph || (SUG_TYPES.has(par.type) ? 'type to search…' : ''), autocomplete: 'off', spellcheck: 'false', inputmode: numeric ? 'numeric' : null,
					oninput: (e) => { const v = e.target.value; set(par.type === 'tag' ? v.toUpperCase() : numeric && /^\d+$/.test(v.trim()) ? Number(v) : v); showName(); } });
				ctl = input;
				if (SUG_TYPES.has(par.type)) {
					wrap.classList.add('has-sug');
					attach(input, { items: () => suggestItems(par.type), clear: false, limit: 120, group: 'field:' + par.type,
						onPick: (it) => { const v = it.value != null ? it.value : it.label; set(par.type === 'state' ? Number(v) : v); showName(); } });
					nameHint = h('span', { class: 'pf-name' });
					showName();
					if (numeric) input.addEventListener('change', () => { // a state typed by name becomes its number
						const v = String(input.value).trim();
						const m = v && !/^\d+$/.test(v) ? (FB.gd.lists.state || []).find((s) => s.name.toLowerCase() === v.toLowerCase()) : null;
						if (m) { input.value = m.id; set(Number(m.id)); showName(); }
					});
				}
			}
		}
		wrap.appendChild(label);
		const unit = par.suffix || par.unit;
		wrap.appendChild(unit ? h('span', { class: 'pf-in' }, ctl, h('span', { class: 'pf-suf' }, unit)) : ctl);
		if (nameHint) wrap.appendChild(nameHint);
		if (par.hint) wrap.appendChild(h('span', { class: 'pf-hint' }, par.hint));
		return wrap;
	};

	/* ---------- reward / condition list editor ----------
	 * kind: 'effect' | 'trigger'; arr: array of {type, p, not?}
	 * cb: { changed(), structural() }  changed = typing (no redraw), structural = add/remove/move */
	FB.renderItemList = function (host, arr, kind, cb) {
		host.innerHTML = '';
		const isEff = kind === 'effect';
		const cat = FB.catalog;

		if (!arr.length) host.appendChild(h('div', { class: 'empty-state' }, FB.icon(isEff ? 'gift' : 'check', 22),
			h('div', {}, h('b', {}, isEff ? 'No rewards yet' : 'No extra requirements'), h('span', {}, isEff ? 'Search below for what this focus should give the player.' : 'The focus can be started as soon as its prerequisites are done.'))));

		arr.forEach((it, idx) => {
			const def = cat.def(kind, it.type);
			const color = def ? FB.catColor(def.cat) : '#8e98a3';
			const pre = h('pre', { class: 'code-prev' });
			const refreshPrev = () => { pre.textContent = FB.itemCode(kind, it).join('\n'); };
			const card = h('div', { class: 'ecard', style: { '--cc': color } });
			const head = h('div', { class: 'ecard-h' },
				h('span', { class: 'ecard-ico' }, FB.icon(def ? FB.catIcon(def.cat) : 'alert', 17)),
				h('div', { class: 'ecard-t' }, h('b', {}, def ? def.label : 'Unknown: ' + it.type), def && def.id[0] !== '_' ? h('code', {}, def.id) : null),
				h('div', { class: 'ecard-b' },
					!isEff ? h('label', { class: 'not-toggle', title: 'Turn this into its opposite ("NOT")' }, h('input', { type: 'checkbox', checked: !!it.not, onchange: (e) => { it.not = e.target.checked; refreshPrev(); card.classList.toggle('is-not', it.not); cb.changed(); } }), 'NOT') : null,
					h('button', { class: 'ibtn', title: 'Move up', disabled: idx === 0, onclick: () => { arr.splice(idx - 1, 0, arr.splice(idx, 1)[0]); cb.structural(); } }, FB.icon('chevron-left', 15, 'rot90')),
					h('button', { class: 'ibtn', title: 'Move down', disabled: idx === arr.length - 1, onclick: () => { arr.splice(idx + 1, 0, arr.splice(idx, 1)[0]); cb.structural(); } }, FB.icon('chevron-right', 15, 'rot90')),
					h('button', { class: 'ibtn danger', title: 'Remove', onclick: () => { arr.splice(idx, 1); cb.structural(); } }, FB.icon('trash', 15))));
			card.appendChild(head);
			if (def) {
				if (def.desc && def.id[0] !== '_') card.appendChild(h('div', { class: 'ecard-d' }, def.desc));
				const grid = h('div', { class: 'pgrid' });
				def.params.forEach((par) => {
					if (it.p[par.key] === undefined) it.p[par.key] = par.def;
					grid.appendChild(FB.paramField(par, it.p, () => { refreshPrev(); cb.changed(); }));
				});
				card.appendChild(grid);
			}
			card.classList.toggle('is-not', !!it.not);
			refreshPrev();
			card.appendChild(h('details', { class: 'code-det' }, h('summary', {}, FB.icon('code', 13), ' HOI4 code'), pre));
			host.appendChild(card);
		});

		/* the autocomplete "add" box */
		const defs = (isEff ? cat.effects : cat.triggers).filter((d) => d.id[0] !== '_');
		const specials = (isEff ? cat.effects : cat.triggers).filter((d) => d.id[0] === '_');
		const toItem = (d) => ({ label: d.label, key: d.id, sub: d.id[0] === '_' ? '' : d.id, cat: d.cat, desc: d.desc, kw: d.kw, def: d, icon: FB.catIcon(d.cat), color: FB.catColor(d.cat) });
		const all = defs.map(toItem);
		if (isEff) cat.recipes.forEach((r) => all.unshift({ label: r.label, key: r.id, cat: r.cat, desc: r.desc, kw: r.kw, recipe: r, icon: 'sparkles', color: FB.catColor(r.cat) }));
		const spItems = specials.map(toItem);
		const addItem = (picked) => {
			if (picked.recipe) {
				picked.recipe.items.forEach(([type, p]) => arr.push({ type, p: Object.assign(cat.defaults(cat.effectMap[type]), p) }));
				FB.toast(`Added ${picked.recipe.items.length} rewards. Fill in any empty fields.`);
			} else arr.push({ type: picked.def.id, p: cat.defaults(picked.def), not: false });
			cb.structural();
		};
		host.appendChild(h('div', { class: 'add-row' },
			h('div', { class: 'add-box' }, FB.icon('plus', 16),
				FB.combo({
					placeholder: isEff ? 'Add a reward: try "stability", "factory", "war", "event"…' : 'Add a requirement: try "date", "war", "flag"…',
					items: () => all, always: () => spItems, onPick: addItem, group: isEff ? 'reward' : 'cond', limit: 100
				})),
			h('span', { class: 'add-tip' }, 'Click the box to browse everything, or just start typing.')));
		return host;
	};

	/** Conditions block: all/any switch + list. */
	FB.renderCondEditor = function (host, cond, cb) {
		host.innerHTML = '';
		const list = h('div');
		const head = h('div', { class: 'cond-mode' },
			h('span', {}, 'The focus needs'),
			h('select', { value: cond.mode, onchange: (e) => { cond.mode = e.target.value; cb.structural(); } },
				h('option', { value: 'all' }, 'ALL of these'), h('option', { value: 'any' }, 'ANY ONE of these')));
		if (cond.items.length > 1) host.appendChild(head);
		host.appendChild(list);
		FB.renderItemList(list, cond.items, 'trigger', cb);
	};

	/** Kept for older callers: suggestion lists are now built on demand, nothing to refresh. */
	FB.refreshDatalists = function () {};
})(window.FB = window.FB || {});
