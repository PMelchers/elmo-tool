/* Focus Builder - game icons for the Designer.
 * Reads the sprite definitions (interface/*.gfx) of the base game and the open mod, and shows the real module icons.
 * The textures are .dds files, so the local helper converts them to PNG (needs Pillow). Without the helper the
 * Designer keeps its drawn icons. */
(function (FB) {
	'use strict';
	const BS = String.fromCharCode(92);
	const G = FB.gfx = { sprites: new Map(), ready: false, loading: false, sig: '', count: 0, error: '' };
	const cache = new Map();   // sprite name (lowercase) -> Promise<objectURL|null>
	const winPath = (root, rel) => root.replace(/[\\/]+$/, '') + BS + String(rel).replace(/\//g, BS);
	const sigNow = () => (FB.server.active && FB.server.info ? FB.server.info.game || '' : '') + '|' + (FB.ws.active ? FB.ws.name + (FB.ws.path || '') : '');

	async function scan(dirHandle, root, into, wide) {
		let ifc;
		try { ifc = await dirHandle.getDirectoryHandle('interface'); } catch (e) { return; }
		const files = [];
		await FB.fsutil.walk(ifc, '', files, 0, (n, base) => /\.gfx$/i.test(n) && (wide || (base === '' && /module|equipmentdesigner|^goals\.gfx$|focus|subunit|idea/i.test(n))));
		for (const f of files) {
			let text;
			try { text = await FB.fsutil.readText(f.handle); } catch (e) { continue; }
			FB.importer.parse(text).forEach((top) => {
				if (String(top.k).toLowerCase() !== 'spritetypes' || !Array.isArray(top.v)) return;
				top.v.forEach((e) => {
					if (String(e.k).toLowerCase() !== 'spritetype' || !Array.isArray(e.v)) return;
					const nm = e.v.find((x) => String(x.k).toLowerCase() === 'name'), tx = e.v.find((x) => String(x.k).toLowerCase() === 'texturefile');
					const fr = e.v.find((x) => String(x.k).toLowerCase() === 'noofframes');
					// strips (several frames side by side, like the battalion icons) are cut to their first frame by the helper
					if (nm && tx && typeof nm.v === 'string' && typeof tx.v === 'string') into.set(nm.v.toLowerCase(), { name: nm.v, root, file: tx.v, frames: fr && typeof fr.v === 'string' ? Math.max(1, parseInt(fr.v, 10) || 1) : 1 });
				});
			});
		}
	}

	/** Reads the sprite lists. Safe to call again: it only reloads when the game or the open mod changed. */
	G.load = async function (force) {
		if (G.loading) return G.ready;
		const s = sigNow();
		if (G.ready && !force && G.sig === s) return true;
		if (!FB.server.active || !FB.server.info || !FB.server.info.game) { G.ready = false; G.sig = s; return false; }
		G.loading = true;
		const map = new Map();
		try {
			const game = FB.server.info.game;
			await FB.server.post('open', { path: game });
			await scan(FB.server.dir(game, 'game'), game, map, false);
			if (FB.ws.active && FB.ws.serverMode && FB.ws.path) await scan(FB.ws.dir, FB.ws.path, map, true);
			G.sprites.forEach((v, k) => { if (v.local && !map.has(k)) map.set(k, v); });
			G.sprites = map; G.count = map.size; G.error = '';
			if (cache.size) cache.clear();
		} catch (e) { G.error = e.message || String(e); } finally { G.loading = false; }
		G.ready = G.count > 0; G.sig = s;
		return G.ready;
	};

	/** Sprite names to try for a module, best match first. */
	G.moduleNames = function (m, modules) {
		const a = [];
		[m.gfx, m.key].filter(Boolean).forEach((k) => { a.push('GFX_EMI_' + k, 'GFX_SMI_' + k); });
		// the game has no picture for a few modules (mostly dual-purpose guns): borrow one from the same category
		if (modules && !G.find(a)) {
			Object.values(modules).filter((o) => o !== m && o.category === m.category && !o.custom).forEach((o) => { [o.gfx, o.key].filter(Boolean).forEach((k) => a.push('GFX_EMI_' + k, 'GFX_SMI_' + k)); });
		}
		return a;
	};
	G.find = (names) => { for (const n of names) if (G.sprites.has(n.toLowerCase())) return n.toLowerCase(); return null; };

	function fetchUrl(name) {
		if (cache.has(name)) return cache.get(name);
		const s = G.sprites.get(name);
		if (s && s.local) { const p = Promise.resolve(s.data); cache.set(name, p); return p; }
		let p = Promise.resolve(null);
		if (s) {
			// a mod texture wins when it exists, otherwise the game's copy of the same path is used
			const path = winPath(s.root, s.file);
			const fq = s.frames > 1 ? '&frames=' + s.frames : '';
			p = FB.server.api('img?path=' + encodeURIComponent(path) + fq).then((r) => r.blob()).then((b) => URL.createObjectURL(b)).catch(() => {
				const game = FB.server.info && FB.server.info.game;
				if (!game || s.root === game) return null;
				return FB.server.api('img?path=' + encodeURIComponent(winPath(game, s.file)) + fq).then((r) => r.blob()).then((b) => URL.createObjectURL(b)).catch(() => null);
			});
		}
		cache.set(name, p);
		return p;
	}

	/** A picture that exists only in the app so far (a new focus icon that is saved into the mod later). */
	G.addLocal = function (name, dataUrl) {
		const k = String(name).toLowerCase();
		G.sprites.set(k, { name, local: true, data: dataUrl, root: '', file: '' });
		cache.delete(k); icMem.set(k, dataUrl); G.ready = true;
	};

	/** Loads the sprite lists and redraws the focus tree so it shows the focus pictures. */
	G.loadIcons = function () { return G.load().then((ok) => { if (ok && FB.canvas) FB.canvas.render(); return ok; }).catch(() => false); };
	FB.on('ws', () => { if (FB.server.active) G.loadIcons(); });

	/** Adds the game's picture to a tile. The tile keeps its drawn icon until the picture is there. */
	G.attach = function (tile, names) {
		if (!G.ready) return false;
		const name = G.find(names);
		if (!name) return false;
		const img = document.createElement('img');
		img.className = 'dzf-gimg'; img.alt = ''; img.draggable = false;
		fetchUrl(name).then((u) => { if (!u) return; img.onload = () => tile.classList.add('has-img'); img.src = u; tile.appendChild(img); });
		return true;
	};

	/* ---------- pictures kept for guides: they must show without the game or the helper, and travel with shared guides ---------- */
	let icDbP = null;
	const icMem = new Map();
	function icDb() {
		if (!icDbP) icDbP = new Promise((res, rej) => { const q = indexedDB.open('focusbuilder-icons', 1); q.onupgradeneeded = () => q.result.createObjectStore('icon'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
		return icDbP;
	}
	async function icGet(n) { try { const db = await icDb(); return await new Promise((res) => { const r = db.transaction('icon').objectStore('icon').get(n); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; } }
	async function icPut(n, d) { try { const db = await icDb(); await new Promise((res) => { const t = db.transaction('icon', 'readwrite'); t.objectStore('icon').put(d, n); t.oncomplete = res; t.onerror = res; }); } catch (e) { /* storage unavailable */ } }
	const toData = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); });
	/** The picture of a sprite as a data URL: from the kept copies, else from the game / mod (and then kept). */
	G.keep = async function (name) {
		if (!name) return null;
		const n = String(name).toLowerCase();
		if (icMem.has(n)) return icMem.get(n);
		let d = await icGet(n);
		if (!d && G.ready && G.sprites.has(n)) {
			const u = await fetchUrl(n);
			if (u) { try { d = await toData(await (await fetch(u)).blob()); if (d) await icPut(n, d); } catch (e) { d = null; } }
		}
		if (d) icMem.set(n, d);
		return d || null;
	};
	/** An <img> that fills in when the picture is known; its parent gets the class has-pic. */
	G.picture = function (name, cls) {
		const img = document.createElement('img');
		img.className = cls || 'gd-pic'; img.alt = ''; img.draggable = false; img.hidden = true;
		if (name) G.keep(name).then((d) => { if (d) { img.src = d; img.hidden = false; if (img.parentElement) img.parentElement.classList.add('has-pic'); } });
		return img;
	};
	/** {sprite: dataURL} for a list of sprite names (for exports and shared guide files). */
	G.collect = async function (names) {
		const out = {};
		for (const n of new Set((names || []).filter(Boolean).map((x) => String(x).toLowerCase()))) { const d = await G.keep(n); if (d) out[n] = d; }
		return out;
	};
	/** Keeps the pictures that came with an imported guide. */
	G.store = async function (map) {
		for (const [n, d] of Object.entries(map || {})) {
			if (typeof d === 'string' && /^data:image\/(png|webp|jpeg|gif);base64,/.test(d) && d.length < 2e6) { const k = n.toLowerCase(); icMem.set(k, d); await icPut(k, d); }
		}
	};
})(window.FB = window.FB || {});
