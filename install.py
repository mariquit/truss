# Copyright (c) 2026 John Anthony Mariquit <john@mariquit.com>
# SPDX-License-Identifier: Apache-2.0

"""Terminal selection for install.sh. Write the selected IDs to descriptor 3."""

import curses
import os
import sys


def choose(screen: curses.window, plugins: list[str]) -> list[str]:
    selected: set[int] = set()
    cursor = 0
    while True:
        screen.erase()
        height, width = screen.getmaxyx()
        rows = [
            ("Truss plugin installer", curses.A_BOLD),
            *((f"[{'x' if index in selected else ' '}] {name}",
               curses.A_REVERSE if index == cursor else curses.A_NORMAL)
              for index, name in enumerate(plugins)),
            ("Up/Down: move  Space: toggle  Enter: install  Esc: cancel", curses.A_NORMAL),
        ]
        if height < len(rows) or width < 32:
            rows = [("Resize terminal or press Esc.", curses.A_NORMAL)]
        for row, (text, style) in enumerate(rows):
            screen.addnstr(row, 0, text, width - 1, style)
        screen.refresh()

        key = screen.getch()
        if key == 27:
            return []
        if key == curses.KEY_UP:
            cursor = (cursor - 1) % len(plugins)
        elif key == curses.KEY_DOWN:
            cursor = (cursor + 1) % len(plugins)
        elif key == ord(" "):
            selected.symmetric_difference_update({cursor})
        elif key in (curses.KEY_ENTER, 10, 13) and selected:
            return [name for index, name in enumerate(plugins) if index in selected]


if __name__ == "__main__":
    try:
        choices = curses.wrapper(choose, sys.argv[1:])
    except KeyboardInterrupt:
        sys.exit(130)
    except curses.error as error:
        sys.exit(f"Could not open the installer menu: {error}. Pass plugin IDs or --all instead.")
    if choices:
        with os.fdopen(3, "w") as output:
            output.write("\n".join(choices) + "\n")
