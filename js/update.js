/* Elmo tool - updates and sharing.
 * The helper checks the app's GitHub repository (update.json). When there is a newer version, a button appears in the
 * top bar; installing downloads it, replaces the app files and restarts the helper. Your guides, designs and settings
 * live in the browser, so an update never touches them. */
(function (FB) {
	'use strict';
	const h = FB.h;
	const STAMP = 'focusbuilder.update.checked';
	const U = { info: null };
	let pill = null;

	const fmtDate = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

	async function check(force) {
		if (!FB.server.active) return null;
		try {
			const last = Number(localStorage.getItem(STAMP) || 0);
			if (!force && U.info && Date.now() - last < 6 * 3600e3) return U.info;
		} catch (e) { /* storage unavailable */ }
		try {
			U.info = await FB.server.json('update' + (force ? '?force=1' : ''));
			try { localStorage.setItem(STAMP, String(Date.now())); } catch (e) { /* ignore */ }
		} catch (e) { U.info = { error: e.message }; }
		showPill();
		popupOnce();
		return U.info;
	}

	/** When an update is ready at start, show it once per start (after any other window, such as Welcome, is closed). */
	let popped = false;
	function popupOnce() {
		if (popped || !U.info || !U.info.available) return;
		popped = true;
		let tries = 0;
		const t = setInterval(() => {
			const root = document.getElementById('modal-root');
			if ((root && !root.children.length) || ++tries > 600) { clearInterval(t); openUpdate(); }
		}, 700);
	}

	function showPill() {
		const i = U.info;
		if (!i || !i.available) { if (pill) pill.hidden = true; return; }
		if (!pill) {
			pill = h('button', { id: 'btn-update', class: 'tb update-pill', title: 'A new version of Elmo tool is ready', onclick: () => openUpdate() }, FB.icon('download', 14), 'Update ready');
			const help = document.getElementById('btn-help');
			help.parentNode.insertBefore(pill, help);
		}
		pill.hidden = false;
	}

	function openUpdate() {
		const i = U.info || {};
		const status = h('p', { class: 'muted' });
		const btn = h('button', { class: 'btn primary', onclick: () => install(btn, status) }, FB.icon('download', 14), 'Install now');
		FB.ui.modal('Update Elmo tool', h('div', { class: 'stack up-box' },
			h('p', {}, 'A new version is ready' + (i.date ? ' (' + fmtDate(i.date) + ')' : '') + '. Your guides, designs, templates and settings stay as they are.'),
			i.message ? h('div', { class: 'up-notes' }, h('b', {}, 'What changed'), h('pre', {}, i.message)) : null,
			status,
			h('div', { class: 'btn-row' }, btn, h('button', { class: 'btn', onclick: () => { document.getElementById('modal-root').innerHTML = ''; } }, 'Later'))));
	}

	async function install(btn, status) {
		const unsaved = FB.ws && FB.ws.active && FB.ws.dirtyCount && FB.ws.dirtyCount() > 0;
		if (unsaved && !confirm('You have edits that are not saved into the mod yet. The app restarts after the update. Continue?')) return;
		btn.disabled = true; btn.textContent = 'Downloading…';
		try {
			await FB.server.post('update-install', { sha: U.info.sha });
		} catch (e) {
			status.textContent = e.message; btn.disabled = false; btn.textContent = 'Try again';
			return;
		}
		btn.textContent = 'Restarting…';
		status.textContent = 'Installed. Elmo tool restarts in a moment.';
		const t0 = Date.now();
		await new Promise((r) => setTimeout(r, 1500));
		while (Date.now() - t0 < 30000) {
			try { const r = await fetch('/api/hello', { cache: 'no-store' }); if (r.ok) { location.reload(); return; } } catch (e) { /* not back yet */ }
			await new Promise((r) => setTimeout(r, 600));
		}
		status.textContent = 'The update is installed. Close Elmo tool and open it again.';
	}

	/* ---------- sharing ---------- */
	async function openShare() {
		const i = (await check(false)) || {};
		const repo = i.repo, branch = i.branch || 'main';
		const page = repo ? 'https://github.com/' + repo : '';
		const zip = repo ? 'https://github.com/' + repo + '/archive/refs/heads/' + encodeURIComponent(branch) + '.zip' : '';
		const copy = (text) => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => FB.toast('Link copied', 'ok'), () => FB.toast(text));
		const row = (label, url) => h('div', { class: 'up-link' }, h('span', { class: 'fld-l' }, label), h('div', { class: 'up-linkrow' }, h('input', { type: 'text', value: url, readonly: true, onclick: (e) => e.target.select() }), h('button', { class: 'btn small', onclick: () => copy(url) }, FB.icon('copy', 13), 'Copy')));
		FB.ui.modal('Share Elmo tool', h('div', { class: 'stack up-box' },
			repo ? h('p', {}, 'Send people this download link. Their copy checks for updates by itself and shows an "Update ready" button whenever you publish a new version.')
				: h('p', {}, 'Elmo tool is not published yet. Once it is on GitHub (update.json names the repository), the links appear here.'),
			repo ? row('Download (zip)', zip) : null,
			repo ? row('Project page', page) : null,
			h('div', { class: 'up-notes' }, h('b', {}, 'How to install (for the people you share it with)'),
				h('ol', {},
					h('li', {}, 'Install Python from python.org (tick "Add python.exe to PATH").'),
					h('li', {}, 'Unzip the download anywhere, for example in Documents.'),
					h('li', {}, 'Double-click "Elmo tool.bat". The first start installs Pillow, needed for the game pictures.'),
					h('li', {}, 'Updates: when the top bar shows "Update ready", click it and press Install now.'))),
			FB.server.active ? h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: async (e) => { e.currentTarget.disabled = true; const r = await check(true); FB.toast(r && r.available ? 'An update is ready' : r && r.dev ? 'This is the developer copy: it updates with git, not here.' : r && r.error ? r.error : 'Elmo tool is up to date', r && r.error ? 'warn' : 'ok'); e.currentTarget.disabled = false; } }, FB.icon('undo', 13), 'Check for updates')) : null));
	}

	FB.update = {
		check,
		init() {
			const help = document.getElementById('btn-help');
			if (help) help.parentNode.insertBefore(h('button', { id: 'btn-share', class: 'tb', title: 'Share Elmo tool with others', onclick: openShare }, FB.icon('link', 14), 'Share'), help);
		}
	};
})(window.FB = window.FB || {});
