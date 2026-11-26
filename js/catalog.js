/* Focus Builder - catalogue of HOI4 rewards (effects), conditions (triggers), icons, etc.
 * Every entry says what it does in plain English, which fields it needs, and how to
 * turn those fields into HOI4 script. Searching (autocomplete) uses label + kw + desc. */
(function (FB) {
	'use strict';

	/* ---------- value helpers (used by code generators) ---------- */
	const N = (x) => { const n = Number(x); return Number.isFinite(n) ? String(n) : '0'; };
	const PCT = (x) => { const n = Number(x); return Number.isFinite(n) ? String(Math.round(n * 100) / 10000) : '0'; };
	const Q = (s) => '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
	const ID = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, '_');
	const TAG = (s) => String(s == null ? '' : s).trim().toUpperCase();
	const YN = (s) => (s === 'no' || s === false ? 'no' : 'yes');

	/* ---------- parameter builders ---------- */
	const num = (key, label, o) => Object.assign({ key, label, type: 'number', def: 0 }, o);
	const pct = (key, label, o) => Object.assign({ key, label, type: 'percent', def: 5, suffix: '%' }, o);
	const txt = (key, label, o) => Object.assign({ key, label, type: 'text', def: '' }, o);
	const sel = (key, label, options, o) => Object.assign({ key, label, type: 'select', options, def: options[0][0] }, o);
	const yn = (key, label, def, o) => sel(key, label, [['yes', 'Yes'], ['no', 'No']], Object.assign({ def: def || 'yes' }, o));
	const tag = (key, label, o) => Object.assign({ key, label, type: 'tag', def: '', req: true, ph: 'e.g. POL' }, o);
	const state = (key, label, o) => Object.assign({
		key, label, type: 'state', def: '', req: true, ph: 'e.g. 64',
		hint: 'Numeric state ID. Not sure which? Type any number and add a note for Claude, or look it up on the HOI4 wiki "State ID" list.'
	}, o);
	const ref = (key, label, type, o) => Object.assign({ key, label, type, def: '', req: true }, o);
	const OPS = [['>', 'more than'], ['<', 'less than'], ['=', 'exactly']];

	const IDEOLOGIES = [['democratic', 'Democratic'], ['communism', 'Communist'], ['fascism', 'Fascist'], ['neutrality', 'Neutral / Authoritarian']];
	const BUILDINGS = [
		['industrial_complex', 'Civilian factory'], ['arms_factory', 'Military factory'], ['dockyard', 'Dockyard'],
		['infrastructure', 'Infrastructure'], ['air_base', 'Air base'], ['anti_air_building', 'Anti-air'],
		['radar_station', 'Radar station'], ['synthetic_refinery', 'Synthetic refinery'], ['fuel_silo', 'Fuel silo'],
		['rocket_site', 'Rocket site'], ['nuclear_reactor', 'Nuclear reactor']
	];
	const RESOURCES = [['steel', 'Steel'], ['aluminium', 'Aluminium'], ['oil', 'Oil'], ['rubber', 'Rubber'], ['tungsten', 'Tungsten'], ['chromium', 'Chromium']];

	const CAT = {
		pol: 'Politics & stability', eco: 'Industry & economy', res: 'Research', mil: 'Military',
		war: 'War & diplomacy', ter: 'Territory', idea: 'Ideas & events', flag: 'Flags & variables', adv: 'Advanced'
	};

	/* ---------- REWARDS (effects) ---------- */
	const effects = [];
	const fx = (o) => { o.kind = 'effect'; effects.push(o); };

	fx({ id: 'add_political_power', label: 'Gain political power', cat: CAT.pol, desc: 'Adds (or removes, if negative) political power.',
		kw: 'pp political power points currency resource', params: [num('value', 'Amount', { def: 50 })],
		code: (p) => `add_political_power = ${N(p.value)}`, filters: ['FOCUS_FILTER_POLITICAL'] });
	fx({ id: 'add_stability', label: 'Change stability', cat: CAT.pol, desc: 'Raises or lowers national stability (in percentage points).',
		kw: 'stability happy unrest', params: [pct('value', 'Change', { def: 5 })],
		code: (p) => `add_stability = ${PCT(p.value)}`, filters: ['FOCUS_FILTER_STABILITY'] });
	fx({ id: 'add_war_support', label: 'Change war support', cat: CAT.pol, desc: 'Raises or lowers war support (in percentage points).',
		kw: 'war support ws mobilisation morale', params: [pct('value', 'Change', { def: 5 })],
		code: (p) => `add_war_support = ${PCT(p.value)}`, filters: ['FOCUS_FILTER_WAR_SUPPORT'] });
	fx({ id: 'add_popularity', label: 'Change popularity of an ideology', cat: CAT.pol, desc: 'Makes an ideology more (or less) popular with the people.',
		kw: 'popularity support party democratic fascist communist neutral', params: [sel('ideology', 'Ideology', IDEOLOGIES), pct('value', 'Change', { def: 10 })],
		code: (p) => `add_popularity = {\n\tideology = ${p.ideology}\n\tpopularity = ${PCT(p.value)}\n}`, filters: ['FOCUS_FILTER_POLITICAL'] });
	fx({ id: 'set_politics', label: 'Change the ruling party', cat: CAT.pol, desc: 'Sets which ideology governs the country.',
		kw: 'government regime ruling party coup election', params: [sel('party', 'New ruling party', IDEOLOGIES), yn('elections', 'Elections allowed?', 'no')],
		code: (p) => `set_politics = {\n\truling_party = ${p.party}\n\telections_allowed = ${YN(p.elections)}\n}`, filters: ['FOCUS_FILTER_POLITICAL'] });
	fx({ id: 'add_command_power', label: 'Gain command power', cat: CAT.mil, desc: 'Adds command power (used for army plans, generals, etc.).',
		kw: 'command power cp', params: [num('value', 'Amount', { def: 20 })], code: (p) => `add_command_power = ${N(p.value)}` });

	fx({ id: 'add_manpower', label: 'Gain manpower', cat: CAT.mil, desc: 'Adds manpower (recruitable soldiers) to the pool.',
		kw: 'manpower troops soldiers recruits people', params: [num('value', 'Amount', { def: 50000, step: 1000 })],
		code: (p) => `add_manpower = ${N(p.value)}`, filters: ['FOCUS_FILTER_MANPOWER'] });
	fx({ id: 'add_exp', label: 'Gain military experience', cat: CAT.mil, desc: 'Adds army, navy or air experience.',
		kw: 'experience xp army navy air', params: [sel('type', 'Branch', [['army_experience', 'Army'], ['navy_experience', 'Navy'], ['air_experience', 'Air force']]), num('value', 'Amount', { def: 25 })],
		code: (p) => `${p.type} = ${N(p.value)}` });
	fx({ id: 'add_equipment_to_stockpile', label: 'Give equipment', cat: CAT.mil, desc: 'Puts weapons or equipment into the stockpile.',
		kw: 'equipment stockpile guns rifles tanks planes weapons', params: [ref('type', 'Equipment type', 'equipment', { def: 'infantry_equipment_1', ph: 'infantry_equipment_1' }), num('amount', 'Amount', { def: 500 })],
		code: (p) => `add_equipment_to_stockpile = {\n\ttype = ${ID(p.type)}\n\tamount = ${N(p.amount)}\n}`, filters: ['FOCUS_FILTER_MILITARY_EQUIPMENT'] });

	fx({ id: 'add_building_construction', label: 'Build in a state', cat: CAT.eco, desc: 'Starts (instantly finished) construction of buildings in one state.',
		kw: 'factory factories build construction industry dockyard infrastructure civilian military', params: [state('state', 'State'), sel('type', 'Building', BUILDINGS), num('level', 'How many', { def: 1, min: 1 })],
		code: (p) => `${N(p.state)} = {\n\tadd_building_construction = {\n\t\ttype = ${p.type}\n\t\tlevel = ${N(p.level)}\n\t\tinstant_build = yes\n\t}\n}`, filters: ['FOCUS_FILTER_INDUSTRY'] });
	fx({ id: 'add_extra_state_shared_building_slots', label: 'More building slots in a state', cat: CAT.eco, desc: 'Lets a state hold more factories.',
		kw: 'slots building slots space capacity', params: [state('state', 'State'), num('value', 'Extra slots', { def: 2 })],
		code: (p) => `${N(p.state)} = {\n\tadd_extra_state_shared_building_slots = ${N(p.value)}\n}`, filters: ['FOCUS_FILTER_INDUSTRY'] });
	fx({ id: 'add_offsite_building', label: 'Build a factory not tied to a state', cat: CAT.eco, desc: 'Adds factories/dockyards without needing a state (offsite).',
		kw: 'offsite factory dockyard building', params: [sel('type', 'Building', [['industrial_complex', 'Civilian factory'], ['arms_factory', 'Military factory'], ['dockyard', 'Dockyard']]), num('level', 'How many', { def: 1, min: 1 })],
		code: (p) => `add_offsite_building = {\n\ttype = ${p.type}\n\tlevel = ${N(p.level)}\n}`, filters: ['FOCUS_FILTER_INDUSTRY'] });
	fx({ id: 'add_resource', label: 'Add resources to a state', cat: CAT.eco, desc: 'Adds steel, oil, aluminium, etc. production to a state.',
		kw: 'resource steel oil aluminium rubber tungsten chromium', params: [state('state', 'State'), sel('type', 'Resource', RESOURCES), num('amount', 'Amount', { def: 10 })],
		code: (p) => `add_resource = {\n\ttype = ${p.type}\n\tamount = ${N(p.amount)}\n\tstate = ${N(p.state)}\n}`, filters: ['FOCUS_FILTER_INDUSTRY'] });

	fx({ id: 'add_research_slot', label: 'Gain a research slot', cat: CAT.res, desc: 'Adds extra research slot(s).',
		kw: 'research slot scientists tech', params: [num('value', 'Slots', { def: 1, min: 1 })],
		code: (p) => `add_research_slot = ${N(p.value)}`, filters: ['FOCUS_FILTER_RESEARCH'] });
	fx({ id: 'add_tech_bonus', label: 'Research bonus (faster tech)', cat: CAT.res, desc: 'A one-off research speed bonus for a category of technology.',
		kw: 'tech bonus research speed discount technology', params: [
			ref('name', 'Bonus name (tooltip key)', 'tooltip', { def: '', ph: 'e.g. my_industry_bonus', hint: 'A localisation key. Claude will create the text for it.' }),
			pct('bonus', 'Research time reduction', { def: 50 }), num('uses', 'Number of techs', { def: 1, min: 1 }),
			ref('category', 'Tech category', 'techcat', { def: 'industry', ph: 'industry' })],
		code: (p) => `add_tech_bonus = {\n\tname = ${ID(p.name)}\n\tbonus = ${PCT(p.bonus)}\n\tuses = ${N(p.uses)}\n\tcategory = ${ID(p.category)}\n}`,
		refs: (p) => [{ kind: 'tooltip', id: ID(p.name) }], filters: ['FOCUS_FILTER_RESEARCH'] });
	fx({ id: 'set_technology', label: 'Unlock a technology', cat: CAT.res, desc: 'Gives a specific technology for free.',
		kw: 'technology tech unlock free research', params: [ref('tech', 'Technology ID', 'tech', { ph: 'e.g. infantry_weapons1' })],
		code: (p) => `set_technology = {\n\t${ID(p.tech)} = 1\n}`, filters: ['FOCUS_FILTER_RESEARCH'] });

	fx({ id: 'add_ideas', label: 'Give a national spirit / idea', cat: CAT.idea, desc: 'Adds a national spirit (permanent modifier shown in the country panel).',
		kw: 'idea national spirit modifier trait law advisor', params: [ref('idea', 'Idea', 'idea', { ph: 'pick or type an idea id' })],
		code: (p) => `add_ideas = ${ID(p.idea)}`, refs: (p) => [{ kind: 'idea', id: ID(p.idea) }] });
	fx({ id: 'add_timed_idea', label: 'Give a temporary national spirit', cat: CAT.idea, desc: 'A national spirit that disappears after some days.',
		kw: 'timed temporary idea spirit days', params: [ref('idea', 'Idea', 'idea'), num('days', 'Lasts (days)', { def: 180, min: 1 })],
		code: (p) => `add_timed_idea = {\n\tidea = ${ID(p.idea)}\n\tdays = ${N(p.days)}\n}`, refs: (p) => [{ kind: 'idea', id: ID(p.idea) }] });
	fx({ id: 'remove_ideas', label: 'Remove a national spirit', cat: CAT.idea, desc: 'Takes away a national spirit.',
		kw: 'remove idea spirit delete', params: [ref('idea', 'Idea', 'idea')], code: (p) => `remove_ideas = ${ID(p.idea)}`, refs: (p) => [{ kind: 'idea', id: ID(p.idea) }] });
	fx({ id: 'swap_ideas', label: 'Replace one spirit with another', cat: CAT.idea, desc: 'Swaps an existing national spirit for a new one.',
		kw: 'swap replace idea spirit upgrade', params: [ref('remove', 'Remove', 'idea'), ref('add', 'Add', 'idea')],
		code: (p) => `swap_ideas = {\n\tremove_idea = ${ID(p.remove)}\n\tadd_idea = ${ID(p.add)}\n}`,
		refs: (p) => [{ kind: 'idea', id: ID(p.remove) }, { kind: 'idea', id: ID(p.add) }] });
	fx({ id: 'country_event', label: 'Fire an event', cat: CAT.idea, desc: 'Triggers an event popup, optionally after a delay.',
		kw: 'event popup story dialog choice', params: [ref('event', 'Event ID', 'event', { ph: 'e.g. my_mod.1' }), num('days', 'Delay (days, optional)', { def: '', min: 0, req: false })],
		code: (p) => (p.days === '' || p.days == null || Number(p.days) === 0) ? `country_event = ${ID(p.event)}` : `country_event = {\n\tid = ${ID(p.event)}\n\tdays = ${N(p.days)}\n}`,
		refs: (p) => [{ kind: 'event', id: ID(p.event) }] });
	fx({ id: 'news_event', label: 'Fire a news event (worldwide)', cat: CAT.idea, desc: 'Shows a news event to every player.',
		kw: 'news event world headline', params: [ref('event', 'Event ID', 'event', { ph: 'e.g. my_mod.news.1' })],
		code: (p) => `news_event = ${ID(p.event)}`, refs: (p) => [{ kind: 'event', id: ID(p.event) }] });
	fx({ id: 'custom_effect_tooltip', label: 'Show custom tooltip text', cat: CAT.idea, desc: 'Displays a line of text in the focus tooltip (useful when other effects are hidden).',
		kw: 'tooltip text hint description', params: [ref('key', 'Text key', 'tooltip', { ph: 'e.g. my_tooltip' })],
		code: (p) => `custom_effect_tooltip = ${ID(p.key)}`, refs: (p) => [{ kind: 'tooltip', id: ID(p.key) }] });

	fx({ id: 'declare_war_on', label: 'Declare war', cat: CAT.war, desc: 'Starts a war against another country.',
		kw: 'war attack invade conquer declare', params: [tag('target', 'Target country'), sel('type', 'War goal', [['annex_everything', 'Annex everything'], ['puppet_wargoal_focus', 'Make puppet'], ['take_state_focus', 'Take states'], ['topple_government', 'Topple government']])],
		code: (p) => `declare_war_on = {\n\ttarget = ${TAG(p.target)}\n\ttype = ${p.type}\n}`, filters: ['FOCUS_FILTER_ANNEXATION'] });
	fx({ id: 'create_wargoal', label: 'Create a war goal', cat: CAT.war, desc: 'Gives a justification against a country without declaring war yet.',
		kw: 'wargoal war goal justify claim', params: [tag('target', 'Target country'), sel('type', 'War goal', [['annex_everything', 'Annex everything'], ['puppet_wargoal_focus', 'Make puppet'], ['take_state_focus', 'Take states'], ['topple_government', 'Topple government']])],
		code: (p) => `create_wargoal = {\n\ttype = ${p.type}\n\ttarget = ${TAG(p.target)}\n}`, filters: ['FOCUS_FILTER_ANNEXATION'] });
	fx({ id: 'annex_country', label: 'Annex a country peacefully', cat: CAT.war, desc: 'Instantly absorbs another country.',
		kw: 'annex anschluss absorb peaceful join', params: [tag('target', 'Country'), yn('troops', 'Take their troops?', 'yes')],
		code: (p) => `annex_country = {\n\ttarget = ${TAG(p.target)}\n\ttransfer_troops = ${YN(p.troops)}\n}`, filters: ['FOCUS_FILTER_ANNEXATION'] });
	fx({ id: 'puppet', label: 'Make a country your puppet', cat: CAT.war, desc: 'Turns another country into a puppet of yours.',
		kw: 'puppet subject vassal', params: [tag('target', 'Country')], code: (p) => `puppet = ${TAG(p.target)}` });
	fx({ id: 'set_autonomy', label: 'Set a subject\'s autonomy level', cat: CAT.war, desc: 'Changes how independent one of your subjects is.',
		kw: 'autonomy subject dominion puppet', params: [tag('target', 'Subject country'), sel('state', 'Autonomy level', [['autonomy_puppet', 'Puppet'], ['autonomy_dominion', 'Dominion'], ['autonomy_integrated_puppet', 'Integrated puppet'], ['autonomy_free', 'Free']])],
		code: (p) => `set_autonomy = {\n\ttarget = ${TAG(p.target)}\n\tautonomy_state = ${p.state}\n}` });
	fx({ id: 'release', label: 'Release a country', cat: CAT.war, desc: 'Creates (or frees) a country from your territory.',
		kw: 'release free independence', params: [tag('target', 'Country')], code: (p) => `release = ${TAG(p.target)}` });
	fx({ id: 'create_faction', label: 'Create a faction', cat: CAT.war, desc: 'Founds a new alliance/faction.',
		kw: 'faction alliance create pact', params: [txt('name', 'Faction name', { req: true, ph: 'e.g. Northern Pact' })],
		code: (p) => `create_faction = ${Q(p.name)}` });
	fx({ id: 'add_to_faction', label: 'Invite a country into your faction', cat: CAT.war, desc: 'Adds the country to your faction.',
		kw: 'faction invite join ally', params: [tag('target', 'Country')], code: (p) => `add_to_faction = ${TAG(p.target)}` });
	fx({ id: 'give_guarantee', label: 'Guarantee independence', cat: CAT.war, desc: 'Guarantees another country\'s independence.',
		kw: 'guarantee independence protect', params: [tag('target', 'Country')], code: (p) => `give_guarantee = ${TAG(p.target)}` });
	fx({ id: 'add_opinion_modifier', label: 'Change opinion of a country', cat: CAT.war, desc: 'Adds an opinion modifier toward another country.',
		kw: 'opinion relations diplomacy like hate', params: [tag('target', 'Country'), ref('modifier', 'Modifier ID', 'other', { ph: 'e.g. my_friendly_gesture' })],
		code: (p) => `add_opinion_modifier = {\n\ttarget = ${TAG(p.target)}\n\tmodifier = ${ID(p.modifier)}\n}`, refs: (p) => [{ kind: 'other', id: ID(p.modifier), note: 'opinion modifier' }] });
	fx({ id: 'add_named_threat', label: 'Raise world tension', cat: CAT.war, desc: 'Adds world tension (threat) with a label.',
		kw: 'threat tension world tension', params: [num('threat', 'Amount', { def: 2 }), ref('name', 'Label (tooltip key)', 'tooltip', { ph: 'e.g. my_threat_label' })],
		code: (p) => `add_named_threat = {\n\tthreat = ${N(p.threat)}\n\tname = ${ID(p.name)}\n}`, refs: (p) => [{ kind: 'tooltip', id: ID(p.name) }] });
	fx({ id: 'start_civil_war', label: 'Start a civil war', cat: CAT.war, desc: 'Splits the country with a civil war for an ideology.',
		kw: 'civil war rebels revolution split', params: [sel('ideology', 'Rebel ideology', IDEOLOGIES), pct('size', 'Share of the country', { def: 50 })],
		code: (p) => `start_civil_war = {\n\tideology = ${p.ideology}\n\tsize = ${PCT(p.size)}\n}` });

	fx({ id: 'add_state_core', label: 'Add a core on a state', cat: CAT.ter, desc: 'Makes a state a core territory of your country.',
		kw: 'core state territory claim', params: [state('state', 'State')], code: (p) => `add_state_core = ${N(p.state)}` });
	fx({ id: 'add_state_claim', label: 'Add a claim on a state', cat: CAT.ter, desc: 'Adds a (weaker) claim on a state.',
		kw: 'claim state territory', params: [state('state', 'State')], code: (p) => `add_state_claim = ${N(p.state)}`, filters: ['FOCUS_FILTER_ANNEXATION'] });
	fx({ id: 'transfer_state', label: 'Take ownership of a state', cat: CAT.ter, desc: 'Transfers a state to your country.',
		kw: 'transfer state own take territory', params: [state('state', 'State')], code: (p) => `transfer_state = ${N(p.state)}`, filters: ['FOCUS_FILTER_ANNEXATION'] });
	fx({ id: 'set_cosmetic_tag', label: 'Change country name/flag (cosmetic tag)', cat: CAT.ter, desc: 'Renames the country (needs a cosmetic tag defined in the mod).',
		kw: 'cosmetic tag rename flag name', params: [ref('tag', 'Cosmetic tag', 'other', { ph: 'e.g. GER_my_empire' })],
		code: (p) => `set_cosmetic_tag = ${ID(p.tag)}`, refs: (p) => [{ kind: 'other', id: ID(p.tag), note: 'cosmetic tag' }] });
	fx({ id: 'load_focus_tree', label: 'Switch to a different focus tree', cat: CAT.ter, desc: 'Loads another focus tree for the country.',
		kw: 'focus tree load switch', params: [ref('tree', 'Focus tree ID', 'other', { ph: 'tree id' })],
		code: (p) => `load_focus_tree = ${ID(p.tree)}` });
	fx({ id: 'complete_national_focus', label: 'Instantly complete another focus', cat: CAT.adv, desc: 'Marks another focus as completed right away.',
		kw: 'complete focus instantly skip', params: [ref('focus', 'Focus', 'focus')], code: (p, c) => `complete_national_focus = ${c.focusId(p.focus)}` });

	fx({ id: 'set_country_flag', label: 'Set a flag', cat: CAT.flag, desc: 'Remembers something happened. Other focuses/events can check it.',
		kw: 'flag set remember mark', params: [ref('flag', 'Flag name', 'flag', { ph: 'e.g. my_flag' }), num('days', 'Expires after (days, optional)', { def: '', req: false })],
		code: (p) => (p.days === '' || p.days == null || Number(p.days) === 0) ? `set_country_flag = ${ID(p.flag)}` : `set_country_flag = {\n\tflag = ${ID(p.flag)}\n\tdays = ${N(p.days)}\n}`,
		refs: (p) => [{ kind: 'flag', id: ID(p.flag) }] });
	fx({ id: 'clr_country_flag', label: 'Clear a flag', cat: CAT.flag, desc: 'Forgets a previously set flag.',
		kw: 'flag clear remove unset', params: [ref('flag', 'Flag name', 'flag')], code: (p) => `clr_country_flag = ${ID(p.flag)}`, refs: (p) => [{ kind: 'flag', id: ID(p.flag) }] });
	fx({ id: 'set_global_flag', label: 'Set a global flag', cat: CAT.flag, desc: 'Like a flag, but visible to every country.',
		kw: 'global flag world', params: [ref('flag', 'Flag name', 'flag')], code: (p) => `set_global_flag = ${ID(p.flag)}`, refs: (p) => [{ kind: 'flag', id: ID(p.flag) }] });
	fx({ id: 'add_to_variable', label: 'Add to a variable', cat: CAT.flag, desc: 'Increases (or decreases) a number the mod keeps track of.',
		kw: 'variable add counter number math', params: [ref('var', 'Variable name', 'variable', { ph: 'e.g. my_counter' }), num('value', 'Add', { def: 1 })],
		code: (p) => `add_to_variable = { ${ID(p.var)} = ${N(p.value)} }`, refs: (p) => [{ kind: 'variable', id: ID(p.var) }] });
	fx({ id: 'set_variable', label: 'Set a variable', cat: CAT.flag, desc: 'Sets a tracked number to an exact value.',
		kw: 'variable set counter number', params: [ref('var', 'Variable name', 'variable'), num('value', 'Value', { def: 0 })],
		code: (p) => `set_variable = { ${ID(p.var)} = ${N(p.value)} }`, refs: (p) => [{ kind: 'variable', id: ID(p.var) }] });

	/* Free-form rewards */
	const PLAIN = {
		kind: 'effect', id: '__plain', label: 'Describe it in plain words (Claude writes the code)', cat: CAT.adv,
		desc: 'Not in the list? Just say what you want, e.g. "unlock a decision to buy oil from Romania". Claude will turn it into real HOI4 code.',
		kw: 'custom other plain words describe something else not listed claude', params: [{ key: 'text', label: 'What should happen?', type: 'longtext', def: '', req: true, ph: 'Describe the reward in your own words…' }],
		code: (p) => String(p.text || '').split('\n').map((l) => '# CLAUDE-TODO (reward): ' + l).join('\n')
	};
	const RAW = {
		kind: 'effect', id: '__raw', label: 'Write HOI4 code myself', cat: CAT.adv,
		desc: 'Paste raw HOI4 script. It is copied into the focus unchanged.',
		kw: 'raw code script custom paste', params: [{ key: 'text', label: 'HOI4 code', type: 'code', def: '', req: true, ph: 'add_stability = 0.05' }],
		code: (p) => String(p.text || '')
	};
	effects.push(PLAIN, RAW);

	/* Ready-made bundles */
	const recipes = [
		{ kind: 'recipe', id: 'rcp_rally', label: 'Recipe: Rally the nation', cat: 'Quick recipes', desc: '+5% stability, +5% war support, +25 political power.',
			kw: 'recipe bundle rally unity morale', items: [['add_stability', { value: 5 }], ['add_war_support', { value: 5 }], ['add_political_power', { value: 25 }]] },
		{ kind: 'recipe', id: 'rcp_industry', label: 'Recipe: Industrial push', cat: 'Quick recipes', desc: '2 civilian factories + 1 extra slot in a state (pick the state).',
			kw: 'recipe bundle industry factories economy', items: [['add_building_construction', { state: '', type: 'industrial_complex', level: 2 }], ['add_extra_state_shared_building_slots', { state: '', value: 1 }]] },
		{ kind: 'recipe', id: 'rcp_research', label: 'Recipe: Research boost', cat: 'Quick recipes', desc: 'An extra research slot and a 50% speed bonus for one tech.',
			kw: 'recipe bundle research science', items: [['add_research_slot', { value: 1 }], ['add_tech_bonus', { name: '', bonus: 50, uses: 1, category: 'industry' }]] },
		{ kind: 'recipe', id: 'rcp_military', label: 'Recipe: Military buildup', cat: 'Quick recipes', desc: '+50,000 manpower, +25 army experience, +5% war support.',
			kw: 'recipe bundle military army mobilise', items: [['add_manpower', { value: 50000 }], ['add_exp', { type: 'army_experience', value: 25 }], ['add_war_support', { value: 5 }]] }
	];

	/* ---------- CONDITIONS (triggers) ---------- */
	const triggers = [];
	const tr = (o) => { o.kind = 'trigger'; triggers.push(o); };
	const cmp = (key, label, def) => [sel('op', 'is', OPS, { def: '>' }), num(key || 'value', label || 'Value', { def: def == null ? 0 : def })];

	tr({ id: 'has_completed_focus', label: 'Another focus is completed', cat: 'Focuses & flags', desc: 'True once a specific focus has been finished.', kw: 'focus completed done prerequisite',
		params: [ref('focus', 'Focus', 'focus')], code: (p, c) => `has_completed_focus = ${c.focusId(p.focus)}` });
	tr({ id: 'has_country_flag', label: 'A flag is set', cat: 'Focuses & flags', desc: 'True if the flag was set earlier.', kw: 'flag set',
		params: [ref('flag', 'Flag name', 'flag')], code: (p) => `has_country_flag = ${ID(p.flag)}`, refs: (p) => [{ kind: 'flag', id: ID(p.flag) }] });
	tr({ id: 'has_global_flag', label: 'A global flag is set', cat: 'Focuses & flags', desc: 'True if the global flag was set by anyone.', kw: 'global flag',
		params: [ref('flag', 'Flag name', 'flag')], code: (p) => `has_global_flag = ${ID(p.flag)}`, refs: (p) => [{ kind: 'flag', id: ID(p.flag) }] });
	tr({ id: 'check_variable', label: 'A variable compares to a number', cat: 'Focuses & flags', desc: 'Checks a tracked number.', kw: 'variable check counter',
		params: [ref('var', 'Variable', 'variable'), sel('op', 'is', OPS, { def: '>' }), num('value', 'Value', { def: 0 })],
		code: (p) => `check_variable = { ${ID(p.var)} ${p.op} ${N(p.value)} }`, refs: (p) => [{ kind: 'variable', id: ID(p.var) }] });
	tr({ id: 'has_idea', label: 'Has a national spirit', cat: 'Focuses & flags', desc: 'True if the country currently has the idea.', kw: 'idea spirit has',
		params: [ref('idea', 'Idea', 'idea')], code: (p) => `has_idea = ${ID(p.idea)}`, refs: (p) => [{ kind: 'idea', id: ID(p.idea) }] });
	tr({ id: 'date', label: 'Date is after / before', cat: 'Time', desc: 'Only after (or before) a certain date.', kw: 'date year time after before when',
		params: [sel('op', 'Date is', [['>', 'after'], ['<', 'before']], { def: '>' }), txt('date', 'Date (year.month.day)', { def: '1938.1.1', req: true, ph: '1938.1.1' })],
		code: (p) => `date ${p.op} ${String(p.date).trim()}` });
	tr({ id: 'has_political_power', label: 'Political power amount', cat: 'Resources', desc: 'Checks how much political power you have.', kw: 'pp political power',
		params: cmp('value', 'Amount', 50), code: (p) => `has_political_power ${p.op} ${N(p.value)}` });
	tr({ id: 'has_stability', label: 'Stability level', cat: 'Resources', desc: 'Checks stability (as a percentage).', kw: 'stability',
		params: [sel('op', 'is', OPS, { def: '>' }), pct('value', 'Stability', { def: 50 })], code: (p) => `has_stability ${p.op} ${PCT(p.value)}` });
	tr({ id: 'has_war_support', label: 'War support level', cat: 'Resources', desc: 'Checks war support (as a percentage).', kw: 'war support',
		params: [sel('op', 'is', OPS, { def: '>' }), pct('value', 'War support', { def: 50 })], code: (p) => `has_war_support ${p.op} ${PCT(p.value)}` });
	tr({ id: 'num_of_factories', label: 'Number of factories (all)', cat: 'Resources', desc: 'Counts all factories.', kw: 'factories industry count',
		params: cmp('value', 'Factories', 20), code: (p) => `num_of_factories ${p.op} ${N(p.value)}` });
	tr({ id: 'num_of_military_factories', label: 'Number of military factories', cat: 'Resources', desc: 'Counts military factories only.', kw: 'military factories arms count',
		params: cmp('value', 'Factories', 10), code: (p) => `num_of_military_factories ${p.op} ${N(p.value)}` });
	tr({ id: 'has_tech', label: 'Has researched a technology', cat: 'Resources', desc: 'True once the technology is known.', kw: 'tech technology researched',
		params: [ref('tech', 'Technology ID', 'tech')], code: (p) => `has_tech = ${ID(p.tech)}` });
	tr({ id: 'has_war', label: 'Is at war', cat: 'War & politics', desc: 'True if currently in any war.', kw: 'war at war fighting',
		params: [yn('v', 'At war?', 'yes')], code: (p) => `has_war = ${YN(p.v)}` });
	tr({ id: 'has_defensive_war', label: 'Is in a defensive war', cat: 'War & politics', desc: 'True if attacked by someone.', kw: 'defensive war attacked',
		params: [yn('v', 'In defensive war?', 'yes')], code: (p) => `has_defensive_war = ${YN(p.v)}` });
	tr({ id: 'has_war_with', label: 'Is at war with a country', cat: 'War & politics', desc: 'True if at war with a specific country.', kw: 'war with enemy',
		params: [tag('tag', 'Country')], code: (p) => `has_war_with = ${TAG(p.tag)}` });
	tr({ id: 'is_in_faction', label: 'Is in a faction', cat: 'War & politics', desc: 'True if member of any faction.', kw: 'faction alliance member',
		params: [yn('v', 'In a faction?', 'yes')], code: (p) => `is_in_faction = ${YN(p.v)}` });
	tr({ id: 'is_in_faction_with', label: 'Is in a faction with a country', cat: 'War & politics', desc: 'True if allied in the same faction.', kw: 'faction with ally',
		params: [tag('tag', 'Country')], code: (p) => `is_in_faction_with = ${TAG(p.tag)}` });
	tr({ id: 'has_government', label: 'Government is…', cat: 'War & politics', desc: 'Checks the ruling ideology.', kw: 'government ideology ruling party democratic fascist communist',
		params: [sel('ideology', 'Government', IDEOLOGIES)], code: (p) => `has_government = ${p.ideology}` });
	tr({ id: 'is_subject', label: 'Is a subject (puppet etc.)', cat: 'War & politics', desc: 'True if someone else is the overlord.', kw: 'subject puppet vassal',
		params: [yn('v', 'Is subject?', 'yes')], code: (p) => `is_subject = ${YN(p.v)}` });
	tr({ id: 'is_subject_of', label: 'Is a subject of a country', cat: 'War & politics', desc: 'True if the named country is the overlord.', kw: 'subject of overlord',
		params: [tag('tag', 'Overlord')], code: (p) => `is_subject_of = ${TAG(p.tag)}` });
	tr({ id: 'has_capitulated', label: 'Has capitulated', cat: 'War & politics', desc: 'True if the country surrendered.', kw: 'capitulated surrender',
		params: [yn('v', 'Capitulated?', 'yes')], code: (p) => `has_capitulated = ${YN(p.v)}` });
	tr({ id: 'exists', label: 'A country exists', cat: 'War & politics', desc: 'True while the country is still on the map.', kw: 'exists country alive',
		params: [tag('tag', 'Country')], code: (p) => `exists = ${TAG(p.tag)}` });
	tr({ id: 'owns_state', label: 'Owns a state', cat: 'Territory', desc: 'True if your country owns the state.', kw: 'own state territory',
		params: [state('state', 'State')], code: (p) => `owns_state = ${N(p.state)}` });
	tr({ id: 'controls_state', label: 'Controls a state', cat: 'Territory', desc: 'True if your forces control the state.', kw: 'control state territory occupy',
		params: [state('state', 'State')], code: (p) => `controls_state = ${N(p.state)}` });
	tr({ id: 'is_ai', label: 'Country is AI-controlled', cat: 'Other', desc: 'Checks whether a human is playing.', kw: 'ai human player',
		params: [yn('v', 'Is AI?', 'yes')], code: (p) => `is_ai = ${YN(p.v)}` });
	tr({ id: 'is_historical_focus_on', label: 'Historical focus is on', cat: 'Other', desc: 'True when the game rule "historical AI focus" is active.', kw: 'historical game rule',
		params: [yn('v', 'Historical on?', 'yes')], code: (p) => `is_historical_focus_on = ${YN(p.v)}` });
	triggers.push({
		kind: 'trigger', id: '__plain', label: 'Describe it in plain words (Claude writes the code)', cat: 'Other',
		desc: 'Say the condition in your own words, e.g. "player controls at least 3 oil states".', kw: 'custom other plain words describe something else not listed claude',
		params: [{ key: 'text', label: 'What must be true?', type: 'longtext', def: '', req: true, ph: 'Describe the condition…' }],
		code: (p) => String(p.text || '').split('\n').map((l) => '# CLAUDE-TODO (condition): ' + l).join('\n')
	}, {
		kind: 'trigger', id: '__raw', label: 'Write HOI4 code myself', cat: 'Other', desc: 'Paste a raw HOI4 trigger.', kw: 'raw code script custom paste',
		params: [{ key: 'text', label: 'HOI4 code', type: 'code', def: '', req: true, ph: 'has_government = fascism' }],
		code: (p) => String(p.text || '')
	});

	/* ---------- static lists ---------- */
	const icons = [
		['GFX_goal_unknown', 'Unknown / placeholder', 'default none'],
		['GFX_goal_generic_construction', 'Construction / industry', 'factory build industry'],
		['GFX_goal_generic_production', 'Production', 'factory production industry'],
		['GFX_goal_generic_army_doctrines', 'Army doctrine', 'army military doctrine'],
		['GFX_goal_generic_allies', 'Allies / diplomacy', 'ally alliance faction'],
		['GFX_goal_generic_demand_territory', 'Demand territory', 'claim territory annex'],
		['GFX_goal_generic_national_unity', 'National unity', 'unity stability nation'],
		['GFX_goal_generic_political_pressure', 'Political pressure', 'politics pressure influence'],
		['GFX_goal_generic_attack', 'Attack', 'war attack offence'],
		['GFX_goal_generic_scientific_exchange', 'Science / research', 'research science tech'],
		['GFX_goal_generic_neutrality_focus', 'Neutrality', 'neutral'],
		['GFX_goal_generic_dominion', 'Dominion / subject', 'dominion subject puppet'],
		['GFX_goal_support_communism', 'Support communism', 'communism red'],
		['GFX_goal_support_fascism', 'Support fascism', 'fascism'],
		['GFX_goal_support_democracy', 'Support democracy', 'democracy']
	].map(([key, label, kw]) => ({ key, label, kw, sub: key }));

	const filters = [
		['FOCUS_FILTER_POLITICAL', 'Political', '#5b8def'], ['FOCUS_FILTER_RESEARCH', 'Research', '#3cc6d4'],
		['FOCUS_FILTER_INDUSTRY', 'Industry', '#e09a3a'], ['FOCUS_FILTER_STABILITY', 'Stability', '#6cc08b'],
		['FOCUS_FILTER_WAR_SUPPORT', 'War support', '#e5604d'], ['FOCUS_FILTER_MANPOWER', 'Manpower', '#b07ae0'],
		['FOCUS_FILTER_ANNEXATION', 'Annexation', '#c9435f'], ['FOCUS_FILTER_MILITARY_EQUIPMENT', 'Military equipment', '#9aa7b3'],
		['FOCUS_FILTER_ARMY_XP', 'Army XP', '#8c9a5b'], ['FOCUS_FILTER_NAVY_XP', 'Navy XP', '#4f7fa8'], ['FOCUS_FILTER_AIR_XP', 'Air XP', '#8fb8d6']
	].map(([id, label, color]) => ({ id, label, color }));

	const tags = [
		['GER', 'Germany'], ['SOV', 'Soviet Union'], ['USA', 'United States'], ['ENG', 'United Kingdom'], ['FRA', 'France'], ['ITA', 'Italy'],
		['JAP', 'Japan'], ['CHI', 'China'], ['POL', 'Poland'], ['SPR', 'Spain'], ['TUR', 'Turkey'], ['CAN', 'Canada'], ['AST', 'Australia'],
		['SWE', 'Sweden'], ['FIN', 'Finland'], ['NOR', 'Norway'], ['DEN', 'Denmark'], ['HOL', 'Netherlands'], ['BEL', 'Belgium'],
		['SWI', 'Switzerland'], ['POR', 'Portugal'], ['AUS', 'Austria'], ['CZE', 'Czechoslovakia'], ['HUN', 'Hungary'], ['ROM', 'Romania'],
		['YUG', 'Yugoslavia'], ['BUL', 'Bulgaria'], ['GRE', 'Greece'], ['LAT', 'Latvia'], ['LIT', 'Lithuania'], ['EST', 'Estonia'],
		['MEX', 'Mexico'], ['BRA', 'Brazil'], ['ARG', 'Argentina'], ['RAJ', 'British Raj'], ['SAF', 'South Africa'], ['PER', 'Persia'],
		['IRQ', 'Iraq'], ['EGY', 'Egypt'], ['ETH', 'Ethiopia'], ['MAN', 'Manchukuo'], ['MON', 'Mongolia']
	];
	const presets = {
		tech: ['infantry_weapons', 'infantry_weapons1', 'gwtank_chassis', 'basic_small_airframe', 'electronics', 'industry', 'construction1', 'excavation1'],
		techcat: ['industry', 'electronics', 'construction_tech', 'infantry_weapons', 'armor', 'artillery', 'land_doctrine', 'naval_doctrine', 'air_doctrine'],
		equipment: ['infantry_equipment_1', 'support_equipment_1', 'artillery_equipment_1', 'anti_tank_equipment_1', 'anti_air_equipment_1', 'motorized_equipment_1', 'armored_car_equipment_1', 'small_plane_airframe_1', 'convoy_1']
	};

	/* ---------- lookups ---------- */
	const effectMap = {}; effects.forEach((e) => { effectMap[e.id] = e; });
	const triggerMap = {}; triggers.forEach((e) => { triggerMap[e.id] = e; });
	const recipeMap = {}; recipes.forEach((e) => { recipeMap[e.id] = e; });

	FB.catalog = {
		effects, triggers, recipes, effectMap, triggerMap, recipeMap, icons, filters, tags, presets, CAT,
		helpers: { N, PCT, Q, ID, TAG, YN },
		def(kind, type) { return (kind === 'effect' ? effectMap : triggerMap)[type] || null; },
		defaults(def) { const p = {}; def.params.forEach((q) => { p[q.key] = q.def; }); return p; },
		/** Params that are required but empty. */
		missing(def, p) {
			return def.params.filter((q) => q.req && (p[q.key] === '' || p[q.key] == null || (typeof p[q.key] === 'string' && !p[q.key].trim())));
		}
	};
})(window.FB = window.FB || {});
