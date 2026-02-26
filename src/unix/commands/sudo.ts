import type { UnixCommandInstaller } from "../types";

export const installSudo: UnixCommandInstaller = (ctx): void => {
  const { core, runtime, helpers } = ctx;
  const { makeSyscallSource, enterInteractiveShell, verifyUserPassword } = helpers;

  core({
        name: "sudo",
        description: "run a command as another user",
        source: makeSyscallSource("sudo", [
          "let user = 'root';",
          "let password;",
          "let command = [];",
          "// runtime implementation supports: sudo [-u user] [-s|-i] [-S] [--password pass] command",
          "if (command.length === 0) sys.write('sudo: missing command');"
        ]),
        run: async ({ args, sys, stdin, isTTY }) => {
          let targetName = "root";
          let password: string | undefined;
          let shellMode = false;
          let loginShell = false;
          let readPasswordFromStdin = false;
          let nonInteractive = false;
          let prompt = "";
          let commandArgs: string[] = [];
  
          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i];
            if (!arg) {
              continue;
            }
  
            if (arg === "--") {
              commandArgs = args.slice(i + 1);
              break;
            }
  
            if (arg === "-u" || arg === "--user") {
              const value = args[i + 1];
              if (!value) {
                sys.write(`sudo: option ${arg} requires a user`);
                return;
              }
              targetName = value;
              i += 1;
              continue;
            }
  
            if (arg === "--password") {
              const value = args[i + 1];
              if (!value) {
                sys.write(`sudo: option ${arg} requires a password`);
                return;
              }
              password = value;
              i += 1;
              continue;
            }
  
            if (arg === "-S" || arg === "--stdin") {
              readPasswordFromStdin = true;
              continue;
            }
  
            if (arg === "-p" || arg === "--prompt") {
              const value = args[i + 1];
              if (!value) {
                sys.write(`sudo: option ${arg} requires an argument`);
                return;
              }
              prompt = value;
              i += 1;
              continue;
            }
  
            if (arg === "-s" || arg === "--shell") {
              shellMode = true;
              continue;
            }
  
            if (arg === "-i" || arg === "--login") {
              shellMode = true;
              loginShell = true;
              continue;
            }
  
            if (arg === "-k" || arg === "--reset-timestamp") {
              continue;
            }
  
            if (arg === "-n" || arg === "--non-interactive") {
              nonInteractive = true;
              continue;
            }
  
            if (arg.startsWith("-")) {
              sys.write(`sudo: invalid option -- '${arg}'`);
              return;
            }
  
            commandArgs = args.slice(i);
            break;
          }
  
          const actor = runtime.getActiveUser();
          if (actor.uid !== 0) {
            if (!actor.sudo) {
              sys.write(`${actor.username} is not in the sudoers file. This incident will be reported.`);
              return;
            }
  
            let suppliedPassword = password;
            if (!suppliedPassword && readPasswordFromStdin) {
              const stdinPassword = stdin.replace(/\r\n/g, "\n").split("\n")[0]?.trim() ?? "";
              suppliedPassword = stdinPassword.length > 0 ? stdinPassword : undefined;
            }
  
            if (!suppliedPassword) {
              if (nonInteractive) {
                sys.write("sudo: a password is required");
                return;
              }
  
              const shownPrompt = prompt.length > 0 ? prompt : `[sudo] password for ${actor.username}: `;
              if (readPasswordFromStdin) {
                sys.write("sudo: no password was provided");
                return;
              }
  
              const entered = await runtime.bridge.readSecret(shownPrompt);
              suppliedPassword = entered !== null ? entered : undefined;
              if (!suppliedPassword) {
                sys.write("sudo: no password was provided");
                return;
              }
            }
  
            const verified = await verifyUserPassword(actor, suppliedPassword);
            if (!verified) {
              sys.write("Sorry, try again.");
              sys.write("sudo: 1 incorrect password attempt");
              return;
            }
          }
  
          const target = runtime.getUser(targetName);
          if (!target) {
            sys.write(`sudo: unknown user: ${targetName}`);
            return;
          }
  
          if (shellMode && commandArgs.length === 0) {
            enterInteractiveShell({
              user: target,
              loginShell
            });
            return;
          }
  
          if (commandArgs.length === 0) {
            sys.write("usage: sudo [-u user] [-p password] command [args...]");
            return;
          }
  
          let originalCwd: string | null = null;
          if (loginShell) {
            originalCwd = runtime.fs.pwd();
            runtime.fs.mkdir(target.home);
            runtime.fs.cd(target.home);
          }
  
          const ok = await runtime.runCommandByArgv(commandArgs, {
            stdin,
            stdout: (message = "") => {
              sys.write(message);
            },
            runAsUser: target,
            isTTY
          });
  
          if (loginShell && originalCwd !== null) {
            runtime.fs.cd(originalCwd);
          }
  
          if (!ok) {
            return;
          }
        }
      });
};
