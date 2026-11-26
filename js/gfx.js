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
		await FB.fsutil.walk(ifc, '', files, 0, (n, base) => /\.gfx$/i.test(n) && (wide || (base === '' && /module|equipmentdesigner|^goals\.gfx$|focus|subunit/i.test(n))));
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
					if (nm && tx && typeof nm.v === 'string' && typeof tx.v === 'string') into.set(nm.v.toLowerCase(), { root, file: tx.v, frames: fr && typeof fr.v === 'string' ? Math.max(1, parseInt(fr.v, 10) || 1) : 1 });
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
})(window.FB = window.FB || {});
