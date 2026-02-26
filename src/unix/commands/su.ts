import type { UnixCommandInstaller } from "../types";

export const installSu: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "su",
        description: "switch user or run a command as another user",
        source: makeSyscallSource("su", [
          "let target = 'root';",
          "let password;",
          "let login = false;",
          "let command = [];",
          "// runtime implementation supports: su [-|--login] [user] [-c 'cmd'] [--password pass]",
          "if (!target) sys.write('su: user not found');"
        ]),
        run: async ({ args, sys }) => {
          let loginShell = false;
          let targetName = "root";
          let targetAssigned = false;
          let password: string | undefined;
          let commandArgs: string[] = [];
          let parsingOptions = true;
  
          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i];
            if (!arg) {
              continue;
            }
  
            if (parsingOptions && arg === "--") {
              parsingOptions = false;
              if (!targetAssigned && i + 1 < args.length) {
                targetName = args[i + 1] ?? targetName;
                targetAssigned = true;
                i += 1;
              }
              if (i + 1 < args.length) {
                commandArgs = args.slice(i + 1);
              }
              break;
            }
  
            if (parsingOptions && (arg === "-" || arg === "-l" || arg === "--login")) {
              loginShell = true;
              continue;
            }
  
            if (parsingOptions && (arg === "--password" || arg === "--password-stdin")) {
              const value = args[i + 1];
              if (!value) {
                sys.write(`su: option '${arg}' requires an argument`);
                return;
              }
              password = value;
              i += 1;
              continue;
            }
  
            if (parsingOptions && (arg === "-c" || arg === "--command")) {
              const value = args[i + 1];
              if (!value) {
                sys.write(`su: option '${arg}' requires an argument`);
                return;
              }
              commandArgs = sys.helpers.tokenizeShellInput(value);
              i += 1;
              continue;
            }
  
            if (parsingOptions && (arg === "-p" || arg === "-m" || arg === "--preserve-environment")) {
              // environment handling is no-op in this shell implementation
              continue;
            }
  
            if (parsingOptions && arg.startsWith("-")) {
              sys.write(`su: invalid option -- '${arg}'`);
              sys.write("Try 'su --help' for more information.");
              return;
            }
  
            if (!targetAssigned) {
              targetName = arg;
              targetAssigned = true;
              continue;
            }
  
            if (commandArgs.length === 0) {
              commandArgs = args.slice(i);
              break;
            }
          }
  
          const actor = sys.runtime.getActiveUser();
          const target = sys.runtime.getUser(targetName);
          if (!target) {
            sys.write(`su: user '${targetName}' does not exist`);
            return;
          }
  
          const requiresPassword = actor.uid !== 0 && actor.username !== target.username;
          if (requiresPassword) {
            const stdinPassword = sys.process.stdin.replace(/\r\n/g, "\n").split("\n")[0]?.trim() ?? "";
            let suppliedPassword = password ?? (stdinPassword.length > 0 ? stdinPassword : undefined);
            if (!suppliedPassword) {
              const entered = await sys.runtime.bridge.readSecret("Password: ");
              suppliedPassword = entered !== null ? entered : undefined;
            }
            if (!suppliedPassword) {
              sys.write("su: Authentication failure");
              return;
            }
  
            const verified = await sys.helpers.verifyUserPassword(target, suppliedPassword);
            if (!verified) {
              sys.write("su: Authentication failure");
              return;
            }
          }
  
          if (commandArgs.length > 0) {
            let originalCwd: string | null = null;
            if (loginShell) {
              originalCwd = sys.runtime.fs.pwd();
              sys.runtime.fs.mkdir(target.home);
              sys.runtime.fs.cd(target.home);
            }
  
            const ok = await sys.runtime.runCommandByArgv(commandArgs, {
              stdin: sys.process.stdin,
              stdout: (message = "") => {
                sys.write(message);
              },
              runAsUser: target,
              isTTY: sys.process.isTTY
            });
  
            if (loginShell && originalCwd !== null) {
              sys.runtime.fs.cd(originalCwd);
            }
  
            if (!ok) {
              return;
            }
            return;
          }
  
          sys.helpers.enterInteractiveShell({
            user: target,
            loginShell
          });
        }
      });
};
