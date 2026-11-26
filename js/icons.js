/* Focus Builder - small inline SVG icon set (24x24, stroke based, inherits the text colour) */
(function (FB) {
	'use strict';
	const I = {
		plus: '<path d="M12 5v14M5 12h14"/>',
		minus: '<path d="M5 12h14"/>',
		x: '<path d="M6 6l12 12M18 6L6 18"/>',
		check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
		trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
		copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
		link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
		search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
		folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
		save: '<path d="M5 4h11l4 4v12H5zM8 4v5h7V4M8 20v-6h8v6"/>',
		undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
		redo: '<path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"/>',
		help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1 1-1.1 1.8M12 17h.01"/>',
		download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
		upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
		clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
		gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M12 9v11M4 13h16M12 9c-2 0-4-1-4-2.5S10 4 12 6c2-2 4-.5 4 .5S14 9 12 9z"/>',
		shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
		users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3.5 3.5 0 0 1 0 6.5M18 14c2 .8 3 2.8 3 6"/>',
		factory: '<path d="M3 21h18M5 21V11l5 3v-3l5 3V5h4v16"/>',
		flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M7.5 15h9"/>',
		sword: '<path d="M5 19L19 5M15 5h4v4M8 13l3 3M4 20l2-2"/>',
		crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
		flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
		landmark: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
		map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
		bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
		scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M9 9h7M9 13h7M9 17h4"/>',
		code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
		sparkles: '<path d="M11 3l1.8 4.6L17.5 9l-4.7 1.4L11 15l-1.8-4.6L4.5 9l4.7-1.4zM19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
		star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
		tank: '<rect x="3" y="14" width="18" height="5" rx="2.5"/><path d="M7 14v-3h8l2 3M11 11V8.5h9"/>',
		ship: '<path d="M3 16l2 4h14l2-4zM6 16v-5h12v5M9 11V7h6v4M12 7V3"/>',
		plane: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
		layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
		'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
		'chevron-right': '<path d="M9 6l6 6-6 6"/>',
		'chevron-down': '<path d="M6 9l6 6 6-6"/>',
		'panel-left': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
		'panel-right': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
		maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
		alert: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>',
		info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
		list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
		tag: '<path d="M3 12V4h8l10 10-8 8zM7.5 7.5h.01"/>',
		hash: '<path d="M5 9h15M4 15h15M10 3L8 21M16 3l-2 18"/>',
		bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
		scale: '<path d="M12 3v18M6 21h12M5 7h14M5 7l-3 8a4 4 0 0 0 6 0zM19 7l-3 8a4 4 0 0 0 6 0z"/>',
		database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
		tree: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11a6 6 0 0 1-6 6H8"/>',
		wrench: '<path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.6-.6-.6-2.6z"/>',
		sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>',
		globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
		cog: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
		eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
		arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
		arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
		image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
		arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
		arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
		sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
		anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 12H3a9 9 0 0 0 18 0h-2M8 11h8"/>'
	};
	FB.icons = I;
	/** FB.icon('factory', 16) -> <span class="ic"><svg…/></span> */
	FB.icon = function (name, size, cls) {
		const s = document.createElement('span');
		s.className = 'ic' + (cls ? ' ' + cls : '');
		const n = size || 16;
		s.innerHTML = `<svg viewBox="0 0 24 24" width="${n}" height="${n}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || I.info}</svg>`;
		return s;
	};
	/** Icon for a reward / condition category (used on cards, menus and canvas nodes). */
	const CAT_ICON = {
		'Politics & stability': 'landmark', 'Industry & economy': 'factory', 'Research': 'flask', 'Military': 'shield', 'War & diplomacy': 'crosshair',
		'Territory': 'map', 'Ideas & events': 'bulb', 'Flags & variables': 'flag', 'Advanced': 'code', 'Quick recipes': 'sparkles',
		'Focuses & flags': 'flag', 'Time': 'clock', 'Resources': 'coins', 'War & politics': 'crosshair', 'Other': 'info'
	};
	CAT_ICON.Resources = 'database';
	FB.catIcon = (cat) => CAT_ICON[cat] || 'info';
	/** Colours per category so cards and menus are easy to tell apart at a glance. */
	const CAT_COLOR = {
		'Politics & stability': '#6f9bef', 'Industry & economy': '#e3a24a', 'Research': '#47c9d8', 'Military': '#8fb06a', 'War & diplomacy': '#e5604d',
		'Territory': '#c58be8', 'Ideas & events': '#e6c75a', 'Flags & variables': '#9aa7b3', 'Advanced': '#8e98a3', 'Quick recipes': '#c8a951'
	};
	FB.catColor = (cat) => CAT_COLOR[cat] || '#8e98a3';
	/** Glyph for a focus filter tag (stripe + node icon). */
	FB.filterIcon = (id) => ({ FOCUS_FILTER_POLITICAL: 'landmark', FOCUS_FILTER_RESEARCH: 'flask', FOCUS_FILTER_INDUSTRY: 'factory', FOCUS_FILTER_STABILITY: 'scale',
		FOCUS_FILTER_WAR_SUPPORT: 'bolt', FOCUS_FILTER_MANPOWER: 'users', FOCUS_FILTER_ANNEXATION: 'crosshair', FOCUS_FILTER_MILITARY_EQUIPMENT: 'shield',
		FOCUS_FILTER_ARMY_XP: 'sword', FOCUS_FILTER_NAVY_XP: 'anchor', FOCUS_FILTER_AIR_XP: 'plane' }[id] || 'star');
})(window.FB = window.FB || {});
