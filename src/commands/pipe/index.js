/* eslint-disable no-await-in-loop */
/** @typedef {import("../../environment")} Environment */

const fs = require("fs");
const path = require("path");
const safeEval = require("safe-eval");
const CommandBase = require("../base/command-base");
const { loadCommands } = require("../load-commands");
const OpenCommand = require("../open/index");
const CommandsExtractor = require("../helpers/commands-extractor");

let commands = null;

class Pipe extends CommandBase {
  /**
     * @param {Environment} env Environment
     * @param {string} [pipeId] Pipe ID
     */
  constructor(env, pipeId) {
    super(env);
    this.pipeId = pipeId || "1";
  }

  async loadFromFile(_path) {
    await this.load(fs.readFileSync(this.parsePath(_path), "utf8"));
  }

  /**
     * @param {string} str Content
     */
  async load(str) {
    this.info(`Running pipe "${this.pipeId}"`);

    if (!commands) {
      commands = await loadCommands();
    }

    await this.breakpoint();

    str = str || "";
    str = str.split(":eol:").join("\n");

    const instructions = str.split("\n")
      .map(m => m.trim())
      .filter(m => m && m !== "")
      .filter(m => m.indexOf("//") !== 0)
      .filter(m => m.indexOf("rem") !== 0);

    try {
      while (instructions.length > 0) {
        const current = instructions.shift();

        if (current[0] === ":") {
          const result = await this._processPipeCommand(current, instructions);
          if (result) {
            break;
          }
        }
        else {
          const code = await this._processCommand(current);

          if (code === this.codes.invalidArguments) {
            throw new Error(`Invalid arguments in instruction "${current}".`);
          }
          else if (code === this.codes.missingArguments) {
            throw new Error(`Missing arguments in instruction "${current}".`);
          }
          else if (code === this.codes.exitPipe) {
            break;
          }
          else if (code === this.codes.exitProcess) {
            process.exit(0);
          }
        }
      }
    }
    catch (error) {
      this.debug(`Pipe "${this.pipeId}" failed`);
      await this.breakpoint({ error });
      throw error;
    }

    this.debug(`Pipe "${this.pipeId}" finished successfully`);

    return this.codes.success;
  }

  async _processCommand(current) {
    const cmds = CommandsExtractor.extract(current);

    const cmd = cmds.shift();

    /** @type {CommandBase} */
    let CommandClass = commands[cmd];

    if (!CommandClass) {
      cmds.unshift(cmd);
      CommandClass = commands.run;
    }

    const command = new CommandClass(this.environment);

    if (!(command instanceof CommandBase)) {
      throw new Error(`${command} (${current}) is not a Command`);
    }

    await this.breakpoint(`> ${current}`);

    const result = command.run(cmds);

    if (result === this.codes.invalidArguments) {
      this.debugError(" - Invalid arguments");
    }
    else if (result === this.codes.missingArguments) {
      this.debugError(" - Missing arguments");
    }
    else {
      this.debugSuccess(" - Success");
    }

    if (result instanceof Promise) {
      return await result;
    }

    return result;
  }

  async _processPipeCommand(current, instructions) {
    const cmd = CommandsExtractor.extract(current);

    if (cmd[0] === ":each") {
      if (cmd[1] === "folder") {
        await this._pipeCmdEachFolder(instructions);
        return true;
      }
      if (cmd[1] === "file") {
        await this._pipeCmdEachFile(instructions);
        return true;
      }
    }
    else if (cmd[0] === ":break") {
      await this.breakpoint("Manual breakpoint");
    }
    else if (cmd[0] === ":begin") {
      this.debug("Begin");
    }
    else if (cmd[0] === ":end") {
      this.debug("End");
    }
    else if (cmd[0] === ":eval") {
      this.info(current);
      await this.breakpoint();

      const condition = `(${this.environment.applyVariables(current.substr(current.indexOf(" ") + 1).trim())})`;

      const result = safeEval(condition);

      this.environment.setVariable("$eval", result);
    }
    else if (cmd[0] === ":if") {
      this.info(current);

      const condition = `(${this.environment.applyVariables(current.substr(current.indexOf(" ") + 1).trim())})`;

      await this.breakpoint();

      const result = safeEval(condition);

      if (!result) {
        let next = instructions.shift();
        if (next === ":begin") {
          do {
            next = instructions.shift();
          }
          while (next !== ":end");
        }
      }

      if (this.environment.isVerboseEnabled) {
        this.verbose(`Inline if succed with ${result}`);
      }

      await this.breakpoint();
    }
    else if (cmd[0] === ":open") {
      const file = cmd[1].trim();

      const openInstructions = [file];

      this.info(current);

      while (instructions.length > 0 && instructions[0].trim().length > 0 && instructions[0].trim()[0] === "-") {
        const instruction = instructions.shift();
        openInstructions.push(instruction);
        this.debug(` - Instruction added: ${instruction}`);
      }

      this.info("Running open command...");
      await this.breakpoint();

      const command = new OpenCommand(this.environment);
      const commandCode = await command.run(openInstructions);

      if (commandCode !== this.codes.success) {
        await this.breakpoint({ error: `Open command has exited with an error code: ${commandCode}.` });
        return true;
      }

      this.info("Open command success");
      await this.breakpoint();
    }

    return false;
  }

  async _pipeCmdEachFolder(instructions) {
    const rootFolder = this.environment.cwd;
    const folders = getDirectories(rootFolder);
    let subPipeId = 1;

    for (let i = 0; i < folders.length; i++) {
      this.debug(`Forking pipe to ${folders[i]}`);
      await this.breakpoint();

      const dirname = folders[i];

      const fork = this.environment.fork(dirname);
      fork.setVariables({
        $currentFolder: dirname,
        $currentFolderPath: path.join(rootFolder, dirname),
        $currentFolderAbsolutePath: path.resolve(path.join(rootFolder, dirname)),
        $foldersCount: folders.length,
        $folderIndex: i,
      });
      const pipe = new Pipe(fork, `${this.pipeId}.${subPipeId++}`);
      await pipe.load(instructions.join("\n"));
    }
  }

  async _pipeCmdEachFile(instructions) {
    const folder = this.environment.cwd;
    const files = getFiles(folder);
    let subPipeId = 1;

    for (let i = 0; i < files.length; i++) {
      this.debug(`Forking pipe for file ${files[i]}`);
      await this.breakpoint();
      const fork = this.environment.fork();
      fork.setVariables({
        $currentFile: files[i],
        $currentFilePath: path.join(folder, files[i]),
        $currentFileAbsolutePath: path.resolve(path.join(folder, files[i])),
        $filesCount: files.length,
        $fileIndex: i,
      });
      const pipe = new Pipe(fork, `${this.pipeId}.${subPipeId++}`);
      await pipe.load(instructions.join("\n"));
    }
  }
}

function getDirectories(path) {
  return fs.readdirSync(path).filter(file => fs.statSync(`${path}/${file}`).isDirectory());
}

function getFiles(path) {
  return fs.readdirSync(path).filter(file => fs.statSync(`${path}/${file}`).isFile());
}

module.exports = Pipe;
