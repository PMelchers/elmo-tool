/* Focus Builder - Import dialog: files, mod folder, or pasted script */
(function (FB) {
	'use strict';
	const h = FB.h;

	FB.openImport = function () {
		const src = { trees: [], loc: {}, files: 0, locFiles: 0 };
		let chosen = -1;
		const status = h('div', { class: 'muted' }, 'Nothing loaded yet.');
		const list = h('div', { class: 'tree-list' });
		const go = h('button', { class: 'btn primary', disabled: true }, 'Import selected tree');
		const paste = h('textarea', { rows: 6, class: 'mono', placeholder: 'Paste the contents of a focus tree .txt file here…', spellcheck: 'false' });
		let closeModal = () => {};

		function addTrees(trees) { src.trees.push(...trees); }
		function redraw() {
			status.textContent = `${src.trees.length} focus tree${src.trees.length === 1 ? '' : 's'} found in ${src.files} file${src.files === 1 ? '' : 's'}` + (src.locFiles ? `, ${Object.keys(src.loc).length} localisation lines loaded.` : '. No localisation loaded: names come from the focus IDs.');
			list.innerHTML = '';
			src.trees.forEach((t, i) => {
				list.appendChild(h('label', { class: 'tree-row' + (i === chosen ? ' on' : '') },
					h('input', { type: 'radio', name: 'tree', checked: i === chosen, onchange: () => { chosen = i; go.disabled = false; redraw(); } }),
					h('span', {}, h('b', {}, t.id), ' ', h('em', {}, `${t.count} focuses${t.tag ? ' · ' + t.tag : ''}`)),
					h('code', {}, t.file || 'pasted')));
			});
			go.disabled = chosen < 0;
		}
		function ingest(name, text) {
			if (/\.ya?ml$/i.test(name)) { FB.importer.parseLoc(text, src.loc); src.locFiles++; return; }
			src.files++;
			addTrees(FB.importer.parseFile(text, name.includes('/') ? name : 'common/national_focus/' + name));
		}
		async function readFiles(files) {
			for (const f of files) {
				if (/\.json$/i.test(f.name)) {
					try { FB.setProject(JSON.parse(await f.text())); setTimeout(() => FB.canvas.fit(), 30); document.getElementById('modal-root').innerHTML = ''; FB.toast('Project opened.', 'ok'); return; }
					catch (e) { FB.toast(f.name + ' is not a Focus Builder project.', 'warn'); continue; }
				}
				ingest(f.name, await f.text());
			}
			if (src.trees.length === 1) chosen = 0;
			redraw();
		}
		const pick = (accept, multiple) => {
			const inp = h('input', { type: 'file', accept, multiple });
			inp.onchange = () => readFiles([...inp.files]);
			inp.click();
		};
		async function pickFolder() { closeModal(); FB.ui.openMod(false); }
		go.onclick = () => {
			const tree = src.trees[chosen]; if (!tree) return;
			if (FB.state.project.focuses.length && !confirm('Importing replaces the project you have open. Use Save first if you want to keep it. Continue?')) return;
			const { project, stats } = FB.importer.buildProject(tree, src.loc);
			if (FB.ws.active) FB.ws.close();
			FB.setProject(project);
			setTimeout(() => FB.canvas.fit(), 30);
			closeModal();
			const parts = [`Imported ${project.focuses.length} focuses.`];
			if (stats.raw) parts.push(`${stats.raw} reward/condition(s) kept as raw code.`);
			FB.toast(parts.join(' '), 'ok');
			if (stats.warnings.length) FB.ui.modal('Import notes', h('div', {}, h('p', { class: 'muted' }, 'Everything was imported. A few things to know:'), h('ul', {}, stats.warnings.slice(0, 40).map((w) => h('li', {}, w)))));
			FB.ui.setLeftTab('focuses');
		};
		const canFs = typeof window.showDirectoryPicker === 'function';
		const body = h('div', { class: 'import' },
			h('p', { class: 'lead' }, 'Bring an existing focus tree into Focus Builder, edit it visually, and export it again.'),
			h('div', { class: 'opt-grid two' },
				h('div', { class: 'opt' }, h('h3', {}, 'From your mod folder'), h('p', {}, canFs ? 'Pick the mod\'s root folder. Focus trees and English localisation are read automatically. Nothing is changed.' : 'Needs Chrome or Edge. Use "Choose files" instead.'),
					h('button', { class: 'btn primary', disabled: !canFs, onclick: pickFolder }, 'Choose mod folder…')),
				h('div', { class: 'opt' }, h('h3', {}, 'From files'), h('p', {}, 'Select a focus tree .txt, optionally with the matching _l_english.yml (names). A saved Focus Builder .json also works.'),
					h('button', { class: 'btn', onclick: () => pick('.txt,.yml,.yaml,.json', true) }, 'Choose files…'))),
			h('div', { class: 'sub-title' }, 'Or paste the code'),
			paste,
			h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: () => { if (paste.value.trim()) { src.files++; addTrees(FB.importer.parseFile(paste.value, '')); if (src.trees.length === 1) chosen = 0; redraw(); } } }, 'Read pasted code')),
			h('div', { class: 'sub-title' }, 'Found'), status, list,
			h('div', { class: 'btn-row' }, go),
			h('p', { class: 'muted' }, 'Rewards and conditions Focus Builder knows become editable forms; anything else is kept as raw code and written back unchanged.'));
		closeModal = FB.ui.modal('Import an existing focus tree', body, { wide: true });
		redraw();
	};
})(window.FB = window.FB || {});
