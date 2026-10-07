# Claudeagotchi

A tiny orange pixel companion that lives in the band above the prompt in Claude Code and acts out what Claude is actually doing. When Claude writes code, he sits down at his little computer and types.

![Claudeagotchi typing at his computer](docs/previews/coding.gif)

He is a native Claude Code mod: a plugin of function hooks. He only watches. Every hook passes its event on unchanged and returns exactly what Claude Code answered, so tools, results and permissions are never touched. He makes no model calls, uses no network, and animates locally from built-in pixel art.

## What he does

| | State | When |
| --- | --- | --- |
| ![](docs/previews/idle.gif) | **Idle** | Nothing is running. He blinks, glances around and bobs, on irregular timing. |
| ![](docs/previews/thinking.gif) | **Thinking** | A prompt is being worked on but no tool is running (the model is generating), or a subagent is still at work. |
| ![](docs/previews/coding.gif) | **Coding** | `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, or a shell command that writes a file (`>`, `tee`, `sed -i`, `patch`). The computer pops up, he types, nods, pauses to read the screen, then packs it away. A quick edit still gets about four seconds of typing. |
| ![](docs/previews/reading.gif) | **Reading** | `Read`, `WebFetch`, and read-only shell commands (`cat`, `head`, `ls`, `git diff`, ...). |
| ![](docs/previews/searching.gif) | **Searching** | `Grep`, `Glob`, `WebSearch`, `ToolSearch`, and `grep`/`rg`/`find` in the shell. |
| ![](docs/previews/running.gif) | **Running** | Other shell commands. He watches a little build box and taps a foot. |
| ![](docs/previews/success.gif) | **Success** | Only after a build, test, lint or type-check command (`npm test`, `pytest`, `cargo build`, `tsc`, `make`, ...) exits successfully. One hop, then back to work. |
| ![](docs/previews/attention.gif) | **Needs attention** | A permission dialog is open, Claude is asking you a question (`AskUserQuestion`), a plan waits for approval, or an MCP server asks for input. He raises an arm and waves until it's answered. |
| ![](docs/previews/error.gif) | **Error** | A build/test/lint command fails, or a turn dies on an API error or refusal. A brief startle, then a puzzled scratch of the head, then back to whatever is happening. |
| ![](docs/previews/resting.gif) | **Resting** | Three quiet minutes. He sits down, closes his eyes and breathes. Any activity wakes him with a stretch. |

Attention and errors interrupt anything immediately. Other changes wait out a short minimum (no flicker during bursts of quick tool calls), except that moving *up* to typing is always immediate. A turn simply ending is never treated as success.

## Install (permanent)

Run these two commands once, in any terminal:

```sh
claude plugin marketplace add https://github.com/ford41b/for-claude-to-work-on.git#claudeagotchi
claude plugin install claudeagotchi@claudeagotchi
```

This installs at user scope, so he appears in every new Claude Code session, including the desktop app's Code tab. Start a new session (or restart the app) to see him above the prompt. No slash command is needed.

## Use

| Command | Does |
| --- | --- |
| `/pet` | Show or hide him. The choice is remembered across sessions. |
| `/pet off` · `/pet on` | Hide or show explicitly. |
| `/pet motion` | Toggle reduced motion: still, recognizable poses instead of animation. Remembered. |
| `/pet preview` | Play every state in turn (about a minute) without any real work. Run it again to stop. |
| `/pet status` | What he's doing and how he's set. |

While hidden, no timers run and nothing redraws.

## Uninstall

```sh
claude plugin uninstall claudeagotchi@claudeagotchi
claude plugin marketplace remove claudeagotchi
```

To keep him installed but off, use `/pet off`, or `claude plugin disable claudeagotchi@claudeagotchi`.

## Limitations

- **Where he shows.** He draws as SVG, which the desktop app, the web and mobile apps, and the VS Code extension support. The plain terminal UI has no vector drawing, so there he stays out of the way and draws nothing. Other mods' rows in the band are kept and drawn below him.
- **One session each.** Every session has its own companion, following only its own activity, subagents included. `/pet` and `/pet motion` apply to the session you type them in right away, and to other sessions the next time they start.
- **Guesses from shell commands.** Whether a shell command is coding, reading, searching or a test is judged from its text, not its effect. A test command's exit code decides success or failure. An interrupted command is neither.
- **Permission dialogs.** These are detected from Claude Code's `PermissionRequest` event and end when the matching tool runs, is denied, or the turn ends. In Auto mode, calls the classifier decides never show a dialog, so he doesn't raise his arm for them.
- **Success is narrow on purpose.** He only celebrates a build, test or check that passed. Answers, edits and ordinary commands earn no hop.

## Development

```sh
claude plugin validate .   # manifest, hooks and state contract
claude plugin test .       # simulated sessions: every state, priorities, timing, /pet
```

`hooks/sprites.ts` holds the artwork: every pose is drawn on a 52×26 pixel grid (3 CSS px per pixel) and assembled into an SVG whose frames are switched by SMIL, so the animation runs in the app without the plugin redrawing. `hooks/machine.ts` decides the state from activity. `hooks/register.tsx` connects Claude Code's events and draws the band.

To try local changes without installing, run `claude --plugin-dir /path/to/this/folder`.
