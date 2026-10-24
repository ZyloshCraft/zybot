import { replyOrEdit } from '../utils/stealth.js';

export default {
  name: 'crypto',
  aliases: ['cours', 'coin'],
  description: 'Cours en direct d\'une cryptomonnaie (BTC, ETH, SOL...)',
  async execute({ sock, msg, jid, args }) {
    let symbol = (args[0] || 'BTC').toUpperCase().trim();
    if (symbol.endsWith('USDT')) {
      symbol = symbol.slice(0, -4);
    }

    try {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}USDT`;
      const res = await fetch(url);

      if (!res.ok) {
        await replyOrEdit(sock, jid, msg, `Symbole crypto introuvable : ${symbol}`);
        return;
      }

      const data = await res.json();
      const price = parseFloat(data.lastPrice);
      const change = parseFloat(data.priceChangePercent);
      const sign = change >= 0 ? '+' : '';

      const formattedPrice = price >= 1 ? price.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : price.toFixed(4);

      const response = `${symbol} : ${formattedPrice} $ (${sign}${change.toFixed(2)}% 24h)`;
      await replyOrEdit(sock, jid, msg, response);
    } catch (err) {
      console.error('Erreur crypto:', err);
      await replyOrEdit(sock, jid, msg, `Erreur récupération cours ${symbol}`);
    }
  }
};
