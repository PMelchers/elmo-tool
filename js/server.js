/* Focus Builder - client for the local helper (server.py).
 * Provides folder/file objects that look like File System Access handles, so the workspace code
 * works the same with a browser-picked folder and with a folder opened through the helper. */
(function (FB) {
	'use strict';
	const meta = document.querySelector('meta[name="fb-token"]');
	const S = FB.server = { active: false, token: meta ? meta.content : null, info: null };
	const BS = String.fromCharCode(92);
	const join = (a, b) => a.replace(/[\\/]+$/, '') + BS + b;
	const enc = encodeURIComponent;

	S.api = async function (path, opts) {
		opts = opts || {};
		const r = await fetch('/api/' + path, Object.assign({}, opts, { headers: Object.assign({ 'X-FB-Token': S.token }, opts.headers || {}) }));
		if (!r.ok) {
			let msg = r.statusText;
			try { msg = (await r.json()).error || msg; } catch (e) { /* not json */ }
			const err = new Error(msg); err.status = r.status; throw err;
		}
		return r;
	};
	S.json = async (path, opts) => (await S.api(path, opts)).json();
	S.post = (path, obj) => S.json(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

	const notFound = () => new DOMException('not found', 'NotFoundError');
	const stat = (p) => S.json('stat?path=' + enc(p));

	class SFile {
		constructor(path, name) { this.kind = 'file'; this.path = path; this.name = name; }
		async getFile() {
			const p = this.path;
			return { arrayBuffer: async () => (await S.api('read?path=' + enc(p))).arrayBuffer() };
		}
		async createWritable() {
			const p = this.path;
			let blob = new Blob([]);
			return {
				async write(b) { blob = b instanceof Blob ? b : new Blob([b]); },
				async close() { await S.api('write?path=' + enc(p), { method: 'POST', body: blob }); }
			};
		}
	}
	class SDir {
		constructor(path, name) { this.kind = 'directory'; this.path = path; this.name = name; }
		async getDirectoryHandle(n, o) {
			const p = join(this.path, n), st = await stat(p);
			if (st.exists && st.kind === 'directory') return new SDir(p, n);
			if (!st.exists && o && o.create) return new SDir(p, n); // created by the first file written into it
			throw notFound();
		}
		async getFileHandle(n, o) {
			const p = join(this.path, n), st = await stat(p);
			if (st.exists && st.kind === 'file') return new SFile(p, n);
			if (!st.exists && o && o.create) return new SFile(p, n);
			throw notFound();
		}
		async *entries() {
			const r = await S.json('ls?path=' + enc(this.path));
			for (const e of r.entries) yield [e.name, e.kind === 'directory' ? new SDir(join(this.path, e.name), e.name) : new SFile(join(this.path, e.name), e.name)];
		}
		async requestPermission() { return 'granted'; }
	}
	S.dir = (path, name) => new SDir(path, name);

	/** Detects the helper (the page was served by server.py) and keeps it alive while the app is open. */
	S.init = async function () {
		if (!S.token) return false;
		try {
			S.info = await S.json('info');
			S.active = true;
			const beat = () => S.api('ping').then(() => { S.down = false; }).catch(() => { S.down = true; });
			setInterval(beat, 20000);
			document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
			window.addEventListener('focus', beat);
			S.api('ping').catch(() => {});
			return true;
		} catch (e) { S.active = false; return false; }
	};
})(window.FB = window.FB || {});
