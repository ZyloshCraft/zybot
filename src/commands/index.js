import botCmd from './bot.js';
import helpCmd from './help.js';
import persopingCmd from './persoping.js';
import vacancesCmd from './vacances.js';
import programCmd from './program.js';
import alertCmd from './alert.js';
import translateCmd from './translate.js';
import clearCmd from './clear.js';
import tagallCmd from './tagall.js';
import pollCmd from './poll.js';
import vvCmd from './vv.js';
import rebootCmd from './reboot.js';
import vocalCmd from './vocal.js';
import editCmd from './edit.js';

const commands = new Map();

function registerCommand(cmd) {
  commands.set(cmd.name.toLowerCase(), cmd);
  if (cmd.aliases && Array.isArray(cmd.aliases)) {
    for (const alias of cmd.aliases) {
      commands.set(alias.toLowerCase(), cmd);
    }
  }
}

registerCommand(botCmd);
registerCommand(helpCmd);
registerCommand(persopingCmd);
registerCommand(vacancesCmd);
registerCommand(programCmd);
registerCommand(alertCmd);
registerCommand(translateCmd);
registerCommand(clearCmd);
registerCommand(tagallCmd);
registerCommand(pollCmd);
registerCommand(vvCmd);
registerCommand(rebootCmd);
registerCommand(vocalCmd);
registerCommand(editCmd);

export function getCommand(name) {
  if (!name) return undefined;
  return commands.get(name.toLowerCase());
}

export function getAllCommands() {
  const unique = new Set(commands.values());
  return Array.from(unique);
}
