/* Test helper: an in-memory "mod folder" that behaves like a File System Access directory handle.
 * In the browser console:  eval(await (await fetch('tests/mock_mod.js')).text());  const root = await FB_MOCK.make();  await FB.ws.load(root);
 */
window.FB_MOCK = (function () {
	class MFile {
		constructor(name, text) { this.kind = 'file'; this.name = name; this.bytes = new TextEncoder().encode(text); }
		async getFile() { const b = this.bytes; return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; }
		async createWritable() { const self = this; return { async write(blob) { self.bytes = new Uint8Array(await blob.arrayBuffer()); }, async close() {} }; }
	}
	class MDir {
		constructor(name) { this.kind = 'directory'; this.name = name; this.kids = new Map(); }
		async getDirectoryHandle(n, o) {
			let d = this.kids.get(n);
			if (!d) { if (o && o.create) { d = new MDir(n); this.kids.set(n, d); } else throw new DOMException('not found', 'NotFoundError'); }
			return d;
		}
		async getFileHandle(n, o) {
			let f = this.kids.get(n);
			if (!f) { if (o && o.create) { f = new MFile(n, ''); this.kids.set(n, f); } else throw new DOMException('not found', 'NotFoundError'); }
			return f;
		}
		async *entries() { for (const [k, v] of this.kids) yield [k, v]; }
		async requestPermission() { return 'granted'; }
	}
	const dec = new TextDecoder('utf-8', { ignoreBOM: true });
	function dump(d, base) {
		const out = [];
		for (const [k, v] of d.kids) { if (v.kind === 'directory') out.push(...dump(v, base + k + '/')); else out.push([base + k, dec.decode(v.bytes)]); }
		return out;
	}
	/* national spirits used by the GER tree (add_ideas, swap_ideas, and has_idea + an add_ideas list inside an if) */
	const SPIRITS = [
		'# spirits of germany',
		'ideas = {',
		'\tcountry = {',
		'\t\tGER_spirit_one = {',
		'\t\t\tpicture = generic_pp_bonus',
		'\t\t\tallowed = { original_tag = GER }',
		'\t\t\tmodifier = {',
		'\t\t\t\tpolitical_power_gain = 0.1',
		'\t\t\t\tstability_factor = 0.05 # keep stable',
		'\t\t\t}',
		'\t\t}',
		'\t\tGER_spirit_two = {',
		'\t\t\tmodifier = { war_support_factor = 0.1 }',
		'\t\t}',
		'\t\tGER_spirit_three = {',
		'\t\t\tpicture = generic_morale',
		'\t\t\ton_add = { log = "added" }',
		'\t\t}',
		'\t}',
		'\teconomy = {',
		'\t\tlaw = yes',
		'\t\tGER_law_x = { cost = 100 }',
		'\t}',
		'}',
		''].join('\n');
	/* Military Industrial Organizations: one for GER (allowed + include of a generic template), one shared by ITA and FRA, one generic */
	const MIOS = [
		'GER_test_organization = {',
		'\tallowed = { original_tag = GER }',
		'\ticon = GFX_idea_test',
		'\tinclude = generic_test_organization',
		'\tequipment_type = { armor }',
		'\tinitial_trait = { name = GER_init equipment_bonus = { reliability = 0.05 } }',
		'\ttrait = { token = GER_t1 name = GER_t1 position = { x = 0 y = 0 } equipment_bonus = { soft_attack = 0.05 } }',
		'\ttrait = { token = GER_t2 name = GER_t2 all_parents = { GER_t1 } position = { x = 0 y = 1 } production_bonus = { production_cost_factor = -0.05 } }',
		'}',
		'ITA_shared_organization = {',
		'\tallowed = { OR = { original_tag = ITA original_tag = FRA } NOT = { original_tag = GER } }',
		'\tequipment_type = { infantry_equipment }',
		'\ttrait = { token = ITA_t1 position = { x = 0 y = 0 } equipment_bonus = { reliability = 0.1 } }',
		'}',
		''].join('\n');
	const GENERIC_MIOS = 'generic_test_organization = {\n\tequipment_type = { armor }\n\ttrait = { token = gen_t1 name = gen_t1 position = { x = 1 y = 0 } equipment_bonus = { hard_attack = 0.05 } }\n}\n';
	async function make() {
		const root = new MDir('my_hoi4_mod');
		const put = (path, text) => {
			const parts = path.split('/'); let d = root;
			for (const p of parts.slice(0, -1)) { let n = d.kids.get(p); if (!n) { n = new MDir(p); d.kids.set(p, n); } d = n; }
			d.kids.set(parts[parts.length - 1], new MFile(parts[parts.length - 1], text));
		};
		put('common/national_focus/ger.txt', '# german tree\nfocus_tree = {\n\tid = ger_tree\n\tcountry = { factor = 0 modifier = { add = 10 tag = GER } }\n\tfocus = { id = GER_a x = 2 y = 0 cost = 5 completion_reward = { add_political_power = 50 add_ideas = GER_spirit_one } }\n\tfocus = { id = GER_b prerequisite = { focus = GER_a } x = 1 y = 1 cost = 10 completion_reward = { add_stability = 0.05 if = { limit = { has_idea = GER_spirit_one } add_ideas = { GER_spirit_three } } } }\n\tfocus = { id = GER_c prerequisite = { focus = GER_a } x = 3 y = 1 cost = 10 mutually_exclusive = { focus = GER_b } completion_reward = { add_manpower = 10000 swap_ideas = { remove_idea = GER_spirit_one add_idea = GER_spirit_two } } }\n}\n# keep me\n');
		put('common/national_focus/others.txt', 'focus_tree = { id = ita_tree country = { factor = 0 modifier = { add = 10 tag = ITA } } focus = { id = ITA_a x = 0 y = 0 cost = 3 } }\nfocus_tree = { id = fra_tree country = { factor = 0 modifier = { add = 10 tag = FRA } } focus = { id = FRA_a x = 0 y = 0 cost = 4 } }\n');
		put('localisation/english/ger_l_english.yml', String.fromCharCode(0xFEFF) + 'l_english:\r\n GER_a:0 "Rise Up"\r\n GER_b:0 "Peaceful Path"\r\n GER_c:0 "Armed Path" # c\r\n GER_spirit_one:0 "Spirit One"\r\n GER_spirit_one_desc:0 "The first spirit."\r\n');
		put('common/ideas/ger_ideas.txt', SPIRITS);
		put('common/military_industrial_organization/organizations/test_mios.txt', MIOS);
		put('common/military_industrial_organization/organizations/generic_mios.txt', GENERIC_MIOS);
		put('localisation/english/mio_l_english.yml', String.fromCharCode(0xFEFF) + 'l_english:\n GER_test_organization:0 "Test Works"\n GER_t1:0 "Better Guns"\n');
		window.__root = root;
		return root;
	}
	return { make, dump, MDir, MFile, SPIRITS, MIOS, GENERIC_MIOS };
})();
