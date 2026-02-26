import type { UnixCommandInstaller } from "../types";

export const installCurl: UnixCommandInstaller = (ctx): void => {
  const { core } = ctx;

  core({
        name: "curl",
        description: "fetch a URL (supports common curl flags)",
        run: async ({ args, sys }) => {
          let target: string | undefined;
          let method = "GET";
          let includeHeaders = false;
          let headOnly = false;
          let body: string | undefined;
          let outputPath: string | undefined;
          let silent = false;
          let showError = false;
          let failHttp = false;
          const headers = new Headers();
          const writeError = (message: string): void => {
            if (!silent || showError) {
              sys.write(message);
            }
          };
  
          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i];
            if (!arg) {
              continue;
            }
  
            if (arg === "-i") {
              includeHeaders = true;
              continue;
            }
  
            if (arg === "-I" || arg === "--head") {
              headOnly = true;
              method = "HEAD";
              continue;
            }
  
            if (arg === "-L" || arg === "--location") {
              continue;
            }
  
            if (arg === "-k" || arg === "--insecure") {
              continue;
            }
  
            if (arg === "-s" || arg === "--silent") {
              silent = true;
              continue;
            }
  
            if (arg === "-S" || arg === "--show-error") {
              showError = true;
              continue;
            }
  
            if (arg === "-f" || arg === "--fail") {
              failHttp = true;
              continue;
            }
  
            if (arg === "-X" || arg === "--request") {
              const value = args[i + 1];
              if (!value) {
                writeError(`curl: option ${arg} requires a method`);
                return;
              }
              method = value.toUpperCase();
              i += 1;
              continue;
            }
  
            if (arg === "-H" || arg === "--header") {
              const header = args[i + 1];
              if (!header) {
                writeError(`curl: option ${arg} requires a header value`);
                return;
              }
              const splitIndex = header.indexOf(":");
              if (splitIndex <= 0) {
                writeError(`curl: invalid header: ${header}`);
                return;
              }
              const key = header.slice(0, splitIndex).trim();
              const value = header.slice(splitIndex + 1).trim();
              headers.set(key, value);
              i += 1;
              continue;
            }
  
            if (arg === "-d" || arg === "--data" || arg === "--data-raw") {
              const value = args[i + 1];
              if (value === undefined) {
                writeError(`curl: option ${arg} requires data`);
                return;
              }
              body = value;
              if (method === "GET") {
                method = "POST";
              }
              i += 1;
              continue;
            }
  
            if (arg === "-o" || arg === "--output") {
              const value = args[i + 1];
              if (!value) {
                writeError(`curl: option ${arg} requires a file path`);
                return;
              }
              outputPath = value;
              i += 1;
              continue;
            }
  
            if (arg === "-A" || arg === "--user-agent") {
              const value = args[i + 1];
              if (!value) {
                writeError(`curl: option ${arg} requires a value`);
                return;
              }
              headers.set("user-agent", value);
              i += 1;
              continue;
            }
  
            if (arg === "--url") {
              const value = args[i + 1];
              if (!value) {
                writeError("curl: option --url requires a URL");
                return;
              }
              target = value;
              i += 1;
              continue;
            }
  
            if (arg.startsWith("-")) {
              writeError(`curl: unknown option: ${arg}`);
              return;
            }
  
            if (!target) {
              target = arg;
              continue;
            }
  
            writeError(`curl: unexpected argument: ${arg}`);
            return;
          }
  
          if (!target) {
            writeError("curl: missing URL");
            return;
          }
  
          const resolvedTarget = sys.helpers.resolveCurlTarget(target, sys.fs);
          if ("error" in resolvedTarget) {
            writeError(resolvedTarget.error);
            return;
          }
  
          if (resolvedTarget.kind === "virtual-file") {
            const fileResult = sys.fs.readFile(resolvedTarget.path);
            if ("error" in fileResult) {
              writeError(fileResult.error.replace(/^cat:/, "curl:"));
              return;
            }
  
            const fileText = fileResult.content;
            const output =
              headOnly || includeHeaders
                ? [
                    "HTTP 200 OK",
                    `content-length: ${fileText.length}`,
                    "content-type: text/plain; charset=utf-8",
                    "",
                    headOnly ? "" : fileText
                  ]
                    .join("\n")
                    .trimEnd()
                : fileText;
  
            if (outputPath) {
              const writeResult = sys.fs.writeFile(outputPath, output);
              if (!writeResult.ok) {
                writeError(writeResult.error);
              }
              return;
            }
  
            sys.write(output);
            return;
          }
  
          let response: Response;
          try {
            response = await fetch(resolvedTarget.url, {
              method,
              headers,
              body,
              redirect: "follow"
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            writeError(`curl: request failed: ${message}`);
            return;
          }
  
          if (failHttp && !response.ok) {
            writeError(`curl: HTTP request failed with status ${response.status}`);
            return;
          }
  
          const statusLine = `HTTP ${response.status} ${response.statusText}`;
          const headerLines = Array.from(response.headers.entries()).map(([key, value]) => {
            return `${key}: ${value}`;
          });
  
          const responseText = headOnly ? "" : await response.text();
          const output =
            headOnly || includeHeaders
              ? [statusLine, ...headerLines, "", responseText].join("\n").trimEnd()
              : responseText;
  
          if (outputPath) {
            const writeResult = sys.fs.writeFile(outputPath, output);
            if (!writeResult.ok) {
              writeError(writeResult.error);
            }
            return;
          }
  
          sys.write(output);
        }
      });
};
