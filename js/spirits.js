/* Focus Builder - national spirits (ideas) of the open mod: read every common/ideas file, link each spirit that a
 * focus gives, removes, swaps or checks to the place it is defined, let you edit it (name, description, picture,
 * modifiers), and write the edits back into the original idea file without touching anything else in it. */
(function (FB) {
	'use strict';
	const S = FB.spirits = {};
	const isBlock = (e) => Array.isArray(e.v);
	const isScalar = (e) => typeof e.v === 'string';
	const bs = String.fromCharCode(92);
	const LOC_FILE = 'focusbuilder_spirits'; // new names go to localisation/english/focusbuilder_spirits_l_english.yml
	const NOT_IDEA = new Set(['use_list_view', 'designer', 'law']);

	/* ---------- reading ---------- */

	/** Every spirit defined in one ideas file: [{id, category, hidden, entry}] (entry = the parsed `id = { … }` block). */
	S.definitions = function (text) {
		const out = [];
		FB.importer.parse(text).forEach((t) => {
			if ((t.k !== 'ideas' && t.k !== 'hidden_ideas') || !isBlock(t)) return;
			t.v.forEach((c) => {
				if (!isBlock(c)) return;
				c.v.forEach((e) => { if (isBlock(e) && !NOT_IDEA.has(e.k)) out.push({ id: e.k, category: c.k, hidden: t.k === 'hidden_ideas', entry: e }); });
			});
		});
		return out;
	};

	/** The fields the editor works with, read from a parsed idea block. */
	function fieldsOf(e, text) {
		const pic = e.v.find((x) => x.k === 'picture' && isScalar(x));
		const mod = e.v.find((x) => x.k === 'modifier' && isBlock(x));
		const modifiers = [];
		if (mod) mod.v.forEach((x) => {
			if (isScalar(x) && (!x.op || x.op === '=')) modifiers.push({ k: x.k, v: x.v });
			else modifiers.push({ raw: text.slice(x.s, x.e) }); // anything else is kept exactly as written
		});
		return { picture: pic ? pic.v : '', modifiers, hasModifier: !!mod };
	}

	/**
	 * Reads every ideas file of the mod. files: {path: {text}}; loc: the mod's localisation.
	 * Returns a Map id -> spirit {id, file, category, hidden, name, desc, picture, modifiers, hasModifier, dupes}.
	 */
	S.index = function (files, loc) {
		loc = loc || {};
		const map = new Map();
		Object.keys(files).sort().forEach((path) => {
			const text = files[path].text;
			S.definitions(text).forEach((d) => {
				if (map.has(d.id)) { map.get(d.id).dupes.push(path); return; }
				map.set(d.id, Object.assign({ id: d.id, file: path, category: d.category, hidden: d.hidden, name: loc[d.id] != null ? loc[d.id] : '', desc: loc[d.id + '_desc'] != null ? loc[d.id + '_desc'] : '', dupes: [] }, fieldsOf(d.entry, text)));
			});
		});
		return map;
	};

	/* ---------- which spirits a focus uses ---------- */

	const ROLE = { add_ideas: 'gives', add_timed_idea: 'gives for a while', remove_ideas: 'removes', has_idea: 'checks' };
	/** Spirit ids in raw HOI4 code (any depth): add_ideas / remove_ideas (one id or a list), add_timed_idea, swap_ideas, has_idea. */
	function scanEntries(entries, push) {
		(entries || []).forEach((e) => {
			if (e.k === 'add_ideas' || e.k === 'remove_ideas') {
				if (isScalar(e)) push(e.v, ROLE[e.k]);
				else if (isBlock(e)) e.v.forEach((x) => { if (x.v === undefined && x.k) push(x.k, ROLE[e.k]); });
				return;
			}
			if (e.k === 'has_idea' && isScalar(e)) { push(e.v, ROLE.has_idea); return; }
			if (e.k === 'add_timed_idea' && isBlock(e)) { const i = e.v.find((x) => x.k === 'idea' && isScalar(x)); if (i) push(i.v, ROLE.add_timed_idea); return; }
			if (e.k === 'swap_ideas' && isBlock(e)) {
				const r = e.v.find((x) => x.k === 'remove_idea' && isScalar(x)), a = e.v.find((x) => x.k === 'add_idea' && isScalar(x));
				if (r) push(r.v, 'removes'); if (a) push(a.v, 'gives');
				return;
			}
			if (isBlock(e)) scanEntries(e.v, push);
		});
	}
	S.scanCode = function (code) {
		const out = [];
		scanEntries(FB.importer.parse(String(code || '')), (id, role) => out.push({ id, role }));
		return out;
	};

	/** [{id, roles:[…]}] for every spirit a focus gives, removes, swaps or checks (rewards, requirements, raw code). */
	S.refsOfFocus = function (f) {
		const found = new Map();
		const push = (id, role) => {
			id = String(id || '').trim();
			if (!id || /[\s{}=]/.test(id)) return;
			if (!found.has(id)) found.set(id, { id, roles: [] });
			const r = found.get(id).roles;
			if (role && !r.includes(role)) r.push(role);
		};
		const items = (arr, kind) => (arr || []).forEach((it) => {
			if (!it) return;
			if (it.type === '__raw') { S.scanCode(it.p && it.p.text).forEach((r) => push(r.id, r.role)); return; }
			const role = it.type === 'swap_ideas' ? null : ROLE[it.type] || (kind === 'trigger' ? 'checks' : 'uses');
			if (it.type === 'swap_ideas' && it.p) { push(it.p.remove, 'removes'); push(it.p.add, 'gives'); return; }
			const def = FB.catalog && FB.catalog.def(kind, it.type);
			if (def && def.refs) { try { def.refs(it.p || {}).forEach((r) => { if (r.kind === 'idea') push(r.id, role); }); } catch (e) { /* half-filled item */ } }
		});
		items(f.rewards, 'effect');
		[f.available, f.bypass, f.visible].forEach((c) => items(c && c.items, 'trigger'));
		S.scanCode(f.extra).forEach((r) => push(r.id, r.role));
		return [...found.values()];
	};

	/** Spirits used anywhere in a project (every focus), each with the focuses that use it. */
	S.refsOfProject = function (p) {
		const m = new Map();
		(p.focuses || []).forEach((f) => S.refsOfFocus(f).forEach((r) => {
			if (!m.has(r.id)) m.set(r.id, { id: r.id, focuses: [] });
			m.get(r.id).focuses.push(f.id);
		}));
		return [...m.values()];
	};

	/* ---------- workspace state ---------- */

	const ws = () => FB.ws;
	const snap = (sp) => JSON.stringify({ name: sp.name, desc: sp.desc, picture: sp.picture, modifiers: sp.modifiers });
	/** Called by the workspace after it read the mod's ideas files. */
	S.load = function (w, files) {
		w.ideaFiles = files;
		w.spirits = S.index(files, w.loc);
		w.spiritBase = new Map([...w.spirits.values()].map((sp) => [sp.id, snap(sp)]));
	};
	S.get = (id) => (ws() && ws().spirits ? ws().spirits.get(id) || null : null);
	S.isDirty = (id) => { const w = ws(), sp = S.get(id); return !!sp && w.spiritBase.get(id) !== snap(sp); };
	S.dirtyIds = () => { const w = ws(); return w && w.spirits ? [...w.spirits.keys()].filter(S.isDirty) : []; };

	/** Replaces a spirit's editable fields (from the editor). Returns true when something changed. */
	S.update = function (id, fields) {
		const sp = S.get(id);
		if (!sp) return false;
		const before = snap(sp);
		['name', 'desc', 'picture'].forEach((k) => { if (fields[k] != null) sp[k] = String(fields[k]); });
		if (fields.modifiers) sp.modifiers = fields.modifiers.filter((m) => m.raw != null || (m.k && String(m.k).trim())).map((m) => (m.raw != null ? { raw: m.raw } : { k: String(m.k).trim(), v: String(m.v == null ? '' : m.v).trim() }));
		if (snap(sp) === before) return false;
		if (FB.gd && FB.gd.names && FB.gd.names.idea && sp.name) FB.gd.names.idea.set(id, sp.name);
		return true;
	};
	/** Puts a spirit back the way it was when the mod was opened or last saved. */
	S.revert = function (id) {
		const sp = S.get(id), b = ws().spiritBase.get(id);
		if (sp && b) Object.assign(sp, JSON.parse(b));
	};

	/** Human changelog lines for the edited spirits. */
	S.changes = function () {
		const lines = [];
		S.dirtyIds().forEach((id) => {
			const sp = S.get(id), b = JSON.parse(ws().spiritBase.get(id));
			const nm = sp.name || b.name || id;
			const add = (text) => lines.push({ sign: '~', text, spirit: id });
			if (b.name !== sp.name) add(`Spirit ${id}: renamed "${b.name || id}" → "${sp.name}"`);
			if (b.desc !== sp.desc) add(`Spirit "${nm}": description edited`);
			if (b.picture !== sp.picture) add(`Spirit "${nm}": picture ${b.picture || '(default)'} → ${sp.picture || '(default)'}`);
			const bm = new Map(b.modifiers.filter((m) => m.k).map((m) => [m.k, m.v])), cm = new Map(sp.modifiers.filter((m) => m.k).map((m) => [m.k, m.v]));
			cm.forEach((v, k) => { if (!bm.has(k)) add(`Spirit "${nm}": added ${k} = ${v}`); else if (bm.get(k) !== v) add(`Spirit "${nm}": ${k} ${bm.get(k)} → ${v}`); });
			bm.forEach((v, k) => { if (!cm.has(k)) add(`Spirit "${nm}": removed ${k}`); });
			if (JSON.stringify(b.modifiers.filter((m) => m.raw)) !== JSON.stringify(sp.modifiers.filter((m) => m.raw))) add(`Spirit "${nm}": other modifier code edited`);
		});
		return lines;
	};

	/* ---------- writing back ---------- */

	const lineStart = (text, i) => text.lastIndexOf('\n', i - 1) + 1;
	const indentAt = (text, i) => { const pre = text.slice(lineStart(text, i), i); return /^[ \t]*$/.test(pre) ? pre : ''; };
	const needsQuote = (v) => v === '' || /[\s{}=#"]/.test(v);
	const val = (v) => (needsQuote(v) ? '"' + String(v).split('"').join(bs + '"') + '"' : v);
	/** Removes an entry; when it is alone on its line, the whole line goes (with a comment at its end). */
	function cutEdit(text, e) {
		let s = e.s, en = e.e;
		const ls = lineStart(text, s);
		if (/^[ \t]*$/.test(text.slice(ls, s))) {
			const m = /^[ \t]*(#[^\r\n]*)?\r?\n/.exec(text.slice(en));
			if (m) { s = ls; en += m[0].length; }
		}
		return { s, e: en, text: '' };
	}

	/**
	 * Applies a spirit's edited picture and modifiers to the idea file text. Only the `picture` line and the
	 * `modifier = { … }` block of that one spirit change; everything else (other spirits, comments, allowed,
	 * on_add, targeted modifiers…) stays byte for byte the same. Returns the new text (unchanged if the spirit is gone).
	 */
	S.patchText = function (text, sp, base) {
		const d = S.definitions(text).find((x) => x.id === sp.id);
		if (!d) return text;
		const e = d.entry;
		const eol = text.includes('\r\n') ? '\r\n' : '\n';
		const outer = indentAt(text, e.s);
		const inner = (() => { const first = e.v[0]; return first ? indentAt(text, first.s) || outer + '\t' : outer + '\t'; })();
		const openBrace = text.indexOf('{', e.s) + 1;
		const edits = [];
		const insertAfterBrace = (line) => edits.push({ s: openBrace, e: openBrace, text: eol + inner + line });

		if ((base.picture || '') !== (sp.picture || '')) {
			const pic = e.v.find((x) => x.k === 'picture' && isScalar(x));
			if (pic && sp.picture) edits.push({ s: pic.s, e: pic.e, text: 'picture = ' + val(sp.picture) });
			else if (pic) edits.push(cutEdit(text, pic));
			else if (sp.picture) insertAfterBrace('picture = ' + val(sp.picture));
		}
		if (JSON.stringify(base.modifiers) !== JSON.stringify(sp.modifiers)) {
			const mod = e.v.find((x) => x.k === 'modifier' && isBlock(x));
			const mind = mod ? indentAt(text, mod.s) || inner : inner;
			const body = sp.modifiers.map((m) => mind + '\t' + (m.raw != null ? m.raw : `${m.k} = ${val(m.v)}`));
			const block = body.length ? 'modifier = {' + eol + body.join(eol) + eol + mind + '}' : '';
			if (mod && block) {
				// line by line, so comments and layout inside the block survive: change values, drop removed, append new
				const used = new Set();
				const added = [];
				sp.modifiers.forEach((m) => {
					const o = mod.v.find((x) => !used.has(x) && (m.raw != null ? text.slice(x.s, x.e) === m.raw : isScalar(x) && (!x.op || x.op === '=') && x.k === m.k));
					if (!o) { if (m.raw == null) added.push(`${m.k} = ${val(m.v)}`); return; }
					used.add(o);
					if (m.raw == null && o.v !== m.v) edits.push({ s: o.s, e: o.e, text: `${m.k} = ${val(m.v)}` });
				});
				mod.v.forEach((x) => { if (!used.has(x)) edits.push(cutEdit(text, x)); });
				if (added.length) {
					const close = mod.e - 1, ls = lineStart(text, close);
					if (/^[ \t]*$/.test(text.slice(ls, close))) edits.push({ s: ls, e: ls, text: added.map((a) => mind + '\t' + a + eol).join('') });
					else edits.push({ s: close, e: close, text: added.join(' ') + ' ' });
				}
			} else if (mod) edits.push(cutEdit(text, mod));
			else if (block) {
				const pic = e.v.find((x) => x.k === 'picture' && isScalar(x));
				// after the picture line, unless that line is being removed
				if (pic && sp.picture) edits.push({ s: pic.e, e: pic.e, text: eol + inner + block });
				else insertAfterBrace(block);
			}
		}
		edits.sort((a, b) => b.s - a.s || b.e - a.e).forEach((ed) => { text = text.slice(0, ed.s) + ed.text + text.slice(ed.e); });
		return text;
	};

	/**
	 * Writes every edited spirit: idea files (backed up first) and names/descriptions in the localisation.
	 * setLoc(key, value, fileStem) is the workspace's localisation writer. Returns the changelog lines.
	 */
	S.writeAll = async function (w, backup, written, setLoc) {
		const ids = S.dirtyIds();
		if (!ids.length) return [];
		const lines = S.changes();
		const byFile = {};
		ids.forEach((id) => { const sp = w.spirits.get(id); (byFile[sp.file] = byFile[sp.file] || []).push(sp); });
		for (const [path, list] of Object.entries(byFile)) {
			const old = w.ideaFiles[path].text;
			let text = old;
			list.forEach((sp) => { text = S.patchText(text, sp, JSON.parse(w.spiritBase.get(sp.id))); });
			if (text !== old) {
				await backup(path, old);
				await FB.fsutil.writeText(w.dir, path, text);
				w.ideaFiles[path].text = text;
				written.push(path);
			}
		}
		ids.forEach((id) => {
			const sp = w.spirits.get(id), b = JSON.parse(w.spiritBase.get(id));
			if (b.name !== sp.name) setLoc(id, sp.name, LOC_FILE);
			if (b.desc !== sp.desc) setLoc(id + '_desc', sp.desc, LOC_FILE);
			w.spiritBase.set(id, snap(sp));
		});
		return lines;
	};

	/* ---------- editor (browser only) ---------- */

	const MOD_KEYS = ['political_power_gain', 'political_power_factor', 'stability_factor', 'war_support_factor', 'consumer_goods_factor', 'production_speed_buildings_factor',
		'industrial_capacity_factory', 'industrial_capacity_dockyard', 'research_speed_factor', 'conscription', 'conscription_factor', 'army_org_factor', 'army_attack_factor', 'army_defence_factor',
		'training_time_factor', 'production_factory_efficiency_gain_factor', 'production_factory_max_efficiency_factor', 'local_resources_factor', 'experience_gain_army', 'experience_gain_navy',
		'experience_gain_air', 'monthly_population', 'max_planning', 'supply_consumption_factor', 'justify_war_goal_time', 'trade_opinion_factor', 'drift_defence_factor', 'max_command_power',
		'command_power_gain_mult', 'army_speed_factor', 'air_superiority_bonus_in_combat', 'navy_org_factor', 'naval_speed_factor', 'surrender_limit', 'resistance_target', 'compliance_growth'];
	const modKeyItems = () => {
		const seen = new Set(MOD_KEYS);
		const w = ws();
		if (w && w.spirits) w.spirits.forEach((sp) => sp.modifiers.forEach((m) => { if (m.k) seen.add(m.k); }));
		return [...seen].sort().map((k) => ({ label: k, key: k + ' ' + k.replace(/_/g, ' '), value: k }));
	};
	const picOf = (sp, pic) => 'GFX_idea_' + (pic || sp.id);

	/** Opens the editor for one spirit (read-only in Normal mode). */
	S.openEditor = function (id) {
		const h = FB.h, sp = S.get(id);
		if (!sp) { FB.toast(`"${id}" is not defined in this mod's common/ideas folder, so it cannot be edited here.`, 'warn'); return; }
		const can = !!(FB.dev && FB.dev.on);
		const draft = { name: sp.name, desc: sp.desc, picture: sp.picture, modifiers: sp.modifiers.map((m) => Object.assign({}, m)) };
		const fallbackName = (FB.gd && FB.gd.label('idea', id)) || id;
		const fld = (label, ctl, hint) => h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, label), ctl, hint ? h('span', { class: 'fld-hint' }, hint) : null);
		const picBox = h('span', { class: 'icon-prev spirit-pic' });
		const showPic = () => { picBox.innerHTML = ''; if (FB.gfx) picBox.appendChild(FB.gfx.picture(picOf(sp, draft.picture), 'icon-prev-img')); };
		showPic();
		const picInput = h('input', { type: 'text', class: 'mono', value: draft.picture, placeholder: id, spellcheck: 'false', disabled: !can, oninput: (e) => { draft.picture = e.target.value.trim(); showPic(); } });
		const rows = h('div', { class: 'spirit-mods' });
		const drawRows = () => {
			rows.innerHTML = '';
			if (!draft.modifiers.length) rows.appendChild(h('div', { class: 'empty-hint' }, 'No modifiers. Add one below.'));
			draft.modifiers.forEach((m, i) => {
				const del = h('button', { class: 'ibtn danger', title: 'Remove', disabled: !can, onclick: () => { draft.modifiers.splice(i, 1); drawRows(); } }, '✕');
				if (m.raw != null) { rows.appendChild(h('div', { class: 'spirit-mod raw' }, h('code', { title: 'Kept exactly as written in the file' }, m.raw), del)); return; }
				const k = h('input', { type: 'text', class: 'mono', value: m.k, placeholder: 'modifier, e.g. stability_factor', spellcheck: 'false', disabled: !can, oninput: (e) => { m.k = e.target.value.trim(); } });
				if (can && FB.attachCombo) FB.attachCombo(k, { items: modKeyItems, clear: false, limit: 80, group: 'field:modifier', onPick: (it) => { m.k = it.value; k.value = it.value; } });
				const v = h('input', { type: 'text', class: 'mono', value: m.v, placeholder: 'e.g. 0.05', spellcheck: 'false', disabled: !can, oninput: (e) => { m.v = e.target.value.trim(); } });
				rows.appendChild(h('div', { class: 'spirit-mod' }, k, h('span', {}, '='), v, del));
			});
		};
		drawRows();
		let close = () => {};
		const done = () => {
			if (S.update(id, draft)) { FB.toast(`Spirit "${draft.name || id}" changed. Save to mod to write it into ${sp.file}.`, 'ok'); FB.emit('ws'); if (FB.ui && FB.ui.renderInspector) FB.ui.renderInspector(); }
			close();
		};
		const dirty = S.isDirty(id);
		const body = h('div', { class: 'spirit-edit stack' },
			h('p', { class: 'muted small' }, 'Defined in ', h('code', {}, sp.file), sp.category ? ` · ${sp.category.replace(/_/g, ' ')}` : '', sp.hidden ? ' · hidden spirit' : '',
				sp.dupes.length ? h('span', { class: 'warn' }, ` · also defined in ${sp.dupes.join(', ')} (only this one is edited)`) : null),
			fld('Name shown in game', h('input', { type: 'text', value: draft.name, placeholder: fallbackName, disabled: !can, oninput: (e) => { draft.name = e.target.value; } }), `Localisation key ${id}`),
			fld('Description', h('textarea', { rows: 3, value: draft.desc, disabled: !can, oninput: (e) => { draft.desc = e.target.value; } }), `Localisation key ${id}_desc`),
			fld('Picture', h('div', { class: 'icon-pick' }, picBox, h('div', { class: 'icon-col' }, picInput)), 'Sprite name without GFX_idea_. Empty uses GFX_idea_' + id + '.'),
			h('div', { class: 'sub-title' }, 'Modifiers'), rows,
			can ? h('button', { class: 'btn small', onclick: () => { draft.modifiers.push({ k: '', v: '' }); drawRows(); } }, '+ Add modifier') : null,
			h('p', { class: 'muted small' }, can ? 'Only the picture line and modifier block of this spirit are rewritten when you save; the rest of the file stays as it is.' : 'View only. Switch to Development mode (top bar) to edit.'),
			h('div', { class: 'btn-row' },
				can ? h('button', { class: 'btn primary', onclick: done }, 'Apply') : null,
				can && dirty ? h('button', { class: 'btn', onclick: () => { S.revert(id); FB.emit('ws'); if (FB.ui.renderInspector) FB.ui.renderInspector(); close(); } }, 'Undo my edits to this spirit') : null,
				h('button', { class: 'btn', onclick: () => close() }, can ? 'Cancel' : 'Close')));
		close = FB.ui.modal('National spirit: ' + (sp.name || fallbackName), body);
	};

	/** Inspector section body: the spirits a focus uses, each with an Edit button. Null when the focus uses none. */
	S.focusSection = function (f) {
		const h = FB.h;
		const refs = S.refsOfFocus(f);
		if (!refs.length) return null;
		const box = h('div', { class: 'stack spirit-list' });
		refs.forEach((r) => {
			const sp = S.get(r.id);
			const name = (sp && sp.name) || (FB.gd && FB.gd.label('idea', r.id)) || r.id;
			const mods = sp ? sp.modifiers.filter((m) => m.k).slice(0, 4).map((m) => `${m.k} = ${m.v}`).join(' · ') : '';
			const where = sp ? sp.file.replace('common/ideas/', '') : (FB.gd && (FB.gd.lists.idea || []).some((i) => i.id === r.id) ? 'base game (not editable here)' : 'not found in the mod');
			box.appendChild(h('div', { class: 'ecard spirit-row', style: { '--cc': '#e6c75a' } },
				h('div', { class: 'ecard-h' },
					h('span', { class: 'icon-prev spirit-pic' }, FB.gfx ? FB.gfx.picture(sp ? picOf(sp, sp.picture) : 'GFX_idea_' + r.id, 'icon-prev-img') : null),
					h('div', { class: 'ecard-t' }, h('b', {}, (sp && S.isDirty(r.id) ? '● ' : '') + name), h('code', {}, r.id),
						h('span', { class: 'muted small' }, [r.roles.join(', '), where].filter(Boolean).join(' · '))),
					sp ? h('div', { class: 'ecard-b' }, h('button', { class: 'btn small ro-keep', onclick: () => S.openEditor(r.id) }, FB.dev && FB.dev.on ? 'Edit spirit' : 'View')) : null),
				mods ? h('div', { class: 'ecard-d mono' }, mods) : null));
		});
		return { body: box, count: refs.length };
	};
})(window.FB = window.FB || {});
