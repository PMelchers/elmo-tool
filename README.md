# Elmo tool (Focus Builder)

Build Hearts of Iron IV focus trees visually, without writing code, and export them so Claude can import them into your mod.

## Start

Double-click **Elmo tool.bat** (or the *Elmo tool* shortcut on the desktop). It opens the app in its own window using Edge or Chrome. Nothing to install, works offline. You can also just open `index.html` in a browser. Your work is saved automatically in the browser; use **Save** to keep a `.json` project file and **Open** to load it again.

## Using it

1. **Project tab**: enter your country tag (e.g. `GER`) and a tree name.
2. **Canvas**: double-click to place a focus, drag to move, drag the dot under a focus onto another to link them ("this needs that"). Right-click for more options.
3. **Right panel**: name, description, duration in **weeks**, icon, prerequisites, "cannot be taken together with", extra requirements and **rewards**.
   - Rewards autocomplete: type `stability`, `factory`, `war`, `event`â€¦ and pick from the list. Every entry explains itself in plain English and has form fields (percent, state, country tag, â€¦).
   - Not in the list? Choose **Describe it in plain words** and Claude writes the code.
4. **Things to create**: describe national spirits, events and decisions your rewards use, in plain words.
5. **Export for Claude**: copy everything as one message, save straight into your mod folder (Chrome/Edge), or download a ZIP.

## What the export contains

| File | Purpose |
|---|---|
| `common/national_focus/<tree>.txt` | The focus tree in HOI4 script |
| `localisation/english/<tree>_l_english.yml` | Names and descriptions (UTF-8 with BOM) |
| `FocusBuilder_export/FOCUS_BRIEF_FOR_CLAUDE.md` | Full briefing: what to do, targets, per-focus intent, plain-language TODOs, things to define, validation results, HOI4 rules |
| `FocusBuilder_export/focus_project.json` | Re-openable project file |

Unfinished fields are written as `# INCOMPLETE â€¦` comments and plain-language rewards as `# CLAUDE-TODO â€¦`, so nothing silently breaks.

## Layout

```
index.html        page
css/app.css       styling
js/catalog.js     rewards, conditions, icons (add new HOI4 effects here)
js/model.js       project data, undo/redo, validation, auto-layout
js/codegen.js     HOI4 script, localisation, Claude briefing
js/widgets.js     autocomplete and form widgets
js/canvas.js      tree canvas
js/app.js         panels, inspector, export dialog
```

To add a reward, append an `fx({...})` entry to `js/catalog.js`: label, plain-English description, keywords for search, parameters, and a `code(p)` function.

Notes: effect names follow current HOI4 (1.16). Icon names are common vanilla `GFX_goal_*` sprites; the briefing tells Claude to verify them.

## Working on a whole mod

Press **Open mod folder** (top-left) and pick the mod's root folder (the one containing `common/` and `localisation/`).

- Every focus tree in `common/national_focus` is listed in the **tree switcher**, grouped by country tag. Use the arrows or search to jump between countries. A dot marks trees you edited.
- Edit any tree as usual. Edits stay in memory when you switch trees.
- **Save to mod** (or Ctrl+S) writes only the edited `focus_tree` blocks back into their original files. Comments and other trees in the same file are left alone. Changed names/descriptions are updated in the existing localisation files (new ones go to `localisation/english/<tree>_l_english.yml`).
- Before anything is overwritten, the originals are copied to `FocusBuilder_backups/<timestamp>/` inside the mod folder.
- Focus Builder remembers the last folder; use **Reopen** to grant access again.

## Changelog

The **Changes** tab lists everything you changed in this version, in plain language (added/removed focuses, renamed, new durations, rewards added/removed/edited, moved focuses, …). When you save, a version is appended to `FocusBuilder_changelog.md` in the mod folder (newest first, with your notes). Without a mod folder, **Log this version** records it in the project and downloads `CHANGELOG.md`. The current changes are also included in the briefing for Claude.

## Tests

`tests/mock_mod.js` provides an in-memory mod folder for trying the workspace without touching real files (see the comment at the top).

Logo: `python tools/make_logo.py` rebuilds `assets/logo.png` (transparent background) and `assets/icon.ico` from `assets/logo_source.png`.

## Helper for mods the browser will not open (Steam workshop, Program Files)

Chrome and Edge refuse to open folders under `Program Files`, which includes Steam's workshop folder. So **Elmo tool.bat** also starts a tiny helper (`server.py`, needs Python, standard library only) and opens the app from it. With the helper:

