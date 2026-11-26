/* Elmo tool - Guide marketplace: browse and add guides other players shared, and publish your own.
 * The marketplace is a public GitHub repository (see marketplace-repo/README.md): the app reads index.json
 * and the guide files from raw.githubusercontent.com. Publishing = download the guide file + upload it on GitHub
 * (a pull request the owner merges), so the app needs no account, token or server. */
(function (FB) {
	'use strict';
	const h = FB.h;
	const LS_CFG = 'focusbuilder.market.v1', LS_CACHE = 'focusbuilder.market.index.v1';
	const M = { index: null, loading: false, error: '', q: '', nation: '', sort: 'new', fetchedAt: 0 };
	let host = null, root = null;

	const cfg = () => {
		let c = {};
		try { c = JSON.parse(localStorage.getItem(LS_CFG) || '{}'); } catch (e) { c = {}; }
		const d = FB.MARKET_DEFAULT || {};
		return { repo: (c.repo || d.repo || '').trim(), branch: (c.branch || d.branch || 'main').trim() };
	};
	const saveCfg = (c) => { try { localStorage.setItem(LS_CFG, JSON.stringify(c)); } catch (e) { /* storage unavailable */ } };
	const validRepo = (r) => /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(r || '');
	const rawUrl = (c, path) => 'https://raw.githubusercontent.com/' + c.repo + '/' + encodeURIComponent(c.branch) + '/' + path.split('/').map(encodeURIComponent).join('/');
	const ghUrl = (c, path) => 'https://github.com/' + c.repo + (path || '');
	const fmtDate = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
	const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
	const entryId = (e) => e.file + '#' + (e.index || 0);

	/* ---------- loading ---------- */
	async function loadIndex(force) {
		const c = cfg();
		if (!validRepo(c.repo)) { M.index = null; draw(); return; }
		if (!force && M.index && M.index.repo === c.repo && Date.now() - M.fetchedAt < 5 * 60e3) return;
		if (!M.index) { try { const cached = JSON.parse(localStorage.getItem(LS_CACHE) || 'null'); if (cached && cached.repo === c.repo) M.index = cached; } catch (e) { /* no cache */ } }
		M.loading = true; M.error = ''; draw();
		try {
			const r = await fetch(rawUrl(c, 'index.json') + '?t=' + Date.now(), { cache: 'no-store' });
			if (!r.ok) throw new Error(r.status === 404 ? 'No index.json found in ' + c.repo + ' (branch ' + c.branch + ').' : 'GitHub answered ' + r.status + '.');
			const data = await r.json();
			if (!data || !Array.isArray(data.guides)) throw new Error('index.json of ' + c.repo + ' is not a guide index.');
			M.index = { repo: c.repo, generated: data.generated || '', guides: data.guides.filter((g) => g && typeof g.file === 'string' && /^guides\/[^/]+\.json$/i.test(g.file)) };
			M.fetchedAt = Date.now();
			try { localStorage.setItem(LS_CACHE, JSON.stringify(M.index)); } catch (e) { /* storage full */ }
		} catch (e) {
			M.error = (e && e.message) || String(e);
			if (/Failed to fetch|NetworkError/i.test(M.error)) M.error = 'Could not reach GitHub. Check your internet connection.' + (M.index ? ' Showing the list from last time.' : '');
		}
		M.loading = false; draw();
	}

	async function install(e, btn) {
		const c = cfg();
		btn.disabled = true; btn.textContent = 'Downloading…';
		try {
			const r = await fetch(rawUrl(c, e.file), { cache: 'no-store' });
			if (!r.ok) throw new Error('GitHub answered ' + r.status);
			const len = Number(r.headers.get('content-length') || 0);
			if (len > 20 * 1048576) throw new Error('the file is larger than 20 MB');
			const data = await r.json();
			const g = Array.isArray(data) ? data[e.index || 0] : data;
			if (!g || typeof g !== 'object' || !Array.isArray(g.focus)) throw new Error('that file is not an Elmo tool guide');
			g.market = { repo: c.repo, file: e.file, index: e.index || 0, author: e.author || '', updated: e.updated || '' };
			await host.importGuide(g);
			FB.toast('Added "' + (g.title || 'guide') + '" to your guides', 'ok');
			draw();
		} catch (err) {
			FB.toast('Could not add the guide: ' + ((err && err.message) || err), 'warn');
			btn.disabled = false; btn.textContent = 'Add to my guides';
		}
	}

	/* ---------- publishing ---------- */
	function publish() {
		const c = cfg();
		const mine = host.myGuides();
		if (!mine.length) { FB.toast('Make a guide first (My guides → New guide).', 'warn'); return; }
		let pick = mine[0].id;
		const sel = h('select', { onchange: (ev) => { pick = ev.target.value; } }, mine.map((g) => h('option', { value: g.id }, (g.tag ? g.tag + ' · ' : '') + (g.title || '(untitled)'))));
		const step = (n, title, body, action) => h('div', { class: 'mk-step' }, h('span', { class: 'mk-n' }, n), h('div', { class: 'mk-sb' }, h('b', {}, title), body ? h('p', {}, body) : null, action || null));
		const close = FB.ui.modal('Publish a guide', h('div', { class: 'mk-pub' },
			h('p', { class: 'muted' }, 'Your guide is shared through the marketplace repository ' + c.repo + ' on GitHub. You need a free GitHub account. The owner of the repository checks new guides before they appear for everyone.'),
			step(1, 'Choose the guide', null, sel),
			step(2, 'Download the guide file', 'Pictures, designs and templates are inside the file.', h('button', { class: 'btn', onclick: async () => { const f = await host.exportFile(mine.find((g) => g.id === pick)); FB.download(f.name, f.text, 'application/json'); } }, FB.icon('download', 14), 'Download the guide file')),
			step(3, 'Upload it on GitHub', 'Drag the file onto the page that opens, then press "Propose changes" and "Create pull request".',
				h('button', { class: 'btn primary', onclick: () => window.open(ghUrl(c, '/upload/' + encodeURIComponent(c.branch) + '/guides'), '_blank', 'noopener') }, FB.icon('upload', 14), 'Open the upload page')),
			h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: () => close() }, 'Done'))));
	}

	function settings() {
		const c = cfg();
		const repo = h('input', { type: 'text', value: c.repo, placeholder: 'owner/repository, e.g. elmoman/elmo-guides', spellcheck: 'false' });
		const branch = h('input', { type: 'text', value: c.branch, placeholder: 'main', spellcheck: 'false' });
		const close = FB.ui.modal('Marketplace settings', h('div', { class: 'stack' },
			h('p', { class: 'muted' }, 'The marketplace is a public GitHub repository with an index.json and a guides folder. marketplace-repo/README.md in the Elmo tool folder explains how to make one.'),
			h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'GitHub repository'), repo),
			h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, 'Branch'), branch),
			h('div', { class: 'btn-row' },
				h('button', { class: 'btn primary', onclick: () => {
					const r = repo.value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$|\/$/g, '');
					if (r && !validRepo(r)) { FB.toast('Write the repository as owner/name.', 'warn'); return; }
					saveCfg({ repo: r, branch: branch.value.trim() || 'main' }); M.index = null; close(); loadIndex(true);
				} }, 'Save'),
				h('button', { class: 'btn', onclick: () => close() }, 'Cancel'))));
		setTimeout(() => repo.focus(), 30);
	}

	/* ---------- view ---------- */
	function card(e, installed) {
		const c = e.counts || {};
		const bits = [[c.focus, 'focuses'], [c.tanks, 'tanks'], [c.ships, 'ships'], [c.templates, 'templates'], [c.images, 'pictures']].filter((x) => x[0]).map((x) => x[0] + ' ' + x[1]);
		const btn = h('button', { class: 'dzf-btn gold', disabled: !!installed, onclick: (ev) => install(e, ev.currentTarget) }, installed ? 'In my guides' : 'Add to my guides');
		return h('article', { class: 'mk-card' },
			h('div', { class: 'mk-top' }, e.tag ? h('span', { class: 'gd-nattag' }, e.tag) : null, h('span', { class: 'mk-nation' }, e.tag ? host.nationName(e.tag) : 'Any nation')),
			h('h3', {}, e.title || '(untitled)'),
			e.summary ? h('p', { class: 'mk-sum' }, e.summary) : null,
			h('div', { class: 'mk-meta' }, bits.join(' · ') || 'Text only'),
			h('div', { class: 'mk-foot' },
				h('span', { class: 'mk-by' }, 'by ' + (e.author || 'unknown') + (e.updated ? ' · ' + fmtDate(e.updated) : '') + (e.size ? ' · ' + fmtSize(e.size) : '')),
				h('button', { class: 'ibtn', title: 'View the file on GitHub', onclick: () => window.open(ghUrl(cfg(), '/blob/' + encodeURIComponent(cfg().branch) + '/' + e.file), '_blank', 'noopener') }, FB.icon('link', 14)),
				btn));
	}

	function draw() {
		if (!root) return;
		root.innerHTML = '';
		const c = cfg();
		const bar = h('div', { class: 'mk-bar' });
		root.appendChild(bar);
		if (!validRepo(c.repo)) {
			bar.appendChild(h('div', { class: 'mk-spacer' }));
			bar.appendChild(h('button', { class: 'dzf-btn', onclick: settings }, FB.icon('cog', 14), 'Settings'));
			root.appendChild(h('div', { class: 'mk-empty' }, FB.icon('globe', 30), h('b', {}, 'No marketplace connected yet'),
				h('span', {}, 'The marketplace is a public GitHub repository. Enter its name (owner/repository) to browse and share guides.'),
				h('button', { class: 'dzf-btn gold', onclick: settings }, 'Connect a marketplace')));
			return;
		}
		const all = (M.index && M.index.guides) || [];
		const nations = [...new Set(all.map((e) => e.tag).filter(Boolean))].sort();
		const search = h('input', { type: 'search', placeholder: 'Search guides…', value: M.q, oninput: (ev) => { M.q = ev.target.value; drawList(); } });
		bar.append(search,
			h('select', { class: 'mk-sel', onchange: (ev) => { M.nation = ev.target.value; drawList(); } }, h('option', { value: '' }, 'All nations'), nations.map((t) => h('option', { value: t, selected: t === M.nation }, host.nationName(t) + ' (' + t + ')'))),
			h('select', { class: 'mk-sel', onchange: (ev) => { M.sort = ev.target.value; drawList(); } }, h('option', { value: 'new', selected: M.sort === 'new' }, 'Newest first'), h('option', { value: 'title', selected: M.sort === 'title' }, 'By title'), h('option', { value: 'nation', selected: M.sort === 'nation' }, 'By nation')),
			h('div', { class: 'mk-spacer' }),
			h('button', { class: 'dzf-btn', title: 'Load the list again', disabled: M.loading, onclick: () => loadIndex(true) }, FB.icon('undo', 14), M.loading ? 'Loading…' : 'Refresh'),
			h('button', { class: 'dzf-btn', onclick: settings, title: 'Marketplace repository' }, FB.icon('cog', 14)),
			h('button', { class: 'dzf-btn gold', onclick: publish }, FB.icon('upload', 14), 'Publish a guide'));
		root.appendChild(h('div', { class: 'mk-src muted small' }, 'Marketplace: ', h('a', { href: ghUrl(c, ''), target: '_blank', rel: 'noopener' }, c.repo), M.index && M.index.generated ? ' · updated ' + fmtDate(M.index.generated) : ''));
		if (M.error) root.appendChild(h('div', { class: 'mk-err' }, FB.icon('alert', 15), M.error));
		const list = h('div', { class: 'mk-grid' });
		root.appendChild(list);
		function drawList() {
			list.innerHTML = '';
			const q = M.q.toLowerCase().trim();
			const have = new Set(host.myGuides().filter((g) => g.market && g.market.repo === c.repo).map((g) => g.market.file + '#' + (g.market.index || 0)));
			let f = all.filter((e) => (!M.nation || e.tag === M.nation) && (!q || [e.title, e.summary, e.author, e.tag, host.nationName(e.tag || '')].join(' ').toLowerCase().includes(q)));
			if (M.sort === 'title') f = f.slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));
			else if (M.sort === 'nation') f = f.slice().sort((a, b) => host.nationName(a.tag || '~').localeCompare(host.nationName(b.tag || '~')) || String(a.title).localeCompare(String(b.title)));
			else f = f.slice().sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
			f.forEach((e) => list.appendChild(card(e, have.has(entryId(e)))));
			if (!f.length) list.appendChild(h('div', { class: 'mk-empty small' }, M.loading ? 'Loading the marketplace…' : all.length ? 'No guide matches.' : 'No guides shared yet. Be the first: Publish a guide.'));
		}
		drawList();
	}

	FB.market = {
		/** host: { myGuides(), importGuide(g), exportFile(g) -> {name, text}, nationName(tag) } */
		view(hostApi) {
			host = hostApi;
			root = h('div', { class: 'mk' });
			draw();
			loadIndex(false);
			return root;
		}
	};
})(window.FB = window.FB || {});
