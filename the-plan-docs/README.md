# The Plan — repository seed

Start by giving BUILD_PROMPT.md to the coding agent as its opening instruction. It references the documents in docs/ by these paths:

- docs/the_plan_v2_generic.md — the instrument design (validated layers + adaptive color layer)
- docs/app_flow.html — the decision tree and screen flow (open in a browser)
- docs/question_inventory.md — every question the system asks; the source for config/color_modules/*.json
- docs/square_one.md — the single-user screening mode
- docs/instrument_acquisition.md — how to obtain each validated instrument and populate config/instruments/*.json
- docs/research_brief.md — the literature-review brief for the validation study

Keep this repository private. The validated instruments' item text goes in config/instruments/ after you obtain it from each source; it is not included here.
