# Feedback Dispatcher Simulator

A React + Vite educational simulator for a three-level Multilevel Feedback Queue (MLFQ) dispatcher.

## Features
- Three queues: RQ0 (highest), RQ1, RQ2 (lowest).
- Fixed process input and randomized process generation.
- Configurable time quantum and simulation duration.
- Animated playback with play, pause, step and restart controls.
- Queue view, CPU indicator, Gantt chart and dispatcher event log.
- Per-process status and remaining burst time.
- Average waiting time and turnaround time for completed processes.
- CSV export.

## Run on Windows, macOS or Linux

Install Node.js (LTS), then open a terminal in this folder:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

To create a production build:

```bash
npm run build
```

## Default sample
The default five processes preserve the assignment sample:
- P1: arrival 0, burst 3
- P2: arrival 2, burst 6
- P3: arrival 4, burst 4
- P4: arrival 6, burst 5
- P5: arrival 8, burst 2

Set the time quantum to 1 to inspect the original sample scenario. The UI allows quantum 3 for the additional scenario described by the instructor.

## Scheduling model and assumptions
This is currently a **frontend scheduling simulation**. It uses logical CPU-time units and does not create Linux processes or send SIGTSTP/SIGCONT/SIGINT. It models the assignment's stated dispatcher rule: at a quantum boundary, a running process is preempted only when another process is waiting; under the default policy it is demoted one queue when preempted. If no other process is waiting, it continues.

The "Rotate within current queue" option is an alternate comparison mode. The "Demote after quantum..." option is the default feedback policy.

Waiting time is accumulated for ready processes while the simulation clock advances. Average waiting and turnaround times are calculated over completed processes only. Processes unfinished at the selected duration remain unfinished and are excluded from the averages.

## Important integration note
This UI is a working simulator, but it is not yet wired to the existing C/Linux `hostd` dispatcher. The C dispatcher remains the source for the original signal-based process demonstration. To make the React app display events from the real C dispatcher, the C source must be adapted to expose structured events (for example JSON over a local Node.js bridge). Do not describe this frontend simulation as sending Linux signals.
