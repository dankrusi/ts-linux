import type { UnixCommandInstaller } from "../types";

export const installHostname: UnixCommandInstaller = (ctx): void => {
  const { core, runtime, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "hostname",
        description: "show or set system hostname",
        source: makeSyscallSource("hostname", [
          "// runtime supports: hostname, hostname newname"
        ]),
        run: ({ args, sys, user }) => {
          if (args.length === 0 || args[0] === "-s" || args[0] === "--short" || args[0] === "-f" || args[0] === "--fqdn") {
            sys.write(runtime.host);
            return;
          }
  
          if (args.length !== 1) {
            sys.write("usage: hostname [name]");
            return;
          }
  
          const actor = runtime.getUser(user) ?? runtime.getActiveUser();
          if (actor.uid !== 0) {
            sys.write("hostname: you must be root to change the host name");
            return;
          }
  
          const next = args[0] ?? "";
          if (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$/.test(next)) {
            sys.write(`hostname: invalid hostname '${next}'`);
            return;
          }
  
          runtime.host = next;
          runtime.envVars.set("HOSTNAME", next);
        }
      });
};
