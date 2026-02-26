# twui

`twui` is a TypeScript website that emulates a terminal in the browser.
It includes:

- A fake Linux-like shell (`ls`, `cd`, `cat`, `pwd`, ...)
- A central virtual filesystem (Linux-like layout: `/bin`, `/usr/bin`, `/usr/local/bin`, `/etc`, `/home`, `/var`, ...)
- Core shell commands installed as executable files in `/bin`
- JS-based executables resolved via `$PATH`
- A TUI API for building richer terminal apps with:
  - layout + drawing (`box`, `window`, `fillRect`, `line`, `write`, `text`)
  - widgets (`progress`, `sparkline`, `list`, `table`)
  - runtime hooks (`onKey`, `interval`, `timeout`, `exit`)
- Tab-driven shell completion: autocomplete, list matches, and cycle matches with repeated `Tab`

## Run

```bash
pnpm install
pnpm dev
```

## Built-in shell commands

- `help`
- `ls [-la1hFd] [path ...]`
- `cd [path]`
- `pwd [-L|-P]`
- `cat [-nbsE] [file ...]`
- `echo [-n|-e|-E] <text>`
- `cp [-rRnvfa] <src>... <dst>`
- `su [-|--login] [--password <password>] [user] [-c "<cmd>"]`
- `sudo [-u <user>] [-S] [--password <password>] <cmd> [args...]`
- `curl [flags] <url>`
- `clear`
- `whoami`
- `uname [-a|-s|-n|-r|-v|-m|-o]`
- `date`
- `which [-a] <command ...>`

Default virtual users:

- `guest` (password: `guest`, sudo enabled)
- `root` (password: `root`)
- `operator` (password: `operator`, no sudo)

`su` and `sudo` accept interactive password entry by default; `sudo -S` reads password from stdin.

## Password Tool

Generate random passwords + hashes for virtual users (tool stays outside browser dist):

```bash
pnpm pwtool -- --user guest --password guest
pnpm pwtool -- --length 24
```

## Built-in JS programs

- `countdown [seconds]`
- `demo-ui`
- `sysmon`
- `ui-lab`
- `hellojs`

## Add custom command programs

Add files/directories and JS executables in `src/main.ts`:

```ts
terminal.addDirectory("/srv/apps");
terminal.addFile("/home/guest/todo.txt", "ship v1");

terminal.registerExecutable({
  name: "mycmd",
  path: "/usr/local/bin/mycmd",
  description: "my custom executable",
  run: async ({ args, println, runTui }) => {
    println(`args: ${args.join(", ")}`);

    await runTui((ui) => {
      ui.clear();
      ui.box(0, 0, ui.width, ui.height, "my app");
      ui.write(2, 2, "press q to quit");
      ui.onKey((key) => {
        if (key.key === "q") {
          ui.exit("my app done");
        }
      });
      ui.render();
    });
  }
});
```
