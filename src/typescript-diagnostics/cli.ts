#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

type TypeScript = typeof import('typescript');

interface SerializedDiagnostic {
  code: number;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  source?: string;
  highlightLength?: number;
}

interface DiagnosticsStatus {
  state: 'checking' | 'clear' | 'error';
  diagnostics: SerializedDiagnostic[];
}

const HOST = '127.0.0.1';
const MANIFEST_FILE = '__typescript-diagnostics__.json';
const TEMPORARY_MANIFEST_PATTERN = /^__typescript-diagnostics__\..+\.tmp$/;

function printHelp(): void {
  console.log(`Usage: ts-diagnostics [--clear | --help]

Watch the current TypeScript project and expose diagnostics to a local browser.

Options:
  --clear  Remove generated diagnostics manifest files and exit
  --help   Show this help`);
}

function parseMode(args: string[]): 'watch' | 'clear' | 'help' {
  if (args.length === 0) {
    return 'watch';
  }

  if (args.length === 1 && args[0] === '--clear') {
    return 'clear';
  }

  if (args.length === 1 && args[0] === '--help') {
    return 'help';
  }

  printHelp();
  throw new Error(`Unknown or conflicting arguments: ${args.join(' ')}`);
}

function clearManifestFiles(publicDirectory: string): void {
  if (!existsSync(publicDirectory)) {
    return;
  }

  for (const fileName of readdirSync(publicDirectory)) {
    if (fileName === MANIFEST_FILE || TEMPORARY_MANIFEST_PATTERN.test(fileName)) {
      unlinkSync(path.join(publicDirectory, fileName));
    }
  }
}

function loadProjectTypeScript(projectRoot: string): TypeScript {
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));

  try {
    return projectRequire('typescript') as TypeScript;
  } catch (error) {
    const reason = error instanceof Error ? ` (${error.message})` : '';
    throw new Error(`Unable to load TypeScript from ${projectRoot}. Install it in the project.${reason}`);
  }
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

async function startDiagnosticsServer(projectRoot: string, publicDirectory: string): Promise<void> {
  if (!existsSync(publicDirectory) || !statSync(publicDirectory).isDirectory()) {
    throw new Error(`Unable to start TypeScript diagnostics: ${publicDirectory} is not a directory.`);
  }

  const ts = loadProjectTypeScript(projectRoot);
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');

  if (!configPath) {
    throw new Error(`Unable to locate tsconfig.json from ${projectRoot}.`);
  }

  const manifestPath = path.join(publicDirectory, MANIFEST_FILE);
  const sessionId = randomUUID();
  const temporaryManifestPath = path.join(publicDirectory, `__typescript-diagnostics__.${sessionId}.tmp`);
  const clients = new Set<ServerResponse>();
  const formatHost: import('typescript').FormatDiagnosticsHost = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => projectRoot,
    getNewLine: () => ts.sys.newLine
  };

  let status: DiagnosticsStatus = { state: 'checking', diagnostics: [] };
  let watch: import('typescript').WatchOfConfigFile<import('typescript').SemanticDiagnosticsBuilderProgram> | undefined;
  let shuttingDown = false;

  const serializeDiagnostic = (diagnostic: import('typescript').Diagnostic): SerializedDiagnostic => {
    const serialized: SerializedDiagnostic = {
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine)
    };

    if (!diagnostic.file || diagnostic.start === undefined) {
      return serialized;
    }

    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    const lineStart = diagnostic.file.getPositionOfLineAndCharacter(position.line, 0);
    const nextLineStart = diagnostic.file.getLineStarts()[position.line + 1];
    const lineEnd = nextLineStart === undefined ? diagnostic.file.text.length : nextLineStart;

    return {
      ...serialized,
      file: path.relative(projectRoot, diagnostic.file.fileName),
      line: position.line + 1,
      column: position.character + 1,
      source: diagnostic.file.text.slice(lineStart, lineEnd).replace(/[\r\n]+$/, ''),
      highlightLength: Math.max(1, Math.min(diagnostic.length || 1, lineEnd - diagnostic.start))
    };
  };

  const sendStatus = (response: ServerResponse): void => {
    response.write(`event: diagnostics\ndata: ${JSON.stringify(status)}\n\n`);
  };

  const publishStatus = (nextStatus: DiagnosticsStatus): void => {
    status = nextStatus;

    for (const client of clients) {
      sendStatus(client);
    }
  };

  const server = createServer((request, response) => {
    const origin = request.headers.origin;
    const url = new URL(request.url || '/', `http://${HOST}`);

    if (
      request.method !== 'GET' ||
      url.pathname !== '/events' ||
      url.searchParams.get('session') !== sessionId ||
      !isAllowedOrigin(origin)
    ) {
      response.writeHead(404).end();
      return;
    }

    response.writeHead(200, {
      'Access-Control-Allow-Origin': origin || '*',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      Vary: 'Origin'
    });
    response.write('retry: 1000\n\n');
    clients.add(response);
    sendStatus(response);

    request.on('close', () => clients.delete(response));
  });

  const removeOwnedManifest = (): void => {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { sessionId?: string };

      if (manifest.sessionId === sessionId) {
        unlinkSync(manifestPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Unable to clean up ${manifestPath}:`, error);
      }
    }

    try {
      unlinkSync(temporaryManifestPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Unable to clean up ${temporaryManifestPath}:`, error);
      }
    }
  };

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    watch?.close();
    removeOwnedManifest();

    for (const client of clients) {
      client.end();
    }

    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  process.once('exit', removeOwnedManifest);

  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
      await shutdown();
      process.exit(0);
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    await shutdown();
    throw new Error('Unable to determine the TypeScript diagnostics server port.');
  }

  try {
    const manifest = {
      eventsUrl: `http://${HOST}:${address.port}/events?session=${sessionId}`,
      sessionId
    };

    await writeFile(temporaryManifestPath, `${JSON.stringify(manifest)}\n`);
    await rename(temporaryManifestPath, manifestPath);
    console.log(`TypeScript diagnostics available at http://${HOST}:${address.port}/events`);

    const reportWatchStatus = (diagnostic: import('typescript').Diagnostic): void => {
      const timestamp = new Date().toLocaleTimeString();
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine);
      console.log(`\u001b[90m[${timestamp}]\u001b[0m ${message}`);
    };
    const host = ts.createWatchCompilerHost(
      configPath,
      { noEmit: true },
      ts.sys,
      ts.createSemanticDiagnosticsBuilderProgram,
      () => {},
      reportWatchStatus
    );
    const afterProgramCreate = host.afterProgramCreate;

    host.afterProgramCreate = (builderProgram) => {
      const diagnostics = ts
        .getPreEmitDiagnostics(builderProgram.getProgram())
        .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);

      if (diagnostics.length > 0) {
        process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
      }

      publishStatus({
        state: diagnostics.length > 0 ? 'error' : 'clear',
        diagnostics: diagnostics.map(serializeDiagnostic)
      });

      afterProgramCreate?.(builderProgram);
    };

    watch = ts.createWatchProgram(host);
  } catch (error) {
    await shutdown();
    throw error;
  }
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const projectRoot = process.cwd();
  const publicDirectory = path.join(projectRoot, 'public');

  if (mode === 'help') {
    printHelp();
    return;
  }

  if (mode === 'clear') {
    clearManifestFiles(publicDirectory);
    return;
  }

  await startDiagnosticsServer(projectRoot, publicDirectory);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ts-diagnostics: ${message}`);
  process.exit(1);
});
