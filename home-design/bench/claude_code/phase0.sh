#!/usr/bin/env bash
# Phase 0 Claude runs on the Claude plan (headless Claude Code). Safe to rerun: every
# runner resumes where it stopped. Logs go to runs/phase0-*.log.
#   1. Judge the Gemma 4 31B IFC-Bench answers with Opus 5.5.
#   2. Sonnet 5.5 on the IFC-Bench fixed 514-question split.
#   3. Sonnet 5.5 on the 18-task stratified BIM-Edit subset.
#   4. Judge the Sonnet IFC-Bench answers with Opus 5.5.
set -u
cd "$(dirname "$0")/../.."
PY=.venv/bin/python
$PY -m bench.claude_code.judge --run-id gemma4-31b --judge-model claude-opus-5-5 --workers 3 \
  >> runs/phase0-judge-gemma.log 2>&1 &
J1=$!
$PY -m bench.claude_code.run_ifc_bench --model claude-sonnet-5-5 --run-id cc-sonnet55 --workers 2 \
  >> runs/phase0-ifcb-sonnet.log 2>&1 &
R1=$!
$PY -m bench.claude_code.run_bim_edit --model claude-sonnet-5-5 --run-id cc-sonnet55-cell1 --per-cell 1 --workers 1 \
  >> runs/phase0-bimedit-sonnet.log 2>&1 &
R2=$!
wait $R1
$PY -m bench.claude_code.judge --run-id cc-sonnet55 --judge-model claude-opus-5-5 --workers 3 \
  >> runs/phase0-judge-sonnet.log 2>&1
wait $J1 $R2
$PY -m bench.ifc_bench.score --run-id gemma4-31b --judge-model cc-claude-opus-5-5 > runs/phase0-score-gemma.json 2>&1
$PY -m bench.ifc_bench.score --run-id cc-sonnet55 --judge-model cc-claude-opus-5-5 > runs/phase0-score-sonnet.json 2>&1
echo PHASE0_DONE >> runs/phase0-bimedit-sonnet.log
