import type { UnixCommandInstaller } from "../types";

export const installWget: UnixCommandInstaller = (ctx): void => {
  const { core, helpers } = ctx;
  const { makeSyscallSource, resolveCurlTarget, basename, filenameFromUrl } = helpers;

  core({
        name: "wget",
        description: "retrieve files from the web",
        source: makeSyscallSource("wget", [
          "// runtime supports: wget [-q] [-O file] URL"
        ]),
        run: async ({ args, sys, fs }) => {
          let target: string | undefined;
          let outputPath: string | undefined;
          let quiet = false;
          let spider = false;
          let showHeaders = false;
          let timeoutSeconds = 12;
  
          for (let i = 0; i < args.length; i += 1) {
            const arg = args[i];
            if (!arg) {
              continue;
            }
  
            if (arg === "-q" || arg === "--quiet") {
              quiet = true;
              continue;
            }
  
            if (arg === "--spider") {
              spider = true;
              continue;
            }
  
            if (arg === "-S" || arg === "--server-response") {
              showHeaders = true;
              continue;
            }
  
            if (arg === "-O" || arg === "--output-document") {
              const value = args[i + 1];
              if (!value) {
                sys.write(`wget: option '${arg}' requires an argument`);
                return;
              }
              outputPath = value;
              i += 1;
              continue;
            }
  
            if (arg === "-T" || arg === "--timeout") {
              const value = args[i + 1];
              if (!value) {
                sys.write(`wget: option '${arg}' requires an argument`);
                return;
              }
              const parsed = Number.parseFloat(value);
              if (!Number.isFinite(parsed) || parsed <= 0) {
                sys.write(`wget: invalid timeout '${value}'`);
                return;
              }
              timeoutSeconds = parsed;
              i += 1;
              continue;
            }
  
            if (arg === "-t" || arg === "--tries" || arg === "--no-check-certificate") {
              if (arg === "-t" || arg === "--tries") {
                i += 1;
              }
              continue;
            }
  
            if (arg.startsWith("-")) {
              sys.write(`wget: unrecognized option '${arg}'`);
              return;
            }
  
            if (!target) {
              target = arg;
              continue;
            }
  
            sys.write(`wget: extra operand '${arg}'`);
            return;
          }
  
          if (!target) {
            sys.write("wget: missing URL");
            return;
          }
  
          const resolved = resolveCurlTarget(target, fs);
          if ("error" in resolved) {
            sys.write(resolved.error.replace(/^curl:/, "wget:"));
            return;
          }
  
          if (resolved.kind === "virtual-file") {
            const fileResult = fs.readFile(resolved.path);
            if ("error" in fileResult) {
              sys.write(fileResult.error.replace(/^cat:/, "wget:"));
              return;
            }
            if (spider) {
              if (!quiet) {
                sys.write(`File '${resolved.path}' exists.`);
              }
              return;
            }
            const destination = outputPath ?? basename(resolved.path);
            const writeResult = fs.writeFile(destination, fileResult.content);
            if (!writeResult.ok) {
              sys.write(writeResult.error);
              return;
            }
            if (!quiet) {
              sys.write(`Saved to '${destination}'`);
            }
            return;
          }
  
          const targetUrl = resolved.url;
          const serverHost = (() => {
            try {
              return new URL(targetUrl).host;
            } catch {
              return targetUrl;
            }
          })();
  
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => {
            controller.abort();
          }, Math.max(250, Math.round(timeoutSeconds * 1000)));
  
          if (!quiet) {
            const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
            sys.write(`--${stamp}--  ${targetUrl}`);
            sys.write(`Resolving ${serverHost}... connected.`);
            sys.write(`Connecting to ${serverHost}... connected.`);
          }
  
          let response: Response;
          try {
            response = await fetch(targetUrl, {
              method: spider ? "HEAD" : "GET",
              cache: "no-store",
              redirect: "follow",
              signal: controller.signal
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            sys.write(`wget: request failed: ${message}`);
            return;
          } finally {
            window.clearTimeout(timeoutId);
          }
  
          if (!quiet) {
            sys.write(`HTTP request sent, awaiting response... ${response.status} ${response.statusText}`);
          }
  
          if (showHeaders && !quiet) {
            for (const [key, value] of response.headers.entries()) {
              sys.write(`  ${key}: ${value}`);
            }
          }
  
          if (spider) {
            if (!quiet) {
              sys.write("Remote file exists.");
            }
            return;
          }
  
          const body = await response.text();
          const destination = outputPath ?? filenameFromUrl(targetUrl);
          const writeResult = fs.writeFile(destination, body);
          if (!writeResult.ok) {
            sys.write(writeResult.error);
            return;
          }
  
          if (!quiet) {
            sys.write(`Length: ${body.length}`);
            sys.write(`Saving to: '${destination}'`);
            sys.write(`'${destination}' saved.`);
          }
        }
      });
};
