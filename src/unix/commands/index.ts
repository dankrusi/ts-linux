import { installHelp } from "./help";
import { installMkdir } from "./mkdir";
import { installPwd } from "./pwd";
import { installCd } from "./cd";
import { installBash } from "./bash";
import { installExit } from "./exit";
import { installWhich } from "./which";
import { installId } from "./id";
import { installLs } from "./ls";
import { installCat } from "./cat";
import { installHead } from "./head";
import { installTail } from "./tail";
import { installGrep } from "./grep";
import { installWc } from "./wc";
import { installNano } from "./nano";
import { installVi } from "./vi";
import { installVim } from "./vim";
import { installEcho } from "./echo";
import { installTouch } from "./touch";
import { installCp } from "./cp";
import { installCpp } from "./cpp";
import { installMv } from "./mv";
import { installRm } from "./rm";
import { installChmod } from "./chmod";
import { installChown } from "./chown";
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
  installMkdir,
  installPwd,
  installCd,
  installBash,
  installExit,
  installWhich,
  installId,
  installLs,
  installCat,
  installHead,
  installTail,
  installGrep,
  installWc,
  installNano,
  installVi,
  installVim,
  installEcho,
  installTouch,
  installCp,
  installCpp,
  installMv,
  installRm,
  installChmod,
  installChown,
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
