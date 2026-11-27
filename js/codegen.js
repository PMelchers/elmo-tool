/* Focus Builder - turns the project into HOI4 script, localisation, and a briefing for Claude */
(function (FB) {
	'use strict';
	const { N, ID, TAG } = FB.catalog.helpers;
	const KIND_LABEL = { idea: 'National spirit / idea', event: 'Event', decision: 'Decision', tooltip: 'Tooltip / localisation text', other: 'Other', flag: 'Flag', variable: 'Variable' };
	FB.KIND_LABEL = KIND_LABEL;

	const indent = (lines, n) => lines.map((l) => (l ? '\t'.repeat(n) + l : l));
	const block = (name, inner) => [`${name} = {`, ...indent(inner, 1), '}'];
	const split = (s) => String(s).split('\n');

	/** HOI4 script lines for one reward/condition item (kind: 'effect' | 'trigger'). */
	FB.itemCode = function (kind, it, ctx) {
		ctx = ctx || FB.ctx();
		const def = FB.catalog.def(kind, it.type);
		if (!def) return [`# UNKNOWN ${kind} type: ${it.type}`];
		const p = it.p || {};
		const miss = FB.catalog.missing(def, p);
		if (miss.length) return [`# INCOMPLETE ${kind === 'effect' ? 'reward' : 'condition'}: ${def.label} (missing: ${miss.map((m) => m.label).join(', ')})`];
		let lines = split(def.code(p, ctx));
		if (it.not) lines = block('NOT', lines);
		return lines;
	};
	function condLines(c, ctx) {
		if (!c || !c.items.length) return [];
		const lines = [];
		c.items.forEach((it) => lines.push(...FB.itemCode('trigger', it, ctx)));
		return c.mode === 'any' && c.items.length > 1 ? block('OR', lines) : lines;
	}

	/** Human-readable one-liner for a reward/condition (used in the brief and tooltips). */
	FB.itemText = function (kind, it, ctx) {
		ctx = ctx || FB.ctx();
		const def = FB.catalog.def(kind, it.type);
		if (!def) return `Unknown (${it.type})`;
		const p = it.p || {};
		if (it.type === '__plain') return `(plain words) ${String(p.text || '').trim()}`;
		if (it.type === '__raw') return `(raw code) ${String(p.text || '').trim().split('\n')[0]}`;
		const parts = def.params.map((q) => {
			let v = p[q.key];
			if (v === '' || v == null) return null;
			if (q.type === 'focus') v = '"' + (FB.getFocus(v) ? FB.getFocus(v).name : v) + '"';
			if (q.type === 'percent') v = v + '%';
			if (q.type === 'select') { const o = q.options.find((x) => x[0] === v); if (o) v = o[1]; }
			return `${q.label}: ${v}`;
		}).filter(Boolean);
		return (it.not ? 'NOT: ' : '') + def.label + (parts.length ? ' — ' + parts.join(', ') : '');
	};

	/* ---------- focus_tree script ---------- */
	function focusLines(f, ctx, meta, noComment) {
		const L = [];
		const inner = [];
		inner.push(`id = ${f.id}`);
		if (f.icon || !meta.importedFrom) inner.push(`icon = ${(f.icon || meta.defaultIcon || 'GFX_goal_unknown').trim()}`);
		inner.push(`x = ${N(f.x)}`);
		inner.push(`y = ${N(f.y)}`);
		inner.push(`cost = ${N(f.weeks)}`);
		f.prereqs.forEach((g) => {
			const ids = g.map((u) => FB.getFocus(u)).filter(Boolean).map((x) => `focus = ${x.id}`);
			if (ids.length) inner.push(`prerequisite = { ${ids.join(' ')} }`);
		});
		const ex = f.excl.map((u) => FB.getFocus(u)).filter(Boolean).map((x) => `focus = ${x.id}`);
		if (ex.length) inner.push(`mutually_exclusive = { ${ex.join(' ')} }`);
		const av = condLines(f.available, ctx); if (av.length) inner.push(...block('available', av));
		const by = condLines(f.bypass, ctx); if (by.length) inner.push(...block('bypass', by));
		const vi = condLines(f.visible, ctx); if (vi.length) inner.push(...block('allow_branch', vi));
		if (!f.cancelInvalid) inner.push('cancel_if_invalid = no');
		if (f.continueInvalid) inner.push('continue_if_invalid = yes');
		if (f.capitulated) inner.push('available_if_capitulated = yes');
		if (f.ai !== '' && f.ai != null) inner.push(`ai_will_do = { factor = ${N(f.ai)} }`);
		const flt = FB.allFilters(f);
		if (flt.length) inner.push(`search_filters = { ${flt.join(' ')} }`);
		if ((f.extra || '').trim()) inner.push(...String(f.extra).split('\n')); // code kept from an import
		const rw = [];
		f.rewards.forEach((it) => rw.push(...FB.itemCode('effect', it, ctx)));
		if (rw.length || !meta.importedFrom) inner.push(...block('completion_reward', rw));
		const note = (f.note || '').trim();
		if (!noComment) L.push(`# ${f.name}${f.desc ? ' - ' + f.desc.replace(/\s+/g, ' ').slice(0, 100) : ''}`);
		if (note && !noComment) note.split('\n').forEach((l) => L.push('# NOTE FOR CLAUDE: ' + l));
		L.push(...block('focus', inner));
		return L;
	}

	FB.gen = {};
	/** Script of one focus/trait without comments, in the context of project pr. Used to detect which focuses changed. */
	FB.gen.unitLines = (pr, f) => FB.withProj(pr, () => (pr.kind === 'mio' ? FB.gen.mioTraitLines(f) : focusLines(f, FB.ctx(), pr.meta, true)));
	FB.gen.sigOf = (pr, f) => FB.gen.unitLines(pr, f).join('\n');
	FB.gen.focusCode = (f) => focusLines(f, FB.ctx(), FB.state.project.meta).join('\n');

	/* ---------- Military Industrial Organization ---------- */
	const fmtNum = (v) => String(Number.isFinite(Number(v)) ? Number(v) : 0);
	FB.gen.mioTraitLines = (f) => mioTraitLines(f);
	function mioTraitLines(f) {
		const inner = [];
		if (!f.initial || !/_initial_\d+$/.test(f.id)) inner.push(`token = ${f.id}`); // starting traits only need a token when the file had one
		inner.push(`name = ${f.nameKey || f.id}`);
		if (f.icon) inner.push(`icon = ${f.icon}`);
		if (!f.initial) inner.push(`position = { x = ${N(f.x)} y = ${N(f.y)} }`);
		const idOf = (u) => { const o = FB.getFocus(u); return o ? o.id : null; };
		const singles = f.prereqs.filter((g) => g.length === 1).map((g) => idOf(g[0])).filter(Boolean);
		if (singles.length) inner.push(`${f.parentStyle || 'all_parents'} = { ${singles.join(' ')} }`);
		f.prereqs.filter((g) => g.length > 1).forEach((g) => { const ids = g.map(idOf).filter(Boolean); if (ids.length) inner.push(`any_parent = { ${ids.join(' ')} }`); });
		const ex = f.excl.map(idOf).filter(Boolean);
		if (ex.length) inner.push(`mutually_exclusive = { ${ex.join(' ')} }`);
		if ((f.limit || '').trim()) inner.push(`limit_to_equipment_type = { ${f.limit.trim()} }`);
		FB.MIO_BONUS.forEach((k) => {
			const rows = ((f.bonuses || {})[k] || []).filter((r) => String(r.k).trim());
			if (rows.length) inner.push(...block(k, rows.map((r) => `${String(r.k).trim()} = ${fmtNum(r.v)}`)));
		});
		if ((f.extra || '').trim()) inner.push(...String(f.extra).split('\n'));
		return block(f.initial ? 'initial_trait' : f.traitKey === 'add_trait' ? 'add_trait' : 'trait', inner);
	}
	FB.gen.mioBlock = function (pr) {
		const m = pr.meta, L = [];
		const head = (m.mioHeader || '').trim();
		if (head) L.push(...head.split('\n'), '');
		const initial = pr.focuses.filter((f) => f.initial).sort((a, b) => a.y - b.y);
		const traits = pr.focuses.filter((f) => !f.initial).sort((a, b) => a.y - b.y || a.x - b.x);
		initial.concat(traits).forEach((f) => { L.push(...mioTraitLines(f), ''); });
		return block(m.treeId, L.slice(0, -1)).join('\n');
	};

	/** Just the focus_tree = { ... } block (used to splice into existing mod files). */
	FB.gen.treeBlock = function (pr) {
		pr = pr || FB.state.project;
		if (pr !== FB.state.project) return FB.withProj(pr, () => FB.gen.treeBlock(pr));
		if (pr.kind === 'mio') return FB.gen.mioBlock(pr);
		const m = pr.meta, ctx = FB.ctx();
		const tags = (m.tag || '').trim().split(/\s+/).filter(Boolean).map(TAG);
		const head = [`id = ${m.treeId}`];
		const mods = tags.length ? tags : ['XXX'];
		if (!tags.length && m.countryRaw) head.push(...m.countryRaw.split('\n'));
		else head.push(...block('country', ['factor = 0', ...mods.flatMap((t) => block('modifier', ['add = 10', `tag = ${t}`]))]));
		const extra = (m.treeExtra || '').trim();
		if (!/(^|\n)default\s*=/.test(extra)) head.push('default = no');
		if (extra) head.push(...extra.split('\n'));
		const roots = pr.focuses.filter((f) => !f.prereqs.length);
		if (roots.length && !/initial_show_position/.test(extra)) {
			const r = roots.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0];
			head.push(`initial_show_position = { focus = ${r.id} }`);
		}
		const out = [];
		const body = [...head, ''];
		pr.focuses.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach((f) => { body.push(...focusLines(f, ctx, m), ''); });
		out.push(...block('focus_tree', body.slice(0, -1)));
		return out.join('\n');
	};
	FB.gen.tree = function (pr) {
		return '# Generated by Focus Builder. Re-import-safe: edit in Focus Builder or ask Claude.\n\n' + FB.gen.treeBlock(pr) + '\n';
	};

	/* ---------- localisation (needs UTF-8 with BOM) ---------- */
	const locEsc = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
	FB.gen.loc = function (pr) {
		pr = pr || FB.state.project;
		const lines = ['l_english:'];
		pr.focuses.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach((f) => {
			const key = pr.kind === 'mio' ? (f.nameKey || f.id) : f.id;
			lines.push(` ${key}:0 "${locEsc(f.name)}"`);
			if (f.desc && f.desc.trim()) lines.push(` ${key}_desc:0 "${locEsc(f.desc)}"`);
		});
		return '﻿' + lines.join('\n') + '\n';
	};

	FB.gen.projectJson = (pr) => JSON.stringify(pr || FB.state.project, null, 2);

	/* ---------- the briefing for Claude ---------- */
	const BRIEF_NAME = 'FOCUS_BRIEF_FOR_CLAUDE.md';
	FB.gen.paths = function (pr) {
		const m = (pr || FB.state.project).meta, t = m.treeId;
		return {
			tree: m.sourceFile || ((pr || FB.state.project).kind === 'mio' ? `common/military_industrial_organization/organizations/${t}.txt` : `common/national_focus/${t}.txt`),
			loc: `localisation/english/${t}_l_english.yml`,
			brief: `FocusBuilder_export/${BRIEF_NAME}`,
			json: `FocusBuilder_export/focus_project.json`,
			changelog: `FocusBuilder_export/CHANGELOG.md`
		};
	};

	FB.gen.prompt = function (pr) {
		pr = pr || FB.state.project;
		const m = pr.meta;
		return [
			`I designed a HOI4 focus tree with Focus Builder (tree "${m.treeId}", country ${m.tag || '?'}).`,
			`Read FocusBuilder_export/${BRIEF_NAME} and import the focus tree into my mod${m.modFolder ? ' at ' + m.modFolder : ''}.`,
			'Follow the brief exactly: place the files, create everything listed under "Things the mod must define",',
			'resolve every "CLAUDE-TODO" and "INCOMPLETE" comment, then check the syntax and tell me what you changed.'
		].join(' ');
	};

	function reqText(f) {
		if (!f.prereqs.length) return '— (root focus)';
		return f.prereqs.map((g) => {
			const ns = g.map((u) => FB.getFocus(u)).filter(Boolean).map((x) => `${x.name} (${x.id})`);
			return ns.length > 1 ? '(' + ns.join(' OR ') + ')' : ns[0];
		}).filter(Boolean).join(' AND ');
	}

	FB.gen.brief = function (pr) {
		pr = pr || FB.state.project;
		const m = pr.meta, ctx = FB.ctx(), paths = FB.gen.paths(pr);
		const fs = pr.focuses.slice().sort((a, b) => a.y - b.y || a.x - b.x);
		const issues = FB.validate().filter((v) => v.level !== 'info');
		const todoPlain = [];
		fs.forEach((f) => {
			f.rewards.forEach((it) => { if (it.type === '__plain') todoPlain.push({ f, what: 'reward', text: it.p.text }); });
			['available', 'bypass', 'visible'].forEach((k) => f[k].items.forEach((it) => { if (it.type === '__plain') todoPlain.push({ f, what: k === 'available' ? 'requirement' : k, text: it.p.text }); }));
		});
		const undef = FB.undefinedRefs();
		const L = [];
		const w = (s) => L.push(s == null ? '' : s);

		w(`# Focus Builder export: "${m.treeId}" (${fs.length} focuses)`);
		w();
		w(`> Created with Focus Builder on ${new Date().toISOString().slice(0, 10)}. The person who made this does **not** code. They designed the tree visually, so treat this file as the complete specification and fix technical problems yourself instead of asking them for syntax.`);
		w();
		w('## 1. What to do');
		w();
		w(`1. Put the generated files into the mod (see section 2). If the mod already has a focus tree or files with these names, **do not overwrite blindly**: compare, merge, and tell the user what you did.`);
		w(`2. Create everything listed in section 6 (events, ideas, decisions, localisation keys). Use sensible, balanced values based on the descriptions given.`);
		w(`3. Replace every \`# CLAUDE-TODO\` and \`# INCOMPLETE\` comment in the tree file with working script (sections 5 and 7 explain each one).`);
		w(`4. Make sure every icon (\`GFX_goal_...\`) exists as a sprite in the mod or vanilla game; if not, use a vanilla fallback or add a \`.gfx\` entry.`);
		w(`5. Validate with the checklist in section 8, then summarise your changes in plain language (no jargon) for the user.`);
		w();
		w('## 2. Files in this export');
		w();
		w('| File | Put it here in the mod |');
		w('|---|---|');
		w(`| \`${paths.tree}\` | \`${paths.tree}\` (the focus tree itself) |`);
		w(`| \`${paths.loc}\` | \`${paths.loc}\` (names + descriptions; must stay UTF-8 **with BOM**) |`);
		w(`| \`${paths.brief}\` | this file, documentation only (not part of the mod) |`);
		w(`| \`${paths.json}\` | the project file; the user can re-open it in Focus Builder (not part of the mod) |`);
		w();
		w('## 3. Target');
		w();
		w(`- **Mod name:** ${m.modName || '(not given)'}`);
		w(`- **Mod folder:** ${m.modFolder || '(not given; ask the user or look for a \`descriptor.mod\` / \`.mod\` file in the working directory)'}`);
		w(`- **Country tag(s):** ${m.tag || '(MISSING - ask the user)'}`);
		w(`- **Focus tree id:** \`${m.treeId}\``);
		w(`- **ID prefix used for focus ids:** \`${FB.prefix()}_\``);
		w(`- **HOI4 version targeted:** ${m.hoi4Version || 'latest'}`);
		w(`- **Default icon:** \`${m.defaultIcon}\``);
		if (m.importedFrom) {
			w(`- **Imported from an existing mod file:** \`${m.importedFrom}\`. This tree already existed. The tree file replaces that file, so diff it first. Original code Focus Builder could not map (marked as raw/extra) was kept unchanged. Positions that used \`relative_position_id\` are now absolute. The localisation file is new: remove duplicate keys from the mod's existing localisation so no key is defined twice.`);
		}
		if ((m.notes || '').trim()) { w(); w('**General notes from the user:**'); w(); m.notes.trim().split('\n').forEach((l) => w('> ' + l)); }
		w();

		const pend = FB.pendingGroups();
		w('## 3b. Changes in this version');
		w();
		if (pend.length) { w('The user edited an existing tree. These are the differences from the last saved version. Review them, and keep every other part of the existing files as it was:'); w(); w(FB.gen.groupsMd(pend)); }
		else w('No edits since the project was opened or last saved.');
		w();
		w('## 4. Focus overview');
		w();
		w('Positions are grid coordinates (x right, y down) exactly as written in the tree file. `cost` is in **weeks**: 1 week = 7 days at normal focus speed.');
		w();
		w('| ID | Name | Weeks | x,y | Requires | Mutually exclusive with | # Rewards |');
		w('|---|---|---|---|---|---|---|');
		fs.forEach((f) => {
			const ex = f.excl.map((u) => FB.getFocus(u)).filter(Boolean).map((x) => x.id).join(', ') || '—';
			w(`| \`${f.id}\` | ${f.name} | ${f.weeks} | ${f.x},${f.y} | ${reqText(f)} | ${ex} | ${f.rewards.length} |`);
		});
		w();
		w('### Per-focus details');
		w();
		fs.forEach((f) => {
			w(`#### ${f.name} (\`${f.id}\`)`);
			w();
			w(`- Duration: ${FB.weeksToText(f.weeks)}; position ${f.x},${f.y}; icon \`${f.icon || m.defaultIcon}\``);
			w(`- Requires: ${reqText(f)}`);
			if (f.desc.trim()) w(`- In-game description: "${f.desc.trim().replace(/\n/g, ' ')}"`);
			if (f.note.trim()) w(`- **Note from the user:** ${f.note.trim().replace(/\n/g, ' ')}`);
			const conds = (label, c) => { if (c.items.length) { w(`- ${label} (${c.mode === 'any' ? 'any one of' : 'all of'}):`); c.items.forEach((it) => w(`  - ${FB.itemText('trigger', it, ctx)}`)); } };
			conds('Can only be started when', f.available);
			conds('Skipped automatically (bypass) when', f.bypass);
			conds('Only visible when', f.visible);
			if (f.rewards.length) { w('- Rewards:'); f.rewards.forEach((it) => w(`  - ${FB.itemText('effect', it, ctx)}`)); } else w('- Rewards: none yet');
			w();
		});

		w('## 5. Plain-language items Claude must implement');
		w();
		if (!todoPlain.length) w('None. Every reward and requirement was built from the catalogue.');
		else todoPlain.forEach((t) => w(`- **${t.f.name}** (\`${t.f.id}\`), ${t.what}: ${String(t.text || '').trim().replace(/\n/g, ' ')}`));
		w();
		w('Each of these appears in the tree file as a `# CLAUDE-TODO` comment at the right spot. Replace the comment with real script.');
		w();

		w('## 6. Things the mod must define');
		w();
		const items = pr.items.filter((i) => i.id || i.name);
		if (!items.length && !undef.length) w('Nothing extra: the tree only uses vanilla content.');
		if (items.length) {
			w('The user described these. Create them with sensible, balanced numbers:');
			w();
			items.forEach((i) => {
				w(`- **${KIND_LABEL[i.kind] || i.kind}** \`${i.id}\`${i.name ? ' — "' + i.name + '"' : ''}`);
				if ((i.desc || '').trim()) w(`  - Text/flavour: ${i.desc.trim().replace(/\n/g, ' ')}`);
				if ((i.plain || '').trim()) w(`  - What it should do: ${i.plain.trim().replace(/\n/g, ' ')}`);
				const users = FB.collectRefs().find((r) => r.kind === i.kind && r.id === i.id);
				if (users) w(`  - Used by: ${users.focuses.join(', ')}`);
			});
			w();
		}
		if (undef.length) {
			w('The tree references these, but the user gave **no details**. Invent something fitting (based on the focus names/descriptions), define it, and tell the user what you chose:');
			w();
			undef.forEach((r) => w(`- ${KIND_LABEL[r.kind] || r.kind}${r.note ? ' (' + r.note + ')' : ''} \`${r.id}\` — used by: ${r.focuses.join(', ')}`));
			w();
		}
		const flags = FB.collectRefs().filter((r) => r.kind === 'flag' || r.kind === 'variable');
		if (flags.length) {
			w('Flags / variables used (nothing to define, just keep the spelling consistent):');
			w();
			flags.forEach((r) => w(`- ${r.kind} \`${r.id}\` — ${r.focuses.join(', ')}`));
			w();
		}

		w('## 7. Open problems found by Focus Builder');
		w();
		if (!issues.length) w('No warnings or errors.');
		else issues.forEach((v) => w(`- **${v.level.toUpperCase()}**: ${v.msg}`));
		w();
		w('`INCOMPLETE` comments in the tree file mark rewards or requirements where the user did not fill in a required field. Ask the user only if the value cannot reasonably be inferred; otherwise pick a sensible one and report it.');
		w();

		w('## 8. HOI4 rules and checklist');
		w();
		w('- Every focus `id` must be unique across **all** loaded focus trees. IDs here use the prefix `' + FB.prefix() + '_`.');
		w('- Localisation files must be UTF-8 **with BOM** and start with `l_english:`. Keys: `<focus_id>` (name) and `<focus_id>_desc` (description).');
		w('- `prerequisite = { focus = A focus = B }` means A **or** B; separate `prerequisite` blocks are all required. `mutually_exclusive` is written on both sides.');
		w('- Scope of `completion_reward` is the country. `NN = { ... }` with a number is a state scope. `ROOT` is the country that completed the focus.');
		w('- `available`, `bypass` and `allow_branch` contain triggers, not effects. `OR = { }` / `NOT = { }` are plain script blocks.');
		w('- Check each focus tree file loads without errors in `error.log` (Documents/Paradox Interactive/Hearts of Iron IV/logs/error.log) after starting the game with the mod enabled.');
		w('- Check: no duplicate ids, every `prerequisite` / `mutually_exclusive` target exists, braces balance, icons exist, every event/idea/decision referenced is defined, no `# CLAUDE-TODO` or `# INCOMPLETE` comments remain.');
		w('- If a catalogue-generated line is wrong for the version of HOI4 the mod targets (effect renamed or removed), fix it and tell the user.');
		w();
		w('## 9. Suggested message from the user');
		w();
		w('```');
		w(FB.gen.prompt(pr));
		w('```');
		w();
		return L.join('\n');
	};

	/** Everything in one paste-able message. */
	FB.gen.bundle = function (pr) {
		pr = pr || FB.state.project;
		const paths = FB.gen.paths(pr);
		const out = [FB.gen.prompt(pr), '', '---', '', FB.gen.brief(pr), '', '---', '', `## FILE: ${paths.tree}`, '', '````', FB.gen.tree(pr).trimEnd(), '````', '',
			`## FILE: ${paths.loc}  (save as UTF-8 with BOM)`, '', '````', FB.gen.loc(pr).replace('﻿', '').trimEnd(), '````', '',
			`## FILE: ${paths.json}`, '', '````json', FB.gen.projectJson(pr), '````', ''];
		return out.join('\n');
	};

	FB.gen.files = function (pr) {
		pr = pr || FB.state.project;
		const p = FB.gen.paths(pr);
		return [
			{ path: p.tree, content: FB.gen.tree(pr) },
			{ path: p.loc, content: FB.gen.loc(pr) },
			{ path: p.brief, content: FB.gen.brief(pr) },
			{ path: p.json, content: FB.gen.projectJson(pr) },
			{ path: p.changelog, content: '# Pending changes\n\n' + (FB.pendingGroups().length ? FB.gen.groupsMd(FB.pendingGroups()) : 'No changes.\n') }
		];
	};
})(window.FB = window.FB || {});
