/* Focus Builder - Designer: build tank / ship designs from the real game data, tweak modules, make test modules, compare */
(function (FB) {
	'use strict';
	const h = FB.h;
	const E = FB.equip;
	const LS_KEY = 'focusbuilder.designs.v1';
	const DOMAINS = [['land', 'Tanks'], ['naval', 'Ships']];
	const D = { open: false, domain: 'land', nation: '', arch: null, design: null, cmp: 'default', showCmp: false, saved: [], loaded: '', status: '', msg: '' };
	let root, body;

	/* Engine size / armor thickness: the game computes these in its own code, so the effect per step is an editable assumption. */
	const RULE_KEY = 'focusbuilder.dialrules.v1';
	const DIAL_NEUTRAL = 5; // only for old saved designs (dials used to run 1-10 around 5)
	/** The upgrades (engine / armor clicks) this chassis can take, read from the chassis in the game or mod files. */
	const upsFor = (v) => { const all = (E.data && E.data.upgrades) || {}; return (v && v.upgrades ? v.upgrades : []).map((k) => all[k]).filter(Boolean); };
	const upKind = (u) => (u.abbr === 'eng' || /engine/.test(u.key) ? 'engine' : u.abbr === 'arm' || /armor/.test(u.key) ? 'armor' : 'other');
	const upLabel = (u) => {
		const loc = E.data && E.data.loc ? E.data.loc[u.key] : '';
		if (loc && !/\$/.test(loc)) return loc;
		return { engine: 'Engine', armor: 'Armor' }[upKind(u)] || prettyKey(u.key.replace(/^tank_nsb_|_upgrade$/g, ''));
	};
	/** Clicks per upgrade key, 0 = no clicks. Designs saved with the old engine / armor dials keep their numbers. */
	function clicks(dz, v) {
		const d = dz.dials || {};
		if (d.v !== 3) {
			const lv = {};
			if (d.v === 2) upsFor(v).forEach((u) => { const k = upKind(u); if ((k === 'engine' || k === 'armor') && d[k] && lv[u.key] == null) lv[u.key] = d[k]; });
			dz.dials = { v: 3, levels: lv, engine: d.v === 2 ? d.engine || 0 : 0, armor: d.v === 2 ? d.armor || 0 : 0 };
		}
		return dz.dials;
	}
	const DIALS = { engine: { label: 'Engine', icon: 'bolt' }, armor: { label: 'Armor', icon: 'shield' } };
	const DEFAULT_RULES = { engine: { maximum_speed: 5, fuel_consumption: 5, build_cost_ic: 2, reliability: -1 }, armor: { armor_value: 5, build_cost_ic: 2.5, maximum_speed: -2 } };
	D.rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
	const load = () => {
		try { D.saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { D.saved = []; }
		try { const r = JSON.parse(localStorage.getItem(RULE_KEY) || 'null'); if (r && r.engine && r.armor) D.rules = r; } catch (e) { /* keep defaults */ }
	};
	const saveRules = () => { try { localStorage.setItem(RULE_KEY, JSON.stringify(D.rules)); } catch (e) { /* storage unavailable */ } };
	const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(D.saved)); } catch (e) { /* storage unavailable */ } };
	const sig = () => (FB.server.active ? 'g' : '') + '|' + (FB.ws.active ? FB.ws.name + '|' + (FB.ws.path || '') : '');
	const variant = (d) => (E.data && E.data.variants[d.variant]) || null;
	const prettyKey = (k) => { const s = String(k).replace(/_/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };

	/* ---------- loading data ---------- */
	async function ensureData(force) {
		if (D.loading) return;
		if (E.data && !force && D.loaded === sig()) return;
		const sources = [];
		try {
			if (FB.server.active && FB.server.info && FB.server.info.game) {
				await FB.server.post('open', { path: FB.server.info.game });
				sources.push({ label: 'Base game', dir: FB.server.dir(FB.server.info.game, 'Hearts of Iron IV') });
			}
			if (FB.ws.active) sources.push({ label: FB.ws.name, dir: FB.ws.dir, loc: FB.ws.loc });
		} catch (e) { D.msg = 'Could not read the base game: ' + e.message; }
		if (!sources.length) { E.data = null; D.loaded = sig(); render(); return; }
		D.loading = true; D.status = 'Reading equipment…'; render();
		try {
			await E.load(sources, (m) => { D.status = m; const el = document.getElementById('dz-status'); if (el) el.textContent = m; });
			D.msg = '';
		} catch (e) { D.msg = 'Could not read equipment: ' + (e.message || e); E.data = null; }
		D.status = 'Reading game icons…'; render();
		try { if (FB.gfx) await FB.gfx.load(true); } catch (e) { /* icons are optional */ }
		D.loading = false; D.status = ''; D.loaded = sig();
		D.arch = null; D.design = null;
		render();
	}

	/* ---------- nations and variants ---------- */
	const natName = (n) => { if (!n) return 'Generic'; const l = FB.gd && FB.gd.ready ? FB.gd.label('tag', n) : ''; return l && l !== n ? n + ' · ' + l : n; };
	const defaultVariant = (g) => { const gen = g.variants.filter((v) => !v.nation); const list = gen.length ? gen : g.variants; return list[list.length - 1]; };
	const visibleVariants = (g, keep) => g.variants.filter((v) => D.nation === '' || (D.nation === '__generic' ? !v.nation : v.nation === D.nation) || v.key === keep);
	const variantLabel = (v) => (v.nation ? '[' + v.nation + '] ' : '') + v.name + (v.year ? ' (' + v.year + ')' : '');

	/* ---------- design helpers ---------- */
	function newDesign(v) {
		return { id: FB.uid(), name: 'My ' + (v.name || v.key).toLowerCase(), domain: v.domain, variant: v.key, sel: E.defaultSelection(v), note: '', dials: { v: 2, engine: 0, armor: 0 } };
	}
	function ensureSelection() {
		const d = E.data;
		if (!d) return;
		const groups = d.groups[D.domain];
		if (!groups.length) { D.arch = null; D.design = null; return; }
		if (!D.arch || !groups.find((g) => g.key === D.arch)) { D.arch = (groups.find((g) => /^medium_tank/.test(g.key)) || groups.find((g) => /ship_hull_cruiser/.test(g.key)) || groups.find((g) => /single_engine/.test(g.key)) || groups[0]).key; D.design = null; }
		if (!D.design || D.design.domain !== D.domain || !variant(D.design)) {
			const g = groups.find((x) => x.key === D.arch);
			D.design = newDesign(defaultVariant(g));
		}
	}
	/** E.calc plus the engine / armor dials (tanks only). */
	function calcDesign(v, dz) {
		if (v.domain !== 'land') return E.calc(v, dz.sel);
		const dials = clicks(dz, v), list = upsFor(v);
		// the chassis' own upgrades from the game / mod files; without them the editable rules below (per click)
		if (list.length) return E.calc(v, dz.sel, list.map((up) => ({ up, level: Math.min(dials.levels[up.key] || 0, up.max || 0) })));
		const res = E.calc(v, dz.sel);
		Object.keys(DIALS).forEach((name) => {
			const step = dials[name] || 0;
			if (!step) return;
			Object.entries(D.rules[name] || {}).forEach(([k, pct]) => {
				const s = res.stats[k];
				if (!s || !pct) return;
				s.value *= 1 + step * pct / 100;
				s.dial = (s.dial || 0) + step * pct;
			});
		});
		return res;
	}
	const designStats = (dz) => { const v = variant(dz); return v ? calcDesign(v, dz) : null; };
	const defaultOf = (v) => ({ id: 'default:' + v.key, name: 'Default ' + variantLabel(v), domain: v.domain, variant: v.key, sel: E.defaultSelection(v) });

	/* ---------- ground duel (simplified) ---------- */
	const PIERCE_PENALTY = 0.5;
	function hit(att, def) {
		const a = att.stats, b = def.stats;
		const v = (s, k) => (s[k] ? s[k].value : 0);
		const hard = Math.min(1, Math.max(0, v(b, 'hardness')));
		let dmg = v(a, 'soft_attack') * (1 - hard) + v(a, 'hard_attack') * hard;
		const pierced = v(a, 'ap_attack') >= v(b, 'armor_value');
		if (!pierced) dmg *= PIERCE_PENALTY;
		return { dmg, pierced };
	}

	/* ---------- look and feel of the in-game designer ---------- */
	const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
	const tierOf = (m) => {
		if (!m) return 0;
		const r = /_(?:tier_)?(\d)$/.exec(m.key) || /(\d)$/.exec(m.key);
		const n = r ? Number(r[1]) : 0;
		return n >= 1 && n <= 6 ? n : 0;
	};
	const modIcon = (cat, slotName) => {
		const t = ((cat || '') + ' ' + (slotName || '')).toLowerCase();
		if (/torpedo|mine|depth/.test(t)) return 'anchor';
		if (/anti_air|_aa|aa_/.test(t)) return 'plane';
		if (/engine/.test(t)) return 'bolt';
		if (/armor|armour/.test(t)) return 'shield';
		if (/suspension|wheel|track/.test(t)) return 'wrench';
		if (/turret/.test(t)) return 'cog';
		if (/radar|sonar|radio|fire_control/.test(t)) return 'globe';
		if (/armament|cannon|gun|battery|flame|howitzer|rocket|main_/.test(t)) return 'crosshair';
		if (/special|secondar|custom/.test(t)) return 'sparkles';
		return 'layers';
	};
	const shortSlot = (n) => prettyKey(n.replace(/^fixed_ship_/, '').replace(/_slot/g, '').replace(/_type/g, '').replace(/_custom/g, '').replace(/_/g, ' '));

	const tankClass = (v) => { const k = v.archetype + ' ' + v.key; return /armored_car/.test(k) ? 'car' : /super_heavy/.test(k) ? 'super' : /heavy/.test(k) ? 'heavy' : /light/.test(k) ? 'light' : /amphib/.test(k) ? 'amph' : /modern/.test(k) ? 'modern' : 'medium'; };
	const shipClass = (v) => { const k = v.archetype + ' ' + v.key; return /carrier/.test(k) ? 'carrier' : /submarine/.test(k) ? 'submarine' : /heavy|battle/.test(k) ? 'battleship' : /cruiser/.test(k) ? 'cruiser' : 'destroyer'; };

	/** Side-view drawing of a tank. model=false: white blueprint lines; model=true: filled like a rendered model. */
	function tankSvg(cls, gunTier, model) {
		const sc = { light: 0.8, medium: 0.95, heavy: 1.1, super: 1.25, car: 0.9, amph: 0.9, modern: 1 }[cls] || 1;
		const fill = model ? 'url(#dzTank)' : 'none';
		const sk = model ? '#0c0f12' : '#f3f7fb';
		const gun = gunTier > 0 ? 40 + gunTier * 16 : 0;
		let run = '';
		if (cls === 'car') [100, 160, 240, 300].forEach((x) => { run += `<circle cx="${x}" cy="152" r="24"/><circle cx="${x}" cy="152" r="9"/>`; });
		else {
			run += '<rect x="58" y="136" width="284" height="40" rx="20"/>';
			for (let i = 0; i < 7; i++) run += `<circle cx="${86 + i * 38}" cy="156" r="12"/>`;
		}
		const defs = model ? '<defs><linearGradient id="dzTank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a9277"/><stop offset="1" stop-color="#3c4237"/></linearGradient></defs>' : '';
		const dim = model ? '' : '<path d="M58 196H342M58 190V202M342 190V202" stroke-opacity=".45" stroke-width="1.2"/><path d="M372 70V176M366 70H378M366 176H378" stroke-opacity=".45" stroke-width="1.2"/>';
		const turret = cls === 'car' || cls === 'modern' ? '<path d="M158 108L168 84H236L248 108Z"/>' : '<path d="M148 108L160 78H240L254 108Z"/><rect x="188" y="68" width="24" height="10" rx="2"/>';
		const barrel = gun ? `<rect x="252" y="87" width="${gun}" height="7" rx="2"/><rect x="${252 + gun}" y="84" width="9" height="13" rx="2"/>` : '';
		return `<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">${defs}<g fill="${fill}" stroke="${sk}" stroke-width="${model ? 1.4 : 2.2}" stroke-linejoin="round" stroke-linecap="round">${dim}
			<g transform="translate(200 176) scale(${sc}) translate(-200 -176)">${run}<path d="M72 138L100 108H300L332 138Z"/>${turret}${barrel}<path d="M110 120H290M120 128H280" stroke-opacity=".5" stroke-width="1.2"/></g></g></svg>`;
	}

	/** Side-view drawing of a ship with one turret per filled gun slot. */
	function shipSvg(cls, guns, model) {
		const L = { destroyer: 250, cruiser: 290, battleship: 340, carrier: 350, submarine: 280 }[cls] || 290;
		const x0 = (400 - L) / 2;
		const fill = model ? 'url(#dzShip)' : 'none';
		const sk = model ? '#0c0f12' : '#f3f7fb';
		const defs = model ? '<defs><linearGradient id="dzShip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3ad"/><stop offset="1" stop-color="#4a535c"/></linearGradient></defs>' : '';
		let s = '';
		if (cls === 'submarine') {
			s += `<ellipse cx="200" cy="140" rx="${L / 2}" ry="20"/><rect x="184" y="106" width="36" height="32" rx="7"/><path d="M200 106V90M200 90H210"/>`;
		} else {
			s += `<path d="M${x0} 124L${x0 + L - 6} 124Q${x0 + L + 10} 138 ${x0 + L - 34} 160L${x0 + 26} 160Q${x0 - 6} 146 ${x0} 124Z"/>`;
			if (cls === 'carrier') s += `<rect x="${x0 + 4}" y="116" width="${L - 12}" height="9"/><rect x="${x0 + L * 0.62}" y="88" width="46" height="28" rx="3"/><path d="M${x0 + L * 0.7} 88V64"/>`;
			else {
				s += `<rect x="${x0 + L * 0.4}" y="100" width="${L * 0.2}" height="24" rx="2"/><rect x="${x0 + L * 0.45}" y="86" width="${L * 0.1}" height="14" rx="2"/><path d="M${x0 + L * 0.5} 86V58"/>`;
				const funnels = cls === 'battleship' || cls === 'cruiser' ? 2 : 1;
				for (let i = 0; i < funnels; i++) s += `<rect x="${x0 + L * 0.62 + i * 20}" y="96" width="12" height="24" rx="2"/>`;
				const n = Math.max(1, Math.min(6, guns || 1)), fore = Math.ceil(n / 2);
				for (let i = 0; i < n; i++) {
					const isFore = i < fore;
					const cx = isFore ? x0 + L * (0.84 - i * 0.1) : x0 + L * (0.18 + (i - fore) * 0.1);
					s += `<rect x="${cx - 9}" y="110" width="18" height="14" rx="3"/><rect x="${isFore ? cx + 9 : cx - 29}" y="114" width="20" height="4" rx="1"/>`;
				}
			}
		}
		const water = '<path d="M16 160H384" stroke-dasharray="6 5" stroke-opacity=".55"/><path d="M30 172q10-6 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0" stroke-opacity=".35" stroke-width="1.4"/>';
		return `<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">${defs}<g fill="${fill}" stroke="${sk}" stroke-width="${model ? 1.4 : 2.2}" stroke-linejoin="round" stroke-linecap="round">${s}${model ? '' : water}</g></svg>`;
	}

	function silhouette(v, dz, model) {
		const d = E.data;
		const filled = v.slots.map((s) => ({ s, m: dz.sel[s.name] && d.modules[dz.sel[s.name]] })).filter((x) => x.m);
		if (v.domain === 'land') {
			const gun = filled.find((x) => /armament|cannon|gun|flame|howitzer|rocket/.test(x.m.category || ''));
			return tankSvg(tankClass(v), gun ? (tierOf(gun.m) || 2) : 0, model);
		}
		return shipSvg(shipClass(v), filled.filter((x) => /battery|gun/.test(x.m.category || '')).length, model);
	}

	/* ---------- small floating menus (module picker, designs, module lab) ---------- */
	let pop = null;
	const outside = (e) => { if (pop && !pop.contains(e.target)) closePop(); };
	function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', outside, true); } }
	function showPop(anchor, el, width) {
		closePop();
		pop = el;
		el.style.width = width + 'px';
		document.body.appendChild(el);
		const r = anchor.getBoundingClientRect(), hgt = Math.min(el.offsetHeight, window.innerHeight - 20);
		el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + 'px';
		const below = window.innerHeight - r.bottom - 10;
		if (below >= Math.min(hgt, 320) || below > r.top) { el.style.top = (r.bottom + 6) + 'px'; el.style.maxHeight = Math.max(200, below) + 'px'; }
		else { el.style.bottom = (window.innerHeight - r.top + 6) + 'px'; el.style.maxHeight = Math.max(200, r.top - 14) + 'px'; }
		setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
	}

	const tile = (m, slotName, size) => {
		const el = h('span', { class: 'dzf-tile' + (m && m.custom ? ' test' : ''), style: size ? { width: size + 'px', height: size + 'px' } : null },
			FB.icon(modIcon(m ? m.category : '', slotName), size ? Math.round(size * 0.55) : 22), tierOf(m) ? h('i', { class: 'dzf-tier' }, ROMAN[tierOf(m)]) : null);
		if (!m && FB.gfx) FB.gfx.attach(el, ['GFX_EMSI_empty']);
		else if (m && !m.custom && FB.gfx) FB.gfx.attach(el, FB.gfx.moduleNames(m, E.data && E.data.modules));
		return el;
	};

	function openPicker(anchor, v, s) {
		const d = E.data, dz = D.design;
		const mods = E.modulesFor(v, s, dz.sel);
		let q = '';
		const list = h('div', { class: 'dzf-plist' });
		const pick = (key) => { dz.sel[s.name] = key; E.normalize(v, dz.sel); closePop(); render(); };
		const label = (m) => (m.custom ? '★ ' : m.modified ? '✎ ' : '') + d.name(m.key);
		const row = (m) => h('div', { class: 'dzf-prow' + (dz.sel[s.name] === m.key ? ' on' : '') },
			h('button', { class: 'dzf-pbtn', onclick: () => pick(m.key) }, tile(m, s.name, 38), h('span', { class: 'dzf-ptxt' }, h('b', {}, label(m)), h('small', {}, E.moduleSummary(m) || 'no stat changes'))),
			h('button', { class: 'ibtn dev-only', title: 'Change the numbers of this module', onclick: () => { closePop(); openLab(m.key, s); } }, FB.icon('sliders', 14)));
		function draw() {
			list.innerHTML = '';
			if (!s.required) list.appendChild(h('div', { class: 'dzf-prow' + (!dz.sel[s.name] ? ' on' : '') }, h('button', { class: 'dzf-pbtn', onclick: () => pick(null) }, h('span', { class: 'dzf-tile empty' }, FB.icon('x', 16)), h('span', { class: 'dzf-ptxt' }, h('b', {}, 'Empty slot')))));
			const f = mods.filter((m) => !q || d.name(m.key).toLowerCase().includes(q) || String(m.category || '').toLowerCase().includes(q) || E.moduleSummary(m).toLowerCase().includes(q));
			const tests = f.filter((m) => m.custom);
			if (tests.length) { list.appendChild(h('div', { class: 'dzf-pcat' }, '★ Your test modules')); tests.forEach((m) => list.appendChild(row(m))); }
			[...new Set(f.filter((m) => !m.custom).map((m) => m.category))].forEach((c) => {
				list.appendChild(h('div', { class: 'dzf-pcat' }, prettyKey(d.name(c) === c ? c : d.name(c))));
				f.filter((m) => m.category === c && !m.custom).forEach((m) => list.appendChild(row(m)));
			});
			const locked = E.lockedModules(v, s, dz.sel).filter((x) => !q || d.name(x.module.key).toLowerCase().includes(q) || String(x.module.category || '').toLowerCase().includes(q));
			if (locked.length) {
				list.appendChild(h('div', { class: 'dzf-pcat' }, 'Needs another module (click to add both)'));
				locked.forEach((x) => list.appendChild(h('div', { class: 'dzf-prow locked' },
					h('button', { class: 'dzf-pbtn', title: 'Also sets ' + d.name(x.via.module) + ' in the ' + shortSlot(x.via.slot) + ' slot', onclick: () => {
						dz.sel[x.via.slot] = x.via.module; dz.sel[s.name] = x.module.key; E.normalize(v, dz.sel); closePop(); render();
						FB.toast('Also set ' + d.name(x.via.module) + ' (' + shortSlot(x.via.slot) + ') so this fits.', 'ok');
					} }, tile(x.module, s.name, 38), h('span', { class: 'dzf-ptxt' }, h('b', {}, d.name(x.module.key)), h('small', {}, 'needs ' + d.name(x.via.module) + ' · ' + (E.moduleSummary(x.module) || 'no stat changes')))),
					h('button', { class: 'ibtn dev-only', title: 'Change the numbers of this module', onclick: () => { closePop(); openLab(x.module.key, s); } }, FB.icon('sliders', 14)))));
			}
			if (!f.length && !locked.length) list.appendChild(h('div', { class: 'muted', style: { padding: '10px' } }, 'No module matches.'));
		}
		const search = h('input', { type: 'search', class: 'dzf-psearch', placeholder: 'Search modules…', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
		draw();
		showPop(anchor, h('div', { class: 'dzf-pop' },
			h('div', { class: 'dzf-phead' }, FB.icon(modIcon('', s.name), 16), h('b', {}, shortSlot(s.name)), s.required ? h('i', { class: 'req' }, ' required') : null),
			h('div', { class: 'dzf-phint' }, FB.icon('info', 13), 'Some modules only appear once another slot is filled, for example bigger guns need a bigger turret.'),
			search, list,
			h('button', { class: 'dzf-pnew dev-only', onclick: () => { closePop(); openLab(null, s); } }, FB.icon('plus', 14), 'New test module for this slot')), 440);
		search.focus();
	}

	function designsMenu(anchor) {
		const mine = D.saved.filter((s) => s.domain === D.domain);
		const box = h('div', { class: 'dzf-pop' }, h('div', { class: 'dzf-phead' }, FB.icon('list', 16), h('b', {}, 'My designs')));
		if (!mine.length) box.appendChild(h('div', { class: 'muted', style: { padding: '10px 12px' } }, 'Nothing saved yet. Build a design and press Save.'));
		mine.forEach((s) => box.appendChild(h('div', { class: 'dzf-prow' + (D.design && D.design.id === s.id ? ' on' : '') },
			h('button', { class: 'dzf-pbtn', onclick: () => { D.design = JSON.parse(JSON.stringify(s)); const v = variant(D.design); if (v) { D.arch = v.archetype; D.nation = ''; } closePop(); render(); } }, h('span', { class: 'dzf-ptxt' }, h('b', {}, s.name), h('small', {}, (variant(s) ? variantLabel(variant(s)) : s.variant)))),
			h('button', { class: 'ibtn danger', title: 'Delete', onclick: () => { D.saved = D.saved.filter((x) => x.id !== s.id); persist(); closePop(); render(); } }, FB.icon('trash', 14)))));
		box.appendChild(h('div', { class: 'dzf-pfoot' },
			h('button', { class: 'dzf-btn', onclick: () => FB.download('designs.json', JSON.stringify(D.saved, null, 2), 'application/json') }, FB.icon('download', 14), 'Export'),
			h('button', { class: 'dzf-btn', onclick: () => { const i = h('input', { type: 'file', accept: '.json' }); i.onchange = async () => { try { const a = JSON.parse(await i.files[0].text()); D.saved = D.saved.concat(a.filter((x) => x && x.variant).map((x) => Object.assign(x, { id: FB.uid() }))); persist(); closePop(); render(); } catch (e) { FB.toast('That is not a designs file.', 'warn'); } }; i.click(); } }, FB.icon('upload', 14), 'Import')));
		showPop(anchor, box, 360);
	}

	function labMenu(anchor) {
		const list = Object.values(E.custom);
		const box = h('div', { class: 'dzf-pop' }, h('div', { class: 'dzf-phead' }, FB.icon('flask', 16), h('b', {}, 'Module lab')));
		box.appendChild(h('div', { class: 'muted small', style: { padding: '8px 12px' } }, 'Change the numbers of any module with the sliders button in the module list, or make your own named test module.'));
		list.forEach((c) => box.appendChild(h('div', { class: 'dzf-prow' },
			h('button', { class: 'dzf-pbtn', onclick: () => { closePop(); openLab(c.key); } }, h('span', { class: 'dzf-ptxt' }, h('b', {}, (c.override ? '✎ ' : '★ ') + (c.override ? E.data.name(c.key) : c.name)), h('small', {}, c.override ? 'Changed stats of a game module' : 'Test module'))),
			h('button', { class: 'ibtn danger', title: 'Remove', onclick: () => { E.removeModule(c.key); Object.keys(D.design.sel).forEach((k) => { if (D.design.sel[k] === c.key) D.design.sel[k] = null; }); closePop(); render(); } }, FB.icon('trash', 14)))));
		box.appendChild(h('button', { class: 'dzf-pnew', onclick: () => { closePop(); openLab(null); } }, FB.icon('plus', 14), 'New test module'));
		showPop(anchor, box, 360);
	}

	/* ---------- the window ---------- */
	const STAT_ICON = { soft_attack: 'sword', hard_attack: 'crosshair', ap_attack: 'bolt', air_attack: 'plane', armor_value: 'shield', hardness: 'layers', defense: 'shield', breakthrough: 'arrowRight',
		maximum_speed: 'arrowRight', naval_speed: 'arrowRight', naval_range: 'map', reliability: 'wrench', fuel_consumption: 'factory', supply_consumption: 'layers', manpower: 'users', max_strength: 'scale',
		lg_attack: 'crosshair', hg_attack: 'crosshair', torpedo_attack: 'anchor', anti_air_attack: 'plane', shore_bombardment: 'crosshair', lg_armor_piercing: 'bolt', hg_armor_piercing: 'bolt',
		depth_charge_attack: 'anchor', surface_detection: 'search', sub_detection: 'search', surface_visibility: 'eye', sub_visibility: 'eye', lend_lease_cost: 'database', build_cost_ic: 'factory' };
	const BASE_KEYS = ['maximum_speed', 'naval_speed', 'naval_range', 'max_strength', 'reliability', 'fuel_consumption', 'supply_consumption', 'manpower', 'lend_lease_cost'];
	const COMBAT_KEYS = ['soft_attack', 'hard_attack', 'ap_attack', 'air_attack', 'armor_value', 'hardness', 'defense', 'breakthrough', 'lg_attack', 'hg_attack', 'torpedo_attack', 'anti_air_attack', 'shore_bombardment', 'lg_armor_piercing', 'hg_armor_piercing', 'depth_charge_attack'];

	function render() {
		if (!body) return;
		closePop();
		body.innerHTML = '';
		const d = E.data;
		const frame = h('div', { class: 'dzf-frame' });
		body.appendChild(frame);
		const srcText = d ? 'Data: ' + d.sources.join(' + ') + ` · ${d.count.modules} modules` : '';
		frame.appendChild(h('div', { class: 'dzf-title' },
			h('div', { class: 'dzf-tabs' }, DOMAINS.map(([k, l]) => h('button', { class: D.domain === k ? 'on' : '', onclick: () => { D.domain = k; D.arch = null; D.design = null; D.nation = ''; render(); } }, FB.icon(k === 'land' ? 'tank' : 'ship', 16), l, d ? h('span', { class: 'dzf-count' }, d.groups[k].length) : null))),
			h('h2', {}, D.domain === 'land' ? 'Tank Designer' : 'Ship Designer'),
			h('div', { class: 'dzf-status' }, h('span', { id: 'dz-status' }, D.status || srcText), h('button', { class: 'dzf-btn', onclick: () => ensureData(true), disabled: D.loading }, FB.icon('redo', 14), 'Reload data'))));
		if (D.loading) { frame.appendChild(h('div', { class: 'dz-empty' }, h('p', {}, D.status || 'Loading…'))); return; }
		if (!d) {
			frame.appendChild(h('div', { class: 'dz-empty' },
				h('h3', {}, 'No equipment data yet'),
				h('p', {}, FB.server.active ? 'Focus Builder reads the real tank and ship definitions from the base game and from your mod.' : 'Open a mod that contains common/units/equipment, or start Focus Builder through its shortcut so it can also read the base game.'),
				D.msg ? h('p', { class: 'warn-text' }, D.msg) : null,
				h('div', { class: 'btn-row', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => FB.ui.openMod(false) }, 'Open a mod…'), FB.server.active ? h('button', { class: 'btn', onclick: () => ensureData(true) }, 'Load the base game') : null)));
			return;
		}
		ensureSelection();
		const groups = d.groups[D.domain];
		if (!groups.length) { frame.appendChild(h('div', { class: 'dz-empty' }, h('p', {}, 'No designable equipment of this kind was found in the loaded data.'))); return; }
		const dz = D.design, v = variant(dz);
		const r = calcDesign(v, dz), base = E.calc(v, E.defaultSelection(v));
		frame.appendChild(h('div', { class: 'dzf-main' }, leftCol(v, dz, groups), rightCol(v, dz, r, base)));
		frame.appendChild(bottomBar(v, dz, r));
	}

	function leftCol(v, dz, groups) {
		const d = E.data;
		const group = groups.find((g) => g.key === D.arch);
		const nations = [...new Set(group.variants.map((x) => x.nation).filter(Boolean))].sort();
		const sel = h('div', { class: 'dzf-sel' },
			h('input', { type: 'text', class: 'dzf-name', value: dz.name, title: 'Name of this design', oninput: (e) => { dz.name = e.target.value; } }),
			h('select', { class: 'dzf-pick', value: D.arch, title: D.domain === 'land' ? 'Chassis family' : 'Hull family', onchange: (e) => { const g = groups.find((x) => x.key === e.target.value); D.arch = g.key; D.nation = ''; D.design = newDesign(defaultVariant(g)); render(); } }, groups.map((g) => h('option', { value: g.key }, g.name))),
			h('select', { class: 'dzf-pick', disabled: !nations.length, title: nations.length ? 'Show only one nation' : 'No nation-specific versions of this ' + (D.domain === 'land' ? 'chassis' : 'hull') + ' in the loaded data. Open a mod that defines them (for example GER_… chassis) and press Reload data.', value: D.nation, onchange: (e) => { D.nation = e.target.value; render(); } },
				nations.length ? [h('option', { value: '' }, 'All nations'), h('option', { value: '__generic' }, 'Generic'), nations.map((n) => h('option', { value: n }, natName(n)))] : h('option', { value: '' }, 'No nations')),
			h('select', { class: 'dzf-pick wide', value: dz.variant, onchange: (e) => { const nv = d.variants[e.target.value]; const keep = dz.sel; dz.variant = nv.key; dz.sel = E.defaultSelection(nv); nv.slots.forEach((s) => { if (keep[s.name] && E.effectiveCats(nv, s, keep).has((d.modules[keep[s.name]] || {}).category)) dz.sel[s.name] = keep[s.name]; }); E.normalize(nv, dz.sel); render(); } },
				visibleVariants(group, dz.variant).map((x) => h('option', { value: x.key }, variantLabel(x)))));
		const probs = E.problems(v, dz.sel);
		const bySlot = {};
		probs.forEach((p) => { if (p.slot) bySlot[p.slot] = p.text; });
		const slotBtn = (s) => {
			const m = dz.sel[s.name] && d.modules[dz.sel[s.name]];
			const cls = 'dzf-slot' + (m ? ' filled' : '') + (s.required && !m ? ' need' : '') + (bySlot[s.name] ? ' bad' : '') + (m && m.custom ? ' test' : '');
			return h('button', { class: cls, title: shortSlot(s.name) + (m ? ': ' + d.name(m.key) : s.required ? ' (required)' : ' (empty)'), onclick: (e) => openPicker(e.currentTarget, v, s) },
				tile(m, s.name), h('span', { class: 'dzf-cap' }, shortSlot(s.name)), m && m.modified ? h('i', { class: 'dzf-mod' }, '✎') : null);
		};
		// like the game: guns and turret above the tank, the hull parts (suspension, armor, engine, special modules such as the radio) below it
		const fixed = D.domain === 'naval' ? v.slots.filter((s) => /^fixed_/.test(s.name)) : (() => { const firstSpecial = v.slots.find((s) => /special/.test(s.name)); return v.slots.filter((s) => (/suspension|armor|engine/.test(s.name) || s === firstSpecial) && !/armament|turret/.test(s.name)); })();
		const free = v.slots.filter((s) => !fixed.includes(s));
		const bp = h('div', { class: 'dzf-blueprint' }, h('div', { class: 'dzf-draw', html: silhouette(v, dz, false) }), h('div', { class: 'dzf-bp-label' }, variantLabel(v)));
		return h('section', { class: 'dzf-left' }, sel,
			free.length ? h('div', { class: 'dzf-slots' }, free.map(slotBtn)) : null, bp,
			fixed.length ? h('div', { class: 'dzf-slots below' }, fixed.map(slotBtn)) : null,
			v.domain === 'land' ? dialsRow(dz, v) : null,
			probs.length ? h('div', { class: 'dz-probs' }, probs.map((p) => h('div', {}, '⚠ ' + p.text))) : null);
	}

	/* every stat of the in-game overview, in the game's order; stats that are not in the files show 0, or a dash when the game fills them in itself */
	const SPEC = {
		land: { base: ['maximum_speed', 'reliability', 'supply_consumption'], combat: ['soft_attack', 'hard_attack', 'ap_attack', 'hardness', 'armor_value', 'breakthrough', 'defense', 'air_attack'], misc: ['fuel_capacity', 'fuel_consumption', 'suppression', 'recon', 'entrenchment'] },
		naval: { base: ['naval_speed', 'naval_range', 'max_organisation', 'max_strength', 'reliability', 'supply_consumption', 'manpower'], combat: ['lg_attack', 'lg_armor_piercing', 'hg_attack', 'hg_armor_piercing', 'torpedo_attack', 'sub_attack', 'armor_value', 'anti_air_attack'], misc: ['fuel_consumption', 'surface_visibility', 'surface_detection', 'sub_visibility', 'sub_detection', 'mines_planting', 'mines_sweeping', 'naval_weather_penalty_factor'] }
	};
	const GAME_ONLY = new Set(['supply_consumption', 'suppression', 'max_organisation']);
	const ZERO = { value: 0, base: 0, add: 0, avg: 0, mult: 0 };

	function paperCol(title, keys, r, base) {
		const col = h('div', { class: 'dzf-pcol' }, h('div', { class: 'dzf-phd' }, title));
		keys.forEach((k) => {
			const s = r.stats[k];
			if (!s && GAME_ONLY.has(k)) {
				col.appendChild(h('div', { class: 'dzf-row', title: 'The game fills this in itself. It is not in the equipment files.' }, FB.icon(STAT_ICON[k] || 'info', 14), h('span', { class: 'dzf-rl' }, E.statName(k)), h('b', { class: 'dzf-dash' }, '—'), h('em', {})));
				return;
			}
			const st = s || ZERO, b = base.stats[k] ? base.stats[k].value : 0;
			const diff = st.value - b, low = E.statOpt(k).low;
			const good = Math.abs(diff) < 1e-9 ? '' : ((diff > 0) !== !!low ? 'up' : 'down');
			const tip = `chassis ${+st.base.toFixed(2)}  + modules ${+(st.add + st.avg).toFixed(2)}  × (1 + ${Math.round(st.mult * 100)}%)` + (st.dial ? `  ×  dials ${st.dial > 0 ? '+' : ''}${+st.dial.toFixed(1)}%` : '');
			col.appendChild(h('div', { class: 'dzf-row', title: tip }, FB.icon(STAT_ICON[k] || 'info', 14), h('span', { class: 'dzf-rl' }, E.statName(k)), h('b', {}, E.fmt(k, st.value)),
				h('em', { class: good }, Math.abs(diff) < 1e-9 ? '' : (diff > 0 ? '▲' : '▼') + E.fmt(k, Math.abs(diff)))));
		});
		return col;
	}

	function rightCol(v, dz, r, base) {
		const spec = SPEC[v.domain] || SPEC.land;
		const known = new Set([].concat(spec.base, spec.combat, spec.misc, ['build_cost_ic']));
		const extra = r.keys.filter((k) => !known.has(k));
		const paper = h('div', { class: 'dzf-paper' }, paperCol('Base Stats', spec.base, r, base), paperCol('Combat Stats', spec.combat, r, base), paperCol('Misc Stats', spec.misc.concat(extra), r, base));
		const model = h('div', { class: 'dzf-model' }, h('div', { class: 'dzf-draw', html: silhouette(v, dz, true) }),
			h('div', { class: 'dzf-model-cap' }, h('b', {}, variantLabel(v)), v.nation ? h('span', {}, natName(v.nation)) : null),
			dz.note !== undefined ? h('textarea', { class: 'dzf-note', rows: 2, placeholder: 'Notes about this design…', value: dz.note || '', oninput: (e) => { dz.note = e.target.value; } }) : null);
		const col = h('section', { class: 'dzf-right' }, paper, model);
		if (D.showCmp) col.appendChild(compare());
		col.appendChild(h('p', { class: 'dzf-foot muted small' }, 'Stats follow the game files: (chassis + modules × chassis module multiplier) × (1 + module percentages)' + (v.domain === 'land' ? ', plus the engine / armor clicks (0 clicks is allowed)' : '') + '. The game may round or limit some values, so treat the numbers as an estimate. Hover a stat to see where it comes from.'));
		return col;
	}

	/* engine size / armor thickness dials */
	function dialsRow(dz, v) {
		const dials = clicks(dz, v), list = upsFor(v);
		const row = h('div', { class: 'dzf-dials' });
		// one dial per upgrade of this chassis (from the mod when it defines them), else plain engine / armor
		const rows = list.length ? list.map((u) => ({ key: u.key, up: u, label: upLabel(u), icon: upKind(u) === 'engine' ? 'bolt' : upKind(u) === 'armor' ? 'shield' : 'sliders', get: () => dials.levels[u.key] || 0, put: (n) => { dials.levels[u.key] = n; } }))
			: Object.keys(DIALS).map((name) => ({ key: name, up: null, label: DIALS[name].label, icon: DIALS[name].icon, get: () => dials[name] || 0, put: (n) => { dials[name] = n; } }));
		rows.forEach((r) => {
			const max = r.up ? r.up.max || 0 : 20, cur = Math.min(r.get(), max), up = r.up;
			const set = (n) => { r.put(FB.clamp(Math.round(n), 0, max)); render(); };
			const req = up ? Object.entries(up.req).map(([lv, t]) => 'from ' + lv + ': ' + t).join('; ') : '';
			row.appendChild(h('div', { class: 'dzf-dial', title: r.label + ' clicks: 0 to ' + max + '. 0 means none of this upgrade.' + (req ? ' Technology needed ' + req + '.' : '') + (up ? ' (' + up.key + ', from ' + up.source + ')' : '') },
				FB.icon(r.icon, 16), h('span', { class: 'dzf-dial-l' }, r.label),
				h('button', { class: 'dzf-step', disabled: cur <= 0, title: 'One click less', onclick: () => set(cur - 1) }, '−'),
				h('input', { type: 'number', class: 'dzf-dial-n', min: 0, max, step: 1, value: cur, onchange: (e) => set(Number(e.target.value) || 0) }),
				h('button', { class: 'dzf-step', disabled: cur >= max, title: 'One click more', onclick: () => set(cur + 1) }, '+'),
				h('small', { class: 'dzf-dial-max' }, '/ ' + max),
				cur ? h('button', { class: 'ibtn', title: 'Back to 0 clicks', onclick: () => set(0) }, FB.icon('undo', 13)) : null));
		});
		row.appendChild(h('button', { class: 'dzf-btn', title: 'What does each step do?', onclick: (e) => dialRulesMenu(e.currentTarget) }, FB.icon('sliders', 14), 'What a click does'));
		return row;
	}

	function dialRulesMenu(anchor) {
		const ups = upsFor(D.design && variant(D.design));
		if (ups.length) {
			// the real numbers from the files of the mod (or the game when the mod does not change them)
			const box = h('div', { class: 'dzf-pop' }, h('div', { class: 'dzf-phead' }, FB.icon('sliders', 16), h('b', {}, 'What one click does')));
			box.appendChild(h('div', { class: 'dzf-phint' }, FB.icon('info', 13), 'Read from common/units/equipment/upgrades of the open mod (the base game fills in what the mod does not change). 0 clicks is allowed: then the tank gets none of this.'));
			const list = h('div', { class: 'dzf-plist' });
			ups.forEach((u) => {
				list.appendChild(h('div', { class: 'dzf-pcat' }, upLabel(u) + ' · up to ' + u.max + ' clicks · from ' + u.source));
				Object.entries(u.add).forEach(([k, v]) => list.appendChild(h('div', { class: 'dzf-prow' }, h('span', { class: 'dzf-ptxt' }, h('b', {}, E.statName(k)), h('small', {}, (v > 0 ? '+' : '') + v + ' per click')))));
				Object.entries(u.mult).forEach(([k, v]) => list.appendChild(h('div', { class: 'dzf-prow' }, h('span', { class: 'dzf-ptxt' }, h('b', {}, E.statName(k)), h('small', {}, (v > 0 ? '+' : '') + +(v * 100).toFixed(2) + '% per click')))));
				const req = Object.entries(u.req);
				if (req.length) list.appendChild(h('div', { class: 'dzf-prow' }, h('span', { class: 'dzf-ptxt' }, h('small', {}, 'Technology: ' + req.map(([lv, t]) => lv + '+ needs ' + t).join(', ')))));
			});
			box.appendChild(list);
			showPop(anchor, box, 380);
			return;
		}
		const box = h('div', { class: 'dzf-pop' }, h('div', { class: 'dzf-phead' }, FB.icon('sliders', 16), h('b', {}, 'What one click does')));
		box.appendChild(h('div', { class: 'dzf-phint' }, FB.icon('info', 13), 'The upgrade data was not found in the loaded files, so these percentages per click are assumptions you can change.'));
		const body = h('div', { class: 'dzf-plist' });
		const draw = () => {
			body.innerHTML = '';
			Object.keys(DIALS).forEach((name) => {
				body.appendChild(h('div', { class: 'dzf-pcat' }, DIALS[name].label + ' — % per step'));
				Object.entries(D.rules[name]).forEach(([k, pct]) => {
					const inp = h('input', { type: 'number', step: 'any', value: pct, oninput: (e) => { D.rules[name][k] = e.target.value === '' ? 0 : Number(e.target.value); saveRules(); } });
					body.appendChild(h('div', { class: 'lab-row' }, h('span', { class: 'lab-stat' }, E.statName(k), h('code', {}, k)), h('div', { class: 'affix' }, inp, h('span', { class: 'unit' }, '%')),
						h('button', { class: 'ibtn danger', title: 'Remove', onclick: () => { delete D.rules[name][k]; saveRules(); draw(); render2(); } }, FB.icon('trash', 14))));
				});
				const keys = ['maximum_speed', 'armor_value', 'reliability', 'build_cost_ic', 'fuel_consumption', 'breakthrough', 'defense', 'soft_attack', 'hard_attack', 'ap_attack', 'hardness'];
				const add = h('select', { onchange: (e) => { if (e.target.value) { D.rules[name][e.target.value] = 0; saveRules(); draw(); } } },
					h('option', { value: '' }, '+ add a stat…'), keys.filter((k) => !(k in D.rules[name])).map((k) => h('option', { value: k }, E.statName(k))));
				body.appendChild(h('div', { style: { padding: '4px 6px' } }, add));
			});
		};
		const render2 = () => {};
		draw();
		box.appendChild(body);
		box.appendChild(h('div', { class: 'dzf-pfoot' },
			h('button', { class: 'dzf-btn', onclick: () => { D.rules = JSON.parse(JSON.stringify(DEFAULT_RULES)); saveRules(); draw(); } }, FB.icon('undo', 14), 'Defaults'),
			h('button', { class: 'dzf-btn gold', onclick: () => { closePop(); render(); } }, FB.icon('check', 14), 'Apply')));
		showPop(anchor, box, 420);
	}

	function bottomBar(v, dz, r) {
		const cost = r.stats.build_cost_ic ? r.stats.build_cost_ic.value : 0;
		const mine = D.saved.filter((s) => s.domain === D.domain).length;
		return h('div', { class: 'dzf-bottom' },
			h('button', { class: 'dzf-btn', onclick: () => { dz.sel = E.defaultSelection(v); render(); }, title: 'Back to the default modules' }, FB.icon('undo', 15), 'Reset'),
			h('button', { class: 'dzf-btn gold', onclick: saveDesign }, FB.icon('save', 15), 'Save'),
			h('button', { class: 'dzf-btn', onclick: (e) => designsMenu(e.currentTarget) }, FB.icon('list', 15), 'Designs', mine ? h('span', { class: 'dzf-count' }, mine) : null),
			h('button', { class: 'dzf-btn dev-only', onclick: (e) => labMenu(e.currentTarget) }, FB.icon('flask', 15), 'Module lab', Object.keys(E.custom).length ? h('span', { class: 'dzf-count' }, Object.keys(E.custom).length) : null),
			h('button', { class: 'dzf-btn' + (D.showCmp ? ' on' : ''), onclick: () => { D.showCmp = !D.showCmp; render(); } }, FB.icon('scale', 15), 'Compare'),
			h('span', { class: 'dzf-spacer' }),
			h('div', { class: 'dzf-cost' }, h('span', {}, 'Production cost'), FB.icon('factory', 16), h('b', {}, +cost.toFixed(2))));
	}

	function saveDesign() {
		const dz = D.design;
		const i = D.saved.findIndex((s) => s.id === dz.id);
		const copy = JSON.parse(JSON.stringify(dz));
		if (i >= 0) D.saved[i] = copy; else D.saved.push(copy);
		persist(); render(); FB.toast('Design saved', 'ok');
	}

	function compare() {
		const dz = D.design, d = E.data;
		const group = d.groups[D.domain].find((g) => g.key === D.arch);
		const options = [].concat(visibleVariants(group, dz.variant).map((x) => defaultOf(x)), D.saved.filter((s) => s.domain === D.domain && s.id !== dz.id));
		if (!options.find((o) => o.id === D.cmp)) D.cmp = options[0].id;
		const other = options.find((o) => o.id === D.cmp);
		const A = designStats(dz), B = designStats(other);
		const col = h('div', { class: 'dzf-cmp' });
		col.appendChild(h('div', { class: 'dzf-phd' }, 'Compare with'));
		col.appendChild(h('select', { class: 'dzf-pick wide', value: D.cmp, onchange: (e) => { D.cmp = e.target.value; render(); } }, options.map((o) => h('option', { value: o.id }, (String(o.id).startsWith('default:') ? '' : '★ ') + o.name))));
		if (!A || !B) return col;
		const keys = [...new Set([...A.keys, ...B.keys])];
		const t = h('div', { class: 'dz-cmp-t' }, h('div', { class: 'dz-cmp-h' }, h('span', {}), h('b', {}, 'This'), h('b', {}, 'Other'), h('span', {})));
		keys.forEach((k) => {
			const a = A.stats[k] ? A.stats[k].value : 0, b = B.stats[k] ? B.stats[k].value : 0;
			const max = Math.max(Math.abs(a), Math.abs(b), 1e-9), low = E.statOpt(k).low;
			const better = Math.abs(a - b) < 1e-9 ? 0 : ((a > b) !== !!low ? 1 : -1);
			const pct = b !== 0 ? Math.round((a / b - 1) * 100) : null;
			t.appendChild(h('div', { class: 'dz-cmp-r' }, h('span', { class: 'dz-stat-l' }, E.statName(k)),
				h('div', { class: 'dz-bar' + (better > 0 ? ' win' : ''), title: E.fmt(k, a) }, h('i', { style: { width: Math.max(2, Math.abs(a) / max * 100) + '%' } }), h('em', {}, E.fmt(k, a))),
				h('div', { class: 'dz-bar' + (better < 0 ? ' win' : ''), title: E.fmt(k, b) }, h('i', { style: { width: Math.max(2, Math.abs(b) / max * 100) + '%' } }), h('em', {}, E.fmt(k, b))),
				h('span', { class: 'dz-pct ' + (better > 0 ? 'up' : better < 0 ? 'down' : '') }, pct == null || better === 0 ? '' : (pct > 0 ? '+' : '') + pct + '%')));
		});
		col.appendChild(t);
		col.appendChild(D.domain === 'land' ? duel(A, B, other) : efficiency(A, B));
		return col;
	}

	function duel(A, B, other) {
		const ab = hit(A, B), ba = hit(B, A);
		const costA = (A.stats.build_cost_ic || { value: 0 }).value, costB = (B.stats.build_cost_ic || { value: 0 }).value;
		const ratio = ba.dmg > 0 ? ab.dmg / ba.dmg : (ab.dmg > 0 ? Infinity : 1);
		const verdict = !ab.dmg && !ba.dmg ? 'neither design has an attack yet (pick a main gun)' : !ba.dmg ? 'the other design cannot hurt this one' : !ab.dmg ? 'this design cannot hurt the other one' : Math.abs(ratio - 1) < 0.05 ? 'roughly even' : ratio > 1 ? 'your design hits harder' : 'the other design hits harder';
		const line = (who, x) => h('div', { class: 'dz-duel-r' }, h('span', {}, who), h('b', {}, +x.dmg.toFixed(1) + ' damage'), h('span', { class: x.pierced ? 'up' : 'down' }, x.pierced ? 'pierces armor' : 'blocked by armor (−50%)'));
		return h('div', { class: 'dz-duel' }, h('div', { class: 'sub-title' }, 'Head-on duel (estimate)'),
			line('This → other', ab), line('Other → this', ba),
			h('div', { class: 'muted small' }, ab.dmg && ba.dmg ? `Damage ratio ${ratio.toFixed(2)}: ${verdict}.` : verdict[0].toUpperCase() + verdict.slice(1) + '.'),
			costA && costB ? h('div', { class: 'muted small' }, `Damage per IC: ${(ab.dmg / costA).toFixed(2)} vs ${(ba.dmg / costB).toFixed(2)}. Armor per IC: ${((A.stats.armor_value || { value: 0 }).value / costA).toFixed(1)} vs ${((B.stats.armor_value || { value: 0 }).value / costB).toFixed(1)}.`) : null,
			h('div', { class: 'muted small' }, 'Simplified: damage = soft attack × (1 − hardness) + hard attack × hardness; halved when the attacker\'s piercing is below the target\'s armor. Ignores organization, terrain, defense and breakthrough.'));
	}

	function efficiency(A, B) {
		const costA = (A.stats.build_cost_ic || { value: 0 }).value, costB = (B.stats.build_cost_ic || { value: 0 }).value;
		if (!costA || !costB) return h('div');
		const keys = ['lg_attack', 'hg_attack', 'torpedo_attack', 'anti_air_attack', 'max_strength', 'air_attack', 'air_defence'].filter((k) => (A.stats[k] && A.stats[k].value) || (B.stats[k] && B.stats[k].value));
		return h('div', { class: 'dz-duel' }, h('div', { class: 'sub-title' }, 'Per 100 IC'),
			keys.map((k) => h('div', { class: 'dz-duel-r' }, h('span', {}, E.statName(k)), h('b', {}, (((A.stats[k] || { value: 0 }).value) / costA * 100).toFixed(1)), h('span', {}, (((B.stats[k] || { value: 0 }).value) / costB * 100).toFixed(1)))));
	}

	/* ---------- module lab: change stats, make named test modules ---------- */
	const statKeys = () => { const set = new Set(Object.keys(E.STAT)); Object.values(E.data.modules).forEach((m) => Object.keys(m.add).concat(Object.keys(m.mult), Object.keys(m.avg)).forEach((k) => set.add(k))); return [...set].sort(); };
	const copyOf = (o) => Object.assign({}, o);
	const cleanStats = (o) => { const r = {}; Object.keys(o).forEach((k) => { if (Number.isFinite(Number(o[k]))) r[k] = Number(o[k]); }); return r; };

	function openLab(key, slot) {
		const d = E.data, v = variant(D.design);
		const real = key && d.modules[key];
		const isTest = !!(real && real.custom);
		const creating = !real;
		const cats = [...new Set(v.slots.flatMap((s) => s.cats).concat(Object.values(d.modules).flatMap((m) => v.slots.flatMap((s) => (m.grants && m.grants[s.name]) || []))))];
		const work = real
			? { key: real.key, name: d.name(real.key), category: real.category, abbr: real.abbr || 'tst', add: copyOf(real.add), mult: copyOf(real.mult), avg: copyOf(real.avg) }
			: { key: null, name: '', category: (slot && slot.cats[0]) || cats[0], abbr: 'tst', add: {}, mult: {}, avg: {} };
		let closeLab = () => {};
		const nameIn = h('input', { type: 'text', value: work.name, placeholder: 'e.g. Experimental 90mm gun', readonly: !!real && !isTest, oninput: (e) => { work.name = e.target.value; } });
		const abbrIn = h('input', { type: 'text', value: work.abbr, maxlength: 4, oninput: (e) => { work.abbr = e.target.value; } });
		const catSel = h('select', { value: work.category, disabled: !!real, onchange: (e) => { work.category = e.target.value; } }, cats.map((c) => h('option', { value: c }, prettyKey(d.name(c) === c ? c : d.name(c)))));
		const rowsHost = h('div', { class: 'lab-rows' });
		const baseSel = creating ? h('select', { onchange: (e) => { const m = d.modules[e.target.value]; if (m) { work.add = copyOf(m.add); work.mult = copyOf(m.mult); work.avg = copyOf(m.avg); work.category = m.category; catSel.value = m.category; drawRows(); } } },
			h('option', { value: '' }, 'Empty (add stats yourself)'), Object.values(d.modules).filter((m) => cats.includes(m.category) && !m.custom).sort((a, b) => d.name(a.key).localeCompare(d.name(b.key))).map((m) => h('option', { value: m.key }, d.name(m.key)))) : null;
		const KINDS = [['add', 'Adds (flat numbers)', 1, 'Added to the chassis value, e.g. +5 soft attack'], ['mult', 'Percentages', 100, 'Multiplies the final stat, e.g. +15% speed'], ['avg', 'Averages', 1, 'Averaged over all modules that have it, e.g. piercing']];
		function drawRows() {
			rowsHost.innerHTML = '';
			KINDS.forEach(([kind, title, scale, hint]) => {
				const box = h('div', { class: 'lab-box' }, h('div', { class: 'sub-title' }, title), h('div', { class: 'muted small' }, hint));
				Object.keys(work[kind]).forEach((k) => {
					const val = h('input', { type: 'number', step: 'any', value: +(work[kind][k] * scale).toFixed(4), oninput: (e) => { work[kind][k] = (e.target.value === '' ? 0 : Number(e.target.value)) / scale; } });
					box.appendChild(h('div', { class: 'lab-row' }, h('span', { class: 'lab-stat' }, E.statName(k), h('code', {}, k)), h('div', { class: 'affix' }, val, h('span', { class: 'unit' }, scale === 100 ? '%' : '#')),
						h('button', { class: 'ibtn danger', title: 'Remove', onclick: () => { delete work[kind][k]; drawRows(); } }, FB.icon('trash', 14))));
				});
				box.appendChild(h('div', { class: 'add-box' }, FB.icon('plus', 15), FB.combo({ placeholder: 'Add a stat: type e.g. soft attack, armor, speed…', limit: 80,
					items: () => statKeys().filter((k) => !(k in work[kind])).map((k) => ({ label: E.statName(k), key: k + ' ' + E.statName(k), value: k, sub: k, icon: 'bolt', cat: 'Stats' })),
					onPick: (it) => { work[kind][it.value] = 0; drawRows(); } })));
				rowsHost.appendChild(box);
			});
		}
		drawRows();
		const finish = (c, msg) => { E.saveModule(c); closeLab(); FB.toast(msg, 'ok'); render(); };
		const buttons = [];
		if (isTest || creating) {
			buttons.push(h('button', { class: 'btn primary', onclick: () => {
				if (!work.name.trim()) { FB.toast('Give the test module a name first.', 'warn'); nameIn.focus(); return; }
				const k = work.key || E.newTestKey(work.name);
				finish({ key: k, name: work.name.trim(), category: work.category, abbr: (work.abbr || 'tst').slice(0, 4), add: cleanStats(work.add), mult: cleanStats(work.mult), avg: cleanStats(work.avg) }, 'Saved test module "' + work.name.trim() + '"');
			} }, FB.icon('save', 15), creating ? 'Create test module' : 'Save'));
		} else {
			buttons.push(h('button', { class: 'btn primary', onclick: () => finish({ key: real.key, override: true, category: real.category, add: cleanStats(work.add), mult: cleanStats(work.mult), avg: cleanStats(work.avg) }, 'Changed ' + d.name(real.key) + ' in the designer') }, FB.icon('check', 15), 'Apply to this module'));
			buttons.push(h('button', { class: 'btn', onclick: () => {
				const typed = nameIn.value.trim();
				const nm = typed && typed !== d.name(real.key) ? typed : d.name(real.key) + ' (test)';
				finish({ key: E.newTestKey(nm), name: nm, category: real.category, abbr: (real.abbr || 'tst').slice(0, 4), add: cleanStats(work.add), mult: cleanStats(work.mult), avg: cleanStats(work.avg) }, 'Saved as test module "' + nm + '"');
			} }, FB.icon('copy', 15), 'Save as a new test module'));
			if (real.modified) buttons.push(h('button', { class: 'btn', onclick: () => { E.removeModule(real.key); closeLab(); FB.toast('Back to the original numbers', 'ok'); render(); } }, FB.icon('undo', 15), 'Reset to original'));
		}
		if (isTest) buttons.push(h('button', { class: 'btn danger', onclick: () => { E.removeModule(real.key); Object.keys(D.design.sel).forEach((k) => { if (D.design.sel[k] === real.key) D.design.sel[k] = null; }); closeLab(); render(); } }, FB.icon('trash', 15), 'Delete'));
		const codeBtn = h('button', { class: 'btn', onclick: async () => {
			const code = E.moduleCode({ key: work.key || E.newTestKey(work.name || 'module'), category: work.category, abbr: work.abbr, add: cleanStats(work.add), mult: cleanStats(work.mult), avg: cleanStats(work.avg) }, work.name);
			FB.toast(await FB.copyText(code) ? 'HOI4 code copied. Paste it into a modules file in your mod.' : 'Copy failed', 'ok');
		} }, FB.icon('code', 15), 'Copy as HOI4 code');
		closeLab = FB.ui.modal(creating ? 'New test module' : isTest ? 'Test module' : 'Change module: ' + d.name(real.key), h('div', { class: 'lab' },
			real && !isTest ? h('p', { class: 'muted' }, 'You are changing the numbers of a game module. "Apply" changes it in every design here; "Save as a new test module" keeps the original and makes a named copy to test with.') : h('p', { class: 'muted' }, 'A test module only exists in this designer until you copy its code into a mod.'),
			h('div', { class: 'row2' }, h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, FB.icon('tag', 13), 'Name'), nameIn), h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Short name (max 4 letters)'), abbrIn)),
			h('div', { class: 'row2' }, h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Fits in'), catSel), baseSel ? h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Start from'), baseSel) : h('span')),
			rowsHost, h('div', { class: 'btn-row' }, buttons, codeBtn)), { wide: true });
	}

	/* ---------- snapshot for guides: everything needed to show a design without the game data ---------- */
	function snapshotDesign(dz) {
		const d = E.data, v = d && variant(dz);
		const out = { id: dz.id, name: dz.name, kind: dz.domain === 'naval' ? 'ship' : 'tank', designNote: dz.note || '' };
		if (!v) {
			out.variantLabel = prettyKey(dz.variant); out.family = ''; out.nation = ''; out.cost = 0; out.dials = null; out.svg = ''; out.stats = [];
			out.modules = Object.entries(dz.sel || {}).filter((x) => x[1]).map((x) => ({ slot: shortSlot(x[0]), name: prettyKey(x[1]), tier: '' }));
			return out;
		}
		const r = calcDesign(v, dz), group = d.groups[v.domain].find((g) => g.key === v.archetype);
		out.variantLabel = variantLabel(v);
		out.family = group ? group.name : prettyKey(v.archetype);
		out.nation = v.nation ? natName(v.nation) : '';
		out.modules = v.slots.map((s) => {
			const m = dz.sel[s.name] && d.modules[dz.sel[s.name]];
			const icon = m && !m.custom && FB.gfx && FB.gfx.ready ? FB.gfx.find(FB.gfx.moduleNames(m, d.modules)) : null;
			return { slot: shortSlot(s.name), key: m ? m.key : null, name: m ? (m.custom ? '★ ' : '') + d.name(m.key) : '', tier: m && tierOf(m) ? ROMAN[tierOf(m)] : '', icon };
		});
		if (FB.gfx) out.modules.forEach((x) => { if (x.icon) FB.gfx.keep(x.icon); });   // keep the pictures for the guide
		const spec = SPEC[v.domain] || SPEC.land;
		out.stats = [].concat(spec.base, spec.combat, spec.misc).filter((k) => r.stats[k] && Math.abs(r.stats[k].value) > 1e-9).map((k) => ({ label: E.statName(k), value: E.fmt(k, r.stats[k].value) }));
		out.cost = r.stats.build_cost_ic ? +r.stats.build_cost_ic.value.toFixed(2) : 0;
		out.dials = v.domain === 'land' ? (() => { const dl = clicks(dz, v), o = {}; upsFor(v).forEach((u) => { o[upLabel(u)] = Math.min(dl.levels[u.key] || 0, u.max || 0); }); return o; })() : null;
		out.svg = silhouette(v, dz, false);
		return out;
	}

	/* ---------- show / hide ---------- */
	FB.designer = {
		init() {
			load();
			document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
			root = h('section', { id: 'designer' }, h('div', { id: 'dz-body' }));
			body = root.firstChild;
			FB.modes.register('designer', 'Designer', 'wrench', root, {
				open() { D.open = true; render(); ensureData(false); },
				close() { D.open = false; closePop(); }
			});
			FB.on('ws', () => { if (D.open) ensureData(false); });
		},
		open: () => FB.modes.set('designer'),
		snapshot: snapshotDesign,
		saved: () => D.saved.slice(),
		hasData: () => !!E.data,
		ensure: () => ensureData(false)
	};
})(window.FB = window.FB || {});
