/* Focus Builder - mod workspace: open a mod folder, switch between every focus tree, save edits back safely */
(function (FB) {
	'use strict';

	const dec = new TextDecoder('utf-8', { ignoreBOM: true }); // keep the BOM so files round-trip exactly
	const readText = async (fh) => dec.decode(await (await fh.getFile()).arrayBuffer());
	async function fileHandle(dir, path, create) {
		const parts = path.split('/');
		let d = dir;
		for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create });
		return d.getFileHandle(parts[parts.length - 1], { create });
	}
	async function writeText(dir, path, text) {
		const fh = await fileHandle(dir, path, true);
		const w = await fh.createWritable();
		await w.write(new Blob([text]));
		await w.close();
	}
	async function tryRead(dir, path) { try { return await readText(await fileHandle(dir, path, false)); } catch (e) { return null; } }
	async function walk(dir, base, out, depth, pred) {
		for await (const [name, hd] of dir.entries()) {
			if (hd.kind === 'directory') { if (depth < 5) await walk(hd, base + name + '/', out, depth + 1, pred); }
			else if (pred(name, base)) out.push({ path: base + name, handle: hd });
		}
	}
	const tick = () => new Promise((r) => setTimeout(r));

	/* remember the folder between sessions (needs a click to re-grant permission) */
	const idb = {
		open() { return new Promise((res, rej) => { const q = indexedDB.open('focusbuilder', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
		async get(k) { try { const db = await idb.open(); return await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; } },
		async set(k, v) { try { const db = await idb.open(); await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch (e) { /* private mode */ } }
	};

	const ws = FB.ws = {
		active: false, name: '', dir: null, files: {}, trees: [], loc: {}, locFiles: {}, locIndex: {},
		current: null, projects: {}, baselines: {}, stats: {}, versions: [], sharedBlocks: 0, lastHandle: null
	};
	const bs = String.fromCharCode(92);
	const locEscape = (s) => String(s == null ? '' : s).split(bs).join(bs + bs).split('"').join(bs + '"').replace(/\r?\n/g, bs + 'n');
	const reEscape = (s) => s.replace(/[.*+?^${}()|[\]]/g, (m) => bs + m);

	ws.supported = () => typeof window.showDirectoryPicker === 'function';
	ws.remembered = async () => { const h = await idb.get('mod-dir'); ws.lastHandle = h; return h; };

	ws.open = async function (onProgress) {
		const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
		return ws.load(dir, onProgress);
	};
	ws.reopen = async function (onProgress) {
		const h = ws.lastHandle || await ws.remembered();
		if (!h) return null;
		if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Permission to the folder was not granted.');
		return ws.load(h, onProgress);
	};

	/** Opens a folder through the local helper (works for any path, even under Program Files). */
	ws.openPath = async function (path, onProgress, label) {
		const info = await FB.server.post('open', { path });
		const dir = FB.server.dir(info.path, info.name);
		return ws.load(dir, onProgress, { server: true, path: info.path, name: label || info.name });
	};

	ws.load = async function (dir, onProgress, opts) {
		opts = opts || {};
		const say = (m) => { if (onProgress) onProgress(m); };
		let nf = null, mioDir = null;
		try {
			const common = await dir.getDirectoryHandle('common');
			try { nf = await common.getDirectoryHandle('national_focus'); } catch (e) { nf = null; }
			try { mioDir = await (await common.getDirectoryHandle('military_industrial_organization')).getDirectoryHandle('organizations'); } catch (e) { mioDir = null; }
		} catch (e) { /* no common folder */ }
		if (!nf && !mioDir) throw new Error('That folder has no common/national_focus or military_industrial_organization folder. Pick the mod\'s root folder (the one with descriptor.mod).');
		const found = [], mioFound = [];
		if (nf) await walk(nf, 'common/national_focus/', found, 0, (n) => /\.txt$/i.test(n));
		if (mioDir) await walk(mioDir, 'common/military_industrial_organization/organizations/', mioFound, 0, (n) => /\.txt$/i.test(n));
		const files = {}, trees = [];
		let shared = 0, i = 0;
		for (const f of found) {
			say(`Reading focus files… ${++i}/${found.length}`);
			if (i % 15 === 0) await tick();
			const text = await readText(f.handle);
			files[f.path] = { handle: f.handle, text };
			FB.importer.parseFile(text, f.path).forEach((t) => {
				if (t.shared) { shared += t.count; return; }
				t.key = f.path + '#' + t.index;
				trees.push(t);
			});
		}
		for (const f of mioFound) {
			say('Reading organizations…');
			const text = await readText(f.handle);
			files[f.path] = { handle: f.handle, text };
			FB.importer.parseMioFile(text, f.path).forEach((t) => { t.key = f.path + '#' + t.index; trees.push(t); });
		}
		const locFiles = {}, locIndex = {}, loc = {};
		let locDir = null;
		try { locDir = await dir.getDirectoryHandle('localisation'); } catch (e) { locDir = null; }
		if (locDir) {
			const lf = [];
			await walk(locDir, 'localisation/', lf, 0, (n, base) => /\.ya?ml$/i.test(n) && (/l_english/i.test(n) || /english/i.test(base)));
			let j = 0;
			for (const f of lf.slice(0, 1500)) {
				say(`Reading localisation… ${++j}/${lf.length}`);
				if (j % 25 === 0) await tick();
				const text = await readText(f.handle);
				if (!/^[\s﻿]*l_english\s*:/.test(text)) continue;
				locFiles[f.path] = { handle: f.handle, text, dirty: false };
				FB.importer.parseLoc(text, loc);
				text.split(/\r?\n/).forEach((l) => { const m = /^\s*([^\s:#]+):\d*\s+"/.exec(l); if (m) locIndex[m[1]] = { path: f.path }; });
			}
		}
		trees.sort((a, b) => (a.kind === 'mio' ? 1 : 0) - (b.kind === 'mio' ? 1 : 0) || (a.tag || '~').localeCompare(b.tag || '~') || String(a.id).localeCompare(String(b.id)));
		if (FB.state.project.focuses.length && FB.isChanged(FB.state.project, FB.state.baseline) && !ws.active && !confirm('You have unsaved changes in the open project. Opening a mod replaces it. Continue?')) return null;
		Object.assign(ws, { active: true, name: opts.name || dir.name, dir, files, trees, loc, locFiles, locIndex, current: null, projects: {}, baselines: {}, stats: {}, versions: [], sharedBlocks: shared,
			serverMode: !!opts.server, path: opts.path || '',
			backupDir: opts.server && FB.server.info ? FB.server.dir(FB.server.info.backupRoot, 'Focus Builder backups') : null });
		if (!opts.server) { idb.set('mod-dir', dir); ws.lastHandle = dir; }
		FB.emit('ws');
		const first = trees.find((t) => t.count > 0) || trees[0];
		if (first) ws.switchTo(first.key);
		return trees.length;
	};

	ws.treeOf = (key) => ws.trees.find((t) => t.key === key) || null;
	ws.projectOf = (key) => (key === ws.current ? FB.state.project : ws.projects[key] || null);
	ws.isDirty = (key) => { const p = ws.projectOf(key); return !!p && ws.baselines[key] != null && FB.isChanged(p, ws.baselines[key]); };

	ws.switchTo = function (key) {
		if (key === ws.current) return;
		const t = ws.treeOf(key);
		if (!t) return;
		if (ws.current) ws.projects[ws.current] = FB.state.project;
		let proj = ws.projects[key];
		if (!proj) {
			const r = t.kind === 'mio' ? FB.importer.buildMioProject(t, ws.loc) : FB.importer.buildProject(t, ws.loc);
			proj = FB.migrate(r.project);
			ws.projects[key] = proj;
			ws.baselines[key] = FB.snapshot(proj);
			ws.stats[key] = r.stats;
		}
		ws.current = key;
		FB.setProject(proj, { baseline: ws.baselines[key] });
		FB.emit('ws');
		setTimeout(() => FB.canvas.fit(), 30);
	};

	/** Changes of every tree you edited in this workspace. */
	ws.pending = function () {
		if (ws.current) ws.projects[ws.current] = FB.state.project;
		const groups = [];
		ws.trees.forEach((t) => {
			const p = ws.projectOf(t.key);
			if (!p || ws.baselines[t.key] == null) return;
			const lines = FB.diff(ws.baselines[t.key], p);
			if (lines.length) groups.push({ tree: t.id, tag: t.tag, key: t.key, lines });
		});
		return groups;
	};
	ws.dirtyCount = () => ws.trees.filter((t) => ws.isDirty(t.key)).length;

	function setLoc(key, value, treeId) {
		const ent = ws.locIndex[key];
		if (ent) {
			const f = ws.locFiles[ent.path];
			if (!f.dirty) f.originalText = f.text;
			const eol = f.text.includes('\r\n') ? '\r\n' : '\n';
			const re = new RegExp('^(\\s*' + reEscape(key) + ':\\d*\\s+")(.*)(".*)$');
			const lines = f.text.split(/\r?\n/);
			for (let i = 0; i < lines.length; i++) {
				if (re.test(lines[i])) { lines[i] = lines[i].replace(re, (m, a, b, c) => a + locEscape(value) + c); break; }
			}
			f.text = lines.join(eol); f.dirty = true;
		} else {
			if (value == null || String(value) === '') return;
			const path = `localisation/english/${treeId}_l_english.yml`;
			if (!ws.locFiles[path]) ws.locFiles[path] = { handle: null, text: '﻿l_english:\n', dirty: true, created: true };
			const f = ws.locFiles[path];
			const eol = f.text.includes('\r\n') ? '\r\n' : '\n';
			f.text = f.text.replace(/\s*$/, '') + eol + ` ${key}:0 "${locEscape(value)}"` + eol; f.dirty = true;
			ws.locIndex[key] = { path };
		}
		ws.loc[key] = value;
	}

	/**
	 * Edits a file in place: focuses/traits you did not touch keep their exact original text (formatting, comments,
	 * relative positions); only changed ones are rewritten, new ones are added at the end of the tree, deleted ones removed.
	 * Returns the new file text. Falls back to regenerating a tree when its header (tag, id, settings) changed.
	 */
	function patchFile(text, path, ts) {
		const kind = ts[0].kind === 'mio' ? 'mio' : 'focus';
		const parsedAll = (kind === 'mio' ? FB.importer.parseMioFile : FB.importer.parseFile)(text, path);
		const markFresh = (proj, f) => { f.srcId = f.id; f.srcSig = FB.gen.sigOf(proj, f); delete f.srcRel; delete f.srcRelPos; };
		ts.slice().sort((a, b) => b.index - a.index).forEach((t) => {
			const proj = ws.projects[t.key], base = JSON.parse(ws.baselines[t.key]);
			const parsed = parsedAll.find((x) => x.index === t.index);
			const headerChanged = ['tag', 'treeId', 'countryRaw', 'treeExtra', 'mioHeader'].some((k) => (base.meta[k] || '') !== (proj.meta[k] || ''));
			if (!parsed || headerChanged) {
				const span = parsed ? parsed.span : t.span;
				text = text.slice(0, span[0]) + FB.gen.treeBlock(proj) + text.slice(span[1]);
				proj.focuses.forEach((f) => markFresh(proj, f));
				return;
			}
			const units = FB.importer.unitEntries(parsed, kind);
			const byId = new Map(units.map((u) => [u.id, u.e]));
			const indentOf = (e) => { const ls = text.lastIndexOf('\n', e.s - 1) + 1, pre = text.slice(ls, e.s); return /^[ \t]*$/.test(pre) ? pre : '\t'; };
			const render = (f, ind) => FB.gen.unitLines(proj, f).map((l, i) => (i ? ind + l : l)).join('\n');
			const curPos = (id) => { const o = proj.focuses.find((x) => x.srcId === id); return o ? o.x + ',' + o.y : null; };
			const edits = [], seen = new Set(), fresh = [], added = [];
			proj.focuses.forEach((f) => {
				const e = f.srcId ? byId.get(f.srcId) : null;
				if (!e) { added.push(f); return; }
				seen.add(f.srcId);
				const posSafe = !f.srcRel || curPos(f.srcRel) === f.srcRelPos;
				if (posSafe && FB.gen.sigOf(proj, f) === f.srcSig) return; // untouched: keep the original text
				edits.push({ s: e.s, e: e.e, text: render(f, indentOf(e)) });
				fresh.push(f);
			});
			byId.forEach((e, id) => {
				if (seen.has(id)) return;
				let s = e.s, en = e.e;
				const ls = text.lastIndexOf('\n', s - 1) + 1;
				if (/^[ \t]*$/.test(text.slice(ls, s))) s = ls;
				const m = /^[ \t]*\r?\n/.exec(text.slice(en));
				if (m && s !== e.s) en += m[0].length;
				edits.push({ s, e: en, text: '' });
			});
			if (added.length) {
				const close = parsed.span[1] - 1;
				const ls = text.lastIndexOf('\n', close - 1) + 1;
				const lineOnly = /^[ \t]*$/.test(text.slice(ls, close));
				const at = lineOnly ? ls : close;
				const ind = units.length ? indentOf(units[0].e) : '\t';
				edits.push({ s: at, e: at, text: (lineOnly ? '' : '\n') + '\n' + added.map((f) => ind + render(f, ind)).join('\n\n') + '\n' });
				added.forEach((f) => fresh.push(f));
			}
			edits.sort((a, b) => b.s - a.s || b.e - a.e).forEach((ed) => { text = text.slice(0, ed.s) + ed.text + text.slice(ed.e); });
			fresh.forEach((f) => markFresh(proj, f));
		});
		return text;
	}

	/**
	 * Writes every edited tree back into its original file (only the focus_tree block is replaced),
	 * updates names/descriptions in the localisation files, keeps backups, and logs a version.
	 */
	ws.save = async function (label, notes) {
		if (!ws.dir) throw new Error('No mod folder is open.');
		const groups = ws.pending();
		if (!groups.length) return null;
		const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		const written = [];
		// With the helper, backups go next to your documents so they never end up inside a (workshop) mod folder.
		const safeName = ws.name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'mod';
		const backupLabel = ws.backupDir ? `${FB.server.info.backupRoot}\\${safeName}\\${stamp}` : `FocusBuilder_backups/${stamp}`;
		const backup = async (path, text) => {
			if (ws.backupDir) await writeText(ws.backupDir, `${safeName}/${stamp}/${path}`, text);
			else await writeText(ws.dir, `FocusBuilder_backups/${stamp}/${path}`, text);
		};
		const keys = groups.map((g) => g.key);
		const byFile = {};
		keys.forEach((k) => { const t = ws.treeOf(k); (byFile[t.file] = byFile[t.file] || []).push(t); });

		for (const [path, ts] of Object.entries(byFile)) {
			const old = ws.files[path].text;
			const text = patchFile(old, path, ts);
			await backup(path, old);
			await writeText(ws.dir, path, text);
			ws.files[path].text = text;
			(ts[0].kind === 'mio' ? FB.importer.parseMioFile : FB.importer.parseFile)(text, path).forEach((n) => {
				const t = ws.trees.find((x) => x.file === path && x.index === n.index);
				if (t) { t.span = n.span; t.entries = n.entries; t.count = n.count; t.id = n.id; t.tag = n.tag; }
			});
			written.push(path);
		}

		keys.forEach((k) => {
			const p = ws.projects[k], base = JSON.parse(ws.baselines[k]);
			const bm = new Map(base.focuses.map((f) => [f.uid, f]));
			p.focuses.forEach((f) => {
				const b = bm.get(f.uid);
				const mio = p.kind === 'mio';
				const key = mio ? (f.nameKey || f.id) : f.id;
				const renamed = !b || (!mio && b.id !== f.id) || (mio && (b.nameKey || b.id) !== key);
				if (renamed || b.name !== f.name) setLoc(key, f.name, p.meta.treeId);
				if (renamed ? !!f.desc : (b.desc || '') !== (f.desc || '')) setLoc(key + '_desc', f.desc, p.meta.treeId);
			});
		});
		for (const [path, f] of Object.entries(ws.locFiles)) {
			if (!f.dirty) continue;
			if (!f.created) await backup(path, f.originalText != null ? f.originalText : f.text);
			await writeText(ws.dir, path, f.text);
			f.dirty = false; f.created = false;
			written.push(path);
		}

		if (FB.focusGfx) await FB.focusGfx.writePending(ws, backup, written);   // new focus pictures (.dds + sprite file)

		const chPath = 'FocusBuilder_changelog.md';
		const existing = await tryRead(ws.dir, chPath);
		const ver = { label: (label || '').trim() || FB.nextVersionLabel(existing), date: new Date().toISOString(), notes: notes || '', groups: groups.map((g) => ({ tree: g.tree, tag: g.tag, lines: g.lines })) };
		const section = FB.gen.versionMd(ver);
		let out;
		if (existing && /^## /m.test(existing)) { const i = existing.search(/^## /m); out = existing.slice(0, i) + section + '\n' + existing.slice(i); }
		else if (existing) out = existing.replace(/\s*$/, '\n\n') + section;
		else out = '# Changelog\n\nWritten by Focus Builder. Newest version first.\n\n' + section;
		await writeText(ws.dir, chPath, out);
		written.push(chPath);
		ws.versions.push(ver);

		keys.forEach((k) => { ws.baselines[k] = FB.snapshot(ws.projects[k]); });
		if (ws.current) { FB.state.baseline = ws.baselines[ws.current]; FB.resetHistory(); }
		FB.emit('change', { full: true });
		FB.emit('ws');
		return { version: ver, files: written, backupDir: backupLabel };
	};

	ws.close = function () { ws.active = false; ws.current = null; FB.emit('ws'); };

	/** File helpers shared with the equipment designer. */
	FB.fsutil = { readText, walk, fileHandle, writeText, tryRead };
})(window.FB = window.FB || {});
