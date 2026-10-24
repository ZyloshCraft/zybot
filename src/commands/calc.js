import { replyOrEdit } from '../utils/stealth.js';

function evaluateMath(expression) {
  const sanitized = expression.replace(/,/g, '.').replace(/\s+/g, '');
  if (!/^[0-9+\-*/().%^]+$/.test(sanitized)) {
    throw new Error('Expression invalide');
  }

  const normalized = sanitized.replace(/\^/g, '**');
  const res = Function('"use strict"; return (' + normalized + ')')();

  if (typeof res !== 'number' || isNaN(res) || !isFinite(res)) {
    throw new Error('Résultat non valide');
  }

  // Arrondi propre si décimales longues
  return Math.round(res * 1000000) / 1000000;
}

export default {
  name: 'calc',
  aliases: ['calcul', 'math'],
  description: 'Calculatrice instantanée et discrète (remplace directement la commande)',
  async execute({ sock, msg, jid, args }) {
    const rawExpr = args.join(' ').trim();
    if (!rawExpr) {
      await replyOrEdit(sock, jid, msg, 'Usage : /calc <expression> (ex: /calc 15 * 4 + 10)');
      return;
    }

    try {
      const result = evaluateMath(rawExpr);
      await replyOrEdit(sock, jid, msg, String(result));
    } catch (err) {
      await replyOrEdit(sock, jid, msg, 'Erreur de calcul');
    }
  }
};
