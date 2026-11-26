/* Focus Builder - top-level modes: Trees (the main editor), Designer, Templates, Guides.
 * Each extra mode is a full-screen overlay registered here; the switch in the top bar is built on demand. */
(function (FB) {
	'use strict';
	const h = FB.h;
	const modes = {};
	let current = 'trees';

	function ensureSwitch() {
		let sw = document.getElementById('mode-switch');
		if (sw) return sw;
		sw = h('div', { id: 'mode-switch', class: 'mode-switch' }, h('button', { class: 'on', 'data-mode': 'trees', onclick: () => FB.modes.set('trees') }, FB.icon('tree', 15), 'Trees'));
		document.querySelector('.brand').after(sw);
		return sw;
	}

	FB.modes = {
		get current() { return current; },
		/** Adds a full-screen mode. hooks: { open(), close() } */
		register(name, label, icon, root, hooks) {
			modes[name] = { root, hooks: hooks || {} };
			root.hidden = true;
			document.getElementById('app').appendChild(root);
			ensureSwitch().appendChild(h('button', { 'data-mode': name, onclick: () => FB.modes.set(name) }, FB.icon(icon, 15), label));
		},
		set(name) {
			if (name === current) return;
			const prev = modes[current];
			if (prev) { prev.root.hidden = true; if (prev.hooks.close) prev.hooks.close(); }
			current = name;
			document.body.dataset.mode = name;
			const next = modes[name];
			if (next) { next.root.hidden = false; if (next.hooks.open) next.hooks.open(); }
			document.querySelectorAll('#mode-switch button').forEach((b) => b.classList.toggle('on', b.dataset.mode === name));
			if (name === 'trees' && FB.canvas && FB.canvas.render) setTimeout(() => FB.canvas.render(), 0);
		}
	};
})(window.FB = window.FB || {});
