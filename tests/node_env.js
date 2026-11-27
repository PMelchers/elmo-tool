/* Loads the app's non-visual scripts into Node so tests can open the mock mod, edit it and save it.
 * Usage (from the project folder):  node --test tests/   */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
global.window = globalThis;
global.localStorage = { getItem() { return null; }, setItem() {} };
global.document = { addEventListener() {}, getElementById() { return null; }, querySelector() { return null }, querySelectorAll() { return []; }, body: { classList: { toggle() {}, add() {}, remove() {} }, dataset: {} } };
global.confirm = () => true;

['util', 'devmode', 'icons', 'server', 'catalog', 'model', 'codegen', 'diff', 'importer', 'workspace', 'spirits', 'modes', 'mio', 'mios', 'guides'].forEach((f) => {
	const file = path.join(ROOT, 'js', f + '.js');
	vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
});
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'tests', 'mock_mod.js'), 'utf8'));
FB.canvas = { fit() {}, render() {} };
FB.toast = () => {};

/** A fresh mock mod, opened in the workspace. Returns {root, file(path), focus(id)}. */
async function openMock() {
	FB.state.project = FB.newProject();
	FB.state.baseline = FB.snapshot(FB.state.project);
	FB.ws.active = false;
	const root = await FB_MOCK.make();
	await FB.ws.load(root);
	FB.ws.switchTo(FB.ws.trees.find((t) => t.id === 'ger_tree').key);
	const file = (p) => { const hit = FB_MOCK.dump(root, '').find(([k]) => k === p); return hit ? hit[1] : null; };
	const focus = (id) => FB.state.project.focuses.find((f) => f.id === id);
	return { root, file, focus, files: () => FB_MOCK.dump(root, '') };
}

module.exports = { FB: globalThis.FB, FB_MOCK: globalThis.FB_MOCK, openMock };
