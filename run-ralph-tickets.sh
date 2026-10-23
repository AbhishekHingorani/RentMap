#!/bin/bash
# Ralph Wiggum loop over mattpocock tickets.
#
# Unlike run-ralph-goal.sh (one long `claude -p "/goal ..."` session that keeps
# working turn-after-turn inside ONE context), this is a real bash loop: one
# `claude -p "/implement ..."` invocation per ticket, so every ticket starts in a
# FRESH context window. That is the whole point — the mattpocock `/to-tickets`
# skill sizes each ticket to fit exactly one fresh context, and this loop honours
# that sizing instead of fighting it.
#
# Division of labour:
#   bash  — picks the ticket, manages branches, writes ticket status, verifies a
#           commit landed, decides when to stop. All deterministic, zero tokens.
#   claude— implements exactly one ticket via /implement (which internally uses
#           /tdd and /code-review, and commits to the CURRENT branch).
#
# A run takes a QUEUE of feature folders, not one. Answer the opening question
# with "[1,3]" and feature 1 is taken to its end before feature 3 begins; each
# gets its own branch, cut from where the one before it stopped. Anything that
# ends a run early — a failed ticket, the usage limit, you — ends the queue as
# well, and the features after it are left untouched rather than skipped past.
#
# --only narrows one board to the tickets you name: --only 1,3,5 or --only 2-10
# or a mix. It filters what may be picked and loosens no rule, so a ticket in the
# set still waits for its blockers. Use it where --max will not do: --max is a
# count, so a ticket that fails or gets skipped frees a slot and the run walks
# further down the board than you meant it to. --only draws the line by number
# instead, and a set whose blockers can never complete is refused before the run
# starts rather than quietly doing less than asked.
#
# --order sequences one board instead of narrowing it: --order 11,1,2 runs 11
# first, then 1, then 2, then everything it did not name in number order. It is
# for a board whose first ticket is not its lowest number, which is the usual
# shape once one ticket is the instrument every other ticket is measured through.
# Blockers still win, so a ticket put first that is not eligible waits its turn
# and the next one in the order goes.
#
# Reports: every feature writes a summary.md the moment it stops, and the run
# writes a run-summary.md over the top of them. Each ticket gets a line saying
# what it did (its own commit subjects), how long it took, what it cost and how
# many tokens it burned. The per-feature file is written BEFORE the next feature
# starts, so a queue left running overnight is a stack of finished reports in
# the morning even if the run died somewhere in the middle of it.
#
# Interruptions: three things end a run without any ticket being at fault — the
# network dropping, the machine sleeping, and you deciding to stop. All three now
# park the current ticket the same way: its work is committed as wip(NN) and its
# status stays `in-progress`, which is the status the picker takes FIRST and the
# prompt resumes from. `blocked` is kept for what it means, work a human must
# look at. Stop a run from anywhere with `touch .ralph-stop`; it lands within
# seconds, mid-ticket. Ctrl-C and `kill` do the same.
#
# Visibility: streams Claude's events live to the terminal AND to per-ticket JSONL
# logs under ./logs/. Tail a run live from another shell:
#   tail -f logs/ralph-tickets-*/ticket-*.jsonl | jq -r .
#
# One thing is deliberately NOT live: the 🏁 summary. A ticket can report several
# `result` events (background agents from /code-review wake the session back up),
# and their durations, costs and token counts each mean something different, so
# the summary is assembled and printed once at the end. See pretty() below.
set -euo pipefail

# --- Config ------------------------------------------------------------------
# Where the feature folders live. Each one holds a spec.md and its tickets, and
# the picker below turns a choice of folder into both paths at once.
SCRATCH_ROOT=".scratch"
ISSUES_DIR=""            # the feature running RIGHT NOW; set per feature by the driver
ISSUES_DIR_ARG=""        # --issues-dir: one path, or several separated by commas
SPEC_HINT=""             # empty = derived from ISSUES_DIR
SPEC_OVERRIDE=""         # --spec: only legal when one feature is queued
LOG_ROOT="logs"
MAX_TICKETS=0            # 0 = no limit, counted across the whole run
ONLY_ARG=""              # --only: raw spec as typed, empty = every ticket
ONLY_SET=""              # " 01 03 05 ", space-fenced for substring tests
ONLY_LIST=""             # "01 03 05", the same set for printing
ORDER_ARG=""             # --order: raw spec as typed, empty = board order
ORDER_LIST=""            # "11 01 02", the same numbers in the order they run

# The queue. One entry per feature folder chosen, in the order they run. A
# feature is taken to its end before the next one starts, and anything that
# stops a run (a failure, the usage limit, you) stops the queue too — the
# features after it are left untouched, not skipped past.
FEATURE_DIRS=()

# Branches nobody should be committing agent output onto directly. In the default
# branch mode the script cuts a feature branch off whichever of these you are on,
# so this list is a nudge, not a wall — --current-branch --allow-protected opts out.
PROTECTED_BRANCHES="develop main master"

# --- Flags -------------------------------------------------------------------
BRANCH_MODE="new"        # new | current | per-ticket
BRANCH_MODE_PICKED=0     # 1 once the mode is final (flag, or the picker below)
NEW_BRANCH=""            # `new` mode: the branch this feature's tickets commit to
NEW_BRANCH_EXPLICIT=0    # 1 if a name was typed, which pins ALL features to it
BASE_REF=""              # what a created branch is cut from (default: current HEAD)
DRY_RUN=0
ASSUME_YES=0
ALLOW_PROTECTED=0
ALLOW_DIRTY=0
BASELINE_DIRTY=""        # tmp file: porcelain lines that were already dirty at start
WAIT_FOR_RESET=0         # on quota exhaustion: sleep until it resets, or stop?
# Don't START a ticket once utilization is at least this. 0.9 is the *floor* that
# means anything: verified across every transcript in logs/, the CLI emits no
# rate_limit_event below 0.9 (surpassedThreshold is always 0.9), so utilization
# is simply unknown until then and any ceiling <= 0.9 behaves identically —
# "stop at the first warning". Raise it (0.95) to push further into the window.
QUOTA_CEILING=0.9
NO_WIP_COMMIT=0          # keep a failed ticket's partial work out of git
KEEP_GOING=0             # on a genuine failure: skip to the next eligible ticket
# Model every ticket's session runs on. Empty = whatever `claude` would pick on
# its own (your settings.json / `/model`), i.e. no --model flag is passed at all.
# Set by --model, or chosen from the picker just before the confirmation prompt.
MODEL=""

# --- Fault tolerance ---------------------------------------------------------
# A run can be interrupted by three things that are NOT the ticket's fault: the
# network dropping, the laptop sleeping, and you deciding to stop it. None of
# them means "a human must look at this ticket", so none of them may mark a
# ticket `blocked` — that status is reserved for work that actually went wrong.
#
# The file you touch to stop the loop from another shell (or from a script, or
# over ssh). Checked before each ticket AND every few seconds during one, so a
# stop lands within seconds rather than at the end of a 20-minute ticket.
STOP_FILE=".ralph-stop"
STOP_POLL=5              # seconds between stop-file checks while a ticket runs
# Host the network probe talks to. A plain HTTPS request: any HTTP status at all
# means the link is up, so no key is sent and nothing is charged.
NET_PROBE_URL="https://api.anthropic.com/v1/models"
NET_CHECK=1              # probe before each ticket, and wait when the link is down
NET_WAIT_MAX=0           # 0 = wait as long as it takes for the link to return
NET_RETRIES=3            # attempts at the SAME ticket after an API outage
MAX_CONSEC_FAILS=3       # genuine failures in a row before the run gives up
CAFFEINATE=1             # macOS: hold off idle sleep while the loop runs

usage() {
  cat <<'EOF'
Usage: run-ralph-tickets.sh [options]

Runs the tickets of one feature folder after another. The opening question takes
a list — "[1,3]", "1,3" and "1 3" all mean run 1 to its end, then run 3 — and
each feature writes a summary.md of what it did, what it took and what it cost.

Branching (pick one). Pass none of these and you are asked to choose before the
confirmation prompt; under -y/--yes, or with stdin not a terminal, --new-branch
is used:
  --new-branch [name]        Cut ONE new branch and commit every ticket onto it.
                             [default]  Without a name, one is derived from the
                             issues dir, e.g. feat/dynamic-workflow-canvas — so
                             a queue of several features gets a branch each,
                             every one cut from the previous feature's tip.
                             Give a name and ALL of them commit onto that one.
                             If the branch already exists it is reused, so a
                             re-run after a failure continues where it stopped.
  --current-branch           Commit every ticket on the branch already checked
                             out. Refuses on develop/main/master unless you also
                             pass --allow-protected.
  --branch-per-ticket        A branch per ticket, STACKED: each is cut from the
                             previous ticket's tip, so a ticket blocked by an
                             earlier one actually contains its code.
                             Branch name: ticket/<NN>-<slug>, which does not
                             carry the feature — queue two features whose
                             ticket 01 has the same slug and the second reuses
                             the first's branch and stacks on top of it.

  --base <ref>               What a created branch is cut from. Default: whatever
                             is checked out now. With --branch-per-ticket this
                             un-stacks them (every ticket cut from <ref>) — only
                             safe when the tickets have no blocking edges between
                             them, otherwise a dependent ticket starts on a tree
                             without its blocker's code.
  --allow-protected          Permit --current-branch on develop/main/master.
  --allow-dirty              Start with uncommitted work in the tree. Those exact
                             paths are snapshotted and ignored for the rest of the
                             run; anything NEW left uncommitted still fails the
                             ticket. Note the changes ride along onto whatever
                             branch is created — they are not stashed.

Quota (Claude usage limits):
  --wait-for-reset           When the usage limit is hit or nearly hit, sleep
                             until it resets and carry on, instead of stopping.
                             Use this for long unattended runs.
  --quota-ceiling <0..1>     Do not START another ticket once utilization has
                             reached this.  [default: 0.9]  A ticket killed
                             mid-flight strands uncommitted work, so it is
                             cheaper to stop between tickets than inside one.
                             NOTE: the CLI reports no utilization at all below
                             0.9, so any value <= 0.9 means "stop at the first
                             warning" and below 0.9 there is nothing to see.
                             Set to 1 to disable the pre-emptive stop.
  --keep-going               On a genuine failure, mark the ticket blocked and
                             carry on with the next eligible one instead of
                             stopping the whole run. Tickets that depend on the
                             failed one stay blocked and are skipped too. Use
                             for unattended overnight runs; review the blocked
                             tickets in the morning.
  --no-wip-commit            Do not commit a failed ticket's partial work. By
                             default that work is committed as a `wip(NN):`
                             commit so nothing is stranded in the working tree.

Interruptions (network, sleep, you):
  --stop-file <path>         Touch this file to stop the loop.  [default:
                             .ralph-stop]  It is checked before each ticket and
                             every few seconds during one, so a running ticket
                             is stopped within seconds. Its work is committed as
                             wip(NN) and the ticket is left in-progress, so the
                             next run resumes it rather than restarting it.
                             Ctrl-C and `kill` do the same thing.
  --no-network-check         Do not probe the API before starting a ticket, and
                             do not wait for the link to come back. Without this
                             the loop refuses to start a ticket while the network
                             is down, which is what stops a whole backlog burning
                             through in seconds during an outage.
  --network-wait <sec>       Give up if the link has not returned within this
                             many seconds.  [default: 0 = wait indefinitely]
                             Indefinite is the right default for an overnight
                             run: a sleeping laptop makes elapsed time meaningless.
  --network-retries <n>      Attempts at the SAME ticket after the API becomes
                             unreachable mid-flight.  [default: 3]  Each one is a
                             fresh session that resumes from the wip commit.
  --max-consecutive-failures <n>
                             Stop after n genuine failures in a row, even under
                             --keep-going.  [default: 3]  0 disables it. This is
                             what stops one broken assumption from marking every
                             remaining ticket blocked while you sleep.
  --no-caffeinate            macOS only: do not hold off idle sleep. By default
                             the loop keeps the machine awake while it runs.
                             Closing the lid still sleeps the machine — that is
                             the OS, not this script — but the loop survives it:
                             on wake the dropped connection reads as an API
                             outage and the current ticket is retried.

Other:
  --model <name>             Model every ticket runs on, e.g. opus, opus[1m],
                             sonnet, haiku, or a full id like claude-opus-5-5.
                             Skips the interactive picker. Omit it and you are
                             asked to choose from a list before confirming;
                             omit it under -y/--yes and the run inherits
                             whatever model `claude` would pick on its own.
  --issues-dir <paths>       Feature folder or ticket directory, or several of
                             either separated by commas.
                             Several run one after the other, each taken to its
                             end before the next starts. Skips the interactive
                             feature picker. Omit it and you are asked to choose
                             from the folders under .scratch/, where the answer
                             may be one number or a list: [1,3] or 1,3 or 1 3.
                             The spec is derived from each ticket dir.
  --spec <path>              Spec file the prompt points tickets at. Only legal
                             when exactly one feature is queued.
                             [default: <feature>/spec.md]
  --scratch-root <path>      Where the feature folders live  [default: .scratch]
  --max <n>                  Stop after n tickets, counted across the whole
                             queue, not per feature  [default: unlimited]
  --only <list>              Run only these ticket numbers. Numbers, ranges or
                             both: 1,3,5 or 2-10 or 1,3,5-8. Brackets and
                             spaces are accepted too: [1,3] or "1 3".
                             Blockers are still enforced, so a ticket here whose
                             blocker is neither completed nor also listed is
                             refused up front rather than silently skipped.
                             Only legal when exactly one feature is queued.
                             --max still caps the count on top of this.
  --order <list>             Take these tickets first, in the order written:
                             --order 11,1,2,3 runs 11 before 1. Ranges work the
                             same way as --only. Every ticket it does not name
                             follows afterwards in number order, so naming one
                             is enough to move it to the front.
                             Blockers still win. A ticket named first whose
                             blocker is unfinished waits, and the next eligible
                             one in the order goes instead.
                             With --only, every number here must also be in
                             scope there, or the run is refused up front.
                             Only legal when exactly one feature is queued.
  --dry-run                  Print the plan and exit. Touches nothing.
  -y, --yes                  Skip the confirmation prompt (for unattended runs).
  -h, --help                 This message.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --new-branch)
      BRANCH_MODE="new"; BRANCH_MODE_PICKED=1
      # Optional value: consume the next arg only if it is not another flag.
      if [[ $# -ge 2 && "$2" != -* ]]; then NEW_BRANCH="$2"; NEW_BRANCH_EXPLICIT=1; shift 2; else shift; fi
      ;;
    --current-branch)    BRANCH_MODE="current";    BRANCH_MODE_PICKED=1; shift ;;
    --branch-per-ticket) BRANCH_MODE="per-ticket"; BRANCH_MODE_PICKED=1; shift ;;
    --base)              BASE_REF="${2:-}";        shift 2 ;;
    --allow-protected)   ALLOW_PROTECTED=1;        shift ;;
    --allow-dirty)       ALLOW_DIRTY=1;            shift ;;
    --wait-for-reset)    WAIT_FOR_RESET=1;         shift ;;
    --quota-ceiling)     QUOTA_CEILING="${2:-0.85}"; shift 2 ;;
    --no-wip-commit)     NO_WIP_COMMIT=1;          shift ;;
    --keep-going)        KEEP_GOING=1;             shift ;;
    --stop-file)         STOP_FILE="${2:-}";       shift 2 ;;
    --no-network-check)  NET_CHECK=0;              shift ;;
    --network-wait)      NET_WAIT_MAX="${2:-0}";   shift 2 ;;
    --network-retries)   NET_RETRIES="${2:-3}";    shift 2 ;;
    --max-consecutive-failures) MAX_CONSEC_FAILS="${2:-3}"; shift 2 ;;
    --no-caffeinate)     CAFFEINATE=0;             shift ;;
    --model)             MODEL="${2:-}";           shift 2 ;;
    --issues-dir)        ISSUES_DIR_ARG="${2:-}";  shift 2 ;;
    --spec)              SPEC_OVERRIDE="${2:-}";   shift 2 ;;
    --scratch-root)      SCRATCH_ROOT="${2:-}";    shift 2 ;;
    --max)               MAX_TICKETS="${2:-0}";    shift 2 ;;
    --only)              ONLY_ARG="${2:-}";        shift 2 ;;
    --order)             ORDER_ARG="${2:-}";       shift 2 ;;
    --dry-run)           DRY_RUN=1;                shift ;;
    -y|--yes)            ASSUME_YES=1;             shift ;;
    -h|--help)           usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