- **Open a mod…** lists the HOI4 mods it finds (your `Documents\Paradox Interactive\Hearts of Iron IV\mod` folder and every Steam library's workshop folder) with the number of focus files. Click one, or use **Browse for a folder…**, or paste a path.
- Backups of overwritten files go to `Documents\Focus Builder backups\<mod name>\<time>\`, so nothing extra lands inside a workshop mod. The changelog stays in the mod folder as `FocusBuilder_changelog.md`.
- Steam overwrites workshop mods when they update. Edit your own developer copy, or a copy of someone else's mod.

How it stays safe: it only listens on `127.0.0.1`, every request needs a secret token that only the page it serves receives, Host/Origin are checked, only folders you open are readable, and only `.txt .yml .yaml .md .json .mod` files inside them are writable. It shuts itself down a few minutes after you close the app.

Without Python the app still works from `index.html`, using the browser's own folder picker (no Program Files).

## Designer (tanks and ships)

The **Designer** button (top bar) opens a simulator built from the real game data. With the helper it reads the base game's `common/units/equipment` (chassis, hulls and all modules) plus the open mod, so mods with changed numbers just work.

- Pick a chassis/hull and a generation, choose a module per slot (only modules that fit are listed), and watch the stats change against the default build. Required slots and module limits (e.g. "max 1 auto loader") are checked.
- Save designs, then **compare** two designs side by side. Tanks also get a head-on damage estimate (soft/hard attack against hardness, piercing against armor); ships and aircraft get per-100-IC figures.
- Stats are calculated as `(chassis + modules x chassis module multiplier) x (1 + module percentages)`. That is reconstructed from the data files, so treat it as an estimate: the game may round or cap values differently.

## Templates and Guides

The top bar switches between **Trees, Designer, Templates and Guides**.

- **Templates**: build a division layout with the 5x5 battalion grid and 5 support company slots. Units come from the base game (via the helper) and the open mod; a built-in list is used otherwise. Left-click a cell to choose a unit, right-click to clear it, the `+` beside a row or column fills it. No stats are shown, only the layout. Templates are saved in the browser and can be exported/imported as JSON.
- **Guides**: write a guide for one nation. Each guide has five tabs: **Focus order** (pick focuses from a tree, reorder them, add headings and notes), **Tank design** and **Ship design** (add designs you saved in the Designer), **Templates** (add saved division templates) and **Explanation** (free text sections with `# heading`, `- list`, `**bold**`). Designs and templates are copied into the guide, so later edits do not change it.
- Export a guide as a web page, Markdown, Steam/forum BBCode (copied to the clipboard) or a `.guide.json` file you can import again.

## Military Industrial Organizations (MIOs)

Opening a mod also lists its MIOs (`common/military_industrial_organization/organizations`) in the tree switcher, under "MIO · <country>". Each trait is a node: drag to move, link to set parents, and edit bonuses (equipment, production, organization modifiers) with autocomplete. Traits inherited through `include = generic_..._organization` live in the template file, so only traits written in the organization's own file appear.

## Saving changes into existing files

Saving edits files in place. Focuses and traits you did not touch keep their exact original text, formatting and comments. Only changed ones are rewritten, new ones are appended to the tree, and deleted ones are removed. If you change a tree's header (country tag, id, MIO settings) that tree is regenerated instead. Saving starts the undo history over.

## Interface

- **Room to work:** the side panels are wide by default, can be resized by dragging their edges, and can be hidden with the panel buttons at the top-left of the canvas (your layout is remembered).
- **Clear fields:** every field has a label with an icon, a hint underneath, required fields are marked, and units are shown (weeks, %).
- **Autocomplete everywhere:** rewards, conditions, country tags, states, technologies, ideas, decisions, events from your mod, and the real focus/MIO icon names are suggested as you type. Results are marked with icons and categories, the search term is highlighted, things you use often come first, and you choose with Enter or Tab. Names are shown next to ids (GER = Germany, 64 = Brandenburg). With the helper the data comes from the base game plus your mod; without it only from the open mod.

### Nation-specific tanks and the module lab

- Mods often define national chassis (e.g. `ger_medium_tank_chassis_p3`) with their own module slots. These are listed under their chassis family, with a **nation filter** (All / Generic / one nation) above the variant list. Slots marked `inherit` take the definition of the generic chassis.
- **Module lab:** the sliders button next to a slot lets you change the numbers of that module (flat adds, percentages, averages). *Apply to this module* changes it in every design (shown with a pencil, *Reset to original* undoes it); *Save as a new test module* keeps the original and makes a named copy (shown with a star). *New test module* in the sidebar starts a blank or copied one.
- Test modules and tweaks are remembered in the browser. *Copy as HOI4 code* gives the `equipment_modules` block (plus a localisation line) to paste into a mod.
- Aircraft are not supported.

### Designer window

The Designer is laid out like the in-game designer (own artwork, no game assets): a steel window with a title bar, slot buttons with tier numerals (I, II, III...), a blue blueprint drawing of the chassis or hull that changes with your guns, parchment stat panels (Base / Combat / Misc), a model panel, and a bottom bar with Reset, Save, Designs, Module lab, Compare and the production cost. Click a slot to open its module list (search, stats per module, and a sliders button to change a module's numbers). Hover a stat to see how it is built up.

Guns depend on the turret: a module can unlock extra module categories in another slot (a bigger turret unlocks bigger main guns, exactly like in the game). The module list of a slot therefore changes with your other choices, and modules that no longer fit are cleared automatically.

### Stat overview and the engine / armor dials

- The parchment overview lists every stat of the in-game overview in the game's order (Base / Combat / Misc), including zeros. Three values (Supply use, Suppression, Organization) are calculated by the game itself and are not in the equipment files, so they show a dash.
- Tanks have **Engine** and **Armor** dials (1 to 10, level 5 is neutral). The game computes these in its own code, so the effect of one step is an editable assumption: use **Dial effects** to change the percentage per step for each stat (defaults are my guesses, not game values).

In a slot's module list, modules that need another module first (a heavy gun needs a heavy turret) are shown under "Needs another module", with the module they need. Clicking one sets both, so you never have to guess which turret unlocks which gun.

### Game icons in the Designer

With the helper running, the Designer shows the game's own module icons (read from `interface/*.gfx` of the base game and the open mod, converted from `.dds` to PNG by the helper, which needs Pillow: `pip install pillow`). Modules the game has no picture for borrow one from the same category; without the helper the drawn icons stay.

## Normal mode and Development mode

The switch in the top bar (**Normal | Development**) decides what the app lets you do. **Normal mode is the default**: you can open a mod, switch trees, search, read a focus and use the Designer, Templates and Guides, but nothing that edits the mod is shown (no New/Import/Open/Save/Export, no adding, moving or deleting focuses, no editing in the side panel, no Module lab). **Development mode** turns all the editing tools on. The choice is remembered in the browser, and edits you made are kept when you switch back to Normal.

### Focus pictures and guide order on the tree

With the helper running, every focus on the tree shows its real picture (`GFX_goal_…` / `GFX_focus_…` from the base game and the open mod). The guide focus picker shows them too. To see a guide's order on the tree, press **Show order on the tree** in the guide's Focus order tab, or pick the guide in the selector above the tree. Each focus then gets its step number.

### Pictures in a guide

The **Images** tab of a guide takes screenshots and other pictures: click **Add pictures** or drop files on the tab. Give each one a title and an optional caption, and drag a picture (or use the arrows) to change the order. Pictures are kept in the browser's IndexedDB (big ones are scaled down to 1920 px). They are included in the web page export and in the `.json` guide files, so importing a guide brings its pictures along.

## Guide marketplace

**Guides → Marketplace** shows guides other players shared. Search, filter by nation and press **Add to my guides** to download one (pictures, designs and templates come along).

The marketplace is a public GitHub repository, so it needs no server or account to browse:

- **Set it up once:** the folder `marketplace-repo/` is a ready-made repository (guides folder, `index.json`, and a GitHub Action that rebuilds the index). Follow `marketplace-repo/README.md`, then put the repository name in `js/market-config.js`. Every copy of Elmo tool you hand out then opens that marketplace. Users can also pick another repository under the marketplace settings (gear button).
- **Publishing:** **Publish a guide** downloads the guide file and opens the repository's GitHub upload page. The author drags the file in and opens a pull request (free GitHub account needed); the owner merges it and the guide appears for everyone.

## Sharing Elmo tool and publishing updates

The app is shared from the public GitHub repository **PMelchers/elmo-tool** (`update.json` names it). People download it with the **Share** button's link; their copy checks that repository at every start and shows **Update ready** when there is something new.

To publish a new version (this folder keeps the full development history; the public repository gets clean copies):

1. Commit your changes here.
2. Run `python tools/publish.py "What changed"` — it copies the committed files into `Documents/GitHub/elmo-tool` and commits there.
3. In GitHub Desktop, open **elmo-tool** and press **Push origin**.

The guide marketplace lives in **PMelchers/elmo-guides** (the files from `marketplace-repo/`).
