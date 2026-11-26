/* Focus Builder - Normal mode (browse, search and look things up) and Development mode (edit the mod).
 * Normal mode is the default. It hides or disables everything that changes a tree or a mod file. */
(function (FB) {
	'use strict';
	const KEY = 'focusbuilder.mode.v1';
	let on = false;
	try { on = localStorage.getItem(KEY) === 'dev'; } catch (e) { on = false; }

	const dev = FB.dev = {
		get on() { return on; },
		set(v) {
			v = !!v;
			if (v === on) return;
			on = v;
			try { localStorage.setItem(KEY, on ? 'dev' : 'normal'); } catch (e) { /* storage unavailable */ }
			apply();
			if (!on && FB.ws && FB.ws.active && FB.ws.dirtyCount() > 0) FB.toast('Your edits are kept. Switch back to Development mode to save them into the mod.');
			FB.emit('devmode', on);
		},
		toggle() { dev.set(!on); }
	};

	function lock() {
		const root = document.getElementById('inspector');
		if (!root || on) return;
		const first = root.firstElementChild;
		if (first && !first.classList.contains('ro-note') && root.querySelector('.fld, .card, textarea, input')) {
			root.insertBefore(FB.h('div', { class: 'ro-note' }, FB.icon('eye', 14), 'View only. Switch to Development mode (top bar) to edit.'), first);
		}
		root.querySelectorAll('input, textarea, select, button').forEach((e) => { e.disabled = true; });
	}

	function apply() {
		document.body.classList.toggle('dev', on);
		document.body.classList.toggle('normal', !on);
		document.querySelectorAll('#dev-switch button').forEach((b) => b.classList.toggle('on', (b.dataset.m === 'dev') === on));
		if (FB.ui && FB.ui.renderInspector) FB.ui.renderInspector();
		if (!on && FB.ui && FB.ui.setLeftTab && ['project', 'things', 'changes'].includes(document.querySelector('#left-tabs button.on')?.dataset.tab)) FB.ui.setLeftTab('focuses');
		lock();
	}

	dev.init = function () {
		const sw = FB.h('div', { id: 'dev-switch', class: 'mode-switch dev-switch', title: 'Normal mode is read-only: browse trees and designs. Development mode lets you edit the mod.' },
			FB.h('button', { 'data-m': 'normal', onclick: () => dev.set(false) }, FB.icon('eye', 14), 'Normal'),
			FB.h('button', { 'data-m': 'dev', onclick: () => dev.set(true) }, FB.icon('code', 14), 'Development'));
		const anchor = document.querySelector('#topbar .issues-wrap');
		anchor.parentNode.insertBefore(sw, anchor);
		new MutationObserver(lock).observe(document.getElementById('inspector'), { childList: true, subtree: true });
		apply();
	};
})(window.FB = window.FB || {});
