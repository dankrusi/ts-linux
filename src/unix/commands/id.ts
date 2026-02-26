import type { UnixCommandInstaller } from "../types";

type IdSelector = "default" | "uid" | "gid" | "groups";

export const installId: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
    name: "id",
    description: "print real and effective user and group IDs",
    source: makeSyscallSource("id", [
      "// runtime supports: id, id [-u|-g|-G] [-n] [user]"
    ]),
    run: ({ args, sys }) => {
      let selector: IdSelector = "default";
      let nameOnly = false;
      const operands: string[] = [];
      let parsingOptions = true;

      for (const arg of args) {
        if (parsingOptions && arg === "--") {
          parsingOptions = false;
          continue;
        }

        if (parsingOptions && arg.startsWith("--")) {
          if (arg === "--name") {
            nameOnly = true;
            continue;
          }
          if (arg === "--user") {
            if (selector !== "default" && selector !== "uid") {
              sys.write("id: cannot print 'only' of more than one choice");
              return;
            }
            selector = "uid";
            continue;
          }
          if (arg === "--group") {
            if (selector !== "default" && selector !== "gid") {
              sys.write("id: cannot print 'only' of more than one choice");
              return;
            }
            selector = "gid";
            continue;
          }
          if (arg === "--groups") {
            if (selector !== "default" && selector !== "groups") {
              sys.write("id: cannot print 'only' of more than one choice");
              return;
            }
            selector = "groups";
            continue;
          }
          sys.write(`id: unrecognized option '${arg}'`);
          return;
        }

        if (parsingOptions && arg.startsWith("-") && arg !== "-") {
          for (const flag of arg.slice(1)) {
            if (flag === "n") {
              nameOnly = true;
              continue;
            }
            if (flag === "u") {
              if (selector !== "default" && selector !== "uid") {
                sys.write("id: cannot print 'only' of more than one choice");
                return;
              }
              selector = "uid";
              continue;
            }
            if (flag === "g") {
              if (selector !== "default" && selector !== "gid") {
                sys.write("id: cannot print 'only' of more than one choice");
                return;
              }
              selector = "gid";
              continue;
            }
            if (flag === "G") {
              if (selector !== "default" && selector !== "groups") {
                sys.write("id: cannot print 'only' of more than one choice");
                return;
              }
              selector = "groups";
              continue;
            }
            sys.write(`id: invalid option -- '${flag}'`);
            return;
          }
          continue;
        }

        operands.push(arg);
      }

      if (operands.length > 1) {
        sys.write("id: too many arguments");
        return;
      }

      if (nameOnly && selector === "default") {
        sys.write("id: cannot print only names in default format");
        return;
      }

      const actor = sys.runtime.getUser(sys.process.user) ?? sys.runtime.getActiveUser();
      const targetName = operands[0] ?? actor.username;
      const target = sys.runtime.getUser(targetName);
      if (!target) {
        sys.write(`id: '${targetName}': no such user`);
        return;
      }

      const groupName = sys.helpers.usernameForUid(target.gid);

      switch (selector) {
        case "uid":
          sys.write(nameOnly ? target.username : String(target.uid));
          return;
        case "gid":
          sys.write(nameOnly ? groupName : String(target.gid));
          return;
        case "groups":
          sys.write(nameOnly ? groupName : String(target.gid));
          return;
        default:
          sys.write(
            `uid=${target.uid}(${target.username}) gid=${target.gid}(${groupName}) groups=${target.gid}(${groupName})`
          );
      }
    }
  });
};
