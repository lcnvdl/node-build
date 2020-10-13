/* eslint-disable no-restricted-syntax */
const fse = require("fs-extra");
const CommandBase = require("../base/command-base");

class CopyCommand extends CommandBase {
  async run(args) {
    if (!args || args.length === 0) {
      return this.codes.missingArguments;
    }

    if (args.length < 2) {
      return this.codes.invalidArguments;
    }

    const file1 = this.parsePath(args[0]);
    const file2 = this.parsePath(args[1]);
    const ignores = [];

    let quiet = false;

    this.debug(`Copy "${file1}" to "${file2}"`);
    await this.breakpoint();

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];
      if (arg === "-i" || arg === "--ignore") {
        ignores.push(args[++i]);
      }
      else if (arg === "-q" || arg === "--quiet") {
        quiet = true;
      }
      else {
        return this.codes.invalidArguments;
      }
    }

    const self = this;

    fse.copySync(file1, file2, {
      filter: (src, dest) => {
        if (ignores.length > 0) {
          for (const ignore of ignores) {
            if (src === ignore || src.endsWith(`/${ignore}`) || src.endsWith(`\\${ignore}`)) {
              return false;
            }
          }
        }

        if (!quiet) {
          self.info(src);
          self.info(` => ${dest}`);
        }

        return true;
      },
    });

    return this.codes.success;
  }
}

module.exports = CopyCommand;
