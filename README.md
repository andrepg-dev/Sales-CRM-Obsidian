# Sales CRM (Obsidian plugin)

A lightweight sales CRM that lives inside your Obsidian vault, built around two
methodologies:

- **The Mom Test** — capture *facts* about a prospect's life, flag *bad data*
  (compliments, fluff, hypotheticals), and only count *real commitments*
  (time, money, reputation).
- **Traction** — one metric that matters (conversations per week), a pipeline,
  and a weekly review with a funnel and the week's learnings.

It's a working implementation of the `Sales CRM Options` design prototype: the
hardcoded mockup screens are now backed by a real data store you can edit.

## Screens

| Screen | What it does |
| --- | --- |
| **Dashboard** | Weekly stats, 8-week contacts chart vs. goal, up-next list, latest learning |
| **Contacts** | Card / table toggle, search, status badges, per-contact "learned" note |
| **Contact detail** | Conversation timeline, status control, next step, the type's big-question coverage, Mom Test reminder |
| **Pipeline** | Kanban (to contact → in conversation → won / lost), drag cards between stages; won/lost keep their lesson |
| **Weekly review** | Week navigation, funnel, top learnings, editable weekly goal |
| **Person types** | Each type keeps its list of "3 big questions" with answer coverage |

Logging a conversation is where the Mom Test capture happens: mark which of the
type's big questions got answered, record facts, tag commitments and bad-data,
and set the outcome. The contact's summary, status and metrics update from it.

## Data

All data lives in this plugin's `data.json` inside the vault
(`.obsidian/plugins/sales-crm/data.json`) via Obsidian's `saveData`. Nothing
leaves your machine.

- Command **"Reset to demo data"** restores the built-in example dataset.
- First launch seeds the demo dataset so there's something to explore.

## Usage

- Ribbon icon (people) or command **"Open Sales CRM"** opens the view.
- Command **"New contact"** adds a contact from anywhere.

## Development

```bash
npm install
npm run dev     # esbuild watch → main.js
npm run build   # typecheck + minified production bundle
```

Source layout:

```
src/
  types.ts          domain model + display metadata
  seed.ts           demo dataset (mirrors the prototype)
  store.ts          in-memory store: CRUD, selectors, persistence, change events
  view.ts           ItemView: top nav + routing between screens
  ui/               one render function per screen (pure DOM, no framework)
  modals/           contact editor, conversation logger, person-type editor
  util/             date helpers + DOM helpers
main.js             bundled output loaded by Obsidian (generated)
styles.css          self-contained styling (prototype aesthetic)
```
