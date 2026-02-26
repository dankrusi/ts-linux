import type { UnixCommandInstaller } from "../types";

type NslookupRecordType = any;

export const installNslookup: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource } = helpers;

  core({
        name: "nslookup",
        description: "query DNS records for a host",
        source: makeSyscallSource("nslookup", [
          "let type = 'A';",
          "let timeout = 3;",
          "let target;",
          "// runtime supports: nslookup [-type=AAAA] [-timeout=3] host [server]"
        ]),
        run: async ({ args, sys }) => {
          let recordType: NslookupRecordType = "A";
          let timeoutSeconds = 3;
          const operands: string[] = [];
          let parsingOptions = true;
  
          const setRecordType = (rawValue: string): boolean => {
            const parsed = sys.helpers.parseNslookupRecordType(rawValue);
            if (!parsed) {
              sys.write(`nslookup: unsupported query type '${rawValue}'`);
              return false;
            }
            recordType = parsed;
            return true;
          };
  
          const setTimeoutSeconds = (rawValue: string): boolean => {
            const parsed = Number.parseFloat(rawValue);
            if (!Number.isFinite(parsed) || parsed <= 0) {
              sys.write(`nslookup: invalid timeout '${rawValue}'`);
              return false;
            }
            timeoutSeconds = parsed;
            return true;
          };
  
          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i];
            if (!arg) {
              continue;
            }
  
            if (parsingOptions && arg === "--") {
              parsingOptions = false;
              continue;
            }
  
            if (parsingOptions && (arg === "-debug" || arg === "-d2")) {
              continue;
            }
  
            if (parsingOptions && /^(-type=|--type=|-query=|--query=|-q=)/i.test(arg)) {
              const value = arg.replace(/^(-type=|--type=|-query=|--query=|-q=)/i, "");
              if (!setRecordType(value)) {
                return;
              }
              continue;
            }
  
            if (parsingOptions && /^(-timeout=|--timeout=)/i.test(arg)) {
              const value = arg.replace(/^(-timeout=|--timeout=)/i, "");
              if (!setTimeoutSeconds(value)) {
                return;
              }
              continue;
            }
  
            if (parsingOptions && (arg === "-type" || arg === "--type" || arg === "-query" || arg === "--query" || arg === "-q")) {
              const value = args[i + 1];
              if (!value) {
                sys.write(`nslookup: option '${arg}' requires an argument`);
                return;
              }
              if (!setRecordType(value)) {
                return;
              }
              i += 1;
              continue;
            }
  
            if (parsingOptions && (arg === "-timeout" || arg === "--timeout")) {
              const value = args[i + 1];
              if (!value) {
                sys.write(`nslookup: option '${arg}' requires an argument`);
                return;
              }
              if (!setTimeoutSeconds(value)) {
                return;
              }
              i += 1;
              continue;
            }
  
            if (parsingOptions && arg.startsWith("-") && arg !== "-") {
              sys.write(`nslookup: invalid option -- '${arg}'`);
              return;
            }
  
            operands.push(arg);
          }
  
          if (operands.length === 0) {
            sys.write("usage: nslookup [-type=TYPE] [-timeout=SECONDS] host [server]");
            return;
          }
  
          if (operands.length > 2) {
            sys.write("nslookup: too many arguments");
            return;
          }
  
          const host = sys.helpers.normalizeNslookupHost(operands[0] ?? "");
          if (!host) {
            sys.write(`** server can't find ${operands[0] ?? ""}: NXDOMAIN`);
            return;
          }
  
          const requestedServer = operands[1];
          let serverName = requestedServer ?? sys.helpers.NSLOOKUP_PROVIDERS[0].name;
          let serverAddress = requestedServer ?? sys.helpers.NSLOOKUP_PROVIDERS[0].address;
  
          if (sys.helpers.isIpAddress(host)) {
            sys.write(`Server:\t\t${serverName}`);
            sys.write(`Address:\t${serverAddress}#53`);
            sys.write("");
            sys.write("Non-authoritative answer:");
            sys.write(`Name:\t${host}`);
            sys.write(`Address:\t${host}`);
            return;
          }
  
          const result = await sys.helpers.queryNslookup(host, recordType, Math.round(timeoutSeconds * 1000));
          if (result) {
            if (!requestedServer) {
              serverName = result.providerName;
              serverAddress = result.providerAddress;
            }
          }
  
          sys.write(`Server:\t\t${serverName}`);
          sys.write(`Address:\t${serverAddress}#53`);
          sys.write("");
  
          if (!result) {
            sys.write(`** server can't find ${host}: SERVFAIL`);
            return;
          }
  
          if (result.statusCode !== 0 && result.answers.length === 0) {
            const statusLabel = sys.helpers.NSLOOKUP_STATUS_TEXT[result.statusCode] ?? `RCODE${result.statusCode}`;
            sys.write(`** server can't find ${host}: ${statusLabel}`);
            if (result.comment) {
              sys.write(`;; ${result.comment}`);
            }
            return;
          }
  
          if (result.answers.length === 0) {
            sys.write(`*** Can't find ${host}: No answer`);
            return;
          }
  
          sys.write("Non-authoritative answer:");
          sys.write(`Name:\t${host}`);
  
          for (const answer of result.answers) {
            const data = (answer.data ?? "").trim();
            if (data.length === 0) {
              continue;
            }
  
            const typeName = sys.helpers.nslookupAnswerType(answer);
            if (typeName === "A" || typeName === "AAAA") {
              sys.write(`Address:\t${sys.helpers.stripTrailingDot(data)}`);
              continue;
            }
  
            if (typeName === "CNAME") {
              sys.write(`canonical name = ${sys.helpers.stripTrailingDot(data)}`);
              continue;
            }
  
            if (typeName === "MX") {
              sys.write(`mail exchanger = ${data}`);
              continue;
            }
  
            if (typeName === "TXT") {
              const unquoted = data.replace(/^"(.*)"$/, "$1");
              sys.write(`text = "${unquoted}"`);
              continue;
            }
  
            sys.write(`${typeName}:\t${sys.helpers.stripTrailingDot(data)}`);
          }
        }
      });
};
