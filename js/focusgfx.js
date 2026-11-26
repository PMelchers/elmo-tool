/* Elmo tool - focus pictures: a visual picker of every focus icon in the game and the mod, and your own pictures.
 * Your own picture is turned into a 100x88 .dds (what the game uses), shown right away, and written into the
 * open mod (gfx/interface/goals/elmo/ + interface/elmo_tool_goals.gfx, with the shine effect) when you save. */
(function (FB) {
	'use strict';
	const h = FB.h;
	const W = 100, H = 88;
	const GFX_FILE = 'interface/elmo_tool_goals.gfx';
	const TEX_DIR = 'gfx/interface/goals/elmo/';

	/* ---------- an uncompressed 32-bit DDS (the game reads these fine) ---------- */
	function toDds(imageData) {
		const w = imageData.width, hgt = imageData.height, px = imageData.data;
		const buf = new ArrayBuffer(128 + w * hgt * 4), dv = new DataView(buf), out = new Uint8Array(buf);
		const u32 = (o, v) => dv.setUint32(o, v, true);
		out.set([0x44, 0x44, 0x53, 0x20], 0);                         // "DDS "
		u32(4, 124); u32(8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x8);          // size, flags: caps|height|width|pixelformat|pitch
		u32(12, hgt); u32(16, w); u32(20, w * 4); u32(28, 1);         // height, width, pitch, mipmaps
		u32(76, 32); u32(80, 0x1 | 0x40); u32(88, 32);                 // pixel format: alpha + rgb, 32 bit
		u32(92, 0x00ff0000); u32(96, 0x0000ff00); u32(100, 0x000000ff); u32(104, 0xff000000);
		u32(108, 0x1000);                                              // caps: texture
		for (let i = 0, o = 128; i < px.length; i += 4, o += 4) { out[o] = px[i + 2]; out[o + 1] = px[i + 1]; out[o + 2] = px[i]; out[o + 3] = px[i + 3]; }
		return out;
	}
	/** Fits a picture into 100x88 (transparent around it), like the game's focus icons. */
	async function fitPicture(file) {
		const bmp = await createImageBitmap(file);
		const c = document.createElement('canvas'); c.width = W; c.height = H;
		const x = c.getContext('2d');
		const k = Math.min(W / bmp.width, H / bmp.height);
		const dw = Math.round(bmp.width * k), dh = Math.round(bmp.height * k);
		x.imageSmoothingQuality = 'high';
		x.drawImage(bmp, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
		return { dataUrl: c.toDataURL('image/png'), dds: toDds(x.getImageData(0, 0, W, H)) };
	}

	const pending = () => { FB.ws.pendingGfx = FB.ws.pendingGfx || []; return FB.ws.pendingGfx; };
	const slug = (s) => String(s || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'icon';

	/** Turns a picture file into a new focus icon of the open mod. Returns the sprite name. */
	async function importPicture(file) {
		if (!FB.ws.active) throw new Error('Open your mod first: the picture is saved into the mod you work on.');
		if (!/^image\//.test(file.type)) throw new Error('That is not a picture (use PNG, JPG or WebP).');
		const tag = (FB.state.project.meta.tag || '').toUpperCase();
		const base = 'GFX_goal_' + (tag ? tag.toLowerCase() + '_' : '') + slug(file.name);
		let name = base, n = 2;
		while ((FB.gfx.sprites && FB.gfx.sprites.has(name.toLowerCase())) || pending().some((p) => p.name.toLowerCase() === name.toLowerCase())) name = base + '_' + n++;
		const pic = await fitPicture(file);
		const tex = TEX_DIR + name.replace(/^GFX_/, '').toLowerCase() + '.dds';
		pending().push({ name, file: tex, dds: pic.dds, preview: pic.dataUrl });
		FB.gfx.addLocal(name, pic.dataUrl);
		FB.emit('ws-gfx');
		return name;
	}

	/** Called by the mod save: writes the new pictures and their sprite definitions. */
	async function writePending(ws, backup, written) {
		const list = pending();
		if (!list.length) return;
		for (const p of list) { await FB.fsutil.writeText(ws.dir, p.file, p.dds); written.push(p.file); }
		const old = await FB.fsutil.tryRead(ws.dir, GFX_FILE);
		if (old != null) await backup(GFX_FILE, old);
		const entries = list.map((p) => [
			'\tSpriteType = {', '\t\tname = "' + p.name + '"', '\t\ttexturefile = "' + p.file + '"', '\t}', '',
			'\tSpriteType = {', '\t\tname = "' + p.name + '_shine"', '\t\ttexturefile = "' + p.file + '"', '\t\teffectFile = "gfx/FX/buttonstate.lua"',
			...[-90, 90].flatMap((rot) => ['\t\tanimation = {', '\t\t\tanimationmaskfile = "' + p.file + '"', '\t\t\tanimationtexturefile = "gfx/interface/goals/shine_overlay.dds"',
				'\t\t\tanimationrotation = ' + rot.toFixed(1), '\t\t\tanimationlooping = no', '\t\t\tanimationtime = 0.75', '\t\t\tanimationdelay = 0', '\t\t\tanimationblendmode = "add"',
				'\t\t\tanimationtype = "scrolling"', '\t\t\tanimationrotationoffset = { x = 0.0 y = 0.0 }', '\t\t\tanimationtexturescale = { x = 1.0 y = 1.0 }', '\t\t}']),
			'\t\tlegacy_lazy_load = no', '\t}', ''].join('\n')).join('\n');
		const text = old != null && /\}\s*$/.test(old)
			? old.replace(/\}\s*$/, entries + '}\n')
			: '# Focus icons added with Elmo tool. Each icon has a normal and a "shine" version, like the game\'s own icons.\nspriteTypes = {\n\n' + entries + '}\n';
		await FB.fsutil.writeText(ws.dir, GFX_FILE, text);
		written.push(GFX_FILE);
		ws.pendingGfx = [];
	}

	/* ---------- the picker: every focus icon as a picture ---------- */
	function openPicker(current, onPick) {
		const names = new Map();
		(FB.gd.lists.goalIcon || []).forEach((i) => names.set(i.id, i));
		if (FB.gfx && FB.gfx.sprites) FB.gfx.sprites.forEach((s, k) => { if (/^gfx_(goal|focus)_/.test(k) && !/_shine$/.test(k)) { const id = s.name || k; if (![...names.keys()].some((x) => x.toLowerCase() === k)) names.set(id, { id, name: '', src: s.root === (FB.server.info && FB.server.info.game) ? 'game' : 'mod' }); } });
		pending().forEach((p) => names.set(p.name, { id: p.name, name: 'your new picture', src: 'new' }));
		const all = [...names.values()].sort((a, b) => (a.src === 'new' ? -2 : a.src === 'mod' ? -1 : 0) - (b.src === 'new' ? -2 : b.src === 'mod' ? -1 : 0) || a.id.localeCompare(b.id));
		let q = '', only = 'all';
		const grid = h('div', { class: 'fi-grid' });
		const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const t = e.target; io.unobserve(t); t.prepend(FB.gfx.picture(t.dataset.n, 'fi-pic')); } }), { root: grid, rootMargin: '200px' }) : null;
		const close = FB.ui.modal('Choose a focus picture', h('div', { class: 'fi-wrap' },
			h('div', { class: 'fi-bar' },
				h('input', { type: 'search', placeholder: 'Search pictures, e.g. factory, army, ger…', oninput: (e) => { q = e.target.value.toLowerCase().trim(); draw(); } }),
				h('select', { onchange: (e) => { only = e.target.value; draw(); } }, h('option', { value: 'all' }, 'Game and mod'), h('option', { value: 'mod' }, 'Only from the mod'), h('option', { value: 'game' }, 'Only from the game')),
				h('button', { class: 'btn primary', onclick: upload }, FB.icon('upload', 14), 'Use my own picture…')),
			h('p', { class: 'muted small' }, FB.gfx && FB.gfx.ready ? 'Click a picture to use it. Your own picture (PNG, JPG) is made 100×88 like the game\'s icons and saved into the mod when you save.' : 'The pictures need the helper (Python). You can still search the names.'),
			grid), { wide: true });
		function draw() {
			grid.innerHTML = '';
			if (io) io.disconnect();
			const f = all.filter((i) => (only === 'all' || i.src === only || (only === 'mod' && i.src === 'new')) && (!q || (i.id + ' ' + i.name).toLowerCase().includes(q)));
			f.slice(0, 1500).forEach((i) => {
				const tile = h('button', { class: 'fi-tile' + (current && i.id.toLowerCase() === String(current).toLowerCase() ? ' on' : '') + (i.src === 'new' ? ' new' : ''), title: i.id, 'data-n': i.id, onclick: () => { close(); onPick(i.id); } },
					h('span', { class: 'fi-name' }, i.id.replace(/^GFX_(goal|focus)_/i, '').replace(/_/g, ' ')));
				grid.appendChild(tile);
				if (io) io.observe(tile); else tile.prepend(FB.gfx.picture(i.id, 'fi-pic'));
			});
			if (!f.length) grid.appendChild(h('div', { class: 'tp-empty' }, 'No picture matches. Try another word, or use your own picture.'));
			else if (f.length > 1500) grid.appendChild(h('div', { class: 'tp-empty' }, 'Showing the first 1500. Type to narrow it down.'));
		}
		function upload() {
			const i = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
			i.onchange = async () => {
				try { const name = await importPicture(i.files[0]); close(); onPick(name); FB.toast('Picture added. It is written into the mod when you save.', 'ok'); }
				catch (e) { FB.toast((e && e.message) || String(e), 'warn'); }
			};
			i.click();
		}
		draw();
	}

	FB.focusGfx = { openPicker, importPicture, writePending, pendingCount: () => pending().length };
})(window.FB = window.FB || {});