# --- --only ------------------------------------------------------------------
# The set of ticket numbers this run may take. Defined here, beside the arg loop
# that fills it, because everything downstream reads the parsed set and never
# the raw string.
#
# Written the way a ticket board is read out loud: "1, 3, 5" or "2-10" or a mix
# of the two. Brackets and spaces are tolerated because the feature picker
# already accepts "[1,3]" and one script should not want two spellings of a list.
#
# `10#` on every number is load-bearing. Ticket files are zero-padded, so the
# obvious `--only 08,09` would otherwise be read as octal and 08 is not a legal
# octal digit, which fails arithmetic rather than the ticket.
parse_only() {  # $1 = raw spec. Writes ONLY_SET and ONLY_LIST, or exits 1.
  local raw="$1" seg lo hi i out=""
  [[ -n "$raw" ]] || return 0
  raw="${raw//[/ }"; raw="${raw//]/ }"; raw="${raw//,/ }"; raw="${raw//;/ }"
  for seg in $raw; do
    if [[ "$seg" =~ ^([0-9]{1,2})-([0-9]{1,2})$ ]]; then
      lo=$((10#${BASH_REMATCH[1]})); hi=$((10#${BASH_REMATCH[2]}))
      if (( lo > hi )); then
        echo "--only: the range '$seg' counts backwards." >&2; exit 1
      fi
      for (( i = lo; i <= hi; i++ )); do out+=" $(printf '%02d' "$i")"; done
    elif [[ "$seg" =~ ^[0-9]{1,2}$ ]]; then
      out+=" $(printf '%02d' "$((10#$seg))")"
    else
      echo "--only: '$seg' is not a ticket number or a range." >&2
      echo "Write numbers, ranges, or both: 1,3,5 or 2-10 or 1,3,5-8." >&2
      exit 1
    fi
  done
  # Sorted and de-duplicated, so "--only 5,3,3-4" is the same run as "--only 3-5"
  # and the printed set reads in board order rather than in typing order.
  ONLY_LIST="$(printf '%s\n' $out | sort -n -u | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  if [[ -z "$ONLY_LIST" ]]; then
    echo "--only was given no ticket numbers." >&2; exit 1
  fi
  # Fenced with a space at each end so a substring test cannot match a digit
  # inside another number: " 1 " never matches inside " 11 12 ".
  ONLY_SET=" $ONLY_LIST "
}

in_only() {  # $1 = NN -> 0 when this ticket is in scope for this run
  [[ -z "$ONLY_SET" ]] && return 0
  [[ "$ONLY_SET" == *" $1 "* ]]
}

# --- --order -----------------------------------------------------------------
# The order the frontier walks the board in. Same spelling as --only, and one
# rule apart from it: the numbers are kept in the order they were typed rather
# than sorted, because the order IS the argument. Duplicates are dropped and the
# first mention of a number wins.
#
# It narrows nothing. A board of seventeen tickets with --order 11 still runs all
# seventeen; 11 simply goes first. Use --only to narrow and --order to sequence.
parse_order() {  # $1 = raw spec. Writes ORDER_LIST, or exits 1.
  local raw="$1" seg lo hi i out="" nn
  [[ -n "$raw" ]] || return 0
  raw="${raw//[/ }"; raw="${raw//]/ }"; raw="${raw//,/ }"; raw="${raw//;/ }"
  for seg in $raw; do
    if [[ "$seg" =~ ^([0-9]{1,2})-([0-9]{1,2})$ ]]; then
      lo=$((10#${BASH_REMATCH[1]})); hi=$((10#${BASH_REMATCH[2]}))
      if (( lo > hi )); then
        echo "--order: the range '$seg' counts backwards." >&2; exit 1
      fi
      for (( i = lo; i <= hi; i++ )); do
        nn="$(printf '%02d' "$i")"
        [[ " $out " == *" $nn "* ]] || out+="$nn "
      done
    elif [[ "$seg" =~ ^[0-9]{1,2}$ ]]; then
      nn="$(printf '%02d' "$((10#$seg))")"
      [[ " $out " == *" $nn "* ]] || out+="$nn "
    else
      echo "--order: '$seg' is not a ticket number or a range." >&2
      echo "Write the numbers in the order you want them run: 11,1,2,3." >&2
      exit 1
    fi
  done
  ORDER_LIST="$(printf '%s' "$out" | sed 's/[[:space:]]*$//')"
  if [[ -z "$ORDER_LIST" ]]; then
    echo "--order was given no ticket numbers." >&2; exit 1
  fi
}

parse_only "$ONLY_ARG"
parse_order "$ORDER_ARG"

if [[ -n "$BASE_REF" && "$BRANCH_MODE" == "current" ]]; then
  echo "--base has nothing to cut: --current-branch creates no branch." >&2; exit 1
fi
# --- Asking ------------------------------------------------------------------
# The heading above an interactive prompt: the title in yellow, inside a box of
# its own. Yellow and not the cyan the settings frame and the run banners use,
# because those are the script talking and this is the script waiting — the one
# colour on screen that means "nothing happens until you type" should not also
# mean "here is some information".
#
# One helper, because the whole point is that every question starts with the
# same visible mark; two prompts styled by hand would drift the moment a third
# is added. The rule is also a byte-counting rule: the border is drawn to
# ${#title} characters, so a title must stay ASCII — an em dash in one would
# count as three and hang the box open on the right.
ask_header() {  # $1 = title
  local title="$1" bar="" i
  # Braces are load-bearing: bash 3.2 reads the bytes of a multibyte glyph as
  # part of the name in "$bar─", and under `set -u` that is an unbound variable.
  for (( i = 0; i < ${#title} + 2; i++ )); do bar="${bar}─"; done
  printf '\n\033[33m┌%s┐\033[0m\n'          "$bar"
  printf '\033[33m│\033[0m \033[1;33m%s\033[0m \033[33m│\033[0m\n' "$title"
  printf '\033[33m└%s┘\033[0m\n'            "$bar"
}

# --- Which feature? -----------------------------------------------------------
# Asked FIRST, before anything else is printed, because every other setting on
# the confirmation screen is read off the answer — the ticket list, the tally,
# the derived branch name and the spec the prompt cites.
#
# The answer may name MORE THAN ONE feature: "[1,3]", "1,3" and "1 3" all mean
# the same thing, run 1 to its end and then run 3. Order is the order you typed,
# not the order they are listed, because a queue of specs usually has one
# building on the last.
#
# One choice, two paths per feature. The layout is not uniform (some features
# keep their tickets in issues/impl, some directly in issues/), so the folder is
# what you pick and the ticket dir is *resolved* from it rather than typed.

# First of issues/impl, issues, the folder itself that actually holds NN-*.md
# ticket files. Echoes the path, or nothing if none of them do.
resolve_issues_dir() {  # $1 = feature folder
  local d="${1%/}" c
  for c in "$d/issues/impl" "$d/issues" "$d"; do
    if compgen -G "$c/[0-9][0-9]-*.md" >/dev/null 2>&1; then printf '%s\n' "$c"; return 0; fi
  done
  return 1
}

# Tickets, not files: 00-index.md is scaffolding, not work.
count_tickets() {  # $1 = issues dir
  local f n=0
  for f in "$1"/[0-9][0-9]-*.md; do
    [[ -e "$f" ]] || continue
    [[ "$(basename "$f")" == 00-index.md ]] && continue
    n=$(( n + 1 ))
  done
  printf '%s\n' "$n"
}

# The spec the prompt points tickets at, derived from the ticket dir by undoing
# whatever resolve_issues_dir picked: .../issues/impl -> .../spec.md.
derive_spec_hint() {  # $1 = issues dir
  local p="${1%/}"
  p="${p%/impl}"; p="${p%/issues}"
  printf '%s/spec.md\n' "$p"
}

# Feature folders that actually contain tickets — a folder with none of them is
# not an option, because picking it could only ever end in "nothing eligible".
# They sit at any depth: v2's phases are .scratch/memark-v2/pNN-<slug>/. An
# issues/ folder is a feature's tickets and not a feature, so the search never
# goes into one, and a hidden folder such as .claude/ is skipped the same way.
# Only a folder at the top may hold its tickets loose. Deeper down, a folder of
# NN-*.md files with no issues/ is a phase's research/ or assets/, not a phase.
scratch_features() {
  local d r root="${SCRATCH_ROOT%/}"
  while IFS= read -r d; do
    r="$(resolve_issues_dir "$d")" || continue
    [[ "$r" == "$d" && "${d#"$root"/}" == */* ]] && continue
    printf '%s\n' "$d"
  done < <(find "$root" -mindepth 1 -type d \( -name issues -o -name '.*' \) -prune \
             -o -type d -print | sort)
}

# The short name a feature is known by everywhere: its path below .scratch/,
# with whatever resolve_issues_dir added back off and every / made a -, so
# .scratch/memark-v2/p01-<slug>/issues is memark-v2-p01-<slug>. A folder outside
# .scratch/ is known by its own name.
feature_name() {  # $1 = issues dir
  local p="${1%/}" root="${SCRATCH_ROOT%/}"
  p="${p%/impl}"; p="${p%/issues}"; p="${p#./}"; root="${root#./}"
  case "$p" in
    "$PWD/$root"/*) p="${p#"$PWD/$root"/}" ;;
    "$root"/*)      p="${p#"$root"/}" ;;
    *)              p="$(basename "$p")" ;;
  esac
  printf '%s\n' "${p//\//-}"
}

# "[1,3]", "1,3", "1 3" and "13" are not the same thing, and the last of those
# is why the brackets and commas are stripped but the spaces are not: a list
# without separators cannot be told from the number thirteen, so it is not
# guessed at. Echoes one token per line.
split_picks() {  # $1 = raw answer
  printf '%s\n' "$1" | tr -d '[]' | tr ',;' '  ' | tr -s ' ' '\n' | grep -v '^$' || true
}

# Appends to $FEATURE_DIRS, skipping a folder already queued — asking for
# "[2,2]" means running feature 2 once, not twice, and the second pass would
# find nothing eligible anyway.
queue_feature() {  # $1 = issues dir
  local d
  for d in ${FEATURE_DIRS[@]+"${FEATURE_DIRS[@]}"}; do
    [[ "$d" == "$1" ]] && return 0
  done
  FEATURE_DIRS+=("$1")
}

# Writes $FEATURE_DIRS. Never uses note(): the log directory does not exist yet.
choose_feature() {
  local features=() d idir n i=1 raw="" picks=() pk
  while IFS= read -r d; do features+=("$d"); done < <(scratch_features)

  if (( ${#features[@]} == 0 )); then
    echo "No feature folder under $SCRATCH_ROOT/ contains NN-*.md ticket files." >&2
    echo "Point --issues-dir at a ticket directory instead." >&2
    exit 1
  fi

  # Exactly one candidate is not a choice — take it and say so.
  if (( ${#features[@]} == 1 )); then
    queue_feature "$(resolve_issues_dir "${features[0]}")"
    printf '\n\033[90mOnly one feature under %s/ has tickets: %s\033[0m\n' \
      "$SCRATCH_ROOT" "$(feature_name "${features[0]}")"
    return 0
  fi

  ask_header "Which feature?"
  printf '\033[90m  Picks the ticket directory and the spec together.\033[0m\n'
  printf '\033[90m  Answer with one number, or a list to run several in order: [1,3]\033[0m\n\n'
  for d in "${features[@]}"; do
    idir="$(resolve_issues_dir "$d")"
    n="$(count_tickets "$idir")"
    printf '    %d)  %-32s %s ticket(s)\n' "$i" "$(feature_name "$d")" "$n"
    printf '        \033[90m%s\033[0m\n' "$idir"
    i=$(( i + 1 ))
  done

  printf '\nPick [1-%d, or a list like [1,3]; default 1]: ' "${#features[@]}"
  read -r raw || raw=""
  raw="${raw%$'\r'}"
  [[ -z "${raw// /}" ]] && raw="1"

  while IFS= read -r pk; do picks+=("$pk"); done < <(split_picks "$raw")
  if (( ${#picks[@]} == 0 )); then
    echo "Nothing was picked. Nothing was changed." >&2
    exit 1
  fi
  for pk in "${picks[@]}"; do
    if ! [[ "$pk" =~ ^[0-9]+$ ]] || (( pk < 1 || pk > ${#features[@]} )); then
      echo "'$pk' is not one of the options. Nothing was changed." >&2
      exit 1
    fi
    queue_feature "$(resolve_issues_dir "${features[$(( pk - 1 ))]}")"
  done
}

if [[ -n "$ISSUES_DIR_ARG" ]]; then
  # --issues-dir takes paths, so it splits on commas only. A comma in a
  # directory name would be its own problem long before this script saw it.
  #
  # Each path goes through the same resolver the picker uses, so a feature
  # folder and the ticket directory inside it are both accepted — the flag used
  # to take only the second, and typing the first got you a run over an empty
  # backlog with no complaint.
  while IFS= read -r _d; do
    [[ -n "$_d" ]] || continue
    # Both halves of a failed resolve: the non-zero return, and an empty answer
    # from a resolver that ever grows a path out of it.
    _r="$(resolve_issues_dir "$_d")" || _r=""
    if [[ -z "$_r" ]]; then
      echo "No NN-*.md ticket files in $_d, nor in its issues/ or issues/impl." >&2
      exit 1
    fi
    queue_feature "$_r"
  done < <(printf '%s\n' "$ISSUES_DIR_ARG" | tr ',' '\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
  unset _d _r
else
  # Unattended, and the answer is not unambiguous: refuse rather than guess.
  # `read` at EOF would otherwise take the default silently, and the default is
  # whichever feature happens to sort first — a run against the wrong backlog.
  if (( ASSUME_YES )) || [[ ! -t 0 ]]; then
    if [[ "$(scratch_features | grep -c . | tr -d ' ' || true)" == "1" ]]; then
      queue_feature "$(resolve_issues_dir "$(scratch_features)")"
    else
      echo "No --issues-dir given and nothing to ask on (-y/--yes, or stdin is not a" >&2
      echo "terminal), and $SCRATCH_ROOT/ holds more than one feature with tickets:" >&2
      scratch_features | sed 's/^/  /' >&2
      echo "Pass --issues-dir explicitly for an unattended run. It takes a comma-" >&2
      echo "separated list if you want several of them, in order." >&2
      exit 1
    fi
  else
    choose_feature
  fi
fi

(( ${#FEATURE_DIRS[@]} > 0 )) || { echo "No feature queued. Nothing was changed." >&2; exit 1; }

for _d in "${FEATURE_DIRS[@]}"; do
  [[ -d "$_d" ]] || { echo "No such issues dir: $_d" >&2; exit 1; }
done
unset _d

# --spec names ONE file, so it cannot describe a queue. Refuse rather than point
# every feature in the queue at the first one's spec.
if [[ -n "$SPEC_OVERRIDE" ]] && (( ${#FEATURE_DIRS[@]} > 1 )); then
  echo "--spec names one file, but ${#FEATURE_DIRS[@]} features are queued." >&2
  echo "Drop it and each feature uses its own <feature>/spec.md." >&2
  exit 1
fi

# --only names bare ticket numbers, and every feature has an 01. Applying one set
# to a queue would mean "ticket 03" naming a different piece of work per feature,
# which is not something anybody types on purpose. Refuse, the same way --spec
# does, rather than guess which 03 was meant.
if [[ -n "$ONLY_SET" ]] && (( ${#FEATURE_DIRS[@]} > 1 )); then
  echo "--only names ticket numbers, but ${#FEATURE_DIRS[@]} features are queued." >&2
  echo "Queue one feature, or drop --only and let each one run its own board." >&2
  exit 1
fi

# --order names bare numbers for the same reason, so it is refused the same way.
if [[ -n "$ORDER_LIST" ]] && (( ${#FEATURE_DIRS[@]} > 1 )); then
  echo "--order names ticket numbers, but ${#FEATURE_DIRS[@]} features are queued." >&2
  echo "Queue one feature, or drop --order and let each one run its board in number order." >&2
  exit 1
fi

# The spec a feature's prompt cites: the override if there is one, otherwise the
# file next to its tickets.
spec_for() {  # $1 = issues dir
  if [[ -n "$SPEC_OVERRIDE" ]]; then printf '%s\n' "$SPEC_OVERRIDE"
  else derive_spec_hint "$1"; fi
}

# Say what the choice resolved to, every feature of it, before the settings
# screen it feeds. The yes/no that follows is the confirmation for all of it.
printf '\n  \033[1mQueued:\033[0m %d feature(s), run in this order\n' "${#FEATURE_DIRS[@]}"
_i=1
for _d in "${FEATURE_DIRS[@]}"; do
  printf '    %d. %-28s %s\n' "$_i" "$(feature_name "$_d")" "$_d"
  printf '       \033[90mspec: %s%s\033[0m\n' "$(spec_for "$_d")" \
    "$( [[ -f "$(spec_for "$_d")" ]] || printf '   (MISSING)' )"
  _i=$(( _i + 1 ))
done
unset _d _i

# The queue's first feature is what the pre-run screens read while they describe
# the run. run_feature() re-points both at the feature it is about to start.
ISSUES_DIR="${FEATURE_DIRS[0]}"
SPEC_HINT="$(spec_for "$ISSUES_DIR")"

# feat/<feature> derived from the issues dir:
#   .scratch/dynamic-workflow-canvas/issues/impl -> feat/dynamic-workflow-canvas
derive_branch_name() {  # $1 = issues dir (default: the feature running now)
  printf 'feat/%s\n' "$(feature_name "${1:-$ISSUES_DIR}")"
}

# The branch a feature commits to in `new` mode. One typed name pins every
# feature to it; otherwise each gets its own, derived from its folder.
branch_for() {  # $1 = issues dir
  if (( NEW_BRANCH_EXPLICIT )); then printf '%s\n' "$NEW_BRANCH"
  else derive_branch_name "$1"; fi
}
[[ "$BRANCH_MODE" == "new" && -z "$NEW_BRANCH" ]] && NEW_BRANCH="$(branch_for "$ISSUES_DIR")"

# Every ticket directory in the queue, as one alternation for dirty_files below.
# All of them, not just the one running: the script writes **Status:** lines into
# each feature it has queued, and none of that bookkeeping is the agent's mess.
# .claude/skills/ too: the autoharness plugin writes a new skill folder there
# when a session ends, after the agent has committed. Counting it failed three
# good tickets in a row on 2026-10-01. Commit those folders yourself.
DIRTY_IGNORE_RE="$LOG_ROOT|\.claude/skills"
for _d in "${FEATURE_DIRS[@]}"; do DIRTY_IGNORE_RE="$DIRTY_IGNORE_RE|$_d"; done
unset _d

RUN_ID="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$LOG_ROOT/ralph-tickets-$RUN_ID"
RUN_LOG="$LOG_DIR/run.log"

# --- Logging helpers ---------------------------------------------------------
strip_ansi() { sed -E $'s/\x1b\\[[0-9;]*m//g'; }

# The live tool line is drawn for a human watching the terminal, and only there.
# fd 4 is a second handle on the script's own stdout, opened before anything is
# piped, so a live line can reach the screen without going down the pipe that
# feeds run.log. When the trail is redirected the line is not drawn at all and a
# redirected run gives byte-for-byte what it gave before.
if [[ -t 1 ]]; then LIVE_TTY=1; exec 4>&1; else LIVE_TTY=0; exec 4>/dev/null; fi

# Split `pretty`'s output into the two channels.
#
# `pretty` marks a live line with \001. strip_ansi removes colour codes only, so
# a frame left in the pipe would land in run.log as one glued mess of every
# frame it ever drew. So a marked line goes to fd 4 and is not passed on.
#
# A bare \001 is an erase and nothing else. Any ordinary line erases the live
# line before it prints, so no half-drawn frame survives under a result.
#
# A frame is cut to the terminal's width first. `\r\033[K` clears one physical
# row, so a frame wider than the terminal wraps onto a second row that the next
# erase cannot reach, and thirty heartbeats scroll thirty orphaned halves up the
# screen. The width is read off fd 4 per frame rather than kept, so a window
# resized mid-run is still right. Colour is dropped on a frame that has to be
# cut, because cutting a coloured string mid-escape is how a terminal ends up
# stuck in reverse video.
live_lines() {
  local line live=0 cols plain
  while IFS= read -r line; do
    if [[ "$line" == $'\001'* ]]; then
      (( LIVE_TTY )) || continue
      line="${line#$'\001'}"
      if [[ -n "$line" ]]; then
        cols="$(stty size <&4 2>/dev/null)" && cols="${cols##* }" || cols=""
        if [[ -n "$cols" ]] && (( cols > 0 )); then
          plain="$(printf '%s' "$line" | strip_ansi)"
          (( ${#plain} >= cols )) && line="${plain:0:cols-1}"
        fi
        printf '\r\033[K%s' "$line" >&4
        live=1
      elif (( live )); then
        printf '\r\033[K' >&4
        live=0
      fi
    else
      if (( live )); then printf '\r\033[K' >&4; live=0; fi
      printf '%s\n' "$line"
    fi
  done
  if (( live )); then printf '\r\033[K' >&4; fi
  return 0
}

log() {
  local msg="$*"
  printf '\n\033[1;36m════════════════════════════════════════════════════════════════\n▶ %s\n════════════════════════════════════════════════════════════════\033[0m\n' "$msg"
  printf '\n════════════════════════════════════════════════════════════════\n▶ %s\n════════════════════════════════════════════════════════════════\n' "$msg" >>"$RUN_LOG"
}
note() {
  printf '\033[90m  %s\033[0m\n' "$*"
  printf '  %s\n' "$*" >>"$RUN_LOG"
}

# Render Claude's stream-json events as compact, colorized, Claude-style lines.
# The badge is the ticket number, passed in as $num — bash already knows which
# ticket is running, so unlike run-ralph-goal.sh there is nothing to infer and
# nothing that can flicker.
pretty() {
  local num="$1" color="$2"
  local tmpd fifo tickpid feedpid

  # jq has no clock of its own: it only ever acts when a line arrives. So the
  # spinner used to move on the CLI's `tool_progress` heartbeat, which lands
  # once every THIRTY seconds. A tool that ran two minutes therefore showed the
  # same frame for half a minute at a time, and a tool that finished inside the
  # first thirty seconds never drew a frame at all.
  #
  # So jq is fed from a fifo carrying two writers: claude's real events, and a
  # tick every RALPH_TICK_SECS. The tick is what moves the frame and re-reads
  # the clock. Ticks only exist when a human is watching — a redirected run
  # starts no ticker, so its bytes are unchanged.
  #
  # The interval is a variable because the frame rate is now the only thing that
  # draws: a caller that feeds a whole stream faster than one interval sees no
  # frame at all, which is true of the tests and of nothing a terminal does. They
  # export a shorter one rather than sleeping a real tenth of a second per event.
  #
  # Both writers must close before jq sees end of stream, so the ticker is
  # killed the moment the real stream ends.
  #
  # `sleep` runs with the fifo closed. It is a child of the ticker loop and
  # inherits the loop's stdout, so killing the loop leaves it holding the write
  # end open for the rest of its interval and jq waits that long for end of
  # stream. `>&-` closes the fd for that child alone. Killing the process group
  # is NOT the fix: a background job in a non-interactive bash script shares the
  # script's group, so `kill -- -$tickpid` would take the whole run down.
  tmpd="$(mktemp -d)"; fifo="$tmpd/events"; mkfifo "$fifo"
  # pretty always runs as one stage of a pipeline, so this trap belongs to that
  # stage alone and fires however it ends, Ctrl-C included.
  trap 'rm -rf "$tmpd"' EXIT
  exec 6<&0
  {
    tickpid=""
    if (( LIVE_TTY )); then
      ( while :; do printf '{"type":"__tick"}\n'; sleep "${RALPH_TICK_SECS:-0.1}" >&-; done ) >"$fifo" &
      tickpid=$!
    fi
    cat <&6 >"$fifo"
    [[ -n "$tickpid" ]] && kill "$tickpid" 2>/dev/null
    true
  } &
  feedpid=$!

  jq -rn --unbuffered --arg num "$num" --arg color "$color" '
    def c($code): "\u001b[" + $code + "m";
    def reset: "\u001b[0m";
    def oneline($n): gsub("\\s+";" ") | .[0:$n];
    # Milliseconds -> the two largest useful units, e.g. 374000 -> "6m 14s".
    # Two units, never three: "1h 04m 09s" is precision nobody acts on.
    def dur($ms):
      ($ms / 1000 | floor) as $t
      | ($t % 60) as $s
      | (($t / 60   | floor) % 60) as $m
      | (($t / 3600 | floor) % 24) as $h
      | ($t / 86400 | floor) as $d
      | def pad2: tostring | if length == 1 then "0" + . else . end;
        if   $d > 0 then "\($d)d \($h | pad2)h"
        elif $h > 0 then "\($h)h \($m | pad2)m"
        elif $m > 0 then "\($m)m \($s | pad2)s"
        else "\($t)s" end;
    # 441 -> "441", 196638 -> "196.6k", 34144840 -> "34.1M".
    def abbrev($n):
      if   $n >= 1000000 then "\(($n / 100000 | round) / 10)M"
      elif $n >= 1000    then "\(($n / 100    | round) / 10)k"
      else "\($n)" end;
    # Tokens for the whole session this ticket ran in.
    #
    # Read .modelUsage, NOT .usage: .usage on a result event covers only the LAST
    # message, while .modelUsage is the session running total, keyed by
    # model (a run can touch more than one — Opus for the work, Haiku for small
    # internal calls), so the models are summed. Verified against real logs:
    # .modelUsage costs sum to the final .total_cost_usd of the session.
    #
    # Takes the modelUsage object as an argument rather than reading it off `.`,
    # because it is now rendered once at end-of-stream from the LAST result seen,
    # not from whichever result happens to be in hand.
    def toks($mu):
      [($mu // {}) | .[]] as $m
      | ([$m[].inputTokens]         | add // 0) as $i
      | ([$m[].outputTokens]        | add // 0) as $o
      | ([$m[].cacheReadInputTokens]     | add // 0) as $cr
      | ([$m[].cacheCreationInputTokens] | add // 0) as $cc
      | if ($i + $o + $cr + $cc) == 0 then empty
        else "in " + abbrev($i) + " · out " + abbrev($o)
             + " · cache " + abbrev($cr + $cc)
        end;
    # Always two decimal places, so the column does not jitter between runs.
    def money($v):
      ($v * 100 | round) as $cents
      | ($cents % 100 | tostring) as $frac
      | "\($cents / 100 | floor).\(if ($frac | length) == 1 then "0" + $frac else $frac end)";
    # Column padding for the per-segment breakdown. `" " * 0` is null in jq, and
    # so is a negative count, hence the // "" on both.
    def rpad($n): . as $s | $s + ((" " * ($n - ($s | length))) // "");
    def lpad($n): . as $s | ((" " * ($n - ($s | length))) // "") + $s;
    # One frame per tick, and a tick lands every 100ms. A still frame therefore
    # really does mean a stopped stream.
    def spinner($i): ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"][$i % 10];
    # The live line for the tool that has been running longest.
    #
    # `.running` holds every tool that has started and not yet reported back,
    # against the wall-clock second it started on. Tools can run in parallel, so
    # the oldest one is drawn: it is the one the turn is actually waiting on.
    #
    # Nothing is drawn for the first two seconds of a tool. Without that grace
    # a quick tool would paint a frame and erase it in the same breath, and the
    # trail would flicker on every small edit.
    def frame($st; $spin):
      ([$st.running | to_entries[]] | sort_by(.value) | first) as $r
      | if $r == null or ((now - $r.value) < 2) then null
        else ($st.tools[$r.key] // {}) as $t
          | { id: $r.key,
              line: ("\u0001"
                    + c("36") + spinner($spin) + reset + " "
                    + ($t.name // "tool")
                    + c("90") + " · " + dur(((now - $r.value) * 1000))
                    + (if ($t.desc // "") == "" then "" else "   (" + $t.desc + ")" end)
                    + reset) }
        end;
    def summary:
      (.input.command // .input.file_path // .input.path // .input.pattern
       // .input.url // .input.query // .input.description
       // (.input // {} | tojson));
    # Everything EXCEPT `result`, which is deferred to end-of-stream. See the
    # long comment above the foreach below for why.
    def render:
      if .type == "system" and .subtype == "init" then
        c("90") + "● session " + (.session_id // "?") + " · " + (.model // "?") + reset
      elif .type == "assistant" then
        (.message.content[]? |
          if .type == "text" and ((.text | gsub("\\s";"") | length) > 0) then
            (.text | gsub("\n"; "\n  "))
          elif .type == "tool_use" then
            c("36") + "⏺ " + .name + reset + c("90") + " (" + (summary | oneline(80)) + ")" + reset
          else empty end)
      elif .type == "user" then
        (.message.content[]? |
          if .type == "tool_result" then
            (((.content // "") | if type=="array" then (map(.text // "")|join(" ")) else tostring end)
             | oneline(100)
             # An async-agent launch receipt is internal metadata that asks not
             # to be quoted, and the loop below announces the launch properly.
             | if test("Async agent launched") then empty
               elif length > 0 then c("90") + "  ⎿ " + . + reset
               else empty end)
          else empty end)
      elif .type == "rate_limit_event" then
        (.rate_limit_info |
          if .status == "rejected" then
            c("31") + "⛔ usage limit reached" + reset
          elif (.utilization // 0) > 0 then
            c("33") + "⚠ quota " + ((.utilization * 100 | floor) | tostring) + "%" + reset
          else empty end)
      else empty end;

    # ONE `claude -p` invocation can report MORE THAN ONE `result` event, and the
    # extra ones are not a bug. /implement runs /code-review, which launches
    # background agents. The main turn finishes and emits a result while they are
    # still working; when they report back, a task-notification wakes the SAME
    # session, it does more work, and emits another result — that one carrying
    # `.origin.kind == "task-notification"`. Whether the wake-up lands inside the
    # first turn or after it is a race, so a ticket may show one segment or two
    # with nothing different about the work.
    #
    # The three headline fields do NOT agree across those segments, which is what
    # made one-line-per-result print nonsense:
    #   .duration_ms     per segment
    #   .total_cost_usd  CUMULATIVE over the session, so a segment cost is the
    #                    delta against the previous result
    #   .modelUsage      the session running total, snapshotted when the row is
    #                    flushed — IDENTICAL on every result, which is why the
    #                    token figures used to print twice, unchanged
    #
    # So results are accumulated instead of printed on arrival, and ONE summary is
    # emitted at end-of-stream: session totals on the 🏁 line (the only place the
    # token figures can honestly appear), with a per-segment breakdown underneath
    # whenever there was more than one segment. The sentinel after `inputs` is what
    # gives us an end-of-stream hook without buffering the transcript — only the
    # handful of result rows is held.
    (c($color) + (" " + $num + "   ")[0:4] + reset + " ") as $badge
    | foreach (inputs, {type:"__eof"}) as $e (
        { agents: {}, noted: false, segs: [], pcost: 0, mu: {}, sub: "done", err: false,
          tools: {}, running: {}, spin: 0, live: "", out: [] };

        (.out = [$e | render])

        | if $e.type == "assistant" then
            ( reduce ($e.message.content[]? | select(.type == "tool_use" and .name == "Agent")) as $t (.;
                .agents[$t.id] = ($t.input.description // $t.input.subagent_type // "background work"))
            # A heartbeat names its tool but never repeats what the tool was
            # asked to do, so the description is kept here, off the tool_use
            # that started it, and read back by id when a beat lands. Same
            # `summary` and same cut as the ⏺ line, so the two agree.
            | reduce ($e.message.content[]? | select(.type == "tool_use")) as $t (.;
                .tools[$t.id] = { name: $t.name, desc: ($t | summary | oneline(80)) }
                | .running[$t.id] = now) )

          elif $e.type == "user" then
            # A launch is only announced once the tool RESULT confirms it went
            # async: the same Agent call runs inline when it is not backgrounded,
            # and .input.run_in_background is unreliable (seen null, false and
            # true across one run), so the receipt is the authority.
            reduce ($e.message.content[]? | select(.type == "tool_result")) as $r (.;
              . as $st
              | ($r.tool_use_id // "") as $tid
              | (($r.content // "") | if type == "array" then (map(.text // "") | join(" ")) else tostring end) as $txt
              | if ($st.agents[$tid] != null) and ($txt | test("Async agent launched")) then
                  ( $st
                  | .out += [ c("35") + "⚙ background agent started" + reset
                              + c("90") + " · " + $st.agents[$tid] + reset ]
                  | if .noted then .
                    else .noted = true
                       | .out += [ c("90") + "  ↳ it keeps working after this turn ends; the ticket is not"
                                   + " finished until it reports back" + reset ]
                    end )
                else $st end)
            # A tool that has reported back is no longer running, so it can no
            # longer own the live line. The erase itself is handled below.
            | reduce ($e.message.content[]? | select(.type == "tool_result")) as $r (.;
                .running = (.running | del(.[$r.tool_use_id // ""])))

          elif $e.type == "tool_progress" then
            # The CLI sends one of these every 30 seconds for a tool that has not
            # returned. It no longer draws anything — the ticks do that — but it
            # carries the elapsed count the CLI keeps, so the start time is
            # corrected against it. That keeps the clock on the frame honest even if the
            # ⏺ line that opened the tool was never seen.
              ($e.parent_tool_use_id // "") as $tid
            | if $tid == "" then .
              else .running[$tid] = (now - ($e.elapsed_time_seconds // 0)) end

          elif $e.type == "result" then
              .segs += [{ dur:    ($e.duration_ms // 0),
                          cost:   (($e.total_cost_usd // 0) - .pcost),
                          origin: ($e.origin.kind // "") }]
            | .pcost = ($e.total_cost_usd // 0)
            | .mu    = ($e.modelUsage // {})
            | .sub   = ($e.subtype // "done")
            | .err   = ($e.is_error // false)

          elif $e.type == "__eof" then
            if (.segs | length) == 0 then .
            else
                ([.segs[].dur] | add) as $total
              | (if .err then "31" else "32" end) as $col
              | .out += [ c($col) + "🏁 " + .sub + " · " + dur($total)
                          + " · $" + money(.pcost) + reset
                          + c("90") + ((toks(.mu) | " · " + .) // "") + reset ]
              | if (.segs | length) < 2 then .
                else
                  .out += ( .segs
                    | to_entries
                    | (length - 1) as $last
                    | map( (if   .key == 0 then "main turn"
                            elif .value.origin == "task-notification" then "after background agent"
                            else "turn \(.key + 1)" end) as $lbl
                         | { k: .key,
                             line: (($lbl | rpad(23))
                                    + (dur(.value.dur) | lpad(8))
                                    + " · $" + money(.value.cost)) } )
                    | map( c("90") + "  " + (if .k == $last then "└ " else "├ " end) + .line + reset ) )
                end
            end
          else . end

        # One place decides what the live line shows, and it runs after every
        # event. A tick redraws; anything else only erases, and only when the
        # tool that owned the line is no longer the one to draw.
        | frame(.; .spin) as $f
        | if $e.type == "__tick" then
              .spin = (.spin + 1)
            | if $f == null
              then (if .live != "" then .live = "" | .out = ["\u0001"] else .out = [] end)
              else .live = $f.id | .out = [$f.line] end
          else
            if (.live != "") and (($f == null) or ($f.id != .live))
            then .live = "" | .out = ["\u0001"] + .out
            else . end
          end;

        .out[]? | if startswith("\u0001")
                  then "\u0001" + (if length == 1 then "" else $badge + .[1:] end)
                  else $badge + . end
      )
  ' <"$fifo" 2>>"${PRETTY_ERR:-/dev/null}" | live_lines
  wait "$feedpid" 2>/dev/null || true
  rm -rf "$tmpd"
}

# fg;bg pairs, cycled per ticket so consecutive tickets are visually distinct.
PALETTE=("30;101" "30;102" "30;103" "30;104" "30;105" "30;106" "97;41" "97;44" "97;45" "97;100")

# --- Ticket parsing ----------------------------------------------------------
# A ticket file looks like:
#   # 22 — The Activity tab
#   **Blocked by:** 03 — Extract `activityMerge.ts`; 11 — The Activity trail; 21 — Node settings
#   and the Result tab.
#   **Status:** ready-for-agent
#
# Note the Blocked-by line WRAPS. We read from the marker to the next blank line,
# split on ';', and take the leading two-digit number of each segment — so prose
# like "§15" or "React 18" inside a title can never be mistaken for a blocker.

ticket_files() {
  # Emits "NN<TAB>path", numerically sorted, skipping 00-index.md.
  local f base
  for f in "$ISSUES_DIR"/[0-9][0-9]-*.md; do
    base="$(basename "$f")"
    [[ "$base" == 00-index.md ]] && continue
    printf '%s\t%s\n' "${base:0:2}" "$f"
  done | sort -n
}

ordered_ticket_files() {
  # The same rows as ticket_files, in the order the frontier should read them:
  # everything --order names first, in that order, then the rest by number.
  # Without --order it IS ticket_files, so the default board order is unchanged.
  if [[ -z "$ORDER_LIST" ]]; then ticket_files; return 0; fi
  local n num path
  for n in $ORDER_LIST; do
    while IFS=$'\t' read -r num path; do
      [[ "$num" == "$n" ]] && printf '%s\t%s\n' "$num" "$path"
    done < <(ticket_files)
  done
  while IFS=$'\t' read -r num path; do
    [[ " $ORDER_LIST " == *" $num "* ]] || printf '%s\t%s\n' "$num" "$path"
  done < <(ticket_files)
}

path_for() {  # $1 = NN
  local f; f=$(ls "$ISSUES_DIR"/"$1"-*.md 2>/dev/null | head -1)
  [[ -n "$f" ]] || { echo "No ticket file for $1" >&2; return 1; }
  printf '%s\n' "$f"
}

status_of() {  # $1 = path
  sed -n 's/^\*\*Status:\*\*[[:space:]]*//p' "$1" | head -1 | tr -d '\r' \
    | sed -e 's/[[:space:]]*$//'
}

title_of() {  # $1 = path -> heading with its leading "NN — " stripped
  sed -n '1s/^#[[:space:]]*//p' "$1" | sed 's/^[0-9][0-9][[:space:]]*—[[:space:]]*//'
}

slug_of() {  # $1 = path -> "boot-plan" part of 02-extract-boot-plan.md
  local b; b="$(basename "$1" .md)"; printf '%s\n' "${b:3}"
}

blockers_of() {  # $1 = path -> space-separated NN list ("" if none)
  # All in one awk: BSD sed has no `\?` in BRE, so the segment match lives here.
  #
  # The list is written by hand, by a human or by a /to-tickets run, so it arrives
  # punctuated however felt natural on the day:
  #   **Blocked by:** 03 - Extract `activityMerge.ts`; 11 - The Activity trail
  #   **Blocked by:** 01, 02, 03, 04, 05, 06, 07 - every ticket in this spec.
  #   **Blocked by:** 02 & 05, plus 11 and 12
  # Splitting on ";" alone read the second of those as ONE segment, so only 01
  # counted and the ticket ran with six blockers unfinished. Every plausible list
  # punctuation is therefore normalised to one delimiter before the split.
  awk '
    /^\*\*Blocked by:\*\*/ { grab = 1 }
    grab && /^[[:space:]]*$/ { exit }
    grab { line = line " " $0 }
    END {
      sub(/^.*\*\*Blocked by:\*\*/, "", line)
      # The word separators first, while the whitespace around them survives.
      gsub(/[[:space:]]+([Aa]nd|[Pp]lus|[Ww]ith)[[:space:]]+/, ";", line)
      # Then the punctuation ones. Deliberately NOT the dash of any width
      # (- – —): a dash divides a blocker NUMBER from its TITLE
      # ("02 - A node prompt"), so treating it as a separator would let a title
      # beginning with two digits be read as one more blocker.
      gsub(/[,;&+|\/\\]|[[:space:]]{2,}/, ";", line)
      n = split(line, seg, /;+/)
      for (i = 1; i <= n; i++) {
        s = seg[i]
        sub(/^[[:space:]]+/, "", s)
        # Only a two-digit number at the START of a segment counts, so prose
        # like "§15" or "React 18" in a blocker title is never mistaken for one.
        # Accepted cost of the wider split: prose that FOLLOWS a separator and
        # opens with two digits ("..., 22 chars") reads as blocker 22. That is
        # the direction to err in - a phantom blocker leaves the ticket sitting
        # at `blocked` where a human sees it, while a MISSED blocker starts a
        # ticket on top of unfinished work and says nothing.
        if (match(s, /^[0-9][0-9]([^0-9]|$)/)) printf "%s ", substr(s, 1, 2)
      }
    }
  ' "$1"
}

set_status() {  # $1 = path, $2 = new status
  local tmp; tmp="$(mktemp)"
  sed "s/^\*\*Status:\*\*.*/\*\*Status:\*\* $2/" "$1" >"$tmp"
  mv "$tmp" "$1"
}

stamp_completed_at() {  # $1 = path
  local now tmp; now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; tmp="$(mktemp)"
  if grep -q '^\*\*Completed at:\*\*' "$1"; then
    sed "s|^\*\*Completed at:\*\*.*|\*\*Completed at:\*\* $now|" "$1" >"$tmp"
  else
    sed "s|^\(\*\*Status:\*\* completed\)$|\1\n\n\*\*Completed at:\*\* $now|" "$1" >"$tmp"
  fi
  mv "$tmp" "$1"
}

# The frontier: the ticket to work next.
#   1. Any ticket already `in-progress` — a previous round died partway through it.
#   2. Otherwise the first `ready-for-agent` ticket whose every blocker is
#      `completed`. First means lowest-numbered, unless --order was given, in
#      which case it means first in the order you wrote.
# Echoes "NN" or nothing.
#
# --only filters both passes and nothing else. It narrows what may be picked and
# changes no rule about what is eligible: a ticket in the set still waits for its
# blockers, and a ticket outside it is never taken even when it is the only thing
# left. That includes the `in-progress` pass, so a ticket parked outside the set
# is left parked rather than dragged back in past the boundary you drew.
next_ticket() {
  local num path st
  while IFS=$'\t' read -r num path; do
    in_only "$num" || continue
    [[ "$(status_of "$path")" == "in-progress" ]] && { printf '%s\n' "$num"; return 0; }
  done < <(ordered_ticket_files)

  while IFS=$'\t' read -r num path; do
    in_only "$num" || continue
    [[ "$(status_of "$path")" == "ready-for-agent" ]] || continue
    local ok=1 b bpath
    for b in $(blockers_of "$path"); do
      bpath="$(path_for "$b" 2>/dev/null)" || { ok=0; break; }
      [[ "$(status_of "$bpath")" == "completed" ]] || { ok=0; break; }
    done
    (( ok )) && { printf '%s\n' "$num"; return 0; }
  done < <(ordered_ticket_files)
  return 0
}

print_plan() {
  local num path st blockers
  printf '\n  %-4s %-16s %-12s %s\n' "#" "STATUS" "BLOCKED BY" "TITLE"
  printf '  %s\n' "$(printf '─%.0s' {1..78})"
  while IFS=$'\t' read -r num path; do
    st="$(status_of "$path")"
    blockers="$(blockers_of "$path" | sed 's/[[:space:]]*$//')"
    # A plain hyphen, not an em dash: printf pads by bytes, so a multibyte glyph
    # here would knock the column out of alignment against the numeric rows.
    [[ -z "$blockers" ]] && blockers="-"
    # Out of --only scope is dimmed rather than dropped. The board is what is in
    # the feature; the dim is what this run will not touch. Hiding those rows
    # would make a narrowed run look like a short feature.
    if in_only "$num"; then
      printf '  %-4s %-16s %-12s %s\n' "$num" "$st" "$blockers" "$(title_of "$path" | cut -c1-40)"
    else
      printf '\033[90m  %-4s %-16s %-12s %s\033[0m\n' "$num" "$st" "$blockers" "$(title_of "$path" | cut -c1-40)"
    fi
  done < <(ticket_files)
  if [[ -n "$ONLY_SET" ]]; then
    printf '\n  \033[90m--only %s — %d ticket(s) in scope; the dimmed rows are out of it.\033[0m\n' \
      "$ONLY_ARG" "$(printf '%s\n' $ONLY_LIST | grep -c .)"
  fi
  if [[ -n "$ORDER_LIST" ]]; then
    printf '\n  \033[90m--order %s: run order is %s, then the rest by number.\033[0m\n' \
      "$ORDER_ARG" "$ORDER_LIST"
  fi
  printf '\n'
}

# --- --only reachability -----------------------------------------------------
# Asked once, before anything runs. A ticket in the set whose blocker is neither
# `completed` nor also in the set can never become eligible, so the run would
# quietly do less than was asked for and look finished doing it. That is the one
# failure mode of narrowing a board, so it is refused up front and the pairs are
# named, because the fix is either to widen the set or to run the blocker first.
#
# Reads the feature it is pointed at, so the caller sets ISSUES_DIR. --only is
# already refused for a queue of more than one, so there is exactly one board.
check_only_reachable() {
  local num path b bpath bst absent="" unreachable="" parked=""
  for num in $ONLY_LIST; do
    path="$(path_for "$num" 2>/dev/null)" || { absent+=" $num"; continue; }
    for b in $(blockers_of "$path"); do
      in_only "$b" && continue
      if ! bpath="$(path_for "$b" 2>/dev/null)"; then
        unreachable+=$'\n'"    $num is blocked by $b, and this feature has no ticket $b"
        continue
      fi
      bst="$(status_of "$bpath")"
      [[ "$bst" == "completed" ]] && continue
      unreachable+=$'\n'"    $num is blocked by $b, which is ${bst:-unset}, not completed"
    done
  done

  # A ticket left `in-progress` outside the set is one the picker would normally
  # take first. Saying so is not a refusal: narrowing past a parked ticket is a
  # reasonable thing to want, and finding out later that it stayed parked is not.
  while IFS=$'\t' read -r num path; do
    in_only "$num" && continue
    [[ "$(status_of "$path")" == "in-progress" ]] && parked+=" $num"
  done < <(ticket_files)

  if [[ -n "$absent" ]]; then
    echo "--only names ticket(s) this feature does not have:$absent" >&2
    exit 1
  fi
  if [[ -n "$unreachable" ]]; then
    echo "--only cannot run as asked:$unreachable" >&2
    echo "" >&2
    echo "Add the blocker to --only, or complete it in an earlier run." >&2
    exit 1
  fi
  if [[ -n "$parked" ]]; then
    printf '  \033[33m⚠ in-progress and outside --only, so not resumed this run:%s\033[0m\n' "$parked"
  fi
}

# --- --order sanity ----------------------------------------------------------
# Two ways --order can be wrong before anything runs: it names a ticket this
# feature has not got, or it names one --only leaves out. Both mean the order
# typed is not the order that would run, so both are refused here rather than
# discovered halfway down a board at 3am.
#
# A blocked ticket is NOT refused. Putting a blocked ticket first is a reasonable
# thing to write, and the frontier already does the right thing with it: it waits
# and the next eligible one in the order goes.
check_order() {
  local n path absent="" outside=""
  for n in $ORDER_LIST; do
    path="$(path_for "$n" 2>/dev/null)" || { absent+=" $n"; continue; }
    in_only "$n" || outside+=" $n"
  done
  if [[ -n "$absent" ]]; then
    echo "--order names ticket(s) this feature does not have:$absent" >&2
    exit 1
  fi
  if [[ -n "$outside" ]]; then
    echo "--order names ticket(s) that --only leaves out:$outside" >&2
    echo "" >&2
    echo "Add them to --only, or drop them from --order." >&2
    exit 1
  fi
}

# --- Preflight ---------------------------------------------------------------
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Not a git repo" >&2; exit 1; }

# Uncommitted changes, ignoring two kinds of path the script itself writes:
#   - $LOG_ROOT — this run's own logs.
#   - every queued ticket directory — the ticket files, whose **Status:** lines
#     the script edits and deliberately never commits. In this repo they sit
#     under .scratch/, which is gitignored, so they never show anyway; the
#     exclusion keeps the loop honest if you point --issues-dir at a tracked
#     directory instead. All of the queued ones are excluded and not only the
#     feature running, because a later feature's files are the script's
#     bookkeeping too.
# Both matter because "is the tree clean?" is how the loop decides the agent
# finished — it must not see the script's own bookkeeping as the agent's mess.
dirty_files() {
  git status --porcelain \
    | grep -v -E "^.{3}\"?(${DIRTY_IGNORE_RE})/" || true
}

# Dirty paths that were NOT already dirty when the run started. This is what the
# per-ticket check asks, so pre-existing WIC tolerated by --allow-dirty cannot
# fail every ticket in turn, while anything the agent newly leaves behind still
# does. Compares whole porcelain lines, so a baseline file edited further during
# the run keeps the same " M path" line and stays ignored — deliberate: the
# alternative is failing a ticket over a file the agent was never asked about.
# --- Quota ------------------------------------------------------------------
# The CLI streams `rate_limit_event` rows well before it gives up, e.g.
#   {"type":"rate_limit_event","rate_limit_info":{
#      "status":"allowed_warning","utilization":0.94,
#      "resetsAt":1786894200,"rateLimitType":"five_hour"}}
# climbing 0.94 → 0.99, then a final {"status":"rejected"}. We read them back
# off the ticket transcript after the run rather than tapping the live pipe,
# because the transcript is already on disk and needs no extra plumbing.
#
# These are set by read_quota() and consumed by the loop.
QUOTA_UTIL=""      # 0..1, last reported utilization
QUOTA_RESETS_AT="" # unix epoch when the window rolls over
QUOTA_REJECTED=0   # 1 if the run actually died on the limit

read_quota() {  # $1 = path to the ticket transcript
  QUOTA_UTIL=""; QUOTA_RESETS_AT=""; QUOTA_REJECTED=0
  [[ -s "$1" ]] || return 0
  # Last KNOWN value of each field, not the last event's — the final `rejected`
  # row carries no utilization, so reading only the last row would lose it.
  QUOTA_UTIL="$(jq -r 'select(.type=="rate_limit_event")
                       | .rate_limit_info.utilization // empty' "$1" 2>/dev/null | tail -1)"
  QUOTA_RESETS_AT="$(jq -r 'select(.type=="rate_limit_event")
                            | .rate_limit_info.resetsAt // empty' "$1" 2>/dev/null | tail -1)"
  # Either signal counts as "the wall was hit": a rejected rate-limit row, or a
  # result that ended on an HTTP 429.
  if jq -e 'select(.type=="rate_limit_event" and .rate_limit_info.status=="rejected")' \
        "$1" >/dev/null 2>&1 \
     || jq -e 'select(.type=="result" and .api_error_status==429)' "$1" >/dev/null 2>&1; then
    QUOTA_REJECTED=1
  fi
  return 0
}

# Epoch -> local wall-clock. BSD date takes -r, GNU date takes -d @.
fmt_epoch() {
  [[ -n "${1:-}" && "$1" != "null" ]] || { printf 'unknown\n'; return; }
  date -r "$1" '+%H:%M (%a %d %b)' 2>/dev/null \
    || date -d "@$1" '+%H:%M (%a %d %b)' 2>/dev/null \
    || printf '%s\n' "$1"
}

# Float compare without bc: awk is everywhere, bc is not.
ge_float() { awk -v a="${1:-0}" -v b="${2:-0}" 'BEGIN { exit !(a >= b) }'; }

# Sleep until the quota window rolls over, +60s of slack. Prints a countdown so
# a watching human can see it is waiting rather than wedged.
wait_for_reset() {  # $1 = epoch
  local target=$(( ${1:-0} + 60 )) now remain
  now="$(date +%s)"
  if (( target <= now )); then note "Reset time already passed — continuing."; return 0; fi
  log "⏳ Waiting for the usage limit to reset at $(fmt_epoch "${1:-0}")"
  while :; do
    now="$(date +%s)"; remain=$(( target - now ))
    (( remain <= 0 )) && break
    printf '\r\033[90m  %dm %02ds remaining…\033[0m   ' $(( remain / 60 )) $(( remain % 60 ))
    sleep $(( remain > 60 ? 60 : remain ))
  done
  printf '\r\033[K'
  note "Usage limit window reset — resuming."
}

# --- Network -----------------------------------------------------------------
# When the link drops mid-ticket the CLI does not fail quietly: it retries ten
# times with backoff, then ends the session with
#   {"type":"result","terminal_reason":"api_error","is_error":true,
#    "result":"API Error: Can't reach the API server ... (ENOTFOUND)"}
# and exits 1. Read literally that is "claude exited 1", which the loop used to
# treat as a ticket failure — so an outage marked the ticket blocked and then
# burned every remaining ticket in seconds, each dying on the same dead link.
# Nothing was wrong with any of them. So an outage is classified apart from a
# failure and handled like the quota wall: park the work, wait, retry the SAME
# ticket in a fresh session.
API_OUTAGE=0

read_api_error() {  # $1 = path to the ticket transcript
  API_OUTAGE=0
  [[ -s "$1" ]] || return 0
  # A 429 is quota, not connectivity, and read_quota already owns it.
  if jq -e 'select(.type=="result" and .terminal_reason=="api_error"
                   and (.api_error_status != 429))' "$1" >/dev/null 2>&1; then
    API_OUTAGE=1
  fi
  return 0
}

# Is the API reachable? Any HTTP status counts, including 401 — the question is
# whether packets get there, not whether we are authorised, so no key is sent.
# curl exit 0 means a response arrived; 6 (DNS) and 7 (connect) mean it did not.
api_reachable() {
  if command -v curl >/dev/null 2>&1; then
    curl -sS -o /dev/null -m 10 "$NET_PROBE_URL" >/dev/null 2>&1 && return 0
    return 1
  fi
  # No curl: fall back to name resolution, which catches the common case (a
  # sleeping or unplugged laptop) even though it says nothing about the API.
  host api.anthropic.com >/dev/null 2>&1 && return 0
  return 1
}

# Block until the link returns. Backs off 15s → 30s → 60s and stays there, so a
# long outage costs a handful of probes an hour rather than a busy loop.
# Returns 1 if --network-wait ran out, 2 if a stop was requested while waiting.
wait_for_network() {  # $1 = short reason for the log
  api_reachable && return 0
  log "🌐 No route to the API — ${1:-waiting for the link to come back}"
  local started delay=15 waited=0 remaining
  started="$(date +%s)"
  while :; do
    if stop_requested; then printf '\r\033[K'; note "Stop requested while waiting."; return 2; fi
    # The deadline is honoured to the second rather than overshot by a whole
    # backoff step: --network-wait 20 gives up at 20s, not at the 45s the
    # 15 → 30 backoff would otherwise reach.
    if (( NET_WAIT_MAX > 0 )); then
      remaining=$(( NET_WAIT_MAX - waited ))
      if (( remaining <= 0 )); then
        printf '\r\033[K'
        note "Still offline after $(fmt_duration "$waited") — giving up (--network-wait)."
        return 1
      fi
      (( delay > remaining )) && delay="$remaining"
    fi
    printf '\r\033[K\033[90m  offline for %s — next probe in %ss…\033[0m' \
      "$(fmt_duration "$waited")" "$delay"
    sleep "$delay"
    waited=$(( $(date +%s) - started ))
    if api_reachable; then
      printf '\r\033[K'
      note "Link is back after $(fmt_duration "$waited") — resuming."
      return 0
    fi
    (( delay < 60 )) && delay=$(( delay * 2 ))
  done
}

# What the settings box says about sleep. Honest about the one case caffeinate
# does not cover, because that is the case people actually hit.
caffeinate_line() {
  if (( ! CAFFEINATE )); then printf 'not held off (--no-caffeinate)\n'; return; fi
  if [[ "$(uname -s)" != "Darwin" ]] || ! command -v caffeinate >/dev/null 2>&1; then
    printf 'not held off (no caffeinate on this machine)\n'; return
  fi
  printf 'idle sleep held off; a lid close still sleeps, and is survived\n'
}

fmt_duration() {  # $1 = seconds
  local s="${1:-0}"
  if (( s < 60 )); then printf '%ds\n' "$s"
  elif (( s < 3600 )); then printf '%dm %02ds\n' $(( s / 60 )) $(( s % 60 ))
  else printf '%dh %02dm\n' $(( s / 3600 )) $(( s % 3600 / 60 )); fi
}

# --- Was the transcript cut short? --------------------------------------------
# The render chain is `claude | tee jsonl | jq | live_lines`. When a stage of it
# dies, claude keeps working with nowhere to write: the jsonl freezes mid-ticket
# and the run goes blind, which is how a ticket could fail for half an hour with
# no record of what it did. A finished session always emits a `result` event, so
# its absence is the signature. Claude Code keeps its own complete copy of every
# session, and that one survives, so it is what a reader is pointed at.
transcript_is_whole() {
  grep -q '"type":"result"' "$1" 2>/dev/null
}
session_transcript() {
  local id slug
  id="$(grep -o '"session_id":"[0-9a-f-]*"' "$1" 2>/dev/null | head -1 | cut -d'"' -f4)"
  [[ -n "$id" ]] || return 1
  slug="${PWD//\//-}"
  printf '%s\n' "$HOME/.claude/projects/$slug/$id.jsonl"
}
warn_if_transcript_cut() {
  local jsonl="$1" whole=""
  if transcript_is_whole "$jsonl"; then return 0; fi
  note "The streamed transcript stops mid-ticket: $jsonl holds no result event."
  note "That is the render chain dying, not the ticket. What the agent did is in:"
  if whole="$(session_transcript "$jsonl")"; then
    note "  $whole"
  else
    note "  ~/.claude/projects/ — the session id was never streamed either."
  fi
  if [[ -s "${PRETTY_ERR:-}" ]]; then note "  jq wrote its errors to $PRETTY_ERR"; fi
  return 0
}

# --- What each ticket cost ----------------------------------------------------
# Read back off the transcript the same way pretty() reads it, and for the same
# reason: the numbers are already on disk, so nothing extra is plumbed into the
# live pipe. Two of the three are not simple sums, so they are taken carefully:
#   time    wall clock, measured by bash around the ticket. NOT the sum of
#           .duration_ms, which counts only the turns the model was awake for —
#           a ticket that waited twenty minutes on a background agent really did
#           take twenty minutes of your evening.
#   cost    the LAST result's .total_cost_usd, which is cumulative over the
#           session. Adding the results together would count the first turn once
#           per turn that followed it.
#   tokens  the last result's .modelUsage, the session running total across
#           every model the session touched.
# A ticket retried after an outage runs a fresh session that overwrites the
# transcript, so each attempt is added as it finishes and the row shows what the
# ticket cost in total, not what its last attempt cost.
TICKET_START=0
TICKET_COST=0
TICKET_IN=0
TICKET_OUT=0
TICKET_CACHE=0

reset_ticket_stats() {
  TICKET_START="$(date +%s)"; TICKET_COST=0; TICKET_IN=0; TICKET_OUT=0; TICKET_CACHE=0
}

add_ticket_stats() {  # $1 = path to the ticket transcript
  [[ -s "$1" ]] || return 0
  local row cost inn out cache
  row="$(jq -rs '
      ([ .[] | select(.type == "result") ] | last) as $l
      | (($l.modelUsage // {}) | [ .[] ]) as $m
      | [ ($l.total_cost_usd // 0),
          ([ $m[].inputTokens  // 0 ] | add // 0),
          ([ $m[].outputTokens // 0 ] | add // 0),
          ([ $m[] | (.cacheReadInputTokens // 0) + (.cacheCreationInputTokens // 0) ] | add // 0) ]
      | @tsv' "$1" 2>/dev/null)" || row=""
  [[ -n "$row" ]] || return 0
  IFS=$'\t' read -r cost inn out cache <<<"$row"
  TICKET_COST="$(awk -v a="$TICKET_COST" -v b="${cost:-0}" 'BEGIN { printf "%.6f", a + b }')"
  TICKET_IN=$((    TICKET_IN    + ${inn:-0}   ))
  TICKET_OUT=$((   TICKET_OUT   + ${out:-0}   ))
  TICKET_CACHE=$(( TICKET_CACHE + ${cache:-0} ))
}

# 441 -> "441", 196638 -> "196.6k", 34144840 -> "34.1M". Same shape as the 🏁
# line so a number in the report can be found in the transcript above it.
abbrev_num() {  # $1 = count
  awk -v n="${1:-0}" 'BEGIN {
    if (n >= 1000000)   printf "%.1fM", n / 1000000
    else if (n >= 1000) printf "%.1fk", n / 1000
    else                printf "%d", n }'
}
fmt_money() { awk -v v="${1:-0}" 'BEGIN { printf "%.2f", v }'; }

# --- The report ---------------------------------------------------------------
# One markdown file per feature, written the moment that feature stops, before
# the next one starts. That timing is the point: a queue of three specs left
# running overnight is three files to read in the morning, each finished and on
# disk even if the run died in the middle of the one after it.
#
# Rows are appended as tickets finish rather than reconstructed at the end, so a
# run killed mid-feature still reports every ticket that did finish.
FEATURE_ROWS=""          # tsv: num, outcome, seconds, cost, in, out, cache, title, detail
FEATURE_REPORT=""        # where write_feature_report() puts the markdown

# The detail column: what the ticket actually changed, in the words the agent
# used when it committed. Its own commit subjects say that better than anything
# this script could infer, and they cost nothing to read.
commit_lines() {  # $1 = before sha
  # Oldest first, so it reads as the order the work happened in, and at most
  # three: a ticket that made eleven commits is not summarised by listing them.
  # `--max-count` rather than `| head -3`: under `set -o pipefail` head closes
  # the pipe on the fourth commit, git dies on SIGPIPE, and the substitution
  # comes back as a failure with the column empty.
  git log --reverse --max-count=3 --format='%s' "$1..HEAD" 2>/dev/null \
    | awk 'NR > 1 { printf " · " } { printf "%s", $0 }'
}

# One tab-free, newline-free, untrimmed-space-free line. Tabs would split the
# row it is written into and a pipe would split the markdown cell it ends up in.
one_cell() {  # $1 = text
  printf '%s' "$1" | tr '\t\n|' '  /' | sed -e 's/  */ /g' -e 's/^ //' -e 's/ $//'
}

record_ticket() {  # $1 = NN, $2 = outcome, $3 = detail
  local secs=$(( $(date +%s) - TICKET_START ))
  local tpath; tpath="$(path_for "$1" 2>/dev/null)" || tpath=""
  local title=""
  [[ -n "$tpath" ]] && title="$(title_of "$tpath")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$1" "$2" "$secs" "$TICKET_COST" "$TICKET_IN" "$TICKET_OUT" "$TICKET_CACHE" \
    "$(one_cell "$title")" "$(one_cell "$3")" \
    >>"$FEATURE_ROWS"
}

# The board as it stands now, as a markdown table. Same three columns print_plan
# shows on the terminal, because the question they answer is the same one: what
# is left, and what is it waiting on.
board_table() {
  local num path st blockers
  printf '| # | Status | Blocked by | Title |\n'
  printf '| --- | --- | --- | --- |\n'
  while IFS=$'\t' read -r num path; do
    st="$(status_of "$path")"
    blockers="$(blockers_of "$path" | sed 's/[[:space:]]*$//')"
    [[ -z "$blockers" ]] && blockers="-"
    printf '| %s | %s | %s | %s |\n' "$num" "$st" "$blockers" "$(title_of "$path")"
  done < <(ticket_files)
}

# $1 = feature name, $2 = branch, $3 = start epoch, $4 = one-line outcome.
write_feature_report() {
  local name="$1" branch="$2" started="$3" outcome="$4"
  local now; now="$(date +%s)"
  local num out secs cost inn outt cache title detail
  local n_done=0 n_fail=0 n_other=0
  local t_secs=0 t_cost=0 t_in=0 t_out=0 t_cache=0

  {
    printf '# %s — run %s\n\n' "$name" "$RUN_ID"
    printf '**Outcome:** %s\n\n' "$outcome"
    printf '| | |\n| --- | --- |\n'
    printf '| Tickets | `%s` |\n' "$ISSUES_DIR"
    printf '| Spec | `%s` |\n' "$SPEC_HINT"
    printf '| Branch | `%s` |\n' "$branch"
    printf '| Model | %s |\n' "$(model_display)"
    printf '| Started | %s |\n' "$(fmt_epoch "$started")"
    printf '| Finished | %s |\n' "$(fmt_epoch "$now")"
    printf '| Elapsed | %s |\n' "$(fmt_duration $(( now - started )))"
    printf '| Logs | `%s/` |\n' "$FEATURE_LOG_DIR"
    printf '\n'
  } >"$FEATURE_REPORT"

  if [[ ! -s "$FEATURE_ROWS" ]]; then
    printf '## This run\n\nNo ticket ran.\n\n' >>"$FEATURE_REPORT"
  else
    {
      printf '## This run\n\n'
      printf '| # | Ticket | Outcome | Time | Cost | Tokens in / out / cache |\n'
      printf '| --- | --- | --- | --- | --- | --- |\n'
    } >>"$FEATURE_REPORT"
    while IFS=$'\t' read -r num out secs cost inn outt cache title detail; do
      printf '| %s | %s | %s | %s | $%s | %s / %s / %s |\n' \
        "$num" "$title" "$out" "$(fmt_duration "$secs")" "$(fmt_money "$cost")" \
        "$(abbrev_num "$inn")" "$(abbrev_num "$outt")" "$(abbrev_num "$cache")" \
        >>"$FEATURE_REPORT"
      case "$out" in
        completed) n_done=$(( n_done + 1 )) ;;
        blocked)   n_fail=$(( n_fail + 1 )) ;;
        *)         n_other=$(( n_other + 1 )) ;;
      esac
      t_secs=$((  t_secs  + secs  ))
      t_in=$((    t_in    + inn   ))
      t_out=$((   t_out   + outt  ))
      t_cache=$(( t_cache + cache ))
      t_cost="$(awk -v a="$t_cost" -v b="$cost" 'BEGIN { printf "%.6f", a + b }')"
    done <"$FEATURE_ROWS"

    {
      printf '\n**Totals:** %d completed' "$n_done"
      (( n_fail  > 0 )) && printf ', %d failed' "$n_fail"
      (( n_other > 0 )) && printf ', %d unfinished' "$n_other"
      printf ' · %s in tickets · $%s · %s in / %s out / %s cache\n\n' \
        "$(fmt_duration "$t_secs")" "$(fmt_money "$t_cost")" \
        "$(abbrev_num "$t_in")" "$(abbrev_num "$t_out")" "$(abbrev_num "$t_cache")"

      printf '## What each ticket did\n\n'
    } >>"$FEATURE_REPORT"

    while IFS=$'\t' read -r num out secs cost inn outt cache title detail; do
      {
        printf '### %s — %s\n\n' "$num" "$title"
        printf '%s in %s · $%s · %s tokens in, %s out, %s cached\n\n' \
          "$out" "$(fmt_duration "$secs")" "$(fmt_money "$cost")" \
          "$(abbrev_num "$inn")" "$(abbrev_num "$outt")" "$(abbrev_num "$cache")"
        if [[ -n "$detail" ]]; then
          printf '%s\n\n' "$detail"
        fi
      } >>"$FEATURE_REPORT"
    done <"$FEATURE_ROWS"
  fi

  {
    printf '## The board after this run\n\n'
    board_table
    printf '\n'
  } >>"$FEATURE_REPORT"

  # The totals the driver prints on the terminal and rolls into the run-wide
  # file. Set here so the arithmetic lives in exactly one place.
  FEATURE_SUM_DONE="$n_done"
  FEATURE_SUM_FAIL="$n_fail"
  FEATURE_SUM_OTHER="$n_other"
  FEATURE_SUM_SECS="$(( now - started ))"
  FEATURE_SUM_COST="$t_cost"
  FEATURE_SUM_IN="$t_in"
  FEATURE_SUM_OUT="$t_out"
  FEATURE_SUM_CACHE="$t_cache"
  FEATURE_OUTCOME="$outcome"
}

# --- Stopping from outside ----------------------------------------------------
# Three ways in, one way out. `touch .ralph-stop` from any shell, Ctrl-C, or
# `kill <pid>` all end up here: the ticket stops, its work is committed as
# wip(NN), and its status stays in-progress so the next run resumes it.
STOP_REQUESTED=0         # set by the trap, or found by stop_requested()
INTERRUPT_SIGNAL=""      # which signal, if it was a signal

stop_requested() {
  (( STOP_REQUESTED )) && return 0
  [[ -n "$STOP_FILE" && -e "$STOP_FILE" ]] && return 0
  return 1
}

on_signal() {  # $1 = signal name
  # A second Ctrl-C means "I do not care, get out now". Honour it: the first one
  # is already parking the work, and someone pressing it twice wants the shell
  # back more than they want a tidy commit.
  if (( STOP_REQUESTED )); then
    printf '\n\033[31m  Second %s — quitting now. The tree is left as it is.\033[0m\n' "$1" >&2
    exit 130
  fi
  STOP_REQUESTED=1
  INTERRUPT_SIGNAL="$1"
  printf '\n\033[33m  %s — stopping the whole run. Parking the current ticket…\033[0m\n' "$1" >&2
  # Deliberately no cleanup beyond that line. Bash runs a trap only after the
  # foreground command returns, so by the time this fires `claude` is already
  # gone and the loop below is about to read STOP_REQUESTED and do the parking
  # properly, with the run log and the ticket file both in reach.
}

# Kill the running `claude` the moment the stop file appears. It runs inside a
# pipeline, so its pid is passed through a file rather than a variable — a
# pipeline stage is a subshell and its variables never reach the parent.
watch_for_stop() {  # $1 = path to the pid file
  local pidf="$1" pid
  while :; do
    sleep "$STOP_POLL"
    [[ -n "$STOP_FILE" && -e "$STOP_FILE" ]] || continue
    pid="$(cat "$pidf" 2>/dev/null || true)"
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null
    return 0
  done
}

# Park a failed ticket's half-finished work in a commit instead of leaving it
# loose in the tree. Two reasons: a stranded working tree forces the next run to
# need --allow-dirty, and a resuming agent can read `git log` but cannot tell
# which loose edits were its own.
#
# It stages ONLY paths that are new since the run started (new_dirty_files), so
# a --allow-dirty baseline of your own unrelated WIP is never swept in.
wip_commit() {  # $1 = ticket number, $2 = why
  (( NO_WIP_COMMIT )) && return 0
  local paths
  paths="$(new_dirty_files | cut -c4- | sed 's/^"//; s/"$//')"
  [[ -n "$paths" ]] || return 0
  printf '%s\n' "$paths" | tr '\n' '\0' | xargs -0 git add -- >>"$RUN_LOG" 2>&1 || return 0
  git diff --cached --quiet && return 0
  git commit -q -m "wip($1): partial work — $2" >>"$RUN_LOG" 2>&1 || return 0
  note "Partial work committed as wip($1) so nothing is stranded in the tree."
}

new_dirty_files() {
  if [[ -n "$BASELINE_DIRTY" && -s "$BASELINE_DIRTY" ]]; then
    dirty_files | grep -Fxv -f "$BASELINE_DIRTY" || true
  else
    dirty_files
  fi
}

START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BASE_DISPLAY="${BASE_REF:-$START_BRANCH}"

is_protected() {  # $1 = branch name
  local b; for b in $PROTECTED_BRANCHES; do [[ "$1" == "$b" ]] && return 0; done; return 1
}

# One sentence saying exactly what will happen to git, in the mode chosen. This
# is the line worth reading twice before saying yes. Both arguments are optional
# and default to the feature running now, so the queue screen can describe a
# feature that has not started yet without disturbing anything.
branch_plan_line() {  # $1 = branch, $2 = what it is cut from
  local br="${1:-$NEW_BRANCH}" base="${2:-$BASE_DISPLAY}"
  case "$BRANCH_MODE" in
    new)
      if git show-ref --verify --quiet "refs/heads/$br"; then
        printf 'reuse existing branch %s — every ticket commits there\n' "$br"
      else
        printf 'create %s from %s — every ticket commits there\n' "$br" "$base"
      fi ;;
    current)
      printf 'commit every ticket on %s (no branch created)\n' "$START_BRANCH" ;;
    per-ticket)
      if [[ -n "$BASE_REF" ]]; then
        printf 'one branch per ticket, each cut from %s (UNSTACKED)\n' "$BASE_REF"
      else
        printf 'one branch per ticket, stacked, first cut from %s\n' "$base"
      fi ;;
  esac
}

# What feature number $1 (1-based) will be cut from, before any of it has run.
# With no --base, feature 2 starts from wherever feature 1 left off — the queue
# stacks, which is what running one spec after another means. That is true in
# `new` mode and in `per-ticket` mode both, so neither may show the run's
# starting HEAD for a feature that is not the first one.
predicted_base() {  # $1 = 1-based position in the queue
  local pos="$1"
  if (( pos <= 1 )); then printf '%s\n' "$BASE_DISPLAY"; return; fi
  if [[ -n "$BASE_REF" ]]; then printf '%s\n' "$BASE_REF"; return; fi
  case "$BRANCH_MODE" in
    new)
      printf '%s\n' "$(branch_for "${FEATURE_DIRS[$(( pos - 2 ))]}")" ;;
    # The tip feature 2 is cut from is the last ticket branch feature 1 makes,
    # and which ticket that is depends on what is still eligible when it gets
    # there. So name the feature rather than print a branch that may not be the
    # one.
    per-ticket)
      printf 'the last ticket branch of %s\n' "$(feature_name "${FEATURE_DIRS[$(( pos - 2 ))]}")" ;;
    *)
      printf '%s\n' "$BASE_DISPLAY" ;;
  esac
}

# One pass per status rather than an associative array: macOS ships bash 3.2,
# which has no `declare -A`, and 26 files makes the extra passes free.
status_tally() {
  local out="" k n num path
  for k in completed in-progress ready-for-agent blocked; do
    n=0
    while IFS=$'\t' read -r num path; do
      [[ "$(status_of "$path")" == "$k" ]] && n=$(( n + 1 ))
    done < <(ticket_files)
    (( n > 0 )) && out="$out$n $k, "
  done
  printf '%s\n' "${out%, }"
}

# --- Which branch? ------------------------------------------------------------
# Asked when no branching flag was passed, and asked BEFORE the settings screen —
# unlike the model, which is asked after it. The difference is that this answer is
# read by the screen itself: the "Git plan" line, the derived branch name and the
# protected-branch guard all come off it, so asking afterwards would print a plan
# for a mode nobody chose.
#
# Writes $BRANCH_MODE, and $NEW_BRANCH / $ALLOW_PROTECTED where the answer implies
# them. Never uses note(): the log directory does not exist yet.
choose_branch_mode() {
  local derived cur pick="" name="" reply="" d
  derived="${NEW_BRANCH:-$(branch_for "${FEATURE_DIRS[0]}")}"
  cur="$START_BRANCH"

  ask_header "Which branch should the tickets commit to?"
  printf '\033[90m  Every ticket commits locally. Nothing is ever pushed.\033[0m\n\n'

  if (( ${#FEATURE_DIRS[@]} > 1 )); then
    printf '    1)  %-18s %s\n' "new branch" "one branch per feature, stacked  [default]"
    for d in "${FEATURE_DIRS[@]}"; do
      printf '        \033[90m%s\033[0m\n' "$(branch_for "$d")"
    done
  else
    printf '    1)  %-18s %s\n' "new branch" "one branch for the whole run  [default]"
    if git show-ref --verify --quiet "refs/heads/$derived"; then
      printf '        \033[90m%s already exists — it would be reused, so a re-run continues\033[0m\n' "$derived"
    else
      printf '        \033[90m%s, cut from %s\033[0m\n' "$derived" "$BASE_DISPLAY"
    fi
  fi
  printf '    2)  %-18s %s\n' "current branch" "commit onto the branch already checked out"
  printf '        \033[90m%s — nothing is created\033[0m\n' "$cur"
  printf '    3)  %-18s %s\n' "one per ticket" "a branch per ticket, STACKED"
  printf '        \033[90mticket/NN-slug, each cut from the previous ticket'"'"'s tip\033[0m\n'

  printf '\nPick [1-3, default 1]: '
  read -r pick || pick=""
  pick="${pick%$'\r'}"; pick="${pick// /}"
  [[ -z "$pick" ]] && pick=1

  case "$pick" in
    1)
      BRANCH_MODE="new"
      if (( ${#FEATURE_DIRS[@]} > 1 )); then
        # A typed name here means ONE branch for the whole queue, which is a
        # real answer and not a mistake — so it is offered, and blank keeps the
        # branch-per-feature default rather than being rejected.
        printf 'Branch name for ALL of them, or blank for one per feature: '
        read -r name || name=""
        name="${name%$'\r'}"; name="${name// /}"
        if [[ -n "$name" ]]; then NEW_BRANCH="$name"; NEW_BRANCH_EXPLICIT=1
        else NEW_BRANCH="$(branch_for "${FEATURE_DIRS[0]}")"; fi
      else
        printf 'Branch name [%s]: ' "$derived"
        read -r name || name=""
        name="${name%$'\r'}"; name="${name// /}"
        NEW_BRANCH="${name:-$derived}"
        [[ -n "$name" ]] && NEW_BRANCH_EXPLICIT=1
      fi
      ;;
    2)
      BRANCH_MODE="current"
      if [[ -n "$BASE_REF" ]]; then
        echo "--base $BASE_REF has nothing to cut: this mode creates no branch." >&2
        exit 1
      fi
      # The same refusal the guard below applies, asked here instead — where the
      # person can still say yes, rather than as an error after they confirmed.
      if is_protected "$cur" && (( ! ALLOW_PROTECTED )); then
        printf '\n\033[31m  %s is a protected branch.\033[0m\n' "$cur"
        printf '  Commit agent work directly onto it? [y/N] '
        read -r reply || reply=""
        reply="${reply%$'\r'}"
        if [[ "$reply" == "y" || "$reply" == "Y" ]]; then
          ALLOW_PROTECTED=1
        else
          echo "Aborted. Nothing was changed."
          exit 0
        fi
      fi
      ;;
    3)
      BRANCH_MODE="per-ticket"
      if [[ -n "$BASE_REF" ]]; then
        printf '\n\033[33m  --base %s un-stacks these: every ticket is cut from it, so a\033[0m\n' "$BASE_REF"
        printf '\033[33m  ticket blocked by an earlier one starts without its code.\033[0m\n'
      fi
      ;;
    *)
      echo "Not one of the options. Nothing was changed." >&2
      exit 1
      ;;
  esac

  BRANCH_MODE_PICKED=1
  if (( ${#FEATURE_DIRS[@]} > 1 )) && [[ "$BRANCH_MODE" == "new" ]] && (( ! NEW_BRANCH_EXPLICIT )); then
    printf '\n  \033[1mGit plan: a branch per feature, each cut from the one before it\033[0m\n'
  else
    printf '\n  \033[1mGit plan: %s\033[0m\n' "$(branch_plan_line)"
  fi
}

# --- Model -------------------------------------------------------------------
# The model every ticket's session runs on. The CLI has no machine-readable list
# of models, so this is a curated menu of the aliases `claude --model` documents,
# plus a free-text escape hatch that accepts exactly what that flag accepts.
#
# Option 0 is deliberately "pass no --model at all", which is NOT the same as
# passing the alias your default happens to resolve to: settings.json can pin a
# full model id and a context variant that no alias reproduces.
#
# The labels carry no version number. An alias always resolves to the newest
# model of its family, so a hard-coded "Opus 5" goes stale on the next release.
# The {opus} / {sonnet} / {haiku} tokens are filled in by latest_model_names.
MODEL_CHOICES=(
  "opus[1m]|{opus}, 1M-token context. Most capable, most expensive"
  "opus|{opus}, standard context"
  "sonnet|{sonnet}. Much cheaper and faster, fine for mechanical tickets"
  "sonnet[1m]|{sonnet}, 1M-token context"
  "haiku|{haiku}. Cheapest and weakest, rarely right for /implement"
)

# Newest display name per family, e.g. "Claude Opus 5.5". Filled once, lazily,
# by latest_model_names. Plain variables, not `declare -A`: macOS ships bash 3.2.
LATEST_OPUS="" LATEST_SONNET="" LATEST_HAIKU=""
LATEST_FETCHED=0

# Ask GET /v1/models for the newest model of each family. It lists models
# newest first, and listing them costs nothing. It needs an API key, and a
# subscription login has none, so without ANTHROPIC_API_KEY (or when the call
# fails or times out) each family falls back to "<Family> (latest)".
latest_model_names() {
  (( LATEST_FETCHED )) && return 0
  LATEST_FETCHED=1
  local json=""
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]] && command -v curl >/dev/null 2>&1; then
    json="$(curl -sS -m 5 "https://api.anthropic.com/v1/models?limit=100" \
      -H "x-api-key: $ANTHROPIC_API_KEY" \
      -H "anthropic-version: 2023-06-01" 2>/dev/null)" || json=""
  fi
  newest() {
    [[ -n "$json" ]] || return 0
    jq -r --arg p "claude-$1" \
      'first(.data[]? | select(.id | startswith($p)) | .display_name) // empty' \
      <<<"$json" 2>/dev/null
  }
  LATEST_OPUS="$(newest opus)";     LATEST_OPUS="${LATEST_OPUS:-Opus (latest)}"
  LATEST_SONNET="$(newest sonnet)"; LATEST_SONNET="${LATEST_SONNET:-Sonnet (latest)}"
  LATEST_HAIKU="$(newest haiku)";   LATEST_HAIKU="${LATEST_HAIKU:-Haiku (latest)}"
}

# One menu label with its {family} token swapped for the newest name.
model_label() {
  local s="$1"
  s="${s//\{opus\}/$LATEST_OPUS}"
  s="${s//\{sonnet\}/$LATEST_SONNET}"
  s="${s//\{haiku\}/$LATEST_HAIKU}"
  printf '%s\n' "$s"
}
MODEL_PICKED=0           # 1 once the value in $MODEL is final (flag or picker)
[[ -n "$MODEL" ]] && MODEL_PICKED=1

# What `claude` would use if we passed nothing. Most specific settings file wins,
# same precedence the CLI itself applies.
configured_model() {
  local f m
  for f in ".claude/settings.local.json" ".claude/settings.json" "$HOME/.claude/settings.json"; do
    [[ -f "$f" ]] || continue
    m="$(jq -r '.model // empty' "$f" 2>/dev/null)" || m=""
    [[ -n "$m" ]] && { printf '%s\n' "$m"; return 0; }
  done
  printf 'unset — the CLI picks\n'
}

model_display() {
  if [[ -n "$MODEL" ]]; then
    printf '%s\n' "$MODEL"
  elif (( MODEL_PICKED )) || (( ASSUME_YES )) || [[ ! -t 0 ]]; then
    printf 'default — %s\n' "$(configured_model)"
  else
    printf 'chosen from a list before you confirm\n'
  fi
}

# Asked once, just before the confirmation prompt — after the guards, so a run
# that is going to be refused never asks. Writes $MODEL; never uses note(),
# because the log directory does not exist yet at this point.
choose_model() {
  local entry i=1 other pick=""
  latest_model_names
  ask_header "Model for this run"
  printf '\033[90m  One `claude -p` session per ticket, every one of them on what you pick here.\033[0m\n\n'
  printf '    %d)  %-12s %s\n' 0 "(default)" "keep your configured default — $(configured_model)"
  for entry in "${MODEL_CHOICES[@]}"; do
    printf '    %d)  %-12s %s\n' "$i" "${entry%%|*}" "$(model_label "${entry#*|}")"
    i=$(( i + 1 ))
  done
  other=$i
  # Plain "other", no ellipsis: printf pads by bytes, so a multibyte glyph here
  # would knock this row out of line with the ones above it.
  printf '    %d)  %-12s %s\n' "$other" "other" "type a full model id, e.g. claude-opus-5-5"

  printf '\nPick [0-%d, default 0]: ' "$other"
  read -r pick || pick=""
  pick="${pick%$'\r'}"; pick="${pick// /}"
  [[ -z "$pick" ]] && pick=0

  MODEL_PICKED=1
  if [[ "$pick" == "0" ]]; then
    MODEL=""
  elif [[ "$pick" == "$other" ]]; then
    printf 'Model id: '
    read -r MODEL || MODEL=""
    MODEL="${MODEL%$'\r'}"
  elif [[ "$pick" =~ ^[0-9]+$ ]] && (( pick >= 1 && pick < other )); then
    entry="${MODEL_CHOICES[$(( pick - 1 ))]}"
    MODEL="${entry%%|*}"
  else
    printf '\033[31m  Not one of the options — keeping the default.\033[0m\n'
    MODEL=""
  fi
  printf '\n  \033[1mRunning on: %s\033[0m\n' "$(model_display)"
}

# The queue, feature by feature, as the settings box shows it: what will run,
# in what order, onto which branch, starting from which ticket. Printed before
# the first `claude` starts, so a queue aimed at the wrong backlog is caught
# while the answer is still "n".
#
# It re-points $ISSUES_DIR at each feature in turn, because status_tally() and
# next_ticket() read the board off that global — and puts it back afterwards.
print_queue() {
  local d nxt i=1 saved_dir="$ISSUES_DIR" saved_spec="$SPEC_HINT" spec
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Queue" \
    "$( (( ${#FEATURE_DIRS[@]} > 1 )) && echo "${#FEATURE_DIRS[@]} features, run one after the other" || echo '1 feature' )"
  for d in "${FEATURE_DIRS[@]}"; do
    ISSUES_DIR="$d"; SPEC_HINT="$(spec_for "$d")"; spec="$SPEC_HINT"
    nxt="$(next_ticket)"
    printf '\033[1;36m│\033[0m\n'
    printf '\033[1;36m│\033[0m  \033[1m%d) %s\033[0m\n' "$i" "$(feature_name "$d")"
    printf '\033[1;36m│\033[0m     %-11s %s\n' "Tickets" "$d — $(status_tally)"
    printf '\033[1;36m│\033[0m     %-11s %s%s\n' "Spec" "$spec" "$( [[ -f "$spec" ]] || printf '   (MISSING)' )"
    printf '\033[1;36m│\033[0m     %-11s %s\n' "Git plan" "$(branch_plan_line "$(branch_for "$d")" "$(predicted_base "$i")")"
    if [[ -n "$nxt" ]]; then
      printf '\033[1;36m│\033[0m     %-11s %s — %s\n' "Starts at" "$nxt" "$(title_of "$(path_for "$nxt")")"
    else
      printf '\033[1;36m│\033[0m     %-11s %s\n' "Starts at" "nothing eligible — this one would be skipped"
    fi
    i=$(( i + 1 ))
  done
  ISSUES_DIR="$saved_dir"; SPEC_HINT="$saved_spec"
}

print_settings() {
  printf '\n\033[1;36m┌─ Ralph tickets — run %s\033[0m\n' "$RUN_ID"
  printf '\033[1;36m│\033[0m\n'
  print_queue
  printf '\033[1;36m│\033[0m\n'
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Repo"        "$(basename "$(git rev-parse --show-toplevel)")"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "HEAD now"    "$START_BRANCH @ $(git rev-parse --short HEAD)"
  # `|| true`: grep -c exits 1 on zero matches, and under `set -o pipefail` that
  # would kill the script — but only ever on a clean tree.
  local ndirty; ndirty="$(dirty_files | grep -c . | tr -d ' ' || true)"; ndirty="${ndirty:-0}"
  if (( ndirty > 0 )); then
    if (( ALLOW_DIRTY )); then
      printf '\033[1;36m│\033[0m  %-14s \033[33m%s\033[0m\n' "Dirty tree" \
        "$ndirty pre-existing change(s) — ignored all run, and they ride onto the branch"
    else
      printf '\033[1;36m│\033[0m  %-14s \033[31m%s\033[0m\n' "Dirty tree" \
        "$ndirty uncommitted change(s) — this run will be refused"
    fi
  fi
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Push"        "never — this script only commits locally"
  printf '\033[1;36m│\033[0m\n'
  printf '\033[1;36m│\033[0m  %-14s \033[1m%s\033[0m\n' "Model"   "$(model_display)"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Per ticket"  "claude -p \"/implement …\" — one fresh context each"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Permissions" "bypassPermissions (no prompts, unattended)"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Limit"       "$( (( MAX_TICKETS > 0 )) && echo "$MAX_TICKETS ticket(s) this run" || echo 'run until nothing is eligible' )"
  # Only when narrowed. Unnarrowed it would say the same thing as the line above.
  [[ -n "$ONLY_SET" ]] && \
    printf '\033[1;36m│\033[0m  %-14s \033[1m%s\033[0m\n' "Only" "tickets $ONLY_LIST  (--only $ONLY_ARG)"
  [[ -n "$ORDER_LIST" ]] && \
    printf '\033[1;36m│\033[0m  %-14s \033[1m%s\033[0m\n' "Order" "$ORDER_LIST first, then the rest by number"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "On failure"  "$( (( KEEP_GOING )) && echo 'commit partial work as wip(NN), mark blocked, CARRY ON' || echo 'commit partial work as wip(NN), mark blocked, stop' )"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "On quota"    "$( (( WAIT_FOR_RESET )) && echo 'wait for the reset, then carry on' || echo 'stop cleanly, ticket stays in-progress (exit 2)' )"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Quota stop"  "$(awk -v c="$QUOTA_CEILING" 'BEGIN { printf "no new ticket once utilization >= %.0f%%", c * 100 }')"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Give up after" "$( (( MAX_CONSEC_FAILS > 0 )) && echo "$MAX_CONSEC_FAILS failures in a row" || echo 'never — keep trying every eligible ticket' )"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "On outage"   "$( (( NET_CHECK )) && echo "park the ticket, wait for the link, retry it (up to $NET_RETRIES x)" || echo 'nothing — the ticket fails like any other (--no-network-check)' )"
  printf '\033[1;36m│\033[0m  %-14s \033[1m%s\033[0m\n' "Stop with" "touch $STOP_FILE   (or Ctrl-C, or kill $$)"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Sleep"       "$(caffeinate_line)"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Logs"        "$LOG_DIR/"
  printf '\033[1;36m│\033[0m  %-14s %s\n' "Report"      "one summary.md per feature, written as each one ends"
  printf '\033[1;36m└─\033[0m\n'
}

# Asked before the screen that reports it. Unattended, the documented default
# stands (--new-branch), exactly as it did before this question existed.
if (( ! BRANCH_MODE_PICKED )) && (( ! ASSUME_YES )) && [[ -t 0 ]]; then
  choose_branch_mode
fi

print_settings

# The full ticket table for each feature, under its own heading when there is
# more than one — the queue box above says what will run, this says what is in it.
_saved_dir="$ISSUES_DIR"
for _d in "${FEATURE_DIRS[@]}"; do
  ISSUES_DIR="$_d"
  (( ${#FEATURE_DIRS[@]} > 1 )) && printf '\n  \033[1m%s\033[0m\n' "$(feature_name "$_d")"
  print_plan
done
ISSUES_DIR="$_saved_dir"
unset _d _saved_dir

# Before the dry run exits, so `--dry-run --only ...` reports an unreachable set
# rather than printing a plan that would never have run.
if [[ -n "$ONLY_SET" || -n "$ORDER_LIST" ]]; then
  _saved_dir="$ISSUES_DIR"
  ISSUES_DIR="${FEATURE_DIRS[0]%/}"
  [[ -n "$ORDER_LIST" ]] && check_order
  [[ -n "$ONLY_SET" ]] && check_only_reachable
  ISSUES_DIR="$_saved_dir"
  unset _saved_dir
fi

if (( DRY_RUN )); then
  echo "  (--dry-run: nothing was changed)"
  exit 0
fi

# Across the WHOLE queue: one feature with nothing eligible is skipped past, but
# a queue where none of them has anything eligible is a run with no work in it.
_saved_dir="$ISSUES_DIR"
_any_eligible=0
for _d in "${FEATURE_DIRS[@]}"; do
  ISSUES_DIR="$_d"
  [[ -n "$(next_ticket)" ]] && { _any_eligible=1; break; }
done
ISSUES_DIR="$_saved_dir"
unset _d _saved_dir
(( _any_eligible )) || { echo "Nothing eligible to run in any queued feature. Exiting."; exit 0; }

# --- Guards ------------------------------------------------------------------
if [[ "$BRANCH_MODE" == "current" ]] && is_protected "$START_BRANCH" && (( ! ALLOW_PROTECTED )); then
  echo "Refusing to commit agent work directly onto '$START_BRANCH'." >&2
  echo "Use --new-branch [name] to cut a feature branch off it, or pass" >&2
  echo "--allow-protected if you really mean to commit onto $START_BRANCH." >&2
  exit 1
fi

# A leftover stop file would end the run before the first ticket, several minutes
# after you said yes. Say so now instead, while the fix is one command.
if [[ -n "$STOP_FILE" && -e "$STOP_FILE" ]]; then
  echo "The stop file '$STOP_FILE' is already there, so this run would stop" >&2
  echo "before its first ticket. It is left behind on purpose after a stop." >&2
  echo >&2
  echo "  rm $STOP_FILE" >&2
  exit 1
fi

# A clean tree matters only for a real run: the loop's success signal is "did a
# new commit land, and is the tree clean afterwards", which pre-existing noise
# would defeat. --dry-run reads nothing but the ticket files, so it skips this.
if [[ -n "$(dirty_files)" ]] && (( ! ALLOW_DIRTY )); then
  echo "Working tree is dirty. The loop uses 'did a new commit land, and is the" >&2
  echo "tree clean after?' as its success signal, which this would defeat." >&2
  echo >&2
  dirty_files >&2
  echo >&2
  echo "Either commit the above, or re-run with --allow-dirty to snapshot these" >&2
  echo "exact paths and ignore them for the rest of the run." >&2
  echo >&2
  echo "Do NOT 'git stash -u' to get past this if the script itself is untracked:" >&2
  echo "that deletes the file bash is currently reading." >&2
  exit 1
fi

# --- Confirm -----------------------------------------------------------------
if (( ! ASSUME_YES )); then
  if [[ ! -t 0 ]]; then
    echo "Not a terminal and no -y/--yes given — refusing to start unattended." >&2
    exit 1
  fi
  # Ask for the model first: it is the one setting above that is still open, and
  # it belongs on the same screen as the yes/no rather than behind a re-run.
  (( MODEL_PICKED )) || choose_model
  printf '\nProceed? [y/N] '
  # `|| reply=""` because read returns non-zero at EOF (^D, or a closed stdin),
  # and under `set -e` that would kill the script mid-prompt with no message.
  reply=""
  read -r reply || reply=""
  reply="${reply%$'\r'}"   # some terminals deliver the newline as CRLF
  [[ "$reply" == "y" || "$reply" == "Y" ]] \
    || { echo "Aborted. Nothing was changed."; exit 0; }
fi

mkdir -p "$LOG_DIR"

# Ctrl-C and `kill` become the same graceful stop as the stop file.
trap 'on_signal INT'  INT
trap 'on_signal TERM' TERM
trap 'on_signal HUP'  HUP

# Hold off idle sleep for as long as this script lives. `-w $$` makes caffeinate
# exit on its own when the loop does, so nothing is left holding the machine
# awake if the run dies. It cannot stop a lid close — the OS sleeps regardless
# unless the Mac is on power with a display attached — but the loop survives that
# now: the connection dies, the transcript ends in an api_error, and the ticket
# is retried once the link is back.
CAFFEINATE_PID=""
if (( CAFFEINATE )) && [[ "$(uname -s)" == "Darwin" ]] && command -v caffeinate >/dev/null 2>&1; then
  caffeinate -ims -w $$ >/dev/null 2>&1 &
  CAFFEINATE_PID=$!
fi

# Snapshot what was already dirty, before a single ticket runs.
if (( ALLOW_DIRTY )); then
  BASELINE_DIRTY="$LOG_DIR/baseline-dirty.txt"
  dirty_files >"$BASELINE_DIRTY"
fi

print_settings | strip_ansi >>"$RUN_LOG"

# --- Counters that span the whole run ----------------------------------------
# Kept across features on purpose: --max is a budget for the run, not for each
# feature, and the closing tally is about the evening, not about one spec.
done_count=0
failed_count=0
failed_list=""
color_idx=0

# --- One feature ---------------------------------------------------------------
# Everything that used to be the body of this script, now taking the feature to
# run as an argument. It returns instead of exiting, because a run that gives up
# on feature 1 still has to write feature 1's report before it stops:
#   0  this feature is finished — go on to the next one
#   1  a ticket genuinely failed and the run must stop
#   2  the Claude usage limit was reached
#   3  stopped for a reason that is nobody's fault: you, the network, --max
run_feature() {  # $1 = 1-based position in the queue, $2 = issues dir
  local pos="$1"
  local feature_done=0 feature_failed=0
  local started; started="$(date +%s)"
  local outcome="finished — no eligible ticket left"
  local fstop=0            # what to return once the loop below breaks

  # Re-point every global the ticket machinery reads at THIS feature.
  ISSUES_DIR="${2%/}"
  SPEC_HINT="$(spec_for "$ISSUES_DIR")"
  FEATURE_NAME="$(feature_name "$ISSUES_DIR")"
  [[ "$BRANCH_MODE" == "new" ]] && NEW_BRANCH="$(branch_for "$ISSUES_DIR")"

  # A directory of its own, so ticket 06 of one feature and ticket 06 of the
  # next do not write over each other's transcript.
  FEATURE_LOG_DIR="$LOG_DIR/$(printf '%02d' "$pos")-$FEATURE_NAME"
  mkdir -p "$FEATURE_LOG_DIR"
  FEATURE_ROWS="$FEATURE_LOG_DIR/tickets.tsv"
  FEATURE_REPORT="$FEATURE_LOG_DIR/summary.md"
  : >"$FEATURE_ROWS"

  # --- Set up the one shared branch, if that is the mode ----------------------
  if [[ "$BRANCH_MODE" == "new" ]]; then
    if git show-ref --verify --quiet "refs/heads/$NEW_BRANCH"; then
      git checkout "$NEW_BRANCH" >/dev/null 2>&1
    elif [[ -n "$BASE_REF" ]]; then
      git checkout -b "$NEW_BRANCH" "$BASE_REF" >/dev/null 2>&1
    else
      git checkout -b "$NEW_BRANCH" >/dev/null 2>&1
    fi
  fi

  log "Feature $pos of ${#FEATURE_DIRS[@]} — $FEATURE_NAME — $ISSUES_DIR"
  note "$(branch_plan_line)"
  note "Now on: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
  note "Logs: $FEATURE_LOG_DIR/"
  print_plan | strip_ansi >>"$RUN_LOG"

  consec_fails=0           # genuine failures in a row; a success resets it
  net_attempt=0            # outage retries spent on the ticket in LAST_NUM
  LAST_NUM=""
  STOPPED_AT=""            # ticket left in-progress by a stop, for the wrap-up

  while :; do
  # The stop file is read here, between tickets, as well as during one. A stop
  # that lands in the gap needs no killing and strands nothing.
  if stop_requested; then
    log "🛑 Stop requested — not starting another ticket"
    outcome="stopped on request"; fstop=3
    break
  fi

  if (( MAX_TICKETS > 0 && done_count >= MAX_TICKETS )); then
    log "Reached --max $MAX_TICKETS. Stopping."
    outcome="stopped at the --max ticket budget"; fstop=3
    break
  fi

  NUM="$(next_ticket)"
  if [[ -z "$NUM" ]]; then
    log "No eligible ticket left."
    print_plan | tee -a "$RUN_LOG"
    note "Either everything is completed, or the rest are blocked on a ticket that is not."
    outcome="finished — no eligible ticket left"
    break
  fi

  TPATH="$(path_for "$NUM")"
  TITLE="$(title_of "$TPATH")"
  SLUG="$(slug_of "$TPATH")"
  PREV_STATUS="$(status_of "$TPATH")"
  COLOR="${PALETTE[$(( color_idx % ${#PALETTE[@]} ))]}"
  color_idx=$(( color_idx + 1 ))

  # A ticket started over a dead link fails in seconds having done nothing, and
  # under --keep-going that walks the whole backlog into `blocked` in a minute.
  # So the link is proved before the ticket begins, not discovered by it.
  if (( NET_CHECK )); then
    wait_for_network "waiting before ticket $NUM"; net_rc=$?
    if (( net_rc == 2 )); then
      log "🛑 Stop requested while offline"
      outcome="stopped on request while waiting for the network"; fstop=3
      break
    fi
    if (( net_rc == 1 )); then
      log "🌐 Giving up: the API stayed unreachable"
      note "Nothing was started, so no ticket status changed."
      outcome="gave up — the API stayed unreachable"; fstop=3
      break
    fi
  fi

  # Retries are counted per ticket, so an outage that keeps killing ticket 05
  # cannot loop on it forever while a different ticket starts fresh. The clock
  # and the cost counters reset here for the same reason: a ticket that took
  # three attempts took all three of them, and the report says so.
  if [[ "$NUM" != "$LAST_NUM" ]]; then
    net_attempt=0
    LAST_NUM="$NUM"
    reset_ticket_stats
  fi

  log "Ticket $NUM — $TITLE"

  # --- Branch for this ticket ------------------------------------------------
  if [[ "$BRANCH_MODE" == "per-ticket" ]]; then
    BRANCH="ticket/$NUM-$SLUG"
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
      note "Reusing existing branch $BRANCH"
      git checkout "$BRANCH" >>"$RUN_LOG" 2>&1
    else
      if [[ -n "$BASE_REF" ]]; then
        note "Creating $BRANCH off $BASE_REF"
        git checkout -b "$BRANCH" "$BASE_REF" >>"$RUN_LOG" 2>&1
      else
        note "Creating $BRANCH stacked on $(git rev-parse --abbrev-ref HEAD)"
        git checkout -b "$BRANCH" >>"$RUN_LOG" 2>&1
      fi
    fi
  else
    # `new` and `current` both land here: the branch was settled once, before the
    # loop started, and every ticket commits onto it.
    BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    note "Committing on $BRANCH"
  fi

  # The commit this ticket starts from. It doubles as /code-review's fixed point.
  # Ticket status is written to disk only, never committed: these files live under
  # .scratch/, which this repo gitignores.
  BEFORE_SHA="$(git rev-parse HEAD)"

  # Mark in-progress BEFORE the call, so a crash mid-ticket is recoverable —
  # next_ticket() picks in-progress first and the prompt tells the agent to resume.
  set_status "$TPATH" "in-progress"

  # --- Build the prompt ------------------------------------------------------
  # /implement is deliberately terse (use /tdd, typecheck, full suite, /code-review,
  # "Commit your work to the current branch"). Everything below is the context it
  # needs that the skill itself does not carry.
  RESUME_NOTE=""
  if [[ "$PREV_STATUS" == "in-progress" ]]; then
    RESUME_NOTE="
RESUMING: a previous attempt at this ticket stopped partway through. Before
writing anything, inspect the working tree and \`git log $BEFORE_SHA..HEAD\` to
see what already landed, and continue from there rather than starting over."
  fi

  PROMPT="/implement

Implement EXACTLY ONE ticket, and nothing else: \`$TPATH\`

Read that ticket file in full first. Read \`$ISSUES_DIR/00-index.md\` for where it
sits in the dependency order, and \`$SPEC_HINT\` for the sections the ticket cites.
Its \`- [ ]\` lines are the acceptance criteria — every one of them must be true
when you are done.
$RESUME_NOTE

Scope: do not start, prepare, or partially implement any other ticket. If you
notice work that belongs to another ticket, leave it alone.

Verification before you commit: find this repo's own test, type-check, lint and
format-check commands. Look in CLAUDE.md, AGENTS.md, the README, and the project
config (for example \`package.json\` scripts, \`pyproject.toml\`, a Makefile, or CI
files). Run every one that exists, in the repo's own environment (for example
its \`.venv\` or \`node_modules\`). Do not commit until they all pass.

When you run /code-review, use \`$BEFORE_SHA\` as the fixed point — that is the
commit immediately before this ticket's work began.

Long-running commands: your session ends when your turn ends, so a command you
leave running in the background is a command whose result you never see. Run
anything slow — a live-model pass, a repeat run, the full suite — in the
FOREGROUND with a long \`timeout\` (up to 600000 ms), one command per call, and
split it into several foreground calls if one call would exceed that. Never
park a command in the background and then idle waiting for it. If a command
genuinely cannot finish inside that budget, stop and mark what you have: say in
your final message exactly which command is unfinished and what still needs
measuring, so the ticket is picked up rather than silently stalled.

Background sub-agents: the paragraph above says command, and a sub-agent is not
a command, so read it again for agents. /code-review starts agents in the
background. They report back by waking this session up, and whether that wake-up
lands inside your turn or after your turn has ended is a race that nothing here
controls. A turn that ends while a sub-agent is still working ends the session,
and whatever you were saving until afterwards never happens. So commit the
moment the verification commands pass, and start /code-review only once
that commit exists. What the review finds goes into a second commit. Never end
a turn saying you are waiting for a reviewer before you commit.

Branch policy: do NOT create, switch, delete, or rebase any branch. You are on
\`$BRANCH\` and every commit belongs there. The surrounding script owns branching.

Ticket status: do NOT edit the \`**Status:**\` or \`**Completed at:**\` lines in the
ticket file, and do not edit \`00-index.md\`. The surrounding script owns those.

Your work is not done until it is committed to \`$BRANCH\`."

  ITER_JSONL="$FEATURE_LOG_DIR/ticket-$NUM.jsonl"
  # Where pretty()'s jq writes its own errors. It used to write them to
  # /dev/null, so when the render chain died the transcript simply stopped
  # mid-ticket and nothing said why — see `transcript_is_whole` below.
  PRETTY_ERR="$FEATURE_LOG_DIR/ticket-$NUM.pretty-err.log"
  printf '%s\n' "$PROMPT" >"$FEATURE_LOG_DIR/ticket-$NUM.prompt.txt"

  # An array, so "no model chosen" means the flag is genuinely absent rather than
  # passed empty — `claude --model ""` is an error, not an inherit.
  CLAUDE_ARGS=(--permission-mode bypassPermissions --output-format stream-json --verbose)
  [[ -n "$MODEL" ]] && CLAUDE_ARGS+=(--model "$MODEL")

  # `claude` runs backgrounded inside the pipeline so its pid can be written out
  # and handed to the stop watcher. `wait` gives the subshell claude's own exit
  # status, so PIPESTATUS[0] still means what it always did.
  CPIDF="$FEATURE_LOG_DIR/ticket-$NUM.pid"
  : >"$CPIDF"
  watch_for_stop "$CPIDF" & WATCHER=$!

  set +e
  # stdin from /dev/null: a backgrounded process that reads the terminal is
  # stopped by SIGTTIN, and `claude -p` must never wait on input anyway.
  #
  # The fd shuffle keeps ONE line off the screen. When the watcher kills a job,
  # bash reaps it and prints "Terminated: 15  claude …" — true, but it reads like
  # a crash directly above a message saying the stop was clean. So claude's own
  # stderr is routed out through fd 3 while the subshell's job notices go to
  # /dev/null: every word claude writes still reaches the terminal, and only
  # bash's bookkeeping is dropped.
  ( claude "${CLAUDE_ARGS[@]}" -p "$PROMPT" </dev/null 2>&3 & echo $! >"$CPIDF"; wait $! ) 3>&2 2>/dev/null \
    | tee "$ITER_JSONL" \
    | pretty "$NUM" "$COLOR" | tee >(strip_ansi >>"$RUN_LOG")
  rc="${PIPESTATUS[0]}"
  set -e

  kill "$WATCHER" 2>/dev/null || true
  wait "$WATCHER" 2>/dev/null || true
  rm -f "$CPIDF"

  # --- Verify --------------------------------------------------------------
  AFTER_SHA="$(git rev-parse HEAD)"
  NEW_COMMITS="$(git rev-list --count "$BEFORE_SHA..$AFTER_SHA")"
  read_quota "$ITER_JSONL"
  read_api_error "$ITER_JSONL"
  # Added, not assigned: an attempt that ended in an outage still cost what it
  # cost, and the next attempt overwrites the transcript it was read from.
  add_ticket_stats "$ITER_JSONL"

  # --- You stopped it --------------------------------------------------------
  # Checked before everything else, because a killed `claude` also looks like a
  # non-zero exit and an empty commit — and neither is the ticket's fault. The
  # status stays in-progress, which is the one the picker takes first and the
  # prompt resumes from, so the next run continues rather than starting over.
  if stop_requested; then
    log "🛑 Run stopped${INTERRUPT_SIGNAL:+ by SIG$INTERRUPT_SIGNAL} — ticket $NUM was mid-flight"
    wip_commit "$NUM" "stopped on request mid-ticket"
    note "Ticket $NUM left in-progress — the next run resumes it, it does not restart."
    note "No further ticket is started. A stop stops the whole run, not one ticket."
    STOPPED_AT="$NUM"
    record_ticket "$NUM" "stopped" "Left in-progress with its work committed as wip($NUM). The next run resumes it."
    outcome="stopped on request during ticket $NUM"; fstop=3
    break
  fi

  # --- The link went down ----------------------------------------------------
  # Same reasoning as the quota wall below: nothing is wrong with the ticket, so
  # it never gets `blocked`. Park the work, wait for the link, retry the same
  # ticket in a fresh session that resumes from the wip commit.
  if (( API_OUTAGE )) && (( ! QUOTA_REJECTED )); then
    net_attempt=$(( net_attempt + 1 ))
    log "🌐 Ticket $NUM stopped: the API became unreachable"
    wip_commit "$NUM" "the API became unreachable mid-ticket"
    note "Ticket $NUM left in-progress — attempt $net_attempt of $NET_RETRIES."
    if (( NET_RETRIES > 0 && net_attempt >= NET_RETRIES )); then
      note "That is the last attempt (--network-retries). Stopping while the tree is parked."
      note "Re-run the same command once the connection is steady; it resumes ticket $NUM."
      record_ticket "$NUM" "unfinished" "The API kept dropping. Left in-progress with its work committed as wip($NUM)."
      outcome="gave up on ticket $NUM — the API kept dropping"; fstop=3
      break
    fi
    wait_for_network "ticket $NUM is parked and waiting"; net_rc=$?
    if (( net_rc == 2 )); then
      log "🛑 Stop requested while offline"
      STOPPED_AT="$NUM"
      record_ticket "$NUM" "stopped" "Left in-progress with its work committed as wip($NUM)."
      outcome="stopped on request while ticket $NUM waited for the network"; fstop=3
      break
    fi
    if (( net_rc == 1 )); then
      log "🌐 Giving up: the API stayed unreachable"
      note "Ticket $NUM is in-progress with its work committed. Re-run to resume it."
      record_ticket "$NUM" "unfinished" "The API stayed unreachable. Left in-progress with its work committed as wip($NUM)."
      outcome="gave up on ticket $NUM — the API stayed unreachable"; fstop=3
      break
    fi
    continue                       # same ticket, fresh session, resumes
  fi

  # Running out of quota is NOT a ticket failure — nothing is wrong with the
  # ticket, the work simply ran out of road. It therefore never sets `blocked`
  # (which means "a human must look at this"): the ticket stays `in-progress`,
  # which is the one status the picker takes first and the prompt resumes from.
  if (( QUOTA_REJECTED )); then
    log "⏸  Ticket $NUM stopped: Claude usage limit reached"
    note "Limit resets at $(fmt_epoch "$QUOTA_RESETS_AT")"
    wip_commit "$NUM" "hit the usage limit mid-ticket"
    note "Ticket $NUM left in-progress — a re-run resumes it, it does not restart."
    if (( WAIT_FOR_RESET )); then
      wait_for_reset "$QUOTA_RESETS_AT"
      continue                     # same ticket, fresh session, resumes
    fi
    note "Re-run with --wait-for-reset to have the loop sit out the window itself."
    record_ticket "$NUM" "unfinished" "The usage limit was reached. Left in-progress with its work committed as wip($NUM)."
    outcome="paused at ticket $NUM — the Claude usage limit was reached"
    STOPPED_AT="$NUM"
    fstop=2
    break
  fi

  fail_reason=""
  if [[ "$rc" -ne 0 ]]; then
    fail_reason="claude exited $rc"
  elif [[ "$NEW_COMMITS" -eq 0 ]]; then
    fail_reason="no commit landed (the agent never committed its work)"
  elif [[ -n "$(new_dirty_files)" ]]; then
    fail_reason="work left uncommitted in the working tree"
  fi

  if [[ -n "$fail_reason" ]]; then
    wip_commit "$NUM" "$fail_reason"
    set_status "$TPATH" "blocked"
    log "❌ Ticket $NUM failed: $fail_reason"
    note "Transcript: $ITER_JSONL"
    warn_if_transcript_cut "$ITER_JSONL"
    note "Prompt:     $FEATURE_LOG_DIR/ticket-$NUM.prompt.txt"
    note "On branch $BRANCH. Fix by hand, then set **Status:** to in-progress to"
    note "resume from what is already there, or ready-for-agent to start it over."
    failed_count=$(( failed_count + 1 ))
    feature_failed=$(( feature_failed + 1 ))
    failed_list="$failed_list $NUM"
    consec_fails=$(( consec_fails + 1 ))
    record_ticket "$NUM" "blocked" "$fail_reason"
    # One broken assumption — a test command that does not exist, a repo rule
    # every ticket trips on — fails every ticket the same way. Under --keep-going
    # that used to march the whole backlog into `blocked` unattended. A run of
    # failures with no success between them is evidence about the RUN, not about
    # the tickets, so the loop stops and leaves the rest untouched.
    if (( MAX_CONSEC_FAILS > 0 && consec_fails >= MAX_CONSEC_FAILS )); then
      log "🛑 $consec_fails tickets failed in a row — stopping the run"
      note "Something is wrong with the run, not with ticket $NUM alone."
      note "Read $FEATURE_LOG_DIR/ before re-running; the untouched tickets are still eligible."
      outcome="stopped — $consec_fails tickets failed in a row"; fstop=1
      break
    fi
    # --keep-going is safe from looping: the ticket is now `blocked`, which
    # next_ticket() never picks, so the frontier moves on rather than retrying.
    if (( KEEP_GOING )) && [[ "$BRANCH_MODE" != "per-ticket" ]]; then
      note "--keep-going: moving on to the next eligible ticket."
      continue
    fi
    if [[ "$BRANCH_MODE" == "per-ticket" ]]; then
      note "Downstream tickets stack on this branch, so the loop stops here."
    fi
    outcome="stopped — ticket $NUM failed: $fail_reason"
    fstop=1
    break
  fi

  # --- Success -------------------------------------------------------------
  set_status "$TPATH" "completed"
  stamp_completed_at "$TPATH"

  done_count=$(( done_count + 1 ))
  feature_done=$(( feature_done + 1 ))
  consec_fails=0
  net_attempt=0
  log "✅ Ticket $NUM done — $NEW_COMMITS commit(s) on $BRANCH"
  note "$(git log --oneline "$BEFORE_SHA..HEAD" | sed 's/^/    /')"
  # What it did, in the agent's own words: its commit subjects. Cheaper and more
  # honest than asking a model to summarise work it has already described.
  record_ticket "$NUM" "completed" "$(commit_lines "$BEFORE_SHA")"

  # --- Pre-emptive quota stop ------------------------------------------------
  # The cheapest place to run out of quota is BETWEEN tickets, where the tree is
  # clean and the last ticket is genuinely finished. Being killed inside a ticket
  # strands uncommitted work and makes the next session reconstruct it from the
  # diff. So once utilization is high, stop here rather than start another.
  if [[ -n "$QUOTA_UTIL" ]] && ge_float "$QUOTA_UTIL" "$QUOTA_CEILING"; then
    QUOTA_PCT="$(awk -v u="$QUOTA_UTIL" 'BEGIN { printf "%.0f", u * 100 }')"
    log "⏸  Quota at ${QUOTA_PCT}% — not starting another ticket rather than risk being cut off inside one"
    note "Limit resets at $(fmt_epoch "$QUOTA_RESETS_AT")"
    if (( WAIT_FOR_RESET )); then
      wait_for_reset "$QUOTA_RESETS_AT"
    else
      note "All work so far is committed and every ticket status is on disk."
      note "Re-run the same command after the reset to carry on, or use"
      note "--wait-for-reset to have the loop sit out the window itself."
      outcome="paused after ticket $NUM — quota at ${QUOTA_PCT}%"; fstop=3
      break
    fi
  fi
done

  # --- This feature is finished ----------------------------------------------
  # Written here, before the next feature starts, and written whatever ended
  # the loop. That is the whole point of the file: a queue left running
  # overnight is one finished report per feature in the morning, even for the
  # features that came before the one the run died in.
  if (( fstop == 0 && feature_failed > 0 )); then
    outcome="finished, but $feature_failed ticket(s) are blocked (--keep-going)"
  fi
  local branch_now; branch_now="$(git rev-parse --abbrev-ref HEAD)"
  write_feature_report "$FEATURE_NAME" "$branch_now" "$started" "$outcome"

  log "Feature $pos — $FEATURE_NAME — $outcome"
  note "$feature_done completed$( (( feature_failed > 0 )) && echo ", $feature_failed failed" ) · $(fmt_duration "$FEATURE_SUM_SECS") · \$$(fmt_money "$FEATURE_SUM_COST")"
  note "Summary: $FEATURE_REPORT"

  return "$fstop"
}

# --- The queue ---------------------------------------------------------------
# One feature at a time, in the order they were picked. Anything that stops a
# feature for a reason other than "it is done" stops the queue as well: a run
# that hit the usage limit or a broken assumption has no business starting a
# fresh backlog on top of it.
QUEUE_ROWS="$LOG_DIR/features.tsv"
: >"$QUEUE_ROWS"
RUN_STARTED="$(date +%s)"
RUN_EXIT=0
QUEUE_RAN=0
QUEUE_LEFT=""

log "Ralph tickets run $RUN_ID — ${#FEATURE_DIRS[@]} feature(s) — branch mode: $BRANCH_MODE"
note "Logs: $LOG_DIR/"

qpos=1
for _fd in "${FEATURE_DIRS[@]}"; do
  # Called as an `if` condition, which is the one place `set -e` lets a non-zero
  # status through untouched. `set +e` around the call would NOT do: the ticket
  # loop inside turns errexit back on around the `claude` pipeline, so by the
  # time the function returns the guard is gone and a returned 1 kills the run
  # before a single report is written.
  # `&& … || …`, because a command on the left of && is exempt from `set -e`
  # and $? on the right is still the function's own status. `if ! run_feature`
  # would not do: inside the then-branch $? is the status of the NEGATION, which
  # is always 0, so every feature would look like it succeeded.
  frc=0
  run_feature "$qpos" "$_fd" && frc=0 || frc=$?
  QUEUE_RAN=$(( QUEUE_RAN + 1 ))

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$qpos" "$FEATURE_NAME" "$(printf '%s' "$FEATURE_OUTCOME" | tr '\t\n' '  ')" \
    "$FEATURE_SUM_DONE" "$FEATURE_SUM_FAIL" "$FEATURE_SUM_OTHER" \
    "$FEATURE_SUM_SECS" "$FEATURE_SUM_COST" \
    "$(( FEATURE_SUM_IN + FEATURE_SUM_OUT + FEATURE_SUM_CACHE ))" \
    "$FEATURE_REPORT" >>"$QUEUE_ROWS"

  if (( frc != 0 )); then
    if (( frc == 3 )); then RUN_EXIT=0; else RUN_EXIT="$frc"; fi
    if (( qpos < ${#FEATURE_DIRS[@]} )); then
      _left_i="$qpos"
      while (( _left_i < ${#FEATURE_DIRS[@]} )); do
        QUEUE_LEFT="$QUEUE_LEFT $(feature_name "${FEATURE_DIRS[$_left_i]}")"
        _left_i=$(( _left_i + 1 ))
      done
      unset _left_i
      log "⏭  The rest of the queue was not started:$QUEUE_LEFT"
      note "Nothing in those features was touched. Re-run to pick up where this stopped."
    fi
    break
  fi
  qpos=$(( qpos + 1 ))
done

# --- The run-wide report ------------------------------------------------------
# One more markdown file, above the per-feature ones: the glance that says which
# feature this run got to and what each of them cost, with a link into the
# feature file for the ticket-by-ticket detail.
write_run_report() {
  local now; now="$(date +%s)"
  local pos name outcome nd nf no secs cost toks report
  local t_secs=0 t_cost=0 t_toks=0 t_done=0 t_fail=0
  local f="$LOG_DIR/run-summary.md"

  {
    printf '# Ralph tickets — run %s\n\n' "$RUN_ID"
    printf '| | |\n| --- | --- |\n'
    printf '| Queued | %d feature(s) |\n' "${#FEATURE_DIRS[@]}"
    printf '| Ran | %d |\n' "$QUEUE_RAN"
    printf '| Started | %s |\n' "$(fmt_epoch "$RUN_STARTED")"
    printf '| Finished | %s |\n' "$(fmt_epoch "$now")"
    printf '| Elapsed | %s |\n' "$(fmt_duration $(( now - RUN_STARTED )))"
    printf '| Model | %s |\n' "$(model_display)"
    printf '| Branch mode | %s |\n' "$BRANCH_MODE"
    printf '| Logs | `%s/` |\n' "$LOG_DIR"
    printf '\n## Features\n\n'
    printf '| # | Feature | Outcome | Done | Failed | Unfinished | Time | Cost | Tokens | Report |\n'
    printf '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
  } >"$f"

  if [[ -s "$QUEUE_ROWS" ]]; then
    while IFS=$'\t' read -r pos name outcome nd nf no secs cost toks report; do
      printf '| %s | %s | %s | %s | %s | %s | %s | $%s | %s | [summary](%s) |\n' \
        "$pos" "$name" "$outcome" "$nd" "$nf" "$no" \
        "$(fmt_duration "$secs")" "$(fmt_money "$cost")" "$(abbrev_num "$toks")" \
        "${report#$LOG_DIR/}" >>"$f"
      t_secs=$(( t_secs + secs ))
      t_toks=$(( t_toks + toks ))
      t_done=$(( t_done + nd ))
      t_fail=$(( t_fail + nf ))
      t_cost="$(awk -v a="$t_cost" -v b="$cost" 'BEGIN { printf "%.6f", a + b }')"
    done <"$QUEUE_ROWS"
  fi

  {
    printf '\n**Totals:** %d ticket(s) completed' "$t_done"
    (( t_fail > 0 )) && printf ', %d failed' "$t_fail"
    printf ' · %s · $%s · %s tokens\n' \
      "$(fmt_duration "$t_secs")" "$(fmt_money "$t_cost")" "$(abbrev_num "$t_toks")"
    if [[ -n "$QUEUE_LEFT" ]]; then
      printf '\n**Not started:**%s\n' "$QUEUE_LEFT"
    fi
  } >>"$f"

  RUN_REPORT="$f"
}
write_run_report

# --- Wrap up -----------------------------------------------------------------
log "Run $RUN_ID finished — $done_count completed$( (( failed_count > 0 )) && echo ", $failed_count failed" )"
# The morning report: every board the run touched, not just this run's tickets.
_saved_dir="$ISSUES_DIR"
for _d in "${FEATURE_DIRS[@]}"; do
  ISSUES_DIR="$_d"
  (( ${#FEATURE_DIRS[@]} > 1 )) && printf '\n  \033[1m%s\033[0m\n' "$(feature_name "$_d")"
  print_plan
  print_plan | strip_ansi >>"$RUN_LOG"
done
ISSUES_DIR="$_saved_dir"
unset _d _saved_dir

if (( failed_count > 0 )); then
  note "Failed this run:$failed_list — transcripts in $LOG_DIR/"
fi
if [[ -n "$STOPPED_AT" ]]; then
  note "Ticket $STOPPED_AT is in-progress with its work committed. Re-running resumes it."
fi
if [[ -n "$STOP_FILE" && -e "$STOP_FILE" ]]; then
  note "The stop file is still there. Remove it before the next run:  rm $STOP_FILE"
fi
FINAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
case "$BRANCH_MODE" in
  per-ticket)
    note "Branches from this run (stacked, newest last):"
    git branch --list 'ticket/*' | sed 's/^/    /'
    note "You are on $FINAL_BRANCH." ;;
  new)
    if (( ${#FEATURE_DIRS[@]} > 1 )) && (( ! NEW_BRANCH_EXPLICIT )); then
      note "One branch per feature, each cut from the one before it:"
      for _d in "${FEATURE_DIRS[@]}"; do
        git show-ref --verify --quiet "refs/heads/$(branch_for "$_d")" \
          && note "    $(branch_for "$_d")"
      done
      unset _d
      note "You are on $FINAL_BRANCH."
    else
      note "All commits are on $FINAL_BRANCH, cut from $BASE_DISPLAY."
      note "Review with: git log --oneline $BASE_DISPLAY..$FINAL_BRANCH"
    fi ;;
  current)
    note "All commits are on $FINAL_BRANCH." ;;
esac
note "Nothing was pushed — that is always yours to do."
note "Logs: $LOG_DIR/"

# The line to read first tomorrow morning. Printed last so it is the line still
# on screen, and printed per feature as well because that is where the
# ticket-by-ticket detail lives.
printf '\n  \033[1mRun summary:\033[0m %s\n' "$RUN_REPORT"
if [[ -s "$QUEUE_ROWS" ]]; then
  while IFS=$'\t' read -r _p _n _o _a _b _c _d2 _e _f _rep; do
    printf '    \033[90m%s  %s\033[0m\n' "$_p" "$_rep"
  done <"$QUEUE_ROWS"
  unset _p _n _o _a _b _c _d2 _e _f _rep
fi
printf '\n'

# 130 is what a shell reports for "killed by Ctrl-C", so a wrapper or a cron
# entry can tell an interrupted run from a finished one. The wrap-up above still
# ran: the exit code says how it ended, not whether it cleaned up.
[[ -n "$INTERRUPT_SIGNAL" ]] && exit 130
# The queue's exit code is the first non-zero one a feature returned: 1 a ticket
# genuinely failed, 2 the usage limit, 3 stopped by you, the network or --max.
exit "$RUN_EXIT"
