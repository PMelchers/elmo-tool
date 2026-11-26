/* Focus Builder - the focus tree canvas: pan, zoom, drag, link, context menu */
(function (FB) {
	'use strict';
	const h = FB.h;
	const CW = 190, CH = 130, NW = 168, NH = 84;
	let vp, world, svg, layer, ctxMenu, hint;
	const nodeEls = new Map();
	let drag = null, pan = null, link = null;
	let issueMap = new Map();
	let orderIds = null, orderMap = new Map(); // focus order of a guide, shown as numbers on the nodes

	const view = () => FB.state.project.view;
	const cellPos = (f) => ({ x: f.x * CW + (CW - NW) / 2, y: f.y * CH + (CH - NH) / 2 });
	const toWorld = (cx, cy) => {
		const r = vp.getBoundingClientRect(), v = view();
		return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
	};
	const toCell = (wx, wy) => ({ x: Math.floor(wx / CW), y: Math.floor(wy / CH) });
	const filterColor = (f) => {
		const first = FB.allFilters(f)[0];
		const fl = FB.catalog.filters.find((x) => x.id === first);
		return fl ? fl.color : '#5d6b78';
	};

	function applyView() {
		const v = view();
		world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
		vp.style.backgroundSize = `${CW * v.z}px ${CH * v.z}px`;
		vp.style.backgroundPosition = `${v.x}px ${v.y}px`;
		const z = document.getElementById('zoom-label');
		if (z) z.textContent = Math.round(v.z * 100) + '%';
	}

	/** Icon + colour for a node: from the focus filter (focus trees) or the kind of bonus (MIO traits). */
	FB.nodeGlyph = function (f) {
		if (FB.state.project.kind === 'mio') {
			const b = f.bonuses || {};
			if ((b.equipment_bonus || []).length) return { icon: 'shield', color: '#5b8def' };
			if ((b.production_bonus || []).length) return { icon: 'factory', color: '#e09a3a' };
			if ((b.organization_modifier || []).length) return { icon: 'cog', color: '#b07ae0' };
			return { icon: f.initial ? 'star' : 'info', color: '#8e98a3' };
		}
		const first = FB.allFilters(f)[0];
		const fl = FB.catalog.filters.find((x) => x.id === first);
		return { icon: FB.filterIcon(first), color: fl ? fl.color : '#8e98a3' };
	};

	function makeNode(f) {
		const el = h('div', { class: 'node', 'data-uid': f.uid, tabindex: -1 },
			h('div', { class: 'n-stripe' }),
			h('div', { class: 'n-ico' }),
			h('div', { class: 'n-txt' }, h('div', { class: 'n-name' }), h('div', { class: 'n-meta' })),
			h('div', { class: 'n-warn', title: '' }, '!'),
			h('div', { class: 'n-order', hidden: true }),
			h('div', { class: 'n-handle', title: 'Drag onto another focus to make that one require this one' }));
		return el;
	}

	const metaItem = (icon, text) => h('span', {}, FB.icon(icon, 12), text);

	function updateNode(el, f) {
		const p = cellPos(f);
		el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
		el.style.width = NW + 'px'; el.style.height = NH + 'px';
		el.classList.toggle('selected', FB.state.selected === f.uid);
		const g = FB.nodeGlyph(f);
		el.style.setProperty('--nc', g.color);
		el.querySelector('.n-stripe').style.background = g.color;
		const ico = el.querySelector('.n-ico');
		// the focus's own picture from the game or mod (needs the helper); the drawn glyph stays until it has loaded
		const gname = FB.gfx && FB.gfx.ready && FB.state.project.kind !== 'mio' ? FB.gfx.find([f.icon || FB.state.project.meta.defaultIcon || 'GFX_goal_unknown']) : null;
		const ikey = g.icon + '|' + (gname || '');
		if (ico.dataset.i !== ikey) { ico.dataset.i = ikey; ico.innerHTML = ''; ico.classList.remove('has-img'); ico.appendChild(FB.icon(g.icon, 19)); if (gname) FB.gfx.attach(ico, [gname]); }
		const ob = el.querySelector('.n-order'), on = orderMap.get(f.id);
		ob.hidden = !on; ob.textContent = on ? on.join(', ') : '';
		el.classList.toggle('in-order', !!on);
		el.querySelector('.n-name').textContent = f.name || '(unnamed)';
		const meta = el.querySelector('.n-meta');
		meta.innerHTML = '';
		if (FB.state.project.kind === 'mio') {
			const b = f.bonuses || {}, n = ['equipment_bonus', 'production_bonus', 'organization_modifier'].reduce((a, k) => a + (b[k] || []).length, 0);
			meta.append(metaItem(f.initial ? 'star' : 'bolt', (f.initial ? 'Start · ' : '') + `${n} bonus${n === 1 ? '' : 'es'}`));
		} else {
			const rew = f.rewards.length;
			meta.append(metaItem('clock', `${f.weeks} wk`), metaItem('gift', String(rew)));
		}
		const iss = issueMap.get(f.uid) || [];
		const worst = iss.some((i) => i.level === 'error') ? 'error' : iss.some((i) => i.level === 'warn') ? 'warn' : '';
		el.classList.toggle('has-error', worst === 'error');
		el.classList.toggle('has-warn', worst === 'warn');
		el.querySelector('.n-warn').title = iss.filter((i) => i.level !== 'info').map((i) => i.msg).join('\n');
	}

	function drawLines() {
		const P = FB.state.project, fs = P.focuses, sel = FB.state.selected;
		const parts = [];
		const bottom = (f) => { const p = cellPos(f); return { x: p.x + NW / 2, y: p.y + NH }; };
		const top = (f) => { const p = cellPos(f); return { x: p.x + NW / 2, y: p.y }; };
		fs.forEach((f) => {
			f.prereqs.forEach((g) => {
				const or = g.length > 1;
				g.forEach((u) => {
					const pf = FB.getFocus(u);
					if (!pf) return;
					const a = bottom(pf), b = top(f);
					const midY = b.y > a.y ? a.y + (b.y - a.y) / 2 : a.y + 24;
					let d;
					if (b.y > a.y) d = `M${a.x},${a.y} L${a.x},${midY} L${b.x},${midY} L${b.x},${b.y}`;
					else d = `M${a.x},${a.y} L${a.x},${a.y + 18} L${b.x + (a.x === b.x ? 40 : 0)},${a.y + 18} L${b.x + (a.x === b.x ? 40 : 0)},${b.y - 18} L${b.x},${b.y - 18} L${b.x},${b.y}`;
					const hl = sel && (sel === f.uid || sel === pf.uid);
					parts.push(`<path d="${d}" class="edge${or ? ' or' : ''}${hl ? ' hl' : ''}" marker-end="url(#arr)"/>`);
				});
			});
		});
		const done = new Set();
		fs.forEach((f) => f.excl.forEach((u) => {
			const o = FB.getFocus(u); if (!o) return;
			const key = [f.uid, u].sort().join('|'); if (done.has(key)) return; done.add(key);
			const a = cellPos(f), b = cellPos(o);
			const ax = a.x + NW / 2, ay = a.y + NH / 2, bx = b.x + NW / 2, by = b.y + NH / 2;
			const mx = (ax + bx) / 2, my = (ay + by) / 2;
			parts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="excl"/><g class="excl-x" transform="translate(${mx},${my})"><circle r="11"/><path d="M-4,-4 L4,4 M4,-4 L-4,4"/></g>`);
		}));
		if (link) parts.push(`<path d="M${link.x1},${link.y1} L${link.x2},${link.y2}" class="edge tmp"/>`);
		svg.innerHTML = '<defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="arrowhead"/></marker></defs>' + parts.join('');
	}

	function render() {
		const P = FB.state.project;
		issueMap = new Map();
		FB.validate().forEach((i) => { if (i.uid) { if (!issueMap.has(i.uid)) issueMap.set(i.uid, []); issueMap.get(i.uid).push(i); } });
		const seen = new Set();
		orderMap = new Map();
		if (orderIds) orderIds.forEach((id, i) => { if (!orderMap.has(id)) orderMap.set(id, []); orderMap.get(id).push(i + 1); });
		P.focuses.forEach((f) => {
			let el = nodeEls.get(f.uid);
			if (!el) { el = makeNode(f); nodeEls.set(f.uid, el); layer.appendChild(el); }
			updateNode(el, f);
			seen.add(f.uid);
		});
		for (const [u, el] of nodeEls) if (!seen.has(u)) { el.remove(); nodeEls.delete(u); }
		drawLines();
		applyView();
		hint.style.display = P.focuses.length ? 'none' : '';
	}

	/* ---------- view control ---------- */
	function fit() {
		const fs = FB.state.project.focuses, r = vp.getBoundingClientRect();
		if (!fs.length) { Object.assign(view(), { x: 80, y: 60, z: 1 }); applyView(); return; }
		const minX = Math.min(...fs.map((f) => f.x)) * CW, maxX = (Math.max(...fs.map((f) => f.x)) + 1) * CW;
		const minY = Math.min(...fs.map((f) => f.y)) * CH, maxY = (Math.max(...fs.map((f) => f.y)) + 1) * CH;
		const z = FB.clamp(Math.min((r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY)), 0.3, 1.1);
		const v = view();
		v.z = z; v.x = (r.width - (maxX - minX) * z) / 2 - minX * z; v.y = (r.height - (maxY - minY) * z) / 2 - minY * z;
		applyView();
	}
	function centerOn(u) {
		const f = FB.getFocus(u); if (!f) return;
		const r = vp.getBoundingClientRect(), v = view(), p = cellPos(f);
		v.x = r.width / 2 - (p.x + NW / 2) * v.z; v.y = r.height / 2 - (p.y + NH / 2) * v.z;
		applyView();
	}
	function zoomAt(cx, cy, factor) {
		const v = view(), r = vp.getBoundingClientRect();
		const nz = FB.clamp(v.z * factor, 0.3, 2);
		const px = cx - r.left, py = cy - r.top;
		v.x = px - (px - v.x) * (nz / v.z); v.y = py - (py - v.y) * (nz / v.z); v.z = nz;
		applyView();
	}
	const saveView = FB.debounce(() => FB.commit('view', { canvasOnly: true, silent: true }), 600);

	/* ---------- interaction ---------- */
	function nodeFromEvent(e) { const n = e.target.closest && e.target.closest('.node'); return n ? n.dataset.uid : null; }

	function onPointerDown(e) {
		hideMenu();
		if (e.button === 2) return;
		const u = nodeFromEvent(e);
		vp.focus({ preventScroll: true });
		if (u && FB.dev.on && e.target.classList.contains('n-handle')) {
			const f = FB.getFocus(u), p = cellPos(f);
			link = { from: u, x1: p.x + NW / 2, y1: p.y + NH, x2: p.x + NW / 2, y2: p.y + NH + 10 };
			e.preventDefault();
			return;
		}
		if (u) {
			if (FB.state.selected !== u) FB.select(u);
			if (!FB.dev.on) { e.preventDefault(); return; } // normal mode: nodes can be selected, never moved
			const f = FB.getFocus(u), w = toWorld(e.clientX, e.clientY);
			drag = { uid: u, sx: e.clientX, sy: e.clientY, ox: w.x - cellPos(f).x, oy: w.y - cellPos(f).y, moved: false, nx: f.x, ny: f.y };
			e.preventDefault();
			return;
		}
		pan = { sx: e.clientX, sy: e.clientY, vx: view().x, vy: view().y, moved: false };
		vp.classList.add('panning');
	}
	function onPointerMove(e) {
		if (link) {
			const w = toWorld(e.clientX, e.clientY);
			link.x2 = w.x; link.y2 = w.y; drawLines();
		} else if (drag) {
			if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
			drag.moved = true;
			const w = toWorld(e.clientX, e.clientY);
			const c = toCell(w.x - drag.ox + NW / 2, w.y - drag.oy + NH / 2);
			if (c.x !== drag.nx || c.y !== drag.ny) {
				drag.nx = c.x; drag.ny = c.y;
				const f = FB.getFocus(drag.uid); f.x = c.x; f.y = c.y;
				const el = nodeEls.get(drag.uid); const p = cellPos(f); el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
				drawLines();
			}
			nodeEls.get(drag.uid).classList.add('dragging');
		} else if (pan) {
			const v = view();
			v.x = pan.vx + (e.clientX - pan.sx); v.y = pan.vy + (e.clientY - pan.sy);
			if (Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) > 3) pan.moved = true;
			applyView();
		}
	}
	function onPointerUp(e) {
		if (link) {
			const el = document.elementFromPoint(e.clientX, e.clientY);
			const n = el && el.closest && el.closest('.node');
			const from = link.from; link = null;
			if (n && n.dataset.uid !== from) {
				if (FB.addPrereq(n.dataset.uid, from)) { FB.commit('link'); FB.toast('Linked: the second focus now requires the first.'); }
			}
			drawLines();
		}
		if (drag) {
			const el = nodeEls.get(drag.uid); if (el) el.classList.remove('dragging');
			if (drag.moved) FB.commit('move');
			drag = null;
		}
		if (pan) {
			vp.classList.remove('panning');
			if (!pan.moved && !nodeFromEvent(e)) FB.select(null);
			if (pan.moved) saveView();
			pan = null;
		}
	}

	/* ---------- context menu ---------- */
	function hideMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
	function showMenu(e, entries) {
		hideMenu();
		ctxMenu = h('div', { class: 'ctx', style: { left: e.clientX + 'px', top: e.clientY + 'px' } },
			entries.map((en) => h('button', { class: 'ctx-i' + (en.danger ? ' danger' : ''), onclick: () => { hideMenu(); en.run(); } }, en.label)));
		document.body.appendChild(ctxMenu);
		const r = ctxMenu.getBoundingClientRect();
		if (r.right > innerWidth) ctxMenu.style.left = (innerWidth - r.width - 6) + 'px';
		if (r.bottom > innerHeight) ctxMenu.style.top = (innerHeight - r.height - 6) + 'px';
	}
	function onContext(e) {
		e.preventDefault();
		if (!FB.dev.on) return;
		const u = nodeFromEvent(e);
		const w = toWorld(e.clientX, e.clientY), c = toCell(w.x, w.y);
		if (u) {
			FB.select(u);
			showMenu(e, [
				{ label: 'Add follow-up focus below', run: () => { FB.addFocus({ from: u }); FB.commit('add', { full: true }); } },
				{ label: 'Add follow-up to the right', run: () => { const f = FB.getFocus(u); FB.addFocus({ from: u, x: f.x + 1, y: f.y + 1 }); FB.commit('add', { full: true }); } },
				{ label: 'Duplicate', run: () => { FB.duplicateFocus(u); FB.commit('dup', { full: true }); } },
				{ label: 'Delete focus', danger: true, run: () => { FB.deleteFocus(u); FB.commit('del', { full: true }); } }
			]);
		} else {
			showMenu(e, [{ label: 'New focus here', run: () => { FB.addFocus({ x: c.x, y: c.y }); FB.commit('add', { full: true }); } }]);
		}
	}

	function onKey(e) {
		const u = FB.state.selected, f = u && FB.getFocus(u);
		if (e.target !== vp || !FB.dev.on) return;
		const mv = (dx, dy) => { if (!f) return; f.x += dx; f.y += dy; FB.commit('move'); e.preventDefault(); };
		if (e.key === 'Delete' || e.key === 'Backspace') { if (f) { FB.deleteFocus(u); FB.commit('del', { full: true }); e.preventDefault(); } }
		else if (e.key === 'ArrowLeft') mv(-1, 0); else if (e.key === 'ArrowRight') mv(1, 0);
		else if (e.key === 'ArrowUp') mv(0, -1); else if (e.key === 'ArrowDown') mv(0, 1);
		else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { if (f) { FB.duplicateFocus(u); FB.commit('dup', { full: true }); } e.preventDefault(); }
		else if (e.key === 'n' || e.key === 'N') { FB.addFocus({ from: u || undefined }); FB.commit('add', { full: true }); e.preventDefault(); }
	}

	function init() {
		vp = document.getElementById('viewport');
		world = h('div', { id: 'world' });
		svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('id', 'edges');
		layer = h('div', { id: 'nodes' });
		world.append(svg, layer);
		hint = h('div', { class: 'canvas-hint' }, h('b', {}, 'Your tree is empty.'), h('br'), 'Double-click anywhere (or press ', h('kbd', {}, 'N'), ') to place your first focus.');
		vp.append(world, hint);
		vp.addEventListener('pointerdown', onPointerDown);
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		vp.addEventListener('contextmenu', onContext);
		vp.addEventListener('keydown', onKey);
		window.addEventListener('pointerdown', (e) => { if (ctxMenu && !ctxMenu.contains(e.target)) hideMenu(); }, true);
		vp.addEventListener('dblclick', (e) => {
			const hit = nodeFromEvent(e);
			if (hit) { if (FB.ui.setFull) { FB.select(hit); FB.ui.setFull(true); } return; }
			if (!FB.dev.on) return;
			const w = toWorld(e.clientX, e.clientY), c = toCell(w.x, w.y);
			FB.addFocus({ x: c.x, y: c.y }); FB.commit('add', { full: true });
		});
		vp.addEventListener('wheel', (e) => {
			e.preventDefault();
			zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
			saveView();
		}, { passive: false });
		document.getElementById('zoom-in').onclick = () => { const r = vp.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); saveView(); };
		document.getElementById('zoom-out').onclick = () => { const r = vp.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); saveView(); };
		document.getElementById('zoom-fit').onclick = () => { fit(); saveView(); };
		new ResizeObserver(() => applyView()).observe(vp);
	}

	/** Shows a guide's focus order as numbers on the nodes (ids in order), or hides it (null). */
	function setOrder(ids) { orderIds = ids && ids.length ? ids.slice() : null; render(); }

	FB.canvas = { init, render, fit, centerOn, setOrder, CW, CH, NW, NH };
})(window.FB = window.FB || {});
