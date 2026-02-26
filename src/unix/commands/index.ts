import { installHelp } from "./help";
import { installPwd } from "./pwd";
import { installCd } from "./cd";
import { installBash } from "./bash";
import { installExit } from "./exit";
import { installWhich } from "./which";
import { installLs } from "./ls";
import { installCat } from "./cat";
import { installNano } from "./nano";
import { installVi } from "./vi";
import { installVim } from "./vim";
import { installEcho } from "./echo";
import { installTouch } from "./touch";
import { installCp } from "./cp";
import { installCpp } from "./cpp";
import { installRm } from "./rm";
import { installSu } from "./su";
import { installSudo } from "./sudo";
import { installCurl } from "./curl";
import { installPing } from "./ping";
import { installNslookup } from "./nslookup";
import { installEnv } from "./env";
import { installExport } from "./export";
import { installUptime } from "./uptime";
import { installHostname } from "./hostname";
import { installPs } from "./ps";
import { installKill } from "./kill";
import { installTop } from "./top";
import { installWget } from "./wget";
import { installIfconfig } from "./ifconfig";
import { installNetstat } from "./netstat";
import { installClear } from "./clear";
import { installWhoami } from "./whoami";
import { installUname } from "./uname";
import { installDate } from "./date";
import type { UnixCommandInstaller } from "../types";

export const unixCommandInstallers: UnixCommandInstaller[] = [
  installHelp,
  installPwd,
  installCd,
  installBash,
  installExit,
  installWhich,
  installLs,
  installCat,
  installNano,
  installVi,
  installVim,
  installEcho,
  installTouch,
  installCp,
  installCpp,
  installRm,
  installSu,
  installSudo,
  installCurl,
  installPing,
  installNslookup,
  installEnv,
  installExport,
  installUptime,
  installHostname,
  installPs,
  installKill,
  installTop,
  installWget,
  installIfconfig,
  installNetstat,
  installClear,
  installWhoami,
  installUname,
  installDate,
];
