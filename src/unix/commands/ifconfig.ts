import type { UnixCommandInstaller } from "../types";

export const installIfconfig: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "ifconfig",
        description: "configure network interfaces",
        source: makeSyscallSource("ifconfig", [
          "// runtime supports: ifconfig [-a]"
        ]),
        run: ({ args, sys }) => {
          if (args.some((arg) => arg !== "-a" && arg !== "--all")) {
            sys.write(`ifconfig: unsupported option '${args[0] ?? ""}'`);
            return;
          }
  
          const seconds = sys.helpers.shellUptimeSeconds();
          const rxPackets = 1200 + seconds * 3;
          const txPackets = 980 + seconds * 2;
          const rxBytes = rxPackets * 730;
          const txBytes = txPackets * 640;
          const loPackets = 400 + seconds;
          const loBytes = loPackets * 128;
  
          sys.write("eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500");
          sys.write("        inet 10.0.2.15  netmask 255.255.255.0  broadcast 10.0.2.255");
          sys.write("        inet6 fe80::242:ac11:f  prefixlen 64  scopeid 0x20<link>");
          sys.write("        ether 02:42:ac:11:00:0f  txqueuelen 1000  (Ethernet)");
          sys.write(
            `        RX packets ${rxPackets}  bytes ${rxBytes} (${Math.round(rxBytes / 1024)}.0 KiB)`
          );
          sys.write(
            `        TX packets ${txPackets}  bytes ${txBytes} (${Math.round(txBytes / 1024)}.0 KiB)`
          );
          sys.write("");
          sys.write("lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536");
          sys.write("        inet 127.0.0.1  netmask 255.0.0.0");
          sys.write("        inet6 ::1  prefixlen 128  scopeid 0x10<host>");
          sys.write(
            `        RX packets ${loPackets}  bytes ${loBytes} (${Math.round(loBytes / 1024)}.0 KiB)`
          );
          sys.write(
            `        TX packets ${loPackets}  bytes ${loBytes} (${Math.round(loBytes / 1024)}.0 KiB)`
          );
        }
      });
};
