import botCmd from './bot.js';
import helpCmd from './help.js';
import persopingCmd from './persoping.js';
import programCmd from './program.js';
import alertCmd from './alert.js';
import translateCmd from './translate.js';
import clearCmd from './clear.js';
import tagallCmd from './tagall.js';
import pollCmd from './poll.js';
import vvCmd from './vv.js';
import rebootCmd from './reboot.js';
import editCmd from './edit.js';
import calcCmd from './calc.js';
import rappelCmd from './rappel.js';
import meteoCmd from './meteo.js';
import idCmd from './id.js';
import groupeCmd from './groupe.js';
import tempCmd from './temp.js';
import recapCmd from './recap.js';
import ntfyCmd from './ntfy.js';
import updateCmd from './update.js';
import dndCmd from './dnd.js';
import whoisCmd from './whois.js';
import statutCmd from './statut.js';
import exportCmd from './export.js';
import stickerCmd from './sticker.js';
import dlCmd from './dl.js';
import texteCmd from './texte.js';

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
registerCommand(programCmd);
registerCommand(alertCmd);
registerCommand(translateCmd);
registerCommand(clearCmd);
registerCommand(tagallCmd);
registerCommand(pollCmd);
registerCommand(vvCmd);
registerCommand(rebootCmd);
registerCommand(editCmd);
registerCommand(calcCmd);
registerCommand(rappelCmd);
registerCommand(meteoCmd);
registerCommand(idCmd);
registerCommand(groupeCmd);
registerCommand(tempCmd);
registerCommand(recapCmd);
registerCommand(ntfyCmd);
registerCommand(updateCmd);
registerCommand(dndCmd);
registerCommand(whoisCmd);
registerCommand(statutCmd);
registerCommand(exportCmd);
registerCommand(stickerCmd);
registerCommand(dlCmd);
registerCommand(texteCmd);

export function getCommand(name) {
  if (!name) return undefined;
  return commands.get(name.toLowerCase());
}

export function getAllCommands() {
  const unique = new Set(commands.values());
  return Array.from(unique);
}
